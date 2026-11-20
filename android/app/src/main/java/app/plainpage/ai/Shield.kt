package app.plainpage.ai

/**
 * Privacy shield: before text can reach the cloud, personal details are
 * replaced with placeholders on the phone ("[NAME_1]", "[ACCOUNT_1]") and put
 * back when the answer arrives. Deterministic patterns and labels, no AI.
 * Same rules as the web app (src/lib/shield.ts). Amounts, dates and times are
 * left visible because the rewrite needs them.
 */
enum class PiiKind(val token: String, val one: String, val many: String) {
    NAME("NAME", "name", "names"),
    PHONE("PHONE", "phone number", "phone numbers"),
    EMAIL("EMAIL", "email address", "email addresses"),
    ACCOUNT("ACCOUNT", "account number", "account numbers"),
    ID("ID", "ID number", "ID numbers"),
    CARD("CARD", "card number", "card numbers"),
    ADDRESS("ADDRESS", "address", "addresses"),
}

data class ShieldEntry(val kind: PiiKind, val value: String, val token: String)

data class PiiSpan(val start: Int, val end: Int, val kind: PiiKind, val value: String)

class Shield private constructor(val entries: List<ShieldEntry>) {
    private val byToken = entries.associate { it.token.removeSurrounding("[", "]").uppercase() to it.value }
    private val longestFirst = entries.sortedByDescending { it.value.length }

    fun mask(text: String): String {
        var out = text
        for (e in longestFirst) out = out.replace(wholeWord(e.value), Regex.escapeReplacement(e.token))
        return out
    }

    fun restore(text: String): String = TOKEN.replace(text) { m ->
        byToken["${m.groupValues[1].uppercase()}_${m.groupValues[2].toInt()}"] ?: m.value
    }

    /** Like restore, and hides a placeholder that is only half streamed in. */
    fun restoreStreaming(text: String): String {
        val restored = restore(text)
        val tail = Regex("""\[[A-Za-z_ -]{0,8}\d{0,3}$""").find(restored) ?: return restored
        val letters = tail.value.drop(1).replace(Regex("""[\s_\-\d]"""), "").uppercase()
        val partial = letters.isEmpty() || PiiKind.entries.any { it.token.startsWith(letters) }
        return if (partial) restored.substring(0, tail.range.first) else restored
    }

    /** "a name, an account number and a phone number" */
    fun describe(): String {
        val parts = entries.groupingBy { it.kind }.eachCount().map { (kind, n) ->
            if (n > 1) "$n ${kind.many}" else "${if (kind.one.first() in "aeiouAEIOU" || kind.one.startsWith("ID")) "an" else "a"} ${kind.one}"
        }
        return if (parts.size <= 1) parts.joinToString("") else parts.dropLast(1).joinToString(", ") + " and " + parts.last()
    }

    companion object {
        private val TOKEN = Regex("""\[\s*(NAME|PHONE|EMAIL|ACCOUNT|ID|CARD|ADDRESS)[\s_-]*(\d{1,3})\s*]""", RegexOption.IGNORE_CASE)
        private val NOT_NAMES = ("sir madam madame customer customers resident residents patient patients member members friend friends " +
            "colleague colleagues team all valued applicant applicants parent parents student students client clients user users " +
            "subscriber subscribers policyholder neighbour neighbor tenant landlord shareholder shareholders reader readers manager " +
            "the a an you your our this that sirs mam citizen citizens employee employees").split(" ").toSet()
        private const val HONORIFIC = """(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Shri|Smt|Sri|Kumari|Thiru|Tmt|Selvi)\.?"""
        private const val NAME_WORDS = """(?:[A-Z]\.[ \t]?)*[A-Z][a-zA-Z'-]+(?:[ \t]+(?:[A-Z]\.[ \t]?)*[A-Z][a-zA-Z'-]+){0,3}"""
        private const val ID_VALUE = """(?:[A-Z]{0,8}\d[\dA-Z/-]*)(?:\s(?:[A-Z]{0,8}\d[\dA-Z/-]*)){0,4}"""
        private val ACCOUNT_LABELS = setOf("account", "a/c", "acct", "iban", "loan", "folio")

        private fun wholeWord(value: String) = Regex("(?<![\\p{L}\\p{N}_])" + Regex.escape(value) + "(?![\\p{L}\\p{N}_])")

        private fun luhn(digits: String): Boolean {
            var sum = 0
            var double = false
            for (i in digits.indices.reversed()) {
                var d = digits[i] - '0'
                if (double) { d *= 2; if (d > 9) d -= 9 }
                sum += d
                double = !double
            }
            return digits.isNotEmpty() && sum % 10 == 0
        }

        fun detect(text: String): List<PiiSpan> {
            val spans = mutableListOf<PiiSpan>()
            fun add(start: Int, value: String, kind: PiiKind) {
                val trimmed = value.trim().trimEnd('.', ',', ';', ':')
                if (trimmed.length < 2) return
                val offset = start + value.indexOf(trimmed)
                val end = offset + trimmed.length
                if (spans.all { end <= it.start || offset >= it.end }) spans += PiiSpan(offset, end, kind, trimmed)
            }

            Regex("""[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.EMAIL) }
            Regex("""\b[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}\b(?!\.[A-Za-z]|[@\w])""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.ID) }

            val label = Regex(
                """\b(account|a/c|acct|customer|client|consumer|policy|reference|ref|membership|member|patient|card|folio|loan|application|registration|aadhaar|aadhar|pan|passport|licen[cs]e|employee|roll|invoice|order|ticket|case|claim|tracking|uhid|mrn|ssn|iban)\b""",
                RegexOption.IGNORE_CASE,
            )
            val valueRe = Regex("""^\s*(?:(?:[Nn]o|NO|[Nn]umber|[Nn]um|I[Dd]|[Cc]ode)\b\.?)?\s*(?:is\s+)?[:#.\-–]?\s*($ID_VALUE)""")
            for (m in label.findAll(text)) {
                val afterStart = m.range.last + 1
                val after = text.substring(afterStart, minOf(text.length, afterStart + 60))
                val v = valueRe.find(after) ?: continue
                val value = v.groupValues[1]
                if (value.count { it.isDigit() } < 4) continue
                val l = m.groupValues[1].lowercase()
                val kind = if (l == "card") PiiKind.CARD else if (l in ACCOUNT_LABELS) PiiKind.ACCOUNT else PiiKind.ID
                add(afterStart + v.range.last + 1 - value.length, value, kind)
            }

            Regex("""\b(?:\d[ -]?){12,18}\d\b""").findAll(text).forEach {
                val digits = it.value.filter(Char::isDigit)
                if (digits.length in 13..19 && luhn(digits)) add(it.range.first, it.value, PiiKind.CARD)
            }
            Regex("""\b\d{4}[ -]\d{4}[ -]\d{4}\b""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.ID) }
            Regex("""\b[A-Z]{5}\d{4}[A-Z]\b""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.ID) }
            Regex("""\b\d{3}-\d{2}-\d{4}\b""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.ID) }
            Regex("""\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.ACCOUNT) }

            for (m in Regex("""(?<![\w.,/:])(?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?(?:[\s-]\d{2,5}){1,4}(?![\w.,/:]\d)""").findAll(text)) {
                val digits = m.value.filter(Char::isDigit)
                if (digits.length !in 8..15) continue
                val t = m.value.trim()
                if (Regex("""^\d{4}-\d{1,2}-\d{1,2}$""").matches(t) || Regex("""^\d{1,2}-\d{1,2}-\d{2,4}$""").matches(t)) continue
                val before = text.substring(maxOf(0, m.range.first - 4), m.range.first)
                if (Regex("""(₹|rs\.?|inr|\$|£|€)\s*$""", RegexOption.IGNORE_CASE).containsMatchIn(before)) continue
                add(m.range.first, m.value, PiiKind.PHONE)
            }
            Regex("""(?<![\w.,])\d{9,}(?![\w.,]\d)""").findAll(text).forEach { add(it.range.first, it.value, PiiKind.ACCOUNT) }

            Regex("""\b$HONORIFIC[ \t]+($NAME_WORDS)""").findAll(text).forEach {
                add(it.range.last + 1 - it.groupValues[1].length, it.groupValues[1], PiiKind.NAME)
            }
            Regex("""\bDear[ \t]+(?:$HONORIFIC[ \t]+)?($NAME_WORDS)[ \t]*[,:]""").findAll(text).forEach {
                val name = it.groupValues[1]
                if (name.split(Regex("\\s+")).first().lowercase() !in NOT_NAMES) add(it.range.first + it.value.lastIndexOf(name), name, PiiKind.NAME)
            }
            val nameLabel = Regex(
                """\b(name|full name|patient name|patient|tenant|landlord|lessee|lessor|customer name|account holder|applicant|beneficiary|insured|policy ?holder|guardian|borrower|recipient|attn|attention)\s*[:\-–]\s*""",
                RegexOption.IGNORE_CASE,
            )
            val nameRe = Regex("^$NAME_WORDS")
            for (m in nameLabel.findAll(text)) {
                val start = m.range.last + 1
                val v = nameRe.find(text.substring(start, minOf(text.length, start + 60))) ?: continue
                if (v.value.split(Regex("\\s+")).first().lowercase() in NOT_NAMES) continue
                add(start, v.value, PiiKind.NAME)
            }

            Regex("""\b(?:address|addr\.?)\s*[:\-–]\s*([^\n]{4,120})""", RegexOption.IGNORE_CASE).findAll(text).forEach {
                add(it.range.last + 1 - it.groupValues[1].length, it.groupValues[1], PiiKind.ADDRESS)
            }
            Regex("""\b(?:PIN|Pin ?code|PIN ?code|Postcode|Postal code|ZIP)\s*[:\-]?\s*(\d{3}\s?\d{3}|\d{5}(?:-\d{4})?)\b""", RegexOption.IGNORE_CASE)
                .findAll(text).forEach { add(it.range.last + 1 - it.groupValues[1].length, it.groupValues[1], PiiKind.ADDRESS) }

            return spans.sortedBy { it.start }
        }

        fun build(text: String): Shield {
            val byValue = LinkedHashMap<String, ShieldEntry>()
            val counters = HashMap<PiiKind, Int>()
            for (span in detect(text)) {
                if (span.value in byValue) continue
                val n = (counters[span.kind] ?: 0) + 1
                counters[span.kind] = n
                byValue[span.value] = ShieldEntry(span.kind, span.value, "[${span.kind.token}_$n]")
            }
            return Shield(byValue.values.toList())
        }
    }
}
