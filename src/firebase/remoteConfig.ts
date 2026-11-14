import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config';
import { DEFAULT_CONFIG, type RuntimeConfig } from '../config';
import { getFirebaseApp, HAS_CLOUD } from './app';

/**
 * Firebase Remote Config holds the knobs of the hybrid router:
 * which cloud model to fall back to, how long a page may be before it goes to
 * the cloud, how big the pieces are, and which languages the local model can
 * write. They can be tuned from the Firebase console with no new release -
 * useful when Chrome ships a bigger on-device model or a new language.
 */

const KEYS = {
  cloudModel: 'cloud_model',
  deviceMaxChars: 'device_max_chars',
  deviceChunkChars: 'device_chunk_chars',
  cloudChunkChars: 'cloud_chunk_chars',
  deviceLanguages: 'device_languages',
  wordsEnabled: 'words_enabled',
  styleGuidance: 'style_guidance',
} as const;

let current: RuntimeConfig = { ...DEFAULT_CONFIG };

export function getRuntimeConfig(): RuntimeConfig {
  return current;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function read(rc: RemoteConfig): RuntimeConfig {
  const languages = getValue(rc, KEYS.deviceLanguages)
    .asString()
    .split(',')
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);

  return {
    cloudModel: getValue(rc, KEYS.cloudModel).asString().trim() || DEFAULT_CONFIG.cloudModel,
    deviceMaxChars: clamp(getValue(rc, KEYS.deviceMaxChars).asNumber(), 1000, 200000, DEFAULT_CONFIG.deviceMaxChars),
    deviceChunkChars: clamp(getValue(rc, KEYS.deviceChunkChars).asNumber(), 500, 12000, DEFAULT_CONFIG.deviceChunkChars),
    cloudChunkChars: clamp(getValue(rc, KEYS.cloudChunkChars).asNumber(), 2000, 200000, DEFAULT_CONFIG.cloudChunkChars),
    deviceLanguages: languages.length ? languages : DEFAULT_CONFIG.deviceLanguages,
    wordsEnabled: getValue(rc, KEYS.wordsEnabled).asBoolean(),
    styleGuidance: getValue(rc, KEYS.styleGuidance).asString().slice(0, 300),
  };
}

/** Loads Remote Config. Always resolves: on any failure the built-in defaults stay in place. */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (!HAS_CLOUD) return current;
  try {
    const rc = getRemoteConfig(getFirebaseApp());
    rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 60 * 60 * 1000;
    rc.settings.fetchTimeoutMillis = 8000;
    rc.defaultConfig = {
      [KEYS.cloudModel]: DEFAULT_CONFIG.cloudModel,
      [KEYS.deviceMaxChars]: DEFAULT_CONFIG.deviceMaxChars,
      [KEYS.deviceChunkChars]: DEFAULT_CONFIG.deviceChunkChars,
      [KEYS.cloudChunkChars]: DEFAULT_CONFIG.cloudChunkChars,
      [KEYS.deviceLanguages]: DEFAULT_CONFIG.deviceLanguages.join(','),
      [KEYS.wordsEnabled]: DEFAULT_CONFIG.wordsEnabled,
      [KEYS.styleGuidance]: DEFAULT_CONFIG.styleGuidance,
    };
    // Use whatever was activated last time straight away, then refresh.
    current = read(rc);
    await fetchAndActivate(rc);
    current = read(rc);
  } catch (err) {
    console.warn('[PlainPage] Remote Config unavailable, using defaults:', err);
  }
  return current;
}
