import type { Level } from '../types';

/** Reading preferences. Stored on the device and synced to Firestore. */
export interface Prefs {
  level: Level;
  language: string;
  font: 'atkinson' | 'lexend' | 'opendyslexic' | 'system';
  /** Reader text size in px. */
  size: number;
  lineHeight: number;
  /** Letter spacing in em. */
  letterSpacing: number;
  theme: 'cream' | 'white' | 'mint' | 'dark';
  ruler: boolean;
  privateMode: boolean;
  speechRate: number;
}

export const DEFAULT_PREFS: Prefs = {
  level: 'plain',
  language: 'en',
  font: 'atkinson',
  size: 19,
  lineHeight: 1.75,
  letterSpacing: 0.02,
  theme: 'cream',
  ruler: false,
  privateMode: false,
  speechRate: 0.95,
};

const KEY = 'plainpage.prefs.v1';

const FONTS: Prefs['font'][] = ['atkinson', 'lexend', 'opendyslexic', 'system'];
const THEMES: Prefs['theme'][] = ['cream', 'white', 'mint', 'dark'];
const LEVEL_IDS: Level[] = ['easy', 'plain', 'clear'];

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Accepts anything (old storage, Firestore data) and returns valid preferences. */
export function sanitizePrefs(input: unknown, base: Prefs = DEFAULT_PREFS): Prefs {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    level: LEVEL_IDS.includes(raw.level as Level) ? (raw.level as Level) : base.level,
    language: typeof raw.language === 'string' && raw.language.length <= 8 ? raw.language : base.language,
    font: FONTS.includes(raw.font as Prefs['font']) ? (raw.font as Prefs['font']) : base.font,
    size: num(raw.size, 15, 30, base.size),
    lineHeight: num(raw.lineHeight, 1.3, 2.4, base.lineHeight),
    letterSpacing: num(raw.letterSpacing, 0, 0.16, base.letterSpacing),
    theme: THEMES.includes(raw.theme as Prefs['theme']) ? (raw.theme as Prefs['theme']) : base.theme,
    ruler: typeof raw.ruler === 'boolean' ? raw.ruler : base.ruler,
    privateMode: typeof raw.privateMode === 'boolean' ? raw.privateMode : base.privateMode,
    speechRate: num(raw.speechRate, 0.6, 1.4, base.speechRate),
  };
}

export function loadLocalPrefs(): Prefs {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? sanitizePrefs(JSON.parse(stored)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveLocalPrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable (private windows); preferences then last for the session.
  }
}

export const FONT_STACKS: Record<Prefs['font'], string> = {
  atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
  lexend: '"Lexend", system-ui, sans-serif',
  opendyslexic: '"OpenDyslexic", "Atkinson Hyperlegible", system-ui, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};
