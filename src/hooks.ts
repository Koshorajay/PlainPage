import { useCallback, useEffect, useRef, useState } from 'react';
import { getDeviceStatus } from './ai/device';
import { downloadDeviceModel } from './ai/models';
import { CAN_RUN, getAiService, HAS_CLOUD } from './firebase/app';
import { loadRemotePrefs, saveRemotePrefs, watchAccount, type Account } from './firebase/store';
import { loadLocalPrefs, sanitizePrefs, saveLocalPrefs, type Prefs } from './lib/prefs';
import type { DeviceStatus } from './types';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export interface DeviceModel {
  status: DeviceStatus;
  /** True until the first availability check returns. */
  checking: boolean;
  /** 0..1 while the model downloads, otherwise null. */
  progress: number | null;
  error: string | null;
  refresh: () => void;
  /** Starts the one-time model download. Call from a click. */
  download: () => void;
}

/** Tracks Chrome's built-in model: is it there, is it downloading, can we fetch it. */
export function useDeviceModel(): DeviceModel {
  const [status, setStatus] = useState<DeviceStatus>('unavailable');
  const [checking, setChecking] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getDeviceStatus().then((next) => {
      setStatus(next);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  // While a download is running elsewhere, keep checking until it lands.
  useEffect(() => {
    if (status !== 'downloading') return;
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [status, refresh]);

  const download = useCallback(() => {
    if (!CAN_RUN) return;
    setError(null);
    setProgress(0);
    setStatus('downloading');
    downloadDeviceModel(getAiService(), (fraction) => setProgress(Math.min(1, Math.max(0, fraction))))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'The download could not start.');
      })
      .finally(() => {
        setProgress(null);
        refresh();
      });
  }, [refresh]);

  return { status, checking, progress, error, refresh, download };
}

export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => watchAccount(setAccount), []);
  return account;
}

/**
 * Reading preferences: applied instantly from the device, then merged with
 * the copy in Firestore once the account is known, and written back on change.
 */
export function usePrefs(account: Account | null): [Prefs, (patch: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(loadLocalPrefs);
  const loadedFor = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const uid = account?.uid ?? null;

  useEffect(() => {
    if (!uid || !HAS_CLOUD || loadedFor.current === uid) return;
    loadedFor.current = uid;
    loadRemotePrefs(uid).then((remote) => {
      if (!remote) return;
      setPrefs((local) => {
        // Private mode is a per-device safety switch: never turn it on or off from the cloud.
        const merged = { ...sanitizePrefs(remote, local), privateMode: local.privateMode };
        saveLocalPrefs(merged);
        return merged;
      });
    });
  }, [uid]);

  const update = useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((current) => {
        const next = sanitizePrefs({ ...current, ...patch }, current);
        saveLocalPrefs(next);
        if (uid && HAS_CLOUD) {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = window.setTimeout(() => void saveRemotePrefs(uid, next), 900);
        }
        return next;
      });
    },
    [uid],
  );

  return [prefs, update];
}
