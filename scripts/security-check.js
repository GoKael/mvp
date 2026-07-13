#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ignored = new Set(['.git', '.venv', 'node_modules', 'archive', 'snapshots']);
const textExtensions = new Set(['.js', '.mjs', '.cjs', '.py', '.html', '.css', '.json', '.md', '.webmanifest']);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.name.startsWith('.DS_Store')) return [];
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

const files = filesUnder(ROOT).filter((file) => (
  path.basename(file) !== 'security-check.js'
  && (textExtensions.has(path.extname(file)) || file.endsWith('manifest.json'))
));
const keyPattern = /(?:AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,})/;
const absolutePathPattern = /(?:\/Users\/|\/Volumes\/|file:\/\/\/)/;

files.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!keyPattern.test(source), `Possible API key in ${path.relative(ROOT, file)}`);
  assert.ok(!absolutePathPattern.test(source), `Personal absolute path in ${path.relative(ROOT, file)}`);
});

const runtimeFiles = files.filter((file) => ['.js', '.mjs', '.cjs', '.html'].includes(path.extname(file)));
runtimeFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!/(?:speechSynthesis|chrome\.tts|\/api\/tts|\/usr\/bin\/say|generativelanguage\.googleapis\.com)/.test(source), `Runtime TTS fallback in ${path.relative(ROOT, file)}`);
});

const extensionManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
assert.ok(!extensionManifest.permissions.includes('tts'), 'Extension must not request TTS permission');
assert.ok(!/localhost|127\.0\.0\.1/.test(fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8')), 'Extension must not call localhost');

console.log('security ok');
