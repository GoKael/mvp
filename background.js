let latestSubtitle = null;
let lastSavedKey = '';
let lastSavedAt = 0;

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: 'dashboard/index.html'
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'NEW_SUBTITLE' || !message.data) return;

  const text = (message.data.text || '').trim();
  const title = (message.data.title || '').trim();
  const url = (message.data.url || '').trim();

  if (!text) return;

  latestSubtitle = {
    text,
    title,
    url,
    time: message.data.time || 0,
    capturedAt: Date.now()
  };

  chrome.storage.local.set({ latestSubtitle });

  const dedupeKey = `${title}__${text}`;
  const now = Date.now();
  if (dedupeKey === lastSavedKey && now - lastSavedAt < 2500) return;

  lastSavedKey = dedupeKey;
  lastSavedAt = now;

  chrome.storage.local.get(['capturedWords'], result => {
    const capturedWords = result.capturedWords || [];
    const newWord = { text, title, url, capturedAt: Date.now() };
    capturedWords.push(newWord);
    chrome.storage.local.set({ capturedWords });
  });
});
