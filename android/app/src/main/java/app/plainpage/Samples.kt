package app.plainpage

data class Sample(val label: String, val title: String, val text: String)

val SAMPLES = listOf(
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
