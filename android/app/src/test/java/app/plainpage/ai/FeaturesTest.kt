package app.plainpage.ai

import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FactCheckTest {
    @Test fun acceptsFormatChanges() {
        val original = "Pay two (2) months' rent. Water is off from 10:00 PM on Friday until 6:00 AM on Sunday. Repairs up to 1,500 rupees. Call 1800 555 0142. Do not exceed three tablets in any twenty-four hour period."
        val rewrite = "Pay 2 months of rent. Water is off from 10 pm on Friday until 6 am on Sunday. Repairs up to 1500 rupees. Call 1800-555-0142. Take no more than 3 tablets in 24 hours."
        val r = FactCheck.check(original, rewrite, english = true)
        assertEquals(emptyList<String>(), r.missing.map { it.display })
        assertEquals(r.total, r.kept)
    }

    @Test fun flagsMissingDetails() {
        val r = FactCheck.check("Pay ₹2,450 by 30 November 2026. Late fee: ₹500.", "Pay soon. Late fee: ₹500.", english = true)
        assertTrue(r.missing.map { it.display }.containsAll(listOf("2,450", "30", "November", "2026")))
        assertFalse(r.missing.any { it.display == "500" })
    }

    @Test fun otherScriptsAndLanguages() {
        assertEquals("2026 30", FactCheck.asciiDigits("२०२६ ௩௦"))
        val r = FactCheck.check("Pay 500 rupees on Friday.", "வெள்ளிக்கிழமை ५०० ரூபாய்.", english = false)
        assertTrue(r.missing.isEmpty())
    }
}

class ShieldTest {
    private val letter = "Dear Mr. Ramesh Kumar,\n\nRe: Account No. 4021 7788 1290\n\nPay ₹2,450 by 30 November 2026 before 6:00 PM. Call 1800 555 0199 or write to care@bank.example, quoting your customer ID CUST88213456."

    @Test fun masksIdentifiersButNotFacts() {
        val shield = Shield.build(letter)
        val masked = shield.mask(letter)
        for (secret in listOf("Ramesh", "Kumar", "4021 7788 1290", "1800 555 0199", "care@bank.example", "CUST88213456")) assertFalse(secret, masked.contains(secret))
        for (fact in listOf("₹2,450", "30 November 2026", "6:00 PM")) assertTrue(fact, masked.contains(fact))
        assertTrue(masked.contains("Dear Mr. [NAME_1],"))
    }

    @Test fun restoresAndHidesHalfTokens() {
        val shield = Shield.build(letter)
        assertEquals("Hi Ramesh Kumar, call 1800 555 0199.", shield.restore("Hi [NAME_1], call [phone 1]."))
        assertEquals("Call ", shield.restoreStreaming("Call [PHO"))
        assertEquals("See [Note", shield.restoreStreaming("See [Note"))
    }

    @Test fun ignoresGreetingsAndPlainWords() {
        assertTrue(Shield.detect("Dear Customer, your account is ready. In order to pay, use your card.").isEmpty())
    }

    @Test fun describesInPlainWords() {
        assertEquals("a name, an account number, a phone number, an email address and an ID number", Shield.build(letter).describe())
    }
}

class ChecklistTest {
    @Test fun parsesTasksAndDeadlines() {
        val items = parseChecklist("List:\n- Pay ₹2,450 — by 30 November 2026\n- Call the helpline – 9:00 AM to 6:00 PM\n* **Keep** your ID ready.\n- Pay ₹2,450 — by 30 November 2026")
        assertEquals(listOf(TaskItem("Pay ₹2,450", "by 30 November 2026"), TaskItem("Call the helpline", "9:00 AM to 6:00 PM"), TaskItem("Keep your ID ready")), items)
        assertTrue(parseChecklist("NONE").isEmpty())
    }

    @Test fun cloudRequestsNeverSeePersonalDetails() = runTest {
        val prompts = mutableListOf<String>()
        val factory = ModelFactory { _ ->
            HybridModel { prompt ->
                flow {
                    prompts += prompt
                    emit(Piece("- Call [PHONE_1] — before Friday", Source.CLOUD))
                }
            }
        }
        val c = Conditions("ta", Level.PLAIN, false, true, DeviceStatus.AVAILABLE, RuntimeConfig())
        val r = makeChecklist("Mr. Ramesh Kumar, please call 1800 555 0199 before Friday.", c, factory) { _, _ -> }
        assertFalse(prompts.any { it.contains("Ramesh") || it.contains("1800 555 0199") })
        assertEquals(listOf(TaskItem("Call 1800 555 0199", "before Friday")), r.items)
    }
}
