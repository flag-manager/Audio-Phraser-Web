/**
 * Yamaha Audio Phraser - WSOLA (Waveform Similarity Overlap-Add) Time-Stretcher
 * High-performance, pitch-preserving audio time-stretching algorithm.
 * Optimized with adaptive windowing for short audio slices and clean normalization.
 */

export class WsolaTimeStretcher {
  /**
   * Time stretch an AudioBuffer or Float32Array by ratio without changing pitch.
   * ratio = duration_out / duration_in.
   * ratio = 1.0 -> no stretch.
   * ratio > 1.0 -> slower / longer.
   * ratio < 1.0 -> faster / shorter.
   */
  static stretch(audioBuffer, audioContext, ratio = 1.0) {
    if (!Number.isFinite(ratio) || Math.abs(ratio - 1.0) < 0.005) {
      return audioBuffer; // No stretch needed or invalid ratio
    }

    // Clamp extreme stretch ratios
    const clampedRatio = Math.max(0.2, Math.min(5.0, ratio));

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const inLen = audioBuffer.length;
    const outLen = Math.max(1, Math.round(inLen * clampedRatio));

    if (inLen < 256) {
      return audioBuffer;
    }

    const outBuffer = audioContext.createBuffer(numChannels, outLen, sampleRate);

    // Adapt window size for very short loops
    let windowSize = 2048;
    if (inLen < windowSize * 2) {
      windowSize = Math.max(256, 1 << Math.floor(Math.log2(inLen / 2)));
    }
    const hopOut = Math.max(64, windowSize >> 2);
    const hopIn = Math.max(32, Math.round(hopOut / clampedRatio));
    const maxShift = Math.min(windowSize >> 2, Math.max(32, windowSize >> 3));

    // Precompute Hann window
    const window = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      window[i] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (windowSize - 1)));
    }

    // Normalization buffer for overlap-add
    const norm = new Float32Array(outLen);
    const outChannels = [];
    for (let c = 0; c < numChannels; c++) {
      outChannels.push(outBuffer.getChannelData(c));
    }

    const inChannels = [];
    for (let c = 0; c < numChannels; c++) {
      inChannels.push(audioBuffer.getChannelData(c));
    }

    // Main WSOLA overlap-add loop
    let inPos = 0;
    let outPos = 0;
    let lastInPos = 0;

    while (outPos + windowSize <= outLen && inPos + windowSize <= inLen) {
      let bestShift = 0;
      let maxCorr = -1e9;

      // Find best match in primary channel (mono or left)
      const primaryIn = inChannels[0];
      const targetPos = inPos;
      const prevRefPos = lastInPos + hopOut;

      for (let shift = -maxShift; shift <= maxShift; shift += 4) {
        const candidatePos = targetPos + shift;
        if (candidatePos < 0 || candidatePos + windowSize > inLen) continue;

        let corr = 0.0;
        // Sample every 8th sample for optimized high speed cross-correlation (<20ms execution)
        for (let i = 0; i < windowSize; i += 8) {
          const s1 = primaryIn[candidatePos + i];
          const s2 = prevRefPos + i < inLen ? primaryIn[prevRefPos + i] : 0;
          corr += s1 * s2;
        }

        if (corr > maxCorr) {
          maxCorr = corr;
          bestShift = shift;
        }
      }

      const matchPos = Math.max(0, Math.min(inLen - windowSize, inPos + bestShift));

      // Overlap-add windowed frame for all channels
      for (let c = 0; c < numChannels; c++) {
        const inp = inChannels[c];
        const outp = outChannels[c];
        for (let i = 0; i < windowSize; i++) {
          outp[outPos + i] += inp[matchPos + i] * window[i];
        }
      }

      // Add to normalization
      for (let i = 0; i < windowSize; i++) {
        norm[outPos + i] += window[i];
      }

      lastInPos = matchPos;
      inPos += hopIn;
      outPos += hopOut;
    }

    // Normalize overlapping frames
    for (let i = 0; i < outLen; i++) {
      const n = norm[i];
      if (n > 1e-4) {
        for (let c = 0; c < numChannels; c++) {
          outChannels[c][i] /= n;
        }
      }
    }

    return outBuffer;
  }
}
