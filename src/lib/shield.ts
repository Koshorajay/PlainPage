/**
 * Privacy shield: when text has to go to the cloud, personal details are
 * swapped for placeholders on the device first, and put back on the device
 * when the answer comes back. The cloud model sees "[NAME_1]" and
 * "[ACCOUNT_1]", never the name or the account number.
 *
 * Detection is deterministic (patterns and labels, no AI), so it behaves the
 * same on every device and can be tested. It targets identifiers, not facts:
 * amounts, dates and times stay visible because the rewrite needs them.
 */

export type PiiKind = 'name' | 'phone' | 'email' | 'account' | 'id' | 'card' | 'address';

export interface ShieldEntry {
  kind: PiiKind;
  value: string;
  token: string;
}

export interface Shield {
  entries: ShieldEntry[];
  /** Replaces every detected value with its placeholder. */
  mask(text: string): string;
  /** Puts the original values back. */
  restore(text: string): string;
  /** Like restore, and hides a placeholder that is only half streamed in. */
  restoreStreaming(text: string): string;
}

const TOKEN_LABEL: Record<PiiKind, string> = {
  name: 'NAME',
  phone: 'PHONE',
  email: 'EMAIL',
  account: 'ACCOUNT',
  id: 'ID',
  card: 'CARD',
  address: 'ADDRESS',
};

const KIND_WORDS: Record<PiiKind, [string, string]> = {
  name: ['name', 'names'],
  phone: ['phone number', 'phone numbers'],
  email: ['email address', 'email addresses'],
  account: ['account number', 'account numbers'],
  id: ['ID number', 'ID numbers'],
  card: ['card number', 'card numbers'],
  address: ['address', 'addresses'],
};

const NOT_NAMES = new Set(
  ('sir madam madame customer customers resident residents patient patients member members friend friends colleague ' +
    'colleagues team all valued applicant applicants parent parents student students client clients user users ' +
    'subscriber subscribers policyholder neighbour neighbor tenant landlord shareholder shareholders reader readers ' +
    'manager the a an you your our this that sirs mam citizen citizens employee employees')
    .split(' '),
);

const HONORIFIC = String.raw`(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Shri|Smt|Sri|Kumari|Thiru|Tmt|Selvi)\.?`;
const NAME_WORDS = String.raw`(?:[A-Z]\.[ \t]?)*[A-Z][a-zA-Z'-]+(?:[ \t]+(?:[A-Z]\.[ \t]?)*[A-Z][a-zA-Z'-]+){0,3}`;
const ID_VALUE = String.raw`(?:[A-Z]{0,8}\d[\dA-Z/-]*)(?:\s(?:[A-Z]{0,8}\d[\dA-Z/-]*)){0,4}`;

const ACCOUNT_LABELS = new Set(['account', 'a/c', 'acct', 'iban', 'loan', 'folio']);

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

interface Span {
  start: number;
  end: number;
  kind: PiiKind;
  value: string;
}

export function detectPii(text: string): Span[] {
  const spans: Span[] = [];
  const free = (start: number, end: number) => spans.every((s) => end <= s.start || start >= s.end);
  const add = (start: number, value: string, kind: PiiKind) => {
    const trimmed = value.trim().replace(/[.,;:]+$/, '');
    if (trimmed.length < 2) return;
    const offset = start + value.indexOf(trimmed);
    if (free(offset, offset + trimmed.length)) spans.push({ start: offset, end: offset + trimmed.length, kind, value: trimmed });
  };

  // 1. Email and UPI addresses
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) add(m.index!, m[0], 'email');
  for (const m of text.matchAll(/\b[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}\b(?!\.[A-Za-z]|[@\w])/g)) add(m.index!, m[0], 'id');

  // 2. Labelled numbers: "Account No. 1234 5678", "Customer ID CUST1234", "Policy number: AB12/345"
  const label =
    /\b(account|a\/c|acct|customer|client|consumer|policy|reference|ref|membership|member|patient|card|folio|loan|application|registration|aadhaar|aadhar|pan|passport|licen[cs]e|employee|roll|invoice|order|ticket|case|claim|tracking|uhid|mrn|ssn|iban)\b/gi;
  for (const m of text.matchAll(label)) {
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 60);
    const v = new RegExp(String.raw`^\s*(?:(?:[Nn]o|NO|[Nn]umber|[Nn]um|I[Dd]|[Cc]ode)\b\.?)?\s*(?:is\s+)?[:#.\-–]?\s*(${ID_VALUE})`).exec(after);
    if (!v) continue;
    const value = v[1];
    if (value.replace(/\D/g, '').length < 4) continue;
    const kindLabel = m[1].toLowerCase();
    const kind: PiiKind = kindLabel === 'card' ? 'card' : ACCOUNT_LABELS.has(kindLabel) ? 'account' : 'id';
    add(m.index! + m[0].length + v.index + v[0].length - value.length, value, kind);
  }

  // 3. Unlabelled identifiers
  for (const m of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) add(m.index!, m[0], 'card');
  }
  for (const m of text.matchAll(/\b\d{4}[ -]\d{4}[ -]\d{4}\b/g)) add(m.index!, m[0], 'id'); // Aadhaar-style
  for (const m of text.matchAll(/\b[A-Z]{5}\d{4}[A-Z]\b/g)) add(m.index!, m[0], 'id'); // PAN
  for (const m of text.matchAll(/\b\d{3}-\d{2}-\d{4}\b/g)) add(m.index!, m[0], 'id'); // SSN
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g)) add(m.index!, m[0], 'account'); // IBAN

  // 4. Phone numbers (8-15 digits), but not amounts or dates
  for (const m of text.matchAll(/(?<![\w.,/:])(?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?(?:[\s-]\d{2,5}){1,4}(?![\w.,/:]\d)/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(m[0].trim()) || /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(m[0].trim())) continue;
    const before = text.slice(Math.max(0, m.index! - 4), m.index!);
    if (/(₹|rs\.?|inr|\$|£|€)\s*$/i.test(before)) continue;
    add(m.index!, m[0], 'phone');
  }
  for (const m of text.matchAll(/(?<![\w.,])\d{9,}(?![\w.,]\d)/g)) add(m.index!, m[0], 'account');

  // 5. Names: "Mr. Ramesh Kumar", "Dear Priya,", "Name: Asha Rao"
  for (const m of text.matchAll(new RegExp(String.raw`\b${HONORIFIC}[ \t]+(${NAME_WORDS})`, 'g'))) {
    add(m.index! + m[0].length - m[1].length, m[1], 'name');
  }
  for (const m of text.matchAll(new RegExp(String.raw`\bDear[ \t]+(?:${HONORIFIC}[ \t]+)?(${NAME_WORDS})[ \t]*[,:]`, 'g'))) {
    if (NOT_NAMES.has(m[1].split(/\s+/)[0].toLowerCase())) continue;
    add(m.index! + m[0].lastIndexOf(m[1]), m[1], 'name');
  }
  const nameLabel =
    /\b(name|full name|patient name|patient|tenant|landlord|lessee|lessor|customer name|account holder|applicant|beneficiary|insured|policy ?holder|guardian|borrower|recipient|attn|attention)\s*[:\-–]\s*/gi;
  for (const m of text.matchAll(nameLabel)) {
    const v = new RegExp(String.raw`^${NAME_WORDS}`).exec(text.slice(m.index! + m[0].length, m.index! + m[0].length + 60));
    if (!v || NOT_NAMES.has(v[0].split(/\s+/)[0].toLowerCase())) continue;
    add(m.index! + m[0].length, v[0], 'name');
  }

  // 6. Addresses: "Address: 12 Lake Road, Chennai" and labelled PIN / ZIP codes
  for (const m of text.matchAll(/\b(?:address|addr\.?)\s*[:\-–]\s*([^\n]{4,120})/gi)) add(m.index! + m[0].length - m[1].length, m[1], 'address');
  for (const m of text.matchAll(/\b(?:PIN|Pin ?code|PIN ?code|Postcode|Postal code|ZIP)\s*[:\-]?\s*(\d{3}\s?\d{3}|\d{5}(?:-\d{4})?)\b/gi)) {
    add(m.index! + m[0].length - m[1].length, m[1], 'address');
  }

  return spans.sort((a, b) => a.start - b.start);
}

function wholeWord(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
}

const TOKEN_RE = /\[\s*(NAME|PHONE|EMAIL|ACCOUNT|ID|CARD|ADDRESS)[\s_-]*(\d{1,3})\s*\]/gi;

export function buildShield(text: string): Shield {
  const byValue = new Map<string, ShieldEntry>();
  const counters: Partial<Record<PiiKind, number>> = {};
  for (const span of detectPii(text)) {
    if (byValue.has(span.value)) continue;
    const n = (counters[span.kind] = (counters[span.kind] ?? 0) + 1);
    byValue.set(span.value, { kind: span.kind, value: span.value, token: `[${TOKEN_LABEL[span.kind]}_${n}]` });
  }
  const entries = [...byValue.values()];
  const byToken = new Map(entries.map((e) => [e.token.slice(1, -1).toUpperCase(), e.value]));
  const longestFirst = [...entries].sort((a, b) => b.value.length - a.value.length);

  const restore = (t: string) =>
    t.replace(TOKEN_RE, (whole, kind: string, n: string) => byToken.get(`${kind.toUpperCase()}_${Number(n)}`) ?? whole);

  return {
    entries,
    mask(t: string) {
      let out = t;
      for (const e of longestFirst) out = out.replace(wholeWord(e.value), e.token);
      return out;
    },
    restore,
    restoreStreaming(t: string) {
      const restored = restore(t);
      const tail = /\[[A-Za-z_ -]{0,8}\d{0,3}$/.exec(restored);
      if (!tail) return restored;
      const letters = tail[0].slice(1).replace(/[\s_\-\d]/g, '').toUpperCase();
      const partial = letters === '' || Object.values(TOKEN_LABEL).some((label) => label.startsWith(letters));
      return partial ? restored.slice(0, tail.index) : restored;
    },
  };
}

/** "2 names, a phone number and an account number" */
export function describeEntries(entries: ShieldEntry[]): string {
  const counts = new Map<PiiKind, number>();
  for (const e of entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const parts = [...counts.entries()].map(([kind, n]) => {
    const [one, many] = KIND_WORDS[kind];
    if (n > 1) return `${n} ${many}`;
    return `${/^[aeiouAEIOU]|^ID/.test(one) ? 'an' : 'a'} ${one}`;
  });
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
