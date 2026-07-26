import assert from 'node:assert/strict';
import { createLexicon, lexemeKey, splitLatinWords, splitLexemes } from '../lib/lexeme.mjs';

const words = [
  { id: 'vi:dau-place', vi: 'đâu', zhTW: '哪裡' },
  { id: 'vi:dau-pain', vi: 'đau', zhTW: '痛' },
  { id: 'vi:sang', vi: 'sáng', zhTW: '早上' },
];
const lessons = [{ segments: [{ focusWords: [{ vi: 'buổi sáng', zhTW: '早上' }] }] }];
const lexicon = createLexicon(words, lessons);
const hits = splitLexemes('Đau ở đâu vào buổi sáng.', lexicon).filter((part) => part.entry);

assert.equal(lexemeKey('  Buổi  sáng '), 'buổi sáng');
assert.deepEqual(hits.map((part) => part.entry.id), ['vi:dau-pain', 'vi:dau-place', lexicon.byText.get('buổi sáng').id]);
assert.equal(hits[2].text, 'buổi sáng');
assert.equal(splitLexemes('không-có', lexicon).filter((part) => part.entry).length, 0);
assert.deepEqual(
  splitLatinWords('Đây là chìa khóa của căn nhà.').filter((part) => part.word).map((part) => part.text),
  ['Đây', 'là', 'chìa', 'khóa', 'của', 'căn', 'nhà'],
);

console.log('lexeme ok');
