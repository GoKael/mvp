#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const normalize = (value) => String(value || '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();

const lexicon = read('server/data/lexicon.json');
const lessons = read('server/data/lessons.json');
const candidateLessons = read('content/review/transport-lessons.json');
const archive = Object.values(read('server/data/archive/lr_3k.json'));
const archiveRanks = new Map(archive.map((word) => [normalize(word.word), word.rank]));
const lessonWordIds = new Set(lessons.flatMap((lesson) => lesson.segments.flatMap((segment) => segment.wordIds)));
const candidateWordIds = new Set(candidateLessons.flatMap((lesson) => lesson.segments.flatMap((segment) => segment.wordIds)));
const byVietnamese = new Map(lexicon.map((word) => [normalize(word.vi), word]));

const domains = [
  { range: [101, 150], name: '人稱、疑問、數字、時間、金錢', required: ['tôi', 'bao nhiêu', 'cảm ơn', 'hai', 'hôm nay', 'tiền'] },
  { range: [151, 200], name: '交通、方向、住宿、居家', required: ['xe', 'sân bay', 'bên trái', 'đi bộ', 'khách sạn', 'nhà vệ sinh'] },
  { range: [201, 250], name: '購物、健康、求助、常用動作', required: ['mua', 'thanh toán', 'giúp', 'bệnh viện', 'nhà thuốc'] },
  { range: [251, 300], name: '社交、家庭、工作、常用描述', required: ['gia đình', 'công việc', 'đồng nghiệp', 'thích', 'nhiều', 'thường'] },
];

assert.strictEqual(lexicon.length, 300, 'Vocabulary roadmap requires exactly 300 lexical units');
assert.strictEqual(lexicon.filter((word) => word.quality === 'verified').length, 100, 'Expected 100 published words');
assert.strictEqual(lexicon.filter((word) => word.quality === 'reviewed').length, 200, 'Expected 200 reviewed words');
assert.strictEqual(new Set(lexicon.map((word) => normalize(word.vi))).size, 300, 'Vocabulary roadmap contains duplicate lexical units');

domains.forEach(({ range: [start, end], name, required }) => {
  const batch = lexicon.filter((word) => word.rank >= start && word.rank <= end);
  assert.strictEqual(batch.length, 50, `${name} must contain 50 lexical units`);
  required.forEach((word) => assert.ok(byVietnamese.has(normalize(word)), `${name} is missing ${word}`));
});

lessonWordIds.forEach((id) => assert.ok(lexicon.some((word) => word.id === id), `Lesson references unknown word: ${id}`));
candidateWordIds.forEach((id) => {
  const word = lexicon.find((entry) => entry.id === id);
  assert.ok(word, `Candidate lesson references unknown word: ${id}`);
  assert.strictEqual(word.quality, 'reviewed', `Candidate lesson bypasses the Core quality gate: ${id}`);
});

const reviewed = lexicon.filter((word) => word.quality === 'reviewed');
const archivedReviewed = reviewed.filter((word) => archiveRanks.has(normalize(word.vi)));
const archivedTop1000 = archivedReviewed.filter((word) => archiveRanks.get(normalize(word.vi)) <= 1000);
const linkedWords = lexicon.filter((word) => lessonWordIds.has(word.id));
const candidateLinkedWords = lexicon.filter((word) => candidateWordIds.has(word.id));
const combinedWordIds = new Set([...lessonWordIds, ...candidateWordIds]);
const combinedLinkedWords = lexicon.filter((word) => combinedWordIds.has(word.id));

assert.ok(archivedReviewed.length >= 150, 'Core 101–300 lost too much archived frequency evidence');
assert.ok(archivedTop1000.length >= 100, 'Core 101–300 must retain at least 100 archived top-1000 matches');

console.log(JSON.stringify({
  lexicalUnits: lexicon.length,
  verified: 100,
  reviewed: 200,
  reviewedFoundInArchived3k: archivedReviewed.length,
  reviewedFoundInArchivedTop1000: archivedTop1000.length,
  linkedToPublishedLessons: linkedWords.length,
  lessonCoveragePercent: Number((linkedWords.length / lexicon.length * 100).toFixed(1)),
  linkedToReviewedTransportLessons: candidateLinkedWords.length,
  combinedLessonCoverageAfterPromotion: combinedLinkedWords.length,
  combinedLessonCoveragePercentAfterPromotion: Number((combinedLinkedWords.length / lexicon.length * 100).toFixed(1)),
  domains: domains.map(({ range, name }) => ({ range: `${range[0]}-${range[1]}`, name, count: 50 })),
}, null, 2));
