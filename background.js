const MENU_ID = 'lexa-add-selection';
const STORAGE_KEY = 'lexaCapturedPhrases';

function openLexa(route = 'words') {
  chrome.tabs.create({ url: chrome.runtime.getURL(`index.html#/${route}`) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: '加入 Lexa 學習佇列：「%s」',
      contexts: ['selection'],
    });
  });
});

chrome.action.onClicked.addListener(() => openLexa('today'));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = String(info.selectionText || '').trim();
  if (!text) return;

  chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
    const entries = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    const capturedAt = Date.now();
    const entry = {
      id: `capture:${capturedAt}`,
      text,
      title: tab?.title || '',
      url: tab?.url || '',
      capturedAt,
    };
    const next = [entry, ...entries.filter((item) => item.text !== text || item.url !== entry.url)].slice(0, 100);
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => openLexa('words'));
  });
});
