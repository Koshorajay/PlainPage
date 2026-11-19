package app.plainpage.ai

/**
 * The hybrid router: picks one of Firebase AI Logic's four inference modes for
 * each job and explains the choice in plain words. Same rules as the web app.
 *
 *   1. Private mode   -> ONLY_ON_DEVICE, or refuse rather than leak
 *   2. Offline        -> ONLY_ON_DEVICE
 *   3. Language the local model cannot write -> ONLY_IN_CLOUD
 *   4. No local model -> PREFER_ON_DEVICE (the SDK falls back to the cloud)
 *   5. Long text      -> PREFER_IN_CLOUD (device is the safety net)
 *   6. Otherwise      -> PREFER_ON_DEVICE
 */
enum class RouteMode { ONLY_ON_DEVICE, PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD }

enum class DeviceStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE }

enum class Expected { DEVICE, CLOUD, BLOCKED }

data class RouteDecision(
    val mode: RouteMode,
    val expected: Expected,
    val reason: String,
    val label: String,
    val explain: String,
    val chunkChars: Int,
)

data class RouteInput(
    val chars: Int,
    val language: String,
    val privateMode: Boolean,
    val online: Boolean,
    val device: DeviceStatus,
    val config: RuntimeConfig,
)

fun deviceCanWrite(language: String, config: RuntimeConfig) = language in config.deviceLanguages

fun decideRoute(input: RouteInput): RouteDecision {
    val c = input.config
    val ready = input.device == DeviceStatus.AVAILABLE
    val langOk = deviceCanWrite(input.language, c)
    val lang = languageName(input.language)

    fun device(reason: String, mode: RouteMode, explain: String) =
        RouteDecision(mode, Expected.DEVICE, reason, "On this phone", explain, c.deviceChunkChars)
    fun cloud(reason: String, mode: RouteMode, explain: String) =
        RouteDecision(mode, Expected.CLOUD, reason, "In the cloud", explain, c.cloudChunkChars)
    fun blocked(reason: String, explain: String) =
        RouteDecision(RouteMode.ONLY_ON_DEVICE, Expected.BLOCKED, reason, "Cannot run", explain, c.deviceChunkChars)

    if (input.privateMode) {
        if (!ready) return blocked("private-blocked-device",
            "Private mode needs the on-device model, and it is not ready on this phone. Turn Private mode off to use the cloud.")
        if (!langOk) return blocked("private-blocked-language",
            "The on-device model cannot write $lang yet. Turn Private mode off, or choose another language.")
        return device("private", RouteMode.ONLY_ON_DEVICE,
            "Private mode is on. This text is rewritten on your phone and is never sent anywhere.")
    }
    if (!input.online) {
        if (ready && langOk) return device("offline", RouteMode.ONLY_ON_DEVICE,
            "You are offline, so the on-device model is doing the work.")
        return blocked("offline-blocked",
            if (ready) "You are offline and the on-device model cannot write $lang. Reconnect, or choose another language."
            else "You are offline and this phone has no on-device model. Reconnect to use the cloud.")
    }
    if (!langOk) return cloud("language", RouteMode.ONLY_IN_CLOUD,
        "Writing in $lang needs the cloud model, so this text is sent to Gemini in the cloud.")
    if (!ready) {
        val downloading = input.device == DeviceStatus.DOWNLOADABLE || input.device == DeviceStatus.DOWNLOADING
        return cloud(if (downloading) "device-downloading" else "no-device", RouteMode.PREFER_ON_DEVICE,
            if (downloading) "The on-device model is not downloaded yet, so the cloud is covering for it."
            else "This phone has no on-device model, so the cloud is covering for it.")
    }
    if (input.chars > c.deviceMaxChars) return cloud("long", RouteMode.PREFER_IN_CLOUD,
        "This is a long text, so the cloud model handles it for speed. If the cloud cannot be reached, your phone takes over.")
    return device("short", RouteMode.PREFER_ON_DEVICE,
        "This fits on your phone, so it is rewritten locally. It is private, free and works offline.")
}
