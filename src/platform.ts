declare const __PLATFORM__: 'web' | 'extension' | undefined;

/** Which build this is: the hosted web app or the Chrome side-panel extension. */
export const PLATFORM: 'web' | 'extension' =
  typeof __PLATFORM__ !== 'undefined' && __PLATFORM__ === 'extension' ? 'extension' : 'web';

export const IS_EXTENSION = PLATFORM === 'extension';

/**
 * Development-only test harness: `npm run dev` then open /?mock to run the UI
 * against a fake on-device model, with no Firebase project needed.
 * It is compiled out of production builds.
 */
export const DEV_MOCK: boolean =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');
