import { useVocabulary } from './lib/useVocabulary.js';
import { useQuiz } from './lib/useQuiz.js';

let currentConfig = {
    range: 8000,
    size: 10
};

const els = {
    dashboard: document.getElementById('dashboard'),
    overlay: document.getElementById('practice-overlay'),
    heatmap: document.getElementById('heatmap-container'),
    startBtn: document.getElementById('start-session-card'),
    termBtn: document.getElementById('exit-practice'),
    targetWord: document.getElementById('target-word'),
    sentence: document.getElementById('practice-sentence'),
    progressBar: document.getElementById('practice-progress'),
    masteryPercent: document.getElementById('mastery-percent'),
    progressCircle: document.getElementById('progress-circle'),
    todayCount: document.getElementById('today-count'),
    sessionSlider: document.getElementById('session-slider'),
    sizeVal: document.getElementById('cfg-size-val')
};

async function init() {
    await useVocabulary.init();
    renderDashboard();
    setupEventListeners();
}

async function renderDashboard() {
    const stats = await useVocabulary.getStats();
    
    // 1. Mastery Circle
    const totalWords = useVocabulary.vaultArray.length;
    const percent = totalWords > 0 ? (stats.known / totalWords) * 100 : 0;
    els.masteryPercent.innerText = `${Math.floor(percent)}%`;
    
    const circumferance = 2 * Math.PI * 58;
    const offset = circumferance - (percent / 100) * circumferance;
    els.progressCircle.style.strokeDashoffset = offset;
    
    // 2. Today Count
    els.todayCount.innerText = stats.todayCount;
    
    // 3. Heatmap
    renderHeatmap(stats.heatmap);
}

function renderHeatmap(activityData) {
    els.heatmap.innerHTML = '';
    const today = new Date();
    
    // 90 days = ~13 weeks
    // Render 13 columns of 7 cells
    for (let w = 0; w < 13; w++) {
        const col = document.createElement('div');
        col.className = 'heatmap-col';
        
        for (let d = 0; d < 7; d++) {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            const offset = (12 - w) * 7 + (6 - d);
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            const dateStr = date.toISOString().split('T')[0];
            
            const count = (activityData[dateStr] || []).length;
            if (count > 50) cell.style.background = '#8B5CF6';
            else if (count > 20) cell.style.background = 'rgba(139, 92, 246, 0.6)';
            else if (count > 0) cell.style.background = 'rgba(139, 92, 246, 0.3)';
            
            cell.title = `${dateStr}: ${count} words`;
            col.appendChild(cell);
        }
        els.heatmap.appendChild(col);
    }
}

async function startPractice() {
    await useQuiz.generate(currentConfig);
    els.overlay.classList.add('active');
    renderSessionStep();
}

function renderSessionStep() {
    if (useQuiz.isComplete()) {
        terminateSession();
        return;
    }
    
    const wordItem = useQuiz.getCurrent();
    const progress = useQuiz.getProgress();
    
    els.targetWord.innerText = wordItem.word;
    els.progressBar.style.width = `${progress.percent}%`;
    
    // Generate context sentence visualization
    const example = (wordItem.examples && wordItem.examples.length > 0) 
        ? wordItem.examples[0] 
        : `${wordItem.word} là một ví dụ phổ biến.`;
        
    els.sentence.innerHTML = '';
    const words = example.split(/\s+/);
    words.forEach(w => {
        const clean = w.replace(/[.,!?]/g, '').toLowerCase();
        const span = document.createElement('span');
        span.className = `word-token ${clean === wordItem.word.toLowerCase() ? 'focal' : ''}`;
        span.innerText = w;
        els.sentence.appendChild(span);
        
        // Popup dict logic?
        span.onclick = () => speak(w);
    });
    
    speak(example);
}

async function markAction(status) {
    await useQuiz.markCurrent(status);
    renderSessionStep();
}

function terminateSession() {
    els.overlay.classList.remove('active');
    renderDashboard();
}

function setupEventListeners() {
    els.startBtn.onclick = startPractice;
    els.termBtn.onclick = terminateSession;

    // Config: Range
    document.querySelectorAll('.cfg-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.cfg-btn').forEach(b => b.classList.remove('active', 'border-violet-500', 'bg-violet-500/10', 'text-violet-400', 'shadow-lg'));
            btn.classList.add('active', 'border-violet-500', 'bg-violet-500/10', 'text-violet-400', 'shadow-lg');
            currentConfig.range = parseInt(btn.dataset.val, 10);
        };
    });

    // Config: Size
    els.sessionSlider.oninput = (e) => {
        currentConfig.size = parseInt(e.target.value, 10);
        els.sizeVal.innerText = currentConfig.size;
    };

    // Practice Actions
    document.querySelectorAll('.practice-action').forEach(btn => {
        btn.onclick = () => markAction(parseInt(btn.dataset.status, 10));
    });

    // Keyboard Shortcuts
    window.onkeydown = (e) => {
        if (!els.overlay.classList.contains('active')) return;
        if (e.key === '1') markAction(2);
        if (e.key === '2') markAction(1);
        if (e.key === '3') markAction(0);
        if (e.key === 'Escape') terminateSession();
    };
}

function speak(text) {
    if (!text) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'vi-VN';
    msg.rate = 0.9;
    window.speechSynthesis.speak(msg);
}

init();
