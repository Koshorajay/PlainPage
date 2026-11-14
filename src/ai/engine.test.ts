import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import type { Section, Source } from '../types';
import {
  BlockedError,
  cleanOutput,
  explain,
  friendlyError,
  simplify,
  type EngineEvent,
  type HybridModel,
  type ModelFactory,
  type ModelSpec,
  type SimplifyParams,
} from './engine';
import type { RouteMode } from './router';

/** A fake pair of models. Each mode answers from a fixed side, or throws. */
function fakeFactory(options: {
  deviceFails?: boolean;
  cloudFails?: boolean;
  deviceMaxPrompt?: number;
  deviceAvailable?: boolean;
}): { factory: ModelFactory; calls: ModelSpec[] } {
  const calls: ModelSpec[] = [];
  const deviceAvailable = options.deviceAvailable ?? true;

  const device = (prompt: string): string => {
    if (options.deviceFails) throw new Error('The model process crashed');
    if (options.deviceMaxPrompt && prompt.length > options.deviceMaxPrompt) throw new Error('The input is too large');
    return 'device answer';
  };
  const cloud = (): string => {
    if (options.cloudFails) throw new Error('fetch-error: 429 quota exceeded');
    return 'cloud answer';
  };

  const answer = (mode: RouteMode, prompt: string): { text: string; source: Source } => {
    switch (mode) {
      case 'only_on_device':
        if (!deviceAvailable) throw new Error('on-device model is not available');
        return { text: device(prompt), source: 'device' };
      case 'only_in_cloud':
        return { text: cloud(), source: 'cloud' };
      case 'prefer_on_device':
        // Like the SDK: availability decides the side; a failure is not retried.
        return deviceAvailable ? { text: device(prompt), source: 'device' } : { text: cloud(), source: 'cloud' };
      case 'prefer_in_cloud':
        try {
          return { text: cloud(), source: 'cloud' };
        } catch (err) {
          if (!deviceAvailable) throw err;
          return { text: device(prompt), source: 'device' };
        }
    }
  };

  const factory: ModelFactory = (spec) => {
    calls.push(spec);
    const model: HybridModel = {
      async *stream(prompt) {
        const result = answer(spec.mode, prompt);
        yield { text: result.text.slice(0, 3), source: result.source };
        yield { text: result.text.slice(3), source: result.source };
      },
      async generate(prompt) {
        const result = answer(spec.mode, prompt);
        return { text: '{"words":[{"term":"tenant","meaning":"a person who rents a home"}]}', source: result.source };
      },
    };
    return model;
  };
  return { factory, calls };
}

const sentence = 'The tenant must pay the rent on the first day of every month.';
const page = (chars: number) => {
  let text = '';
  while (text.length < chars) text += `${Array.from({ length: 8 }, () => sentence).join(' ')}\n\n`;
  return text.trim();
};

const params = (overrides: Partial<SimplifyParams> = {}): SimplifyParams => ({
  text: page(3000),
  level: 'plain',
  language: 'en',
  privateMode: false,
  online: true,
  device: 'available',
  config: DEFAULT_CONFIG,
  ...overrides,
});

async function run(p: SimplifyParams, factory: ModelFactory) {
  const events: EngineEvent[] = [];
  let sections: Section[] = [];
  await simplify(p, factory, (event) => {
    events.push(event);
    if (event.type === 'plan') sections = event.sections.map((s) => ({ ...s }));
    if (event.type === 'section') sections[event.index] = { ...sections[event.index], ...event.patch };
  });
  return { events, sections };
}

describe('simplify', () => {
  it('rewrites a short page on the device and reports the source', async () => {
    const { factory } = fakeFactory({});
    const { sections, events } = await run(params(), factory);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((s) => s.status === 'done' && s.source === 'device')).toBe(true);
    expect(sections.every((s) => s.simplified === 'device answer')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done', stopped: false, leftDevice: false });
  });

  it('produces a gist and a word list after the sections', async () => {
    const { factory } = fakeFactory({});
    const { events } = await run(params(), factory);
    const gist = events.filter((e) => e.type === 'gist').at(-1);
    const words = events.filter((e) => e.type === 'words').at(-1);
    expect(gist).toMatchObject({ status: 'done', source: 'device' });
    expect(words).toMatchObject({ status: 'done', items: [{ term: 'tenant' }] });
  });

  it('retries in the cloud when the local model fails mid-page', async () => {
    const { factory } = fakeFactory({ deviceFails: true });
    const { sections } = await run(params(), factory);
    expect(sections.every((s) => s.status === 'done' && s.source === 'cloud')).toBe(true);
    expect(sections[0].fallback).toMatch(/cloud/);
  });

  it('does NOT retry in the cloud in private mode', async () => {
    const { factory, calls } = fakeFactory({ deviceFails: true });
    const { sections } = await run(params({ privateMode: true }), factory);
    expect(sections.every((s) => s.status === 'error')).toBe(true);
    expect(calls.every((c) => c.mode === 'only_on_device')).toBe(true);
  });

  it('refuses to start in private mode with no local model', async () => {
    const { factory, calls } = fakeFactory({ deviceAvailable: false });
    await expect(run(params({ privateMode: true, device: 'unavailable' }), factory)).rejects.toBeInstanceOf(BlockedError);
    expect(calls).toHaveLength(0);
  });

  it('sends a long page to the cloud in large pieces', async () => {
    const { factory } = fakeFactory({});
    const { sections, events } = await run(params({ text: page(45000) }), factory);
    const plan = events.find((e) => e.type === 'plan');
    expect(plan && plan.type === 'plan' && plan.decision.mode).toBe('prefer_in_cloud');
    expect(sections.length).toBeLessThanOrEqual(4);
    expect(sections.every((s) => s.source === 'cloud')).toBe(true);
  });

  it('falls back to the device, re-split to fit, when the cloud quota runs out', async () => {
    // The cloud fails; a cloud-sized piece is too big for the local model in one go.
    const { factory, calls } = fakeFactory({ cloudFails: true, deviceMaxPrompt: DEFAULT_CONFIG.deviceChunkChars + 200 });
    const { sections } = await run(params({ text: page(45000) }), factory);
    expect(sections.every((s) => s.status === 'done' && s.source === 'device')).toBe(true);
    expect(sections[0].fallback).toMatch(/device/);
    expect(calls.some((c) => c.mode === 'only_on_device')).toBe(true);
  });

  it('uses the cloud only for a language the local model cannot write', async () => {
    const { factory, calls } = fakeFactory({});
    const { sections } = await run(params({ language: 'ta' }), factory);
    expect(sections.every((s) => s.source === 'cloud')).toBe(true);
    expect(calls.every((c) => c.mode === 'only_in_cloud')).toBe(true);
  });

  it('says so when the SDK itself falls back from cloud to device', async () => {
    // Cloud fails, and the local model can take a cloud-sized piece: the SDK's
    // prefer_in_cloud mode answers from the device without throwing.
    const { factory } = fakeFactory({ cloudFails: true });
    const { sections, events } = await run(params({ text: page(45000) }), factory);
    expect(sections.every((s) => s.status === 'done' && s.source === 'device')).toBe(true);
    expect(sections[0].fallback).toMatch(/cloud could not be reached/);
    // The text was offered to the cloud first, so we must not claim it stayed local.
    expect(events.at(-1)).toMatchObject({ type: 'done', leftDevice: true });
  });

  it('reports honestly whether the page left the device', async () => {
    const local = await run(params(), fakeFactory({}).factory);
    expect(local.events.at(-1)).toMatchObject({ leftDevice: false });

    const retried = await run(params(), fakeFactory({ deviceFails: true }).factory);
    expect(retried.events.at(-1)).toMatchObject({ leftDevice: true });

    const privateRun = await run(params({ privateMode: true }), fakeFactory({ deviceFails: true }).factory);
    expect(privateRun.events.at(-1)).toMatchObject({ leftDevice: false });

    const cloud = await run(params({ language: 'ta' }), fakeFactory({}).factory);
    expect(cloud.events.at(-1)).toMatchObject({ leftDevice: true });
  });

  it('stops quietly when aborted', async () => {
    const { factory } = fakeFactory({});
    const controller = new AbortController();
    controller.abort();
    const { events, sections } = await run(params({ signal: controller.signal }), factory);
    expect(events.at(-1)).toMatchObject({ type: 'done', stopped: true });
    expect(sections.every((s) => s.status !== 'done')).toBe(true);
  });
});

describe('explain', () => {
  it('explains on the device and falls back to the cloud if the device fails', async () => {
    const ok = fakeFactory({});
    const first = await explain('tenant', sentence, params(), ok.factory, () => {});
    expect(first.source).toBe('device');

    const broken = fakeFactory({ deviceFails: true });
    const second = await explain('tenant', sentence, params(), broken.factory, () => {});
    expect(second.source).toBe('cloud');
    expect(second.fallback).toBeDefined();
  });
});

describe('helpers', () => {
  it('strips wrappers that small models add', () => {
    expect(cleanOutput('```\nHello\n```')).toBe('Hello');
    expect(cleanOutput('"""\nHello\n"""')).toBe('Hello');
  });

  it('explains common failures in plain words', () => {
    expect(friendlyError(new Error('fetch-error: 429 quota exceeded'))).toMatch(/quota/);
    expect(friendlyError(new Error('AppCheck token invalid 401'))).toMatch(/App Check/);
  });
});
