package app.plainpage.ai

/** Splits text into pieces that fit the model, on paragraph and sentence boundaries. */
object Chunker {
    fun normalize(raw: String): String = raw
        .replace("\r\n", "\n").replace('\r', '\n').replace('\u00a0', ' ')
        .replace(Regex("[ \\t]+\\n"), "\n")
        .replace(Regex("\\n{3,}"), "\n\n")
        .trim()

    private fun isHeading(block: String) = Regex("^#{1,6}\\s").containsMatchIn(block)

    fun sentences(text: String): List<String> {
        val found = Regex("[^.!?。！？\\n]+(?:[.!?。！？]+[\"'”’)\\]]*|\\n|$)\\s*").findAll(text)
            .map { it.value.trim() }.filter { it.isNotEmpty() }.toList()
        return found.ifEmpty { if (text.isBlank()) emptyList() else listOf(text.trim()) }
    }

    private fun splitOversized(block: String, max: Int): List<String> {
        val out = mutableListOf<String>()
        var current = ""
        fun push() { if (current.isNotBlank()) out += current.trim(); current = "" }
        for (sentence in sentences(block)) {
            if (sentence.length > max) {
                push()
                var rest = sentence
                while (rest.length > max) {
                    var cut = rest.lastIndexOf(' ', max)
                    if (cut < max / 2) cut = max
                    out += rest.substring(0, cut).trim()
                    rest = rest.substring(cut).trim()
                }
                current = rest
                continue
            }
            if (current.isNotEmpty() && current.length + 1 + sentence.length > max) push()
            current = if (current.isEmpty()) sentence else "$current $sentence"
        }
        push()
        return out
    }

    fun chunk(raw: String, maxChars: Int): List<String> {
        val text = normalize(raw)
        if (text.isEmpty()) return emptyList()
        val budget = maxOf(200, maxChars)
        val blocks = text.split(Regex("\\n{2,}")).map { it.trim() }.filter { it.isNotEmpty() }
            .flatMap { if (it.length > budget) splitOversized(it, budget) else listOf(it) }

        val chunks = mutableListOf<List<String>>()
        var current = mutableListOf<String>()
        var size = 0
        for (block in blocks) {
            val added = if (size == 0) block.length else size + 2 + block.length
            if (current.isNotEmpty() && added > budget) {
                val carry = if (current.size > 1 && isHeading(current.last())) current.removeAt(current.lastIndex) else null
                chunks += current
                current = mutableListOf()
                size = 0
                if (carry != null) { current += carry; size = carry.length }
            }
            current += block
            size = if (size == 0) block.length else size + 2 + block.length
        }
        if (current.isNotEmpty()) chunks += current
        return chunks.map { it.joinToString("\n\n") }
    }

    fun countWords(text: String) = Regex("\\S+").findAll(text.trim()).count()
}
