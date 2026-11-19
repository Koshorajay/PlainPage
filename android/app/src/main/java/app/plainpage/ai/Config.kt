package app.plainpage.ai

/**
 * Values that steer the hybrid router. Defaults live here; Firebase Remote
 * Config overrides them (see RemoteSettings.kt). The cloud keys are shared
 * with the web app, so one change in the console retunes both platforms.
 * The on-device keys have an android_ prefix because Gemini Nano on Android
 * has a smaller window (about 4,000 tokens) than Chrome's built-in model.
 */
data class RuntimeConfig(
    val cloudModel: String = "gemini-3.5-flash-lite",
    val deviceMaxChars: Int = 9000,
    val deviceChunkChars: Int = 2200,
    val cloudChunkChars: Int = 20000,
    val deviceLanguages: List<String> = listOf("en"),
    val styleGuidance: String = "",
)

enum class Level(val label: String, val hint: String) {
    EASY("Easy", "Very short sentences, everyday words"),
    PLAIN("Plain", "Clear and simple, keeps more detail"),
    CLEAR("Clear", "Full detail, no jargon"),
}

data class Language(val code: String, val name: String, val native: String)

val LANGUAGES = listOf(
    Language("en", "English", "English"),
    Language("es", "Spanish", "Español"),
    Language("ja", "Japanese", "日本語"),
    Language("hi", "Hindi", "हिन्दी"),
    Language("ta", "Tamil", "தமிழ்"),
    Language("te", "Telugu", "తెలుగు"),
    Language("bn", "Bengali", "বাংলা"),
    Language("fr", "French", "Français"),
    Language("de", "German", "Deutsch"),
    Language("pt", "Portuguese", "Português"),
    Language("ar", "Arabic", "العربية"),
    Language("zh", "Chinese", "中文"),
)

fun languageName(code: String): String = LANGUAGES.firstOrNull { it.code == code }?.name ?: "English"
