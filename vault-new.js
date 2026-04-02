import { useVocabulary } from './lib/useVocabulary.js';

let currentFilter = { rankMax: 1000, search: '' };
let renderedCount = 0;
const CHUNK_SIZE = 100;

const els = {
    grid: document.getElementById('word-grid'),
    loader: document.getElementById('grid-loader'),
    statKnown: document.getElementById('stat-known'),
    statLearning: document.getElementById('stat-learning'),
    statSuggested: document.getElementById('stat-suggested'),
    search: document.getElementById('vault-search'),
    rankSelect: document.getElementById('rank-select'),
    drawer: document.getElementById('word-drawer'),
    closeDrawer: document.getElementById('close-drawer'),
    drawerWord: document.getElementById('drawer-word'),
    drawerRank: document.getElementById('drawer-rank'),
    drawerTrans: document.getElementById('drawer-trans'),
    drawerExamples: document.getElementById('drawer-examples'),
    resetBtn: document.getElementById('reset-vault-btn'),
    scrollContainer: document.getElementById('vault-scroll-container')
};

async function init() {
    await useVocabulary.init();
    updateStats();
    renderGrid(true);
    setupEventListeners();
}

async function updateStats() {
    const stats = await useVocabulary.getStats();
    els.statKnown.innerText = stats.known;
    els.statLearning.innerText = stats.learn;
    els.statSuggested.innerText = useVocabulary.vaultArray.length - stats.known - stats.learn - stats.ignore;
}

function renderGrid(reset = false) {
    if (reset) {
        els.grid.innerHTML = '';
        renderedCount = 0;
    }
    
    els.loader.classList.remove('hidden');
    
    // Filter logic
    let items = useVocabulary.vaultArray.slice(0, currentFilter.rankMax);
    if (currentFilter.search) {
        const query = currentFilter.search.toLowerCase();
        items = useVocabulary.vaultArray.filter(i => i.word.toLowerCase().includes(query));
    }
    
    const slice = items.slice(renderedCount, renderedCount + CHUNK_SIZE);
    
    slice.forEach(item => {
        const cell = createBentoCell(item);
        els.grid.appendChild(cell);
    });
    
    renderedCount += slice.length;
    els.loader.classList.add('hidden');
}

function createBentoCell(item) {
    const div = document.createElement('div');
    div.className = `bento-item glass-card p-4 flex flex-col justify-between cursor-pointer border relative overflow-hidden group`;
    
    // Status border color
    if (item.status === 2) {
        div.classList.add('border-emerald-500/30', 'bg-emerald-500/5');
    } else if (item.status === 1) {
        div.classList.add('border-orange-500/30', 'bg-orange-500/5');
    } else {
        div.classList.add('border-slate-800', 'bg-slate-900/40');
    }

    div.innerHTML = `
        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">#${item.rank}</div>
        <div class="text-lg font-bold tracking-tight text-slate-100 group-hover:text-sky-400 transition-colors">${item.word}</div>
        ${item.status === 2 ? '<div class="absolute top-2 right-2 w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>' : ''}
        ${item.status === 1 ? '<div class="absolute top-2 right-2 w-1.5 h-1.5 bg-orange-400 rounded-full shadow-[0_0_8px_rgba(251,146,60,0.5)]"></div>' : ''}
    `;

    div.onclick = () => openDrawer(item);
    return div;
}

function openDrawer(item) {
    els.drawerWord.innerText = item.word;
    els.drawerRank.innerText = `Rank #${item.rank}`;
    els.drawerTrans.innerText = item.trans || 'No definition found.';
    
    // Populate examples
    els.drawerExamples.innerHTML = '';
    const examples = (item.examples && item.examples.length > 0) ? item.examples : [`${item.word} là một ví dụ phổ biến.`];
    
    examples.forEach(ex => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl text-sm leading-relaxed text-slate-300 hover:border-sky-500/30 cursor-pointer transition-all';
        // Highlight word
        const regex = new RegExp(`(${item.word})`, 'gi');
        const highlighted = ex.replace(regex, '<span class="text-sky-400 font-bold">$1</span>');
        div.innerHTML = highlighted;
        div.onclick = () => speak(ex);
        els.drawerExamples.appendChild(div);
    });

    els.drawer.classList.remove('translate-x-full');
    
    // Update button listeners
    document.querySelectorAll('.status-action-btn').forEach(btn => {
        btn.onclick = async () => {
            const status = parseInt(btn.dataset.status, 10);
            await useVocabulary.updateStatus(item.word, status);
            closeDrawer();
            updateStats();
            renderGrid(true); // Re-render for status updates
        };
    });
}

function closeDrawer() {
    els.drawer.classList.add('translate-x-full');
}

function setupEventListeners() {
    els.closeDrawer.onclick = closeDrawer;
    
    els.search.oninput = (e) => {
        currentFilter.search = e.target.value;
        renderGrid(true);
    };
    
    els.rankSelect.onchange = (e) => {
        currentFilter.rankMax = parseInt(e.target.value, 10);
        renderGrid(true);
    };

    els.resetBtn.onclick = async () => {
        if (confirm('Are you sure? This will wipe your learning history.')) {
            await useVocabulary.resetAll();
            location.reload();
        }
    };

    // Infinite scroll for grid
    els.scrollContainer.onscroll = () => {
        const { scrollTop, scrollHeight, clientHeight } = els.scrollContainer;
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            renderGrid(false);
        }
    };
}

function speak(text) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'vi-VN';
    window.speechSynthesis.speak(msg);
}

init();
