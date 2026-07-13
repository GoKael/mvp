#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'studio', 'food-shorts');
const FONT_SOURCE = path.join(OUT, 'font-source');
const lessons = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/data/lessons.json'), 'utf8'));

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, words, key) {
  const phrases = words.map((word) => word[key]).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!phrases.length) return escapeHtml(text);
  const matcher = new RegExp(`(${phrases.map(escapeRegExp).join('|')})`, 'giu');
  const exact = new Set(phrases.map((phrase) => phrase.toLocaleLowerCase()));
  return String(text).split(matcher).map((part) => (
    exact.has(part.toLocaleLowerCase()) ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)
  )).join('');
}

function duration(file) {
  if (!fs.existsSync(file)) return 0;
  const result = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ], { encoding: 'utf8' });
  return Number.parseFloat(result.stdout) || 0;
}

function relativeAudio(compositionDir, source) {
  const sourceFile = path.join(ROOT, source);
  const targetDir = path.join(compositionDir, 'assets');
  const targetFile = path.join(targetDir, path.basename(source));
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
  return `assets/${path.basename(source)}`;
}

function flag(kind) {
  if (kind === 'zh') {
    return '<span class="flag taiwan" aria-label="台灣華語"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  }
  return '<span class="flag vietnam" aria-label="越南語"><i>★</i></span>';
}

function sceneMarkup(segment, index) {
  const start = index * 10;
  return `<section id="scene-${index + 1}" class="clip scene" data-start="${start}" data-duration="9.98" data-track-index="1">
    <div class="scene-card">
      <div class="topic-slot">
        <div class="topic-glow"></div>
        <h1>${escapeHtml(segment.topic.vi)}</h1>
        <p>${escapeHtml(segment.topic.zhTW)}</p>
      </div>
      <div class="sentence-stack">
        <article class="sentence-box zh">${flag('zh')}<p>${highlight(segment.zhTW, segment.focusWords, 'zhTW')}</p></article>
        <article class="sentence-box vi">${flag('vi')}<p>${highlight(segment.vi, segment.focusWords, 'vi')}</p></article>
      </div>
      <div class="focus-slot">
        <p>單字對照</p>
        <div>${segment.focusWords.map((word) => `<span><b>${escapeHtml(word.vi)}</b><small>${escapeHtml(word.zhTW)}</small></span>`).join('')}</div>
      </div>
    </div>
  </section>`;
}

function audioMarkup(lesson, compositionDir) {
  return lesson.segments.flatMap((segment, index) => {
    const sceneStart = index * 10;
    const zhFile = path.join(ROOT, segment.audio.zhTW);
    const viFile = path.join(ROOT, segment.audio.vi);
    const zhDuration = duration(zhFile);
    const viDuration = duration(viFile);
    if (!zhDuration || !viDuration) {
      throw new Error(`Missing lesson audio for ${lesson.id}/${segment.id}`);
    }
    if (zhDuration + viDuration + 0.25 > 9.5) {
      throw new Error(`Bilingual audio exceeds its 10-second scene: ${lesson.id}/${segment.id}`);
    }
    const zhStart = sceneStart + 0.4;
    const viStart = zhStart + zhDuration + 0.25;
    return [
      `<audio id="audio-${index + 1}-zh" src="${relativeAudio(compositionDir, segment.audio.zhTW)}" data-start="${zhStart.toFixed(2)}" data-duration="${zhDuration.toFixed(2)}" data-track-index="10"></audio>`,
      `<audio id="audio-${index + 1}-vi" src="${relativeAudio(compositionDir, segment.audio.vi)}" data-start="${viStart.toFixed(2)}" data-duration="${viDuration.toFixed(2)}" data-track-index="11"></audio>`,
    ];
  }).join('\n  ');
}

function composition(lesson, compositionDir) {
  const id = lesson.id;
  const scenes = lesson.segments.map(sceneMarkup).join('\n  ');
  const audios = audioMarkup(lesson, compositionDir);
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>Lexa ${escapeHtml(lesson.title.zhTW)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #090604; }
    @font-face { font-family: "Lexa CJK"; src: url("assets/fonts/noto-sans-tc-chinese-traditional-400-normal.woff2") format("woff2"); font-weight: 400; }
    @font-face { font-family: "Lexa CJK"; src: url("assets/fonts/noto-sans-tc-chinese-traditional-700-normal.woff2") format("woff2"); font-weight: 700 900; }
    @font-face { font-family: "Lexa Vietnamese"; src: url("assets/fonts/noto-sans-tc-vietnamese-400-normal.woff2") format("woff2"); font-weight: 400; }
    @font-face { font-family: "Lexa Vietnamese"; src: url("assets/fonts/noto-sans-tc-vietnamese-700-normal.woff2") format("woff2"); font-weight: 700 900; }
    @font-face { font-family: "Lexa Latin"; src: url("assets/fonts/noto-sans-tc-latin-400-normal.woff2") format("woff2"); font-weight: 400; }
    @font-face { font-family: "Lexa Latin"; src: url("assets/fonts/noto-sans-tc-latin-700-normal.woff2") format("woff2"); font-weight: 700 900; }
    body { font-family: "Lexa Vietnamese", "Lexa Latin", "Lexa CJK", sans-serif; color: #fff9ef; }
    #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
    .background { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(circle at 50% 26%, rgba(240,175,57,.19), transparent 25%), linear-gradient(150deg, #21130d, #0c0806 74%); }
    .background::before { position: absolute; inset: 0; content: ""; opacity: .28; background-image: linear-gradient(rgba(255,203,91,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,203,91,.07) 1px, transparent 1px); background-size: 72px 72px; mask-image: linear-gradient(to bottom, black, transparent 85%); }
    .brand { position: absolute; top: 74px; left: 84px; display: flex; align-items: center; gap: 15px; color: #f4c967; font-size: 24px; font-weight: 900; letter-spacing: .18em; }
    .brand::before { display: grid; width: 48px; height: 48px; place-items: center; content: "L"; border: 1px solid rgba(244,201,103,.5); border-radius: 50%; font-family: "Lexa Latin", sans-serif; font-size: 25px; font-weight: 700; letter-spacing: 0; }
    .progress { position: absolute; right: 84px; bottom: 79px; left: 84px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .progress i { height: 4px; border-radius: 99px; background: rgba(255,255,255,.15); }
    .scene { position: absolute; inset: 0; }
    .scene-card { position: absolute; top: 220px; left: 105px; width: 870px; height: 1460px; padding: 62px 58px 55px; border: 1px solid rgba(245,189,74,.19); border-radius: 46px 18px 46px 18px; background: linear-gradient(155deg, rgba(40,25,17,.96), rgba(19,13,10,.96)); box-shadow: 0 48px 110px rgba(0,0,0,.48); }
    .topic-slot { position: relative; display: grid; height: 245px; place-items: center; align-content: center; border-bottom: 1px solid rgba(245,189,74,.16); text-align: center; }
    .topic-slot h1 { position: relative; z-index: 1; max-width: 720px; margin: 0; color: #ffd36f; font-size: 76px; font-weight: 700; line-height: 1.04; text-shadow: 0 0 24px rgba(255,183,3,.38); }
    .topic-slot p { position: relative; z-index: 1; margin: 12px 0 0; color: #d9c9b8; font-size: 25px; font-weight: 700; letter-spacing: .08em; }
    .topic-glow { position: absolute; top: 50%; left: 50%; width: 520px; height: 150px; margin: -75px 0 0 -260px; border-radius: 50%; background: radial-gradient(circle, rgba(255,183,3,.25), transparent 70%); filter: blur(16px); }
    .sentence-stack { display: grid; gap: 54px; padding-top: 74px; }
    .sentence-box { display: grid; grid-template-columns: 34px 1fr; gap: 18px; align-items: center; min-height: 230px; padding: 30px 32px; border: 1px solid rgba(255,202,96,.16); border-radius: 27px 10px 27px 10px; }
    .sentence-box.zh { background: linear-gradient(135deg, rgba(255,190,70,.16), rgba(255,255,255,.035)); }
    .sentence-box.vi { background: linear-gradient(135deg, rgba(195,96,47,.19), rgba(255,255,255,.035)); }
    .sentence-box p { margin: 0; font-size: 41px; font-weight: 800; line-height: 1.4; text-wrap: balance; }
    mark { padding: 0 .08em; border-radius: .18em; background: rgba(255,183,3,.14); color: #ffd36f; box-shadow: 0 0 18px rgba(255,183,3,.13); text-shadow: 0 0 14px rgba(255,183,3,.42); }
    .flag { position: relative; display: block; width: 30px; height: 21px; overflow: hidden; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
    .vietnam { display: grid; place-items: center; background: #da251d; color: #ffed00; font-size: 13px; }
    .vietnam i { font-style: normal; }
    .taiwan { background: #fe0000; }
    .taiwan i:first-child { position: absolute; top: 0; left: 0; width: 15px; height: 11px; background: #000095; }
    .taiwan i:nth-child(2) { position: absolute; top: 2px; left: 4px; width: 7px; height: 7px; border-radius: 50%; background: #fff; }
    .focus-slot { position: absolute; right: 58px; bottom: 55px; left: 58px; min-height: 315px; padding: 30px 34px; border: 1px solid rgba(255,211,111,.18); border-radius: 24px 9px 24px 9px; background: rgba(9,6,4,.44); }
    .focus-slot > p { margin: 0 0 20px; color: #9f8f7e; font-size: 15px; font-weight: 900; letter-spacing: .18em; }
    .focus-slot > div { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .focus-slot span { display: grid; min-height: 170px; place-items: center; align-content: center; gap: 12px; padding: 16px 10px; border-radius: 17px; background: rgba(255,211,111,.075); text-align: center; }
    .focus-slot b { color: #ffd36f; font-size: 27px; line-height: 1.22; text-shadow: 0 0 14px rgba(255,183,3,.3); }
    .focus-slot small { color: #e7d8c7; font-size: 20px; font-weight: 700; }
  </style>
</head>
<body>
<main id="root" data-composition-id="${id}" data-start="0" data-width="1080" data-height="1920" data-duration="30" data-fps="30">
  <div id="background" class="clip background" data-start="0" data-duration="30" data-track-index="0"><div class="brand">LEXA</div><div class="progress"><i></i><i></i><i></i></div></div>
  ${scenes}
  ${audios}
</main>
<script>
  window.__timelines = window.__timelines || {};
  const timeline = gsap.timeline({ paused: true });
  [0, 1, 2].forEach((index) => {
    const start = index * 10;
    const scene = '#scene-' + (index + 1);
    timeline.fromTo(scene + ' .scene-card', { opacity: 0.42, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.12, ease: 'power2.out' }, start + 0.02);
    timeline.fromTo(scene + ' .topic-glow', { opacity: 0.45 }, { opacity: 1, duration: 1.15, repeat: 5, yoyo: true, ease: 'sine.inOut' }, start + 0.15);
    timeline.fromTo(scene + ' .topic-slot h1', { scale: 1 }, { scale: 1.018, duration: 1.15, repeat: 5, yoyo: true, ease: 'sine.inOut' }, start + 0.15);
  });
  timeline.fromTo('.progress i:nth-child(1)', { backgroundColor: 'rgba(255,255,255,.15)' }, { backgroundColor: '#ffd36f', duration: 0.12 }, 0.02);
  timeline.fromTo('.progress i:nth-child(2)', { backgroundColor: 'rgba(255,255,255,.15)' }, { backgroundColor: '#ffd36f', duration: 0.12 }, 10.02);
  timeline.fromTo('.progress i:nth-child(3)', { backgroundColor: 'rgba(255,255,255,.15)' }, { backgroundColor: '#ffd36f', duration: 0.12 }, 20.02);
  window.__timelines['${id}'] = timeline;
</script>
</body>
</html>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
lessons.forEach((lesson) => {
  const compositionDir = path.join(OUT, lesson.id);
  fs.mkdirSync(compositionDir, { recursive: true });
  fs.cpSync(FONT_SOURCE, path.join(compositionDir, 'assets', 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(compositionDir, 'index.html'), composition(lesson, compositionDir));
});

fs.writeFileSync(path.join(OUT, 'compositions.json'), JSON.stringify(
  lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, path: `${lesson.id}/index.html` })),
  null,
  2,
) + '\n');

console.log(`Built ${lessons.length} HyperFrames compositions in studio/food-shorts.`);
