// content.js
console.log("Subtitle Capture Extension Loaded");

let lastSubtitle = "";

const observer = new MutationObserver((mutations) => {
  const captionWindow = document.querySelector(".ytp-caption-window-container");
  if (captionWindow) {
    const currentText = captionWindow.innerText.trim().replace(/\n/g, " ");
    if (currentText && currentText !== lastSubtitle) {
      lastSubtitle = currentText;
      console.log("Captured Subtitle:", lastSubtitle);
      
      const videoTitle = document.querySelector("h1.ytd-video-primary-info-renderer")?.innerText || document.title;
      const videoPlayer = document.querySelector('video');
      const timestamp = videoPlayer ? videoPlayer.currentTime : 0;

      // Broadcast to popup or background
      chrome.runtime.sendMessage({
        type: "NEW_SUBTITLE",
        data: {
          text: lastSubtitle,
          title: videoTitle,
          time: timestamp,
          url: window.location.href
        }
      }).catch(err => {
        // Suppress errors when popup is closed
      });
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
