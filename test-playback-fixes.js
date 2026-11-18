global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.window = { devicePixelRatio: 1 };

import { AudioEngine } from './js/audio/audio-engine.js';
import { WsolaTimeStretcher } from './js/audio/wsola-stretcher.js';
import { WavEncoder } from './js/export/wav-encoder.js';
import { StyleSection, STYLE_SECTIONS } from './js/model/section.js';
import { AudioPhraserProject } from './js/model/project.js';

class MockAudioBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._data = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(c) {
    return this._data[c];
  }
  copyToChannel(source, channelNumber) {
    this._data[channelNumber].set(source);
  }
}

global.AudioBuffer = MockAudioBuffer;

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
  }
  createBuffer(channels, len, sr) {
    return new MockAudioBuffer(channels, len, sr);
  }
  createGain() {
    return {
      gain: { value: 1.0, setValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {}
    };
  }
  createAnalyser() {
    return { fftSize: 256, connect: () => {} };
  }
  createBufferSource() {
    let _buffer = null;
    const src = {
      get buffer() { return _buffer; },
      set buffer(val) {
        if (val !== null && !(val instanceof MockAudioBuffer)) {
          throw new TypeError("Failed to set 'buffer' on 'AudioBufferSourceNode': The provided value is not of type 'AudioBuffer'.");
        }
        _buffer = val;
      },
      loop: false,
      onended: null,
      connect: () => {},
      disconnect: () => {},
      start: (when, offset) => {
        src._started = true;
        src._offset = offset;
        if (offset && src.buffer && offset >= src.buffer.duration) {
          throw new RangeError(`Offset ${offset} is outside buffer duration ${src.buffer.duration}`);
        }
      },
      stop: () => {
        src._stopped = true;
        if (src.onended) {
          setTimeout(() => {
            if (src.onended) src.onended();
          }, 0);
        }
      }
    };
    return src;
  }
  createStereoPanner() {
    return {
      pan: { value: 0, setValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {}
    };
  }
  resume() { return Promise.resolve(); }
}

async function runTests() {
  console.log('Testing playback fixes...');
  const ctx = new MockAudioContext();
  const engine = new AudioEngine();
  engine.ctx = ctx;
  engine.masterGain = ctx.createGain();
  engine.analyser = ctx.createAnalyser();

  const prj = new AudioPhraserProject('TestFixes');
  const sec = prj.sections.get('main_a');

  // Create a 2-second audio (1 bar at 120bpm in 4/4)
  const sr = 44100;
  const dur = 2.0;
  const len = Math.floor(sr * dur);
  const testBuffer = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = testBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = Math.sin(2 * Math.PI * 440 * i / sr);
  }

  prj.assignAudioToSection('main_a', 'one_bar_120bpm.wav', testBuffer);

  // 1. Test sliceBuffer returns genuine AudioBuffer
  const sliced = engine.sliceBuffer(sec.audioBuffer, 0, 2.0);
  if (!(sliced instanceof MockAudioBuffer)) {
    throw new Error('engine.sliceBuffer did not return a genuine AudioBuffer!');
  }
  console.log('PASS: engine.sliceBuffer returns genuine AudioBuffer');

  // 2. Main A initially defaults to 4 bars.
  // When played at 120 BPM with 4 bars, secExpectedDuration = 8.0s, ratio = 4.0.
  console.log('\n--- Test 2: Playback with 4 bars (ratio = 4.0) ---');
  await engine.playSection(sec, 120, true, 0);
  console.log(`isPlaying=${engine.isPlaying}, currentLoopDuration=${engine.currentLoopDuration}`);
  if (Math.abs(engine.currentLoopDuration - 8.0) > 0.05) {
    throw new Error(`Expected loop duration ~8.0s, got ${engine.currentLoopDuration}`);
  }
  console.log('PASS: 4-bar stretched playback started');

  // 3. User reduces Section Bars to 1 bar! (Matching the 2.0s audio!)
  // Now secExpectedDuration = 2.0s, ratio = 2.0 / 2.0 = 1.000!
  // THIS WAS THE EXACT POINT WHERE THE BUG CAUSED A FATAL TYPEERROR!
  console.log('\n--- Test 3: Reduce bars to 1 bar at 120 BPM (ratio = 1.000) ---');
  sec.bars = 1;
  ctx.currentTime = 0.5;
  await engine.updateLiveSettings(sec, 120);
  console.log(`isPlaying=${engine.isPlaying}, currentLoopDuration=${engine.currentLoopDuration}`);
  if (Math.abs(engine.currentLoopDuration - 2.0) > 0.05) {
    throw new Error(`Expected loop duration ~2.0s after reducing bars, got ${engine.currentLoopDuration}`);
  }
  console.log('PASS: Successfully reduced section bars to 1 bar with ratio = 1.0 (no TypeError)!');

  // 4. User stops and clicks Play Loop again at 1 bar 120 BPM
  console.log('\n--- Test 4: Stop and re-play with ratio = 1.0 ---');
  engine.stop();
  await engine.playSection(sec, 120, true, 0);
  if (!engine.isPlaying || Math.abs(engine.currentLoopDuration - 2.0) > 0.05) {
    throw new Error(`Replay failed! isPlaying=${engine.isPlaying}, duration=${engine.currentLoopDuration}`);
  }
  console.log('PASS: Play Loop at ratio = 1.0 played cleanly!');

  // 5. User changes tempo to 140 BPM with 1 bar (secExpectedDuration = 1.714s)
  console.log('\n--- Test 5: Change tempo to 140 BPM with 1 bar ---');
  ctx.currentTime = 1.0;
  await engine.updateLiveSettings(sec, 140);
  console.log(`isPlaying=${engine.isPlaying}, currentLoopDuration=${engine.currentLoopDuration}`);
  const expected140 = 1 * 4 * (60 / 140);
  if (Math.abs(engine.currentLoopDuration - expected140) > 0.05) {
    throw new Error(`Expected loop duration ~${expected140}s at 140 BPM, got ${engine.currentLoopDuration}`);
  }
  console.log('PASS: Live tempo change to 140 BPM with 1 bar succeeded!');

  // 6. Test metronome scheduler loop wrap without infinite loop
  console.log('\n--- Test 6: Metronome scheduler loop wrap ---');
  engine.metronome = {
    enabled: true,
    scheduleClick: (time, isDownbeat) => {
      // console.log(`[metronome click] t=${time.toFixed(3)} downbeat=${isDownbeat}`);
    }
  };
  engine.startMetronomeScheduler(sec, 140, 0);

  // Fast forward context time past 3 complete loops (each loop ~1.714s)
  for (let step = 0; step < 20; step++) {
    ctx.currentTime += 0.5; // Advance 500ms
    // Let timer tick
    await new Promise(r => setTimeout(r, 30));
  }
  engine.stopMetronomeScheduler();
  console.log('PASS: Metronome scheduler crossed multiple loop boundaries without freezing!');

  // 7. Test cache key invalidation when bars change
  console.log('\n--- Test 7: Cache key includes bars ---');
  const key1 = engine.getStretchCacheKey(sec, 0, 2.0, 140);
  sec.bars = 2;
  const key2 = engine.getStretchCacheKey(sec, 0, 2.0, 140);
  if (key1 === key2) {
    throw new Error('Cache key did not change when bars changed!');
  }
  console.log(`PASS: Cache key 1 (bars=1) != Cache key 2 (bars=2)`);

  console.log('\nALL PLAYBACK FIXES VERIFIED AND PASSING 100%!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
