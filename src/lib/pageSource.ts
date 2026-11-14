import type { SourceDoc } from '../types';
import { extractPage, toSourceDoc } from './extract';

/**
 * Extension only: reads the page in the active tab.
 *
 * PlainPage asks for the narrowest permission that works. Clicking the toolbar
 * button (or the right-click menu) grants `activeTab` for that page only.
 * A reader who wants PlainPage to follow them from site to site can opt in to
 * wider access from the panel.
 */

export interface TabInfo {
  id: number;
  title: string;
  url: string;
}

export class NeedsAccessError extends Error {
  constructor() {
    super('PlainPage does not have access to this page yet.');
    this.name = 'NeedsAccessError';
  }
}

export interface PanelRequest {
  kind: 'page' | 'selection';
  tabId: number;
  text?: string;
  title?: string;
  url?: string;
  at: number;
}

const REQUEST_KEY = 'plainpageRequest';

export async function getActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.id === undefined) return null;
  return { id: tab.id, title: tab.title ?? '', url: tab.url ?? '' };
}

export async function readTab(tabId?: number): Promise<SourceDoc> {
  const id = tabId ?? (await getActiveTab())?.id;
  if (id === undefined) throw new Error('No page is open.');

  let results: chrome.scripting.InjectionResult<ReturnType<typeof extractPage>>[];
  try {
    results = await chrome.scripting.executeScript({ target: { tabId: id }, func: extractPage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cannot be scripted|chrome:\/\/|extensions gallery|edge:\/\/|about:/i.test(message)) {
      throw new Error('Chrome does not let extensions read this kind of page. Try a normal web page.');
    }
    throw new NeedsAccessError();
  }

  const result = results[0]?.result;
  if (!result || result.text.trim().length < 20) {
    throw new Error('PlainPage could not find readable text on this page.');
  }
  return toSourceDoc(result.text, result.title, result.url);
}

/** Asks Chrome for permission to read every site, so the panel can follow the reader. */
export async function requestAllSites(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

export async function hasAllSites(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

function isFresh(request: PanelRequest | undefined): request is PanelRequest {
  return Boolean(request && typeof request.at === 'number' && Date.now() - request.at < 15000);
}

/** The toolbar button and right-click menu hand work to the panel through session storage. */
export function watchPanelRequests(onRequest: (request: PanelRequest) => void): () => void {
  let lastHandled = 0;
  const handle = (request: PanelRequest | undefined) => {
    if (!isFresh(request) || request.at <= lastHandled) return;
    lastHandled = request.at;
    onRequest(request);
  };

  chrome.storage.session.get(REQUEST_KEY).then((stored) => handle(stored[REQUEST_KEY] as PanelRequest | undefined));

  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'session' && changes[REQUEST_KEY]) handle(changes[REQUEST_KEY].newValue as PanelRequest | undefined);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function watchActiveTab(onChange: (tab: TabInfo | null) => void): () => void {
  const refresh = () => {
    getActiveTab().then(onChange, () => onChange(null));
  };
  const onUpdated = (_id: number, info: { status?: string; title?: string; url?: string }) => {
    if (info.status === 'complete' || info.title || info.url) refresh();
  };
  refresh();
  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener(onUpdated);
  return () => {
    chrome.tabs.onActivated.removeListener(refresh);
    chrome.tabs.onUpdated.removeListener(onUpdated);
  };
}
