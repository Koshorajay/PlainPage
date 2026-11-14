import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { friendlyError, simplify, type Conditions, type EngineEvent } from './ai/engine';
import { createModelFactory } from './ai/models';
import { Compose } from './components/Compose';
import { DisplayPanel, LibraryPanel, SetupNotice } from './components/Panels';
import { Reader } from './components/Reader';
import { TopBar } from './components/TopBar';
import { CAN_RUN, getAiService, HAS_CLOUD } from './firebase/app';
import { getRuntimeConfig, loadRuntimeConfig } from './firebase/remoteConfig';
import { saveReading, saveWord } from './firebase/store';
import { useAccount, useDeviceModel, useOnline, usePrefs } from './hooks';
import { FONT_STACKS } from './lib/prefs';
import { readingStats } from './lib/readability';
import { DEV_MOCK, IS_EXTENSION } from './platform';
import { readingReducer, simplifiedText, tally } from './state';
import type { SavedReading, SourceDoc } from './types';

export default function App() {
  const online = useOnline();
  const device = useDeviceModel();
  const account = useAccount();
  const [prefs, updatePrefs] = usePrefs(account);
  const [config, setConfig] = useState(getRuntimeConfig);
  const [reading, dispatch] = useReducer(readingReducer, null);
  const [panel, setPanel] = useState<'display' | 'library' | null>(null);
  const [draft, setDraft] = useState<SourceDoc>({ title: '', text: '' });
  const abort = useRef<AbortController | null>(null);

  // One factory for the whole session: it creates Firebase AI Logic hybrid models on demand.
  const factory = useMemo(() => (CAN_RUN ? createModelFactory(getAiService(), getRuntimeConfig) : null), []);

  // Remote Config can retune the router without a new build.
  useEffect(() => {
    void loadRuntimeConfig().then(setConfig);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.platform = IS_EXTENSION ? 'extension' : 'web';
    root.style.setProperty('--reader-font', FONT_STACKS[prefs.font]);
  }, [prefs.theme, prefs.font]);

  const conditions: Conditions = useMemo(
    () => ({
      language: prefs.language,
      level: prefs.level,
      privateMode: prefs.privateMode,
      online,
      device: device.status,
      config,
    }),
    [prefs.language, prefs.level, prefs.privateMode, online, device.status, config],
  );

  const start = useCallback(
    async (doc: SourceDoc) => {
      if (!factory) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      dispatch({
        type: 'start',
        doc,
        level: conditions.level,
        language: conditions.language,
        privateMode: conditions.privateMode,
      });
      window.scrollTo({ top: 0 });

      // Streaming text arrives many times a second. Keep only the latest text
      // per section and paint once per frame, so long pages stay smooth.
      const latest = new Map<number, EngineEvent>();
      let frame = 0;
      const flush = () => {
        frame = 0;
        for (const event of latest.values()) dispatch({ type: 'engine', event });
        latest.clear();
      };
      const emit = (event: EngineEvent) => {
        if (controller.signal.aborted && event.type !== 'done') return;
        const streaming = event.type === 'section' && event.patch.status === undefined;
        if (streaming) {
          latest.set(event.index, event);
          if (!frame) frame = requestAnimationFrame(flush);
          return;
        }
        if (frame) cancelAnimationFrame(frame);
        flush();
        dispatch({ type: 'engine', event });
      };

      try {
        await simplify({ ...conditions, text: doc.text, signal: controller.signal }, factory, emit);
      } catch (err) {
        if (!controller.signal.aborted) dispatch({ type: 'fail', error: friendlyError(err) });
      }
    },
    [conditions, factory],
  );

  const stop = () => abort.current?.abort();

  const back = () => {
    abort.current?.abort();
    window.speechSynthesis?.cancel();
    dispatch({ type: 'clear' });
    window.scrollTo({ top: 0 });
  };

  const save = async () => {
    if (!reading || !account) return;
    const counts = tally(reading.sections);
    const simplified = simplifiedText(reading.sections);
    const original = reading.sections.map((s) => s.original).join('\n\n');
    const english = reading.language === 'en';
    const data: Omit<SavedReading, 'id'> = {
      title: reading.doc.title,
      sourceUrl: reading.doc.url,
      level: reading.level,
      language: reading.language,
      gist: reading.gist.text,
      simplified,
      deviceSections: counts.device,
      cloudSections: counts.cloud,
      gradeBefore: english ? readingStats(original).grade : undefined,
      gradeAfter: english ? readingStats(simplified).grade : undefined,
      createdAt: Date.now(),
    };
    const id = await saveReading(account.uid, data);
    dispatch({ type: 'mark-saved', saved: { ...data, id } });
  };

  const saveWordToLibrary = useCallback(
    async (term: string, meaning: string) => {
      if (!account) return;
      await saveWord(account.uid, { term, meaning, language: prefs.language, createdAt: Date.now() });
    },
    [account, prefs.language],
  );

  const canSave = HAS_CLOUD && Boolean(account);

  return (
    <div className="app">
      <TopBar
        device={device}
        online={online}
        config={config}
        privateMode={prefs.privateMode}
        onPrivateMode={(privateMode) => updatePrefs({ privateMode })}
        onOpenDisplay={() => setPanel('display')}
        onOpenLibrary={() => setPanel('library')}
        onHome={back}
      />

      {DEV_MOCK && (
        <div className="devbar">Development mock model active. Results are not real AI output.</div>
      )}

      {!CAN_RUN && !reading && <SetupNotice />}

      {reading ? (
        <Reader
          reading={reading}
          prefs={prefs}
          conditions={conditions}
          config={config}
          factory={factory}
          canSave={canSave}
          onBack={back}
          onStop={stop}
          onRetry={() => void start(reading.doc)}
          onSave={save}
          onSaveWord={canSave ? saveWordToLibrary : undefined}
        />
      ) : (
        <Compose
          draft={draft}
          onDraft={setDraft}
          conditions={conditions}
          prefs={prefs}
          onPrefs={updatePrefs}
          canRun={CAN_RUN}
          onStart={(doc) => void start(doc)}
        />
      )}

      <footer className="foot">
        <span>PlainPage · hybrid on-device and cloud AI with Firebase AI Logic</span>
      </footer>

      {panel === 'display' && <DisplayPanel prefs={prefs} onPrefs={updatePrefs} onClose={() => setPanel(null)} />}
      {panel === 'library' && (
        <LibraryPanel
          account={account}
          onClose={() => setPanel(null)}
          onOpen={(saved) => {
            abort.current?.abort();
            dispatch({ type: 'open-saved', saved });
            setPanel(null);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}
