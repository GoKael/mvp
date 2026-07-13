import {
  STATUS,
  completeLesson,
  currentLesson,
  loadState,
  normalize,
  parseRoute,
  progressSummary,
  reviewRound,
  reviewWord,
  saveState,
  setWordStatus,
  wordProgress,
} from './lib/app-core.mjs?v=2';
import { AudioController } from './lib/audio.mjs?v=2';

const DATA_PATHS = {
  words: 'server/data/core-100.json?v=4',
  lessons: 'server/data/lessons.json?v=4',
  patterns: 'server/data/patterns.json?v=4',
  audio: 'server/data/audio-manifest.json?v=4',
};

const app = document.getElementById('app');
const wordDialog = document.getElementById('word-dialog');
const toast = document.getElementById('toast');
const ui = {
  lessonSegments: {},
  feynmanOpen: {},
  wordFilter: 'all',
  wordSearch: '',
  reviewRevealed: false,
  reviewMode: 'recall',
  reviewQueueIds: null,
  orderSelection: [],
  wordSearchComposing: false,
  activeWordId: '',
};

let data = { words: [], lessons: [], patterns: [], generatedAudio: new Set() };
let state;
let visibleWordIds = [];

const extensionStorage = globalThis.chrome?.storage?.local;

const audio = new AudioController(({ playing }) => {
  document.body.classList.toggle('is-playing', playing);
  document.getElementById('audio-status').textContent = playing ? '正在播放' : '語音就緒';
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightSentence(text, focusWords, key) {
  const phrases = [...focusWords]
    .map((word) => word[key])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!phrases.length) return escapeHtml(text);
  const pattern = new RegExp(`(${phrases.map(escapeRegExp).join('|')})`, 'giu');
  return String(text).split(pattern).map((part) => {
    const isHit = phrases.some((phrase) => normalize(phrase) === normalize(part));
    return isHit ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part);
  }).join('');
}

function hasAudio(src) {
  return data.generatedAudio.has(src);
}

function audioButton(label, src, className = 'audio-button') {
  const disabled = !hasAudio(src);
  return `<button class="${className}" type="button" data-action="play-audio" data-src="${escapeHtml(src)}" ${disabled ? 'disabled title="音檔尚未發布"' : ''}>
    <span aria-hidden="true">▶</span>${escapeHtml(label)}
  </button>`;
}

function sequenceButton(label, sources, className = 'audio-button primary') {
  const disabled = sources.some((src) => !hasAudio(src));
  return `<button class="${className}" type="button" data-action="play-sequence" data-srcs="${escapeHtml(sources.join('|'))}" ${disabled ? 'disabled title="雙語音檔尚未完整發布"' : ''}>
    <span aria-hidden="true">◉</span>${escapeHtml(label)}
  </button>`;
}

function statusLabel(status) {
  return {
    new: '新單字',
    learning: '學習中',
    known: '已會',
    ignored: '略過',
  }[status] || '新單字';
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { toast.hidden = true; }, 1800);
}

function persist() {
  saveState(localStorage, state);
  if (extensionStorage) extensionStorage.set({ lexaCapturedPhrases: state.inbox });
  updateShell();
}

function readExtensionInbox() {
  if (!extensionStorage) return Promise.resolve([]);
  return new Promise((resolve) => {
    extensionStorage.get({ lexaCapturedPhrases: [] }, (result) => {
      resolve(Array.isArray(result.lexaCapturedPhrases) ? result.lexaCapturedPhrases : []);
    });
  });
}

function mergeInbox(entries) {
  const known = new Set(state.inbox.map((item) => item.id || `${item.text}|${item.url}`));
  entries.forEach((item) => {
    const key = item.id || `${item.text}|${item.url}`;
    if (!known.has(key)) state.inbox.push(item);
  });
  state.inbox.sort((left, right) => Number(right.capturedAt || 0) - Number(left.capturedAt || 0));
  state.inbox = state.inbox.slice(0, 100);
  saveState(localStorage, state);
}

function updateShell() {
  const summary = progressSummary(data.words, data.lessons, state);
  document.getElementById('nav-due').textContent = summary.due;
  document.getElementById('header-progress').textContent = `${summary.known} / 100 已會`;
  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === parseRoute(location.hash).name);
  });
  const rate = state.settings.playbackRate || 1;
  const select = document.getElementById('playback-rate');
  if (select) select.value = String(rate);
  audio.setRate(rate);
}

function routeTitle(title, kicker, action = '') {
  return `<header class="page-title">
    <div>
      <p class="eyebrow">${escapeHtml(kicker)}</p>
      <h1>${escapeHtml(title)}</h1>
    </div>
    ${action}
  </header>`;
}

function renderToday() {
  const lesson = currentLesson(data.lessons, state);
  const summary = progressSummary(data.words, data.lessons, state);
  const learnedPercent = Math.round((summary.known / data.words.length) * 100);
  app.innerHTML = `
    <section class="today-hero reveal">
      <div class="today-copy">
        <p class="eyebrow">今日 30 秒</p>
        <h1>先會三句，<br>再把越南變熟悉。</h1>
        <p>中文先理解，越南語再跟讀。今天只完成一個真實情境，不追求一次背完。</p>
        <div class="hero-actions">
          <a class="button primary" href="#/lesson/${lesson.id}">開始今天三句</a>
          <a class="button ghost" href="#/review">複習 ${summary.due} 張</a>
        </div>
      </div>
      <article class="today-ticket">
        <span class="ticket-number">${String(summary.completedLessons + 1).padStart(2, '0')}</span>
        <p>下一課</p>
        <h2>${escapeHtml(lesson.title.zhTW)}</h2>
        <div class="ticket-lines">
          ${lesson.segments.map((segment) => `<span>${escapeHtml(segment.topic.vi)} · ${escapeHtml(segment.topic.zhTW)}</span>`).join('')}
        </div>
      </article>
    </section>

    <section class="metric-row reveal delay-1" aria-label="學習進度">
      <article><strong>${summary.completedLessons}</strong><span>完成課程</span></article>
      <article><strong>${summary.due}</strong><span>今天待複習</span></article>
      <article><strong>${summary.learning}</strong><span>正在追蹤</span></article>
      <article><strong>${learnedPercent}%</strong><span>Core 100</span></article>
    </section>

    <section class="section-block reveal delay-2">
      ${routeTitle('今天怎麼學', '七種方法，一條路徑')}
      <div class="method-grid">
        <article><span>01</span><h3>句子積木</h3><p>用第一原理拆出角色、動作與時間。</p></article>
        <article><span>02</span><h3>三句速查</h3><p>每課只摘要三句與能替換的核心詞。</p></article>
        <article><span>03</span><h3>情境路線</h3><p>沿著飲食、交通、住宿與求助前進。</p></article>
        <article><span>04</span><h3>自己解釋</h3><p>翻答案前，先用自己的話說一次。</p></article>
        <article><span>05</span><h3>先想再翻</h3><p>遮住答案，迫使自己主動回憶。</p></article>
        <article><span>06</span><h3>弱點優先</h3><p>卡住越多次，越早回到複習佇列。</p></article>
        <article><span>07</span><h3>到期再見</h3><p>答錯 12 小時後再來，答對逐步拉長。</p></article>
      </div>
    </section>`;
}

function renderLessons() {
  app.innerHTML = `
    ${routeTitle('情境課程', '10 支 Short · 30 句')}
    <section class="lesson-grid reveal">
      ${data.lessons.map((lesson, index) => {
        const done = Boolean(state.lessons[lesson.id]?.completedAt);
        return `<a class="lesson-card ${done ? 'completed' : ''}" href="#/lesson/${lesson.id}">
          <div class="lesson-card-top"><span>${String(index + 1).padStart(2, '0')}</span><span>${done ? '已完成' : '30 秒'}</span></div>
          <h2>${escapeHtml(lesson.title.zhTW)}</h2>
          <p>${escapeHtml(lesson.title.vi)}</p>
          <div class="topic-row">${lesson.segments.map((segment) => `<span>${escapeHtml(segment.topic.vi)}</span>`).join('')}</div>
        </a>`;
      }).join('')}
    </section>`;
}

function lessonInsights(segment, open) {
  return `<section class="insight-grid">
    <article class="insight-card">
      <p class="eyebrow">第一原理</p>
      <h3>先抓能替換的積木</h3>
      <div class="block-grid">${segment.breakdown.map((part) => `<span><small>${escapeHtml(part.role)}</small><b>${escapeHtml(part.vi)}</b><em>${escapeHtml(part.zhTW)}</em></span>`).join('')}</div>
    </article>
    <article class="insight-card feynman-card">
      <p class="eyebrow">費曼自述</p>
      <h3>先不看中文，你能解釋這句嗎？</h3>
      <button class="text-button" type="button" data-action="toggle-feynman">${open ? '收起答案' : '看簡單答案'}</button>
      ${open ? `<p class="feynman-answer">這句是在說：「${escapeHtml(segment.zhTW.replace(/。$/, ''))}」。先記整塊，再替換黃色詞組。</p>` : ''}
    </article>
  </section>`;
}

function renderLesson(route) {
  const lesson = data.lessons.find((item) => item.id === route.id) || data.lessons[0];
  const active = Math.min(2, Math.max(0, ui.lessonSegments[lesson.id] || 0));
  const segment = lesson.segments[active];
  const key = `${lesson.id}:${segment.id}`;
  const open = Boolean(ui.feynmanOpen[key]);
  app.innerHTML = `
    ${routeTitle(lesson.title.zhTW, lesson.title.vi, `<a class="button ghost compact" href="#/lessons">全部課程</a>`)}
    <div class="segment-tabs" role="tablist" aria-label="本課三句">
      ${lesson.segments.map((item, index) => `<button type="button" class="${index === active ? 'active' : ''}" data-action="lesson-segment" data-index="${index}">${index + 1}<span>${escapeHtml(item.topic.vi)}</span></button>`).join('')}
    </div>

    <article class="sentence-stage reveal">
      <div class="topic-badge"><span></span>${escapeHtml(segment.topic.vi)}<small>${escapeHtml(segment.topic.zhTW)}</small></div>
      <div class="sentence-block zh"><span class="language-flag" aria-label="台灣華語">🇹🇼</span><p>${highlightSentence(segment.zhTW, segment.focusWords, 'zhTW')}</p></div>
      <div class="sentence-block vi"><span class="language-flag" aria-label="越南語">🇻🇳</span><p>${highlightSentence(segment.vi, segment.focusWords, 'vi')}</p></div>
      <div class="audio-row">
        ${audioButton('中文', segment.audio.zhTW)}
        ${audioButton('越南語', segment.audio.vi)}
        ${sequenceButton('依序播放', [segment.audio.zhTW, segment.audio.vi])}
      </div>
      <div class="focus-panel">
        <p>單字對照</p>
        <div>${segment.focusWords.map((word) => `<span><b>${escapeHtml(word.vi)}</b><small>${escapeHtml(word.zhTW)}</small></span>`).join('')}</div>
      </div>
    </article>

    ${lessonInsights(segment, open)}

    <footer class="lesson-footer">
      <button class="button ghost" type="button" data-action="lesson-prev" ${active === 0 ? 'disabled' : ''}>上一句</button>
      ${active < 2
        ? '<button class="button primary" type="button" data-action="lesson-next">下一句</button>'
        : `<button class="button primary" type="button" data-action="complete-lesson" data-id="${lesson.id}">完成本課並加入複習</button>`}
    </footer>`;
}

function filteredWords() {
  const query = normalize(ui.wordSearch);
  return data.words.filter((word) => {
    const progress = wordProgress(state, word.id);
    const matchesStatus = ui.wordFilter === 'all' || progress.status === ui.wordFilter;
    const matchesQuery = !query || [word.vi, word.zhTW, word.pos, ...word.examples.flatMap((example) => [example.vi, example.zhTW])]
      .some((value) => normalize(value).includes(query));
    return matchesStatus && matchesQuery;
  });
}

function renderWords() {
  const words = filteredWords();
  visibleWordIds = words.map((word) => word.id);
  app.innerHTML = `
    ${routeTitle('Core 100 單字庫', '只顯示校驗內容', `<div class="page-actions"><button class="button ghost compact" type="button" data-action="bulk-known">全部設為已會</button><button class="button ghost compact" type="button" data-action="bulk-reset">全部重設</button></div>`)}
    ${state.inbox.length ? `<section class="capture-inbox reveal">
      <div><p class="eyebrow">瀏覽器收件匣</p><h2>稍後整理的選字</h2><p>這些內容只進入個人佇列，不會改寫正式詞庫。</p></div>
      <div class="capture-list">${state.inbox.map((item) => `<article><span>${escapeHtml(item.text)}</span><small>${escapeHtml(item.title || '網頁選字')}</small><button type="button" data-action="dismiss-capture" data-id="${escapeHtml(item.id)}" aria-label="移除 ${escapeHtml(item.text)}">移除</button></article>`).join('')}</div>
    </section>` : ''}
    <section class="word-toolbar reveal">
      <label><span>搜尋</span><input id="word-search" type="search" value="${escapeHtml(ui.wordSearch)}" placeholder="越南語、中文、例句"></label>
      <div class="filter-pills" role="group" aria-label="單字狀態">
        ${['all', 'new', 'learning', 'known', 'ignored'].map((filter) => `<button type="button" class="${ui.wordFilter === filter ? 'active' : ''}" data-action="word-filter" data-filter="${filter}">${filter === 'all' ? '全部' : statusLabel(filter)}</button>`).join('')}
      </div>
    </section>
    <p class="result-count">顯示 ${words.length} / 100</p>
    <section class="word-grid reveal">
      ${words.map((word) => {
        const progress = wordProgress(state, word.id);
        return `<button class="word-card status-${progress.status}" type="button" data-action="open-word" data-id="${word.id}">
          <span class="word-rank">${String(word.rank).padStart(3, '0')}</span>
          <strong>${escapeHtml(word.vi)}</strong>
          <span>${escapeHtml(word.zhTW)}</span>
          <small>${escapeHtml(word.pos)} · ${statusLabel(progress.status)}</small>
        </button>`;
      }).join('') || '<div class="empty-state">找不到符合的單字。</div>'}
    </section>`;
}

function openWord(wordId) {
  const word = data.words.find((item) => item.id === wordId);
  if (!word) return;
  ui.activeWordId = word.id;
  const progress = wordProgress(state, word.id);
  wordDialog.querySelector('[data-dialog-content]').innerHTML = `
    <div class="dialog-rank">Core ${String(word.rank).padStart(3, '0')}</div>
    <div class="dialog-title-row"><div><h2>${escapeHtml(word.vi)}</h2><p>${escapeHtml(word.zhTW)} · ${escapeHtml(word.pos)}</p></div>${audioButton('播放單字', word.audio, 'audio-button icon')}</div>
    <div class="status-actions">
      ${[
        [STATUS.LEARNING, '學習中'],
        [STATUS.KNOWN, '已會'],
        [STATUS.IGNORED, '略過'],
        [STATUS.NEW, '重設'],
      ].map(([status, label]) => `<button type="button" class="${progress.status === status ? 'active' : ''}" data-action="word-status" data-id="${word.id}" data-status="${status}">${label}</button>`).join('')}
    </div>
    <section class="example-list">
      <p class="eyebrow">三個自然例句</p>
      ${word.examples.map((example, index) => `<article><div><b>${escapeHtml(example.vi)}</b><span>${escapeHtml(example.zhTW)}</span></div>${audioButton(`例句 ${index + 1}`, example.audio, 'audio-button icon')}</article>`).join('')}
    </section>`;
  if (!wordDialog.open) wordDialog.showModal();
}

function reviewQueue() {
  if (ui.reviewQueueIds === null) {
    ui.reviewQueueIds = reviewRound(data.words, state).map((word) => word.id);
  }
  return ui.reviewQueueIds
    .map((id) => data.words.find((word) => word.id === id))
    .filter(Boolean);
}

function reviewModeTabs() {
  return `<div class="review-mode-tabs" role="group" aria-label="練習方式">
    ${[
      ['recall', '翻譯回想'],
      ['listen', '聽音選句'],
      ['order', '句子排序'],
    ].map(([mode, label]) => `<button type="button" class="${ui.reviewMode === mode ? 'active' : ''}" data-action="review-mode" data-mode="${mode}">${label}</button>`).join('')}
  </div>`;
}

function listenChoices(word) {
  const offsets = [17, 43];
  const choices = [word, ...offsets.map((offset) => data.words[(word.rank - 1 + offset) % data.words.length])]
    .map((item) => ({ id: item.id, text: item.examples[0].zhTW }));
  const shift = word.rank % choices.length;
  return [...choices.slice(shift), ...choices.slice(0, shift)];
}

function orderExercise(word) {
  const example = word.examples[0];
  const tokens = example.vi.split(/\s+/).map((text, index) => ({ text, index }));
  const selected = new Set(ui.orderSelection);
  const remaining = [...tokens].reverse().filter((token) => !selected.has(token.index));
  return `<div class="order-exercise">
    <p class="order-prompt">${escapeHtml(example.zhTW)}</p>
    <div class="order-answer">${ui.orderSelection.map((index) => `<span>${escapeHtml(tokens[index].text)}</span>`).join('') || '<em>依序點選越南語詞塊</em>'}</div>
    <div class="order-tokens">${remaining.map((token) => `<button type="button" data-action="order-token" data-index="${token.index}">${escapeHtml(token.text)}</button>`).join('')}</div>
    <button class="text-button" type="button" data-action="reset-order">重新排列</button>
  </div>`;
}

function reviewPrompt(word) {
  if (ui.reviewMode === 'listen') {
    return `<div class="listen-exercise">
      <h2 class="listen-symbol">♪</h2>
      <p>播放例句後，選出正確中文。</p>
      ${audioButton('播放越南語例句', word.examples[0].audio)}
      <div class="listen-choices">${listenChoices(word).map((choice) => `<button type="button" data-action="review-choice" data-correct="${choice.id === word.id}">${escapeHtml(choice.text)}</button>`).join('')}</div>
    </div>`;
  }
  if (ui.reviewMode === 'order') return orderExercise(word);
  return `<h2>${escapeHtml(word.vi)}</h2>${audioButton('聽發音', word.audio)}<div class="answer-placeholder">在腦中說出中文意思，再翻面。</div><button class="button primary wide" type="button" data-action="reveal-review">顯示答案</button>`;
}

function renderReview() {
  const queue = reviewQueue();
  const word = queue[0];
  if (!word) {
    app.innerHTML = `
      ${routeTitle('本輪完成', '主動回憶')}
      <section class="review-complete reveal">
        <span aria-hidden="true">✓</span>
        <h2>這一輪都回答完了</h2>
        <p>已依你的作答更新下一次複習時間。</p>
        <button class="button primary" type="button" data-action="review-restart">再複習一輪</button>
      </section>`;
    return;
  }
  const progress = wordProgress(state, word.id);
  app.innerHTML = `
    ${routeTitle('主動回憶', '先想，再看答案')}
    ${reviewModeTabs()}
    <section class="review-layout reveal">
      <aside class="review-queue">
        <p class="eyebrow">這一輪</p>
        <strong>${queue.length}</strong><span>張卡片</span>
        <p>答錯會在 12 小時後回來；答對後間隔逐步拉長。</p>
      </aside>
      <article class="review-card">
        <span class="review-status">${statusLabel(progress.status)} · Box ${progress.box}</span>
        ${ui.reviewRevealed ? `<h2>${escapeHtml(word.vi)}</h2><div class="review-answer"><strong>${escapeHtml(word.zhTW)}</strong><p>${escapeHtml(word.examples[0].vi)}</p><span>${escapeHtml(word.examples[0].zhTW)}</span></div>` : reviewPrompt(word)}
        ${ui.reviewRevealed
          ? `<div class="review-actions"><button type="button" data-action="review-rate" data-rating="again">再來一次</button><button type="button" data-action="review-rate" data-rating="good">答對了</button><button type="button" data-action="review-rate" data-rating="known">直接已會</button><button type="button" data-action="review-rate" data-rating="ignored">略過</button></div>`
          : ''}
      </article>
    </section>`;
}

function renderPatterns() {
  app.innerHTML = `
    ${routeTitle('核心句型', '8 組已校驗語法')}
    <section class="pattern-list reveal">
      ${data.patterns.map((pattern, index) => `<details ${index === 0 ? 'open' : ''}>
        <summary><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${escapeHtml(pattern.title)}</h2><p>${escapeHtml(pattern.summary)}</p></div></summary>
        <div class="pattern-guide">
          <article class="pattern-formula"><span>句型公式</span><strong>${escapeHtml(pattern.formula)}</strong></article>
          <article class="pattern-explanation"><p>${escapeHtml(pattern.explanation)}</p><aside><b>易錯提醒</b>${escapeHtml(pattern.note)}</aside></article>
        </div>
        <p class="pattern-example-label">例句與發音</p>
        <div class="pattern-examples">${pattern.examples.map((example) => `<article><div><b>${escapeHtml(example.vi)}</b><span>${escapeHtml(example.zhTW)}</span></div>${audioButton('播放例句', example.audio, 'audio-button icon')}</article>`).join('')}</div>
      </details>`).join('')}
    </section>`;
}

function render() {
  audio.stop();
  updateShell();
  const route = parseRoute(location.hash);
  if (route.name !== 'review') ui.reviewQueueIds = null;
  if (route.name === 'today') renderToday();
  else if (route.name === 'lessons') renderLessons();
  else if (route.name === 'lesson') renderLesson(route);
  else if (route.name === 'words') renderWords();
  else if (route.name === 'review') renderReview();
  else if (route.name === 'patterns') renderPatterns();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function activeLesson() {
  const route = parseRoute(location.hash);
  return data.lessons.find((lesson) => lesson.id === route.id) || data.lessons[0];
}

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'play-audio') audio.play(button.dataset.src).then((ok) => { if (!ok) notify('音檔無法播放'); });
  if (action === 'play-sequence') audio.playSequence(button.dataset.srcs.split('|')).then((ok) => { if (!ok) notify('雙語音檔尚未完整'); });
  if (action === 'lesson-segment') {
    const lesson = activeLesson();
    ui.lessonSegments[lesson.id] = Number(button.dataset.index);
    renderLesson({ id: lesson.id });
  }
  if (action === 'lesson-next' || action === 'lesson-prev') {
    const lesson = activeLesson();
    const delta = action === 'lesson-next' ? 1 : -1;
    ui.lessonSegments[lesson.id] = Math.min(2, Math.max(0, (ui.lessonSegments[lesson.id] || 0) + delta));
    renderLesson({ id: lesson.id });
  }
  if (action === 'toggle-feynman') {
    const lesson = activeLesson();
    const segment = lesson.segments[ui.lessonSegments[lesson.id] || 0];
    const key = `${lesson.id}:${segment.id}`;
    ui.feynmanOpen[key] = !ui.feynmanOpen[key];
    renderLesson({ id: lesson.id });
  }
  if (action === 'complete-lesson') {
    const lesson = data.lessons.find((item) => item.id === button.dataset.id);
    completeLesson(state, lesson);
    persist();
    notify('本課已完成，單字已加入複習');
    location.hash = '#/review';
  }
  if (action === 'word-filter') {
    ui.wordFilter = button.dataset.filter;
    renderWords();
  }
  if (action === 'open-word') openWord(button.dataset.id);
  if (action === 'word-status') {
    setWordStatus(state, button.dataset.id, button.dataset.status);
    persist();
    openWord(button.dataset.id);
    if (parseRoute(location.hash).name === 'words') renderWords();
  }
  if (action === 'bulk-known' || action === 'bulk-reset') {
    const status = action === 'bulk-known' ? STATUS.KNOWN : STATUS.NEW;
    visibleWordIds.forEach((id) => setWordStatus(state, id, status));
    persist();
    renderWords();
    notify(status === STATUS.KNOWN ? '目前清單已設為已會' : '目前清單已重設');
  }
  if (action === 'dismiss-capture') {
    state.inbox = state.inbox.filter((item) => item.id !== button.dataset.id);
    persist();
    renderWords();
  }
  if (action === 'reveal-review') {
    ui.reviewRevealed = true;
    renderReview();
  }
  if (action === 'review-mode') {
    ui.reviewMode = button.dataset.mode;
    ui.reviewRevealed = false;
    ui.orderSelection = [];
    renderReview();
  }
  if (action === 'review-choice') {
    if (button.dataset.correct === 'true') {
      ui.reviewRevealed = true;
      renderReview();
    } else {
      notify('還不是這句，再聽一次。');
    }
  }
  if (action === 'order-token') {
    const word = reviewQueue()[0];
    const tokens = word.examples[0].vi.split(/\s+/);
    ui.orderSelection.push(Number(button.dataset.index));
    if (ui.orderSelection.length === tokens.length) {
      const answerText = ui.orderSelection.map((index) => tokens[index]).join(' ');
      if (answerText === word.examples[0].vi) ui.reviewRevealed = true;
      else {
        ui.orderSelection = [];
        notify('順序不對，再排一次。');
      }
    }
    renderReview();
  }
  if (action === 'reset-order') {
    ui.orderSelection = [];
    renderReview();
  }
  if (action === 'review-rate') {
    const word = reviewQueue()[0];
    reviewWord(state, word.id, button.dataset.rating);
    ui.reviewQueueIds.shift();
    ui.reviewRevealed = false;
    ui.orderSelection = [];
    persist();
    renderReview();
  }
  if (action === 'review-restart') {
    ui.reviewQueueIds = null;
    ui.reviewRevealed = false;
    ui.orderSelection = [];
    renderReview();
  }
  if (action === 'reload') location.reload();
});

function commitWordSearch(value) {
  ui.wordSearch = value;
  renderWords();
  const input = document.getElementById('word-search');
  input.focus();
  input.setSelectionRange(ui.wordSearch.length, ui.wordSearch.length);
}

app.addEventListener('compositionstart', (event) => {
  if (event.target.id === 'word-search') ui.wordSearchComposing = true;
});

app.addEventListener('compositionend', (event) => {
  if (event.target.id !== 'word-search') return;
  ui.wordSearchComposing = false;
  commitWordSearch(event.target.value);
});

app.addEventListener('input', (event) => {
  if (event.target.id !== 'word-search') return;
  if (event.isComposing || ui.wordSearchComposing) return;
  commitWordSearch(event.target.value);
});

wordDialog.addEventListener('click', (event) => {
  if (event.target === wordDialog || event.target.closest('[data-close-dialog]')) wordDialog.close();
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'play-audio') audio.play(button.dataset.src).then((ok) => { if (!ok) notify('音檔無法播放'); });
  if (button.dataset.action === 'word-status') {
    setWordStatus(state, button.dataset.id, button.dataset.status);
    persist();
    openWord(button.dataset.id);
  }
});

document.getElementById('playback-rate').addEventListener('change', (event) => {
  state.settings.playbackRate = Number(event.target.value);
  persist();
});

window.addEventListener('hashchange', render);

async function init() {
  try {
    const [words, lessons, patterns, audioManifest] = await Promise.all(
      Object.values(DATA_PATHS).map((url) => fetch(url).then((response) => {
        if (!response.ok) throw new Error(`無法載入 ${url}`);
        return response.json();
      })),
    );
    data = {
      words,
      lessons,
      patterns,
      generatedAudio: new Set(audioManifest.assets.filter((asset) => asset.generated).map((asset) => asset.output)),
    };
    state = loadState(localStorage, words);
    mergeInbox(await readExtensionInbox());
    if (!location.hash) history.replaceState(null, '', '#/today');
    render();
    document.body.classList.add('ready');
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      let reloadingForWorker = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadingForWorker) return;
        reloadingForWorker = true;
        location.reload();
      });
      navigator.serviceWorker.register('./sw.js?v=8', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(() => {});
    }
  } catch (error) {
    app.innerHTML = `<section class="fatal"><p class="eyebrow">載入失敗</p><h1>Lexa 暫時無法開啟</h1><p>${escapeHtml(error.message)}</p><button class="button primary" type="button" data-action="reload">重新載入</button></section>`;
  }
}

init();
