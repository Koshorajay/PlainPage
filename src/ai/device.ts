import type { DeviceStatus } from '../types';

/**
 * Reads the state of Chrome's built-in model so the UI can show it and the
 * router can plan around it. This only asks "is it there?" - every prompt
 * still goes through Firebase AI Logic (see engine.ts).
 */

interface LanguageModelGlobal {
  availability(options?: unknown): Promise<string>;
}

function languageModel(): LanguageModelGlobal | undefined {
  return (globalThis as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
}

export function hasPromptApi(): boolean {
  return Boolean(languageModel());
}

export async function getDeviceStatus(): Promise<DeviceStatus> {
  const lm = languageModel();
  if (!lm) return 'unavailable';
  try {
    const status = await lm.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    if (status === 'available' || status === 'downloadable' || status === 'downloading') return status;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
