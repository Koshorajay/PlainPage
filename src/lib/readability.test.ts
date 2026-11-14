import { describe, expect, it } from 'vitest';
import { countSyllables, readingStats } from './readability';

describe('readability', () => {
  it('counts syllables well enough', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('water')).toBe(2);
    expect(countSyllables('beautiful')).toBe(3);
    expect(countSyllables('indemnification')).toBeGreaterThanOrEqual(5);
  });

  it('scores dense legal text much higher than plain text', () => {
    const dense =
      'Notwithstanding any provision to the contrary contained herein, the lessee shall indemnify and hold harmless the lessor from any and all liabilities, obligations, and expenditures arising from the aforementioned occupancy of the premises.';
    const plain = 'You must pay for any damage you cause. The owner does not pay for it. This rule is always true.';
    const a = readingStats(dense);
    const b = readingStats(plain);
    expect(a.grade).toBeGreaterThan(14);
    expect(b.grade).toBeLessThan(6);
    expect(a.sentenceLength).toBeGreaterThan(b.sentenceLength);
  });

  it('ignores headings, bullets and bold markers', () => {
    const stats = readingStats('## Rent\n\n- Pay **on time**.\n- Pay in full.');
    expect(stats.words).toBe(7);
    expect(stats.sentences).toBe(3);
  });

  it('handles empty text', () => {
    expect(readingStats('').words).toBe(0);
  });
});
