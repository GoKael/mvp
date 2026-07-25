import {
  LEARNING_DIRECTION,
  STATUS,
  completeLesson,
  currentLesson,
  dueLessonSegments,
  filterDictionaryWords,
  lessonLearningProgress,
  lessonProgress,
  lessonSegmentProgress,
  itemAudio,
  learningDirection,
  loadState,
  normalize,
  parseRoute,
  progressSummary,
  recordAttempt,
  recordLessonSegmentRecall,
  reviewLessonSegment,
  reviewRoundItems,
  reviewWord,
  saveState,
  setLearningDirection,
  setWordStatus,
  startLesson,
  updateLessonSegment,
  wordProgress,
} from './lib/app-core.mjs?v=9';
import { AudioController } from './lib/audio.mjs?v=4';
import { createLexicon, lexemeKey, splitLatinWords, splitLexemes } from './lib/lexeme.mjs?v=2';

const DATA_PATHS = {
  words: 'server/data/core.json?v=2',
  lexicon: 'server/data/lexicon.json?v=2',
  lessons: 'server/data/lessons.json?v=4',
  patterns: 'server/data/patterns.json?v=4',
  audio: 'server/data/audio-manifest.json?v=4',
};

const app = document.getElementById('app');
const wordDialog = document.getElementById('word-dialog');
const lexemePopover = document.getElementById('lexeme-popover');
const toast = document.getElementById('toast');
const supportsPopover = typeof lexemePopover.showPopover === 'function';
const ui = {
  lessonSegments: {},
  wordFilter: 'all',
  wordSearch: '',
  reviewRevealed: false,
  reviewMode: 'recall',
  reviewQueueIds: null,
  orderSelection: [],
  wordSearchComposing: false,
  activeWordId: '',
};

let data = { words: [], lexicon: [], lessons: [], patterns: [], generatedAudio: new Set() };
let state;
let visibleWordIds = [];
let lexicon = createLexicon([], []);
let activeLexemeId = '';
let activeLexemeTrigger = null;
let lexemeOpenTimer;
let lexemeCloseTimer;

function isReverseDirection() {
  return learningDirection(state) === LEARNING_DIRECTION.VI_TO_ZH;
}

function sourceKey() {
  return isReverseDirection() ? 'vi' : 'zhTW';
}

function targetKey() {
  return isReverseDirection() ? 'zhTW' : 'vi';
}

function languageName(key) {
  return key === 'vi' ? '越南語' : '台灣華語';
}

function renderField(pair, key, focusWords = []) {
  return key === 'vi'
    ? renderVietnamese(pair.vi, focusWords)
    : escapeHtml(pair.zhTW);
}

function renderSentenceField(pair, key, focusWords = []) {
  return key === 'vi'
    ? renderVietnamese(pair.vi, focusWords)
    : highlightSentence(pair.zhTW, focusWords, 'zhTW');
}

function sourceAudio(audioPaths) {
  return audioPaths?.[sourceKey()] || '';
}

function targetAudio(audioPaths) {
  return audioPaths?.[targetKey()] || '';
}

function wordTargetAudio(item) {
  return itemAudio(item, targetKey());
}

function exerciseTokens(text, key = targetKey()) {
  return key === 'vi'
    ? String(text).split(/\s+/).filter(Boolean)
    : Array.from(String(text).replace(/[\s，。！？、]/g, ''));
}

const extensionStorage = globalThis.chrome?.storage?.local;

const audio = new AudioController(({ playing, error }) => {
  document.body.classList.toggle('is-playing', playing);
  const status = document.getElementById('audio-status');
  status.textContent = error ? '語音無法讀取' : (playing ? '正在播放' : '語音就緒');
  status.title = error ? audio.lastError : '';
});

function audioFailureMessage() {
  if (audio.lastError.startsWith('NotAllowedError')) return '瀏覽器尚未允許播放，請再按一次播放';
  return audio.lastError ? `音檔無法播放（${audio.lastError}）` : '音檔無法播放';
}

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

function lexemeMarkup(entry, text, focus = false) {
  const reviewed = entry.quality === 'reviewed';
  const status = wordProgress(state, entry.id).status;
  const label = `${entry.vi}，${entry.zhTW}，${reviewed ? '校對中' : statusLabel(status)}`;
  return `<span class="lexeme-token ${reviewed ? 'quality-reviewed' : `status-${status}`}${focus ? ' focus-hit' : ''}" data-lexeme-id="${escapeHtml(entry.id)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">${escapeHtml(text)}</span>`;
}

function fallbackLexeme(text) {
  const key = lexemeKey(text);
  const existing = lexicon.byText.get(key);
  if (existing) return existing;
  const entry = {
    id: `token:${encodeURIComponent(key)}`,
    vi: text,
    zhTW: '未收錄於 Core 300',
    pos: '待建立詞條',
    audio: '',
    source: 'token',
  };
  lexicon.byId.set(entry.id, entry);
  lexicon.byText.set(key, entry);
  return entry;
}

function renderUnknownVietnamese(text) {
  return splitLatinWords(text).map((part) => part.word
    ? lexemeMarkup(fallbackLexeme(part.text), part.text)
    : escapeHtml(part.text)).join('');
}

function renderVietnamese(text, focusWords = [], includeUnknown = true) {
  const focusKeys = new Set(focusWords.map((word) => lexemeKey(word.vi)));
  return splitLexemes(text, lexicon).map((part) => part.entry
    ? lexemeMarkup(part.entry, part.text, focusKeys.has(lexemeKey(part.text)))
    : (includeUnknown ? renderUnknownVietnamese(part.text) : escapeHtml(part.text))).join('');
}

function updateLexemeNodes(wordId) {
  const status = wordProgress(state, wordId).status;
  document.querySelectorAll('[data-lexeme-id]').forEach((node) => {
    if (node.dataset.lexemeId !== wordId) return;
    Object.values(STATUS).forEach((value) => node.classList.remove(`status-${value}`));
    node.classList.add(`status-${status}`);
    const entry = lexicon.byId.get(wordId);
    if (entry) node.setAttribute('aria-label', `${entry.vi}，${entry.zhTW}，${statusLabel(status)}`);
    node.querySelectorAll('[data-status-label]').forEach((label) => { label.textContent = statusLabel(status); });
  });
}

function isLexemePopoverOpen() {
  return supportsPopover
    ? lexemePopover.matches(':popover-open')
    : lexemePopover.classList.contains('is-open');
}

function openLexemePopoverSurface() {
  if (supportsPopover) {
    if (!isLexemePopoverOpen()) lexemePopover.showPopover();
  } else {
    lexemePopover.classList.add('is-open');
  }
}

function closeLexemePopoverSurface() {
  if (supportsPopover) {
    if (isLexemePopoverOpen()) lexemePopover.hidePopover();
  } else {
    lexemePopover.classList.remove('is-open');
  }
}

function positionLexemePopover() {
  if (!isLexemePopoverOpen() || !activeLexemeTrigger?.isConnected) return;
  const trigger = activeLexemeTrigger.getBoundingClientRect();
  const card = lexemePopover.getBoundingClientRect();
  const left = Math.max(12, Math.min(innerWidth - card.width - 12, trigger.left + trigger.width / 2 - card.width / 2));
  const below = trigger.bottom + 10;
  const top = below + card.height <= innerHeight - 12 ? below : Math.max(12, trigger.top - card.height - 10);
  lexemePopover.style.left = `${left}px`;
  lexemePopover.style.top = `${top}px`;
}

function renderLexemePopover() {
  const entry = lexicon.byId.get(activeLexemeId);
  if (!entry) return;
  const reviewed = entry.quality === 'reviewed';
  const progress = wordProgress(state, entry.id);
  const source = entry.source === 'core'
    ? `Core ${String(entry.rank).padStart(3, '0')}${entry.quality === 'reviewed' ? ' · 校對中' : ''}`
    : (entry.source === 'focus' ? '課程詞組' : '句中單字 · 待校驗');
  const wordAudio = wordTargetAudio(entry);
  const canPlay = !reviewed && Boolean(wordAudio && hasAudio(wordAudio));
  Object.values(STATUS).forEach((status) => lexemePopover.classList.remove(`status-${status}`));
  lexemePopover.classList.add(`status-${progress.status}`);
  const title = isReverseDirection() ? entry.zhTW : entry.vi;
  const meaning = isReverseDirection() ? entry.vi : entry.zhTW;
  lexemePopover.querySelector('[data-lexeme-content]').innerHTML = `
    <button class="lexeme-close" type="button" data-lexeme-action="close" aria-label="關閉單字卡">×</button>
    <p class="lexeme-source">${escapeHtml(source)}</p>
    <div class="lexeme-heading"><h2>${escapeHtml(title)}</h2><span>${escapeHtml(reviewed ? '校對中' : statusLabel(progress.status))}</span></div>
    <p class="lexeme-meaning">${escapeHtml(meaning)}${entry.pos ? ` · ${escapeHtml(entry.pos)}` : ''}</p>
    <button class="lexeme-play" type="button" data-lexeme-action="play" ${canPlay ? '' : 'disabled title="此詞組尚無獨立音檔"'}>▶ ${canPlay ? '播放發音' : '尚無獨立發音'}</button>
    ${reviewed ? '<p class="lexeme-review-note">完成發音驗收後開放學習狀態。</p>' : `<div class="lexeme-actions" aria-label="學習狀態">
      ${[
        [STATUS.LEARNING, '學習中'],
        [STATUS.KNOWN, '已會'],
        [STATUS.IGNORED, '略過'],
        [STATUS.NEW, '重設'],
      ].map(([status, label]) => `<button type="button" class="${progress.status === status ? 'active' : ''}" data-lexeme-action="status" data-status="${status}">${label}</button>`).join('')}
    </div>`}`;
  requestAnimationFrame(positionLexemePopover);
}

function showLexemePopover(trigger, focusCard = false) {
  const entry = lexicon.byId.get(trigger?.dataset.lexemeId);
  if (!entry) return;
  clearTimeout(lexemeCloseTimer);
  const owner = trigger.closest('dialog[open]') || document.body;
  if (lexemePopover.parentElement !== owner) {
    closeLexemePopoverSurface();
    owner.append(lexemePopover);
  }
  activeLexemeId = entry.id;
  activeLexemeTrigger = trigger;
  renderLexemePopover();
  openLexemePopoverSurface();
  if (focusCard) requestAnimationFrame(() => lexemePopover.querySelector('[data-lexeme-action="play"]:not(:disabled), [data-lexeme-action="status"]')?.focus());
}

function lexemeInteractionAllowed(trigger) {
  return !(trigger?.closest('.review-card') && !ui.reviewRevealed);
}

function closeLexemePopover() {
  clearTimeout(lexemeOpenTimer);
  clearTimeout(lexemeCloseTimer);
  closeLexemePopoverSurface();
  if (lexemePopover.parentElement !== document.body) document.body.insertBefore(lexemePopover, toast);
  activeLexemeId = '';
  activeLexemeTrigger = null;
}

function scheduleLexemeClose() {
  clearTimeout(lexemeCloseTimer);
  lexemeCloseTimer = setTimeout(closeLexemePopover, 300);
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
  document.getElementById('nav-words').textContent = `詞典 ${data.lexicon.length}`;
  document.getElementById('header-progress').textContent = `${summary.known} / ${data.words.length} 已會`;
  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('active', link.dataset.route === parseRoute(location.hash).name);
  });
  const rate = state.settings.playbackRate || 1;
  const select = document.getElementById('playback-rate');
  if (select) select.value = String(rate);
  const directionSelect = document.getElementById('learning-direction');
  if (directionSelect) directionSelect.value = learningDirection(state);
  const brandNote = document.querySelector('.brand small');
  if (brandNote) brandNote.textContent = isReverseDirection() ? 'Traditional Chinese notes' : 'Vietnamese field notes';
  audio.setRate(rate);
}

function routeTitle(title, kicker, action = '') {
  return `<header class="page-title">
    <div>
      <p class="eyebrow">${renderVietnamese(kicker, [], false)}</p>
      <h1>${escapeHtml(title)}</h1>
    </div>
    ${action}
  </header>`;
}

function weakestTrackedWord() {
  const now = Date.now();
  return data.words
    .filter((word) => [STATUS.LEARNING, STATUS.KNOWN].includes(wordProgress(state, word.id).status))
    .sort((left, right) => {
      const a = wordProgress(state, left.id);
      const b = wordProgress(state, right.id);
      const score = (progress) => progress.misses * 3 - progress.hits
        + Math.max(0, now - progress.nextReviewAt) / (24 * 60 * 60 * 1000);
      return score(b) - score(a) || left.rank - right.rank;
    })[0];
}

function weakestReviewItem() {
  const weakSegment = dueLessonSegments(data.lessons, state)[0];
  const weakWord = weakestTrackedWord();
  return weakSegment || (weakWord ? { type: 'word', word: weakWord } : null);
}

function weakReviewReason(item) {
  if (!item) return '完成第一課後，系統會開始安排複習。';
  if (item.type === 'segment') {
    return item.progress.reviewMisses
      ? `這句已答錯 ${item.progress.reviewMisses} 次，會優先再出現。`
      : `這句已到複習時間，先不看${languageName(targetKey())}再說一次。`;
  }
  const progress = wordProgress(state, item.word.id);
  if (progress.misses) return `最近答錯 ${progress.misses} 次，會優先再出現。`;
  if (progress.nextReviewAt <= Date.now()) return '已到複習時間，現在回想效果最好。';
  return '正在學習中，系統會在適合的時間再次出題。';
}

function renderToday() {
  const lesson = currentLesson(data.lessons, state);
  const summary = progressSummary(data.words, data.lessons, state);
  const lessonProgress = lessonLearningProgress(state, lesson);
  const weakest = weakestReviewItem();
  const lessonNumber = data.lessons.findIndex((item) => item.id === lesson.id) + 1;
  const loopSteps = [
    ['選擇情境', '學習路線', lessonProgress.started, lessonProgress.started ? '已進入今天的飲食情境' : '從今天的三句開始'],
    ['先理解', '智慧摘要＋第一原理', lessonProgress.understood === 3, `${lessonProgress.understood} / 3 句已拆解`],
    ['說給自己聽', '費曼學習', lessonProgress.explained === 3, `${lessonProgress.explained} / 3 句已自述`],
    ['不看答案想一次', '主動回憶', lessonProgress.recalled === 3, `${lessonProgress.recalled} / 3 句已回想`],
    ['系統安排下一次', '弱點評估＋間隔重複', lessonProgress.completed, lessonProgress.completed ? '已加入個人複習排程' : '完成三句後自動安排'],
  ];
  const activeStep = loopSteps.findIndex((step) => !step[2]);
  app.innerHTML = `
    <section class="today-hero reveal">
      <div class="today-copy">
        <p class="eyebrow">今天的學習循環</p>
        <h1>三句理解，<br>一次真正想起來。</h1>
        <p>先看全貌、拆解句子，再用自己的話解釋與回想。弱點排序和複習時間交給系統。</p>
        <div class="hero-actions">
          <a class="button primary" href="#/lesson/${lesson.id}">${lessonProgress.started ? '繼續今天三句' : '開始今天三句'}</a>
          <a class="button ghost" href="#/review">複習 ${summary.due} 張</a>
        </div>
      </div>
      <article class="today-ticket">
        <span class="ticket-number">${String(lessonNumber).padStart(2, '0')}</span>
        <p>今天的情境 · 越南飲食</p>
        <h2>${renderField(lesson.title, sourceKey())}</h2>
        <div class="ticket-lines">
          ${lesson.segments.map((segment) => `<span>${renderField(segment.topic, sourceKey())} · ${renderField(segment.topic, targetKey())}</span>`).join('')}
        </div>
      </article>
    </section>

    <section class="today-task-grid reveal delay-1" aria-label="今日任務">
      <article class="today-task lesson-task">
        <div><p class="eyebrow">任務一 · 一課三句</p><strong>${lessonProgress.recalled} / 3</strong></div>
        <h2>${renderField(lesson.title, sourceKey())}</h2>
        <p>完成理解、自述與回想，才算真正學完今天三句。</p>
        <a href="#/lesson/${lesson.id}">${lessonProgress.started ? '繼續學習' : '開始學習'} →</a>
      </article>
      <article class="today-task review-task">
        <div><p class="eyebrow">任務二 · 到期複習</p><strong>${summary.due}</strong></div>
        <h2>${weakest
          ? (weakest.type === 'segment'
            ? `${renderField(weakest.segment, sourceKey())} · ${renderField(weakest.segment, targetKey())}`
            : `${renderField(weakest.word, targetKey())} · ${renderField(weakest.word, sourceKey())}`)
          : '尚無到期內容'}</h2>
        <p>${escapeHtml(weakReviewReason(weakest))}</p>
        <a href="#/review">進入複習 →</a>
      </article>
    </section>

    <section class="section-block reveal delay-2">
      ${routeTitle('今天做到哪一步', '七種方法，收進五步循環')}
      <div class="learning-loop">
        ${loopSteps.map(([title, method, done, detail], index) => `<article class="${done ? 'done' : ''} ${index === activeStep ? 'active' : ''}">
          <span>${done ? '✓' : String(index + 1).padStart(2, '0')}</span>
          <div><small>${escapeHtml(method)}</small><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div>
        </article>`).join('')}
      </div>
    </section>

    <section class="section-block route-section reveal">
      ${routeTitle('情境路線', '只顯示真實內容進度')}
      <div class="route-map">
        <article class="available"><span>現在學習</span><h3>越南飲食</h3><p>${summary.completedLessons} / ${data.lessons.length} 課完成</p><a href="#/lessons">查看課程 →</a></article>
        ${['交通與問路', '住宿與居家', '購物與付款', '健康與求助', '社交與工作'].map((title) => `<article><span>規劃中</span><h3>${title}</h3><p>內容校驗完成後才會開放</p></article>`).join('')}
      </div>
    </section>`;
}

function renderLessons() {
  app.innerHTML = `
    ${routeTitle('情境課程', '10 支 Short · 30 句')}
    <section class="lesson-grid reveal">
      ${data.lessons.map((lesson, index) => {
        const done = Boolean(lessonProgress(state, lesson.id).completedAt);
        return `<article class="lesson-card ${done ? 'completed' : ''}">
          <div class="lesson-card-top"><span>${String(index + 1).padStart(2, '0')}</span><span>${done ? '已完成' : '30 秒'}</span></div>
          <h2><a href="#/lesson/${lesson.id}">${renderField(lesson.title, sourceKey())}</a></h2>
          <p>${renderField(lesson.title, targetKey())}</p>
          <div class="topic-row">${lesson.segments.map((segment) => `<span>${renderField(segment.topic, targetKey())}</span>`).join('')}</div>
          <a class="lesson-card-cta" href="#/lesson/${lesson.id}">${done ? '再次學習' : '開始三句'} →</a>
        </article>`;
      }).join('')}
    </section>`;
}

function lessonInsights(segment, progress) {
  const canExplain = Boolean(progress.understoodAt);
  const canRecall = progress.feynman === 'clear' && Boolean(progress.feynmanNote.trim());
  return `<section class="insight-grid">
    <article class="insight-card">
      <p class="eyebrow">第一原理</p>
      <h3>先抓能替換的積木</h3>
      ${canExplain
        ? `<div class="block-grid">${segment.breakdown.map((part) => `<span><small>${escapeHtml(part.role)}</small><b>${renderField(part, targetKey())}</b><em>${renderField(part, sourceKey())}</em></span>`).join('')}</div><p class="step-feedback">✓ 已完成句子拆解</p>`
        : '<p>先找出誰、做什麼、核心內容與時間，再打開積木核對。</p><button class="button compact" type="button" data-action="understand-segment">拆解這句</button>'}
    </article>
    <article class="insight-card feynman-card">
      <p class="eyebrow">費曼自述</p>
      <h3>先不看${languageName(sourceKey())}，你能解釋這句嗎？</h3>
      ${!canExplain
        ? '<p class="locked-step">先完成左側的句子拆解。</p>'
        : `<p>先用自己的話寫出「誰、做什麼、什麼情境」，不用逐字翻譯。</p>
          <textarea class="feynman-note" data-feynman-note rows="3" placeholder="我理解這句是在說……">${escapeHtml(progress.feynmanNote)}</textarea>
          ${progress.feynman ? `<p class="feynman-answer">參考意思：「${renderField(segment, sourceKey())}」。${progress.feynman === 'clear' ? '✓ 已保存你的解釋。' : '這句已加入弱點複習。'}</p>` : ''}
          <div class="self-check-actions">
            <button class="${progress.feynman === 'clear' ? 'active' : ''}" type="button" data-action="feynman-rate" data-result="clear">我能解釋</button>
            <button class="${progress.feynman === 'unclear' ? 'active' : ''}" type="button" data-action="feynman-rate" data-result="unclear">還不清楚</button>
          </div>`}
    </article>
    <article class="insight-card recall-check">
      <p class="eyebrow">主動回憶</p>
      <h3>遮住${languageName(sourceKey())}，你能說出${languageName(targetKey())}嗎？</h3>
      ${!canRecall
        ? '<p class="locked-step">先完成自述，再做一次不看答案的回想。</p>'
        : `<p>${progress.recalledAt ? '這句已完成回想，可以前往下一句。' : '在腦中說一次；不確定也沒關係，系統會記住這個弱點。'}</p>
          <div class="self-check-actions">
            <button class="${progress.recalledAt ? 'active' : ''}" type="button" data-action="recall-segment" data-result="clear">我想起來了</button>
            <button type="button" data-action="recall-segment" data-result="unclear">還要練習</button>
          </div>`}
    </article>
  </section>`;
}

function renderLesson(route) {
  const lesson = data.lessons.find((item) => item.id === route.id) || data.lessons[0];
  if (!lessonProgress(state, lesson.id).startedAt) {
    startLesson(state, lesson.id);
    saveState(localStorage, state);
  }
  const active = Math.min(2, Math.max(0, ui.lessonSegments[lesson.id] || 0));
  const segment = lesson.segments[active];
  const progress = lessonSegmentProgress(state, lesson.id, segment.id);
  const learning = lessonLearningProgress(state, lesson);
  app.innerHTML = `
    ${routeTitle(lesson.title[sourceKey()], lesson.title[targetKey()], `<a class="button ghost compact" href="#/lessons">全部課程</a>`)}
    <section class="lesson-overview" aria-label="本課三句速查">
      <div><p class="eyebrow">智慧摘要</p><h2>先看完三句，再逐句理解</h2></div>
      ${lesson.segments.map((item, index) => {
        const itemProgress = lessonSegmentProgress(state, lesson.id, item.id);
        return `<article class="${index === active ? 'active' : ''}">
          <button type="button" data-action="lesson-segment" data-index="${index}" aria-label="切換到第 ${index + 1} 句">${itemProgress.recalledAt ? '✓' : index + 1}</button>
          <div><b>${renderField(item, sourceKey())}</b><small>${renderField(item, targetKey())}</small></div>
        </article>`;
      }).join('')}
    </section>

    <article class="sentence-stage reveal">
      <div class="topic-badge"><span class="topic-dot"></span>${renderField(segment.topic, targetKey())}<small>${renderField(segment.topic, sourceKey())}</small></div>
      <div class="sentence-block ${sourceKey()}"><span class="language-flag" aria-label="${languageName(sourceKey())}">${sourceKey() === 'vi' ? '🇻🇳' : '🇹🇼'}</span><p>${renderSentenceField(segment, sourceKey(), segment.focusWords)}</p></div>
      <div class="sentence-block ${targetKey()}"><span class="language-flag" aria-label="${languageName(targetKey())}">${targetKey() === 'vi' ? '🇻🇳' : '🇹🇼'}</span><p>${renderSentenceField(segment, targetKey(), segment.focusWords)}</p></div>
      <div class="audio-row">
        ${audioButton(languageName(sourceKey()), sourceAudio(segment.audio))}
        ${audioButton(languageName(targetKey()), targetAudio(segment.audio))}
        ${sequenceButton('依序播放', [sourceAudio(segment.audio), targetAudio(segment.audio)])}
      </div>
      <div class="focus-panel">
        <p>單字對照</p>
        <div>${segment.focusWords.map((word) => `<span><b>${renderField(word, targetKey(), [word])}</b><small>${renderField(word, sourceKey())}</small></span>`).join('')}</div>
      </div>
    </article>

    ${lessonInsights(segment, progress)}

    <footer class="lesson-footer">
      <button class="button ghost" type="button" data-action="lesson-prev" ${active === 0 ? 'disabled' : ''}>上一句</button>
      ${active < 2
        ? '<button class="button primary" type="button" data-action="lesson-next">下一句</button>'
        : `<button class="button primary" type="button" data-action="complete-lesson" data-id="${lesson.id}" ${learning.recalled < 3 ? 'disabled' : ''}>${learning.recalled < 3 ? `先完成三句回想（${learning.recalled}/3）` : '完成本課並加入複習'}</button>`}
    </footer>`;
}

function filteredWords() {
  return filterDictionaryWords(data.lexicon, state, ui.wordFilter, ui.wordSearch);
}

function renderWords() {
  const words = filteredWords();
  const reviewedCount = data.lexicon.filter((word) => word.quality === 'reviewed').length;
  visibleWordIds = words.filter((word) => word.quality === 'verified').map((word) => word.id);
  app.innerHTML = `
    ${routeTitle(`Core ${data.lexicon.length} 詞典`, `${data.words.length} 詞已發布 · ${reviewedCount} 詞校對中`, visibleWordIds.length ? `<div class="page-actions"><button class="button ghost compact" type="button" data-action="bulk-known">正式詞全部設為已會</button><button class="button ghost compact" type="button" data-action="bulk-reset">正式詞全部重設</button></div>` : '')}
    ${state.inbox.length ? `<section class="capture-inbox reveal">
      <div><p class="eyebrow">瀏覽器收件匣</p><h2>稍後整理的選字</h2><p>這些內容只進入個人佇列，不會改寫正式詞庫。</p></div>
      <div class="capture-list">${state.inbox.map((item) => `<article><span>${escapeHtml(item.text)}</span><small>${escapeHtml(item.title || '網頁選字')}</small><button type="button" data-action="dismiss-capture" data-id="${escapeHtml(item.id)}" aria-label="移除 ${escapeHtml(item.text)}">移除</button></article>`).join('')}</div>
    </section>` : ''}
    <section class="word-toolbar reveal">
      <label><span>搜尋</span><input id="word-search" type="search" value="${escapeHtml(ui.wordSearch)}" placeholder="越南語、中文、例句"></label>
      <div class="filter-pills" role="group" aria-label="單字狀態">
        ${['all', 'reviewed', 'new', 'learning', 'known', 'ignored'].map((filter) => `<button type="button" class="${ui.wordFilter === filter ? 'active' : ''}" data-action="word-filter" data-filter="${filter}">${filter === 'all' ? `全部 ${data.lexicon.length}` : (filter === 'reviewed' ? `校對中 ${reviewedCount}` : statusLabel(filter))}</button>`).join('')}
      </div>
    </section>
    <p class="result-count">顯示 ${words.length} / ${data.lexicon.length}；校對中詞可查閱，暫不進入播放與複習。</p>
    <section class="word-grid reveal">
      ${words.map((word) => {
        const reviewed = word.quality === 'reviewed';
        const progress = wordProgress(state, word.id);
        return `<button class="word-card ${reviewed ? 'quality-reviewed' : `status-${progress.status}`}" type="button" data-action="open-word" data-id="${word.id}" data-lexeme-id="${word.id}" aria-label="${escapeHtml(`${word[targetKey()]}，${word[sourceKey()]}，${reviewed ? '校對中' : statusLabel(progress.status)}`)}">
          <span class="word-rank">${String(word.rank).padStart(3, '0')}</span>
          <strong>${escapeHtml(word[targetKey()])}</strong>
          <span>${escapeHtml(word[sourceKey()])}</span>
          <small>${escapeHtml(word.pos)} · <span data-status-label>${reviewed ? '校對中' : statusLabel(progress.status)}</span></small>
        </button>`;
      }).join('') || '<div class="empty-state">找不到符合的單字。</div>'}
    </section>`;
}

function openWord(wordId) {
  const word = data.lexicon.find((item) => item.id === wordId);
  if (!word) return;
  closeLexemePopover();
  ui.activeWordId = word.id;
  const reviewed = word.quality === 'reviewed';
  const progress = wordProgress(state, word.id);
  wordDialog.querySelector('[data-dialog-content]').innerHTML = `
    <div class="dialog-rank">Core ${String(word.rank).padStart(3, '0')}${reviewed ? ' · 校對中' : ''}</div>
    <div class="dialog-title-row"><div><h2>${renderField(word, targetKey())}</h2><p>${renderField(word, sourceKey())} · ${escapeHtml(word.pos)}</p></div>${audioButton(`播放${languageName(targetKey())}`, wordTargetAudio(word), 'audio-button icon')}</div>
    ${reviewed ? '<p class="reviewed-word-note">內容已完成初校；發音驗收後才會開放學習狀態與複習。</p>' : `<div class="status-actions">
      ${[
        [STATUS.LEARNING, '學習中'],
        [STATUS.KNOWN, '已會'],
        [STATUS.IGNORED, '略過'],
        [STATUS.NEW, '重設'],
      ].map(([status, label]) => `<button type="button" class="${progress.status === status ? 'active' : ''}" data-action="word-status" data-id="${word.id}" data-status="${status}">${label}</button>`).join('')}
    </div>`}
    <section class="example-list">
      <p class="eyebrow">三個自然例句</p>
      ${word.examples.map((example, index) => `<article><div><b>${renderField(example, targetKey())}</b><span>${renderField(example, sourceKey())}</span></div>${audioButton(`例句 ${index + 1}`, wordTargetAudio(example), 'audio-button icon')}</article>`).join('')}
    </section>`;
  if (!wordDialog.open) wordDialog.showModal();
}

function reviewQueue() {
  if (ui.reviewQueueIds === null) {
    ui.reviewQueueIds = reviewRoundItems(data.words, data.lessons, state).map((item) => item.key);
  }
  return ui.reviewQueueIds
    .map((key) => {
      if (key.startsWith('word:')) {
        const word = data.words.find((item) => item.id === key.slice(5));
        return word ? { type: 'word', key, word } : null;
      }
      const [, lessonId, segmentId] = key.split(':');
      const lesson = data.lessons.find((item) => item.id === lessonId);
      const segment = lesson?.segments.find((item) => String(item.id) === segmentId);
      return lesson && segment ? {
        type: 'segment', key, lesson, segment,
        progress: lessonSegmentProgress(state, lesson.id, segment.id),
      } : null;
    })
    .filter(Boolean);
}

function reviewModeTabs() {
  return `<div class="review-mode-tabs" role="group" aria-label="練習方式">
    ${[
      ['recall', '翻譯回想'],
      ['listen', '聽音選句'],
      ['order', '句子排序'],
    ].map(([mode, label]) => {
      const disabled = isReverseDirection() && mode === 'listen';
      return `<button type="button" class="${ui.reviewMode === mode ? 'active' : ''}" data-action="review-mode" data-mode="${mode}" ${disabled ? 'disabled title="繁中例句音檔尚未發布"' : ''}>${label}</button>`;
    }).join('')}
  </div>`;
}

function listenChoices(word) {
  const offsets = [17, 43];
  const choices = [word, ...offsets.map((offset) => data.words[(word.rank - 1 + offset) % data.words.length])]
    .map((item) => ({ id: item.id, text: item.examples[0][sourceKey()] }));
  const shift = word.rank % choices.length;
  return [...choices.slice(shift), ...choices.slice(0, shift)];
}

function orderExercise(word) {
  const example = word.examples[0];
  const tokens = exerciseTokens(example[targetKey()]).map((text, index) => ({ text, index }));
  const selected = new Set(ui.orderSelection);
  const remaining = [...tokens].reverse().filter((token) => !selected.has(token.index));
  return `<div class="order-exercise">
    <p class="order-prompt">${escapeHtml(example[sourceKey()])}</p>
    <div class="order-answer">${ui.orderSelection.map((index) => `<span>${escapeHtml(tokens[index].text)}</span>`).join('') || `<em>依序點選${languageName(targetKey())}詞塊</em>`}</div>
    <div class="order-tokens">${remaining.map((token) => `<button type="button" data-action="order-token" data-index="${token.index}">${escapeHtml(token.text)}</button>`).join('')}</div>
    <button class="text-button" type="button" data-action="reset-order">重新排列</button>
  </div>`;
}

function reviewPrompt(item) {
  if (item.type === 'segment') {
    return `<p class="eyebrow">弱點句回想</p><h2>${escapeHtml(item.segment[sourceKey()])}</h2><div class="answer-placeholder">先用${languageName(targetKey())}說一次，再翻面核對。</div><button class="button primary wide" type="button" data-action="reveal-review">顯示答案</button>`;
  }
  const { word } = item;
  if (ui.reviewMode === 'listen') {
    return `<div class="listen-exercise">
      <h2 class="listen-symbol">♪</h2>
      <p>播放例句後，選出正確${languageName(sourceKey())}。</p>
      ${audioButton(`播放${languageName(targetKey())}例句`, wordTargetAudio(word.examples[0]))}
      <div class="listen-choices">${listenChoices(word).map((choice) => `<button type="button" data-action="review-choice" data-correct="${choice.id === word.id}">${escapeHtml(choice.text)}</button>`).join('')}</div>
    </div>`;
  }
  if (ui.reviewMode === 'order') return orderExercise(word);
  return `<h2>${escapeHtml(word[targetKey()])}</h2>${audioButton('聽發音', wordTargetAudio(word))}<div class="answer-placeholder">在腦中說出${languageName(sourceKey())}意思，再翻面。</div><button class="button primary wide" type="button" data-action="reveal-review">顯示答案</button>`;
}

function renderReview() {
  const queue = reviewQueue();
  const item = queue[0];
  if (!item) {
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
  const progress = item.type === 'word'
    ? wordProgress(state, item.word.id)
    : item.progress;
  app.innerHTML = `
    ${routeTitle('主動回憶', '先想，再看答案')}
    ${reviewModeTabs()}
    <section class="review-layout reveal">
      <aside class="review-queue">
        <p class="eyebrow">本輪尚餘</p>
        <strong>${queue.length}</strong><span>張卡片</span>
        <p>數字是本輪尚未回答的卡片數。每輪最多 10 張：先排到期弱點句與單字，再補學習中／已會；若尚未有排程內容，帶入 5 個新詞。</p>
        <p>答錯會在 12 小時後回來；答對後間隔逐步拉長。</p>
      </aside>
      <article class="review-card">
        <span class="review-status">${item.type === 'word' ? statusLabel(progress.status) : '弱點句'} · Box ${item.type === 'word' ? progress.box : progress.reviewBox}</span>
        ${ui.reviewRevealed
          ? (item.type === 'word'
            ? `<h2>${renderField(item.word, targetKey())}</h2><div class="review-answer"><strong>${renderField(item.word, sourceKey())}</strong><p>${renderField(item.word.examples[0], targetKey())}</p><span>${renderField(item.word.examples[0], sourceKey())}</span></div>`
            : `<h2>${renderField(item.segment, targetKey())}</h2><div class="review-answer"><strong>${renderField(item.segment, sourceKey())}</strong><p>${item.segment.breakdown.map((part) => `${escapeHtml(part.role)}：${renderField(part, targetKey())}`).join(' · ')}</p></div>`)
          : reviewPrompt(item)}
        ${ui.reviewRevealed
          ? `<div class="review-actions"><button type="button" data-action="review-rate" data-rating="again">再來一次</button><button type="button" data-action="review-rate" data-rating="good">答對了</button>${item.type === 'word' ? '<button type="button" data-action="review-rate" data-rating="known">直接已會</button><button type="button" data-action="review-rate" data-rating="ignored">略過</button>' : ''}</div>`
          : ''}
      </article>
    </section>`;
}

function renderPatterns() {
  if (isReverseDirection()) {
    app.innerHTML = `
      ${routeTitle('繁中句型準備中', '不以越南語規則冒充中文教材')}
      <section class="review-complete reveal">
        <span aria-hidden="true">中</span>
        <h2>雙向進度已可使用</h2>
        <p>情境課與單字複習已能交換方向；繁中句型需要獨立校驗內容與台灣華語音檔，完成前不顯示錯誤教材。</p>
      </section>`;
    return;
  }
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
        <div class="pattern-examples">${pattern.examples.map((example) => `<article><div><b>${renderVietnamese(example.vi)}</b><span>${escapeHtml(example.zhTW)}</span></div>${audioButton('播放例句', example.audio, 'audio-button icon')}</article>`).join('')}</div>
      </details>`).join('')}
    </section>`;
}

function render() {
  closeLexemePopover();
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

function activeLessonSegment() {
  const lesson = activeLesson();
  return { lesson, segment: lesson.segments[ui.lessonSegments[lesson.id] || 0] };
}

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'play-audio') audio.play(button.dataset.src).then((ok) => { if (!ok) notify(audioFailureMessage()); });
  if (action === 'play-sequence') audio.playSequence(button.dataset.srcs.split('|')).then((ok) => { if (!ok) notify(audioFailureMessage()); });
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
  if (action === 'understand-segment') {
    const { lesson, segment } = activeLessonSegment();
    updateLessonSegment(state, lesson.id, segment.id, { understoodAt: Date.now() });
    persist();
    renderLesson({ id: lesson.id });
  }
  if (action === 'feynman-rate') {
    const { lesson, segment } = activeLessonSegment();
    const clear = button.dataset.result === 'clear';
    const note = document.querySelector('[data-feynman-note]')?.value.trim() || '';
    if (clear && !note) {
      notify('先寫一句自己的解釋，再確認理解');
      return;
    }
    if (!clear) recordLessonSegmentRecall(state, lesson.id, segment.id, false);
    updateLessonSegment(state, lesson.id, segment.id, {
      feynman: button.dataset.result,
      feynmanNote: note,
      feynmanAt: Date.now(),
      ...(!clear ? { recalledAt: 0 } : {}),
    });
    persist();
    renderLesson({ id: lesson.id });
    notify(clear ? '已保存你的解釋' : '已記下這句理解弱點');
  }
  if (action === 'recall-segment') {
    const { lesson, segment } = activeLessonSegment();
    const clear = button.dataset.result === 'clear';
    recordLessonSegmentRecall(state, lesson.id, segment.id, clear);
    persist();
    renderLesson({ id: lesson.id });
    notify(clear ? '這句已完成回想' : '已記下這個弱點，稍後會再遇到');
  }
  if (action === 'complete-lesson') {
    const lesson = data.lessons.find((item) => item.id === button.dataset.id);
    if (lessonLearningProgress(state, lesson).recalled < 3) return;
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
      recordAttempt(state, reviewQueue()[0].word.id, 'miss');
      persist();
      notify('還不是這句，再聽一次。');
    }
  }
  if (action === 'order-token') {
    const word = reviewQueue()[0].word;
    const tokens = exerciseTokens(word.examples[0][targetKey()]);
    ui.orderSelection.push(Number(button.dataset.index));
    if (ui.orderSelection.length === tokens.length) {
      const separator = targetKey() === 'vi' ? ' ' : '';
      const answerText = ui.orderSelection.map((index) => tokens[index]).join(separator);
      if (answerText === tokens.join(separator)) ui.reviewRevealed = true;
      else {
        recordAttempt(state, word.id, 'miss');
        persist();
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
    const item = reviewQueue()[0];
    if (item.type === 'segment') reviewLessonSegment(state, item.lesson.id, item.segment.id, button.dataset.rating);
    else reviewWord(state, item.word.id, button.dataset.rating);
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
  if (event.target === wordDialog || event.target.closest('[data-close-dialog]')) {
    closeLexemePopover();
    wordDialog.close();
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'play-audio') audio.play(button.dataset.src).then((ok) => { if (!ok) notify('音檔無法讀取，請確認本地服務仍在執行'); });
  if (button.dataset.action === 'word-status') {
    setWordStatus(state, button.dataset.id, button.dataset.status);
    persist();
    openWord(button.dataset.id);
  }
});
wordDialog.addEventListener('close', closeLexemePopover);

document.addEventListener('pointerover', (event) => {
  if (event.pointerType === 'touch') return;
  const trigger = event.target.closest('[data-lexeme-id]');
  const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
  if (!trigger || trigger.contains(related) || !lexemeInteractionAllowed(trigger)) return;
  clearTimeout(lexemeOpenTimer);
  clearTimeout(lexemeCloseTimer);
  lexemeOpenTimer = setTimeout(() => showLexemePopover(trigger), 120);
});

document.addEventListener('pointerout', (event) => {
  if (event.pointerType === 'touch') return;
  const trigger = event.target.closest('[data-lexeme-id]');
  const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
  if (!trigger || trigger.contains(related) || lexemePopover.contains(related)) return;
  scheduleLexemeClose();
});

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-lexeme-id]');
  if (trigger && !trigger.closest('[data-action]') && lexemeInteractionAllowed(trigger)) {
    showLexemePopover(trigger);
    return;
  }
  if (!trigger && !lexemePopover.contains(event.target)) closeLexemePopover();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isLexemePopoverOpen()) {
    event.preventDefault();
    event.stopPropagation();
    const trigger = activeLexemeTrigger;
    closeLexemePopover();
    trigger?.focus();
    return;
  }
  const trigger = event.target.closest?.('[data-lexeme-id]');
  if (trigger && lexemeInteractionAllowed(trigger) && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    showLexemePopover(trigger, true);
  }
});

lexemePopover.addEventListener('pointerenter', () => clearTimeout(lexemeCloseTimer));
lexemePopover.addEventListener('pointerleave', scheduleLexemeClose);
lexemePopover.addEventListener('click', (event) => {
  const button = event.target.closest('[data-lexeme-action]');
  if (!button) return;
  const entry = lexicon.byId.get(activeLexemeId);
  if (button.dataset.lexemeAction === 'close') closeLexemePopover();
  if (button.dataset.lexemeAction === 'play' && entry) {
    const src = wordTargetAudio(entry);
    if (src) audio.play(src).then((ok) => { if (!ok) notify(audioFailureMessage()); });
  }
  if (button.dataset.lexemeAction === 'status' && entry) {
    setWordStatus(state, entry.id, button.dataset.status);
    persist();
    updateLexemeNodes(entry.id);
    renderLexemePopover();
  }
});

window.addEventListener('scroll', closeLexemePopover, { capture: true, passive: true });
window.addEventListener('resize', positionLexemePopover);

document.getElementById('playback-rate').addEventListener('change', (event) => {
  state.settings.playbackRate = Number(event.target.value);
  persist();
});

document.getElementById('learning-direction').addEventListener('change', (event) => {
  if (!state) return;
  setLearningDirection(state, event.target.value);
  ui.reviewQueueIds = null;
  ui.reviewRevealed = false;
  ui.reviewMode = 'recall';
  ui.orderSelection = [];
  if (wordDialog.open) wordDialog.close();
  persist();
  render();
  notify(isReverseDirection() ? '已切換為越南人學繁中' : '已切換為台灣人學越南語');
});

window.addEventListener('hashchange', render);

async function init() {
  try {
    const [words, dictionary, lessons, patterns, audioManifest] = await Promise.all(
      Object.values(DATA_PATHS).map((url) => fetch(url).then((response) => {
        if (!response.ok) throw new Error(`無法載入 ${url}`);
        return response.json();
      })),
    );
    data = {
      words,
      lexicon: dictionary,
      lessons,
      patterns,
      generatedAudio: new Set(audioManifest.assets.filter((asset) => asset.generated).map((asset) => asset.output)),
    };
    lexicon = createLexicon(dictionary, lessons);
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
      navigator.serviceWorker.register('./sw.js?v=30', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(() => {});
    }
  } catch (error) {
    app.innerHTML = `<section class="fatal"><p class="eyebrow">載入失敗</p><h1>Lexa 暫時無法開啟</h1><p>${escapeHtml(error.message)}</p><button class="button primary" type="button" data-action="reload">重新載入</button></section>`;
  }
}

init();
