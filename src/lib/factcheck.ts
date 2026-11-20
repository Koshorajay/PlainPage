/**
 * Fact check: after a rewrite, make sure every number, amount, date, time and
 * phone number from the original is still in the plain version.
 *
 * Plain-language rewriting is most valuable for exactly the texts where a lost
 * detail does harm (a dose, a deadline, an amount), so PlainPage checks this
 * deterministically, on the device, with no AI. Formats may change ("10:00 PM"
 * may become "10 pm", "thirty (30) days" may become "30 days") without being
 * reported; a detail that disappears is listed for the reader to check.
 */

export interface Fact {
  key: string;
  /** The detail as written in the original. */
  display: string;
  /** A few words around it, so the reader can find it. */
  context: string;
}

export interface FactReport {
  total: number;
  kept: number;
  missing: Fact[];
  /** Day and month names are only compared when both texts are English. */
  checkedNames: boolean;
}

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december'];

const NUMBER_WORD = new RegExp(
  `\\b(?:(${TENS.slice(2).join('|')})(?:[\\s-](${UNITS.slice(1, 10).join('|')}))?|(${UNITS.join('|')}))\\b`,
  'gi',
);

/** Digits from other scripts (Devanagari, Bengali, Tamil, Telugu, Arabic, full-width) become 0-9. */
export function asciiDigits(text: string): string {
  return text.replace(/[०-९০-৯௦-௯౦-౯٠-٩۰-۹０-９]/g, (ch) => {
    const code = ch.charCodeAt(0);
    for (const start of [0x0966, 0x09e6, 0x0be6, 0x0c66, 0x0660, 0x06f0, 0xff10]) {
      if (code >= start && code <= start + 9) return String(code - start);
    }
    return ch;
  });
}

function numberWordValue(tens?: string, unit?: string, single?: string): number {
  if (single) return UNITS.indexOf(single.toLowerCase());
  return TENS.indexOf((tens ?? '').toLowerCase()) * 10 + (unit ? UNITS.indexOf(unit.toLowerCase()) : 0);
}

function normalizeNumber(raw: string): string {
  const clean = raw.replace(/,(?=\d)/g, '');
  const n = Number(clean);
  return Number.isFinite(n) ? String(n) : clean;
}

function contextAt(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, index - 40)));
  const end = text.indexOf(' ', Math.min(text.length, index + length + 40));
  const snippet = text.slice(start, end === -1 ? text.length : end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '...' : ''}${snippet}${end !== -1 && end < text.length ? '...' : ''}`;
}

const PHONE = /(?<![\w.,/:])(?:\+\d{1,3}[\s-]?)?\(?\d{2,5}\)?(?:[\s-]\d{2,5}){1,4}(?![\w.,/:]\d)/g;
const TIME_12 = /\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b\.?/gi;
const TIME_24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
const NUMBER = /(?<![\w.])\d+(?:,\d{2,3})*(?:\.\d+)?(?:st|nd|rd|th)?(?![\w])|(?<![\w.])\d+(?:,\d{2,3})*(?:\.\d+)?(?=%)/g;

function isDateLike(s: string): boolean {
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) || /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s);
}

interface Found {
  key: string;
  display: string;
  index: number;
}

/**
 * Finds the facts in a text. `wordsFromOne`: whether the word "one" counts as
 * a number (yes in the rewrite, so "one tablet" matches "1 tablet"; no in the
 * original, where "one" is usually just "a").
 */
export function findFacts(raw: string, opts: { names: boolean; wordsFromOne: boolean }): Found[] {
  const text = asciiDigits(raw);
  const taken: [number, number][] = [];
  const found: Found[] = [];
  const free = (start: number, end: number) => taken.every(([s, e]) => end <= s || start >= e);
  const add = (key: string, display: string, index: number, length: number) => {
    taken.push([index, index + length]);
    found.push({ key, display, index });
  };

  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15 || isDateLike(m[0].trim())) continue;
    add(`P${digits}`, m[0].trim(), m.index!, m[0].length);
  }
  for (const m of text.matchAll(TIME_12)) {
    if (!free(m.index!, m.index! + m[0].length)) continue;
    let hour = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'p') hour += 12;
    add(`T${hour}:${m[2] ?? '00'}`, m[0].trim(), m.index!, m[0].length);
  }
  for (const m of text.matchAll(TIME_24)) {
    if (!free(m.index!, m.index! + m[0].length)) continue;
    add(`T${Number(m[1])}:${m[2]}`, m[0], m.index!, m[0].length);
  }
  for (const m of text.matchAll(/\b(noon|midday|midnight)\b/gi)) {
    add(m[1].toLowerCase() === 'midnight' ? 'T0:00' : 'T12:00', m[0], m.index!, m[0].length);
  }
  for (const m of text.matchAll(NUMBER)) {
    if (!free(m.index!, m.index! + m[0].length)) continue;
    add(`N${normalizeNumber(m[0].replace(/(st|nd|rd|th)$/i, ''))}`, m[0], m.index!, m[0].length);
  }
  for (const m of text.matchAll(NUMBER_WORD)) {
    if (!free(m.index!, m.index! + m[0].length)) continue;
    const value = numberWordValue(m[1], m[2], m[3]);
    if (value < 0 || (!opts.wordsFromOne && value <= 1)) continue;
    add(`N${value}`, m[0], m.index!, m[0].length);
  }
  if (opts.names) {
    for (const m of text.matchAll(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi)) {
      add(`W${m[1].toLowerCase()}`, m[0], m.index!, m[0].length);
    }
    for (const m of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi)) {
      const month = m[1].toLowerCase();
      // "may" is usually the verb: only count it next to a number.
      if (month === 'may') {
        const around = text.slice(Math.max(0, m.index! - 4), m.index! + m[0].length + 5);
        if (!/\d/.test(around)) continue;
      }
      add(`M${month}`, m[0], m.index!, m[0].length);
    }
  }
  return found;
}

function keySet(text: string, names: boolean): Set<string> {
  const keys = new Set<string>();
  for (const f of findFacts(text, { names, wordsFromOne: true })) {
    keys.add(f.key);
    // A numeric date may be written with the month's name ("10" -> "October").
    if (f.key.startsWith('M')) keys.add(`N${MONTHS.indexOf(f.key.slice(1)) + 1}`);
    // Phone numbers split into groups still count if the groups are kept.
    if (f.key.startsWith('P')) for (const group of f.display.split(/[\s()-]+/)) if (group) keys.add(`N${Number(group)}`);
  }
  // A phone number written with different spacing ("1800-555-0142" vs "1800 555 0142").
  keys.add(`ALL${asciiDigits(text).replace(/\D/g, '')}`);
  return keys;
}

export function checkFacts(original: string, rewrite: string, opts: { english: boolean }): FactReport {
  const facts = findFacts(original, { names: opts.english, wordsFromOne: false });
  const keys = keySet(rewrite, opts.english);
  const allDigits = [...keys].find((k) => k.startsWith('ALL'))?.slice(3) ?? '';
  const unique = new Map<string, Fact>();
  for (const f of facts) {
    if (unique.has(f.key)) continue;
    unique.set(f.key, { key: f.key, display: f.display, context: contextAt(asciiDigits(original), f.index, f.display.length) });
  }
  const missing: Fact[] = [];
  for (const fact of unique.values()) {
    const kept =
      keys.has(fact.key) ||
      (fact.key.startsWith('P') && allDigits.includes(fact.key.slice(1))) ||
      (fact.key.startsWith('N') && keys.has(`P${fact.key.slice(1)}`));
    if (!kept) missing.push(fact);
  }
  return { total: unique.size, kept: unique.size - missing.length, missing, checkedNames: opts.english };
}

/** Adds up per-section reports. */
export function mergeReports(reports: FactReport[]): FactReport {
  return reports.reduce<FactReport>(
    (acc, r) => ({
      total: acc.total + r.total,
      kept: acc.kept + r.kept,
      missing: [...acc.missing, ...r.missing],
      checkedNames: acc.checkedNames && r.checkedNames,
    }),
    { total: 0, kept: 0, missing: [], checkedNames: true },
  );
}

