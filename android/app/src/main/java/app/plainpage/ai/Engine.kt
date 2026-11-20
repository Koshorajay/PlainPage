package app.plainpage.ai

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow

/**
 * The PlainPage pipeline on Android: route, split, rewrite section by section
 * (streaming), then summarise. Every piece carries the source the Firebase
 * SDK reported. On top of the SDK's own fallback it recovers mid-text in both
 * directions, and it never breaks the Private-mode promise.
 *
 * Models are reached through [HybridModel] so the logic can be unit-tested
 * with fakes; the real implementation is in Models.kt.
 */
enum class Source { DEVICE, CLOUD }

enum class ModelKind { REWRITE, GIST, CHECKLIST }

data class ModelSpec(val kind: ModelKind, val mode: RouteMode, val level: Level, val language: String)

data class Piece(val text: String, val source: Source)

fun interface HybridModel {
    fun stream(prompt: String): Flow<Piece>
}

fun interface ModelFactory {
    fun create(spec: ModelSpec): HybridModel
}

data class Conditions(
    val language: String,
    val level: Level,
    val privateMode: Boolean,
    val online: Boolean,
    val device: DeviceStatus,
    val config: RuntimeConfig,
)

enum class SectionStatus { PENDING, RUNNING, DONE, ERROR }

data class Section(
    val index: Int,
    val original: String,
    val simplified: String = "",
    val status: SectionStatus = SectionStatus.PENDING,
    val source: Source? = null,
    val fallback: String? = null,
    val error: String? = null,
)

sealed interface EngineEvent {
    data class Plan(val decision: RouteDecision, val sections: List<Section>) : EngineEvent
    data class SectionUpdate(val index: Int, val update: (Section) -> Section) : EngineEvent
    data class Gist(val running: Boolean, val text: String, val source: Source?) : EngineEvent
    data class Done(val leftDevice: Boolean) : EngineEvent
    /** Personal details replaced by placeholders before any cloud request. */
    data class ShieldInfo(val count: Int, val summary: String, val preview: String) : EngineEvent
}

class BlockedException(val decision: RouteDecision) : Exception(decision.explain)

data class FallbackPlan(val mode: RouteMode, val rechunk: Int?, val note: String)

/** What to try when the first attempt throws; null when retrying would break a promise or cannot work. */
fun planFallback(decision: RouteDecision, c: Conditions): FallbackPlan? {
    if (c.privateMode) return null
    if (decision.mode == RouteMode.PREFER_ON_DEVICE && decision.expected == Expected.DEVICE && c.online) {
        return FallbackPlan(RouteMode.ONLY_IN_CLOUD, null, "Your phone could not finish this part, so the cloud did it.")
    }
    if (decision.mode == RouteMode.PREFER_IN_CLOUD && c.device == DeviceStatus.AVAILABLE && deviceCanWrite(c.language, c.config)) {
        return FallbackPlan(RouteMode.ONLY_ON_DEVICE, c.config.deviceChunkChars, "The cloud could not be reached, so your phone did this part.")
    }
    return null
}

/** The SDK can switch sides by itself without throwing; say so when it did. */
fun sdkFallbackNote(decision: RouteDecision, source: Source): String? = when {
    decision.mode == RouteMode.PREFER_IN_CLOUD && source == Source.DEVICE -> "The cloud could not be reached, so your phone did this part."
    decision.mode == RouteMode.PREFER_ON_DEVICE && decision.expected == Expected.DEVICE && source == Source.CLOUD ->
        "Your phone was not ready, so the cloud did this part."
    else -> null
}

fun friendlyError(e: Throwable): String {
    val name = e::class.simpleName.orEmpty()
    val message = e.message.orEmpty()
    return when {
        e is BlockedException -> e.message.orEmpty()
        name.contains("Quota") || Regex("429|quota|resource.?exhausted", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
            "The free cloud quota is used up for the moment. Wait a minute and try again."
        Regex("app.?check|401|403|permission", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
            "Firebase refused the request. Check that Firebase AI Logic and App Check are set up for this app."
        name.contains("OnDeviceNotAvailable") -> "The on-device model is not available on this phone."
        name.contains("Busy") || message.contains("BUSY") -> "The on-device model is busy. Try again in a moment."
        Regex("network|unable to resolve|timeout|connect", RegexOption.IGNORE_CASE).containsMatchIn(message) ->
            "The cloud could not be reached. Check your connection."
        else -> if (message.length > 180) message.take(180) + "..." else message.ifBlank { name }
    }
}

private suspend fun streamAll(model: HybridModel, prompt: String, onText: (String, Source) -> Unit): Piece {
    val sb = StringBuilder()
    var source = Source.CLOUD
    model.stream(prompt).collect { piece ->
        sb.append(piece.text)
        source = piece.source
        onText(sb.toString(), source)
    }
    return Piece(Prompts.clean(sb.toString()), source)
}

private data class Result(val text: String, val source: Source, val fallback: String?)

private suspend fun streamWithFallback(
    kind: ModelKind,
    input: String,
    toPrompt: (String) -> String,
    decision: RouteDecision,
    c: Conditions,
    factory: ModelFactory,
    onText: (String, Source) -> Unit,
    onCloudAttempt: () -> Unit,
    shield: Shield? = null,
): Result {
    fun spec(mode: RouteMode) = ModelSpec(kind, mode, c.level, c.language)
    // Privacy shield: the models only ever see placeholders; the reader sees the real values.
    val masked = shield?.mask(input) ?: input
    val show = { t: String, s: Source -> onText(shield?.restoreStreaming(t) ?: t, s) }
    fun finish(t: String) = shield?.restore(t) ?: t
    try {
        val r = streamAll(factory.create(spec(decision.mode)), toPrompt(masked), show)
        return Result(finish(r.text), r.source, sdkFallbackNote(decision, r.source))
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        val plan = planFallback(decision, c) ?: throw e
        if (plan.mode == RouteMode.ONLY_IN_CLOUD) onCloudAttempt()
        val model = factory.create(spec(plan.mode))
        val pieces = plan.rechunk?.let { Chunker.chunk(masked, it) } ?: listOf(masked)
        var done = ""
        var source = Source.CLOUD
        for (piece in pieces) {
            val prefix = if (done.isEmpty()) "" else "$done\n\n"
            val r = streamAll(model, toPrompt(piece)) { t, s -> show(prefix + t, s) }
            done = prefix + r.text
            source = r.source
        }
        return Result(finish(done), source, plan.note)
    }
}

/** A shield is used whenever the cloud may see the text (every mode except ONLY_ON_DEVICE). */
private fun shieldFor(decision: RouteDecision, text: String): Shield? {
    if (decision.mode == RouteMode.ONLY_ON_DEVICE) return null
    return Shield.build(text).takeIf { it.entries.isNotEmpty() }
}

/** Rewrites a whole text. Throws [BlockedException] if the route forbids running. */
suspend fun simplify(text: String, c: Conditions, factory: ModelFactory, emit: (EngineEvent) -> Unit) {
    val decision = decideRoute(RouteInput(text.length, c.language, c.privateMode, c.online, c.device, c.config))
    if (decision.expected == Expected.BLOCKED) throw BlockedException(decision)

    val sections = Chunker.chunk(text, decision.chunkChars).mapIndexed { i, t -> Section(i, t) }
    emit(EngineEvent.Plan(decision, sections))

    val shield = shieldFor(decision, text)
    if (shield != null) emit(EngineEvent.ShieldInfo(shield.entries.size, shield.describe(), shield.mask(text).take(3000)))

    var leftDevice = decision.expected == Expected.CLOUD
    val markCloud = { leftDevice = true }
    val results = MutableList(sections.size) { "" }

    for (s in sections) {
        emit(EngineEvent.SectionUpdate(s.index) { it.copy(status = SectionStatus.RUNNING) })
        try {
            val r = streamWithFallback(ModelKind.REWRITE, s.original, Prompts::rewrite, decision, c, factory,
                { t, src -> emit(EngineEvent.SectionUpdate(s.index) { it.copy(simplified = t, source = src) }) },
                markCloud, shield)
            if (r.source == Source.CLOUD) markCloud()
            results[s.index] = r.text
            emit(EngineEvent.SectionUpdate(s.index) {
                it.copy(status = SectionStatus.DONE, simplified = r.text, source = r.source, fallback = r.fallback)
            })
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emit(EngineEvent.SectionUpdate(s.index) { it.copy(status = SectionStatus.ERROR, error = friendlyError(e)) })
        }
    }

    val simplified = results.filter { it.isNotBlank() }.joinToString("\n\n")
    if (simplified.isNotBlank()) {
        emit(EngineEvent.Gist(true, "", null))
        try {
            val budget = if (decision.expected == Expected.DEVICE) c.config.deviceChunkChars else c.config.cloudChunkChars
            // Summaries are never re-split on fallback: the input is already trimmed to fit.
            val gc = c.copy(config = c.config.copy(deviceChunkChars = maxOf(budget, simplified.length + 1)))
            val r = streamWithFallback(ModelKind.GIST, simplified.take(budget), Prompts::gist, decision, gc, factory,
                { t, src -> emit(EngineEvent.Gist(true, t, src)) }, markCloud, shield)
            if (r.source == Source.CLOUD) markCloud()
            emit(EngineEvent.Gist(false, r.text, r.source))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            emit(EngineEvent.Gist(false, "", null))
        }
    }
    emit(EngineEvent.Done(leftDevice))
}

data class TaskItem(val task: String, val whenText: String? = null)

/** Reads tasks from a model reply: one "- " line per task, optionally ending with " — deadline". */
fun parseChecklist(raw: String): List<TaskItem> {
    val items = mutableListOf<TaskItem>()
    val seen = HashSet<String>()
    for (line in raw.lines()) {
        val m = Regex("""^\s*(?:[-*•]|\d{1,2}[.)]|\[\s?])\s+(.+)$""").find(line) ?: continue
        var task = m.groupValues[1].replace("**", "").trim()
        var whenText: String? = null
        val split = Regex("""\s+(?:—|–|--|\|)\s+(?!.*\s(?:—|–|--|\|)\s)(.+)$""").find(task)
        if (split != null) {
            whenText = split.groupValues[1].trim()
            task = task.substring(0, split.range.first).trim()
        }
        task = task.trimEnd('.', ';')
        if (task.isEmpty() || Regex("^none\\b", RegexOption.IGNORE_CASE).containsMatchIn(task) || task.length > 160) continue
        if (!seen.add(task.lowercase())) continue
        items += TaskItem(task, whenText)
        if (items.size >= 12) break
    }
    return items
}

data class ChecklistResult(val items: List<TaskItem>, val source: Source, val fallback: String?)

/** Makes a to-do list on request. Routed on its own, so it stays on the phone whenever it can. */
suspend fun makeChecklist(text: String, c: Conditions, factory: ModelFactory, onText: (String, Source) -> Unit): ChecklistResult {
    val input = if (text.length <= c.config.deviceChunkChars * 2) text else text.take(c.config.cloudChunkChars)
    val decision = decideRoute(RouteInput(input.length, c.language, c.privateMode, c.online, c.device, c.config))
    if (decision.expected == Expected.BLOCKED) throw BlockedException(decision)
    val cc = c.copy(config = c.config.copy(deviceChunkChars = maxOf(c.config.deviceChunkChars, input.length + 1)))
    val r = streamWithFallback(ModelKind.CHECKLIST, input, Prompts::checklist, decision, cc, factory, onText, {}, shieldFor(decision, input))
    return ChecklistResult(parseChecklist(r.text), r.source, r.fallback)
}
