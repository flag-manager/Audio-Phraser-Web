/**
 * Audio Style Slicer - Beat & Onset Detection Engine
 * Performs audio feature extraction, tempo estimation, and beat grid alignment.
 */

export class BeatDetector {
  /**
   * Analyze an AudioBuffer to find onsets, tempo (BPM), and beat points
   */
  static analyze(audioBuffer, options = {}) {
    const defaultTempo = options.defaultTempo || 120;
    const timeSig = options.timeSignature || { numerator: 4, denominator: 4 };
    const numBars = options.bars || 2;

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const length = channelData.length;
    const duration = audioBuffer.duration;

    if (duration <= 0.05) {
      return {
        bpm: defaultTempo,
        downbeatOffset: 0,
        beatPoints: [],
        onsetPoints: []
      };
    }

    // Step 1: Energy & Spectral Flux Envelope
    const hopSize = Math.floor(sampleRate / 100); // 10ms hop
    const frameSize = hopSize * 2;
    const numFrames = Math.floor((length - frameSize) / hopSize);

    if (numFrames < 4) {
      return this.generateUniformGrid(duration, defaultTempo, timeSig, numBars);
    }

    const envelope = new Float32Array(numFrames);
    let maxEnergy = 0.0;

    for (let f = 0; f < numFrames; f++) {
      let sum = 0.0;
      const start = f * hopSize;
      for (let i = 0; i < frameSize; i++) {
        const s = channelData[start + i];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / frameSize);
      envelope[f] = rms;
      if (rms > maxEnergy) maxEnergy = rms;
    }

    // Flux: Positive difference between adjacent frames
    const flux = new Float32Array(numFrames);
    let maxFlux = 0.0;
    for (let i = 1; i < numFrames; i++) {
      const diff = envelope[i] - envelope[i - 1];
      flux[i] = diff > 0 ? diff : 0;
      if (flux[i] > maxFlux) maxFlux = flux[i];
    }

    // Onset peak picking
    const onsetPoints = [];
    const minDistanceFrames = Math.floor(0.08 * (sampleRate / hopSize)); // min 80ms between onsets
    let lastOnset = -minDistanceFrames;
    const threshold = maxFlux * 0.15;

    for (let i = 1; i < numFrames - 1; i++) {
      if (
        flux[i] > threshold &&
        flux[i] >= flux[i - 1] &&
        flux[i] >= flux[i + 1] &&
        i - lastOnset >= minDistanceFrames
      ) {
        onsetPoints.push({
          time: (i * hopSize) / sampleRate,
          strength: flux[i]
        });
        lastOnset = i;
      }
    }

    // Step 2: Autocorrelation Tempo Estimation
    const fps = sampleRate / hopSize;
    let bestBpm = defaultTempo;
    let bestScore = -1;

    // Search between 60 BPM and 220 BPM
    const minBpm = 60;
    const maxBpm = 220;
    const step = 0.5;

    for (let bpm = minBpm; bpm <= maxBpm; bpm += step) {
      const lag = Math.round((60.0 / bpm) * fps);
      if (lag <= 0 || lag >= numFrames / 2) continue;

      let score = 0.0;
      let count = 0;
      for (let i = lag; i < numFrames; i++) {
        score += flux[i] * flux[i - lag];
        count++;
      }
      if (count > 0) score /= count;

      // Weight score slightly toward typical musical tempos (100-135)
      const tempoWeight = 1.0 - Math.min(0.2, Math.abs(bpm - 120) / 250);
      const totalScore = score * tempoWeight;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestBpm = bpm;
      }
    }

    bestBpm = Math.round(bestBpm * 10) / 10;

    // Check if loop duration matches exact bars at this BPM
    const expectedBeats = numBars * timeSig.numerator;
    const durationBpm = (expectedBeats / duration) * 60.0;
    if (Math.abs(durationBpm - bestBpm) < 3.0) {
      bestBpm = Math.round(durationBpm * 100) / 100;
    }

    // Step 3: Align Downbeat & Beat Points
    const secondsPerBeat = 60.0 / bestBpm;
    let downbeatOffset = 0.0;

    // Look for first strong onset within first beat
    const firstStrongOnset = onsetPoints.find(
      (o) => o.time < secondsPerBeat * 0.8 && o.strength > maxFlux * 0.3
    );
    if (firstStrongOnset) {
      downbeatOffset = firstStrongOnset.time;
    }

    const totalBeats = Math.max(1, Math.round((duration - downbeatOffset) / secondsPerBeat));
    const beatPoints = [];
    for (let b = 0; b <= totalBeats; b++) {
      const t = downbeatOffset + b * secondsPerBeat;
      if (t <= duration) {
        beatPoints.push(Math.round(t * 1000000) / 1000000);
      }
    }

    return {
      bpm: bestBpm,
      downbeatOffset,
      beatPoints,
      onsetPoints: onsetPoints.map((o) => o.time)
    };
  }

  /**
   * Helper to create a uniform musical grid
   */
  static generateUniformGrid(duration, bpm, timeSig = { numerator: 4, denominator: 4 }, bars = 2) {
    const totalBeats = bars * timeSig.numerator;
    const secondsPerBeat = (60.0 / bpm) * (4.0 / timeSig.denominator);
    const beatPoints = [];

    for (let b = 0; b <= totalBeats; b++) {
      const t = b * secondsPerBeat;
      if (t <= duration + 0.001) {
        beatPoints.push(Math.round(t * 1000000) / 1000000);
      }
    }

    return {
      bpm,
      downbeatOffset: 0,
      beatPoints,
      onsetPoints: []
    };
  }

  /**
   * Double the beat points grid (2x tempo)
   */
  static doubleTempo(beatPoints, duration) {
    if (!beatPoints || beatPoints.length < 2) return beatPoints;
    const newPoints = [];
    for (let i = 0; i < beatPoints.length - 1; i++) {
      newPoints.push(beatPoints[i]);
      const mid = (beatPoints[i] + beatPoints[i + 1]) / 2;
      newPoints.push(Math.round(mid * 1000000) / 1000000);
    }
    newPoints.push(beatPoints[beatPoints.length - 1]);
    return newPoints;
  }

  /**
   * Halve the beat points grid (/2 tempo)
   */
  static halfTempo(beatPoints) {
    if (!beatPoints || beatPoints.length < 3) return beatPoints;
    const newPoints = [];
    for (let i = 0; i < beatPoints.length; i += 2) {
      newPoints.push(beatPoints[i]);
    }
    return newPoints;
  }

  /**
   * Shift beat points by half a beat interval
   */
  static shiftBeatGrid(beatPoints, duration) {
    if (!beatPoints || beatPoints.length < 2) return beatPoints;
    const interval = (beatPoints[1] - beatPoints[0]) / 2;
    const shifted = beatPoints.map((p) => Math.round((p + interval) * 1000000) / 1000000);

    // If there is room before the first shifted point, prepend the wrapped beat
    if (shifted[0] - interval * 2 >= -0.001) {
      const prepended = Math.max(0, shifted[0] - interval * 2);
      shifted.unshift(Math.round(prepended * 1000000) / 1000000);
    }

    const valid = shifted.filter((p) => p <= duration + 0.001);
    return valid.length >= 2 ? valid : beatPoints;
  }
}
