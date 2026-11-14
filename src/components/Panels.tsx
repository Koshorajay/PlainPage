import { useEffect, useState, type ReactNode } from 'react';
import { languageNative, LEVELS } from '../config';
import { HAS_CLOUD } from '../firebase/app';
import {
  deleteReading,
  deleteWord,
  signInWithGoogle,
  signOutUser,
  watchReadings,
  watchWords,
  type Account,
} from '../firebase/store';
import { FONT_STACKS, type Prefs } from '../lib/prefs';
import { IS_EXTENSION } from '../platform';
import type { SavedReading, SavedWord } from '../types';
import { CloseIcon, TrashIcon } from './icons';

function Drawer(props: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  return (
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={props.onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={props.title}>
        <div className="drawer-head">
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="drawer-body">{props.children}</div>
      </aside>
    </div>
  );
}

// ---------- Display settings ----------

const FONT_OPTIONS: { id: Prefs['font']; label: string }[] = [
  { id: 'atkinson', label: 'Atkinson Hyperlegible' },
  { id: 'lexend', label: 'Lexend' },
  { id: 'opendyslexic', label: 'OpenDyslexic' },
  { id: 'system', label: 'System font' },
];

const THEME_OPTIONS: { id: Prefs['theme']; label: string }[] = [
  { id: 'cream', label: 'Cream' },
  { id: 'white', label: 'White' },
  { id: 'mint', label: 'Mint' },
  { id: 'dark', label: 'Dark' },
];

function Slider(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider">
      <div className="slider-head">
        <label htmlFor={props.id}>{props.label}</label>
        <span>{props.display}</span>
      </div>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function DisplayPanel(props: { prefs: Prefs; onPrefs: (patch: Partial<Prefs>) => void; onClose: () => void }) {
  const { prefs, onPrefs } = props;
  return (
    <Drawer title="Display" onClose={props.onClose}>
      <p className="drawer-intro">Set the page up the way your eyes like it. Your choices are remembered.</p>

      <div
        className="preview"
        style={{
          fontFamily: FONT_STACKS[prefs.font],
          fontSize: `${prefs.size}px`,
          lineHeight: prefs.lineHeight,
          letterSpacing: `${prefs.letterSpacing}em`,
          wordSpacing: `${prefs.letterSpacing * 3}em`,
        }}
      >
        Reading should feel easy. Short lines, clear letters and enough space make a big difference.
      </div>

      <h3 className="drawer-label">Font</h3>
      <div className="choices">
        {FONT_OPTIONS.map((font) => (
          <button
            key={font.id}
            className={`choice ${prefs.font === font.id ? 'is-active' : ''}`}
            style={{ fontFamily: FONT_STACKS[font.id] }}
            aria-pressed={prefs.font === font.id}
            onClick={() => onPrefs({ font: font.id })}
          >
            {font.label}
          </button>
        ))}
      </div>

      <Slider
        id="size"
        label="Text size"
        value={prefs.size}
        min={15}
        max={30}
        step={1}
        display={`${prefs.size} px`}
        onChange={(size) => onPrefs({ size })}
      />
      <Slider
        id="line"
        label="Line spacing"
        value={prefs.lineHeight}
        min={1.3}
        max={2.4}
        step={0.05}
        display={prefs.lineHeight.toFixed(2)}
        onChange={(lineHeight) => onPrefs({ lineHeight })}
      />
      <Slider
        id="letter"
        label="Letter spacing"
        value={prefs.letterSpacing}
        min={0}
        max={0.16}
        step={0.01}
        display={prefs.letterSpacing === 0 ? 'Normal' : `+${Math.round(prefs.letterSpacing * 100)}%`}
        onChange={(letterSpacing) => onPrefs({ letterSpacing })}
      />

      <h3 className="drawer-label">Background</h3>
      <div className="swatches">
        {THEME_OPTIONS.map((theme) => (
          <button
            key={theme.id}
            className={`swatch swatch--${theme.id} ${prefs.theme === theme.id ? 'is-active' : ''}`}
            aria-pressed={prefs.theme === theme.id}
            onClick={() => onPrefs({ theme: theme.id })}
          >
            <span className="swatch-dot" />
            {theme.label}
          </button>
        ))}
      </div>

      <label className="check">
        <input type="checkbox" checked={prefs.ruler} onChange={(e) => onPrefs({ ruler: e.target.checked })} />
        <span>
          <strong>Reading ruler</strong>
          <small>A soft band follows your pointer to keep your place.</small>
        </span>
      </label>

      <Slider
        id="rate"
        label="Read-aloud speed"
        value={prefs.speechRate}
        min={0.6}
        max={1.4}
        step={0.05}
        display={`${prefs.speechRate.toFixed(2)}x`}
        onChange={(speechRate) => onPrefs({ speechRate })}
      />
    </Drawer>
  );
}

// ---------- Library ----------

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function LibraryPanel(props: {
  account: Account | null;
  onOpen: (reading: SavedReading) => void;
  onClose: () => void;
}) {
  const { account } = props;
  const [tab, setTab] = useState<'readings' | 'words'>('readings');
  const [readings, setReadings] = useState<SavedReading[] | null>(null);
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const uid = account?.uid;

  useEffect(() => {
    if (!uid) return;
    const stopReadings = watchReadings(uid, setReadings);
    const stopWords = watchWords(uid, setWords);
    return () => {
      stopReadings();
      stopWords();
    };
  }, [uid]);

  const google = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code.includes('popup-closed') || code.includes('cancelled')) return;
      setAuthError('Google sign-in did not work. Check that the Google provider is enabled in Firebase.');
    }
  };

  return (
    <Drawer title="Library" onClose={props.onClose}>
      {!HAS_CLOUD ? (
        <p className="drawer-intro">The library needs a Firebase project. See the setup steps in the README.</p>
      ) : !account ? (
        <p className="drawer-intro">Connecting to your library...</p>
      ) : (
        <>
          <div className="account">
            {account.anonymous ? (
              <>
                <p>
                  Your library is saved under a guest account on this browser.
                  {!IS_EXTENSION && ' Sign in to keep it and see it on your other devices.'}
                </p>
                {!IS_EXTENSION && (
                  <button className="btn btn--ghost btn--small" onClick={() => void google()}>
                    Sign in with Google
                  </button>
                )}
              </>
            ) : (
              <>
                <p>
                  Signed in as <strong>{account.name || account.email}</strong>. Your library syncs across devices.
                </p>
                <button className="btn btn--ghost btn--small" onClick={() => void signOutUser()}>
                  Sign out
                </button>
              </>
            )}
            {authError && <p className="popover-error">{authError}</p>}
          </div>

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'readings'} className={tab === 'readings' ? 'is-active' : ''} onClick={() => setTab('readings')}>
              Saved pages{readings ? ` (${readings.length})` : ''}
            </button>
            <button role="tab" aria-selected={tab === 'words'} className={tab === 'words' ? 'is-active' : ''} onClick={() => setTab('words')}>
              My words{words ? ` (${words.length})` : ''}
            </button>
          </div>

          {tab === 'readings' &&
            (readings === null ? (
              <p className="empty">Loading...</p>
            ) : readings.length === 0 ? (
              <p className="empty">Nothing saved yet. When a page is ready, press Save to keep it here.</p>
            ) : (
              <ul className="list">
                {readings.map((reading) => (
                  <li key={reading.id}>
                    <button className="list-main" onClick={() => props.onOpen(reading)}>
                      <strong dir="auto">{reading.title}</strong>
                      <small>
                        {LEVELS.find((l) => l.id === reading.level)?.label} · {languageNative(reading.language)} ·{' '}
                        {formatDate(reading.createdAt)}
                      </small>
                    </button>
                    <button
                      className="icon-btn icon-btn--small"
                      aria-label={`Delete ${reading.title}`}
                      onClick={() => {
                        if (uid && window.confirm('Delete this saved page?')) void deleteReading(uid, reading.id);
                      }}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'words' &&
            (words === null ? (
              <p className="empty">Loading...</p>
            ) : words.length === 0 ? (
              <p className="empty">No words yet. Select a word while reading and press Explain, then save it.</p>
            ) : (
              <ul className="list">
                {words.map((word) => (
                  <li key={word.id}>
                    <div className="list-main list-main--static">
                      <strong dir="auto">{word.term}</strong>
                      <small dir="auto">{word.meaning}</small>
                    </div>
                    <button
                      className="icon-btn icon-btn--small"
                      aria-label={`Delete ${word.term}`}
                      onClick={() => {
                        if (uid) void deleteWord(uid, word.id);
                      }}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
    </Drawer>
  );
}

// ---------- First-run setup notice ----------

export function SetupNotice() {
  return (
    <div className="callout callout--setup">
      <div>
        <strong>One step left: connect Firebase</strong>
        <p>
          PlainPage runs its AI through Firebase AI Logic. Copy <code>.env.example</code> to <code>.env.local</code>,
          fill in your free Firebase project's web config, and restart. The README has the 10-minute walkthrough.
        </p>
      </div>
    </div>
  );
}
