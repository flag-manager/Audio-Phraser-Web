/**
 * Yamaha Audio Phraser - Metronome Engine
 * Plays Yamaha Metro1 (accent/downbeat) and Metro2 (upbeat/click) with precise Web Audio scheduling.
 */

export class MetronomeEngine {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.metro1Buffer = null; // Accent
    this.metro2Buffer = null; // Regular beat
    this.enabled = false;
    this.volume = 0.8; // 0.0 to 1.0
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.ctx.destination);
  }

  async loadSounds(basePath = 'assets/') {
    const candidates = [basePath, '', './', '/'];
    for (const prefix of candidates) {
      try {
        const [res1, res2] = await Promise.all([
          fetch(`${prefix}Metro1.wav`),
          fetch(`${prefix}Metro2.wav`)
        ]);
        if (res1.ok && res2.ok) {
          const [ab1, ab2] = await Promise.all([res1.arrayBuffer(), res2.arrayBuffer()]);
          this.metro1Buffer = await this.ctx.decodeAudioData(ab1);
          this.metro2Buffer = await this.ctx.decodeAudioData(ab2);
          return true;
        }
      } catch (e) {}
    }
    // Fallback synthesis if assets missing
    this.createSyntheticClicks();
    return true;
  }

  createSyntheticClicks() {
    const sr = this.ctx.sampleRate;
    // Downbeat accent (1600 Hz blip, 25ms)
    const len1 = Math.floor(sr * 0.03);
    const b1 = this.ctx.createBuffer(1, len1, sr);
    const d1 = b1.getChannelData(0);
    for (let i = 0; i < len1; i++) {
      const env = Math.exp(-i / (sr * 0.005));
      d1[i] = Math.sin((2 * Math.PI * 1600 * i) / sr) * env;
    }
    this.metro1Buffer = b1;

    // Upbeat tick (800 Hz blip, 20ms)
    const len2 = Math.floor(sr * 0.025);
    const b2 = this.ctx.createBuffer(1, len2, sr);
    const d2 = b2.getChannelData(0);
    for (let i = 0; i < len2; i++) {
      const env = Math.exp(-i / (sr * 0.004));
      d2[i] = Math.sin((2 * Math.PI * 800 * i) / sr) * env * 0.7;
    }
    this.metro2Buffer = b2;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
  }

  setEnabled(val) {
    this.enabled = !!val;
  }

  /**
   * Schedule click at exact audio time
   * @param {number} time - AudioContext time
   * @param {boolean} isDownbeat - True for bar 1 beat 1 accent
   */
  scheduleClick(time, isDownbeat = false) {
    if (!this.enabled) return;
    const buf = isDownbeat ? this.metro1Buffer : this.metro2Buffer;
    if (!buf) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gainNode);
    src.start(Math.max(0, time));
  }
}
