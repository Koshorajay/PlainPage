package app.plainpage

data class Sample(val label: String, val title: String, val text: String)

val SAMPLES = listOf(
    Sample("Bank letter", "Bank letter: overdue payment", """## Notice of overdue payment

Dear Mr. Ramesh Kumar,

Re: Account No. 4021 7788 1290

We write to inform you that the minimum amount due of ₹2,450 on your credit card account, which fell due on 15 October 2026, remains unpaid as of the date of this notice. Pursuant to the terms and conditions governing your account, a late payment charge of ₹500 has been levied, and interest shall continue to accrue on the outstanding balance at the prevailing rate of 3.5% per month.

You are hereby requested to remit the outstanding amount no later than 30 November 2026. Failure to do so may result in the suspension of your card and the reporting of the default to credit information companies.

Should you be experiencing financial difficulty, you may request a repayment plan by contacting our customer care helpline on 1800 555 0199 between 9:00 AM and 6:00 PM, Monday to Saturday, or by writing to care@bank.example, quoting your customer ID CUST88213456."""),
    Sample("Rental agreement", "Rental agreement: deposit", """## Security deposit

Upon execution of this Agreement, the Tenant shall remit to the Landlord a security deposit equivalent to two (2) months' rent, which sum shall be held by the Landlord as security for the faithful performance by the Tenant of all covenants and obligations hereunder. The Landlord shall be entitled, but not obligated, to apply said deposit, in whole or in part, towards the remediation of any damage to the Premises exceeding ordinary wear and tear, or towards any arrears of rent outstanding at the termination of the tenancy.

The balance of the deposit, if any, shall be refunded to the Tenant within thirty (30) days following the surrender of vacant possession of the Premises, provided that the Tenant has furnished a forwarding address in writing."""),
    Sample("Medicine leaflet", "How to take this medicine", """## Dosage and administration

The recommended adult dosage is one 500 mg tablet administered orally every eight hours, preferably following the ingestion of food in order to minimise the likelihood of gastrointestinal discomfort. The tablets should be swallowed whole with a sufficient quantity of water and must not be crushed or chewed. Do not exceed three tablets within any twenty-four hour period.

## Possible adverse reactions

Commonly reported adverse reactions include nausea, diarrhoea and mild cutaneous rash. Discontinue use and seek immediate medical attention should you experience swelling of the face, lips or tongue, difficulty in breathing, or severe blistering of the skin, as these may be indicative of a serious hypersensitivity reaction."""),
    Sample("Government notice", "Water supply interruption", """## Notice regarding temporary suspension of water supply

Residents of Wards 12, 14 and 17 are hereby notified that, owing to the scheduled replacement of the primary distribution main along Station Road, the municipal water supply shall be suspended from 10:00 PM on Friday until 6:00 AM on Sunday.

Residents are advised to store an adequate quantity of water for essential domestic requirements in advance of the aforementioned period. Water tankers will be stationed at the Ward 14 community hall between 7:00 AM and 7:00 PM on Saturday; residents are requested to bring their own containers."""),
)
