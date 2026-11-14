/**
 * PlainPage extension service worker.
 *
 * It does two small jobs: open the side panel, and tell the panel what the
 * reader asked for. All AI work happens in the side panel page, where
 * Firebase AI Logic and Chrome's on-device model are available.
 *
 * Clicking the toolbar button or the right-click menu counts as the reader
 * invoking PlainPage, which grants `activeTab` for that page only.
 */

const MENU_ID = 'plainpage-selection';
const REQUEST_KEY = 'plainpageRequest';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Make this plain with PlainPage',
    contexts: ['selection'],
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  // sidePanel.open must be called directly inside the user gesture.
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  void chrome.storage.session.set({
    [REQUEST_KEY]: { kind: 'page', tabId: tab.id, at: Date.now() },
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || tab.id === undefined) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  void chrome.storage.session.set({
    [REQUEST_KEY]: {
      kind: 'selection',
      tabId: tab.id,
      text: info.selectionText ?? '',
      title: tab.title ?? '',
      url: tab.url ?? '',
      at: Date.now(),
    },
  });
});
