#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RELEASES = path.join(ROOT, 'content/core-releases.json');
const [manifestArg, qaArg] = process.argv.slice(2);

if (!manifestArg || !qaArg) throw new Error('Usage: node scripts/promote-core-batch.js MANIFEST QA_EXPORT');

const manifestPath = path.resolve(ROOT, manifestArg);
const qaPath = path.resolve(ROOT, qaArg);
const match = /^core-(\d+)-(\d+)-audio-manifest\.json$/.exec(path.basename(manifestPath));
assert.ok(match, 'Manifest filename must identify a Core range');
const start = Number(match[1]);
const end = Number(match[2]);
const range = `${start}-${end}`;
const previous = fs.readFileSync(RELEASES, 'utf8');
const releases = JSON.parse(previous);
const expectedStart = 101 + releases.length * 50;

assert.strictEqual(start, expectedStart, `Next release must start at ${expectedStart}`);
assert.strictEqual(end, start + 49, 'A release must contain exactly 50 words');
assert.ok(!releases.includes(range), `Core ${range} is already released`);

function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${script} failed`);
}

run('validate-core-qa.js', [manifestPath, qaPath]);
run('validate-core-batch-audio.js', [manifestPath]);

try {
  fs.writeFileSync(RELEASES, `${JSON.stringify([...releases, range], null, 2)}\n`);
  run('build-data.js');
  run('validate-data.js', ['--strict-audio']);
} catch (error) {
  fs.writeFileSync(RELEASES, previous);
  run('build-data.js');
  throw error;
}

console.log(`Core ${range} promoted; published vocabulary now contains ${end} words.`);
