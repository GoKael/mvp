import assert from 'node:assert/strict';

class FakeAudio {
  preload = '';
  playsInline = false;
  playbackRate = 1;
  currentTime = 0;
  src = '';
  error = null;
  shouldReject = false;
  played = [];

  pause() {}

  play() {
    this.played.push(this.src);
    if (this.shouldReject) {
      const error = new Error('blocked');
      error.name = 'NotAllowedError';
      return Promise.reject(error);
    }
    queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
}

globalThis.Audio = FakeAudio;
const { AudioController } = await import('../lib/audio.mjs');
const controller = new AudioController();

assert.equal(await controller.play('word.mp3'), true);
assert.equal(controller.audio.src, 'word.mp3');
assert.equal(controller.audio.playsInline, true);

controller.audio.shouldReject = true;
assert.equal(await controller.play('blocked.mp3'), false);
assert.match(controller.lastError, /^NotAllowedError: blocked$/);

const sequenceController = new AudioController();
assert.equal(await sequenceController.playSequence(['zh.mp3', 'vi.mp3']), true);
assert.deepEqual(sequenceController.audio.played, ['zh.mp3', 'vi.mp3']);

console.log('audio ok');
