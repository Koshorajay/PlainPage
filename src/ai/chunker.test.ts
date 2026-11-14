import { describe, expect, it } from 'vitest';
import { chunkText, countWords, normalizeText, splitSentences } from './chunker';

const sentence = 'The tenant must pay the rent on the first day of every month.';
const paragraph = (n: number) => Array.from({ length: n }, () => sentence).join(' ');

describe('chunkText', () => {
  it('returns nothing for empty text', () => {
    expect(chunkText('   \n\n  ', 1000)).toEqual([]);
  });

  it('keeps a short page in one piece', () => {
    const chunks = chunkText('Hello there.\n\nThis is short.', 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('Hello there.\n\nThis is short.');
  });

  it('never exceeds the budget and never loses text', () => {
    const text = [paragraph(6), paragraph(9), paragraph(4), paragraph(12)].join('\n\n');
    const chunks = chunkText(text, 500);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(500);
    expect(countWords(chunks.map((c) => c.text).join(' '))).toBe(countWords(text));
  });

  it('breaks oversized paragraphs between sentences, not inside them', () => {
    const chunks = chunkText(paragraph(30), 300);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith('The tenant')).toBe(true);
      expect(chunk.text.endsWith('month.')).toBe(true);
    }
  });

  it('keeps a heading with the text that follows it', () => {
    const text = [paragraph(7), '## Paying the rent', paragraph(7)].join('\n\n');
    const chunks = chunkText(text, 520);
    const withHeading = chunks.find((c) => c.text.includes('## Paying the rent'));
    expect(withHeading).toBeDefined();
    expect(withHeading!.text.startsWith('## Paying the rent')).toBe(true);
    expect(withHeading!.text.length).toBeGreaterThan('## Paying the rent'.length + 10);
  });

  it('splits a single enormous sentence on spaces as a last resort', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkText(long, 250);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(250);
    expect(countWords(chunks.map((c) => c.text).join(' '))).toBe(400);
  });

  it('numbers pieces in order', () => {
    const chunks = chunkText([paragraph(8), paragraph(8), paragraph(8)].join('\n\n'), 400);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
});

describe('helpers', () => {
  it('normalises line endings and extra blank lines', () => {
    expect(normalizeText('a\r\n\r\n\r\n\r\nb  \n')).toBe('a\n\nb');
  });

  it('splits sentences and keeps their punctuation', () => {
    expect(splitSentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!']);
  });
});
