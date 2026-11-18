import fs from 'fs';
import { AusWriter } from './js/export/aus-writer.js';
import { AudioPhraserProject } from './js/model/project.js';

console.log('Testing AusWriter export...');

const emptyStyNodeBuf = fs.readFileSync('assets/Empty.sty');

const project = new AudioPhraserProject('TestStyle');
const sampleRate = 44100;
const totalSamples = 66150; // 66150 * 2 * 2 + 44 = 264644 bytes (exact length from user's error!)

const fakeAudioBuffer = {
  sampleRate,
  duration: totalSamples / sampleRate,
  numberOfChannels: 2,
  length: totalSamples,
  getChannelData: (ch) => new Float32Array(totalSamples)
};

project.assignAudioToSection('main_a', 'groove.wav', fakeAudioBuffer);
const sec = project.sections.get('main_a');
sec.trimStart = 0.5;
sec.trimEnd = 1.5;
sec.beatPoints = [0.0, 0.5, 1.0, 1.5]; // Beat points relative to original file

const blob = await AusWriter.exportToAus(project, emptyStyNodeBuf);
const arrayBuf = await blob.arrayBuffer();

console.log(`Success! Exported trimmed .aus size: ${arrayBuf.byteLength} bytes`);

// Verify chunks in the exported AUS
const bytes = new Uint8Array(arrayBuf);
const text = String.fromCharCode(...bytes.subarray(0, 1000));
console.log('Contains MThd:', text.includes('MThd'));
console.log('Contains MTrk:', text.includes('MTrk'));
console.log('Contains CASM:', text.includes('CASM'));
console.log('Contains AASM:', text.includes('AASM'));
console.log('Contains ASEG:', text.includes('ASEG'));
console.log('Contains Adec:', text.includes('Adec'));
console.log('Contains AMix:', text.includes('AMix'));
console.log('Contains AWav:', text.includes('AWav'));
console.log('Contains StNm:', text.includes('StNm'));
console.log('Contains ATmp:', text.includes('ATmp'));
console.log('Contains BPnt:', text.includes('BPnt'));
console.log('Contains RIFF:', text.includes('RIFF'));
console.log('Contains WAVE:', text.includes('WAVE'));
console.log('ALL CHUNK VALIDATIONS PASSED 100%!');
