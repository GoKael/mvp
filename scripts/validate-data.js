#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const words = read('server/data/core.json');
const lessons = read('server/data/lessons.json');
const patterns = read('server/data/patterns.json');
const manifest = read('server/data/audio-manifest.json');
const strictAudio = process.argv.includes('--strict-audio');
const strictLessons = process.argv.includes('--strict-lessons');

assert.ok(words.length >= 100 && words.length <= 300 && words.length % 50 === 0, 'Published Core must contain 100–300 words in 50-word batches');
assert.strictEqual(new Set(words.map((word) => word.id)).size, words.length, 'Word ids must be unique');
assert.strictEqual(new Set(words.map((word) => word.conceptId)).size, words.length, 'Concept ids must be unique');
assert.deepStrictEqual(words.map((word) => word.rank), Array.from({ length: words.length }, (_, index) => index + 1));
words.forEach((word) => {
  assert.ok(word.id.startsWith('vi:'), `Invalid word id: ${word.id}`);
  assert.ok(/^concept:\d{3}$/.test(word.conceptId), `Invalid concept id: ${word.id}`);
  assert.ok(word.vi && word.zhTW && word.pos, `Missing required word fields: ${word.id}`);
  assert.strictEqual(word.quality, 'verified', `Word is not verified: ${word.id}`);
  assert.ok(!/meaning pending|vietnamese core word|\bword\b/i.test(word.zhTW), `Placeholder found: ${word.id}`);
  assert.strictEqual(word.examples.length, 3, `Expected three examples: ${word.id}`);
  word.examples.forEach((example) => {
    assert.ok(example.vi && example.zhTW && example.audio, `Incomplete example: ${word.id}`);
    assert.ok(!/^(?:\.{3}|…+)$/.test(example.zhTW), `Placeholder translation: ${word.id}`);
    assert.ok(normalize(example.vi).split(' ').includes(normalize(word.vi)), `Example does not contain ${word.vi}: ${example.vi}`);
  });
});

assert.strictEqual(lessons.length, 10, 'Expected ten food lessons');
assert.strictEqual(new Set(lessons.map((lesson) => lesson.id)).size, 10, 'Lesson ids must be unique');
lessons.forEach((lesson) => {
  assert.strictEqual(lesson.durationSec, 30, `Lesson must be 30 seconds: ${lesson.id}`);
  assert.strictEqual(lesson.segments.length, 3, `Lesson must contain three segments: ${lesson.id}`);
  lesson.segments.forEach((segment) => {
    assert.ok(segment.zhTW && segment.vi, `Missing bilingual sentence: ${lesson.id}/${segment.id}`);
    assert.ok(segment.audio.zhTW && segment.audio.vi, `Missing bilingual audio path: ${lesson.id}/${segment.id}`);
    assert.ok(segment.focusWords.length >= 2, `Not enough focus words: ${lesson.id}/${segment.id}`);
    assert.ok(segment.breakdown.length >= 2, `Sentence breakdown is incomplete: ${lesson.id}/${segment.id}`);
    const sentence = normalize(segment.vi);
    segment.focusWords.forEach((word) => {
      assert.ok(sentence.includes(normalize(word.vi)), `Focus word is absent: ${lesson.id}/${word.vi}`);
    });
    segment.breakdown.forEach((part) => {
      assert.ok(part.role && part.vi && part.zhTW, `Incomplete sentence part: ${lesson.id}/${segment.id}`);
      assert.ok(sentence.includes(normalize(part.vi)), `Sentence part is absent: ${lesson.id}/${part.vi}`);
    });
  });
});

assert.strictEqual(patterns.length, 8, 'Expected eight verified patterns');
patterns.forEach((pattern) => {
  assert.ok(pattern.id && pattern.title && pattern.summary && pattern.formula, `Incomplete pattern: ${pattern.id}`);
  assert.ok(pattern.explanation && pattern.note, `Pattern guidance is incomplete: ${pattern.id}`);
  assert.ok(pattern.examples.length >= 3, `Pattern needs examples: ${pattern.id}`);
  pattern.examples.forEach((example) => assert.ok(example.vi && example.zhTW && example.audio));
});

assert.strictEqual(manifest.expected, words.length * 4 + 100, 'Unexpected audio job count');
assert.strictEqual(manifest.assets.filter((asset) => asset.kind === 'pattern').length, 40, 'Expected forty pattern audio jobs');
assert.strictEqual(manifest.assets.length, manifest.expected, 'Audio manifest is incomplete');
assert.strictEqual(new Set(manifest.assets.map((asset) => asset.output)).size, manifest.expected, 'Audio paths must be unique');

const missingAudio = manifest.assets.filter((asset) => !fs.existsSync(path.join(ROOT, asset.output)));
const requiredMissing = strictLessons
  ? missingAudio.filter((asset) => asset.kind === 'lesson')
  : missingAudio;
if (strictAudio || strictLessons) {
  const scope = strictLessons ? 'lesson ' : '';
  assert.strictEqual(requiredMissing.length, 0, `Missing ${requiredMissing.length} ${scope}audio files`);
}

const generated = manifest.assets.filter((asset) => fs.existsSync(path.join(ROOT, asset.output)));
generated.forEach((asset) => {
  const file = path.join(ROOT, asset.output);
  assert.ok(fs.statSync(file).size > 512, `Audio file is empty: ${asset.output}`);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  const duration = Number.parseFloat(probe.stdout);
  assert.ok(probe.status === 0 && Number.isFinite(duration), `Audio cannot be decoded: ${asset.output}`);
  assert.ok(duration <= 9.5, `Audio exceeds 9.5 seconds: ${asset.output} (${duration})`);
  if (asset.kind === 'word') {
    assert.ok(duration >= 0.18 && duration <= 2.5, `Word audio duration is suspicious: ${asset.output} (${duration})`);
  }
});

console.log(`data ok: ${words.length} words, 10 lessons, 8 patterns, ${manifest.expected - missingAudio.length}/${manifest.expected} audio files`);
