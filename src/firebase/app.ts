import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { CustomProvider, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { DEV_MOCK, IS_EXTENSION } from '../platform';

/**
 * Firebase bootstrap: the app, App Check and Firebase AI Logic.
 *
 * Everything uses the no-cost Spark plan:
 *   - Firebase AI Logic with the Gemini Developer API backend (GoogleAIBackend),
 *     which has a free tier and needs no billing account.
 *   - App Check with reCAPTCHA v3 (free) on the hosted site, or a debug token
 *     on localhost and in the unpacked extension.
 */

const env = import.meta.env;

const realConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

/** True when the developer has filled in .env.local. */
export const HAS_FIREBASE_CONFIG = Boolean(realConfig.apiKey && realConfig.projectId && realConfig.appId);

/** True when the app can run prompts at all (real project, or the dev mock). */
export const CAN_RUN = HAS_FIREBASE_CONFIG || DEV_MOCK;

/** Cloud services (Auth, Firestore, Remote Config, cloud inference) need a real project. */
export const HAS_CLOUD = HAS_FIREBASE_CONFIG && !DEV_MOCK;

export type AppCheckMode = 'recaptcha' | 'debug' | 'off';

let app: FirebaseApp | undefined;
let ai: AI | undefined;
let appCheckMode: AppCheckMode = 'off';

function startAppCheck(firebaseApp: FirebaseApp): AppCheckMode {
  const siteKey = env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;

  if (debugToken) {
    // A registered debug token: used on localhost and in the unpacked extension.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken === 'true' ? true : debugToken;
  }

  try {
    if (siteKey && !IS_EXTENSION) {
      initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      return debugToken ? 'debug' : 'recaptcha';
    }
    if (debugToken) {
      // Extensions cannot load the reCAPTCHA script (Manifest V3 forbids remote
      // code), so the debug token is the attestation. In debug mode the SDK
      // never calls this provider.
      initializeAppCheck(firebaseApp, {
        provider: new CustomProvider({
          getToken: () => Promise.reject(new Error('PlainPage: App Check debug token is not registered.')),
        }),
        isTokenAutoRefreshEnabled: true,
      });
      return 'debug';
    }
  } catch (err) {
    console.warn('[PlainPage] App Check could not start:', err);
  }
  return 'off';
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!CAN_RUN) throw new Error('Firebase is not configured. Copy .env.example to .env.local and fill it in.');
  app = initializeApp(
    HAS_CLOUD ? realConfig : { apiKey: 'dev-mock', projectId: 'plainpage-dev-mock', appId: '1:0:web:devmock' },
  );
  if (HAS_CLOUD) appCheckMode = startAppCheck(app);
  return app;
}

/** The Firebase AI Logic service, on the free Gemini Developer API backend. */
export function getAiService(): AI {
  if (!ai) ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  return ai;
}

export function getAppCheckMode(): AppCheckMode {
  return appCheckMode;
}
