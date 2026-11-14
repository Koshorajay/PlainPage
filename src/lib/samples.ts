/** Short example texts so a first-time visitor can try PlainPage in one click. */
export interface Sample {
  id: string;
  label: string;
  title: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: 'lease',
    label: 'Rental agreement',
    title: 'Rental agreement: deposit and repairs',
    text: `## Security deposit

Upon execution of this Agreement, the Tenant shall remit to the Landlord a security deposit equivalent to two (2) months' rent, which sum shall be held by the Landlord as security for the faithful performance by the Tenant of all covenants and obligations hereunder. The Landlord shall be entitled, but not obligated, to apply said deposit, in whole or in part, towards the remediation of any damage to the Premises exceeding ordinary wear and tear, or towards any arrears of rent outstanding at the termination of the tenancy.

The balance of the deposit, if any, shall be refunded to the Tenant within thirty (30) days following the surrender of vacant possession of the Premises, provided that the Tenant has furnished a forwarding address in writing.

## Repairs and maintenance

The Tenant shall be responsible for minor repairs not exceeding 1,500 rupees per occurrence, including but not limited to the replacement of light fittings, tap washers and fuses. Notwithstanding the foregoing, structural repairs and the maintenance of plumbing and electrical installations shall remain the sole responsibility of the Landlord, save where such repairs are necessitated by the negligence or wilful misconduct of the Tenant, the Tenant's family, or the Tenant's invitees.

## Termination

Either party may terminate this Agreement by furnishing not less than sixty (60) days' prior written notice to the other party. In the event that the Tenant vacates the Premises prior to the expiry of the notice period, the Tenant shall remain liable for the rent payable in respect of the unexpired portion thereof.`,
  },
  {
    id: 'medicine',
    label: 'Medicine leaflet',
    title: 'Patient leaflet: how to take this medicine',
    text: `## Dosage and administration

The recommended adult dosage is one 500 mg tablet administered orally every eight hours, preferably following the ingestion of food in order to minimise the likelihood of gastrointestinal discomfort. The tablets should be swallowed whole with a sufficient quantity of water and must not be crushed or chewed. Do not exceed three tablets within any twenty-four hour period.

It is imperative that the full course of treatment be completed as prescribed, irrespective of any symptomatic improvement, since premature discontinuation may result in recurrence of the infection and may contribute to the development of antimicrobial resistance.

## Possible adverse reactions

Commonly reported adverse reactions include nausea, diarrhoea and mild cutaneous rash. Discontinue use and seek immediate medical attention should you experience swelling of the face, lips or tongue, difficulty in breathing, or severe blistering of the skin, as these may be indicative of a serious hypersensitivity reaction.

## Storage

Store below 25 degrees Celsius in the original packaging, protected from moisture. Keep out of the sight and reach of children. Do not use after the expiry date printed on the carton.`,
  },
  {
    id: 'notice',
    label: 'Government notice',
    title: 'Public notice: water supply interruption',
    text: `## Notice regarding temporary suspension of water supply

Residents of Wards 12, 14 and 17 are hereby notified that, owing to the scheduled replacement of the primary distribution main along Station Road, the municipal water supply shall be suspended from 10:00 PM on Friday until 6:00 AM on Sunday. Supply is anticipated to resume at reduced pressure for a period of approximately twenty-four hours thereafter.

Residents are advised to store an adequate quantity of water for essential domestic requirements in advance of the aforementioned period. Water tankers will be stationed at the Ward 14 community hall and the Ward 17 primary school between 7:00 AM and 7:00 PM on Saturday for the convenience of the public; residents are requested to bring their own containers.

Households with elderly or infirm occupants who are unable to collect water in person may request doorstep delivery by contacting the helpline on 1800 555 0142 no later than 5:00 PM on Thursday. The inconvenience occasioned is regretted.`,
  },
  {
    id: 'science',
    label: 'Science article',
    title: 'How vaccines train the immune system',
    text: `Vaccination exploits the adaptive immune system's capacity for immunological memory. When a vaccine introduces an antigen, typically an inactivated pathogen, an attenuated strain, or a fragment such as a surface protein, specialised antigen-presenting cells engulf it and display its molecular signature to naive T lymphocytes in the lymph nodes.

This encounter precipitates the clonal expansion of lymphocytes that recognise the antigen. A subset of B lymphocytes differentiates into plasma cells, which secrete antibodies capable of neutralising the pathogen, whilst others persist as long-lived memory cells.

Should the genuine pathogen subsequently be encountered, these memory cells mount a secondary response that is substantially more rapid and more vigorous than the primary response, frequently eliminating the infection before clinical symptoms manifest. Booster doses serve to reinforce this memory where it would otherwise wane over time.`,
  },
];
