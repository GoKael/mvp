#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.resolve(ROOT, process.argv[2] || 'content/transport-30.source.json');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function main() {
  const source = readJson(sourcePath);
  if (!/^[a-z][a-z0-9-]+$/.test(source.id)) throw new Error(`Invalid pack id: ${source.id}`);
  const outputDir = path.join(ROOT, 'content/review');
  const lessonsOutput = path.join(outputDir, `${source.id}-lessons.json`);
  const jobsOutput = path.join(outputDir, `${source.id}-audio-jobs.json`);
  const manifestOutput = path.join(outputDir, `${source.id}-audio-manifest.json`);
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
        zhTW: `assets/audio/candidates/${source.id}/${lesson.id}-${segment.id}-zh.mp3`,
        vi: `assets/audio/candidates/${source.id}/${lesson.id}-${segment.id}-vi.mp3`,
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

  writeJson(lessonsOutput, lessons);
  writeJson(jobsOutput, audioJobs);
  writeJson(manifestOutput, {
    model: 'gemini-2.5-pro-tts',
    status: 'reviewed',
    expected: audioJobs.length,
    assets: audioJobs.map((job) => ({
      ...job,
      generated: fs.existsSync(path.join(ROOT, job.output)),
    })),
  });

  console.log(`Built ${lessons.length} reviewed ${source.id} lessons and ${audioJobs.length} candidate audio jobs.`);
}

main();
