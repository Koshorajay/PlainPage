/**
 * Splits a page into pieces small enough for the model that will rewrite them.
 *
 * The on-device model has a small context window, so it gets small pieces and
 * the reader sees text appear section by section. The cloud model gets big pieces.
 * Pieces always break on paragraph or sentence boundaries, never mid-sentence,
 * and a heading always travels with the text that follows it.
 */

export interface Chunk {
  index: number;
  text: string;
}

/** Tidies raw pasted or extracted text without changing its meaning. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isHeading(block: string): boolean {
  return /^#{1,6}\s/.test(block);
}

/** Sentence splitter that keeps the punctuation with its sentence. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?。！？\n]+(?:[.!?。！？]+["'”’)\]]*|\n|$)\s*/g);
  if (!parts) return text.trim() ? [text.trim()] : [];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Breaks one oversized block into pieces no longer than maxChars. */
function splitOversized(block: string, maxChars: number): string[] {
  const out: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = '';
  };

  for (const sentence of splitSentences(block)) {
    if (sentence.length > maxChars) {
      // A single sentence longer than the budget: fall back to breaking on spaces.
      push();
      let rest = sentence;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut < maxChars * 0.5) cut = maxChars;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      current = rest;
      continue;
    }
    if (current && current.length + 1 + sentence.length > maxChars) push();
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();
  return out;
}

export function chunkText(raw: string, maxChars: number): Chunk[] {
  const text = normalizeText(raw);
  if (!text) return [];
  const budget = Math.max(200, Math.floor(maxChars));

  const blocks: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.length > budget) blocks.push(...splitOversized(trimmed, budget));
    else blocks.push(trimmed);
  }

  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;

  const flush = () => {
    if (current.length) chunks.push(current);
    current = [];
    size = 0;
  };

  for (const block of blocks) {
    const added = size === 0 ? block.length : size + 2 + block.length;
    if (current.length && added > budget) {
      // Never leave a heading stranded at the end of a piece.
      const last = current[current.length - 1];
      const carry = current.length > 1 && isHeading(last) ? current.pop() : undefined;
      flush();
      if (carry) {
        current.push(carry);
        size = carry.length;
      }
    }
    current.push(block);
    size = size === 0 ? block.length : size + 2 + block.length;
  }
  flush();

  return chunks.map((parts, index) => ({ index, text: parts.join('\n\n') }));
}

export function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}
