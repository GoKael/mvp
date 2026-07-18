#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const normalize = (value) => String(value || '')
  .normalize('NFC')
  .toLocaleLowerCase('vi')
  .replace(/[.,!?“”]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const containsPhrase = (sentence, phrase) => ` ${normalize(sentence)} `.includes(` ${normalize(phrase)} `);

const source = read('content/transport-30.source.json');
const lessons = read('content/review/transport-lessons.json');
const jobs = read('content/review/transport-audio-jobs.json');
const manifest = read('content/review/transport-audio-manifest.json');
const lexicon = read('server/data/lexicon.json');
const wordsById = new Map(lexicon.map((word) => [word.id, word]));
const sourceSegments = source.lessons.flatMap((lesson) => lesson.segments);
const segments = lessons.flatMap((lesson) => lesson.segments);

assert.strictEqual(source.status, 'reviewed', 'Candidate source must remain reviewed');
assert.strictEqual(source.lessons.length, 10, 'Transport pack needs ten lessons');
assert.strictEqual(sourceSegments.length, 30, 'Transport pack needs thirty sentences');
assert.strictEqual(lessons.length, 10, 'Expected ten built transport lessons');
assert.strictEqual(segments.length, 30, 'Expected thirty built transport segments');
assert.strictEqual(new Set(lessons.map((lesson) => lesson.id)).size, 10, 'Transport lesson ids must be unique');

lessons.forEach((lesson, lessonIndex) => {
  assert.strictEqual(lesson.id, `transport-${String(lessonIndex + 1).padStart(3, '0')}`);
  assert.strictEqual(lesson.category, 'transport');
  assert.strictEqual(lesson.status, 'reviewed', `${lesson.id} cannot publish before Core QA`);
  assert.strictEqual(lesson.durationSec, 30);
  assert.strictEqual(lesson.segments.length, 3);
  lesson.segments.forEach((segment, segmentIndex) => {
    assert.strictEqual(segment.id, segmentIndex + 1);
    assert.ok(segment.topic.vi && segment.topic.zhTW && segment.vi && segment.zhTW);
    assert.ok(segment.focusWords.length >= 2, `Missing focus words: ${lesson.id}/${segment.id}`);
    assert.ok(segment.breakdown.length >= 2, `Missing breakdown: ${lesson.id}/${segment.id}`);
    assert.ok(segment.wordIds.length >= 1, `Missing Core links: ${lesson.id}/${segment.id}`);
    segment.focusWords.forEach((word) => {
      assert.ok(word.vi && word.zhTW, `Incomplete focus word: ${lesson.id}/${segment.id}`);
      assert.ok(containsPhrase(segment.vi, word.vi), `Focus phrase is absent: ${lesson.id}/${word.vi}`);
    });
    segment.breakdown.forEach((part) => {
      assert.ok(part.role && part.vi && part.zhTW, `Incomplete breakdown: ${lesson.id}/${segment.id}`);
      assert.ok(containsPhrase(segment.vi, part.vi), `Breakdown phrase is absent: ${lesson.id}/${part.vi}`);
    });
    segment.wordIds.forEach((wordId) => {
      const word = wordsById.get(wordId);
      assert.ok(word, `Unknown Core link: ${wordId}`);
      assert.strictEqual(word.quality, 'reviewed', `Candidate pack should only unlock reviewed Core words: ${wordId}`);
      assert.ok(containsPhrase(segment.vi, word.vi), `Linked Core word is absent: ${lesson.id}/${word.vi}`);
    });
  });
});

const coveredRanks = new Set(segments.flatMap((segment) => segment.wordIds.map((id) => wordsById.get(id).rank)));
for (let rank = 151; rank <= 185; rank += 1) {
  assert.ok(coveredRanks.has(rank), `Transport pack does not cover Core rank ${rank}`);
}

assert.strictEqual(jobs.length, 60, 'Thirty bilingual sentences require sixty TTS jobs');
assert.strictEqual(manifest.status, 'reviewed');
assert.strictEqual(manifest.expected, 60);
assert.strictEqual(manifest.assets.length, 60);
assert.strictEqual(new Set(jobs.map((job) => job.output)).size, 60, 'Candidate audio paths must be unique');
assert.strictEqual(jobs.filter((job) => job.languageCode === 'cmn-TW').length, 30);
assert.strictEqual(jobs.filter((job) => job.languageCode === 'vi-VN').length, 30);
jobs.forEach((job) => {
  assert.strictEqual(job.kind, 'lesson');
  assert.strictEqual(job.voice, 'Zephyr');
  assert.ok(job.output.startsWith('assets/audio/candidates/transport/'));
});

segments.forEach((segment) => {
  const files = [segment.audio.zhTW, segment.audio.vi].map((file) => path.join(ROOT, file));
  if (!files.every(fs.existsSync)) return;
  const totalDuration = files.reduce((total, file) => {
    const result = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
    ], { encoding: 'utf8' });
    const duration = Number.parseFloat(result.stdout);
    assert.ok(result.status === 0 && Number.isFinite(duration), `Candidate audio cannot be decoded: ${file}`);
    return total + duration;
  }, 0);
  assert.ok(totalDuration <= 9.25, `Bilingual candidate audio exceeds its scene: ${totalDuration.toFixed(2)}s`);
});

console.log(`transport pack ok: 10 reviewed lessons, 30 sentences, 35 Core words, ${jobs.length} audio jobs`);
