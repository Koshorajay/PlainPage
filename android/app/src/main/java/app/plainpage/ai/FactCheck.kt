package app.plainpage.ai

import kotlin.math.abs
import kotlin.math.floor

/**
 * Fact check: every number, amount, date, time and phone number from the
 * original should still be in the plain version. Deterministic and local (no
 * AI). Same rules as the web app (src/lib/factcheck.ts).
 */
object FactCheck {
    data class Fact(val key: String, val display: String, val context: String)
    data class Report(val total: Int, val kept: Int, val missing: List<Fact>, val checkedNames: Boolean)
    private data class Found(val key: String, val display: String, val index: Int)

    private val UNITS = listOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
        "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen")
    private val TENS = listOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
    private val MONTHS = listOf("january", "february", "march", "april", "may", "june", "july", "august", "september",
        "october", "november", "december")

    private val NUMBER_WORD = Regex(
        "\\b(?:(${TENS.drop(2).joinToString("|")})(?:[\\s-](${UNITS.subList(1, 10).joinToString("|")}))?|(${UNITS.joinToString("|")}))\\b",
        RegexOption.IGNORE_CASE,
    )
    private val PHONE = Regex("""(?<![\w.,/:])(?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?(?:[\s-]\d{2,5}){1,4}(?![\w.,/:]\d)""")
    private val TIME_12 = Regex("""\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b\.?""", RegexOption.IGNORE_CASE)
    private val TIME_24 = Regex("""\b([01]?\d|2[0-3]):([0-5]\d)\b""")
    private val NUMBER = Regex("""(?<![\w.])\d+(?:,\d{2,3})*(?:\.\d+)?(?:st|nd|rd|th)?(?!\w)|(?<![\w.])\d+(?:,\d{2,3})*(?:\.\d+)?(?=%)""")
    private val DAY = Regex("""\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b""", RegexOption.IGNORE_CASE)
    private val MONTH = Regex("""\b(january|february|march|april|may|june|july|august|september|october|november|december)\b""", RegexOption.IGNORE_CASE)

    private val DIGIT_STARTS = intArrayOf(0x0966, 0x09E6, 0x0BE6, 0x0C66, 0x0660, 0x06F0, 0xFF10)

    /** Digits from other scripts (Devanagari, Bengali, Tamil, Telugu, Arabic, full-width) become 0-9. */
    fun asciiDigits(text: String): String = buildString(text.length) {
        for (ch in text) {
            val start = DIGIT_STARTS.firstOrNull { ch.code in it..it + 9 }
            append(if (start != null) ('0' + (ch.code - start)) else ch)
        }
    }

    private fun normalizeNumber(raw: String): String {
        val clean = raw.replace(Regex(",(?=\\d)"), "")
        val d = clean.toDoubleOrNull() ?: return clean
        return if (d == floor(d) && abs(d) < 1e15) d.toLong().toString() else d.toString()
    }

    private fun isDateLike(s: String) = Regex("""^\d{4}-\d{1,2}-\d{1,2}$""").matches(s) || Regex("""^\d{1,2}-\d{1,2}-\d{2,4}$""").matches(s)

    private fun contextAt(text: String, index: Int, length: Int): String {
        val start = maxOf(0, text.lastIndexOf(' ', maxOf(0, index - 40)))
        val end = text.indexOf(' ', minOf(text.length, index + length + 40))
        val snippet = text.substring(start, if (end == -1) text.length else end).replace(Regex("\\s+"), " ").trim()
        return (if (start > 0) "..." else "") + snippet + (if (end != -1 && end < text.length) "..." else "")
    }

    private fun findFacts(raw: String, names: Boolean, wordsFromOne: Boolean): List<Found> {
        val text = asciiDigits(raw)
        val taken = mutableListOf<IntRange>()
        val found = mutableListOf<Found>()
        fun free(r: IntRange) = taken.none { r.first <= it.last && it.first <= r.last }
        fun add(key: String, display: String, range: IntRange) { taken += range; found += Found(key, display, range.first) }

        for (m in PHONE.findAll(text)) {
            val digits = m.value.filter { it.isDigit() }
            if (digits.length !in 8..15 || isDateLike(m.value.trim())) continue
            add("P$digits", m.value.trim(), m.range)
        }
        for (m in TIME_12.findAll(text)) {
            if (!free(m.range)) continue
            var hour = m.groupValues[1].toInt() % 12
            if (m.groupValues[3].lowercase() == "p") hour += 12
            add("T$hour:${m.groupValues[2].ifEmpty { "00" }}", m.value.trim(), m.range)
        }
        for (m in TIME_24.findAll(text)) {
            if (!free(m.range)) continue
            add("T${m.groupValues[1].toInt()}:${m.groupValues[2]}", m.value, m.range)
        }
        for (m in Regex("""\b(noon|midday|midnight)\b""", RegexOption.IGNORE_CASE).findAll(text)) {
            add(if (m.value.lowercase() == "midnight") "T0:00" else "T12:00", m.value, m.range)
        }
        for (m in NUMBER.findAll(text)) {
            if (!free(m.range)) continue
            add("N${normalizeNumber(m.value.replace(Regex("(st|nd|rd|th)$", RegexOption.IGNORE_CASE), ""))}", m.value, m.range)
        }
        for (m in NUMBER_WORD.findAll(text)) {
            if (!free(m.range)) continue
            val value = if (m.groupValues[3].isNotEmpty()) UNITS.indexOf(m.groupValues[3].lowercase())
            else TENS.indexOf(m.groupValues[1].lowercase()) * 10 + (if (m.groupValues[2].isNotEmpty()) UNITS.indexOf(m.groupValues[2].lowercase()) else 0)
            if (value < 0 || (!wordsFromOne && value <= 1)) continue
            add("N$value", m.value, m.range)
        }
        if (names) {
            for (m in DAY.findAll(text)) add("W${m.groupValues[1].lowercase()}", m.value, m.range)
            for (m in MONTH.findAll(text)) {
                val month = m.groupValues[1].lowercase()
                if (month == "may") {
                    val around = text.substring(maxOf(0, m.range.first - 4), minOf(text.length, m.range.last + 6))
                    if (around.none { it.isDigit() }) continue
                }
                add("M$month", m.value, m.range)
            }
        }
        return found
    }

    fun check(original: String, rewrite: String, english: Boolean): Report {
        val facts = findFacts(original, english, wordsFromOne = false)
        val keys = HashSet<String>()
        for (f in findFacts(rewrite, english, wordsFromOne = true)) {
            keys += f.key
            if (f.key.startsWith("M")) keys += "N${MONTHS.indexOf(f.key.substring(1)) + 1}"
            if (f.key.startsWith("P")) f.display.split(Regex("[\\s()-]+")).filter { it.isNotEmpty() }
                .forEach { g -> g.toLongOrNull()?.let { keys += "N$it" } }
        }
        val allDigits = asciiDigits(rewrite).filter { it.isDigit() }
        val unique = LinkedHashMap<String, Fact>()
        val asciiOriginal = asciiDigits(original)
        for (f in facts) if (f.key !in unique) unique[f.key] = Fact(f.key, f.display, contextAt(asciiOriginal, f.index, f.display.length))
        val missing = unique.values.filter { fact ->
            val kept = fact.key in keys ||
                (fact.key.startsWith("P") && allDigits.contains(fact.key.substring(1))) ||
                (fact.key.startsWith("N") && "P${fact.key.substring(1)}" in keys)
            !kept
        }
        return Report(unique.size, unique.size - missing.size, missing, english)
    }

    fun merge(reports: List<Report>) = Report(
        reports.sumOf { it.total }, reports.sumOf { it.kept }, reports.flatMap { it.missing }, reports.all { it.checkedNames },
    )
}
