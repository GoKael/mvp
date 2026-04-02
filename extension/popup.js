// popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NEW_SUBTITLE") {
    document.getElementById("subtitle-text").innerText = message.data.text;
    document.getElementById("video-title").innerText = message.data.title;
  }
});

document.getElementById("save-btn").addEventListener("click", () => {
  const text = document.getElementById("subtitle-text").innerText;
  const title = document.getElementById("video-title").innerText;
  
  // Real-time backend save
  fetch('http://localhost:3000/api/save-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, title, url: window.location.href })
  })
  .then(res => res.json())
  .then(data => {
    document.getElementById("status-msg").innerText = "Success! (Hán-Việt: " + (data.hanViet || 'N/A') + ")";
    setTimeout(() => { document.getElementById("status-msg").innerText = ""; }, 3000);
  })
  .catch(err => {
    document.getElementById("status-msg").innerText = "Server not reachable.";
  });

  // Also keep local storage for offline
  chrome.storage.local.get({ savedWords: [] }, (result) => {
    const savedWords = result.savedWords;
    savedWords.push({ text, title, date: new Date().toISOString() });
    chrome.storage.local.set({ savedWords });
  });
});
