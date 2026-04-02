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

window.speechSynthesis.onvoiceschanged = () => {
  cachedVoices = window.speechSynthesis.getVoices();
};

window.addEventListener('mousedown', () => {
  const msg = new SpeechSynthesisUtterance('');
  window.speechSynthesis.speak(msg);
}, { once: true });

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

function showSidebar(data) {
  document.getElementById('dict-sidebar').style.display = 'flex';
  document.getElementById('dict-word').innerText = data.word || data.id;
  document.getElementById('dict-hv').innerText = `Hán-Việt: ${data.hv || data.hanViet || '???'}`;
  document.getElementById('dict-trans').innerText = data.trans || 'Definition exploration...';
  document.getElementById('dict-type').innerText = data.type || 'Word';
  document.getElementById('dict-rank').innerText = `#${data.rank || Math.floor(Math.random()*500)}`;

  const exContainer = document.getElementById('dict-examples');
  exContainer.innerHTML = '';
  const examples = data.examples || ['Ví dụ đang tải...'];
  examples.forEach(text => {
    const div = document.createElement('div');
    div.style.cssText = 'background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; font-size:13px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;';
    div.innerHTML = `<span>${text}</span> <svg width="16" height="16" viewBox="0 0 24 24" fill="#b0b0b0"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
    div.addEventListener('click', () => speak(text)); // Use addEventListener
    exContainer.appendChild(div);
  });
}

document.getElementById('dict-audio-btn').addEventListener('click', () => {
  speak(document.getElementById('dict-word').innerText);
});

document.getElementById('study-this-btn').addEventListener('click', () => {
  window.location.href = '../memory.html';
});

async function updateGraph() {
  const fallbackRes = await fetch(chrome.runtime.getURL('server/data/lr_8k.json'));
  const initialVaultMap = await fallbackRes.json();

  const storedStatuses = await new Promise(resolve => {
    chrome.storage.local.get(['vaultWordStatuses'], result => {
      resolve(result.vaultWordStatuses || {});
    });
  });

  const vault = {};
  for (const word in initialVaultMap) {
    vault[word] = { ...initialVaultMap[word] };
    if (storedStatuses[word] !== undefined) {
      vault[word].status = storedStatuses[word];
    }
  }

  // Generate graph data based on the local vault
  const graphData = { nodes: [], links: [] };
  const existingNodes = new Set();

  // Add words from vault as nodes
  for (const word in vault) {
    const item = vault[word];
    if (!existingNodes.has(item.word)) {
      graphData.nodes.push({ id: item.word, group: item.status === 2 ? 2 : 1, type: item.type, hanViet: item.hv, status: item.status });
      existingNodes.add(item.word);
    }
    // Add source (e.g., video title) as a node and link
    if (item.source && !existingNodes.has(item.source)) {
      graphData.nodes.push({ id: item.source, group: 3, type: 'Source' });
      existingNodes.add(item.source);
      graphData.links.push({ source: item.word, target: item.source });
    }
  }

  const Graph = ForceGraph()(document.getElementById('graph'))
    .graphData(graphData)
    .nodeAutoColorBy('group')
    .nodeCanvasObject((node, ctx, globalScale) => {
      const label = node.id;
      const fontSize = 14 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;

      // Fog effect for unlearned
      const isLearned = node.status === 2; // Use actual status
      ctx.globalAlpha = isLearned ? 1.0 : 0.4;

      ctx.fillStyle = isLearned ? 'rgba(187, 134, 252, 0.8)' : 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI, false);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isLearned ? '#fff' : '#666';
      ctx.fillText(label, node.x, node.y + 12);
      ctx.globalAlpha = 1.0;
    })
    .onNodeClick(node => {
      const detail = vault[node.id] || node;
      showSidebar(detail);
    })
    .backgroundColor('#0b0e14');
}

updateGraph();
setInterval(updateGraph, 5000);
window.addEventListener('resize', () => Graph.width(window.innerWidth).height(window.innerHeight));

document.querySelector('.btn-audio')?.addEventListener('click', () => {
  speak(document.getElementById('dict-word').innerText);
});

document.querySelector('.btn-primary')?.addEventListener('click', () => {
  window.location.href = '../memory.html';
});
