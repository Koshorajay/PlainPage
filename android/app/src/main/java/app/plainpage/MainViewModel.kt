package app.plainpage

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.plainpage.ai.BlockedException
import app.plainpage.ai.Chunker
import app.plainpage.ai.Conditions
import app.plainpage.ai.DeviceStatus
import app.plainpage.ai.EngineEvent
import app.plainpage.ai.FirebaseModelFactory
import app.plainpage.ai.Level
import app.plainpage.ai.RouteDecision
import app.plainpage.ai.RouteInput
import app.plainpage.ai.RuntimeConfig
import app.plainpage.ai.Section
import app.plainpage.ai.Source
import app.plainpage.ai.decideRoute
import app.plainpage.ai.friendlyError
import app.plainpage.ai.simplify
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.OnDeviceModelStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class Reading(
    val title: String,
    val level: Level,
    val language: String,
    val privateMode: Boolean,
    val decision: RouteDecision? = null,
    val sections: List<Section> = emptyList(),
    val gist: String = "",
    val gistSource: Source? = null,
    val gistRunning: Boolean = false,
    val running: Boolean = true,
    val error: String? = null,
    val leftDevice: Boolean? = null,
    val startedAt: Long = System.currentTimeMillis(),
    val finishedAt: Long? = null,
)

data class UiState(
    val text: String = "",
    val title: String = "",
    val level: Level = Level.PLAIN,
    val language: String = "en",
    val privateMode: Boolean = false,
    val online: Boolean = true,
    val device: DeviceStatus = DeviceStatus.UNAVAILABLE,
    val checkingDevice: Boolean = true,
    val downloadedBytes: Long? = null,
    val deviceMessage: String? = null,
    val config: RuntimeConfig = RuntimeConfig(),
    val reading: Reading? = null,
) {
    val conditions get() = Conditions(language, level, privateMode, online, device, config)
    val decision: RouteDecision get() = decideRoute(RouteInput(Chunker.normalize(text).length, language, privateMode, online, device, config))
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val factory = FirebaseModelFactory { _state.value.config }
    private var job: Job? = null

    init {
        watchNetwork()
        viewModelScope.launch {
            val config = RemoteSettings.load()
            _state.update { it.copy(config = config) }
        }
        refreshDevice()
    }

    fun setText(text: String, title: String = "") = _state.update { it.copy(text = text.take(200_000), title = title) }
    fun setLevel(level: Level) = _state.update { it.copy(level = level) }
    fun setLanguage(code: String) = _state.update { it.copy(language = code) }
    fun setPrivate(on: Boolean) = _state.update { it.copy(privateMode = on) }

    fun refreshDevice() {
        viewModelScope.launch {
            val status = try {
                when (factory.probe().onDeviceExtension?.checkStatus()) {
                    OnDeviceModelStatus.AVAILABLE -> DeviceStatus.AVAILABLE
                    OnDeviceModelStatus.DOWNLOADABLE -> DeviceStatus.DOWNLOADABLE
                    OnDeviceModelStatus.DOWNLOADING -> DeviceStatus.DOWNLOADING
                    else -> DeviceStatus.UNAVAILABLE
                }
            } catch (e: Exception) {
                DeviceStatus.UNAVAILABLE
            }
            _state.update { it.copy(device = status, checkingDevice = false) }
        }
    }

    /** One-time download of Gemini Nano, managed by Android's AICore. */
    fun downloadModel() {
        viewModelScope.launch {
            _state.update { it.copy(device = DeviceStatus.DOWNLOADING, downloadedBytes = 0, deviceMessage = null) }
            try {
                val ext = factory.probe().onDeviceExtension
                if (ext == null) {
                    _state.update { it.copy(deviceMessage = "This phone does not support the on-device model.") }
                } else {
                    ext.download().collect { status ->
                        when (status) {
                            is DownloadStatus.DownloadInProgress -> _state.update { it.copy(downloadedBytes = status.totalBytesDownloaded) }
                            is DownloadStatus.DownloadFailed -> _state.update { it.copy(deviceMessage = "Download failed: ${friendlyError(status.exception)}") }
                            else -> Unit
                        }
                    }
                    runCatching { ext.warmUp() }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(deviceMessage = friendlyError(e)) }
            }
            _state.update { it.copy(downloadedBytes = null) }
            refreshDevice()
        }
    }

    fun start() {
        val s = _state.value
        val text = Chunker.normalize(s.text)
        if (text.length < 20) return
        job?.cancel()
        val title = s.title.ifBlank {
            text.lineSequence().map { it.removePrefix("#").removePrefix("#").trim() }.firstOrNull { it.isNotEmpty() }?.take(70) ?: "Untitled"
        }
        _state.update { it.copy(reading = Reading(title, s.level, s.language, s.privateMode)) }
        job = viewModelScope.launch {
            try {
                simplify(text, s.conditions, factory) { event -> apply(event) }
            } catch (e: CancellationException) {
                updateReading { it.copy(running = false, finishedAt = System.currentTimeMillis()) }
                throw e
            } catch (e: BlockedException) {
                updateReading { it.copy(running = false, error = e.message) }
            } catch (e: Exception) {
                updateReading { it.copy(running = false, error = friendlyError(e)) }
            }
        }
    }

    fun stop() { job?.cancel() }

    fun back() {
        job?.cancel()
        _state.update { it.copy(reading = null) }
    }

    private fun apply(event: EngineEvent) = updateReading { r ->
        when (event) {
            is EngineEvent.Plan -> r.copy(decision = event.decision, sections = event.sections)
            is EngineEvent.SectionUpdate -> r.copy(sections = r.sections.map { if (it.index == event.index) event.update(it) else it })
            is EngineEvent.Gist -> r.copy(gist = event.text.ifEmpty { r.gist }, gistSource = event.source ?: r.gistSource, gistRunning = event.running)
            is EngineEvent.Done -> r.copy(running = false, leftDevice = event.leftDevice, finishedAt = System.currentTimeMillis())
        }
    }

    private fun updateReading(f: (Reading) -> Reading) = _state.update { s -> s.reading?.let { s.copy(reading = f(it)) } ?: s }

    private fun watchNetwork() {
        val cm = getApplication<Application>().getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val online = cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        _state.update { it.copy(online = online) }
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { _state.update { it.copy(online = true) } }
            override fun onLost(network: Network) { _state.update { it.copy(online = false) } }
        })
    }
}
