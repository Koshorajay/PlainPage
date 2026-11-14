import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { countWords, normalizeText } from '../ai/chunker';
import type { Conditions } from '../ai/engine';
import { decideRoute } from '../ai/router';
import { LANGUAGES, LEVELS } from '../config';
import { htmlToText, toSourceDoc } from '../lib/extract';
import {
  hasAllSites,
  NeedsAccessError,
  readTab,
  requestAllSites,
  watchActiveTab,
  watchPanelRequests,
  type TabInfo,
} from '../lib/pageSource';
import type { Prefs } from '../lib/prefs';
import { SAMPLES } from '../lib/samples';
import { IS_EXTENSION } from '../platform';
import type { SourceDoc } from '../types';
import { CloudIcon, DeviceIcon, LockIcon, PageIcon } from './icons';

interface Props {
  draft: SourceDoc;
  onDraft: (doc: SourceDoc) => void;
  conditions: Conditions;
  prefs: Prefs;
  onPrefs: (patch: Partial<Prefs>) => void;
  canRun: boolean;
  onStart: (doc: SourceDoc) => void;
}

const MAX_CHARS = 400000;

export function Compose({ draft, onDraft, conditions, prefs, onPrefs, canRun, onStart }: Props) {
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [needsAccess, setNeedsAccess] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const text = draft.text;
  const words = useMemo(() => countWords(text), [text]);
  const ready = text.trim().length >= 20;

  // The same decision the engine will make, shown before the reader commits.
  const decision = useMemo(
    () =>
      decideRoute({
        chars: normalizeText(text).length,
        language: conditions.language,
        privateMode: conditions.privateMode,
        online: conditions.online,
        device: conditions.device,
        config: conditions.config,
      }),
    [text, conditions],
  );

  const setText = (value: string, title?: string, url?: string) => {
    const clipped = value.length > MAX_CHARS ? value.slice(0, MAX_CHARS) : value;
    setNotice(value.length > MAX_CHARS ? 'That is a very long text. PlainPage kept the first part.' : null);
    onDraft({ text: clipped, title: title ?? draft.title, url: url ?? draft.url });
  };

  const loadPage = async (tabId?: number) => {
    setLoadingPage(true);
    setNotice(null);
    try {
      const doc = await readTab(tabId);
      setNeedsAccess(false);
      setText(doc.text, doc.title, doc.url);
    } catch (err) {
      if (err instanceof NeedsAccessError) setNeedsAccess(true);
      else setNotice(err instanceof Error ? err.message : 'PlainPage could not read this page.');
    } finally {
      setLoadingPage(false);
    }
  };

  // Extension: follow the active tab and react to the toolbar button / right-click menu.
  useEffect(() => {
    if (!IS_EXTENSION) return;
    const stopTabs = watchActiveTab(setTab);
    const stopRequests = watchPanelRequests((request) => {
      if (request.kind === 'selection' && request.text) {
        setNeedsAccess(false);
        onDraft(toSourceDoc(request.text, request.title, request.url));
      } else {
        void loadPage(request.tabId);
      }
    });
    return () => {
      stopTabs();
      stopRequests();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowEverywhere = async () => {
    const granted = (await requestAllSites()) || (await hasAllSites());
    if (granted) void loadPage();
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // Pasting from a web page: keep headings and lists instead of flat text.
    const html = event.clipboardData.getData('text/html');
    if (!html || text.trim()) return;
    const converted = htmlToText(html);
    if (converted.text.trim().length < 20) return;
    event.preventDefault();
    setText(converted.text, converted.title || undefined);
  };

  const readFile = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      setNotice('That file is too large. Try a text file under 3 MB.');
      return;
    }
    const content = await file.text();
    const name = file.name.replace(/\.[^.]+$/, '');
    if (/\.html?$/i.test(file.name) || file.type === 'text/html') {
      const converted = htmlToText(content);
      setText(converted.text, converted.title || name);
    } else {
      setText(content, name);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const start = () => {
    if (!ready || !canRun || decision.expected === 'blocked') return;
    onStart(toSourceDoc(normalizeText(text), draft.title, draft.url));
  };

  const routeClass =
    decision.expected === 'device' ? 'route--device' : decision.expected === 'cloud' ? 'route--cloud' : 'route--blocked';

  return (
    <main className="compose">
      <div className="hero">
        <h1>Make any page easy to read.</h1>
        <p>
          PlainPage rewrites hard text in plain language. It works on your device when it can, and in the cloud when it
          must.
        </p>
      </div>

      {IS_EXTENSION && (
        <div className="page-card">
          <PageIcon size={20} />
          <div className="page-card-text">
            <span className="page-card-label">This page</span>
            <span className="page-card-title">{tab?.title || 'Open a web page to begin'}</span>
          </div>
          <button className="btn btn--ghost btn--small" onClick={() => void loadPage()} disabled={loadingPage}>
            {loadingPage ? 'Reading...' : 'Read this page'}
          </button>
        </div>
      )}

      {IS_EXTENSION && needsAccess && (
        <div className="callout">
          <p>
            PlainPage only reads a page when you ask. Click the <strong>PlainPage button</strong> in Chrome's toolbar
            to read this page, or let PlainPage follow you from site to site.
          </p>
          <button className="btn btn--ghost btn--small" onClick={() => void allowEverywhere()}>
            Allow on every site
          </button>
        </div>
      )}

      <div
        className={`editor ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <label className="sr-only" htmlFor="source-text">
          Text to make plain
        </label>
        <textarea
          id="source-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          placeholder={
            IS_EXTENSION
              ? 'Or paste any text here...'
              : 'Paste any text here: a contract, a medicine leaflet, a letter from the bank, a news article...'
          }
          spellCheck={false}
        />
        <div className="editor-foot">
          <span className="editor-count">{words > 0 ? `${words.toLocaleString()} words` : 'Paste, type or drop a file'}</span>
          <div className="editor-tools">
            {text && (
              <button className="link-btn" onClick={() => onDraft({ text: '', title: '' })}>
                Clear
              </button>
            )}
            <button className="link-btn" onClick={() => fileInput.current?.click()}>
              Open a file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.html,.htm,text/plain,text/html,text/markdown"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      {notice && <p className="notice">{notice}</p>}

      {!text && (
        <div className="samples">
          <span className="samples-label">Try an example</span>
          {SAMPLES.map((sample) => (
            <button key={sample.id} className="pill" onClick={() => setText(sample.text, sample.title)}>
              {sample.label}
            </button>
          ))}
        </div>
      )}

      <div className="controls">
        <fieldset className="field">
          <legend>Reading level</legend>
          <div className="segmented" role="radiogroup" aria-label="Reading level">
            {LEVELS.map((level) => (
              <button
                key={level.id}
                role="radio"
                aria-checked={prefs.level === level.id}
                className={prefs.level === level.id ? 'is-active' : ''}
                onClick={() => onPrefs({ level: level.id })}
                title={level.hint}
              >
                {level.label}
              </button>
            ))}
          </div>
          <p className="field-hint">{LEVELS.find((l) => l.id === prefs.level)?.hint}</p>
        </fieldset>

        <div className="field">
          <label htmlFor="language">Write it in</label>
          <select id="language" value={prefs.language} onChange={(e) => onPrefs({ language: e.target.value })}>
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.native}
                {language.native !== language.name ? ` (${language.name})` : ''}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {conditions.config.deviceLanguages.includes(prefs.language)
              ? 'The on-device model can write this language.'
              : 'This language is written by the cloud model.'}
          </p>
        </div>
      </div>

      <div className="launch">
        <div className={`route ${routeClass}`} aria-live="polite">
          <span className="route-icon">
            {decision.expected === 'device' ? (
              conditions.privateMode ? (
                <LockIcon />
              ) : (
                <DeviceIcon />
              )
            ) : (
              <CloudIcon />
            )}
          </span>
          <div>
            <strong>{ready ? decision.label : 'Where will it run?'}</strong>
            <p>{ready ? decision.explain : 'Add some text and PlainPage will tell you before it starts.'}</p>
          </div>
        </div>
        <button
          className="btn btn--primary btn--large"
          onClick={start}
          disabled={!ready || !canRun || decision.expected === 'blocked'}
        >
          Make it plain
        </button>
      </div>
    </main>
  );
}
