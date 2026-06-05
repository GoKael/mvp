// grammar.js

document.addEventListener('DOMContentLoaded', () => {
  initGrammar();
});

let grammarData = [];

async function initGrammar() {
  try {
    const response = await fetch('server/data/grammar.json');
    grammarData = await response.json();
    renderCards(grammarData);
  } catch (err) {
    console.error('Failed to load grammar data:', err);
    document.getElementById('grammar-grid').innerText = 'Error loading patterns. Check console.';
  }

  // Setup Modal Closing
  const modal = document.getElementById('modal');
  const closeBtn = document.getElementById('close-modal');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    };
  }
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  };
}

function renderCards(data) {
  const grid = document.getElementById('grammar-grid');
  grid.innerHTML = '';

  data.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'grammar-card';
    card.dataset.unit = item.id; // Important for the background number effect
    card.style.animation = `fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards ${index * 0.08}s`;
    card.style.opacity = '0';
    
    card.innerHTML = `
      <div class="grammar-subtitle">Unit ${item.id}</div>
      <div class="grammar-title">${item.title}</div>
      <div style="color:var(--accent-gold); font-size:12px; font-weight:700; display:flex; align-items:center; gap:8px;">
        ${item.examples.length} SAMPLES <span style="font-size:18px;">&rarr;</span>
      </div>
    `;

    card.onclick = () => showModal(item.id);
    grid.appendChild(card);
  });
}

function showModal(id) {
  const item = grammarData.find(g => g.id === id);
  if (!item) return;

  const modal = document.getElementById('modal');
  const mTitle = document.getElementById('modal-title');
  const mSubtitle = document.getElementById('modal-subtitle');
  const mList = document.getElementById('example-list');

  mTitle.innerText = item.title;
  mSubtitle.innerText = `UNIT ${item.id} • ${item.subtitle}`;
  mList.innerHTML = '';

  item.examples.forEach(ex => {
    const div = document.createElement('div');
    div.className = 'example-item';
    div.innerHTML = `
      <div class="example-text-group">
        <div class="ex-v">${ex.v}</div>
        <div class="ex-e">${ex.e}</div>
        <div class="ex-c">${ex.c}</div>
      </div>
      <button class="play-btn" data-text="${ex.v.replace(/"/g, '&quot;')}">🔊</button>
    `;
    mList.appendChild(div);
  });

  // Attach audio listeners
  const btns = mList.querySelectorAll('.play-btn');
  btns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      speak(btn.dataset.text);
    };
  });

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function speak(text) {
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

// Global Animation helper
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInUp {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);
