#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/core-100.json'), 'utf8'));
const reviewed = fs.readdirSync(path.join(ROOT, 'content'))
  .map((file) => ({ file, match: /^core-(\d+)-(\d+)\.source\.json$/.exec(file) }))
  .filter(({ match }) => match)
  .sort((left, right) => Number(left.match[1]) - Number(right.match[1]))
  .map(({ file }) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', file), 'utf8')));
const normalize = (value) => String(value || '').normalize('NFC').toLocaleLowerCase('vi').replace(/[.,!?“”]/g, '').replace(/\s+/g, ' ').trim();

reviewed.forEach((batch, batchIndex) => {
  const start = 101 + batchIndex * 50;
  assert.strictEqual(batch.length, 50, `Core ${start}-${start + 49} must contain 50 lexical units`);
  assert.deepStrictEqual(batch.map((word) => word.rank), Array.from({ length: 50 }, (_, index) => index + start));
  assert.strictEqual(new Set(batch.map((word) => normalize(word.vi))).size, 50, `Core ${start}-${start + 49} contains duplicate lexical units`);
});

const existing = new Set(current.map((word) => normalize(word.vi)));
reviewed.flat().forEach((word) => {
  assert.ok(word.vi && word.zhTW && word.pos, `Missing required fields: ${word.rank}`);
  assert.ok(!existing.has(normalize(word.vi)), `Already exists in Core 100: ${word.vi}`);
  existing.add(normalize(word.vi));
  assert.strictEqual(word.quality, 'reviewed', `Batch item must remain reviewed until audio QA: ${word.vi}`);
  assert.strictEqual(word.examples.length, 3, `Expected three examples: ${word.vi}`);
  assert.strictEqual(new Set(word.examples.map((example) => normalize(example.vi))).size, 3, `Duplicate examples: ${word.vi}`);
  word.examples.forEach((example) => {
    assert.ok(example.vi && example.zhTW, `Incomplete example: ${word.vi}`);
    assert.ok(normalize(example.vi).includes(normalize(word.vi)), `Example does not contain ${word.vi}: ${example.vi}`);
    assert.ok(!/meaning pending|vietnamese core word|包含「|\.\.\./i.test(example.zhTW), `Placeholder found: ${word.vi}`);
  });
});

const planned = [...current, ...reviewed.flat()].map((word) => normalize(word.vi));
assert.strictEqual(new Set(planned).size, planned.length, 'Core plan contains duplicate lexical units');

[...current, ...reviewed.flat()].forEach((word) => {
  assert.ok(!/meaning pending|\bword\b|\btbd\b/i.test(word.zhTW), `Definition contains placeholder text: ${word.vi}`);
  if (word.pos.includes('／')) {
    assert.ok(/[；、／]/.test(word.zhTW), `Multiple parts of speech need a multi-sense definition: ${word.vi}`);
  }
});

console.log(`core plan ok: 100 verified, ${reviewed.flat().length} reviewed with ${reviewed.flat().length * 3} examples, 0 content-only candidates`);
