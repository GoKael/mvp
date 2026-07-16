export const STORAGE_KEY = 'lexa:v2';
export const STATUS = Object.freeze({
  NEW: 'new',
  LEARNING: 'learning',
  KNOWN: 'known',
  IGNORED: 'ignored',
});
export const LEARNING_DIRECTION = Object.freeze({
  ZH_TO_VI: 'zhTW-vi',
  VI_TO_ZH: 'vi-zhTW',
});

const DAY = 24 * 60 * 60 * 1000;
const HALF_DAY = 12 * 60 * 60 * 1000;
const BOX_DAYS = [0, 1, 3, 7, 14, 30];

export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ')
    .trim();
}

export function emptyState() {
  return {
    version: 2,
    migratedAt: Date.now(),
    words: {},
    lessons: {},
    settings: { playbackRate: 1, learningDirection: LEARNING_DIRECTION.ZH_TO_VI },
    inbox: [],
  };
}

function parseStored(storage, key, fallback) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

export function loadState(storage, words) {
  const current = parseStored(storage, STORAGE_KEY, null);
  if (current?.version === 2) {
    return {
      ...emptyState(),
      ...current,
      words: current.words || {},
      lessons: current.lessons || {},
      settings: { ...emptyState().settings, ...(current.settings || {}) },
      inbox: Array.isArray(current.inbox) ? current.inbox : [],
    };
  }

  const state = emptyState();
  const oldStatuses = parseStored(storage, 'vaultWordStatuses', {});
  const oldWeak = parseStored(storage, 'lexaWeakWords', {});
  const oldReview = parseStored(storage, 'lexaReviewSchedule', {});
  const byExactText = new Map(words.map((word) => [word.vi, word]));
  const normalizedGroups = new Map();
  words.forEach((word) => {
    const key = normalize(word.vi);
    normalizedGroups.set(key, [...(normalizedGroups.get(key) || []), word]);
  });
  const oldStatusMap = { 1: STATUS.LEARNING, 2: STATUS.KNOWN, 3: STATUS.IGNORED };

  Object.entries(oldStatuses).forEach(([text, statusCode]) => {
    const candidates = normalizedGroups.get(normalize(text)) || [];
    const word = byExactText.get(text) || (candidates.length === 1 ? candidates[0] : null);
    const status = oldStatusMap[Number(statusCode)];
    if (!word || !status) return;
    const weakness = oldWeak[text] || {};
    state.words[word.id] = {
      status,
      box: status === STATUS.KNOWN ? 3 : (status === STATUS.LEARNING ? 1 : 0),
      nextReviewAt: status === STATUS.IGNORED ? 0 : Number(oldReview[text] || Date.now()),
      hits: Number(weakness.hits || 0),
      misses: Number(weakness.misses || 0),
      lastReviewedAt: Number(weakness.updatedAt || 0),
    };
  });
  saveState(storage, state);
  return state;
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function learningDirection(state) {
  return Object.values(LEARNING_DIRECTION).includes(state?.settings?.learningDirection)
    ? state.settings.learningDirection
    : LEARNING_DIRECTION.ZH_TO_VI;
}

export function setLearningDirection(state, direction) {
  if (!Object.values(LEARNING_DIRECTION).includes(direction)) return state;
  state.settings = { ...(state.settings || {}), learningDirection: direction };
  return state;
}

function directedKey(state, id) {
  const direction = learningDirection(state);
  return direction === LEARNING_DIRECTION.ZH_TO_VI ? id : `${direction}:${id}`;
}

export function wordProgress(state, wordId) {
  return state.words?.[directedKey(state, wordId)] || {
    status: STATUS.NEW,
    box: 0,
    nextReviewAt: 0,
    hits: 0,
    misses: 0,
    lastReviewedAt: 0,
  };
}

export function filterDictionaryWords(words, state, filter = 'all', query = '') {
  const needle = normalize(query);
  return words.filter((word) => {
    const reviewed = word.quality === 'reviewed';
    const verified = word.quality === 'verified';
    const matchesStatus = filter === 'all'
      || (filter === 'reviewed' ? reviewed : (verified && wordProgress(state, word.id).status === filter));
    const values = [word.vi, word.zhTW, word.pos, ...(word.examples || []).flatMap((example) => [example.vi, example.zhTW])];
    return matchesStatus && (!needle || values.some((value) => normalize(value).includes(needle)));
  });
}

export function lessonProgress(state, lessonId) {
  return state.lessons?.[directedKey(state, lessonId)] || {};
}

export function lessonSegmentProgress(state, lessonId, segmentId) {
  return {
    understoodAt: 0,
    feynman: '',
    feynmanNote: '',
    feynmanAt: 0,
    recalledAt: 0,
    recallMisses: 0,
    reviewBox: 0,
    reviewHits: 0,
    reviewMisses: 0,
    nextReviewAt: 0,
    ...(lessonProgress(state, lessonId).segments?.[segmentId] || {}),
  };
}

export function startLesson(state, lessonId, now = Date.now()) {
  const key = directedKey(state, lessonId);
  const lesson = lessonProgress(state, lessonId);
  state.lessons[key] = { ...lesson, startedAt: lesson.startedAt || now };
  return state;
}

export function updateLessonSegment(state, lessonId, segmentId, changes) {
  const key = directedKey(state, lessonId);
  const lesson = lessonProgress(state, lessonId);
  state.lessons[key] = {
    ...lesson,
    segments: {
      ...(lesson.segments || {}),
      [segmentId]: { ...lessonSegmentProgress(state, lessonId, segmentId), ...changes },
    },
  };
  return state;
}

export function lessonLearningProgress(state, lesson) {
  const segments = lesson.segments.map((segment) => lessonSegmentProgress(state, lesson.id, segment.id));
  return {
    started: Boolean(lessonProgress(state, lesson.id).startedAt),
    understood: segments.filter((segment) => segment.understoodAt).length,
    explained: segments.filter((segment) => segment.feynman === 'clear' && segment.feynmanNote.trim()).length,
    recalled: segments.filter((segment) => segment.recalledAt).length,
    completed: Boolean(lessonProgress(state, lesson.id).completedAt),
  };
}

export function recordLessonSegmentRecall(state, lessonId, segmentId, clear, now = Date.now()) {
  const previous = lessonSegmentProgress(state, lessonId, segmentId);
  return updateLessonSegment(state, lessonId, segmentId, {
    recalledAt: clear ? now : 0,
    recallMisses: previous.recallMisses + (clear ? 0 : 1),
    reviewBox: clear ? Math.max(1, previous.reviewBox || 0) : 0,
    reviewHits: previous.reviewHits + (clear ? 1 : 0),
    reviewMisses: previous.reviewMisses + (clear ? 0 : 1),
    nextReviewAt: clear ? now + DAY : now,
  });
}

export function reviewLessonSegment(state, lessonId, segmentId, rating, now = Date.now()) {
  const previous = lessonSegmentProgress(state, lessonId, segmentId);
  if (rating === 'again') {
    return updateLessonSegment(state, lessonId, segmentId, {
      reviewBox: 0,
      reviewMisses: previous.reviewMisses + 1,
      nextReviewAt: now + HALF_DAY,
    });
  }
  const reviewBox = Math.min(5, Math.max(0, previous.reviewBox || 0) + 1);
  return updateLessonSegment(state, lessonId, segmentId, {
    recalledAt: now,
    reviewBox,
    reviewHits: previous.reviewHits + 1,
    nextReviewAt: now + BOX_DAYS[reviewBox] * DAY,
  });
}

export function setWordStatus(state, wordId, status, now = Date.now()) {
  const key = directedKey(state, wordId);
  const previous = wordProgress(state, wordId);
  if (status === STATUS.NEW) {
    delete state.words[key];
    return state;
  }
  const next = { ...previous, status, lastReviewedAt: now };
  if (status === STATUS.LEARNING) {
    next.box = 1;
    next.nextReviewAt = now + HALF_DAY;
  } else if (status === STATUS.KNOWN) {
    next.box = Math.max(3, previous.box || 0);
    next.nextReviewAt = now + BOX_DAYS[next.box] * DAY;
  } else {
    next.box = 0;
    next.nextReviewAt = 0;
  }
  state.words[key] = next;
  return state;
}

export function reviewWord(state, wordId, rating, now = Date.now()) {
  const key = directedKey(state, wordId);
  const previous = wordProgress(state, wordId);
  const next = { ...previous, lastReviewedAt: now };
  if (rating === 'again') {
    next.status = STATUS.LEARNING;
    next.box = 1;
    next.misses += 1;
    next.nextReviewAt = now + HALF_DAY;
  } else if (rating === 'good') {
    next.box = Math.min(5, Math.max(0, previous.box) + 1);
    next.status = next.box >= 3 ? STATUS.KNOWN : STATUS.LEARNING;
    next.hits += 1;
    next.nextReviewAt = now + BOX_DAYS[next.box] * DAY;
  } else if (rating === 'known') {
    return setWordStatus(state, wordId, STATUS.KNOWN, now);
  } else if (rating === 'ignored') {
    return setWordStatus(state, wordId, STATUS.IGNORED, now);
  }
  state.words[key] = next;
  return state;
}

export function recordAttempt(state, wordId, result, now = Date.now()) {
  const key = directedKey(state, wordId);
  const previous = wordProgress(state, wordId);
  state.words[key] = {
    ...previous,
    hits: previous.hits + (result === 'hit' ? 1 : 0),
    misses: previous.misses + (result === 'miss' ? 1 : 0),
    lastReviewedAt: now,
  };
  return state;
}

export function dueWords(words, state, now = Date.now()) {
  return words
    .filter((word) => {
      const progress = wordProgress(state, word.id);
      return (progress.status === STATUS.LEARNING || progress.status === STATUS.KNOWN)
        && progress.nextReviewAt <= now;
    })
    .sort((left, right) => {
      const a = wordProgress(state, left.id);
      const b = wordProgress(state, right.id);
      const aScore = a.misses * 3 - a.hits + Math.max(0, now - a.nextReviewAt) / DAY;
      const bScore = b.misses * 3 - b.hits + Math.max(0, now - b.nextReviewAt) / DAY;
      return bScore - aScore || left.rank - right.rank;
    });
}

export function reviewRound(words, state, now = Date.now(), limit = 10) {
  const due = dueWords(words, state, now).slice(0, limit);
  const selected = [...due];
  const selectedIds = new Set(due.map((word) => word.id));

  words.forEach((word) => {
    if (selected.length >= limit || selectedIds.has(word.id)) return;
    const status = wordProgress(state, word.id).status;
    if (status === STATUS.LEARNING || status === STATUS.KNOWN) {
      selected.push(word);
      selectedIds.add(word.id);
    }
  });

  if (selected.length) return selected;
  return words
    .filter((word) => wordProgress(state, word.id).status === STATUS.NEW)
    .slice(0, Math.min(5, limit));
}

export function dueLessonSegments(lessons, state, now = Date.now()) {
  return lessons.flatMap((lesson) => lesson.segments
    .map((segment) => ({
      type: 'segment',
      key: `segment:${lesson.id}:${segment.id}`,
      lesson,
      segment,
      progress: lessonSegmentProgress(state, lesson.id, segment.id),
    }))
    .filter((item) => item.progress.nextReviewAt > 0 && item.progress.nextReviewAt <= now))
    .sort((left, right) => {
      const score = (item) => item.progress.reviewMisses * 3 - item.progress.reviewHits
        + Math.max(0, now - item.progress.nextReviewAt) / DAY;
      return score(right) - score(left) || left.progress.nextReviewAt - right.progress.nextReviewAt;
    });
}

export function reviewRoundItems(words, lessons, state, now = Date.now(), limit = 10) {
  const segments = dueLessonSegments(lessons, state, now).slice(0, limit);
  const remaining = Math.max(0, limit - segments.length);
  return [
    ...segments,
    ...reviewRound(words, state, now, remaining).map((word) => ({
      type: 'word',
      key: `word:${word.id}`,
      word,
    })),
  ];
}

export function progressSummary(words, lessons, state, now = Date.now()) {
  const counts = { new: 0, learning: 0, known: 0, ignored: 0 };
  words.forEach((word) => { counts[wordProgress(state, word.id).status] += 1; });
  return {
    ...counts,
    due: dueWords(words, state, now).length + dueLessonSegments(lessons, state, now).length,
    completedLessons: lessons.filter((lesson) => lessonProgress(state, lesson.id).completedAt).length,
  };
}

export function completeLesson(state, lesson, now = Date.now()) {
  const key = directedKey(state, lesson.id);
  state.lessons[key] = { ...lessonProgress(state, lesson.id), completedAt: now, lastSegment: 3 };
  const ids = new Set(lesson.segments.flatMap((segment) => segment.wordIds));
  ids.forEach((wordId) => {
    if (wordProgress(state, wordId).status === STATUS.NEW) {
      setWordStatus(state, wordId, STATUS.LEARNING, now);
    }
  });
  return state;
}

export function currentLesson(lessons, state) {
  return lessons.find((lesson) => !lessonProgress(state, lesson.id).completedAt) || lessons[0];
}

export function parseRoute(hash) {
  const clean = String(hash || '#/today').replace(/^#/, '') || '/today';
  const parts = clean.split('/').filter(Boolean);
  const allowed = new Set(['today', 'lessons', 'lesson', 'words', 'review', 'patterns']);
  if (!allowed.has(parts[0])) return { name: 'today', id: '' };
  return { name: parts[0], id: decodeURIComponent(parts[1] || '') };
}
