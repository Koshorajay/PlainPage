import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config';
import { decideRoute, type RouteInput } from './router';

const base: RouteInput = {
  chars: 2000,
  language: 'en',
  privateMode: false,
  online: true,
  device: 'available',
  config: DEFAULT_CONFIG,
};

describe('decideRoute', () => {
  it('keeps a short English page on the device', () => {
    const d = decideRoute(base);
    expect(d.mode).toBe('prefer_on_device');
    expect(d.expected).toBe('device');
    expect(d.chunkChars).toBe(DEFAULT_CONFIG.deviceChunkChars);
    expect(d.concurrency).toBe(1);
  });

  it('sends a long page to the cloud but keeps the device as a safety net', () => {
    const d = decideRoute({ ...base, chars: DEFAULT_CONFIG.deviceMaxChars + 1 });
    expect(d.mode).toBe('prefer_in_cloud');
    expect(d.expected).toBe('cloud');
    expect(d.chunkChars).toBe(DEFAULT_CONFIG.cloudChunkChars);
  });

  it('sends languages the local model cannot write to the cloud only', () => {
    const d = decideRoute({ ...base, language: 'ta' });
    expect(d.mode).toBe('only_in_cloud');
    expect(d.reason).toBe('language');
  });

  it('lets the SDK fall back to the cloud when there is no local model', () => {
    const d = decideRoute({ ...base, device: 'unavailable' });
    expect(d.mode).toBe('prefer_on_device');
    expect(d.expected).toBe('cloud');
    expect(d.reason).toBe('no-device');
  });

  it('covers with the cloud while the local model downloads', () => {
    expect(decideRoute({ ...base, device: 'downloading' }).reason).toBe('device-downloading');
    expect(decideRoute({ ...base, device: 'downloadable' }).reason).toBe('device-downloading');
  });

  it('never leaves the device in private mode, even for a long page', () => {
    const d = decideRoute({ ...base, privateMode: true, chars: 500000 });
    expect(d.mode).toBe('only_on_device');
    expect(d.expected).toBe('device');
  });

  it('refuses rather than leak in private mode when the device cannot do the job', () => {
    const noModel = decideRoute({ ...base, privateMode: true, device: 'unavailable' });
    expect(noModel.expected).toBe('blocked');
    expect(noModel.mode).toBe('only_on_device');

    const language = decideRoute({ ...base, privateMode: true, language: 'hi' });
    expect(language.expected).toBe('blocked');
    expect(language.reason).toBe('private-blocked-language');
  });

  it('uses only the device when offline', () => {
    const d = decideRoute({ ...base, online: false, chars: 90000 });
    expect(d.mode).toBe('only_on_device');
    expect(d.reason).toBe('offline');
  });

  it('blocks when offline with no local model', () => {
    const d = decideRoute({ ...base, online: false, device: 'unavailable' });
    expect(d.expected).toBe('blocked');
    expect(d.reason).toBe('offline-blocked');
  });

  it('follows Remote Config: more device languages and a higher length limit', () => {
    const config = { ...DEFAULT_CONFIG, deviceLanguages: ['en', 'hi'], deviceMaxChars: 50000 };
    expect(decideRoute({ ...base, language: 'hi', config }).expected).toBe('device');
    expect(decideRoute({ ...base, chars: 40000, config }).mode).toBe('prefer_on_device');
  });
});
