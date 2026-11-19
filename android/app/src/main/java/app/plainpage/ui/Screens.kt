package app.plainpage.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.plainpage.MainViewModel
import app.plainpage.Reading
import app.plainpage.SAMPLES
import app.plainpage.UiState
import app.plainpage.ai.Chunker
import app.plainpage.ai.DeviceStatus
import app.plainpage.ai.Expected
import app.plainpage.ai.LANGUAGES
import app.plainpage.ai.Level
import app.plainpage.ai.Readability
import app.plainpage.ai.RouteDecision
import app.plainpage.ai.SectionStatus
import app.plainpage.ai.Source
import app.plainpage.ai.deviceCanWrite
import kotlin.math.roundToInt

@Composable
fun PlainPageScreen(vm: MainViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding().imePadding()
    ) {
        TopBar(state, vm)
        val reading = state.reading
        if (reading == null) ComposeScreen(state, vm) else {
            BackHandler { vm.back() }
            ReaderScreen(reading, state, vm)
        }
    }
}

@Composable
private fun TopBar(state: UiState, vm: MainViewModel) {
    var showDevice by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(28.dp).background(Palette.accent, RoundedCornerShape(7.dp)), contentAlignment = Alignment.Center) {
            Text("P", color = Color.White, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(8.dp))
        Text("PlainPage", fontSize = 19.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.weight(1f))
        if (!state.online) Chip("Offline", Palette.warn, Palette.warnSoft) {}
        Spacer(Modifier.width(6.dp))
        val ready = state.device == DeviceStatus.AVAILABLE
        val label = when {
            state.checkingDevice -> "Checking..."
            ready -> "On-device ready"
            state.device == DeviceStatus.DOWNLOADING -> state.downloadedBytes?.let { "Downloading ${it / (1024 * 1024)} MB" } ?: "Downloading"
            state.device == DeviceStatus.DOWNLOADABLE -> "Model not downloaded"
            else -> "Cloud only"
        }
        Chip(label, if (ready) Palette.device else Palette.cloud, if (ready) Palette.deviceSoft else Palette.cloudSoft) { showDevice = true }
    }
    if (showDevice) DeviceDialog(state, vm) { showDevice = false }
}

@Composable
private fun Chip(text: String, fg: Color, bg: Color, onClick: () -> Unit) {
    Text(
        text, color = fg, fontSize = 13.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.background(bg, CircleShape).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun DeviceDialog(state: UiState, vm: MainViewModel, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = {
            if (state.device == DeviceStatus.DOWNLOADABLE) TextButton(onClick = { vm.downloadModel() }) { Text("Download on-device model") }
            else TextButton(onClick = onClose) { Text("OK") }
        },
        dismissButton = { if (state.device == DeviceStatus.DOWNLOADABLE) TextButton(onClick = onClose) { Text("Later") } },
        title = { Text("Where PlainPage runs") },
        text = {
            Column {
                Text(
                    when (state.device) {
                        DeviceStatus.AVAILABLE -> "Gemini Nano is ready on this phone. Short English texts are rewritten on the phone: private, free, and it works offline. Long texts and other languages use the cloud."
                        DeviceStatus.DOWNLOADABLE -> "This phone can run Gemini Nano, but it is not downloaded yet. Until then the cloud does the work."
                        DeviceStatus.DOWNLOADING -> "The on-device model is downloading. The cloud covers for it until it is ready."
                        DeviceStatus.UNAVAILABLE -> "This phone has no on-device model, so PlainPage uses Gemini in the cloud. On-device needs a phone that supports Gemini Nano."
                    }
                )
                state.deviceMessage?.let { Text(it, color = Palette.error, modifier = Modifier.padding(top = 8.dp)) }
                Spacer(Modifier.size(12.dp))
                Fact("On device", "Gemini Nano (Android AICore)")
                Fact("Cloud", state.config.cloudModel)
                Fact("Stays local up to", "${state.config.deviceMaxChars / 1000}k characters")
                Fact("App Check", "Debug provider")
            }
        },
    )
}

@Composable
private fun Fact(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
        Spacer(Modifier.weight(1f))
        Text(v, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ComposeScreen(state: UiState, vm: MainViewModel) {
    val ready = Chunker.normalize(state.text).length >= 20
    val decision = state.decision
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp, vertical = 8.dp)) {
        Text("Make any text easy to read.", fontSize = 28.sp, fontWeight = FontWeight.SemiBold, lineHeight = 33.sp)
        Spacer(Modifier.size(6.dp))
        Text(
            "Paste text, or share it to PlainPage from any app. It works on your phone when it can, and in the cloud when it must.",
            color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 16.sp, lineHeight = 23.sp,
        )
        Spacer(Modifier.size(16.dp))
        OutlinedTextField(
            value = state.text,
            onValueChange = { vm.setText(it, state.title) },
            placeholder = { Text("Paste a contract, a medicine leaflet, a letter, a notice...") },
            modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp, max = 320.dp),
            textStyle = MaterialTheme.typography.bodyLarge,
            shape = RoundedCornerShape(16.dp),
        )
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            val words = Chunker.countWords(state.text)
            Text(if (words > 0) "$words words" else "", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            Spacer(Modifier.weight(1f))
            if (state.text.isNotEmpty()) TextButton(onClick = { vm.setText("") }) { Text("Clear") }
        }
        if (state.text.isEmpty()) {
            Text("Try an example", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (s in SAMPLES) OutlinedButton(onClick = { vm.setText(s.text, s.title) }) { Text(s.label) }
            }
        }
        Spacer(Modifier.size(14.dp))
        Text("Reading level", fontWeight = FontWeight.Bold)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            Level.entries.forEachIndexed { i, level ->
                SegmentedButton(
                    selected = state.level == level, onClick = { vm.setLevel(level) },
                    shape = SegmentedButtonDefaults.itemShape(i, Level.entries.size),
                ) { Text(level.label) }
            }
        }
        Text(state.level.hint, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp))
        Spacer(Modifier.size(14.dp))
        LanguagePicker(state, vm)
        Spacer(Modifier.size(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Private mode", fontWeight = FontWeight.Bold)
                Text("The text never leaves this phone.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            }
            Switch(checked = state.privateMode, onCheckedChange = vm::setPrivate)
        }
        Spacer(Modifier.size(14.dp))
        RouteBanner(if (ready) decision else null, state.privateMode)
        Spacer(Modifier.size(12.dp))
        Button(
            onClick = vm::start, enabled = ready && decision.expected != Expected.BLOCKED,
            modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp), shape = RoundedCornerShape(14.dp),
        ) { Text("Make it plain", fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
        Spacer(Modifier.size(24.dp))
    }
}

@Composable
private fun LanguagePicker(state: UiState, vm: MainViewModel) {
    var open by remember { mutableStateOf(false) }
    val current = LANGUAGES.first { it.code == state.language }
    Text("Write it in", fontWeight = FontWeight.Bold)
    Box(Modifier.padding(top = 6.dp)) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
            Text(if (current.native == current.name) current.name else "${current.native} (${current.name})")
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (l in LANGUAGES) DropdownMenuItem(
                text = { Text(if (l.native == l.name) l.name else "${l.native} (${l.name})") },
                onClick = { vm.setLanguage(l.code); open = false },
            )
        }
    }
    Text(
        if (deviceCanWrite(state.language, state.config)) "The on-device model can write this language." else "This language is written by the cloud model.",
        color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp),
    )
}

@Composable
private fun RouteBanner(decision: RouteDecision?, privateMode: Boolean) {
    val (fg, bg) = when (decision?.expected) {
        Expected.DEVICE -> Palette.device to Palette.deviceSoft
        Expected.CLOUD -> Palette.cloud to Palette.cloudSoft
        Expected.BLOCKED -> Palette.warn to Palette.warnSoft
        null -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.surfaceVariant
    }
    Column(Modifier.fillMaxWidth().background(bg, RoundedCornerShape(16.dp)).padding(14.dp)) {
        val title = when {
            decision == null -> "Where will it run?"
            decision.expected == Expected.DEVICE && privateMode -> "On this phone (private)"
            else -> decision.label
        }
        Text(title, color = fg, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Text(
            decision?.explain ?: "Add some text and PlainPage will tell you before it starts.",
            fontSize = 15.sp, lineHeight = 21.sp, color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun SourceBadge(source: Source) {
    val device = source == Source.DEVICE
    Chip(if (device) "On this phone" else "In the cloud", if (device) Palette.device else Palette.cloud, if (device) Palette.deviceSoft else Palette.cloudSoft) {}
}

@Composable
private fun ReaderScreen(reading: Reading, state: UiState, vm: MainViewModel) {
    val context = LocalContext.current
    val done = reading.sections.count { it.status == SectionStatus.DONE }
    val plain = reading.sections.map { it.simplified.trim() }.filter { it.isNotEmpty() }.joinToString("\n\n")
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = vm::back) { Text("‹ New") }
            Spacer(Modifier.weight(1f))
            if (reading.running) TextButton(onClick = vm::stop) { Text("Stop") }
            if (!reading.running && plain.isNotEmpty()) {
                TextButton(onClick = {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("PlainPage", plain))
                }) { Text("Copy") }
                TextButton(onClick = {
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"; putExtra(Intent.EXTRA_TEXT, plain.replace("**", "").replace("## ", ""))
                    }, "Share plain text"))
                }) { Text("Share") }
            }
        }
        SelectionContainer {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 18.dp)) {
                Text("${reading.level.label} · ${LANGUAGES.first { it.code == reading.language }.native}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(reading.title, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, lineHeight = 29.sp, modifier = Modifier.padding(vertical = 6.dp))
                reading.decision?.let { RouteBanner(it, reading.privateMode) }
                if (reading.running && reading.sections.isNotEmpty()) {
                    LinearProgressIndicator(
                        progress = { done.toFloat() / reading.sections.size },
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    )
                }
                reading.error?.let {
                    Text(it, color = Palette.error, fontWeight = FontWeight.Bold,
                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp).background(Palette.errorSoft, RoundedCornerShape(12.dp)).padding(14.dp))
                }
                if (reading.gist.isNotEmpty() || reading.gistRunning) {
                    Column(Modifier.fillMaxWidth().padding(top = 14.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(16.dp)).padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("IN SHORT", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Spacer(Modifier.weight(1f))
                            reading.gistSource?.let { SourceBadge(it) }
                        }
                        if (reading.gist.isEmpty()) Text("Summing up...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        else MarkdownBlocks(reading.gist, 17, Modifier.padding(top = 6.dp))
                    }
                }
                if (!reading.running && plain.isNotEmpty() && reading.language == "en") {
                    val before = Readability.stats(reading.sections.joinToString("\n\n") { it.original })
                    val after = Readability.stats(plain)
                    if (before.words > 30) Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Meter("Reading level", "Grade ${before.grade.roundToInt()}", "Grade ${after.grade.roundToInt()}", Modifier.weight(1f))
                        Meter("Words per sentence", "${before.sentenceLength.roundToInt()}", "${after.sentenceLength.roundToInt()}", Modifier.weight(1f))
                    }
                }
                Spacer(Modifier.size(14.dp))
                for (s in reading.sections) {
                    Column(Modifier.padding(bottom = 14.dp)) {
                        s.source?.takeIf { s.simplified.isNotEmpty() }?.let { Box(Modifier.padding(bottom = 6.dp)) { SourceBadge(it) } }
                        when {
                            s.status == SectionStatus.ERROR -> {
                                Text("This part could not be rewritten. ${s.error} Here is the original:", color = Palette.error, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                MarkdownBlocks(s.original, 17, Modifier.padding(top = 6.dp))
                            }
                            s.simplified.isNotEmpty() -> MarkdownBlocks(s.simplified)
                            else -> Text(if (s.status == SectionStatus.RUNNING) "Rewriting..." else "Waiting...", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        s.fallback?.let {
                            Text(it, color = Palette.warn, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                                modifier = Modifier.background(Palette.warnSoft, RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
                        }
                    }
                }
                if (!reading.running && done > 0) Receipt(reading, state)
                Spacer(Modifier.size(28.dp))
            }
        }
    }
}

@Composable
private fun Meter(label: String, before: String, after: String, modifier: Modifier) {
    Column(modifier.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp)).padding(12.dp)) {
        Text(label.uppercase(), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.Bottom) {
            Text("$before to ", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 16.sp)
            Text(after, color = Palette.device, fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
        }
    }
}

@Composable
private fun Receipt(reading: Reading, state: UiState) {
    val finished = reading.sections.filter { it.status == SectionStatus.DONE }
    val device = finished.count { it.source == Source.DEVICE }
    val cloud = finished.count { it.source == Source.CLOUD }
    val failed = reading.sections.count { it.status == SectionStatus.ERROR }
    val secs = reading.finishedAt?.let { ((it - reading.startedAt) / 1000).coerceAtLeast(1) }
    Column(
        Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(16.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("HOW THIS TEXT WAS MADE", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Row(verticalAlignment = Alignment.CenterVertically) { SourceBadge(Source.DEVICE); Text("  $device ${if (device == 1) "part" else "parts"} · Gemini Nano") }
        Row(verticalAlignment = Alignment.CenterVertically) { SourceBadge(Source.CLOUD); Text("  $cloud ${if (cloud == 1) "part" else "parts"} · ${state.config.cloudModel}") }
        val note = buildString {
            append(
                when {
                    reading.leftDevice == false -> "Nothing from this text left your phone."
                    cloud == 0 -> "PlainPage asked the cloud first, so this text was sent there. The cloud could not answer and your phone did the work."
                    device == 0 -> "This text was rewritten by the cloud model through Firebase AI Logic."
                    else -> "Parts of this text were sent to the cloud model through Firebase AI Logic."
                }
            )
            if (failed > 0) append(" $failed could not be rewritten and ${if (failed == 1) "is" else "are"} shown as written.")
            secs?.let { append(" Finished in $it s.") }
        }
        Text(note, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 15.sp, lineHeight = 21.sp)
    }
}
