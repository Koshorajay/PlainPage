package app.plainpage.ai

import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import kotlinx.coroutines.flow.map

/**
 * Firebase AI Logic hybrid inference: the only place models are created.
 * Each model gets the cloud model name, the system prompt (used by both the
 * cloud model and Gemini Nano), and an OnDeviceConfig carrying the hybrid
 * mode the router picked.
 */
@OptIn(PublicPreviewAPI::class)
class FirebaseModelFactory(private val config: () -> RuntimeConfig) : ModelFactory {

    private val cache = HashMap<String, HybridModel>()
    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI()) }

    private fun RouteMode.toSdk(): InferenceMode = when (this) {
        RouteMode.ONLY_ON_DEVICE -> InferenceMode.ONLY_ON_DEVICE
        RouteMode.PREFER_ON_DEVICE -> InferenceMode.PREFER_ON_DEVICE
        RouteMode.PREFER_IN_CLOUD -> InferenceMode.PREFER_IN_CLOUD
        RouteMode.ONLY_IN_CLOUD -> InferenceMode.ONLY_IN_CLOUD
    }

    fun build(spec: ModelSpec, c: RuntimeConfig): GenerativeModel {
        val language = languageName(spec.language)
        val system = when (spec.kind) {
            ModelKind.REWRITE -> Prompts.rewriteSystem(spec.level, language, c.styleGuidance)
            ModelKind.GIST -> Prompts.gistSystem(language)
            ModelKind.CHECKLIST -> Prompts.checklistSystem(language)
        }
        return ai.generativeModel(
            modelName = c.cloudModel,
            generationConfig = generationConfig { temperature = 0.3f },
            systemInstruction = content { text(system) },
            onDeviceConfig = OnDeviceConfig(mode = spec.mode.toSdk(), maxOutputTokens = 1024, temperature = 0.3f),
        )
    }

    override fun create(spec: ModelSpec): HybridModel {
        val c = config()
        val key = "$spec|${c.cloudModel}|${c.styleGuidance}"
        return synchronized(cache) {
            cache.getOrPut(key) {
                val model = build(spec, c)
                HybridModel { prompt ->
                    model.generateContentStream(prompt).map { response ->
                        // The SDK reports where each piece was actually generated.
                        val source = if (response.inferenceSource == InferenceSource.ON_DEVICE) Source.DEVICE else Source.CLOUD
                        Piece(runCatching { response.text }.getOrNull().orEmpty(), source)
                    }
                }
            }
        }
    }

    /** A model used only to check, download and warm up Gemini Nano. */
    fun probe(): GenerativeModel = build(ModelSpec(ModelKind.GIST, RouteMode.PREFER_ON_DEVICE, Level.PLAIN, "en"), config())
}
