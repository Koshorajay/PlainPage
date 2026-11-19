package app.plainpage

import app.plainpage.ai.RuntimeConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.google.firebase.remoteconfig.FirebaseRemoteConfigSettings
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Firebase Remote Config: the same project and the same cloud keys as the web
 * app, plus android_ keys for Gemini Nano's smaller window on phones.
 */
object RemoteSettings {
    private val defaults = RuntimeConfig()

    suspend fun load(): RuntimeConfig {
        return try {
            val rc = FirebaseRemoteConfig.getInstance()
            rc.setConfigSettingsAsync(
                FirebaseRemoteConfigSettings.Builder().setMinimumFetchIntervalInSeconds(if (BuildConfig.DEBUG) 0 else 3600).build()
            )
            rc.setDefaultsAsync(
                mapOf(
                    "cloud_model" to defaults.cloudModel,
                    "cloud_chunk_chars" to defaults.cloudChunkChars.toLong(),
                    "style_guidance" to defaults.styleGuidance,
                    "android_device_max_chars" to defaults.deviceMaxChars.toLong(),
                    "android_device_chunk_chars" to defaults.deviceChunkChars.toLong(),
                    "android_device_languages" to defaults.deviceLanguages.joinToString(","),
                )
            )
            suspendCancellableCoroutine { cont -> rc.fetchAndActivate().addOnCompleteListener { cont.resume(Unit) } }
            fun int(key: String, min: Int, max: Int, fallback: Int) =
                rc.getLong(key).toInt().let { if (it <= 0) fallback else it.coerceIn(min, max) }
            RuntimeConfig(
                cloudModel = rc.getString("cloud_model").ifBlank { defaults.cloudModel },
                deviceMaxChars = int("android_device_max_chars", 1000, 100000, defaults.deviceMaxChars),
                deviceChunkChars = int("android_device_chunk_chars", 500, 8000, defaults.deviceChunkChars),
                cloudChunkChars = int("cloud_chunk_chars", 2000, 200000, defaults.cloudChunkChars),
                deviceLanguages = rc.getString("android_device_languages").split(',').map { it.trim().lowercase() }
                    .filter { it.isNotEmpty() }.ifEmpty { defaults.deviceLanguages },
                styleGuidance = rc.getString("style_guidance").take(300),
            )
        } catch (e: Exception) {
            defaults
        }
    }
}
