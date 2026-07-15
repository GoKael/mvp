#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/audio-manifest.json'), 'utf8'));
const publicFiles = [
  'index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', '.nojekyll',
  'memory.html', 'grammar.html', 'content.html',
  'assets/icon.svg',
  'lib/app-core.mjs', 'lib/audio.mjs', 'lib/lexeme.mjs',
  'server/data/core.json', 'server/data/core-100.json', 'server/data/lessons.json',
  'server/data/patterns.json', 'server/data/audio-manifest.json',
  ...manifest.assets.map((asset) => asset.output),
];

fs.rmSync(DIST, { recursive: true, force: true });
for (const relative of publicFiles) {
  const source = path.join(ROOT, relative);
  assert.ok(fs.existsSync(source), `Missing publish file: ${relative}`);
  const target = path.join(DIST, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

fs.writeFileSync(path.join(DIST, '_headers'), `/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/assets/audio/*
  Cache-Control: public, max-age=2592000
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
`);

assert.strictEqual(new Set(publicFiles).size, publicFiles.length, 'Publish list contains duplicate paths');
assert.strictEqual(manifest.assets.length, manifest.expected, 'Audio manifest is incomplete');
console.log(`Built dist with ${publicFiles.length} files (${manifest.assets.length} published audio files).`);
