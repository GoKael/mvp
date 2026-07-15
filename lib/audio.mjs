export class AudioController {
  constructor(onChange = () => {}) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.onChange = onChange;
    this.playToken = 0;
  }

  setRate(rate) {
    const value = Number(rate);
    this.audio.playbackRate = Number.isFinite(value) ? value : 1;
  }

  stop() {
    this.playToken += 1;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.onChange({ playing: false, src: '' });
  }

  play(src) {
    return this.playSequence([src]);
  }

  async playSequence(sources) {
    const queue = sources.filter(Boolean);
    if (!queue.length) return false;
    this.stop();
    const token = this.playToken;

    for (const src of queue) {
      if (token !== this.playToken) return false;
      const ok = await this.playOne(src, token);
      if (!ok) {
        if (token === this.playToken) this.onChange({ playing: false, src: '', error: true });
        return false;
      }
    }
    if (token === this.playToken) this.onChange({ playing: false, src: '' });
    return true;
  }

  playOne(src, token) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        this.audio.onended = null;
        this.audio.onerror = null;
        resolve(ok);
      };
      this.audio.onended = () => finish(token === this.playToken);
      this.audio.onerror = () => finish(false);
      this.audio.src = src;
      this.audio.load();
      this.onChange({ playing: true, src, error: false });
      this.audio.play().catch(() => finish(false));
    });
  }
}
