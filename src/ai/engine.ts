import type { RuntimeConfig } from '../config';
import { buildShield, describeEntries, type Shield } from '../lib/shield';
import type { DeviceStatus, Level, Section, Source, TaskItem, WordItem } from '../types';
import { chunkText } from './chunker';
import { checklistPrompt, gistPrompt, explainPrompt, rewritePrompt, wordsPrompt } from './prompts';
import { decideRoute, deviceCanWrite, type RouteDecision, type RouteMode } from './router';

/**
 * The PlainPage pipeline.
 *
 * It takes a page, asks the router where the work should run, splits the page
 * to fit that model, and streams the rewritten sections back. Every result
 * carries the source the Firebase SDK reported (on-device or cloud), so the UI
 * never has to guess.
 *
 * The SDK already falls back when a model is missing. This file adds the part
 * the SDK leaves to the app: recovering when a model that IS present fails
 * half-way (the local model chokes on a section, or the cloud runs out of
 * quota), in both directions, without ever breaking the Private-mode promise.
 *
 * The engine talks to models through the small HybridModel interface so it can
 * be unit-tested with fakes. The real implementation is in models.ts and is
 * backed by Firebase AI Logic.
 */

export type ModelKind = 'rewrite' | 'gist' | 'words' | 'explain' | 'checklist';

export interface ModelSpec {
  kind: ModelKind;
  mode: RouteMode;
  level: Level;
  language: string;
}

export interface StreamPiece {
  text: string;
  source: Source;
}

export interface HybridModel {
  stream(prompt: string, signal?: AbortSignal): AsyncIterable<StreamPiece>;
  generate(prompt: string, signal?: AbortSignal): Promise<StreamPiece>;
}

export type ModelFactory = (spec: ModelSpec) => HybridModel;

export interface Conditions {
  language: string;
  level: Level;
  privateMode: boolean;
  online: boolean;
  device: DeviceStatus;
  config: RuntimeConfig;
}

export interface SimplifyParams extends Conditions {
  text: string;
  signal?: AbortSignal;
}

export type StepStatus = 'idle' | 'running' | 'done' | 'error';

export type EngineEvent =
  | { type: 'plan'; decision: RouteDecision; sections: Section[] }
  | { type: 'section'; index: number; patch: Partial<Section> }
  | { type: 'gist'; status: StepStatus; text?: string; source?: Source }
  | { type: 'words'; status: StepStatus; items?: WordItem[]; source?: Source }
  /** Personal details that are replaced by placeholders before any cloud request. */
  | { type: 'shield'; count: number; summary: string; preview: string }
  /** leftDevice: true if any of the page's text was sent (or may have been sent) to the cloud. */
  | { type: 'done'; stopped: boolean; leftDevice: boolean };

export class BlockedError extends Error {
  constructor(public decision: RouteDecision) {
    super(decision.explain);
    this.name = 'BlockedError';
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message));
}

/** Turns SDK and browser errors into a sentence a reader can act on. */
export function friendlyError(err: unknown): string {
  if (err instanceof BlockedError) return err.message;
  const message = err instanceof Error ? err.message : String(err);
  if (isAbort(err)) return 'Stopped.';
  if (/429|quota|resource[_ ]exhausted|rate limit/i.test(message)) {
    return 'The free cloud quota is used up for the moment. Wait a minute and try again.';
  }
  if (/app[- ]?check|401|403|permission|unauthenticated/i.test(message)) {
    return 'Firebase refused the request. Check that Firebase AI Logic and App Check are set up for this app.';
  }
  if (/api-not-enabled|LanguageModel API not available|on-device model is not available/i.test(message)) {
    return 'The on-device model is not available in this browser.';
  }
  if (/fetch|network|offline|failed to load/i.test(message)) {
    return 'The cloud could not be reached. Check your connection.';
  }
  if (/too large|input.*(long|large)|context|QuotaExceeded/i.test(message)) {
    return 'This part was too long for the model.';
  }
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
}

/** Removes wrappers small models sometimes add around their answer. */
export function cleanOutput(text: string): string {
  return text
    .replace(/^\s*```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(/^\s*"""\n?/, '')
    .replace(/\n?"""\s*$/, '')
    .replace(/^\s*(TEXT|REWRITTEN TEXT|Rewritten text)\s*:\s*\n/i, '')
    .trim();
}

interface FallbackPlan {
  mode: RouteMode;
  /** Re-split the text to this size before retrying (cloud-sized pieces do not fit on-device). */
  rechunk?: number;
  note: string;
}

/**
 * What to try when the first attempt throws. Returns null when retrying
 * elsewhere would break a promise (Private mode) or cannot work (offline,
 * no local model, unsupported language).
 */
export function planFallback(decision: RouteDecision, c: Conditions): FallbackPlan | null {
  if (c.privateMode) return null;
  if (decision.mode === 'prefer_on_device' && decision.expected === 'device' && c.online) {
    return {
      mode: 'only_in_cloud',
      note: 'Your device could not finish this part, so the cloud did it.',
    };
  }
  if (decision.mode === 'prefer_in_cloud' && c.device === 'available' && deviceCanWrite(c.language, c.config)) {
    return {
      mode: 'only_on_device',
      rechunk: c.config.deviceChunkChars,
      note: 'The cloud could not be reached, so your device did this part.',
    };
  }
  return null;
}

/**
 * The SDK can also switch sides by itself (for example prefer_in_cloud falls
 * back to the device on a network error) without throwing. When the answer
 * came from the side we did not plan for, tell the reader why.
 */
export function sdkFallbackNote(decision: RouteDecision, source: Source): string | undefined {
  if (decision.mode === 'prefer_in_cloud' && source === 'device') {
    return 'The cloud could not be reached, so your device did this part.';
  }
  if (decision.mode === 'prefer_on_device' && decision.expected === 'device' && source === 'cloud') {
    return 'Your device was not ready, so the cloud did this part.';
  }
  return undefined;
}

async function streamAll(
  model: HybridModel,
  prompt: string,
  signal: AbortSignal | undefined,
  onText: (text: string, source: Source) => void,
): Promise<StreamPiece> {
  let text = '';
  let source: Source = 'cloud';
  for await (const piece of model.stream(prompt, signal)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    text += piece.text;
    source = piece.source;
    onText(text, source);
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return { text: cleanOutput(text), source };
}

/**
 * Runs one streaming job with the route's mode, and retries on the other side
 * if that is allowed. Shared by sections, the gist and word explanations.
 */
async function streamWithFallback(
  kind: ModelKind,
  input: string,
  toPrompt: (text: string) => string,
  decision: RouteDecision,
  c: Conditions,
  factory: ModelFactory,
  signal: AbortSignal | undefined,
  onText: (text: string, source: Source) => void,
  /** Called when this job sends text to the cloud as a retry. */
  onCloudAttempt?: () => void,
  /** Privacy shield: the models only ever see placeholders; the reader sees the real values. */
  shield?: Shield | null,
): Promise<StreamPiece & { fallback?: string }> {
  const spec = (mode: RouteMode): ModelSpec => ({ kind, mode, level: c.level, language: c.language });
  const masked = shield ? shield.mask(input) : input;
  const show = (text: string, source: Source) => onText(shield ? shield.restoreStreaming(text) : text, source);
  const finish = (text: string) => (shield ? shield.restore(text) : text);
  try {
    const result = await streamAll(factory(spec(decision.mode)), toPrompt(masked), signal, show);
    return { text: finish(result.text), source: result.source, fallback: sdkFallbackNote(decision, result.source) };
  } catch (err) {
    if (isAbort(err) || signal?.aborted) throw err;
    const plan = planFallback(decision, c);
    if (!plan) throw err;
    if (plan.mode === 'only_in_cloud') onCloudAttempt?.();

    const model = factory(spec(plan.mode));
    const pieces = plan.rechunk ? chunkText(masked, plan.rechunk).map((p) => p.text) : [masked];
    let done = '';
    let source: Source = 'cloud';
    for (const piece of pieces) {
      const prefix = done ? `${done}\n\n` : '';
      const result = await streamAll(model, toPrompt(piece), signal, (text, src) => show(prefix + text, src));
      done = prefix + result.text;
      source = result.source;
    }
    return { text: finish(done), source, fallback: plan.note };
  }
}

/** Builds a shield when the cloud may see the text (any mode except ONLY_ON_DEVICE). */
function shieldFor(decision: RouteDecision, text: string): Shield | null {
  if (decision.mode === 'only_on_device') return null;
  const shield = buildShield(text);
  return shield.entries.length ? shield : null;
}

function parseWords(raw: string, original: string): WordItem[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (parsed as { words?: unknown }).words;
  if (!Array.isArray(list)) return [];
  const haystack = original.toLowerCase();
  const seen = new Set<string>();
  const items: WordItem[] = [];
  for (const entry of list) {
    const term = typeof entry?.term === 'string' ? entry.term.trim() : '';
    const meaning = typeof entry?.meaning === 'string' ? entry.meaning.trim() : '';
    if (!term || !meaning || term.length > 60 || meaning.length > 200) continue;
    const key = term.toLowerCase();
    // Only keep terms that really are in the page: guards against invented words.
    if (seen.has(key) || !haystack.includes(key)) continue;
    seen.add(key);
    items.push({ term, meaning });
    if (items.length >= 6) break;
  }
  return items;
}

/**
 * Rewrites a whole page. Emits events as work progresses; resolves when the
 * page, the gist and the word list are finished (or the signal aborts).
 */
export async function simplify(
  params: SimplifyParams,
  factory: ModelFactory,
  emit: (event: EngineEvent) => void,
): Promise<void> {
  const { text, signal, config } = params;
  const decision = decideRoute({
    chars: text.length,
    language: params.language,
    privateMode: params.privateMode,
    online: params.online,
    device: params.device,
    config,
  });
  if (decision.expected === 'blocked') throw new BlockedError(decision);

  const sections: Section[] = chunkText(text, decision.chunkChars).map((chunk) => ({
    index: chunk.index,
    original: chunk.text,
    simplified: '',
    status: 'pending',
  }));
  emit({ type: 'plan', decision, sections });

  // Privacy shield: whenever the cloud may see this page, identifiers are replaced on the device first.
  const shield = shieldFor(decision, text);
  if (shield) {
    emit({ type: 'shield', count: shield.entries.length, summary: describeEntries(shield.entries), preview: shield.mask(text).slice(0, 3000) });
  }

  const results: string[] = new Array(sections.length).fill('');
  let next = 0;

  // Honest accounting for the reader: did any of this page go to the cloud?
  // True as soon as the cloud is asked, even if it fails and the device finishes the job.
  let leftDevice = decision.expected === 'cloud';
  const cloudAttempted = () => {
    leftDevice = true;
  };

  const worker = async () => {
    while (!signal?.aborted) {
      const index = next++;
      if (index >= sections.length) return;
      const started = Date.now();
      emit({ type: 'section', index, patch: { status: 'running' } });
      try {
        const result = await streamWithFallback(
          'rewrite',
          sections[index].original,
          rewritePrompt,
          decision,
          params,
          factory,
          signal,
          (simplified, source) => emit({ type: 'section', index, patch: { simplified, source } }),
          cloudAttempted,
          shield,
        );
        if (result.source === 'cloud') cloudAttempted();
        results[index] = result.text;
        emit({
          type: 'section',
          index,
          patch: {
            status: 'done',
            simplified: result.text,
            source: result.source,
            fallback: result.fallback,
            ms: Date.now() - started,
          },
        });
      } catch (err) {
        if (isAbort(err) || signal?.aborted) return;
        emit({ type: 'section', index, patch: { status: 'error', error: friendlyError(err) } });
      }
    }
  };

  const workers = Math.max(1, Math.min(decision.concurrency, sections.length));
  await Promise.all(Array.from({ length: workers }, worker));

  if (signal?.aborted) {
    emit({ type: 'done', stopped: true, leftDevice });
    return;
  }

  const simplified = results.filter(Boolean).join('\n\n');
  const onDevice = decision.expected === 'device';

  // The gist is made from the rewritten text: it is shorter, so it is quick even on-device.
  if (simplified) {
    emit({ type: 'gist', status: 'running' });
    try {
      const budget = onDevice ? config.deviceChunkChars * 2 : config.cloudChunkChars * 2;
      const result = await streamWithFallback(
        'gist',
        simplified.slice(0, budget),
        gistPrompt,
        { ...decision, concurrency: 1 },
        // No re-chunking for a summary: the input is already trimmed to fit.
        { ...params, config: { ...config, deviceChunkChars: budget } },
        factory,
        signal,
        (gist, source) => emit({ type: 'gist', status: 'running', text: gist, source }),
        cloudAttempted,
        shield,
      );
      if (result.source === 'cloud') cloudAttempted();
      emit({ type: 'gist', status: 'done', text: result.text, source: result.source });
    } catch (err) {
      if (!isAbort(err)) emit({ type: 'gist', status: 'error' });
    }
  }

  // "Words to know": structured JSON output, same schema on both models.
  if (config.wordsEnabled && simplified && !signal?.aborted) {
    emit({ type: 'words', status: 'running' });
    try {
      const sample = text.slice(0, onDevice ? config.deviceChunkChars : config.cloudChunkChars);
      const model = factory({ kind: 'words', mode: decision.mode, level: params.level, language: params.language });
      const result = await model.generate(wordsPrompt(shield ? shield.mask(sample) : sample), signal);
      if (result.source === 'cloud') cloudAttempted();
      const raw = shield ? shield.restore(result.text) : result.text;
      emit({ type: 'words', status: 'done', items: parseWords(raw, text), source: result.source });
    } catch (err) {
      if (!isAbort(err)) emit({ type: 'words', status: 'error' });
    }
  }

  emit({ type: 'done', stopped: Boolean(signal?.aborted), leftDevice });
}

/** Explains one word or phrase in context. Short, so it stays on-device whenever it can. */
export async function explain(
  term: string,
  context: string,
  c: Conditions,
  factory: ModelFactory,
  onText: (text: string, source: Source) => void,
  signal?: AbortSignal,
): Promise<StreamPiece & { fallback?: string }> {
  const decision = decideRoute({
    chars: context.length,
    language: c.language,
    privateMode: c.privateMode,
    online: c.online,
    device: c.device,
    config: c.config,
  });
  if (decision.expected === 'blocked') throw new BlockedError(decision);
  const shield = shieldFor(decision, `${term}\n${context}`);
  return streamWithFallback(
    'explain',
    context,
    (ctx) => explainPrompt(shield ? shield.mask(term) : term, ctx),
    decision,
    // An explanation is one short prompt: never re-split it on fallback.
    { ...c, config: { ...c.config, deviceChunkChars: Math.max(c.config.deviceChunkChars, context.length + 1) } },
    factory,
    signal,
    onText,
    undefined,
    shield,
  );
}

/**
 * Reads the tasks out of a model reply: one "- " line per task, optionally
 * ending with " — deadline". "NONE" (or nothing usable) means no tasks.
 */
export function parseChecklist(raw: string): TaskItem[] {
  const items: TaskItem[] = [];
  const seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const m = /^\s*(?:[-*•]|\d{1,2}[.)]|\[\s?\])\s+(.+)$/.exec(line);
    if (!m) continue;
    let task = m[1].replace(/\*\*/g, '').trim();
    let when: string | undefined;
    const split = /\s+(?:—|–|--|\|)\s+(?!.*\s(?:—|–|--|\|)\s)(.+)$/.exec(task);
    if (split) {
      when = split[1].trim();
      task = task.slice(0, split.index).trim();
    }
    task = task.replace(/[.;]+$/, '');
    if (!task || /^none\b/i.test(task) || task.length > 160) continue;
    const key = task.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(when ? { task, when } : { task });
    if (items.length >= 12) break;
  }
  return items;
}

/**
 * Makes a to-do list from a text, on request. It is routed on its own: a long
 * page rewritten in the cloud can still get its to-do list on the device.
 */
export async function makeChecklist(
  text: string,
  c: Conditions,
  factory: ModelFactory,
  onText: (text: string, source: Source) => void,
  signal?: AbortSignal,
): Promise<{ items: TaskItem[]; source: Source; fallback?: string; leftDevice: boolean }> {
  const deviceBudget = c.config.deviceChunkChars * 2;
  const input = text.length <= deviceBudget ? text : text.slice(0, c.config.cloudChunkChars);
  const decision = decideRoute({
    chars: input.length,
    language: c.language,
    privateMode: c.privateMode,
    online: c.online,
    device: c.device,
    config: c.config,
  });
  if (decision.expected === 'blocked') throw new BlockedError(decision);
  let leftDevice = decision.expected === 'cloud';
  const result = await streamWithFallback(
    'checklist',
    input,
    checklistPrompt,
    decision,
    { ...c, config: { ...c.config, deviceChunkChars: Math.max(c.config.deviceChunkChars, input.length + 1) } },
    factory,
    signal,
    onText,
    () => {
      leftDevice = true;
    },
    shieldFor(decision, input),
  );
  if (result.source === 'cloud') leftDevice = true;
  return { items: parseChecklist(result.text), source: result.source, fallback: result.fallback, leftDevice };
}
