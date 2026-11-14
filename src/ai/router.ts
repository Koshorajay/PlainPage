import type { RuntimeConfig } from '../config';
import { languageName } from '../config';
import type { DeviceStatus } from '../types';

/**
 * The hybrid router.
 *
 * Firebase AI Logic gives us four inference modes. This file decides which one
 * each job should use, and says why in words a reader can understand. It is a
 * pure function so the same decision can be previewed in the UI before the
 * user presses the button, and unit-tested without a browser.
 *
 * Priorities, in order:
 *   1. Private mode   - the page must never leave the device.
 *   2. Offline        - only the device can answer.
 *   3. Language       - the on-device model writes a few languages; the rest need the cloud.
 *   4. No local model - let the SDK fall back to the cloud.
 *   5. Long page      - the cloud is much faster on long documents.
 *   6. Otherwise      - stay on the device: private, free and offline-capable.
 */

/** Mirrors firebase/ai InferenceMode values, kept as strings so this file has no SDK import. */
export type RouteMode = 'only_on_device' | 'prefer_on_device' | 'prefer_in_cloud' | 'only_in_cloud';

export type RouteReason =
  | 'private'
  | 'private-blocked-language'
  | 'private-blocked-device'
  | 'offline'
  | 'offline-blocked'
  | 'language'
  | 'no-device'
  | 'device-downloading'
  | 'long'
  | 'short';

export interface RouteInput {
  chars: number;
  language: string;
  privateMode: boolean;
  online: boolean;
  device: DeviceStatus;
  config: RuntimeConfig;
}

export interface RouteDecision {
  mode: RouteMode;
  /** Where we expect the work to run. 'blocked' means we will not run it at all. */
  expected: 'device' | 'cloud' | 'blocked';
  reason: RouteReason;
  /** Short label for chips and buttons. */
  label: string;
  /** One sentence for the reader explaining the choice. */
  explain: string;
  /** Chunk size to use for this route. */
  chunkChars: number;
  /** How many chunks may run at once. */
  concurrency: number;
}

export function deviceCanWrite(language: string, config: RuntimeConfig): boolean {
  return config.deviceLanguages.includes(language);
}

export function decideRoute(input: RouteInput): RouteDecision {
  const { chars, language, privateMode, online, device, config } = input;
  const deviceReady = device === 'available';
  const languageOk = deviceCanWrite(language, config);
  const lang = languageName(language);

  const onDevice = (reason: RouteReason, mode: RouteMode, label: string, explain: string): RouteDecision => ({
    mode,
    expected: 'device',
    reason,
    label,
    explain,
    chunkChars: config.deviceChunkChars,
    concurrency: 1,
  });
  const inCloud = (reason: RouteReason, mode: RouteMode, label: string, explain: string): RouteDecision => ({
    mode,
    expected: 'cloud',
    reason,
    label,
    explain,
    chunkChars: config.cloudChunkChars,
    concurrency: 2,
  });
  const blocked = (reason: RouteReason, mode: RouteMode, explain: string): RouteDecision => ({
    mode,
    expected: 'blocked',
    reason,
    label: 'Cannot run',
    explain,
    chunkChars: config.deviceChunkChars,
    concurrency: 1,
  });

  // 1. Private mode: never touch the network, even if that means saying no.
  if (privateMode) {
    if (!deviceReady) {
      return blocked(
        'private-blocked-device',
        'only_on_device',
        'Private mode needs the on-device model, and it is not ready on this browser. Turn Private mode off to use the cloud.',
      );
    }
    if (!languageOk) {
      return blocked(
        'private-blocked-language',
        'only_on_device',
        `The on-device model cannot write ${lang} yet. Turn Private mode off, or choose another language.`,
      );
    }
    return onDevice(
      'private',
      'only_on_device',
      'On this device',
      'Private mode is on. This text is rewritten on your device and is never sent anywhere.',
    );
  }

  // 2. Offline: the device is the only option.
  if (!online) {
    if (deviceReady && languageOk) {
      return onDevice(
        'offline',
        'only_on_device',
        'On this device',
        'You are offline, so the on-device model is doing the work.',
      );
    }
    return blocked(
      'offline-blocked',
      'only_on_device',
      deviceReady
        ? `You are offline and the on-device model cannot write ${lang}. Reconnect, or choose another language.`
        : 'You are offline and this browser has no on-device model. Reconnect to use the cloud.',
    );
  }

  // 3. Languages the local model cannot write go to the cloud.
  if (!languageOk) {
    return inCloud(
      'language',
      'only_in_cloud',
      'In the cloud',
      `Writing in ${lang} needs the cloud model, so this text is sent to Gemini in the cloud.`,
    );
  }

  // 4. No usable local model: ask for on-device anyway and let the SDK fall back.
  if (!deviceReady) {
    const downloading = device === 'downloadable' || device === 'downloading';
    return inCloud(
      downloading ? 'device-downloading' : 'no-device',
      'prefer_on_device',
      'In the cloud',
      downloading
        ? 'The on-device model is not downloaded yet, so the cloud is covering for it.'
        : 'This browser has no on-device model, so the cloud is covering for it.',
    );
  }

  // 5. Long pages: the cloud is far faster, with the device as a safety net.
  if (chars > config.deviceMaxChars) {
    return inCloud(
      'long',
      'prefer_in_cloud',
      'In the cloud',
      'This is a long page, so the cloud model handles it for speed. If the cloud cannot be reached, your device takes over.',
    );
  }

  // 6. The default: keep it local.
  return onDevice(
    'short',
    'prefer_on_device',
    'On this device',
    'This fits on your device, so it is rewritten locally. It is private, free and works offline.',
  );
}
