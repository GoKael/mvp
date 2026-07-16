import assert from 'node:assert/strict';
import {
  STATUS,
  LEARNING_DIRECTION,
  completeLesson,
  dueLessonSegments,
  dueWords,
  filterDictionaryWords,
  lessonLearningProgress,
  lessonProgress,
  lessonSegmentProgress,
  loadState,
  parseRoute,
  recordAttempt,
  recordLessonSegmentRecall,
  reviewLessonSegment,
  reviewRound,
  reviewRoundItems,
  reviewWord,
  setLearningDirection,
  setWordStatus,
  startLesson,
  updateLessonSegment,
  wordProgress,
} from '../lib/app-core.mjs';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const words = [
  { id: 'vi:001-la', vi: 'là', rank: 1 },
  { id: 'vi:002-dau', vi: 'đâu', rank: 2 },
  { id: 'vi:003-dau', vi: 'đau', rank: 3 },
];
const storage = new MemoryStorage({
  vaultWordStatuses: JSON.stringify({ là: 2, đâu: 1 }),
  lexaWeakWords: JSON.stringify({ đâu: { misses: 2 } }),
});
const state = loadState(storage, words);
assert.equal(wordProgress(state, words[0].id).status, STATUS.KNOWN);
assert.equal(wordProgress(state, words[1].id).misses, 2);
assert.equal(wordProgress(state, words[2].id).status, STATUS.NEW);

const now = 1_700_000_000_000;
setWordStatus(state, words[2].id, STATUS.LEARNING, now);
assert.equal(wordProgress(state, words[2].id).nextReviewAt, now + 12 * 60 * 60 * 1000);
reviewWord(state, words[2].id, 'again', now + 1);
assert.equal(wordProgress(state, words[2].id).misses, 1);
reviewWord(state, words[2].id, 'good', now + 2);
reviewWord(state, words[2].id, 'good', now + 3);
assert.equal(wordProgress(state, words[2].id).status, STATUS.KNOWN);
assert.equal(dueWords(words, state, Date.now() + 40 * 24 * 60 * 60 * 1000).length, 3);
const round = reviewRound(words, state, now, 10);
assert.equal(new Set(round.map((word) => word.id)).size, round.length);
assert.ok(round.length > 1);

const freshWords = Array.from({ length: 12 }, (_, index) => ({ id: `vi:new-${index}`, vi: `new-${index}`, rank: index + 1 }));
const freshRound = reviewRound(freshWords, { words: {} }, now, 10);
assert.equal(freshRound.length, 5);

const dictionary = [
  { ...words[0], zhTW: '是', pos: '動詞', quality: 'verified', examples: [] },
  { id: 'vi:101-toi', vi: 'tôi', zhTW: '我', pos: '代名詞', rank: 101, quality: 'reviewed', examples: [] },
  { id: 'vi:draft', vi: 'nháp', zhTW: '草稿', pos: '名詞', rank: 301, quality: 'draft', examples: [] },
];
assert.equal(filterDictionaryWords(dictionary, state, 'all').length, 3);
assert.deepEqual(filterDictionaryWords(dictionary, state, 'reviewed').map((word) => word.id), ['vi:101-toi']);
assert.equal(filterDictionaryWords(dictionary, state, STATUS.NEW).length, 0);
assert.deepEqual(filterDictionaryWords(dictionary, state, 'all', '代名詞').map((word) => word.id), ['vi:101-toi']);

const overdueState = { words: Object.fromEntries(freshWords.map((word) => [word.id, {
  status: STATUS.LEARNING,
  box: 1,
  nextReviewAt: now - 1,
  hits: 0,
  misses: 0,
  lastReviewedAt: 0,
}])) };
assert.equal(reviewRound(freshWords, overdueState, now, 10).length, 10);

const lesson = { id: 'food-001', segments: [{ id: 1, wordIds: [words[0].id, words[2].id] }] };
startLesson(state, lesson.id, now);
updateLessonSegment(state, lesson.id, 1, { understoodAt: now, feynman: 'clear', feynmanNote: '這句說明人物與動作。', recalledAt: now });
assert.equal(lessonSegmentProgress(state, lesson.id, 1).feynman, 'clear');
assert.deepEqual(lessonLearningProgress(state, lesson), {
  started: true,
  understood: 1,
  explained: 1,
  recalled: 1,
  completed: false,
});
completeLesson(state, lesson, now);
assert.equal(state.lessons['food-001'].completedAt, now);
assert.equal(state.lessons['food-001'].segments[1].recalledAt, now);
recordLessonSegmentRecall(state, lesson.id, 1, false, now + 1);
assert.equal(dueLessonSegments([lesson], state, now + 1).length, 1);
assert.equal(reviewRoundItems(words, [lesson], state, now + 1, 10)[0].type, 'segment');
reviewLessonSegment(state, lesson.id, 1, 'again', now + 2);
assert.equal(dueLessonSegments([lesson], state, now + 2).length, 0);
recordLessonSegmentRecall(state, lesson.id, 1, true, now + 3);
assert.equal(lessonSegmentProgress(state, lesson.id, 1).reviewBox, 1);
setLearningDirection(state, LEARNING_DIRECTION.VI_TO_ZH);
assert.equal(wordProgress(state, words[0].id).status, STATUS.NEW);
assert.equal(lessonProgress(state, lesson.id).completedAt, undefined);
setWordStatus(state, words[0].id, STATUS.LEARNING, now + 4);
assert.equal(wordProgress(state, words[0].id).status, STATUS.LEARNING);
setLearningDirection(state, LEARNING_DIRECTION.ZH_TO_VI);
assert.equal(wordProgress(state, words[0].id).status, STATUS.KNOWN);
assert.equal(lessonProgress(state, lesson.id).completedAt, now);
recordAttempt(state, words[0].id, 'miss', now);
assert.equal(wordProgress(state, words[0].id).misses, 1);
assert.deepEqual(parseRoute('#/lesson/food-001'), { name: 'lesson', id: 'food-001' });
assert.deepEqual(parseRoute('#/unknown'), { name: 'today', id: '' });

console.log('core ok');
