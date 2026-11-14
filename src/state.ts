import type { EngineEvent, StepStatus } from './ai/engine';
import type { RouteDecision } from './ai/router';
import type { Level, SavedReading, Section, Source, SourceDoc, WordItem } from './types';

/** Everything the reader screen shows for one page. */
export interface Reading {
  doc: SourceDoc;
  level: Level;
  language: string;
  privateMode: boolean;
  decision: RouteDecision | null;
  sections: Section[];
  gist: { status: StepStatus; text: string; source?: Source };
  words: { status: StepStatus; items: WordItem[]; source?: Source };
  status: 'running' | 'done' | 'stopped' | 'error';
  error?: string;
  startedAt: number;
  finishedAt?: number;
  /** True if any of the page's text was sent, or may have been sent, to the cloud. */
  leftDevice?: boolean;
  /** Set when this reading was opened from the saved library. */
  saved?: SavedReading;
}

export type ReadingAction =
  | { type: 'start'; doc: SourceDoc; level: Level; language: string; privateMode: boolean }
  | { type: 'engine'; event: EngineEvent }
  | { type: 'fail'; error: string }
  | { type: 'open-saved'; saved: SavedReading }
  | { type: 'mark-saved'; saved: SavedReading }
  | { type: 'clear' };

export function readingReducer(state: Reading | null, action: ReadingAction): Reading | null {
  switch (action.type) {
    case 'start':
      return {
        doc: action.doc,
        level: action.level,
        language: action.language,
        privateMode: action.privateMode,
        decision: null,
        sections: [],
        gist: { status: 'idle', text: '' },
        words: { status: 'idle', items: [] },
        status: 'running',
        startedAt: Date.now(),
      };

    case 'open-saved': {
      const saved = action.saved;
      return {
        doc: { title: saved.title, text: '', url: saved.sourceUrl },
        level: saved.level,
        language: saved.language,
        privateMode: false,
        decision: null,
        sections: [{ index: 0, original: '', simplified: saved.simplified, status: 'done' }],
        gist: { status: saved.gist ? 'done' : 'idle', text: saved.gist },
        words: { status: 'idle', items: [] },
        status: 'done',
        startedAt: saved.createdAt,
        finishedAt: saved.createdAt,
        saved,
      };
    }

    case 'mark-saved':
      return state ? { ...state, saved: action.saved } : state;

    case 'fail':
      return state ? { ...state, status: 'error', error: action.error, finishedAt: Date.now() } : state;

    case 'clear':
      return null;

    case 'engine': {
      if (!state) return state;
      const event = action.event;
      switch (event.type) {
        case 'plan':
          return { ...state, decision: event.decision, sections: event.sections };
        case 'section':
          return {
            ...state,
            sections: state.sections.map((s) => (s.index === event.index ? { ...s, ...event.patch } : s)),
          };
        case 'gist':
          return {
            ...state,
            gist: { status: event.status, text: event.text ?? state.gist.text, source: event.source ?? state.gist.source },
          };
        case 'words':
          return {
            ...state,
            words: { status: event.status, items: event.items ?? state.words.items, source: event.source },
          };
        case 'done':
          return {
            ...state,
            status: event.stopped ? 'stopped' : 'done',
            finishedAt: Date.now(),
            leftDevice: event.leftDevice,
          };
      }
    }
  }
}

export interface Tally {
  total: number;
  done: number;
  device: number;
  cloud: number;
  failed: number;
  fallbacks: number;
}

export function tally(sections: Section[]): Tally {
  const finished = sections.filter((s) => s.status === 'done');
  return {
    total: sections.length,
    done: finished.length,
    device: finished.filter((s) => s.source === 'device').length,
    cloud: finished.filter((s) => s.source === 'cloud').length,
    failed: sections.filter((s) => s.status === 'error').length,
    fallbacks: finished.filter((s) => s.fallback).length,
  };
}

export function simplifiedText(sections: Section[]): string {
  return sections
    .map((s) => s.simplified.trim())
    .filter(Boolean)
    .join('\n\n');
}
