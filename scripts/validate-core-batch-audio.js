#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = path.resolve(ROOT, process.argv[2] || 'server/data/core-101-150-audio-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.strictEqual(manifest.expected, 200, 'A 50-word Core batch must contain 200 audio jobs');

const missing = manifest.assets.filter((asset) => !fs.existsSync(path.join(ROOT, asset.output)));
assert.strictEqual(missing.length, 0, `Missing ${missing.length} batch audio files`);

function metric(output, label) {
  const match = output.match(new RegExp(`${label}:\\s*(-?[\\d.]+)`));
  return Number(match?.[1]);
}

const hashes = new Map();
const metrics = [];

manifest.assets.forEach((asset) => {
  const file = path.join(ROOT, asset.output);
  assert.ok(fs.statSync(file).size > 512, `Audio file is empty: ${asset.output}`);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', file,
  ], { encoding: 'utf8' });
  assert.strictEqual(probe.status, 0, `Audio cannot be decoded: ${asset.output}`);
  const info = JSON.parse(probe.stdout);
  const stream = info.streams?.[0];
  const duration = Number.parseFloat(info.format?.duration);
  assert.ok(Number.isFinite(duration), `Audio duration is invalid: ${asset.output}`);
  assert.strictEqual(stream?.codec_name, 'mp3', `Audio must be MP3: ${asset.output}`);
  assert.strictEqual(stream?.sample_rate, '24000', `Audio must use 24kHz: ${asset.output}`);
  assert.strictEqual(stream?.channels, 1, `Audio must be mono: ${asset.output}`);
  assert.ok(duration <= 9.5, `Audio exceeds 9.5 seconds: ${asset.output} (${duration})`);
  if (asset.kind === 'word') assert.ok(duration >= 0.18 && duration <= 2.5, `Word duration is suspicious: ${asset.output} (${duration})`);

  const scan = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'volumedetect,silencedetect=noise=-45dB:d=0.1',
    '-f', 'null', '-',
  ], { encoding: 'utf8' });
  assert.strictEqual(scan.status, 0, `Audio analysis failed: ${asset.output}`);
  const output = scan.stderr;
  const qualityScan = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  assert.strictEqual(qualityScan.status, 0, `Audio quality analysis failed: ${asset.output}`);
  const overall = qualityScan.stderr.slice(qualityScan.stderr.lastIndexOf('Overall'));
  const meanVolume = metric(output, 'mean_volume');
  const peakVolume = metric(output, 'max_volume');
  const flatFactor = metric(overall, 'Flat factor');
  const dcOffset = Math.abs(metric(overall, 'DC offset'));
  const invalidSamples = metric(overall, 'Number of NaNs') + metric(overall, 'Number of Infs');
  const silenceStarts = [...output.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const silenceEnds = [...output.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
    .map((match) => ({ end: Number(match[1]), duration: Number(match[2]) }));
  const silenceDuration = silenceEnds.reduce((sum, silence) => sum + silence.duration, 0);
  const leadingSilence = silenceStarts[0] <= 0.01 ? silenceEnds[0]?.duration || 0 : 0;
  const trailingSilence = silenceEnds.at(-1)?.end >= duration - 0.08 ? silenceEnds.at(-1).duration : 0;
  const silenceRatio = silenceDuration / duration;
  const audibleDuration = duration - silenceDuration;

  assert.ok(Number.isFinite(meanVolume) && meanVolume >= -30 && meanVolume <= -6, `Mean volume is suspicious: ${asset.output} (${meanVolume} dB)`);
  assert.ok(Number.isFinite(peakVolume) && peakVolume >= -10 && peakVolume <= 0.1, `Peak volume is suspicious: ${asset.output} (${peakVolume} dB)`);
  assert.ok(Number.isFinite(flatFactor) && flatFactor <= 0.01, `Audio may be clipped: ${asset.output} (flat factor ${flatFactor})`);
  assert.ok(Number.isFinite(dcOffset) && dcOffset <= 0.01, `Audio DC offset is suspicious: ${asset.output} (${dcOffset})`);
  assert.strictEqual(invalidSamples, 0, `Audio contains invalid samples: ${asset.output}`);
  assert.ok(leadingSilence <= 0.85, `Leading silence is too long: ${asset.output} (${leadingSilence}s)`);
  assert.ok(trailingSilence <= 0.45, `Trailing silence is too long: ${asset.output} (${trailingSilence}s)`);
  assert.ok(silenceRatio <= (asset.kind === 'word' ? 0.78 : 0.5), `Audio contains too much silence: ${asset.output} (${Math.round(silenceRatio * 100)}%)`);
  assert.ok(audibleDuration >= (asset.kind === 'word' ? 0.12 : 0.5), `Spoken content is too short: ${asset.output} (${audibleDuration}s)`);

  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const duplicate = hashes.get(hash);
  if (duplicate) assert.strictEqual(asset.text.normalize('NFC'), duplicate.text.normalize('NFC'), `Different texts share identical audio: ${duplicate.output} and ${asset.output}`);
  else hashes.set(hash, asset);
  metrics.push({ meanVolume, peakVolume, leadingSilence, trailingSilence, silenceRatio });
});

const range = (key) => {
  const values = metrics.map((item) => item[key]);
  return `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}`;
};

console.log(`core batch audio ok: 200/200 files; mean ${range('meanVolume')} dB; peak ${range('peakVolume')} dB; manual pronunciation QA still required`);
