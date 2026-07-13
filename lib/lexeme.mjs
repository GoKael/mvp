function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lexemeKey(value) {
  return String(value || '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim();
}

export function createLexicon(words, lessons) {
  const byId = new Map();
  const byText = new Map();

  words.forEach((word) => {
    const entry = { ...word, source: 'core' };
    byId.set(entry.id, entry);
    byText.set(lexemeKey(entry.vi), entry);
  });

  lessons.flatMap((lesson) => lesson.segments).forEach((segment) => {
    segment.focusWords.forEach((word) => {
      const key = lexemeKey(word.vi);
      if (!key || byText.has(key)) return;
      const entry = {
        id: `focus:${encodeURIComponent(key)}`,
        vi: word.vi,
        zhTW: word.zhTW,
        pos: '課程詞組',
        audio: '',
        source: 'focus',
      };
      byId.set(entry.id, entry);
      byText.set(key, entry);
    });
  });

  const alternatives = [...byText.values()]
    .map((entry) => entry.vi.trim().split(/\s+/).map(escapeRegExp).join('\\s+'))
    .sort((left, right) => right.length - left.length);
  const matcher = alternatives.length
    ? new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}])(${alternatives.join('|')})(?=$|[^\\p{L}\\p{M}\\p{N}])`, 'giu')
    : null;

  return { byId, byText, matcher };
}

export function splitLexemes(value, lexicon) {
  const text = String(value || '').normalize('NFC');
  if (!lexicon.matcher) return [{ text, entry: null }];

  const parts = [];
  let cursor = 0;
  lexicon.matcher.lastIndex = 0;
  for (const match of text.matchAll(lexicon.matcher)) {
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), entry: null });
    if (match[1]) parts.push({ text: match[1], entry: null });
    parts.push({ text: match[2], entry: lexicon.byText.get(lexemeKey(match[2])) || null });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), entry: null });
  return parts.length ? parts : [{ text, entry: null }];
}

export function splitLatinWords(value) {
  const text = String(value || '').normalize('NFC');
  const matcher = /[\p{Script=Latin}\p{M}]+(?:['’-][\p{Script=Latin}\p{M}]+)*/gu;
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(matcher)) {
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), word: false });
    parts.push({ text: match[0], word: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), word: false });
  return parts.length ? parts : [{ text, word: false }];
}
