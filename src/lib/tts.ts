/**
 * Read-aloud using the browser's built-in speech (Web Speech API).
 * It is free, needs no network with local voices, and keeps the page private.
 * Text is spoken one block at a time so the reader can highlight where it is.
 */

export interface Speaker {
  stop(): void;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(language: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.filter((v) => v.lang.toLowerCase().startsWith(language.toLowerCase()));
  // Prefer a voice that runs on the device.
  return exact.find((v) => v.localService) ?? exact[0];
}

export function speakBlocks(
  blocks: string[],
  options: { language: string; rate: number; onBlock: (index: number) => void; onEnd: () => void },
): Speaker {
  const synth = window.speechSynthesis;
  let stopped = false;
  let index = 0;
  synth.cancel();

  const next = () => {
    if (stopped) return;
    if (index >= blocks.length) {
      options.onEnd();
      return;
    }
    const current = index++;
    const text = blocks[current].replace(/\*\*/g, '').replace(/^#{1,6}\s+/, '').replace(/^\s*-\s+/gm, '');
    if (!text.trim()) {
      next();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.language;
    utterance.rate = options.rate;
    const voice = pickVoice(options.language);
    if (voice) utterance.voice = voice;
    utterance.onend = next;
    utterance.onerror = () => {
      if (!stopped) next();
    };
    options.onBlock(current);
    synth.speak(utterance);
  };

  next();

  return {
    stop() {
      stopped = true;
      synth.cancel();
    },
  };
}
