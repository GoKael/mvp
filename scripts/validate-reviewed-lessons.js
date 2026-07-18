#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.resolve(ROOT, process.argv[2] || 'content/transport-30.source.json');
const readFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const source = readFile(sourcePath);
const readOutput = (suffix) => readFile(path.join(ROOT, `content/review/${source.id}-${suffix}.json`));
const normalize = (value) => String(value || '')
  .normalize('NFC')
  .toLocaleLowerCase('vi')
  .replace(/[.,!?“”]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const containsPhrase = (sentence, phrase) => ` ${normalize(sentence)} `.includes(` ${normalize(phrase)} `);

const lessons = readOutput('lessons');
const jobs = readOutput('audio-jobs');
const manifest = readOutput('audio-manifest');
const lexicon = readFile(path.join(ROOT, 'server/data/lexicon.json'));
const wordsById = new Map(lexicon.map((word) => [word.id, word]));
const sourceSegments = source.lessons.flatMap((lesson) => lesson.segments);
const segments = lessons.flatMap((lesson) => lesson.segments);
const expectedSegments = source.expectedLessons * 3;

assert.strictEqual(source.status, 'reviewed', 'Candidate source must remain reviewed');
assert.strictEqual(source.lessons.length, source.expectedLessons, `${source.id} lesson count mismatch`);
assert.strictEqual(sourceSegments.length, expectedSegments, `${source.id} sentence count mismatch`);
assert.strictEqual(lessons.length, source.expectedLessons, `${source.id} built lesson count mismatch`);
assert.strictEqual(segments.length, expectedSegments, `${source.id} built sentence count mismatch`);
assert.strictEqual(new Set(lessons.map((lesson) => lesson.id)).size, source.expectedLessons, `${source.id} lesson ids must be unique`);

lessons.forEach((lesson, lessonIndex) => {
  assert.strictEqual(lesson.id, `${source.id}-${String(lessonIndex + 1).padStart(3, '0')}`);
  assert.strictEqual(lesson.category, source.category);
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
      assert.strictEqual(word.quality, 'reviewed', `Candidate pack bypasses the Core quality gate: ${wordId}`);
      assert.ok(containsPhrase(segment.vi, word.vi), `Linked Core word is absent: ${lesson.id}/${word.vi}`);
    });
  });
});

const coveredRanks = new Set(segments.flatMap((segment) => segment.wordIds.map((id) => wordsById.get(id).rank)));
const [firstRank, lastRank] = source.requiredCoreRange;
for (let rank = firstRank; rank <= lastRank; rank += 1) {
  assert.ok(coveredRanks.has(rank), `${source.id} pack does not cover Core rank ${rank}`);
}

const expectedJobs = expectedSegments * 2;
assert.strictEqual(jobs.length, expectedJobs, `${expectedSegments} bilingual sentences require ${expectedJobs} TTS jobs`);
assert.strictEqual(manifest.status, 'reviewed');
assert.strictEqual(manifest.expected, expectedJobs);
assert.strictEqual(manifest.assets.length, expectedJobs);
assert.strictEqual(new Set(jobs.map((job) => job.output)).size, expectedJobs, 'Candidate audio paths must be unique');
assert.strictEqual(jobs.filter((job) => job.languageCode === 'cmn-TW').length, expectedSegments);
assert.strictEqual(jobs.filter((job) => job.languageCode === 'vi-VN').length, expectedSegments);
jobs.forEach((job) => {
  assert.strictEqual(job.kind, 'lesson');
  assert.strictEqual(job.voice, 'Zephyr');
  assert.ok(job.output.startsWith(`assets/audio/candidates/${source.id}/`));
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

console.log(`${source.id} pack ok: ${lessons.length} reviewed lessons, ${segments.length} sentences, Core ${firstRank}-${lastRank}, ${jobs.length} audio jobs`);
