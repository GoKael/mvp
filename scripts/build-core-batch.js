#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.resolve(ROOT, process.argv[2] || 'content/core-101-150.source.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const start = source[0]?.rank;
const end = source.at(-1)?.rank;
const stem = `core-${start}-${end}`;
const wordsPath = path.join(ROOT, `server/data/${stem}.review.json`);
const jobsPath = path.join(ROOT, `server/data/${stem}-audio-jobs.json`);
const manifestPath = path.join(ROOT, `server/data/${stem}-audio-manifest.json`);

const slugify = (value) => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const words = source.map((word) => {
  const prefix = `${String(word.rank).padStart(3, '0')}-${slugify(word.vi)}`;
  return {
    id: `vi:${prefix}`,
    vi: word.vi,
    zhTW: word.zhTW,
    pos: word.pos,
    hanViet: '',
    rank: word.rank,
    audio: {
      vi: `assets/audio/words/${prefix}.mp3`,
      zhTW: `assets/audio/words/${prefix}-zh.mp3`,
    },
    examples: word.examples.map((example, index) => ({
      ...example,
      audio: {
        vi: `assets/audio/examples/${String(word.rank).padStart(3, '0')}-${index + 1}.mp3`,
        zhTW: `assets/audio/examples/${String(word.rank).padStart(3, '0')}-${index + 1}-zh.mp3`,
      },
    })),
    quality: word.quality,
  };
});

const jobs = words.flatMap((word) => [
  { kind: 'word', languageCode: 'vi-VN', voice: 'Zephyr', text: word.vi, output: word.audio.vi },
  { kind: 'word', languageCode: 'cmn-TW', voice: 'Zephyr', text: word.zhTW, output: word.audio.zhTW },
  ...word.examples.flatMap((example) => [
    { kind: 'example', languageCode: 'vi-VN', voice: 'Zephyr', text: example.vi, output: example.audio.vi },
    { kind: 'example', languageCode: 'cmn-TW', voice: 'Zephyr', text: example.zhTW, output: example.audio.zhTW },
  ]),
]);

fs.writeFileSync(wordsPath, `${JSON.stringify(words, null, 2)}\n`);
fs.writeFileSync(jobsPath, `${JSON.stringify(jobs, null, 2)}\n`);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  model: 'gemini-2.5-flash-preview-tts',
  bilingual: true,
  expected: jobs.length,
  assets: jobs.map((job) => ({ ...job, generated: fs.existsSync(path.join(ROOT, job.output)) })),
}, null, 2)}\n`);

console.log(`Built reviewed Core ${start}-${end} batch: ${words.length} words, ${jobs.length} audio jobs.`);
