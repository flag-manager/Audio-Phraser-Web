/**
 * Yamaha Audio Phraser - Audio Style (.aus / ASFF) Exporter
 * Combines Yamaha SFF2 base template (Empty.sty) with AASM, ASEG, AMix, and AWav chunks.
 * Accurately aligns sliced audio waveforms and beat point marker sample offsets.
 */

import { WavEncoder } from './wav-encoder.js';
import { KeyboardManager } from '../model/keyboard-profiles.js';

class BinaryWriter {
  constructor(initialCapacity = 65536) {
    this.buffer = new Uint8Array(initialCapacity);
    this.length = 0;
  }

  ensureCapacity(extraBytes) {
    if (this.length + extraBytes > this.buffer.length) {
      const newCap = Math.max(this.buffer.length * 2, this.length + extraBytes + 16384);
      const newBuf = new Uint8Array(newCap);
      newBuf.set(this.buffer.subarray(0, this.length));
      this.buffer = newBuf;
    }
  }

  writeUint8(val) {
    this.ensureCapacity(1);
    this.buffer[this.length++] = val & 0xFF;
  }

  writeUint16BE(val) {
    this.ensureCapacity(2);
    this.buffer[this.length++] = (val >> 8) & 0xFF;
    this.buffer[this.length++] = val & 0xFF;
  }

  writeUint16LE(val) {
    this.ensureCapacity(2);
    this.buffer[this.length++] = val & 0xFF;
    this.buffer[this.length++] = (val >> 8) & 0xFF;
  }

  writeUint32BE(val) {
    this.ensureCapacity(4);
    this.buffer[this.length++] = (val >>> 24) & 0xFF;
    this.buffer[this.length++] = (val >>> 16) & 0xFF;
    this.buffer[this.length++] = (val >>> 8) & 0xFF;
    this.buffer[this.length++] = val & 0xFF;
  }

  writeUint32LE(val) {
    this.ensureCapacity(4);
    this.buffer[this.length++] = val & 0xFF;
    this.buffer[this.length++] = (val >>> 8) & 0xFF;
    this.buffer[this.length++] = (val >>> 16) & 0xFF;
    this.buffer[this.length++] = (val >>> 24) & 0xFF;
  }

  writeFourCC(str) {
    this.ensureCapacity(4);
    for (let i = 0; i < 4; i++) {
      this.buffer[this.length++] = str.charCodeAt(i) & 0xFF;
    }
  }

  writeString(str, nullTerminate = false) {
    const len = str.length + (nullTerminate ? 1 : 0);
    this.ensureCapacity(len);
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.length++] = str.charCodeAt(i) & 0xFF;
    }
    if (nullTerminate) {
      this.buffer[this.length++] = 0;
    }
  }

  writeBytes(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.ensureCapacity(u8.length);
    this.buffer.set(u8, this.length);
    this.length += u8.length;
  }

  writeChunk(fourCC, payloadBytes) {
    this.writeFourCC(fourCC);
    const u8 = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
    this.writeUint32BE(u8.length);
    this.writeBytes(u8);
  }

  getBytes() {
    return this.buffer.subarray(0, this.length);
  }
}

export class AusWriter {
  /**
   * Export the project to a Yamaha Audio Style (.aus) binary file.
   * @param {AudioPhraserProject} project
   * @param {ArrayBuffer} emptyStyBuffer - Buffer of Empty.sty template
   * @param {object} options - Optional { targetKeyboard, force }
   */
  static async exportToAus(project, emptyStyBuffer, options = {}) {
    if (!emptyStyBuffer) {
      throw new Error('Template Empty.sty is required for Yamaha style export.');
    }

    // Target Keyboard Playability Check
    const targetKbId = options.targetKeyboard || project.targetKeyboard || 'psr_sx920';
    const validation = KeyboardManager.validateExport(project, targetKbId, emptyStyBuffer.byteLength || 13500);

    if (!validation.valid && !options.force) {
      throw new Error(
        `Export Blocked: Total Audio Style size (${validation.estimatedMB.toFixed(1)} MB) exceeds the ${validation.maxMB.toFixed(0)} MB playability limit for ${validation.keyboard.name}. ` +
        `Loading this file will fail on the ${validation.keyboard.name} with "Data not loaded properly" or cause memory allocation errors. ` +
        `Please trim loop lengths, reduce bars, or select a higher-capacity target keyboard (such as Yamaha PSR-SX920).`
      );
    }

    // Filter sections that have assigned audio
    const activeSections = [];
    for (const sec of project.sections.values()) {
      if (sec.hasAudio && sec.trimmedDuration > 0.05) {
        activeSections.push(sec);
      }
    }

    if (activeSections.length === 0) {
      throw new Error('No sections have audio assigned. Assign audio to at least one section before exporting.');
    }

    // Step 1: Prepare audio data and timing metadata for each active section
    const sectionAudioData = [];
    for (const sec of activeSections) {
      const startSec = sec.trimStart;
      const endSec = sec.trimEnd > 0 ? sec.trimEnd : sec.duration;
      const trimDuration = Math.max(0.01, endSec - startSec);

      // Slice the audio buffer to user's exact trim boundaries with anti-click fade
      const sliced = WavEncoder.sliceBuffer(sec.audioBuffer, startSec, endSec, sec.fadeIn);
      const trimmedWavBuffer = WavEncoder.encode(sliced, 44100, true);

      // Adjust beat markers relative to trimStart (so sample 0 is the start of the sliced WAV)
      const adjustedBeatPoints = [];
      const rawPoints = (sec.beatPoints && sec.beatPoints.length > 0)
        ? sec.beatPoints
        : this.generateBeatPoints(sec, project.masterTempo);

      for (const p of rawPoints) {
        if (p >= startSec - 0.002 && p <= endSec + 0.002) {
          adjustedBeatPoints.push(Math.max(0, p - startSec));
        }
      }

      // If no points fell strictly inside the window, generate a calibrated uniform grid
      if (adjustedBeatPoints.length === 0) {
        const beatsTotal = sec.bars * (sec.timeSignature?.numerator || 4);
        const secPerBeat = (60.0 / (sec.originalTempo || project.masterTempo)) * (4.0 / (sec.timeSignature?.denominator || 4));
        for (let b = 0; b <= beatsTotal; b++) {
          const t = b * secPerBeat;
          if (t <= trimDuration) adjustedBeatPoints.push(t);
        }
      }

      sectionAudioData.push({
        sec,
        wavBuffer: trimmedWavBuffer,
        sampleRate: 44100,
        bars: sec.bars,
        tempo: sec.originalTempo || project.masterTempo,
        beatPoints: adjustedBeatPoints
      });
    }

    // Step 2: Build the Yamaha AASM (Audio CASM) Chunk
    const aasmChunkBytes = this.buildAasmChunk(sectionAudioData, project);

    // Step 3: Build the Yamaha AWav Chunk containing waveforms & beat markers
    const awavChunkBytes = this.buildAWavChunk(sectionAudioData, project);

    // Step 4: Concatenate Empty.sty base + AASM chunk + AWav chunk
    let emptyStyBytes;
    if (emptyStyBuffer instanceof ArrayBuffer) {
      emptyStyBytes = new Uint8Array(emptyStyBuffer);
    } else if (ArrayBuffer.isView(emptyStyBuffer)) {
      emptyStyBytes = new Uint8Array(emptyStyBuffer.buffer, emptyStyBuffer.byteOffset, emptyStyBuffer.byteLength);
    } else {
      emptyStyBytes = new Uint8Array(emptyStyBuffer);
    }

    const mainWriter = new BinaryWriter(emptyStyBytes.length + aasmChunkBytes.length + awavChunkBytes.length);
    mainWriter.writeBytes(emptyStyBytes);
    mainWriter.writeBytes(aasmChunkBytes);
    mainWriter.writeBytes(awavChunkBytes);

    const finalBytes = mainWriter.getBytes();
    return new Blob([finalBytes], { type: 'application/octet-stream' });
  }

  /**
   * Build Yamaha AASM (Audio CASM) chunk
   */
  static buildAasmChunk(sectionAudioList, project) {
    // 1. Build Adec subchunk: comma-separated list of active section codes
    const adecWriter = new BinaryWriter();
    const secCodes = sectionAudioList.map(s => s.sec.code).join(',');
    adecWriter.writeString(secCodes, true); // null-terminated
    const adecBytes = adecWriter.getBytes();

    // 2. Build AMix subchunk: mixer parameters (16 bytes per section)
    const amixWriter = new BinaryWriter();
    for (const item of sectionAudioList) {
      amixWriter.writeUint8(item.sec.volume);                     // Volume (0-127)
      amixWriter.writeUint8(item.sec.pan);                        // Pan (0-127)
      amixWriter.writeUint8(item.sec.reverbSend);                 // Reverb send (0-127)
      amixWriter.writeUint8(0);                                   // Chorus
      amixWriter.writeUint16BE(Math.round(item.tempo * 10));      // Tempo * 10
      amixWriter.writeUint8(item.sec.bars);                       // Bars
      amixWriter.writeUint8(0);                                   // Reserved
      amixWriter.writeUint32BE(0);                                // Reserved
      amixWriter.writeUint32BE(0);                                // Reserved
    }
    const amixBytes = amixWriter.getBytes();

    // 3. Build ASEG chunk containing Adec and AMix
    const asegPayloadWriter = new BinaryWriter();
    asegPayloadWriter.writeChunk('Adec', adecBytes);
    asegPayloadWriter.writeChunk('AMix', amixBytes);

    const asegWriter = new BinaryWriter();
    asegWriter.writeChunk('ASEG', asegPayloadWriter.getBytes());

    // 4. Build AASM chunk containing ASEG
    const aasmWriter = new BinaryWriter();
    aasmWriter.writeChunk('AASM', asegWriter.getBytes());
    return aasmWriter.getBytes();
  }

  /**
   * Build Yamaha AWav / AInf chunk containing audio waveforms and beat point tables
   */
  static buildAWavChunk(sectionAudioList, project) {
    const awavPayloadWriter = new BinaryWriter();

    for (const item of sectionAudioList) {
      // 1. StNm: Section Name tag
      const stnmWriter = new BinaryWriter();
      stnmWriter.writeString(item.sec.code, false);
      awavPayloadWriter.writeChunk('StNm', stnmWriter.getBytes());

      // 2. ATmp: Audio Tempo (tempo * 100)
      const atmpWriter = new BinaryWriter();
      atmpWriter.writeUint32BE(Math.round(item.tempo * 100));
      awavPayloadWriter.writeChunk('ATmp', atmpWriter.getBytes());

      // 3. BPnt: Beat Points table (sample offsets at 44.1kHz starting from 0)
      const bpntWriter = new BinaryWriter();
      for (const t of item.beatPoints) {
        const sampleOffset = Math.max(0, Math.round(t * 44100));
        bpntWriter.writeUint32BE(sampleOffset);
      }
      awavPayloadWriter.writeChunk('BPnt', bpntWriter.getBytes());

      // 4. Raw WAV payload (already sliced to trim boundaries and upmixed to 16-bit stereo PCM)
      awavPayloadWriter.writeBytes(item.wavBuffer);
    }

    const awavChunkWriter = new BinaryWriter();
    awavChunkWriter.writeChunk('AWav', awavPayloadWriter.getBytes());
    return awavChunkWriter.getBytes();
  }

  static generateBeatPoints(sec, fallbackTempo = 120) {
    const points = [];
    const tempo = sec.originalTempo || fallbackTempo;
    const beatsTotal = sec.bars * (sec.timeSignature?.numerator || 4);
    const secPerBeat = (60.0 / tempo) * (4.0 / (sec.timeSignature?.denominator || 4));
    for (let b = 0; b <= beatsTotal; b++) {
      points.push(b * secPerBeat);
    }
    return points;
  }
}
