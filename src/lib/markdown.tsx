import type { ReactNode } from 'react';

/**
 * PlainPage asks the models for a tiny subset of Markdown: "## " headings,
 * "- " bullets and **bold**. This renders exactly that subset as React
 * elements. Model output is never injected as HTML.
 */

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: heading[1].replace(/\*\*/g, '') });
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d{1,2}[.)])\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Plain text of a block, for read-aloud and copying. */
export function blockText(block: Block): string {
  if (block.type === 'list') return block.items.join('. ');
  return block.text;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function Blocks(props: { blocks: Block[]; keyPrefix: string; speakingKey?: string | null }) {
  return (
    <>
      {props.blocks.map((block, i) => {
        const key = `${props.keyPrefix}:${i}`;
        const className = props.speakingKey === key ? 'is-speaking' : undefined;
        if (block.type === 'heading') {
          return (
            <h3 key={key} data-block={key} className={className} dir="auto">
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={key} data-block={key} className={className} dir="auto">
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={key} data-block={key} className={className} dir="auto">
            {inline(block.text)}
          </p>
        );
      })}
    </>
  );
}
