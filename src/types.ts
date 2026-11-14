/** Reading levels PlainPage can rewrite to. */
export type Level = 'easy' | 'plain' | 'clear';

/** Where a piece of text was actually generated. */
export type Source = 'device' | 'cloud';

/** Availability of Chrome's built-in model, as reported by the Prompt API. */
export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export type SectionStatus = 'pending' | 'running' | 'done' | 'error';

export interface Section {
  index: number;
  original: string;
  simplified: string;
  status: SectionStatus;
  source?: Source;
  ms?: number;
  /** Set when the first attempt failed and the other side took over. */
  fallback?: string;
  error?: string;
}

export interface WordItem {
  term: string;
  meaning: string;
}

export interface SavedReading {
  id: string;
  title: string;
  sourceUrl?: string;
  level: Level;
  language: string;
  gist: string;
  simplified: string;
  deviceSections: number;
  cloudSections: number;
  gradeBefore?: number;
  gradeAfter?: number;
  createdAt: number;
}

export interface SavedWord {
  id: string;
  term: string;
  meaning: string;
  language: string;
  createdAt: number;
}

/** Text handed to the reader, wherever it came from. */
export interface SourceDoc {
  title: string;
  text: string;
  url?: string;
}
