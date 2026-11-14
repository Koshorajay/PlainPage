import {
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import type { SavedReading, SavedWord } from '../types';
import { getFirebaseApp, HAS_CLOUD } from './app';

/**
 * Accounts and saved data.
 *
 * - Firebase Authentication: everyone starts with an anonymous account, so
 *   saving works with zero sign-up. Linking a Google account keeps the same
 *   data and syncs it to other devices.
 * - Cloud Firestore: reading preferences, saved readings and the personal
 *   word list live under users/{uid}. The offline cache means the library
 *   still opens with no connection.
 */

export interface Account {
  uid: string;
  anonymous: boolean;
  name: string | null;
  email: string | null;
}

let auth: Auth | undefined;
let db: Firestore | undefined;

function getAuthService(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

function getDb(): Firestore {
  if (!db) {
    db = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return db;
}

function toAccount(user: User): Account {
  return { uid: user.uid, anonymous: user.isAnonymous, name: user.displayName, email: user.email };
}

/** Starts auth and keeps the caller informed. Returns an unsubscribe function. */
export function watchAccount(onChange: (account: Account | null) => void): () => void {
  if (!HAS_CLOUD) {
    onChange(null);
    return () => {};
  }
  try {
    const service = getAuthService();
    return onAuthStateChanged(service, (user) => {
      if (user) {
        onChange(toAccount(user));
        return;
      }
      onChange(null);
      signInAnonymously(service).catch((err) => {
        console.warn('[PlainPage] Anonymous sign-in failed (is it enabled in the Firebase console?):', err);
      });
    });
  } catch (err) {
    console.warn('[PlainPage] Auth unavailable:', err);
    onChange(null);
    return () => {};
  }
}

/** Upgrades the anonymous account to Google, keeping saved data. */
export async function signInWithGoogle(): Promise<void> {
  const service = getAuthService();
  const provider = new GoogleAuthProvider();
  const user = service.currentUser;
  if (user?.isAnonymous) {
    try {
      await linkWithPopup(user, provider);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      // This Google account already has PlainPage data: switch to it.
      if (code !== 'auth/credential-already-in-use' && code !== 'auth/email-already-in-use') throw err;
    }
  }
  await signInWithPopup(service, provider);
}

export async function signOutUser(): Promise<void> {
  await signOut(getAuthService());
}

// ---------- Preferences ----------

export async function loadRemotePrefs(uid: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(doc(getDb(), 'users', uid));
    const prefs = snap.data()?.prefs;
    return prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>) : null;
  } catch (err) {
    console.warn('[PlainPage] Could not load preferences:', err);
    return null;
  }
}

export async function saveRemotePrefs(uid: string, prefs: object): Promise<void> {
  try {
    await setDoc(doc(getDb(), 'users', uid), { prefs, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.warn('[PlainPage] Could not save preferences:', err);
  }
}

// ---------- Saved readings ----------

const MAX_SAVED_CHARS = 250000;

export function watchReadings(uid: string, onChange: (items: SavedReading[]) => void): () => void {
  const q = query(collection(getDb(), 'users', uid, 'readings'), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as Omit<SavedReading, 'id'>), id: d.id }))),
    (err) => console.warn('[PlainPage] Library unavailable:', err),
  );
}

export async function saveReading(uid: string, reading: Omit<SavedReading, 'id'>): Promise<string> {
  const data: Record<string, unknown> = {
    ...reading,
    title: reading.title.slice(0, 200),
    gist: reading.gist.slice(0, 2000),
    simplified: reading.simplified.slice(0, MAX_SAVED_CHARS),
  };
  // Firestore rejects undefined values.
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  const ref = await addDoc(collection(getDb(), 'users', uid, 'readings'), data);
  return ref.id;
}

export async function deleteReading(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'readings', id));
}

// ---------- My words ----------

export function watchWords(uid: string, onChange: (items: SavedWord[]) => void): () => void {
  const q = query(collection(getDb(), 'users', uid, 'words'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as Omit<SavedWord, 'id'>), id: d.id }))),
    (err) => console.warn('[PlainPage] Word list unavailable:', err),
  );
}

export async function saveWord(uid: string, word: Omit<SavedWord, 'id'>): Promise<void> {
  await addDoc(collection(getDb(), 'users', uid, 'words'), {
    ...word,
    term: word.term.slice(0, 80),
    meaning: word.meaning.slice(0, 600),
  });
}

export async function deleteWord(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'users', uid, 'words', id));
}
