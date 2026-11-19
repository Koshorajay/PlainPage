package app.plainpage.ai

import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RouterTest {
    private val c = RuntimeConfig()
    private fun route(chars: Int = 2000, lang: String = "en", private: Boolean = false, online: Boolean = true, device: DeviceStatus = DeviceStatus.AVAILABLE) =
        decideRoute(RouteInput(chars, lang, private, online, device, c))

    @Test fun shortTextStaysOnDevice() = assertEquals(RouteMode.PREFER_ON_DEVICE, route().mode)
    @Test fun longTextGoesToCloud() = assertEquals(RouteMode.PREFER_IN_CLOUD, route(chars = c.deviceMaxChars + 1).mode)
    @Test fun otherLanguagesCloudOnly() = assertEquals(RouteMode.ONLY_IN_CLOUD, route(lang = "ta").mode)
    @Test fun noModelLetsSdkFallBack() {
        val d = route(device = DeviceStatus.UNAVAILABLE)
        assertEquals(RouteMode.PREFER_ON_DEVICE, d.mode); assertEquals(Expected.CLOUD, d.expected)
    }
    @Test fun privateNeverLeaves() = assertEquals(RouteMode.ONLY_ON_DEVICE, route(private = true, chars = 500000).mode)
    @Test fun privateRefusesWithoutModel() = assertEquals(Expected.BLOCKED, route(private = true, device = DeviceStatus.UNAVAILABLE).expected)
    @Test fun offlineDeviceOnly() = assertEquals(RouteMode.ONLY_ON_DEVICE, route(online = false).mode)
}

class ChunkerTest {
    private val sentence = "The tenant must pay the rent on the first day of every month."
    @Test fun neverExceedsBudgetOrLosesWords() {
        val text = (1..6).joinToString("\n\n") { (1..9).joinToString(" ") { sentence } }
        val chunks = Chunker.chunk(text, 500)
        assertTrue(chunks.all { it.length <= 500 })
        assertEquals(Chunker.countWords(text), Chunker.countWords(chunks.joinToString(" ")))
    }
    @Test fun headingTravelsWithText() {
        val p = (1..7).joinToString(" ") { sentence }
        val chunks = Chunker.chunk("$p\n\n## Rent\n\n$p", 520)
        assertTrue(chunks.any { it.startsWith("## Rent") && it.length > 20 })
    }
}

class EngineTest {
    private fun fake(deviceFails: Boolean = false, cloudFails: Boolean = false) = ModelFactory { spec ->
        HybridModel { _ ->
            flow {
                val src = when (spec.mode) {
                    RouteMode.ONLY_ON_DEVICE, RouteMode.PREFER_ON_DEVICE -> Source.DEVICE
                    RouteMode.ONLY_IN_CLOUD, RouteMode.PREFER_IN_CLOUD -> Source.CLOUD
                }
                if (src == Source.DEVICE && deviceFails) throw IllegalStateException("model crashed")
                if (src == Source.CLOUD && cloudFails) throw IllegalStateException("429 quota")
                emit(Piece("ans", src)); emit(Piece("wer", src))
            }
        }
    }
    private val cond = Conditions("en", Level.PLAIN, false, true, DeviceStatus.AVAILABLE, RuntimeConfig())
    private val text = (1..4).joinToString("\n\n") { (1..8).joinToString(" ") { "The tenant must pay the rent on the first day of every month." } }

    private suspend fun run(c: Conditions, f: ModelFactory): Pair<List<Section>, Boolean?> {
        var sections = listOf<Section>(); var left: Boolean? = null
        simplify(text, c, f) { e ->
            when (e) {
                is EngineEvent.Plan -> sections = e.sections
                is EngineEvent.SectionUpdate -> sections = sections.map { if (it.index == e.index) e.update(it) else it }
                is EngineEvent.Done -> left = e.leftDevice
                else -> Unit
            }
        }
        return sections to left
    }

    @Test fun rewritesOnDevice() = runTest {
        val (s, left) = run(cond, fake())
        assertTrue(s.all { it.status == SectionStatus.DONE && it.source == Source.DEVICE && it.simplified == "answer" })
        assertEquals(false, left)
    }
    @Test fun deviceFailureRetriesInCloud() = runTest {
        val (s, left) = run(cond, fake(deviceFails = true))
        assertTrue(s.all { it.source == Source.CLOUD && it.fallback != null })
        assertEquals(true, left)
    }
    @Test fun privateModeNeverRetriesInCloud() = runTest {
        val (s, left) = run(cond.copy(privateMode = true), fake(deviceFails = true))
        assertTrue(s.all { it.status == SectionStatus.ERROR })
        assertEquals(false, left)
    }
}
