#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const [manifestArg, qaArg] = process.argv.slice(2);
if (!manifestArg || !qaArg) {
  throw new Error('Usage: node scripts/validate-core-qa.js MANIFEST QA_EXPORT');
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestArg), 'utf8'));
const qa = JSON.parse(fs.readFileSync(path.resolve(qaArg), 'utf8'));
const expected = manifest.assets.map((asset) => asset.output);
const pending = manifest.assets.filter((asset) => {
  const result = qa.results?.[asset.output];
  return result?.status !== 'pass' || result.text !== asset.text;
});

assert.strictEqual(manifest.expected, 200, 'A 50-word batch must contain 200 audio files');
assert.deepStrictEqual(qa.regenerate || [], [], 'QA export still contains files marked for regeneration');
assert.strictEqual(pending.length, 0, `Manual QA is incomplete: ${pending.length}/200 files are not marked pass`);

console.log('core batch manual QA ok: 200/200 files marked pass');
