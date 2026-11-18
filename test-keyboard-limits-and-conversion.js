/**
 * Test Suite: Yamaha Keyboard Playability Limits & Audio Format Conversion
 * Tests conversion of MP3, 48kHz, 24-bit/32-bit float audio to 44.1kHz 16-bit stereo PCM,
 * and verifies export blocking when audio style size exceeds keyboard limits (e.g. PSR-S970 vs PSR-SX920).
 */

import fs from 'fs';
import { AudioConverter } from './js/audio/audio-converter.js';
import { KeyboardManager, YAMAHA_KEYBOARDS } from './js/model/keyboard-profiles.js';
import { AudioPhraserProject } from './js/model/project.js';
import { AusWriter } from './js/export/aus-writer.js';

console.log('Testing Audio Format Conversion and Yamaha Keyboard Playability Limits...\n');

// ============================================================================
// PART 1: Audio Format Conversion & Header Inspection
// ============================================================================
console.log('--- PART 1: Audio Converter Tests ---');

// 1.1 Test Header Inspection: 48kHz 24-bit PCM WAV
function createMockWavHeader(sampleRate, channels, bitsPerSample, audioFormat = 1) {
  const buf = new ArrayBuffer(44);
  const v = new DataView(buf);
  // RIFF
  v.setUint8(0, 0x52); v.setUint8(1, 0x49); v.setUint8(2, 0x46); v.setUint8(3, 0x46);
  v.setUint32(4, 36, true);
  // WAVE
  v.setUint8(8, 0x57); v.setUint8(9, 0x41); v.setUint8(10, 0x56); v.setUint8(11, 0x45);
  // fmt
  v.setUint8(12, 0x66); v.setUint8(13, 0x6d); v.setUint8(14, 0x74); v.setUint8(15, 0x20);
  v.setUint32(16, 16, true);
  v.setUint16(20, audioFormat, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  const blockAlign = channels * (bitsPerSample / 8);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  // data
  v.setUint8(36, 0x64); v.setUint8(37, 0x61); v.setUint8(38, 0x74); v.setUint8(39, 0x61);
  v.setUint32(40, 0, true);
  return buf;
}

const wav48k24 = createMockWavHeader(48000, 2, 24, 1);
const info48k24 = AudioConverter.inspectHeader(wav48k24);
if (info48k24.sampleRate !== 48000 || info48k24.bitDepth !== '24-bit') {
  throw new Error(`Failed to inspect 48kHz 24-bit WAV: ${JSON.stringify(info48k24)}`);
}
console.log('PASS: Inspect 48kHz 24-bit WAV header ->', info48k24.format, info48k24.sampleRate + 'Hz');

// 1.2 Test Header Inspection: 32-bit Float WAV
const wav32Float = createMockWavHeader(96000, 2, 32, 3);
const info32Float = AudioConverter.inspectHeader(wav32Float);
if (info32Float.sampleRate !== 96000 || !info32Float.format.includes('Float')) {
  throw new Error(`Failed to inspect 32-bit Float WAV: ${JSON.stringify(info32Float)}`);
}
console.log('PASS: Inspect 96kHz 32-bit Float WAV header ->', info32Float.format, info32Float.sampleRate + 'Hz');

// 1.3 Test Header Inspection: MP3 ID3 header
const mp3Buf = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).buffer;
const infoMp3 = AudioConverter.inspectHeader(mp3Buf);
if (infoMp3.format !== 'MP3') {
  throw new Error(`Failed to identify MP3 header: ${JSON.stringify(infoMp3)}`);
}
console.log('PASS: Inspect MP3 ID3 header ->', infoMp3.format);

// 1.4 Test 48kHz -> 44.1kHz Resampling
const durSec = 1.0;
const inSr = 48000;
const inSamples = inSr * durSec;
const mock48kBuf = {
  sampleRate: 48000,
  numberOfChannels: 1,
  length: inSamples,
  duration: durSec,
  getChannelData: (ch) => {
    const data = new Float32Array(inSamples);
    for (let i = 0; i < inSamples; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / inSr);
    }
    return data;
  }
};

const resampled = await AudioConverter.resampleBuffer(mock48kBuf, 44100);
if (resampled.sampleRate !== 44100) {
  throw new Error(`Resampled rate mismatch: expected 44100, got ${resampled.sampleRate}`);
}
if (Math.abs(resampled.duration - durSec) > 0.01) {
  throw new Error(`Resampled duration mismatch: expected ${durSec}, got ${resampled.duration}`);
}
if (Math.abs(resampled.length - 44100) > 1) {
  throw new Error(`Resampled length mismatch: expected 44100, got ${resampled.length}`);
}
console.log(`PASS: Resampled 48,000 Hz (${mock48kBuf.length} samples) -> 44,100 Hz (${resampled.length} samples)`);

// 1.5 Test Mono to Stereo Upmixing
const stereoBuf = AudioConverter.ensureStereo(resampled);
if (stereoBuf.numberOfChannels !== 2) {
  throw new Error(`Stereo upmixing failed: channels = ${stereoBuf.numberOfChannels}`);
}
const ch0 = stereoBuf.getChannelData(0);
const ch1 = stereoBuf.getChannelData(1);
if (ch0[100] !== ch1[100]) {
  throw new Error('Left and Right channels do not match after stereo upmixing');
}
console.log('PASS: Mono upmixing produced genuine 2-channel Stereo buffer with identical phase');

// 1.6 Test 16-bit PCM Quantization
const quantArray = new Float32Array([
  0.123456789,
  -0.87654321,
  1.5, // should clamp to 1.0
  -1.5, // should clamp to -1.0
  0.0,
  0.5,
  -0.5,
  0.00001,
  -0.00001,
  0.999999
]);

const testQuantBuf = {
  sampleRate: 44100,
  numberOfChannels: 1,
  length: 10,
  duration: 10 / 44100,
  getChannelData: (ch) => quantArray
};

AudioConverter.quantizeTo16Bit(testQuantBuf);
const qData = testQuantBuf.getChannelData(0);
// Verify clamping
if (qData[2] > 1.0 || qData[3] < -1.0) {
  throw new Error('16-bit quantization failed to clamp out-of-range samples [-1.0, 1.0]');
}
// Verify each value conforms to 16-bit discrete steps (integer / 32767 or 32768)
for (let i = 0; i < qData.length; i++) {
  const scaled = qData[i] < 0 ? qData[i] * 32768 : qData[i] * 32767;
  const isCloseToInt = Math.abs(scaled - Math.round(scaled)) < 0.0001;
  if (!isCloseToInt) {
    throw new Error(`Sample at index ${i} (${qData[i]}) is not a valid 16-bit PCM quantum step`);
  }
}
console.log('PASS: Strict 16-bit PCM quantization successfully quantized float32 samples\n');

// ============================================================================
// PART 2: Yamaha Keyboard Playability Limits & Verification (S970 vs SX920)
// ============================================================================
console.log('--- PART 2: Yamaha Keyboard Profile & Playability Validation ---');

const s970 = KeyboardManager.getProfile('psr_s970');
const sx920 = KeyboardManager.getProfile('psr_sx920');

if (!s970 || s970.maxStyleSizeBytes !== 18 * 1024 * 1024) {
  throw new Error('Yamaha PSR-S970 profile invalid: expected 18 MB limit');
}
if (!sx920 || sx920.maxStyleSizeBytes !== 64 * 1024 * 1024) {
  throw new Error('Yamaha PSR-SX920 profile invalid: expected 64 MB limit');
}
console.log(`PASS: Verified PSR-S970 limit = ${s970.maxStyleSizeBytes / (1024 * 1024)} MB (YEM Pack)`);
console.log(`PASS: Verified PSR-SX920 limit = ${sx920.maxStyleSizeBytes / (1024 * 1024)} MB (Direct USB)`);

// 2.1 Test Safe Style Size
const smallProject = new AudioPhraserProject('SmallStyle');
// 1 second of stereo 44.1kHz 16-bit = 176,400 bytes
const oneSecBuffer = {
  sampleRate: 44100,
  duration: 1.0,
  numberOfChannels: 2,
  length: 44100,
  getChannelData: () => new Float32Array(44100)
};
smallProject.assignAudioToSection('main_a', 'beat.wav', oneSecBuffer);

const smallValS970 = KeyboardManager.validateExport(smallProject, 'psr_s970');
if (!smallValS970.valid || smallValS970.isBlocked || smallValS970.isWarning) {
  throw new Error(`Small style should be valid on PSR-S970: ${JSON.stringify(smallValS970)}`);
}
console.log(`PASS: Small style (${smallValS970.estimatedMB.toFixed(2)} MB) is safe for PSR-S970`);

// 2.2 Test Style Exceeding PSR-S970 Limit (e.g. 21 MB) but Safe for PSR-SX920
// Let's create an audio assignment spanning 120 seconds of audio across sections
// 120s * 176,400 bytes/sec = ~21.16 MB
const largeSecBuffer = {
  sampleRate: 44100,
  duration: 30.0,
  numberOfChannels: 2,
  length: 44100 * 30,
  getChannelData: () => new Float32Array(44100 * 30)
};

const largeProject = new AudioPhraserProject('LargeStyle');
largeProject.assignAudioToSection('main_a', 'loop_a.wav', largeSecBuffer);
largeProject.assignAudioToSection('main_b', 'loop_b.wav', largeSecBuffer);
largeProject.assignAudioToSection('main_c', 'loop_c.wav', largeSecBuffer);
largeProject.assignAudioToSection('main_d', 'loop_d.wav', largeSecBuffer);

// Validate against PSR-S970 (limit 18 MB)
const largeValS970 = KeyboardManager.validateExport(largeProject, 'psr_s970');
if (largeValS970.valid || !largeValS970.isBlocked) {
  throw new Error(`21 MB style should be BLOCKED on PSR-S970! Result: ${JSON.stringify(largeValS970)}`);
}
console.log(`PASS: 21 MB style is BLOCKED for PSR-S970 (Size: ${largeValS970.estimatedMB.toFixed(1)} MB / Limit: 18 MB)`);
if (!largeValS970.reasons[0].includes('exceeds the 18 MB playability limit for Yamaha PSR-S970')) {
  throw new Error('Warning reason did not mention PSR-S970 limit');
}
if (!largeValS970.suggestions.some(s => s.includes('PSR-SX920'))) {
  throw new Error('Suggestions did not advise switching to PSR-SX920');
}
console.log('PASS: Correctly suggests switching to Yamaha PSR-SX920');

// Validate the SAME large style against PSR-SX920 (limit 64 MB)
const largeValSX920 = KeyboardManager.validateExport(largeProject, 'psr_sx920');
if (!largeValSX920.valid || largeValSX920.isBlocked) {
  throw new Error(`21 MB style should be ALLOWED on PSR-SX920! Result: ${JSON.stringify(largeValSX920)}`);
}
console.log(`PASS: 21 MB style is PLAYABLE for PSR-SX920 (Size: ${largeValSX920.estimatedMB.toFixed(1)} MB / Limit: 64 MB)\n`);

// ============================================================================
// PART 3: AusWriter Enforces Keyboard Limits & Blocks Export
// ============================================================================
console.log('--- PART 3: AusWriter Export Safety & Blocking Verification ---');

const emptyStyNodeBuf = fs.readFileSync('assets/Empty.sty');

// 3.1 Try exporting the large project with targetKeyboard = 'psr_s970'
largeProject.setTargetKeyboard('psr_s970');
let caughtError = null;
try {
  await AusWriter.exportToAus(largeProject, emptyStyNodeBuf, { targetKeyboard: 'psr_s970' });
} catch (err) {
  caughtError = err;
}

if (!caughtError) {
  throw new Error('AusWriter should have THROWN and BLOCKED export when size exceeds PSR-S970 limit!');
}
if (!caughtError.message.includes('Export Blocked') || !caughtError.message.includes('PSR-S970')) {
  throw new Error(`Unexpected error message: ${caughtError.message}`);
}
console.log(`PASS: AusWriter prevented export for PSR-S970 with error: "${caughtError.message.split('.')[0]}."`);

// 3.2 Now export with targetKeyboard = 'psr_sx920' (should succeed!)
largeProject.setTargetKeyboard('psr_sx920');
const sx920Blob = await AusWriter.exportToAus(largeProject, emptyStyNodeBuf, { targetKeyboard: 'psr_sx920' });
const sx920Bytes = await sx920Blob.arrayBuffer();

if (sx920Bytes.byteLength < 20 * 1024 * 1024) {
  throw new Error(`Expected >20 MB .aus file, got ${sx920Bytes.byteLength}`);
}
console.log(`PASS: AusWriter exported successfully for PSR-SX920! Output size: ${(sx920Bytes.byteLength / (1024 * 1024)).toFixed(2)} MB`);

console.log('\n============================================================');
console.log('ALL KEYBOARD PLAYABILITY LIMIT & CONVERSION TESTS PASSED 100%!');
console.log('============================================================');
