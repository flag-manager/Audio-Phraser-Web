import { STYLE_SECTIONS, StyleSection } from './js/model/section.js';
import { AudioPhraserProject } from './js/model/project.js';
import { BeatDetector } from './js/analysis/beat-detector.js';
import { WavEncoder } from './js/export/wav-encoder.js';
import { ApprojIO } from './js/export/approj-io.js';

console.log('Testing Audio Style Slicer (Audio Phraser Web Version) core modules...');

// 1. Test section model
const prj = new AudioPhraserProject('TestStyle');
console.log(`Initialized project: ${prj.name}, Master Tempo: ${prj.masterTempo} BPM`);
console.log(`Total sections: ${prj.sections.size}`);

const mainA = prj.sections.get('main_a');
console.log(`Main A default bars: ${mainA.bars}, code: ${mainA.code}`);

// 2. Test synthetic audio buffer
const sampleRate = 44100;
const durationSec = 2.0;
const totalSamples = Math.floor(sampleRate * durationSec);
const fakeAudioBuffer = {
  sampleRate,
  duration: durationSec,
  numberOfChannels: 2,
  length: totalSamples,
  getChannelData: (ch) => {
    const data = new Float32Array(totalSamples);
    // Create periodic rhythmic bursts
    for (let i = 0; i < totalSamples; i++) {
      if (i % 22050 < 1000) {
        data[i] = Math.sin((i * 2 * Math.PI * 220) / sampleRate);
      }
    }
    return data;
  }
};

prj.assignAudioToSection('main_a', 'test_loop.wav', fakeAudioBuffer);
console.log(`Assigned audio to Main A: trimmedDuration = ${mainA.trimmedDuration}s`);

// 3. Test beat detector
const beatResult = BeatDetector.analyze(fakeAudioBuffer, {
  defaultTempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  bars: 1
});
console.log(`Beat detector detected BPM: ${beatResult.bpm}, Beat points: ${beatResult.beatPoints.length}`);

// 4. Test WAV encoder & Buffer Slicer
const sliced = WavEncoder.sliceBuffer(fakeAudioBuffer, 0.5, 1.5, true);
console.log(`Sliced buffer length: ${sliced.length} samples, duration: ${sliced.duration}s`);
if (sliced.length !== 44100) throw new Error('Buffer slicing length mismatch!');

// Test slicing with AudioContext mock returning genuine AudioBuffer object
const fakeAudioCtx = {
  createBuffer: (channels, length, sampleRate) => {
    const channelData = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (c) => channelData[c]
    };
  }
};
const audioBufSliced = WavEncoder.sliceBuffer(fakeAudioBuffer, 0.5, 1.5, true, fakeAudioCtx);
if (!audioBufSliced || audioBufSliced.length !== 44100 || audioBufSliced.numberOfChannels !== 2) {
  throw new Error('AudioContext sliceBuffer failed!');
}
console.log('AudioContext sliceBuffer returned valid AudioBuffer with length:', audioBufSliced.length);

const wavBytes = WavEncoder.encode(sliced, 44100, true);
console.log(`Encoded WAV bytes: ${wavBytes.byteLength} bytes`);

// Test Mono to Stereo Upmixing
const monoBuffer = {
  sampleRate: 44100,
  duration: 1.0,
  numberOfChannels: 1,
  length: 44100,
  getChannelData: () => new Float32Array(44100)
};
const stereoWav = WavEncoder.encode(monoBuffer, 44100, true);
const stereoView = new DataView(stereoWav);
const numChannelsWritten = stereoView.getUint16(22, true);
console.log(`Mono upmixed to stereo in WAV: numChannels = ${numChannelsWritten}`);
if (numChannelsWritten !== 2) throw new Error('Mono upmix failed!');

// 5. Test ApprojIO
const projectBlob = await ApprojIO.exportProject(prj, false);
console.log(`Exported .approj blob size: ${projectBlob.size} bytes`);

// 6. Test State Serialization & Recovery Simulation
const serialized = prj.serializeState();
const recoveredPrj = new AudioPhraserProject('Recovered');
recoveredPrj.addAudioToPool('test_loop.wav', fakeAudioBuffer);
recoveredPrj.restoreState(serialized);
const recoveredMainA = recoveredPrj.sections.get('main_a');
if (!recoveredMainA || !recoveredMainA.hasAudio || recoveredMainA.trimmedDuration !== 2.0) {
  throw new Error('Project state recovery validation failed!');
}
console.log(`State serialization and recovery validation passed: recovered Main A duration = ${recoveredMainA.trimmedDuration}s`);

// 7. Test Beat Grid Shifting Robustness
const originalBeats = [0.0, 0.5, 1.0, 1.5];
const shiftedOnce = BeatDetector.shiftBeatGrid(originalBeats, 2.0);
const shiftedTwice = BeatDetector.shiftBeatGrid(shiftedOnce, 2.0);
console.log(`Beat grid shifted once: ${shiftedOnce.join(', ')}`);
console.log(`Beat grid shifted twice: ${shiftedTwice.join(', ')}`);
if (shiftedTwice.length < 2) throw new Error('Beat grid shift collapsed points!');

console.log('ALL MODULE TESTS PASSED SUCCESSFULLY!');
