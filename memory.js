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
  const fallbackRes = await fetch(chrome.runtime.getURL('server/data/lr_8k.json'));
  const initialVaultMap = await fallbackRes.json();
  console.log('Memory: initialVaultMap loaded', Object.keys(initialVaultMap).length);

  const storedStatuses = await new Promise(resolve => {
    chrome.storage.local.get(['vaultWordStatuses'], result => {
      console.log('Memory: storedStatuses from chrome.storage.local', result.vaultWordStatuses);
      resolve(result.vaultWordStatuses || {});
    });
  });

  vault = {};
  for (const word in initialVaultMap) {
    vault[word] = { ...initialVaultMap[word] };
    if (storedStatuses[word] !== undefined) {
      vault[word].status = storedStatuses[word];
    }
  }
  const rawValues = Object.values(vault);
  rawValues.forEach((v, index) => { v.rank = index + 1; });
  vaultArrayCache = rawValues;
  console.log('Memory: final vault loaded', Object.keys(vault).length, 'first 5 words:', Object.keys(vault).slice(0, 5).map(w => ({ word: w, status: vault[w].status })));
}

let currentLevel = parseInt(localStorage.getItem('learningRange') || '8000');
if (![300, 1000, 2000, 5000, 8000].includes(currentLevel)) currentLevel = 8000;
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

function setLevel(element, size) {
  // Update UI chips
  document.querySelectorAll('.level-chip').forEach(el => {
    el.className = 'level-chip';
    el.style.background = '#333';
    el.style.color = 'white';
    el.style.border = 'none';
  });
  element.className = 'level-chip active';
  element.style.background = 'rgba(255, 152, 0, 0.2)';
  element.style.color = 'var(--accent-gold)';
  element.style.border = '1px solid var(--accent-gold)';
  currentLevel = size;
  localStorage.setItem('learningRange', size.toString());
}

function updateSessionSize(val) {
  sessionSize = parseInt(val, 10);
  const valEl = document.getElementById('session-size-val');
  if (valEl) valEl.innerText = sessionSize;
  
  refreshHeatmap();
}

function resetSettings() {
  currentLevel = 8000;
  localStorage.setItem('learningRange', '8000');
  sessionSize = 10;
  const slider = document.getElementById('session-slider');
  if (slider) slider.value = '10';
  const newItemsSlider = document.getElementById('new-items-slider');
  if (newItemsSlider) newItemsSlider.value = '50';
  const newItemsVal = document.getElementById('new-items-val');
  if (newItemsVal) newItemsVal.innerText = '50%';
  updateSessionSize(10);
  document.querySelectorAll('.level-chip').forEach(chip => {
    const size = parseInt(chip.dataset.level || '0', 10);
    if (size === 8000) setLevel(chip, 8000);
  });
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
      examples.forEach(ex => {
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
          baseWord: item.word
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
    
    if (practicePool.length === 0) practicePool = sentences;
  } else {
    practicePool = [];
    for(let i=0; i < sessionSize; i++) {
      practicePool.push(sentences[i % sentences.length]);
    }
  }
  
  currentIndex = 0;
  
  document.getElementById('sentence-area').onclick = () => {
     if (currentIndex < practicePool.length) {
       speak(practicePool[currentIndex].viet);
     }
  };
  
  renderSentence();
}

let hoverTimeout;
let popoverPinned = false;

function renderSentence() {
  if (currentIndex >= practicePool.length) {
    document.getElementById('sentence-area').onclick = null; // Prevent voice speaking when clicking 'Session Complete'
    document.getElementById('sentence-area').innerHTML = `
      <div style="font-size:32px; width:100%; text-align:center; margin-bottom:20px;">Session Complete! 🎉</div>
      <button id="reset-session-btn" style="padding:12px 24px; font-size:16px; font-weight:bold; background:var(--accent-gold); color:black; border:none; border-radius:6px; cursor:pointer; margin:0 auto; display:block;">Back to Dashboard</button>
    `;
    const resetBtn = document.getElementById('reset-session-btn');
    if (resetBtn) resetBtn.onclick = () => resetSession();
    document.getElementById('progress-counter').innerText = `${sessionSize} / ${sessionSize}`;
    document.getElementById('status-fill').style.width = '100%';
    document.getElementById('focal-word-hint').innerText = 'Done';
    return;
  }
  
  const s = practicePool[currentIndex];
  const area = document.getElementById('sentence-area');
  area.innerHTML = '';
  
  const focalWord = s.words[s.focal];
  document.getElementById('focal-word-hint').innerText = focalWord;

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
      showSidebar({ word: vaultItem ? (vaultItem.word || cleanWord) : word, ...(vaultItem || {}) });
      dictPinned = true;
      dictPinnedWord = vaultItem ? (vaultItem.word || cleanWord) : word;
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
     showSidebar({ word: vaultFW ? vaultFW.word : cleanFW, ...(vaultFW || {}) });
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

document.getElementById('hover-popover').onmouseenter = () => {
  popoverPinned = true;
  clearTimeout(hoverTimeout);
};
document.getElementById('hover-popover').onmouseleave = () => {
  popoverPinned = false;
  hoverTimeout = setTimeout(hidePopover, 400); // 400ms delay
};

function hidePopover() {
  document.getElementById('hover-popover').style.display = 'none';
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
  console.log(`Memory: updateWordStatus called for word: ${word}, status: ${status}`);
  const vaultKey = getVaultKey(word);
  if (vault[vaultKey]) {
    console.log(`Memory: Word ${word} current status: ${vault[word].status}`);
    vault[vaultKey].status = status;
    chrome.storage.local.get(['vaultWordStatuses'], result => {
      const statuses = result.vaultWordStatuses || {};
      statuses[vaultKey] = status;
      chrome.storage.local.set({ vaultWordStatuses: statuses }, () => {
        console.log(`Memory: Word ${vaultKey} status updated to ${status} in chrome.storage.local`);
      });
    });
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

function showSidebar(data) {
  isDictActive = true;
  document.getElementById('dict-sidebar').style.display = 'flex';
  
  // Shift main container if on large screen
  if (window.innerWidth > 1000) {
    document.getElementById('main-container').style.marginRight = '420px';
    document.getElementById('main-container').style.marginLeft = '20px';
  }

  const wordAttr = data.word || data.id;
  const stableRank = data.rank || 'N/A';
  document.getElementById('dict-word').innerText = wordAttr;
  document.getElementById('dict-hv').innerText = `Hán-Việt: ${data.hv || 'N/A'}`;
  document.getElementById('dict-rank').innerText = `#${stableRank}`;
  
  const updateExplain = (trans) => {
    document.getElementById('tab-explain').innerHTML = `
        <p style="margin-top:0"><strong style="color:var(--accent-gold);">${wordAttr}</strong> translates directly to "${trans || '...' }". It is a core vocabulary item encountered frequently.</p>
        <p>Usage Note: The rank ${stableRank} indicates it is highly recommended to practice.</p>
    `;
  };

  const transEl = document.getElementById('dict-trans');
  const existingTrans = getWordTranslation(wordAttr, data);
  if (existingTrans) {
    transEl.innerText = existingTrans;
    updateExplain(existingTrans);
  } else {
    transEl.innerText = 'Translating...';
    updateExplain('...');
    fetchGoogleTranslate(wordAttr).then(res => {
      if (document.getElementById('dict-word').innerText === wordAttr) {
        transEl.innerText = res || 'no translation';
        updateExplain(res || 'no translation');
      }
    });
  }

  document.getElementById('dict-type').innerText = data.type || 'Word';
  document.getElementById('dict-rank').innerText = `#${stableRank}`;
  
  document.getElementById('tab-grammar').innerHTML = `
      <p style="margin-top:0"><strong style="color:var(--accent-gold);">Grammar Pattern:</strong> ${data.type || 'Noun / Verb'}</p>
      <ul style="padding-left:15px; margin-top:10px;">
        <li>Follows standard Subject-Verb-Object syntax.</li>
        <li>No conjugations exist for this lemma.</li>
      </ul>
  `;

  const exContainer = document.getElementById('dict-examples');
  exContainer.innerHTML = '';
  
  const examples = buildThreeExamples(data.word || data.id, data.examples);
  examples.forEach(text => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; font-size:13px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;';
    
    const wordsInEx = text.split(/\s+/);
    let htmlContent = '';
    wordsInEx.forEach(token => {
      const cleanToken = token.replace(/[.,!?]/g, '').toLowerCase();
      const key = getVaultKey(cleanToken);
      const vItem = vault[key];
      const isFocal = cleanToken === (data.word || '').toLowerCase();
      
      let color = 'inherit';
      let weight = 'normal';
      
      if (isFocal) {
        color = 'var(--accent-gold)';
        weight = 'bold';
      } else if (vItem) {
        if (vItem.status === 2) color = '#4ade80';
        else if (vItem.status === 1) color = '#fb923c';
        else color = '#666';
      }
      
      htmlContent += `<span style="color:${color}; font-weight:${weight};">${token}</span> `;
    });

    div.innerHTML = `<span style="flex:1;">${htmlContent}</span> <svg style="width:20px; flex-shrink:0; margin-left:10px;" viewBox="0 0 24 24" fill="#b0b0b0"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
    div.onclick = () => speak(text);
    exContainer.appendChild(div);
  });
}

function hideSidebar() {
  isDictActive = false;
  document.getElementById('dict-sidebar').style.display = 'none';
  document.getElementById('main-container').style.marginRight = 'auto';
  document.getElementById('main-container').style.marginLeft = 'auto';
}

document.getElementById('close-sidebar-btn').onclick = hideSidebar;

// Lexa UI Tabs Listener
document.querySelectorAll('.lexa-tab').forEach(tab => {
    tab.addEventListener('click', () => {
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
        document.getElementById(targetId).style.display = targetId === 'tab-examples' ? 'flex' : 'block';
    });
});

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

  cachedVoices = window.speechSynthesis.getVoices();
  const vnVoice = cachedVoices.find(v => 
    v.lang.toLowerCase().includes('vi') || 
    v.name.toLowerCase().includes('vietnam')
  );

  if (vnVoice) {
    msg.voice = vnVoice;
    msg.lang = vnVoice.lang;
  } else if (cachedVoices[0]) {
    msg.voice = cachedVoices[0];
    msg.lang = cachedVoices[0].lang || msg.lang;
  }
  
  msg.rate = 0.9;
  msg.onerror = (e) => { if (e.error !== 'canceled') console.error('TTS Error:', e); };
  try {
    window.speechSynthesis.resume();
  } catch (_e) {}
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(msg);
}

window.onkeydown = (e) => {
  if (e.key.toLowerCase() === 'z') markWord(2);
  if (e.key.toLowerCase() === 'x') markWord(1);
  if (e.key.toLowerCase() === 'c') markWord(0); 
};

document.getElementById('btn-known').onclick = () => markWord(2);
document.getElementById('btn-learn').onclick = () => markWord(1);
document.getElementById('btn-ignore').onclick = () => markWord(0);
document.getElementById('start-practice-btn').onclick = () => startSession();
document.getElementById('reset-settings-btn').onclick = () => resetSettings();
document.getElementById('dict-audio-btn').onclick = () => speak(document.getElementById('dict-word').innerText);
 document.getElementById('dict-known-btn').onclick = async () => {
   const key = getVaultKey(document.getElementById('dict-word').innerText);
   await updateWordStatus(key, 2);
  renderSentence();
};
document.getElementById('dict-learn-btn').onclick = async () => {
   const key = getVaultKey(document.getElementById('dict-word').innerText);
   await updateWordStatus(key, 1);
  renderSentence();
};
document.getElementById('dict-ignore-btn').onclick = async () => {
   const key = getVaultKey(document.getElementById('dict-word').innerText);
   await updateWordStatus(key, 0);
  renderSentence();
};

const sessionSlider = document.getElementById('session-slider');
if (sessionSlider) {
  sessionSlider.addEventListener('input', (e) => updateSessionSize(e.target.value));
}
const newItemsSlider = document.getElementById('new-items-slider');
if (newItemsSlider) {
  newItemsSlider.addEventListener('input', (e) => {
    document.getElementById('new-items-val').innerText = `${e.target.value}%`;
  });
}
document.querySelectorAll('.level-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const size = parseInt(chip.dataset.level || '8000', 10);
    setLevel(chip, size);
  });
});
document.getElementById('hover-popover').addEventListener('click', async (e) => {
  const btn = e.target.closest('.popover-mark-btn');
  if (!btn) return;
  const word = btn.dataset.word;
  const status = parseInt(btn.dataset.status || '0', 10);
  await tooltipMarkWord(word, status);
});

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
     document.querySelectorAll('.level-chip').forEach(el => {
       const chipLevel = parseInt(el.dataset.level || '0', 10);
       if (chipLevel === currentLevel) {
         setLevel(el, currentLevel);
       }
     });
  }
});
refreshHeatmap();
