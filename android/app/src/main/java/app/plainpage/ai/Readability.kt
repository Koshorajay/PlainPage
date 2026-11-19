package app.plainpage.ai

/** Flesch-Kincaid grade level, computed locally (no AI). English only. */
object Readability {
    data class Stats(val words: Int, val sentences: Int, val sentenceLength: Double, val grade: Double)

    fun syllables(word: String): Int {
        val w = word.lowercase().replace(Regex("[^a-z]"), "")
        if (w.isEmpty()) return 0
        if (w.length <= 3) return 1
        val trimmed = w.replace(Regex("(?:[^laeiouy]es|ed|[^laeiouy]e)$"), "").replace(Regex("^y"), "")
        return maxOf(1, Regex("[aeiouy]+").findAll(trimmed).count())
    }

    fun stats(text: String): Stats {
        val clean = text.replace(Regex("(?m)^#{1,6}\\s+"), "").replace(Regex("(?m)^\\s*[-*]\\s+"), "").replace("**", "")
        val words = Regex("[A-Za-z0-9À-ɏ'’-]+").findAll(clean).map { it.value }.toList()
        val sentences = maxOf(1, clean.split(Regex("[.!?]+(?:\\s|$)|\\n+")).count { Regex("[A-Za-z0-9]").containsMatchIn(it) })
        if (words.isEmpty()) return Stats(0, 0, 0.0, 0.0)
        val syl = words.sumOf { syllables(it) }
        val len = words.size.toDouble() / sentences
        val grade = 0.39 * len + 11.8 * (syl.toDouble() / words.size) - 15.59
        return Stats(words.size, sentences, len, maxOf(0.0, grade))
    }
}
