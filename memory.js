// memory.js
const sentences = [
  { viet: "Anh ấy là ứng cử viên.", words: ["Anh", "ấy", "là", "ứng cử viên"], trans: ["He", "that", "is", "candidate"], focal: 3 },
  { viet: "Tôi đang học tiếng Việt.", words: ["Tôi", "đang", "học", "tiếng", "Việt"], trans: ["I", "am", "studying", "language", "Vietnamese"], focal: 2 }
];

let currentIndex = 0;
let vault = {};
let vaultArrayCache = [];
let cachedVoices = [];
let voicesReady = false;
let voicesPollTimer = null;

function normalizeKey(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .trim();
}

const BASIC_TRANSLATIONS = {
  day: 'this / here',
  la: 'is / are',
  mot: 'one / a',
  vi: 'because / by',
  du: 'example',
  cho: 'for',
  tu: 'word / from',
  thi: 'exam',
  sinh: 'student / candidate',
  thisinh: 'candidate',
  'thi sinh': 'candidate',
  voi: 'with / and / to',
  toi: 'I / me',
  ban: 'you / friend',
  khong: 'not',
  noi: 'speak / say',
  hay: 'please / or',
  can: 'need',
  gi: 'what',
  nhe: 'please (soft particle)'
};

function getWordTranslation(word, item) {
  if (item && item.trans && item.trans.trim()) return item.trans.trim();
  const k = normalizeKey(word);
  if (BASIC_TRANSLATIONS[k]) return BASIC_TRANSLATIONS[k];
  return null;
}

async function fetchGoogleTranslate(text, from='vi', to='en') {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (e) {
    console.error('Google Translation failed', e);
    return null;
  }
}

function buildThreeExamples(word, rawExamples) {
  const examples = Array.isArray(rawExamples) ? rawExamples.filter(Boolean) : [];
  const w = word || '';
  const fallback = [
    `Tôi học được từ ${w} rất thú vị.`,
    `Bạn có thể sử dụng ${w} trong câu không?`,
    `Đây là một ví dụ về ${w}.`
  ];
  const merged = [...examples];
  for (const ex of fallback) {
    if (merged.length >= 3) break;
    merged.push(ex);
  }
  return merged.slice(0, 3);
}

function ensureVoicesReady(callback) {
  const attempt = () => {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length > 0) {
      cachedVoices = v;
      voicesReady = true;
      if (voicesPollTimer) clearInterval(voicesPollTimer);
      callback();
      return true;
    }
    return false;
  };
  if (attempt()) return;
  voicesPollTimer && clearInterval(voicesPollTimer);
  voicesPollTimer = setInterval(() => {
    if (attempt()) return;
  }, 200);
  setTimeout(() => {
    if (!voicesReady) {
      voicesPollTimer && clearInterval(voicesPollTimer);
      callback();
    }
  }, 2000);
}

function getVaultKey(word) {
  const normalized = normalizeKey(word);
  if (vault[word]) return word;
  if (vault[normalized]) return normalized;
  const k = Object.keys(vault).find(key => normalizeKey(key) === normalized);
  return k || word;
}

async function fetchVault() {
  console.log('Memory: fetchVault started');
  // Loading the updated 1k list as requested
  const dataPath = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('server/data/lr_1k.json')
    : 'server/data/lr_1k.json';
    
  let initialVaultMap = {};
  try {
    const res = await fetch(dataPath);
    initialVaultMap = await res.json();
    console.log('Memory: initialVaultMap loaded', Object.keys(initialVaultMap).length);
  } catch (e) {
    console.error('Memory: failed to fetch vault data', e);
  }

  let storedStatuses = {};
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    storedStatuses = await new Promise(resolve => {
      chrome.storage.local.get(['vaultWordStatuses'], result => {
        resolve(result.vaultWordStatuses || {});
      });
    });
  }

  vault = {};
  for (const word in initialVaultMap) {
    const normKey = normalizeKey(word);
    vault[normKey] = { ...initialVaultMap[word], rawWord: word };
    if (storedStatuses[word] !== undefined) {
      vault[normKey].status = storedStatuses[word];
    }
  }
  vaultArrayCache = Object.values(vault).sort((a,b) => (a.rank || 9999) - (b.rank || 9999));
  console.log('Memory: final normalized vault loaded', Object.keys(vault).length);
}

let currentLevel = parseInt(localStorage.getItem('learningRange') || '1000');
const rangeSteps = [100, 300, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
let sessionSize = 10;
let practicePool = [];
let dictPinned = false;
let dictPinnedWord = null;
function updateTodayPracticeCounter() {
  const today = new Date().toISOString().slice(0, 10);
  chrome.storage.local.get(['dailyLearnedWords'], result => {
    const d = result.dailyLearnedWords || {};
    let count = 0;
    if (d[today]) {
      if (Array.isArray(d[today])) count = d[today].length;
      else if (d[today] instanceof Set) count = d[today].size;
    }
    const el = document.getElementById('today-practice-val');
    if (el) el.innerText = count;
    let emoji = '😭';
    if (count >= 200) emoji = '🐢👑';
    else if (count >= 100) emoji = '😎💯';
    else if (count >= 50) emoji = '🙂';
    else if (count > 0) emoji = '💪';
    const em = document.getElementById('today-emoji');
    if (em) em.innerText = emoji;
  });
}

function updateRangeDisplay(index) {
  const val = rangeSteps[index] || 1000;
  currentLevel = val;
  localStorage.setItem('learningRange', val.toString());
  const label = document.getElementById('range-val');
  if (label) {
    if (val === 10000) label.innerText = "Master 10k";
    else if (val >= 1000) label.innerText = `Core ${val/1000}k`;
    else label.innerText = `Core ${val}`;
  }
  console.log("Memory: currentLevel updated to", currentLevel);
}

function updateSessionSize(val) {
  sessionSize = parseInt(val, 10);
  const valEl = document.getElementById('session-size-val');
  if (valEl) valEl.innerText = sessionSize;
  console.log("Memory: sessionSize updated to", sessionSize);
}

function resetSettings() {
  currentLevel = 1000;
  localStorage.setItem('learningRange', '1000');
  sessionSize = 10;
  const sSlider = document.getElementById('session-slider');
  if (sSlider) sSlider.value = '10';
  const rSlider = document.getElementById('range-slider');
  if (rSlider) rSlider.value = '3'; // Index 3 is 1000
  updateRangeDisplay(3);
  updateSessionSize(10);
  console.log("Memory: settings reset to 1k Core");
}

async function refreshHeatmap() {
  const hm = document.getElementById('gh-heatmap');
  if (!hm) return;
  hm.innerHTML = '';

  const dailyLearnedWords = await new Promise(resolve => {
    chrome.storage.local.get(['dailyLearnedWords'], result => {
      const data = result.dailyLearnedWords || {};
      for (const date in data) {
        data[date] = new Set(data[date]);
      }
      resolve(data);
    });
  });

  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const heatmapData = {};

  for (let i = 0; i < 90; i++) {
    const d = new Date(today.getTime() - i * oneDay);
    const dateString = d.toISOString().slice(0, 10);
    heatmapData[dateString] = dailyLearnedWords[dateString] ? dailyLearnedWords[dateString].size : 0;
  }

  // Optimized heatmap rendering (90 days = ~13 weeks)
  for (let i = 0; i < 91; i++) {
    const d = new Date(today.getTime() - (90 - i) * oneDay);
    const dateString = d.toISOString().slice(0, 10);
    const count = heatmapData[dateString] || 0;

    let color = 'rgba(255, 255, 255, 0.05)';
    if (count > 100) color = 'var(--accent-gold)';
    else if (count >= 50) color = 'rgba(255, 152, 0, 0.7)';
    else if (count >= 20) color = 'rgba(255, 152, 0, 0.4)';
    else if (count > 0) color = 'rgba(255, 152, 0, 0.2)';

    const box = document.createElement('div');
    box.style.width = '11px';
    box.style.height = '11px';
    box.style.borderRadius = '2px';
    box.style.background = color;
    box.title = `${dateString}: ${count} words`;
    hm.appendChild(box);
  }

  updateTodayPracticeCounter();
}

function updateCounts() {
  let known = 0, learn = 0, suggest = 0;
  const learnWords = [];
  const sortedWords = Object.values(vault);
  sortedWords.forEach(i => {
    const status = i.status !== undefined ? i.status : 0;
    if(status === 2) known++;
    else if(status === 1) {
      learn++;
      learnWords.push(i);
    }
    else suggest++;
  });
  
  const ek = document.getElementById('count-known');
  const el = document.getElementById('count-learn');
  const es = document.getElementById('count-suggest');
  if (ek) ek.innerText = known;
  if (el) el.innerText = learn;
  if (es) es.innerText = suggest;

  // Populate suggestions container with actual "Learning" words
  const sugContainer = document.getElementById('suggestions-container');
  if (sugContainer) {
    sugContainer.innerHTML = '';
    const displayWords = learnWords.length > 0 ? learnWords.slice(0, 12) : sortedWords.filter(w => w.status === 0 || !w.status).slice(0, 12);
    displayWords.forEach(w => {
      const chip = document.createElement('div');
      chip.style.cssText = 'padding:4px 10px; background:rgba(255,255,255,0.05); border-radius:4px; font-size:12px; color:#e2e8f0; cursor:pointer; border:1px solid rgba(255,255,255,0.1); transition:0.2s;';
      chip.innerText = w.word;
      chip.onmouseenter = () => { chip.style.background = 'rgba(255,255,255,0.1)'; chip.style.borderColor = 'var(--accent-gold)'; };
      chip.onmouseleave = () => { chip.style.background = 'rgba(255,255,255,0.05)'; chip.style.borderColor = 'rgba(255,255,255,0.1)'; };
      chip.onclick = () => showSidebar(w);
      sugContainer.appendChild(chip);
    });
  }
}

function startSession() {
  if (vaultArrayCache.length === 0) {
    alert("Vocabulary data is still loading... Please wait a few seconds.");
    return;
  }
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('practice-screen').style.display = 'block';
  // Hide sidebar if open to focus on practice
  document.getElementById('dict-sidebar').style.display = 'none';
  document.getElementById('main-container').style.marginRight = 'auto';
  
  practicePool = [];
  dictPinned = false;
  dictPinnedWord = null;
  
  // Slice dictionary boundary strictly using global user learningRange bound limit
  const domainWords = vaultArrayCache.slice(0, currentLevel);
  
  if (domainWords.length > 0) {
    const generated = [];
    domainWords.forEach(item => {
      let ex = '';
      const examples = (item.examples && item.examples.length > 0)
        ? item.examples.slice(0, 3)
        : [
            `Tôi học từ ${item.word} hôm nay.`,
            `${item.word} là một từ rất phổ biến.`,
            `Bạn có biết ${item.word} nghĩa là gì không?`
          ];
      examples.forEach(exObj => {
        const ex = (typeof exObj === 'string') ? exObj : (exObj && exObj.v) ? exObj.v : '';
        if (!ex) return;
        const lc = ex.toLowerCase();
        const lp = item.word.toLowerCase();
        const idx = lc.indexOf(lp);
        let words = [];
        let focalIndex = 0;
        if (idx >= 0) {
          const left = ex.slice(0, idx).trim();
          const right = ex.slice(idx + item.word.length).trim();
          const leftTokens = left ? left.split(/\s+/) : [];
          const rightTokens = right ? right.split(/\s+/) : [];
          words = [...leftTokens, item.word, ...rightTokens];
          focalIndex = leftTokens.length;
        } else {
          words = ex.split(/\s+/);
          const fi = words.findIndex(part => normalizeKey(part) === normalizeKey(item.word));
          focalIndex = fi >= 0 ? fi : 0;
        }
        generated.push({
          viet: ex,
          words,
          focal: focalIndex >= 0 ? focalIndex : 0,
          baseWord: item.word,
          en: (exObj && exObj.e) ? exObj.e : '',
          cn: (exObj && exObj.c) ? exObj.c : ''
        });
      });
    });
    
    // Shuffle the generated sentences
    generated.sort(() => Math.random() - 0.5);
    
    // Eliminate identical sentences by filtering set
    const seenSentences = new Set();
    const dedupedGenerated = [];
    for(const gen of generated) {
      if (!seenSentences.has(gen.viet)) {
         seenSentences.add(gen.viet);
         dedupedGenerated.push(gen);
      }
    }

    practicePool = dedupedGenerated.slice(0, sessionSize);
    
    if (practicePool.length === 0) {
      practicePool = sentences.slice(0, sessionSize);
    }
  } else {
    practicePool = [];
    for(let i=0; i < sessionSize; i++) {
      practicePool.push(sentences[i % sentences.length]);
    }
  }
  
  if (practicePool.length === 0) {
    if (domainWords.length === 0) {
       console.error("No words in selected level range!");
       alert("No words found for this level. Please choose a different range.");
       resetSession();
       return;
    }
  }

  currentIndex = 0;
  
  const sArea = document.getElementById('sentence-area');
  if (sArea) {
    sArea.onclick = () => {
       if (currentIndex < practicePool.length) {
         speak(practicePool[currentIndex].viet);
       }
    };
  }
  
  renderSentence();
}

let hoverTimeout;
let popoverPinned = false;

function renderSentence() {
  try {
    if (!practicePool || currentIndex >= practicePool.length) {
      const qc = document.getElementById('quiz-card');
      if (qc) {
        qc.onclick = null;
        qc.style.background = 'transparent';
        qc.style.border = 'none';
        qc.style.boxShadow = 'none';
      }
      const area = document.getElementById('sentence-area');
      if (area) {
        area.innerHTML = `
          <div style="font-size:32px; width:100%; text-align:center; margin-bottom:20px; font-family:var(--serif);">Session Complete! 🎉</div>
          <button id="reset-session-btn" style="padding:16px 32px; font-size:16px; font-weight:900; background:var(--accent-gold); color:black; border:none; border-radius:12px; cursor:pointer; margin:0 auto; display:block; box-shadow: 0 10px 20px rgba(0,0,0,0.2);">Back to Dashboard</button>
        `;
        const resetBtn = document.getElementById('reset-session-btn');
        if (resetBtn) resetBtn.onclick = () => resetSession();
      }
      const progress = document.getElementById('progress-counter');
      if (progress) progress.innerText = `${sessionSize} / ${sessionSize}`;
      const fill = document.getElementById('status-fill');
      if (fill) fill.style.width = '100%';
      const hint = document.getElementById('focal-word-hint');
      if (hint) hint.innerText = 'Done';
      const tBox = document.getElementById('trans-box');
      if (tBox) tBox.style.display = 'none';
      return;
    }
    
    const s = practicePool[currentIndex];
    const area = document.getElementById('sentence-area');
    if (!area) return;
    area.innerHTML = '';
    
    const focalWord = s.words[s.focal] || '...';
    const focalHint = document.getElementById('focal-word-hint');
    if (focalHint) focalHint.innerText = focalWord;

    const quizCard = document.getElementById('quiz-card');
    if (quizCard) {
      quizCard.onclick = () => speak(s.viet);
    }

    // Handle Translations Safely
    const transBox = document.getElementById('trans-box');
    const enTrans = document.getElementById('sentence-trans-en');
    const cnTrans = document.getElementById('sentence-trans-cn');
    if (transBox && enTrans && cnTrans) {
      const hasEn = s.en && s.en !== '...' && s.en.trim().length > 0;
      const hasCn = s.cn && s.cn !== '...' && s.cn.trim().length > 0;
      
      enTrans.innerText = hasEn ? s.en : "Translation loading...";
      cnTrans.innerText = hasCn ? s.cn : "正在加載翻譯...";
      transBox.style.display = 'flex';
      transBox.style.opacity = (hasEn || hasCn) ? '1' : '0.3';
    }

  s.words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = `word-token ${i === s.focal ? 'focal' : ''}`;
    span.innerText = word;
    span.dataset.wordIndex = i; // tag for mousemove lookup
    
    const cleanWord = word.replace(/[.,!?]/g, '').toLowerCase();
    const keyClean = getVaultKey(cleanWord);
    const keyBase = getVaultKey(s.baseWord);
    const vaultItem = vault[keyClean] || (i === s.focal ? vault[keyBase] : null);
    span._vaultItem = vaultItem;
    span._cleanWord = cleanWord;
    span._rawWord = word;
    
    if (vaultItem) {
      if (vaultItem.status === 2) span.style.color = '#4ade80';
      else if (vaultItem.status === 1) span.style.color = '#fb923c';
      else if (i === s.focal) span.style.color = 'var(--accent-gold)'; // Default focal color
    } else if (i === s.focal) {
      span.style.color = 'var(--accent-gold)';
    }

    // Click: open sidebar + speak
    span.onclick = (e) => {
      e.stopPropagation();
      showSidebar({ word: vaultItem ? (vaultItem.word || cleanWord) : word, ...(vaultItem || {}) }, s);
      dictPinned = true;
      speak(span.innerText);
    };

    span.onmouseenter = (e) => {
      clearTimeout(hoverTimeout);
      const vi = span._vaultItem;
      const transText = getWordTranslation(span._cleanWord, vi);
      showPopover(span, vi ? span._cleanWord : span._rawWord, transText);
    };

    span.onmouseleave = (e) => {
      const popover = document.getElementById('hover-popover');
      const rt = e.relatedTarget;
      if (popover && (rt === popover || (rt && popover.contains(rt)))) return;
      if (!popoverPinned) hoverTimeout = setTimeout(hidePopover, 400); // 400ms delay for bridge
    };
    area.appendChild(span);
  });

  area.onmouseleave = (e) => {
    const popover = document.getElementById('hover-popover');
    const rt = e.relatedTarget;
    if (popover && (rt === popover || (rt && popover.contains(rt)))) {
      return;
    }
    if (!popoverPinned) hoverTimeout = setTimeout(hidePopover, 400);
  };

  document.getElementById('progress-counter').innerText = `${currentIndex + 1} / ${sessionSize}`;
  const progress = ((currentIndex) / sessionSize) * 100;
  document.getElementById('status-fill').style.width = `${progress}%`;
  
  // Sync
  if (!dictPinned) {
     const fw = s.words[s.focal];
     const cleanFW = fw.replace(/[.,!?]/g, '').toLowerCase();
     const vaultFW = vault[getVaultKey(cleanFW)] || vault[getVaultKey(s.baseWord)];
     showSidebar({ word: vaultFW ? vaultFW.word : cleanFW, ...(vaultFW || {}) }, s);
  }
  } catch (err) {
    console.error("Lexa Render Error:", err);
    const area = document.getElementById('sentence-area');
    if (area) area.innerHTML = `<div style="color:red; font-size:14px; text-align:center;">Error rendering sentence. Skipping...</div>`;
    setTimeout(() => nextSentence(), 1500);
  }
}

function showPopover(span, word, text) {
  const pop = document.getElementById('hover-popover');
  
  const rect = span.getBoundingClientRect();
  pop.style.left = `${rect.left + rect.width / 2}px`;
  pop.style.top = `${rect.bottom + 2}px`; // Reduced gap to 2px for better hover stability
  pop.style.pointerEvents = 'auto';
  pop.style.zIndex = '9999';
  
  const normalized = (word || '').replace(/[.,!?]/g, '').toLowerCase();
  const vi = vault[getVaultKey(normalized)];
  let finalText = text;
  
  // Prepare content with buttons
  const renderContent = (content) => {
    pop.innerHTML = `
      <div style="font-weight:bold; margin-bottom: 8px; text-align:center; font-size:16px;">${content || '?'}</div>
      <div class="popover-buttons">
        <button data-word="${word.replace(/"/g, '&quot;')}" data-status="2" class="popover-btn popover-mark-btn" style="background:#4ade80; color:#000;">✅ Known</button>
        <button data-word="${word.replace(/"/g, '&quot;')}" data-status="1" class="popover-btn popover-mark-btn" style="background:#fb923c; color:#fff;">📖 Learn</button>
        <button data-word="${word.replace(/"/g, '&quot;')}" data-status="0" class="popover-btn popover-mark-btn" style="background:#444; color:#e2e8f0;">⛔ Ignore</button>
      </div>
    `;
    pop.style.display = 'block';
  };

  if (!finalText || finalText === '...' || finalText === '—') {
    finalText = getWordTranslation(normalized, vi);
  }

  if (!finalText) {
    renderContent('Translating...');
    fetchGoogleTranslate(normalized).then(translated => {
       // Update only if popover is still visible for this word
       if (pop.style.display === 'block') {
         renderContent(translated || 'no translation');
       }
    });
  } else {
    renderContent(finalText);
  }
}

const popoverEl = document.getElementById('hover-popover');
if (popoverEl) {
  popoverEl.onmouseenter = () => {
    popoverPinned = true;
    clearTimeout(hoverTimeout);
  };
  popoverEl.onmouseleave = () => {
    popoverPinned = false;
    hoverTimeout = setTimeout(hidePopover, 400); 
  };
}

function hidePopover() {
  const p = document.getElementById('hover-popover');
  if (p) p.style.display = 'none';
}

async function tooltipMarkWord(word, status) {
  const key = getVaultKey(word);
  await updateWordStatus(key, status);
  hidePopover();
  renderSentence(); 
}

async function markWord(status) {
  if (currentIndex >= practicePool.length) return;
  const s = practicePool[currentIndex];
  const cleanWord = s.words[s.focal].replace(/[.,!?]/g, '').toLowerCase();
  const targetWord = getVaultKey(cleanWord) || getVaultKey(s.baseWord) || cleanWord;
  await updateWordStatus(targetWord, status);
  currentIndex++;
  renderSentence();
}

async function updateWordStatus(word, status) {
  const vaultKey = getVaultKey(word);
  console.log(`Memory: updateWordStatus word=${word} status=${status} key=${vaultKey}`);
  
  if (vault[vaultKey]) {
    vault[vaultKey].status = status;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['vaultWordStatuses'], result => {
        const statuses = result.vaultWordStatuses || {};
        statuses[vaultKey] = status;
        chrome.storage.local.set({ vaultWordStatuses: statuses });
      });
    }
  }
  if (status === 1 || status === 2) { // Only track 'Learn' or 'Known' words
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    chrome.storage.local.get(['dailyLearnedWords'], result => {
      const dailyLearnedWords = result.dailyLearnedWords || {};
      // Convert arrays back to Sets for easier manipulation
      for (const date in dailyLearnedWords) {
        dailyLearnedWords[date] = new Set(dailyLearnedWords[date]);
      }
      if (!dailyLearnedWords[today]) {
        dailyLearnedWords[today] = new Set();
      }
      dailyLearnedWords[today].add(word);
      // Convert Set to Array for storage
      const serializableDailyLearnedWords = {};
      for (const date in dailyLearnedWords) {
        serializableDailyLearnedWords[date] = Array.from(dailyLearnedWords[date]);
      }
      chrome.storage.local.set({ dailyLearnedWords: serializableDailyLearnedWords }, () => {
        console.log(`Memory: Daily learned words updated for ${today}. Total unique words: ${dailyLearnedWords[today].size}`);
        updateTodayPracticeCounter();
        updateCounts();
      });
    });
  }
}

function resetSession() {
  currentIndex = 0;
  document.getElementById('practice-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'flex';
}

let isDictActive = false;

function updateSidebarStatusUI(word) {
  const key = getVaultKey(word);
  const item = vault[key];
  const status = item ? (item.status !== undefined ? item.status : 0) : 0;
  
  const knownBtn = document.getElementById('dict-btn-known');
  const learnBtn = document.getElementById('dict-btn-learn');
  const ignoreBtn = document.getElementById('dict-btn-ignore');
  
  if (knownBtn) { knownBtn.style.background = 'rgba(255,255,255,0.02)'; knownBtn.style.borderColor = '#1e293b'; }
  if (learnBtn) { learnBtn.style.background = 'rgba(255,255,255,0.02)'; learnBtn.style.borderColor = '#1e293b'; }
  if (ignoreBtn) { ignoreBtn.style.background = 'rgba(255,255,255,0.02)'; ignoreBtn.style.borderColor = '#1e293b'; }

  if (status === 2 && knownBtn) {
    knownBtn.style.background = 'rgba(34, 197, 94, 0.2)';
    knownBtn.style.borderColor = '#22c55e';
  } else if (status === 1 && learnBtn) {
    learnBtn.style.background = 'rgba(249, 115, 22, 0.2)';
    learnBtn.style.borderColor = '#f97316';
  } else if (status === 3 && ignoreBtn) {
    ignoreBtn.style.background = 'rgba(107, 114, 128, 0.2)';
    ignoreBtn.style.borderColor = '#6b7280';
  }
}

function showSidebar(data, contextSentence = null) {
  isDictActive = true;
  document.getElementById('dict-sidebar').style.display = 'flex';
  document.body.classList.add('sidebar-open');

  const wordAttr = data.word || data.id;
  const stableRank = data.rank || 'N/A';
  document.getElementById('dict-word').innerText = wordAttr;
  document.getElementById('dict-hv').innerText = `Hán-Việt: ${data.hv || 'N/A'}`;
  document.getElementById('dict-rank').innerText = `#${stableRank}`;
  
  updateSidebarStatusUI(wordAttr);

  const transEl = document.getElementById('dict-trans');
  const existingTrans = getWordTranslation(wordAttr, data);
  const finalTrans = existingTrans || '...';
  if (transEl) transEl.innerText = finalTrans;

  const updateExplain = () => {
    let expHtml = `<p style="margin-top:0"><strong style="color:var(--accent-gold);">${wordAttr}</strong> translates to "${finalTrans}". Rank: #${stableRank}.</p>`;
    
    if (contextSentence) {
      expHtml += `
        <div style="margin-top:20px; padding:15px; background:rgba(255,255,255,0.03); border-radius:12px; border-left:3px solid var(--accent-gold);">
          <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:800; letter-spacing:1px; margin-bottom:8px;">Practice Context</div>
          <div style="font-weight:700; color:#fff; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px; margin-bottom:8px; font-size:15px;">${contextSentence.viet}</div>
          <div style="font-size:13px; color:var(--text-muted);">${contextSentence.trans}</div>
        </div>
      `;
    }
    
    document.getElementById('tab-explain').innerHTML = expHtml;
  };

  updateExplain();

  if (!existingTrans) {
    fetchGoogleTranslate(wordAttr).then(res => {
      if (document.getElementById('dict-word').innerText === wordAttr) {
        if (transEl) transEl.innerText = res || 'no translation';
        updateExplain();
      }
    });
  }

  document.getElementById('dict-type').innerText = data.type || 'Word';
  document.getElementById('tab-grammar').innerHTML = `<p>Grammar characteristics for ${wordAttr}: ${data.type || 'Standard Form'}.</p>`;

  const exContainer = document.getElementById('dict-examples');
  exContainer.innerHTML = '';
  
  const examples = (data.examples && data.examples.length > 0) ? data.examples : [
    {v: `${data.word} là một từ rất phổ biến.`, e: `The word ${data.word} is very common.`}
  ];

  examples.forEach(ex => {
    const text = typeof ex === 'string' ? ex : ex.v;
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; font-size:14px; cursor:pointer; margin-bottom:12px; border-left: 3px solid transparent; transition: 0.2s;';
    
    div.innerHTML = `
      <div style="font-weight:700;">${text}</div>
      ${ex.e ? `<div style="font-size:11px; color:var(--text-muted); margin-top:6px;">${ex.e}</div>` : ''}
    `;
    div.onclick = () => speak(text);
    exContainer.appendChild(div);
  });
}

function hideSidebar() {
  isDictActive = false;
  document.getElementById('dict-sidebar').style.display = 'none';
  document.body.classList.remove('sidebar-open');
}


function speak(text) {
  if (!text) return;
  const content = String(text).trim();
  if (!content) return;
  if (typeof chrome !== 'undefined' && chrome.tts && chrome.tts.speak) {
    try {
      chrome.tts.stop();
      chrome.tts.speak(content, { lang: 'vi-VN', rate: 0.9, enqueue: false }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          chrome.tts.speak(content, { rate: 0.9, enqueue: false });
        }
      });
      return;
    } catch (_e) {}
  }
  const msg = new SpeechSynthesisUtterance(text);
  const vnVoice = window.speechSynthesis.getVoices().find(v => 
    v.lang.toLowerCase().includes('vi') || 
    v.name.toLowerCase().includes('vietnam')
  );
  if (vnVoice) {
    msg.voice = vnVoice;
    msg.lang = vnVoice.lang;
  }
  msg.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(msg);
}

window.onkeydown = (e) => {
  if (e.key.toLowerCase() === 'z') markWord(2);
  if (e.key.toLowerCase() === 'x') markWord(1);
  if (e.key.toLowerCase() === 'c') markWord(0); 
};

document.querySelectorAll('.lexa-tab').forEach(tab => {
    tab.onclick = () => {
        document.querySelectorAll('.lexa-tab').forEach(t => {
            t.classList.remove('active');
            t.style.borderBottomColor = 'transparent';
            t.style.color = '#6b7280';
        });
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
        
        tab.classList.add('active');
        tab.style.borderBottomColor = '#a78bfa';
        tab.style.color = '#a78bfa';
        
        const targetId = 'tab-' + tab.getAttribute('data-tab');
        const pane = document.getElementById(targetId);
        if (pane) pane.style.display = targetId === 'tab-examples' ? 'flex' : 'block';
    };
});

const safeClick = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.onclick = fn;
};

safeClick('btn-known', () => markWord(2));
safeClick('btn-learn', () => markWord(1));
safeClick('btn-ignore', () => markWord(3));
safeClick('start-practice-btn', () => startSession());
safeClick('reset-settings-btn', () => resetSettings());
safeClick('exit-practice-btn', () => location.reload());
safeClick('study-btn', () => {
    const w = document.getElementById('dict-word').innerText;
    window.location.href = `memory.html?word=${encodeURIComponent(w)}`;
});

const dictHW = document.getElementById('dict-word');
if (dictHW) dictHW.onclick = () => speak(dictHW.innerText);

safeClick('dict-btn-known', async () => {
    const word = document.getElementById('dict-word').innerText;
    await updateWordStatus(word, 2);
    updateSidebarStatusUI(word);
    renderSentence();
});

safeClick('dict-btn-learn', async () => {
    const word = document.getElementById('dict-word').innerText;
    await updateWordStatus(word, 1);
    updateSidebarStatusUI(word);
    renderSentence();
});

safeClick('dict-btn-ignore', async () => {
    const word = document.getElementById('dict-word').innerText;
    await updateWordStatus(word, 3);
    updateSidebarStatusUI(word);
    renderSentence();
});

const sSlider = document.getElementById('session-slider');
if (sSlider) {
  sSlider.oninput = (e) => updateSessionSize(e.target.value);
}

const nItemsSlider = document.getElementById('new-items-slider');
if (nItemsSlider) {
  nItemsSlider.oninput = (e) => {
    const valEl = document.getElementById('new-items-val');
    if (valEl) valEl.innerText = `${e.target.value}%`;
  };
}

const rSlider = document.getElementById('range-slider');
if (rSlider) {
  rSlider.oninput = (e) => updateRangeDisplay(parseInt(e.target.value, 10));
}

const hPopover = document.getElementById('hover-popover');
if (hPopover) {
  hPopover.onclick = async (e) => {
    const btn = e.target.closest('.popover-mark-btn');
    if (!btn) return;
    const word = btn.dataset.word;
    const status = parseInt(btn.dataset.status || '0', 10);
    await tooltipMarkWord(word, status);
  };
}

// Init
cachedVoices = window.speechSynthesis.getVoices();
window.speechSynthesis.onvoiceschanged = () => {
  cachedVoices = window.speechSynthesis.getVoices();
};

window.addEventListener('mousedown', () => {
  const msg = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(msg);
}, { once: true });

fetchVault().then(() => {
  updateCounts();
  if (currentLevel) {
     const idx = rangeSteps.indexOf(currentLevel);
     const rSlider = document.getElementById('range-slider');
     if (rSlider && idx !== -1) {
       rSlider.value = idx;
       updateRangeDisplay(idx);
     }
  }
});
refreshHeatmap();
