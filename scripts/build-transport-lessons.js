#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'content/transport-30.source.json');
const OUTPUT_DIR = path.join(ROOT, 'content/review');
const LESSONS_OUTPUT = path.join(OUTPUT_DIR, 'transport-lessons.json');
const JOBS_OUTPUT = path.join(OUTPUT_DIR, 'transport-audio-jobs.json');
const MANIFEST_OUTPUT = path.join(OUTPUT_DIR, 'transport-audio-manifest.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function main() {
  const source = readJson(SOURCE);
  const lexicon = readJson(path.join(ROOT, 'server/data/lexicon.json'));
  const wordsByRank = new Map(lexicon.map((word) => [word.rank, word]));

  const lessons = source.lessons.map((lesson) => ({
    id: lesson.id,
    category: source.category,
    title: lesson.title,
    durationSec: 30,
    status: source.status,
    segments: lesson.segments.map((segment) => ({
      id: segment.id,
      topic: segment.topic,
      zhTW: segment.zhTW,
      vi: segment.vi,
      wordIds: segment.wordRanks.map((rank) => {
        const word = wordsByRank.get(rank);
        if (!word) throw new Error(`Unknown Core rank ${rank}: ${lesson.id}/${segment.id}`);
        return word.id;
      }),
      focusWords: segment.focusWords,
      breakdown: segment.breakdown,
      audio: {
        zhTW: `assets/audio/candidates/transport/${lesson.id}-${segment.id}-zh.mp3`,
        vi: `assets/audio/candidates/transport/${lesson.id}-${segment.id}-vi.mp3`,
      },
    })),
  }));

  const audioJobs = lessons.flatMap((lesson) => lesson.segments.flatMap((segment) => [
    {
      kind: 'lesson',
      languageCode: 'cmn-TW',
      voice: 'Zephyr',
      text: segment.zhTW,
      output: segment.audio.zhTW,
    },
    {
      kind: 'lesson',
      languageCode: 'vi-VN',
      voice: 'Zephyr',
      text: segment.vi,
      output: segment.audio.vi,
    },
  ]));

  writeJson(LESSONS_OUTPUT, lessons);
  writeJson(JOBS_OUTPUT, audioJobs);
  writeJson(MANIFEST_OUTPUT, {
    model: 'gemini-2.5-pro-tts',
    status: 'reviewed',
    expected: audioJobs.length,
    assets: audioJobs.map((job) => ({
      ...job,
      generated: fs.existsSync(path.join(ROOT, job.output)),
    })),
  });

  console.log(`Built ${lessons.length} reviewed transport lessons and ${audioJobs.length} candidate audio jobs.`);
}

main();
