import type { Level } from './types';

/**
 * Values that steer the hybrid router and the prompts.
 * Defaults live here; Firebase Remote Config can override every one of them
 * without shipping a new build (see src/firebase/remoteConfig.ts).
 */
export interface RuntimeConfig {
  /** Cloud model used for fallback and for long pages. Must be a no-billing model to stay free. */
  cloudModel: string;
  /** Pages longer than this many characters are sent to the cloud model. */
  deviceMaxChars: number;
  /** Size of the pieces the on-device model rewrites, in characters. */
  deviceChunkChars: number;
  /** Size of the pieces the cloud model rewrites, in characters. */
  cloudChunkChars: number;
  /** Languages the on-device model can write. Anything else needs the cloud. */
  deviceLanguages: string[];
  /** Turns the "Words to know" list (structured output) on or off. */
  wordsEnabled: boolean;
  /** Extra line appended to the system prompt, for tuning tone remotely. */
  styleGuidance: string;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  cloudModel: 'gemini-3.5-flash-lite',
  deviceMaxChars: 14000,
  deviceChunkChars: 2800,
  cloudChunkChars: 20000,
  deviceLanguages: ['en', 'es', 'ja'],
  wordsEnabled: true,
  styleGuidance: '',
};

export interface LanguageOption {
  code: string;
  /** English name, used inside prompts. */
  name: string;
  /** Name in its own script, shown in the UI. */
  native: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'zh', name: 'Chinese', native: '中文' },
];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? 'English';
}

export function languageNative(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? code;
}

export interface LevelOption {
  id: Level;
  label: string;
  hint: string;
}

export const LEVELS: LevelOption[] = [
  { id: 'easy', label: 'Easy', hint: 'Very short sentences, everyday words' },
  { id: 'plain', label: 'Plain', hint: 'Clear and simple, keeps more detail' },
  { id: 'clear', label: 'Clear', hint: 'Full detail, no jargon' },
];
