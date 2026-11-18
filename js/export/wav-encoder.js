/**
 * Yamaha Audio Phraser - PCM WAV Encoder & Buffer Utilities
 * Encodes audio buffers into standard 44.1kHz 16-bit PCM WAV binary data
 * with support for stereo upmixing, resampling, and sample-accurate slicing.
 */

export class WavEncoder {
  /**
   * Slice an AudioBuffer to exact time boundaries with optional anti-click cosine fade.
   * @param {AudioBuffer|object} buffer
   * @param {number} startSec
   * @param {number} endSec
   * @param {boolean} applyFade
   * @returns {object} Sliced buffer-like object { numberOfChannels, sampleRate, length, duration, getChannelData }
   */
  static sliceBuffer(buffer, startSec, endSec, applyFade = false) {
    const sr = buffer.sampleRate;
    const dur = buffer.duration;
    const clampedStart = Math.max(0, Math.min(dur, startSec));
    const clampedEnd = Math.max(clampedStart + 0.001, Math.min(dur, endSec > 0 ? endSec : dur));

    const startSample = Math.floor(clampedStart * sr);
    const endSample = Math.min(buffer.length, Math.floor(clampedEnd * sr));
    const numSamples = Math.max(1, endSample - startSample);
    const numChannels = buffer.numberOfChannels;

    const channelsData = [];
    // 5ms anti-click cosine fade
    const fadeSamples = applyFade ? Math.min(Math.floor(numSamples / 4), Math.floor(sr * 0.005)) : 0;

    for (let c = 0; c < numChannels; c++) {
      const src = buffer.getChannelData(c);
      const dst = new Float32Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        let gain = 1.0;
        if (fadeSamples > 0) {
          if (i < fadeSamples) {
            gain = 0.5 * (1.0 - Math.cos((Math.PI * i) / fadeSamples));
          } else if (i >= numSamples - fadeSamples) {
            const fi = numSamples - 1 - i;
            gain = 0.5 * (1.0 - Math.cos((Math.PI * fi) / fadeSamples));
          }
        }
        const s = src[startSample + i];
        dst[i] = Number.isFinite(s) ? s * gain : 0;
      }
      channelsData.push(dst);
    }

    return {
      sampleRate: sr,
      numberOfChannels: numChannels,
      length: numSamples,
      duration: numSamples / sr,
      getChannelData: (c) => channelsData[c]
    };
  }

  /**
   * Encode an AudioBuffer or Float32Array channel data into a standard 16-bit PCM WAV ArrayBuffer.
   * @param {AudioBuffer|object} audioBuffer
   * @param {number} targetSampleRate - Typically 44100 Hz for Yamaha keyboards
   * @param {boolean} forceStereo - Upmixes mono to stereo for universal Yamaha arranger compatibility
   */
  static encode(audioBuffer, targetSampleRate = 44100, forceStereo = true) {
    let numChannels = audioBuffer.numberOfChannels;
    const srcSampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    let channels = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }

    // Convert Mono to Stereo if forceStereo is requested (Yamaha SFF2 requirement)
    if (forceStereo && numChannels === 1) {
      channels.push(channels[0]); // Duplicate mono channel to right channel
      numChannels = 2;
    }

    // Resample to targetSampleRate if needed (e.g. 48kHz -> 44.1kHz)
    let outSamples = length;
    if (srcSampleRate !== targetSampleRate) {
      outSamples = Math.max(1, Math.round((length * targetSampleRate) / srcSampleRate));
      const resampledChannels = [];
      const ratio = length / outSamples;

      for (let c = 0; c < numChannels; c++) {
        const resampled = new Float32Array(outSamples);
        const srcChan = channels[c];
        for (let i = 0; i < outSamples; i++) {
          const srcIdx = i * ratio;
          const idx0 = Math.floor(srcIdx);
          const idx1 = Math.min(length - 1, idx0 + 1);
          const frac = srcIdx - idx0;
          const val = srcChan[idx0] * (1 - frac) + srcChan[idx1] * frac;
          resampled[i] = Number.isFinite(val) ? val : 0;
        }
        resampledChannels.push(resampled);
      }
      channels = resampledChannels;
    }

    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = targetSampleRate * blockAlign;
    const dataSize = outSamples * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // chunkSize
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);               // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);                // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);      // NumChannels
    view.setUint32(24, targetSampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true);         // ByteRate
    view.setUint16(32, blockAlign, true);       // BlockAlign
    view.setUint16(34, 16, true);               // BitsPerSample

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write interleaved 16-bit PCM samples with clipping and NaN protection
    let offset = 44;
    for (let i = 0; i < outSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];
        if (!Number.isFinite(sample)) sample = 0;
        sample = Math.max(-1.0, Math.min(1.0, sample));
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, Math.round(int16), true);
        offset += 2;
      }
    }

    return buffer;
  }

  static writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}
