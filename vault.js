let vaultMap = {};
let currentLimit = parseInt(localStorage.getItem('learningRange') || '8000', 10);
let cachedVoices = [];
let voicesReady = false;
let voicesPollTimer = null;

function normalizeKey(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .trim();
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
// Clamp to valid options
if (![1000, 2000, 4000, 6000, 8000].includes(currentLimit)) currentLimit = 8000;

async function fetchVault() {
  console.log('Vault: fetchVault started');
  const fallbackRes = await fetch(chrome.runtime.getURL('server/data/lr_8k.json'));
  const initialVaultMap = await fallbackRes.json();
  console.log('Vault: initialVaultMap loaded', Object.keys(initialVaultMap).length);

  const storedStatuses = await new Promise(resolve => {
    chrome.storage.local.get(['vaultWordStatuses'], result => {
      console.log('Vault: storedStatuses from chrome.storage.local', result.vaultWordStatuses);
      resolve(result.vaultWordStatuses || {});
    });
  });

  vaultMap = {};
  for (const word in initialVaultMap) {
    vaultMap[word] = { ...initialVaultMap[word] };
    if (storedStatuses[word] !== undefined) {
      vaultMap[word].status = storedStatuses[word];
    }
  }
  console.log('Vault: final vaultMap loaded', Object.keys(vaultMap).length, 'first 5 words:', Object.keys(vaultMap).slice(0, 5).map(w => ({ word: w, status: vaultMap[w].status })));
}

async function updateWordStatus(word, status) {
  console.log(`Vault: updateWordStatus called for word: ${word}, status: ${status}`);
  if (vaultMap[word]) {
    console.log(`Vault: Word ${word} current status: ${vaultMap[word].status}`);
    vaultMap[word].status = status;
    chrome.storage.local.get(['vaultWordStatuses'], result => {
      const statuses = result.vaultWordStatuses || {};
      statuses[word] = status;
      chrome.storage.local.set({ vaultWordStatuses: statuses }, () => {
        console.log(`Vault: Word ${word} status updated to ${status} in chrome.storage.local`);
      });
    });
  }

  // Update node colors selectively rather than re-rendering the whole 8k words
  const divId = `word-node-${encodeURIComponent(word)}`;
  const div = document.getElementById(divId);
  if (div) {
    if (status === 2) {
      div.style.color = '#4ade80';
      div.style.background = 'rgba(74, 222, 128, 0.1)';
    } else if (status === 1) {
      div.style.color = '#fb923c';
      div.style.background = 'rgba(251, 146, 60, 0.1)';
    } else {
      div.style.color = '#e2e8f0';
      div.style.background = 'transparent';
    }
  }
  updateCounts();
}

function updateCounts() {
  let known = 0, learn = 0, suggest = 0;
  const sortedWords = Object.values(vaultMap).slice(0, currentLimit);
  sortedWords.forEach(i => {
    const status = i.status !== undefined ? i.status : 0;
    if (status === 2) known++;
    else if (status === 1) learn++;
    else suggest++;
  });
  const el1 = document.getElementById('count-known');
  const el2 = document.getElementById('count-learn');
  const el3 = document.getElementById('count-suggest');
  if (el1) el1.innerText = known;
  if (el2) el2.innerText = learn;
  if (el3) el3.innerText = suggest;
}

async function renderVault(forceFetch = false) {
  if (forceFetch || Object.keys(vaultMap).length === 0) {
    await fetchVault();
  }
  const container = document.getElementById('vault-blocks-container');
  container.innerHTML = '';

  const sortedWords = Object.values(vaultMap);
  const CHUNK_SIZE = 100;
  const TOTAL_WORDS = Math.min(sortedWords.length, currentLimit);

  const sidebar = document.getElementById('level-sidebar');
  if (sidebar) sidebar.innerHTML = '';

  for (let i = 0; i < TOTAL_WORDS; i += CHUNK_SIZE) {
    const startRank = i + 1;
    const endRank = i + CHUNK_SIZE;

    // Build Sidebar Anchors (1, 100, 200.. 900, 1k, 2k, 3k.. 8k)
    if (sidebar) {
      const showAnchor = (i < 1000 && i % 100 === 0) || (i >= 1000 && i % 1000 === 0);
      if (showAnchor) {
        const anchorVal = i === 0 ? 1 : (i >= 1000 ? `${i / 1000}k` : i);
        const btn = document.createElement('div');
        btn.className = `level-btn ${i === 0 ? 'active' : ''}`;
        btn.innerText = anchorVal;
        if (i === 0) btn.style.marginTop = 'auto'; // push to bottom naturally
        btn.dataset.startRank = startRank; // Add dataset for event listener
        sidebar.appendChild(btn);
      }
    }

    const chunk = sortedWords.slice(i, i + CHUNK_SIZE);
    const block = document.createElement('div');
    block.id = `block-${startRank}`;
    block.style.marginBottom = '20px';
    block.style.minHeight = chunk.length === 0 ? '60px' : 'auto';

    const divider = document.createElement('div');
    divider.style.cssText = 'display:flex; align-items:center; color:#fff; font-size:14px; font-weight:bold; margin-bottom:20px;';
    divider.innerHTML = `
      <div style="flex:1; border-top:1px dashed #555;"></div>
      <span style="padding:0 20px; color:var(--text-muted);">rank ${startRank} - ${endRank}:</span>
      <button class="range-known-btn" data-start-rank="${startRank}" data-end-rank="${endRank}" title="Mark words up to ${endRank} as Known" style="background:#222; border:1px solid #444; border-radius:12px; height:24px; padding:0 8px; cursor:pointer; font-size:12px; color:#fff; display:flex; gap:4px; align-items:center; transition:0.2s;">
         <span style="font-size:12px; opacity:0.7;">&gt;</span>📕
      </button>
      <div style="flex:1; border-top:1px dashed #555; margin-left:20px;"></div>
    `;
    block.appendChild(divider);

    if (chunk.length > 0) {
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid; grid-template-columns: repeat(8, 1fr); row-gap:15px; column-gap:10px; font-size:15px;';

      chunk.forEach((item, idx) => {
        const status = item.status !== undefined ? item.status : 0;
        const div = document.createElement('div');
        div.id = `word-node-${encodeURIComponent(item.word)}`;
        div.style.cursor = 'pointer';
        div.style.padding = '4px 8px';
        div.style.borderRadius = '4px';
        div.innerText = item.word;

        if (status === 2) {
          div.style.color = '#4ade80';
          div.style.background = 'rgba(74, 222, 128, 0.1)';
        } else if (status === 1) {
          div.style.color = '#fb923c';
          div.style.background = 'rgba(251, 146, 60, 0.1)';
        } else {
          div.style.color = '#e2e8f0';
          div.style.background = 'transparent';
        }

        div.onmouseenter = () => div.style.background = 'rgba(255,255,255,0.1)';
        div.onmouseleave = () => {
          const freshStatus = vaultMap[item.word] ? vaultMap[item.word].status : 0;
          if (freshStatus === 2) div.style.background = 'rgba(74, 222, 128, 0.1)';
          else if (freshStatus === 1) div.style.background = 'rgba(251, 146, 60, 0.1)';
          else div.style.background = 'transparent';
        };

        const rank = i + idx + 1;
        div.addEventListener('click', () => { // Use addEventListener
          showSidebar({ word: item.word, ...item, rank: rank });
        });

        grid.appendChild(div);
      });
      block.appendChild(grid);
    }

    container.appendChild(block);
  }
  updateCounts();
}

function showSidebar(data) {
  const sidebar = document.getElementById('dict-sidebar');
  sidebar.style.display = 'flex';
  document.getElementById('dict-word').innerText = data.word || data.id;
  document.getElementById('dict-hv').innerText = `Hán-Việt: ${data.hv || 'N/A'}`;
  document.getElementById('dict-trans').innerText = data.trans || 'No definition found.';
  document.getElementById('dict-type').innerText = data.type || 'Word';
  document.getElementById('dict-rank').innerText = `#${data.rank || 0}`;

  // Update LexaAI Explanations Fake Content
  document.getElementById('tab-explain').innerHTML = `
      <p style="margin-top:0"><strong style="color:var(--accent-gold);">${data.word}</strong> is generally used to mean "${data.trans}". It is a basic vocabulary word.</p>
      <p>Usage Note: Similar words might overlap in context, but this item holds rank #${data.rank || 0} in frequency.</p>
  `;

  document.getElementById('tab-grammar').innerHTML = `
      <p style="margin-top:0"><strong style="color:var(--accent-gold);">Grammatical Category:</strong> ${data.type || 'Noun / Phrase'}</p>
      <ul style="padding-left:15px; margin-top:10px;">
        <li>Usually precedes the noun it modifies if it's an adjective.</li>
        <li>Standalone usage is very common in spoken Vietnamese.</li>
      </ul>
  `;

  const exContainer = document.getElementById('dict-examples');
  exContainer.innerHTML = '';

  const examples = (data.examples && data.examples.length > 0) ? data.examples : [
    `${data.word} là một từ rất phổ biến.`,
    `Tôi học từ ${data.word} hôm nay.`
  ];

  examples.forEach(text => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; font-size:14px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;';

    const regex = new RegExp(`(${data.word})`, "gi");
    let highlightedText = text.replace(regex, '<span style="color:var(--accent-gold); font-weight:bold;">$1</span>');
    if (!text.match(regex)) {
      highlightedText = text; // Fallback
    }

    div.innerHTML = `<span style="flex:1;">${highlightedText}</span> <svg style="width:20px; flex-shrink:0; margin-left:10px;" viewBox="0 0 24 24" fill="#b0b0b0"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
    div.addEventListener('click', () => speak(text)); // Use addEventListener
    exContainer.appendChild(div);
  });

  // Ensure Examples tab is what we start on or keep current
}

// Lexa UI Tabs 
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

const rngSelect = document.getElementById('vault-range-select');
if (rngSelect) {
  // Set dropdown to match stored value BEFORE rendering
  rngSelect.value = currentLimit.toString();
  // If value didn't match any option, browser resets it; sync back
  if (parseInt(rngSelect.value, 10) !== currentLimit) {
    currentLimit = parseInt(rngSelect.value, 10) || 8000;
  }
  rngSelect.addEventListener('change', (e) => {
    currentLimit = parseInt(e.target.value, 10);
    localStorage.setItem('learningRange', currentLimit.toString());
    renderVault(false);
  });
}

// Initial fetch and render
renderVault(true);

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
    } catch (_e) { }
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
  } catch (_e) { }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(msg);
}

window.speechSynthesis.onvoiceschanged = () => {
  cachedVoices = window.speechSynthesis.getVoices();
};

window.addEventListener('mousedown', () => {
  const msg = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(msg);
}, { once: true });

document.addEventListener('click', (e) => {
  if (e.target.closest('.btn-audio')) {
    speak(document.getElementById('dict-word').innerText);
  }
  const rangeBtn = e.target.closest('.range-known-btn');
  if (rangeBtn) {
    const startRank = parseInt(rangeBtn.dataset.startRank);
    const endRank = parseInt(rangeBtn.dataset.endRank);
    const wordsToUpdate = [];
    const allVaultWords = Object.values(vaultMap);
    for (let i = startRank - 1; i < endRank && i < allVaultWords.length; i++) {
      const wordItem = allVaultWords[i];
      if (wordItem && wordItem.status !== 2) { // Only update if not already known
        wordsToUpdate.push(wordItem.word);
      }
    }

    if (wordsToUpdate.length > 0) {
      chrome.storage.local.get(['vaultWordStatuses'], result => {
        const statuses = result.vaultWordStatuses || {};
        wordsToUpdate.forEach(word => {
          if (vaultMap[word]) {
            vaultMap[word].status = 2; // Update in memory
            statuses[word] = 2; // Update for storage
          }
        });
        chrome.storage.local.set({ vaultWordStatuses: statuses }, () => {
          // After updating storage, update UI for affected words
          wordsToUpdate.forEach(word => {
            const divId = `word-node-${encodeURIComponent(word)}`;
            const div = document.getElementById(divId);
            if (div) {
              div.style.color = '#4ade80';
              div.style.background = 'rgba(74, 222, 128, 0.1)';
            }
          });
          updateCounts(); // Update counts display
        });
      });
    }
  }
});

document.getElementById('dict-audio-btn').addEventListener('click', () => {
  speak(document.getElementById('dict-word').innerText);
});
document.getElementById('dict-known-btn').addEventListener('click', () => {
  updateWordStatus(document.getElementById('dict-word').innerText, 2);
});
document.getElementById('dict-learn-btn').addEventListener('click', () => {
  updateWordStatus(document.getElementById('dict-word').innerText, 1);
});
document.getElementById('dict-ignore-btn').addEventListener('click', () => {
  updateWordStatus(document.getElementById('dict-word').innerText, 0);
});

document.querySelectorAll('.level-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const target = document.getElementById(`block-${btn.dataset.startRank}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  });
});
