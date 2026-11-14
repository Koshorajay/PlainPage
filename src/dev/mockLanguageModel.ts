/**
 * DEVELOPMENT TEST HARNESS - never part of a production build.
 *
 * `npm run dev` then open http://localhost:5173/?mock
 *
 * Installs a stand-in for Chrome's `LanguageModel` (the Prompt API) so the
 * whole app - including the real Firebase AI Logic hybrid code path - can be
 * exercised on a machine that has no on-device model and no Firebase project.
 * The "rewrite" it produces is a crude rule-based shortening, clearly not AI.
 */

interface Message {
  role: string;
  content: Array<{ type: string; value: unknown }> | string;
}

function textOf(messages: Message[] | string): string {
  if (typeof messages === 'string') return messages;
  return messages
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((c) => String(c.value)).join(' ')))
    .join('\n');
}

function between(prompt: string): string {
  const match = prompt.match(/"""\n([\s\S]*?)\n"""/);
  return match ? match[1] : prompt;
}

function shorten(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      if (/^#{1,6}\s/.test(block) || /^- /.test(block)) return block;
      return (block.match(/[^.!?]+[.!?]+/g) ?? [block])
        .map((s) => s.trim())
        .flatMap((s) => (s.split(' ').length > 16 ? s.split(/,\s+|;\s+|\s+and\s+/).map((p) => p.trim()) : [s]))
        .filter((s) => s.length > 2)
        .map((s) => {
          const out = s.charAt(0).toUpperCase() + s.slice(1);
          return /[.!?]$/.test(out) ? out : `${out}.`;
        })
        .join(' ');
    })
    .join('\n\n');
}

function answer(system: string, prompt: string, constrained: boolean): string {
  const body = between(prompt);
  if (constrained) {
    const terms = Array.from(new Set(body.match(/\b[A-Za-z]{11,}\b/g) ?? [])).slice(0, 5);
    return JSON.stringify({ words: terms.map((term) => ({ term, meaning: `a simpler way to say "${term.toLowerCase()}" (mock)` })) });
  }
  if (/3 most important points/.test(prompt)) {
    const lines = (body.replace(/^#.*$/gm, '').match(/[^.!?\n]+[.!?]/g) ?? [body]).slice(0, 3);
    return lines.map((line) => `- ${line.trim().split(' ').slice(0, 14).join(' ')}`).join('\n');
  }
  const term = prompt.match(/^Explain "(.+?)"/);
  if (term) return `"${term[1]}" is a word from this text. This is a mock explanation from the development harness.`;
  void system;
  return shorten(body);
}

export function installMockLanguageModel(delayMs = 14): void {
  const create = async (options?: { initialPrompts?: Message[] }) => {
    const system = options?.initialPrompts ? textOf(options.initialPrompts) : '';
    return {
      async prompt(messages: Message[] | string, opts?: { responseConstraint?: object }) {
        await new Promise((r) => setTimeout(r, 300));
        return answer(system, textOf(messages), Boolean(opts?.responseConstraint));
      },
      promptStreaming(messages: Message[] | string, opts?: { responseConstraint?: object }) {
        const words = answer(system, textOf(messages), Boolean(opts?.responseConstraint)).split(/(?<=\s)/);
        let i = 0;
        return new ReadableStream<string>({
          async pull(controller) {
            if (i >= words.length) {
              controller.close();
              return;
            }
            await new Promise((r) => setTimeout(r, delayMs));
            controller.enqueue(words.slice(i, i + 3).join(''));
            i += 3;
          },
        });
      },
      destroy() {},
    };
  };

  (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
    availability: async () => 'available',
    create,
  };
  console.info('[PlainPage] Development mock of the on-device model is active (?mock).');
}
