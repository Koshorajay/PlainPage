import { describe, expect, it } from 'vitest';
import { asciiDigits, checkFacts } from './factcheck';

const en = { english: true };

describe('checkFacts', () => {
  it('accepts a faithful rewrite even when formats change', () => {
    const original =
      'Pay a deposit of two (2) months\' rent. The water supply shall be suspended from 10:00 PM on Friday until 6:00 AM on Sunday. Repairs not exceeding 1,500 rupees. Call 1800 555 0142 before Thursday. Do not exceed three tablets within any twenty-four hour period.';
    const rewrite =
      'Pay a deposit of 2 months of rent. The water will be off from 10 pm on Friday until 6 am on Sunday. You pay for repairs up to 1500 rupees. Call 1800-555-0142 before Thursday. Take no more than 3 tablets in 24 hours.';
    const report = checkFacts(original, rewrite, en);
    expect(report.missing.map((m) => m.display)).toEqual([]);
    expect(report.total).toBeGreaterThan(6);
    expect(report.kept).toBe(report.total);
  });

  it('flags a deadline, an amount and a day that went missing', () => {
    const original = 'Pay ₹2,450 by 30 November 2026. Late fee: ₹500. The office is open on Saturday.';
    const rewrite = 'Pay the money soon. There is a late fee of ₹500. The office is open on weekends.';
    const missing = checkFacts(original, rewrite, en).missing.map((m) => m.display);
    expect(missing).toEqual(expect.arrayContaining(['2,450', '30', 'November', '2026', 'Saturday']));
    expect(missing).not.toContain('500');
  });

  it('gives the reader context for each missing detail', () => {
    const report = checkFacts('Take one 500 mg tablet every eight hours after food.', 'Take one tablet after food.', en);
    expect(report.missing.map((m) => m.display)).toEqual(['500', 'eight']);
    expect(report.missing[0].context).toContain('500 mg');
  });

  it('does not count "one" in the original, but matches digits written as words in the rewrite', () => {
    expect(checkFacts('Take one tablet.', 'Take a tablet.', en).total).toBe(0);
    expect(checkFacts('Take 1 tablet and 2 spoons.', 'Take one tablet and two spoons.', en).missing).toEqual([]);
  });

  it('matches a numeric month written as a name', () => {
    expect(checkFacts('Due on 15/10/2026.', 'Due on 15 October 2026.', en).missing).toEqual([]);
  });

  it('handles digits from other scripts and skips day names for other languages', () => {
    expect(asciiDigits('२०२६ ௩௦')).toBe('2026 30');
    const report = checkFacts('Pay 500 rupees on Friday.', 'வெள்ளிக்கிழமை ५०० ரூபாய் செலுத்துங்கள்.', { english: false });
    expect(report.missing).toEqual([]);
    expect(report.checkedNames).toBe(false);
  });

  it('treats noon and midnight as times', () => {
    expect(checkFacts('Closes at 12:00 PM.', 'Closes at noon.', en).missing).toEqual([]);
  });
});
