package app.plainpage.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Renders the tiny Markdown subset the models are asked for: "## " headings, "- " bullets, **bold**. */
sealed interface Block {
    data class Heading(val text: String) : Block
    data class Paragraph(val text: String) : Block
    data class Bullets(val items: List<String>) : Block
}

fun toBlocks(text: String): List<Block> {
    val out = mutableListOf<Block>()
    val para = mutableListOf<String>()
    val list = mutableListOf<String>()
    fun flushPara() { if (para.isNotEmpty()) out += Block.Paragraph(para.joinToString(" ")); para.clear() }
    fun flushList() { if (list.isNotEmpty()) out += Block.Bullets(list.toList()); list.clear() }
    for (raw in text.lines()) {
        val line = raw.trim()
        when {
            line.isEmpty() -> { flushPara(); flushList() }
            Regex("^#{1,6}\\s+").containsMatchIn(line) -> {
                flushPara(); flushList(); out += Block.Heading(line.replace(Regex("^#{1,6}\\s+"), "").replace("**", ""))
            }
            Regex("^(?:[-*•]|\\d{1,2}[.)])\\s+").containsMatchIn(line) -> {
                flushPara(); list += line.replace(Regex("^(?:[-*•]|\\d{1,2}[.)])\\s+"), "")
            }
            else -> { flushList(); para += line }
        }
    }
    flushPara(); flushList()
    return out
}

private fun inline(text: String, highlight: androidx.compose.ui.graphics.Color): AnnotatedString = buildAnnotatedString {
    for (part in splitKeeping(text)) {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, background = highlight)) { append(part.substring(2, part.length - 2)) }
        } else append(part)
    }
}

private fun splitKeeping(text: String): List<String> {
    val out = mutableListOf<String>()
    var last = 0
    for (m in Regex("\\*\\*[^*]+\\*\\*").findAll(text)) {
        if (m.range.first > last) out += text.substring(last, m.range.first)
        out += m.value
        last = m.range.last + 1
    }
    if (last < text.length) out += text.substring(last)
    return out
}

@Composable
fun MarkdownBlocks(text: String, fontSize: Int = 18, modifier: Modifier = Modifier) {
    val hl = Palette.highlight
    Column(modifier) {
        for (block in toBlocks(text)) when (block) {
            is Block.Heading -> Text(block.text, fontSize = (fontSize + 3).sp, fontWeight = FontWeight.SemiBold,
                lineHeight = ((fontSize + 3) * 1.3).sp, modifier = Modifier.padding(top = 8.dp, bottom = 6.dp))
            is Block.Paragraph -> Text(inline(block.text, hl), fontSize = fontSize.sp, lineHeight = (fontSize * 1.65).sp,
                modifier = Modifier.padding(bottom = 10.dp))
            is Block.Bullets -> Column(Modifier.padding(bottom = 10.dp)) {
                for (item in block.items) Row(Modifier.padding(bottom = 4.dp)) {
                    Text("•", fontSize = fontSize.sp, color = MaterialTheme.colorScheme.primary)
                    Text(" ", modifier = Modifier.width(6.dp))
                    Text(inline(item, hl), fontSize = fontSize.sp, lineHeight = (fontSize * 1.6).sp)
                }
            }
        }
    }
}
