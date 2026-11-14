import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conditions, ModelFactory } from '../ai/engine';
import type { RuntimeConfig } from '../config';
import { languageNative, LEVELS } from '../config';
import { blockText, Blocks, toBlocks } from '../lib/markdown';
import { readingMinutes, readingStats } from '../lib/readability';
import { speakBlocks, speechSupported, type Speaker } from '../lib/tts';
import type { Prefs } from '../lib/prefs';
import { simplifiedText, tally, type Reading } from '../state';
import { ExplainPopover } from './ExplainPopover';
import {
  BackIcon,
  BookmarkIcon,
  CheckIcon,
  CloudIcon,
  ColumnsIcon,
  CopyIcon,
  DeviceIcon,
  LockIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
} from './icons';
import { SourceBadge } from './SourceBadge';

interface Props {
  reading: Reading;
  prefs: Prefs;
  conditions: Conditions;
  config: RuntimeConfig;
  factory: ModelFactory | null;
  canSave: boolean;
  onBack: () => void;
  onStop: () => void;
  onRetry: () => void;
  onSave: () => Promise<void>;
  onSaveWord?: (term: string, meaning: string) => Promise<void>;
}

export function Reader(props: Props) {
  const { reading, prefs, config } = props;
  const [compare, setCompare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [rulerY, setRulerY] = useState<number | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const article = useRef<HTMLElement>(null);

  const counts = useMemo(() => tally(reading.sections), [reading.sections]);
  const running = reading.status === 'running';
  const fromLibrary = Boolean(reading.saved && reading.sections.every((s) => !s.original));
  const plainText = useMemo(() => simplifiedText(reading.sections), [reading.sections]);

  // Blocks of every section, with stable keys for read-aloud highlighting.
  const sectionBlocks = useMemo(
    () => reading.sections.map((s) => ({ index: s.index, blocks: toBlocks(s.simplified) })),
    [reading.sections],
  );

  const stats = useMemo(() => {
    if (running || !plainText) return null;
    const after = readingStats(plainText);
    const original = reading.sections.map((s) => s.original).join('\n\n');
    const before = original.trim() ? readingStats(original) : null;
    return { before, after };
  }, [running, plainText, reading.sections]);

  const english = reading.language === 'en';

  useEffect(() => () => speaker.current?.stop(), []);

  // Keep the block being read aloud in view.
  useEffect(() => {
    if (!speakingKey) return;
    const el = article.current?.querySelector(`[data-block="${speakingKey}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [speakingKey]);

  useEffect(() => {
    if (!prefs.ruler) {
      setRulerY(null);
      return;
    }
    const move = (event: MouseEvent) => setRulerY(event.clientY);
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [prefs.ruler]);

  const toggleSpeech = () => {
    if (speakingKey !== null || speaker.current) {
      speaker.current?.stop();
      speaker.current = null;
      setSpeakingKey(null);
      return;
    }
    const keys: string[] = [];
    const texts: string[] = [];
    for (const section of sectionBlocks) {
      section.blocks.forEach((block, i) => {
        keys.push(`s${section.index}:${i}`);
        texts.push(blockText(block));
      });
    }
    if (!texts.length) return;
    speaker.current = speakBlocks(texts, {
      language: reading.language,
      rate: prefs.speechRate,
      onBlock: (i) => setSpeakingKey(keys[i]),
      onEnd: () => {
        speaker.current = null;
        setSpeakingKey(null);
      },
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await props.onSave();
    } catch {
      setSaveError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const decision = reading.decision;
  const routeClass = !decision ? '' : decision.expected === 'device' ? 'route--device' : 'route--cloud';
  const levelLabel = LEVELS.find((l) => l.id === reading.level)?.label ?? '';
  // Only claim "stayed on your device" when the engine confirms the cloud was never asked.
  const stayedLocal = reading.leftDevice === false;
  const elapsed = reading.finishedAt ? Math.max(1, Math.round((reading.finishedAt - reading.startedAt) / 1000)) : null;

  return (
    <main className={`reader ${compare ? 'is-compare' : ''}`}>
      <div className="reader-bar">
        <button className="btn btn--ghost btn--small" onClick={props.onBack}>
          <BackIcon size={16} /> New
        </button>
        <div className="reader-bar-actions">
          {running && (
            <button className="btn btn--ghost btn--small" onClick={props.onStop}>
              <StopIcon size={16} /> Stop
            </button>
          )}
          {speechSupported() && plainText && (
            <button
              className={`btn btn--ghost btn--small ${speakingKey ? 'is-active' : ''}`}
              onClick={toggleSpeech}
              aria-pressed={Boolean(speakingKey)}
            >
              {speakingKey ? <StopIcon size={16} /> : <PlayIcon size={16} />}
              <span className="btn-label">{speakingKey ? 'Stop' : 'Listen'}</span>
            </button>
          )}
          {!fromLibrary && (
            <button
              className={`btn btn--ghost btn--small ${compare ? 'is-active' : ''}`}
              onClick={() => setCompare((v) => !v)}
              aria-pressed={compare}
            >
              <ColumnsIcon size={16} />
              <span className="btn-label">Compare</span>
            </button>
          )}
          {plainText && (
            <button className="btn btn--ghost btn--small" onClick={() => void copy()}>
              {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              <span className="btn-label">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
          {!fromLibrary && reading.status === 'done' && plainText && (
            <button
              className="btn btn--ghost btn--small"
              onClick={() => void save()}
              disabled={!props.canSave || saving || Boolean(reading.saved) || reading.privateMode}
              title={
                reading.privateMode
                  ? 'Private mode keeps this page on your device, so it is not saved to your library.'
                  : !props.canSave
                    ? 'Saving needs a connection to your library.'
                    : 'Save to your library'
              }
            >
              {reading.saved ? <CheckIcon size={16} /> : <BookmarkIcon size={16} />}
              <span className="btn-label">{reading.saved ? 'Saved' : saving ? 'Saving...' : 'Save'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="reader-head">
        <p className="eyebrow">
          {levelLabel} · {languageNative(reading.language)}
          {reading.doc.url && (
            <>
              {' · '}
              <a href={reading.doc.url} target="_blank" rel="noreferrer noopener">
                {safeHost(reading.doc.url)}
              </a>
            </>
          )}
        </p>
        <h1 dir="auto">{reading.doc.title}</h1>
      </div>

      {decision && (
        <div className={`route ${routeClass}`}>
          <span className="route-icon">
            {decision.expected === 'device' ? reading.privateMode ? <LockIcon /> : <DeviceIcon /> : <CloudIcon />}
          </span>
          <div>
            <strong>{decision.label}</strong>
            <p>{decision.explain}</p>
          </div>
          {counts.total > 0 && (
            <span className="route-count" aria-live="polite">
              {running ? `${counts.done} of ${counts.total}` : `${counts.total} ${counts.total === 1 ? 'part' : 'parts'}`}
            </span>
          )}
        </div>
      )}

      {running && counts.total > 0 && (
        <div className="bar bar--thin" role="progressbar" aria-valuenow={Math.round((counts.done / counts.total) * 100)}>
          <div className="bar-fill" style={{ width: `${Math.max(4, (counts.done / counts.total) * 100)}%` }} />
        </div>
      )}

      {reading.status === 'error' && (
        <div className="callout callout--error">
          <p>{reading.error}</p>
          <button className="btn btn--ghost btn--small" onClick={props.onBack}>
            Go back
          </button>
        </div>
      )}

      {(reading.gist.status !== 'idle' || (running && counts.total > 0)) && reading.gist.status !== 'error' && (
        <section className="gist" aria-label="In short">
          <div className="gist-head">
            <h2>In short</h2>
            {reading.gist.source && reading.gist.text && <SourceBadge source={reading.gist.source} compact />}
          </div>
          {reading.gist.text ? (
            <div className="gist-body" style={readerStyle(prefs)}>
              <Blocks blocks={toBlocks(reading.gist.text)} keyPrefix="gist" />
            </div>
          ) : (
            <p className="gist-wait">{running ? 'Coming once the page is ready...' : 'Summing up...'}</p>
          )}
        </section>
      )}

      {stats && (
        <div className="meter">
          {english && stats.before && stats.before.words > 30 && (
            <div className="meter-item">
              <span className="meter-label">Reading level</span>
              <span className="meter-value">
                Grade {Math.round(stats.before.grade)} <span className="arrow">to</span>{' '}
                <strong>Grade {Math.round(stats.after.grade)}</strong>
              </span>
            </div>
          )}
          {stats.before && stats.before.words > 30 && (
            <div className="meter-item">
              <span className="meter-label">Words per sentence</span>
              <span className="meter-value">
                {Math.round(stats.before.sentenceLength)} <span className="arrow">to</span>{' '}
                <strong>{Math.round(stats.after.sentenceLength)}</strong>
              </span>
            </div>
          )}
          <div className="meter-item">
            <span className="meter-label">Time to read</span>
            <span className="meter-value">
              <strong>{readingMinutes(stats.after.words)} min</strong>
            </span>
          </div>
        </div>
      )}

      {compare && (
        <div className="compare-heads" aria-hidden="true">
          <span>Original</span>
          <span>Plain</span>
        </div>
      )}

      <article className="article" ref={article} style={readerStyle(prefs)}>
        {reading.sections.map((section, i) => (
          <section key={section.index} className={`sec sec--${section.status}`}>
            {compare && (
              <div className="sec-original">
                <Blocks blocks={toBlocks(section.original)} keyPrefix={`o${section.index}`} />
              </div>
            )}
            <div className="sec-plain">
              {section.source && section.simplified && (
                <span className="sec-mark">
                  <SourceBadge source={section.source} compact />
                </span>
              )}
              {section.status === 'pending' && <Skeleton />}
              {section.status === 'running' && !section.simplified && <Skeleton active />}
              {section.simplified && (
                <Blocks blocks={sectionBlocks[i].blocks} keyPrefix={`s${section.index}`} speakingKey={speakingKey} />
              )}
              {section.status === 'running' && section.simplified && <span className="caret" />}
              {section.status === 'error' && (
                <div className="sec-error">
                  <p className="sec-error-note">This part could not be rewritten. {section.error} Here is the original:</p>
                  <Blocks blocks={toBlocks(section.original)} keyPrefix={`e${section.index}`} />
                </div>
              )}
              {section.fallback && <p className="sec-note">{section.fallback}</p>}
            </div>
          </section>
        ))}
      </article>

      {reading.words.status === 'done' && reading.words.items.length > 0 && (
        <section className="words" aria-label="Words to know">
          <div className="gist-head">
            <h2>Words to know</h2>
            {reading.words.source && <SourceBadge source={reading.words.source} compact />}
          </div>
          <ul>
            {reading.words.items.map((item) => (
              <li key={item.term}>
                <div>
                  <strong dir="auto">{item.term}</strong>
                  <span dir="auto">{item.meaning}</span>
                </div>
                {props.onSaveWord && (
                  <button
                    className="icon-btn icon-btn--small"
                    aria-label={`Save ${item.term} to My words`}
                    title="Save to My words"
                    disabled={savedWords.has(item.term)}
                    onClick={() => {
                      void props.onSaveWord?.(item.term, item.meaning).then(() =>
                        setSavedWords((current) => new Set(current).add(item.term)),
                      );
                    }}
                  >
                    {savedWords.has(item.term) ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!running && counts.done > 0 && !fromLibrary && (
        <section className="receipt" aria-label="How this page was made">
          <h2>How this page was made</h2>
          <div className="receipt-rows">
            <div className="receipt-row">
              <SourceBadge source="device" />
              <span>
                <strong>{counts.device}</strong> {counts.device === 1 ? 'part' : 'parts'} · Gemini Nano in Chrome
              </span>
            </div>
            <div className="receipt-row">
              <SourceBadge source="cloud" />
              <span>
                <strong>{counts.cloud}</strong> {counts.cloud === 1 ? 'part' : 'parts'} · {config.cloudModel}
              </span>
            </div>
          </div>
          <p className="receipt-note">
            {stayedLocal
              ? 'Nothing from this page left your device.'
              : counts.cloud === 0
                ? 'PlainPage asked the cloud first, so this text was sent there. The cloud could not answer and your device did the work.'
                : counts.device === 0
                  ? 'This page was rewritten by the cloud model through Firebase AI Logic.'
                  : 'Parts of this page were sent to the cloud model through Firebase AI Logic.'}
            {counts.fallbacks > 0 &&
              ` ${counts.fallbacks} ${counts.fallbacks === 1 ? 'part' : 'parts'} switched sides after a problem.`}
            {counts.failed > 0 && ` ${counts.failed} could not be rewritten and ${counts.failed === 1 ? 'is' : 'are'} shown as written.`}
            {elapsed !== null && ` Finished in ${elapsed} s.`}
          </p>
          {counts.failed > 0 && (
            <button className="btn btn--ghost btn--small" onClick={props.onRetry}>
              Try again
            </button>
          )}
        </section>
      )}

      {reading.status === 'stopped' && (
        <div className="callout">
          <p>Stopped. The parts that were finished are shown above.</p>
          <button className="btn btn--ghost btn--small" onClick={props.onRetry}>
            Start again
          </button>
        </div>
      )}

      {saveError && <p className="notice">{saveError}</p>}

      {props.factory && !running && (
        <ExplainPopover
          container={article}
          conditions={{ ...props.conditions, language: reading.language, level: reading.level }}
          factory={props.factory}
          onSaveWord={props.onSaveWord}
        />
      )}

      {plainText && !running && <p className="tip">Tip: select any word in the text to have it explained.</p>}

      {prefs.ruler && rulerY !== null && <div className="ruler" style={{ top: rulerY }} aria-hidden="true" />}
    </main>
  );
}

function Skeleton({ active = false }: { active?: boolean }) {
  return (
    <div className={`skeleton ${active ? 'is-active' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function readerStyle(prefs: Prefs) {
  return {
    fontSize: `${prefs.size}px`,
    lineHeight: prefs.lineHeight,
    letterSpacing: `${prefs.letterSpacing}em`,
    wordSpacing: `${prefs.letterSpacing * 3}em`,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}
