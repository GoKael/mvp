#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const listeners = {};
const opened = [];
const stored = { lexaCapturedPhrases: [] };
let menu;

global.chrome = {
  action: { onClicked: { addListener(callback) { listeners.action = callback; } } },
  runtime: {
    getURL(file) { return `chrome-extension://lexa/${file}`; },
    onInstalled: { addListener(callback) { listeners.installed = callback; } },
  },
  contextMenus: {
    removeAll(callback) { callback(); },
    create(options) { menu = options; },
    onClicked: { addListener(callback) { listeners.menu = callback; } },
  },
  tabs: { create(options) { opened.push(options.url); } },
  storage: {
    local: {
      get(defaults, callback) { callback({ ...defaults, ...stored }); },
      set(payload, callback = () => {}) { Object.assign(stored, payload); callback(); },
    },
  },
};

require(path.resolve(__dirname, '..', 'background.js'));

listeners.installed();
assert.strictEqual(menu.id, 'lexa-add-selection');
assert.deepStrictEqual(menu.contexts, ['selection']);

listeners.action();
assert.ok(opened.pop().endsWith('index.html#/today'));

listeners.menu(
  { menuItemId: 'lexa-add-selection', selectionText: '  xin chào  ' },
  { title: 'Vietnamese', url: 'https://example.test/video' },
);
assert.strictEqual(stored.lexaCapturedPhrases.length, 1);
assert.strictEqual(stored.lexaCapturedPhrases[0].text, 'xin chào');
assert.ok(opened.pop().endsWith('index.html#/words'));

listeners.menu(
  { menuItemId: 'lexa-add-selection', selectionText: 'xin chào' },
  { title: 'Vietnamese', url: 'https://example.test/video' },
);
assert.strictEqual(stored.lexaCapturedPhrases.length, 1, 'Duplicate captures should be replaced');

console.log('extension ok');
