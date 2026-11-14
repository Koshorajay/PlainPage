import { useEffect, useRef, useState, type RefObject } from 'react';
import { explain, friendlyError, type Conditions, type ModelFactory } from '../ai/engine';
import type { Source } from '../types';
import { CheckIcon, CloseIcon, PlusIcon } from './icons';
import { SourceBadge } from './SourceBadge';

interface Props {
  /** Element whose text can be selected and explained. */
  container: RefObject<HTMLElement | null>;
  conditions: Conditions;
  factory: ModelFactory;
  /** Saves the word to "My words". Omitted when saving is not possible. */
  onSaveWord?: (term: string, meaning: string) => Promise<void>;
}

interface Target {
  term: string;
  context: string;
  x: number;
  y: number;
}

const MAX_TERM = 80;

/**
 * Select any word or phrase in the reader to get it explained in context.
 * The prompt is tiny, so with a local model it is instant and private.
 */
export function ExplainPopover({ container, conditions, factory, onSaveWord }: Props) {
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [source, setSource] = useState<Source | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const readSelection = () => {
      if (open) return;
      const selection = window.getSelection();
      const root = container.current;
      if (!selection || selection.isCollapsed || !root || selection.rangeCount === 0) {
        setTarget(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) {
        setTarget(null);
        return;
      }
      const term = selection.toString().replace(/\s+/g, ' ').trim();
      if (term.length < 2 || term.length > MAX_TERM) {
        setTarget(null);
        return;
      }
      const node = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
      const block = node?.closest('[data-block]');
      const context = (block?.textContent ?? term).replace(/\s+/g, ' ').trim().slice(0, 500);
      // A selection can wrap over lines: anchor to its last line.
      const rects = range.getClientRects();
      const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      setTarget({ term, context, x: rect.left + rect.width / 2, y: rect.bottom });
    };

    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(readSelection, 180);
    };
    // The trigger is pinned to the screen; re-anchor it when the page scrolls.
    const onScroll = () => {
      if (!open) later();
    };
    document.addEventListener('selectionchange', later);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', later);
      window.removeEventListener('scroll', onScroll);
    };
  }, [container, open]);

  const close = () => {
    abort.current?.abort();
    setOpen(false);
    setTarget(null);
    setText('');
    setError(null);
    setSaved(false);
    window.getSelection()?.removeAllRanges();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async () => {
    if (!target) return;
    setOpen(true);
    setBusy(true);
    setText('');
    setError(null);
    setSaved(false);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await explain(
        target.term,
        target.context,
        conditions,
        factory,
        (partial, src) => {
          setText(partial);
          setSource(src);
        },
        controller.signal,
      );
      setText(result.text);
      setSource(result.source);
    } catch (err) {
      if (!controller.signal.aborted) setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!target) return null;

  const width = 340;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, target.x - width / 2));
  const top = Math.min(window.innerHeight - 60, target.y + 10);

  if (!open) {
    return (
      <button
        className="explain-trigger"
        style={{ left: Math.max(12, Math.min(window.innerWidth - 110, target.x - 48)), top }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void run()}
      >
        Explain
      </button>
    );
  }

  return (
    <div
      ref={box}
      className="explain"
      role="dialog"
      aria-label={`Meaning of ${target.term}`}
      style={{ left, top: Math.min(top, window.innerHeight - 220), width: Math.min(width, window.innerWidth - 24) }}
    >
      <div className="explain-head">
        <strong dir="auto">{target.term}</strong>
        <button className="icon-btn icon-btn--small" onClick={close} aria-label="Close">
          <CloseIcon size={16} />
        </button>
      </div>
      {error ? (
        <p className="explain-error">{error}</p>
      ) : (
        <p className="explain-body" dir="auto" aria-live="polite">
          {text || 'Thinking...'}
          {busy && text && <span className="caret" />}
        </p>
      )}
      <div className="explain-foot">
        {source && !error && <SourceBadge source={source} />}
        {onSaveWord && !busy && !error && text && (
          <button
            className="link-btn"
            disabled={saved}
            onClick={() => {
              void onSaveWord(target.term, text).then(() => setSaved(true));
            }}
          >
            {saved ? (
              <>
                <CheckIcon size={15} /> Saved
              </>
            ) : (
              <>
                <PlusIcon size={15} /> Save to My words
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
