/**
 * A small, local readability meter (no AI): Flesch-Kincaid grade level.
 * It lets PlainPage show the reader "Grade 14 -> Grade 6" as proof that the
 * rewrite really is easier. The formula is designed for English.
 */

export interface ReadingStats {
  words: number;
  sentences: number;
  /** Average words per sentence. */
  sentenceLength: number;
  /** Approximate school grade needed to read the text. English only. */
  grade: number;
}

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Strips the light markup PlainPage uses so it does not count as words. */
function plain(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*/g, '');
}

export function readingStats(text: string): ReadingStats {
  const clean = plain(text);
  const words = clean.match(/[A-Za-z0-9À-ɏ'’-]+/g) ?? [];
  // Bullets and headings usually have no full stop: count each line end as a sentence end.
  const sentenceCount = clean
    .split(/[.!?]+(?:\s|$)|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z0-9]/.test(s)).length;
  const sentences = Math.max(1, sentenceCount);
  if (words.length === 0) return { words: 0, sentences: 0, sentenceLength: 0, grade: 0 };

  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const sentenceLength = words.length / sentences;
  const grade = 0.39 * sentenceLength + 11.8 * (syllables / words.length) - 15.59;

  return {
    words: words.length,
    sentences,
    sentenceLength: Math.round(sentenceLength * 10) / 10,
    grade: Math.max(0, Math.round(grade * 10) / 10),
  };
}

/** Minutes to read at a comfortable pace for someone who finds reading hard. */
export function readingMinutes(words: number, wordsPerMinute = 150): number {
  return Math.max(1, Math.round(words / wordsPerMinute));
}
