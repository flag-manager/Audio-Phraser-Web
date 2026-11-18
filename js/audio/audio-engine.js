/**
 * Yamaha Audio Phraser - Audio Engine & Transport Manager
 * Handles Web Audio playback, looping, real-time volume/panning, time-stretching, and metronome synchronization.
 */

import { MetronomeEngine } from './metronome.js';
import { WsolaTimeStretcher } from './wsola-stretcher.js';
import { WavEncoder } from '../export/wav-encoder.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.metronome = null;
    this.isPlaying = false;
    this.isLooping = true;

    // Audio Graph Nodes
    this.masterGain = null;
    this.analyser = null;
    this.activeSource = null;
    this.sectionGain = null;
    this.sectionPanner = null;

    // Playback state
    this.playbackStartTime = 0;
    this.currentLoopDuration = 0;
    this.playbackSection = null;
    this.stretchedBuffer = null;
    this.metroTimer = null;
    this.stretchCache = null; // { key, buffer }

    // Callbacks
    this.onPlayheadUpdate = null;
    this.onPlaybackStopped = null;
  }

  async init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.metronome = new MetronomeEngine(this.ctx);
      await this.metronome.loadSounds();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setMasterVolume(vol) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1.5, vol)), this.ctx.currentTime);
    }
  }

  setSectionVolume(vol) {
    if (this.sectionGain && this.ctx) {
      const gainVal = Math.max(0, Math.min(127, vol)) / 100.0;
      this.sectionGain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    }
  }

  setSectionPan(pan) {
    if (this.sectionPanner && this.ctx) {
      const panVal = Math.max(0, Math.min(127, pan));
      const normalized = (panVal - 64) / 64.0;
      this.sectionPanner.pan.setValueAtTime(Math.max(-1.0, Math.min(1.0, normalized)), this.ctx.currentTime);
    }
  }

  /**
   * Slice audio buffer to trim boundaries with optional anti-click fade,
   * returning a genuine Web Audio API AudioBuffer for playback.
   */
  sliceBuffer(buffer, startSec, endSec, applyFade = false) {
    if (!buffer) return null;
    return WavEncoder.sliceBuffer(buffer, startSec, endSec, applyFade, this.ctx);
  }

  clearCache() {
    this.stretchCache = null;
  }

  /**
   * Play active section in a loop with optional time stretch, metronome, and seek offset.
   * @param {StyleSection} section
   * @param {number} targetTempo
   * @param {boolean} loop
   * @param {number} startOffsetSec - Timestamp within the un-trimmed audio to start playback at
   */
  async playSection(section, targetTempo = 120, loop = true, startOffsetSec = 0) {
    await this.init();
    this.stop(false);

    if (!section || !section.hasAudio) return;

    this.playbackSection = section;
    this.isLooping = loop;

    // 1. Prepare trimmed audio
    const startSec = section.trimStart;
    const endSec = section.trimEnd > 0 ? section.trimEnd : section.duration;
    const trimmed = this.sliceBuffer(section.audioBuffer, startSec, endSec, section.fadeIn);
    if (!trimmed) return;

    // 2. Prepare time stretch if enabled (with cache for instant re-play)
    let playBuffer = trimmed;
    const secExpectedDuration = section.getSectionExpectedDuration(targetTempo);

    if (section.timeStretchEnabled && secExpectedDuration > 0.05 && trimmed.duration > 0.05) {
      const ratio = secExpectedDuration / trimmed.duration;
      if (Math.abs(ratio - 1.0) >= 0.01) {
        const cacheKey = `${section.id}_${startSec.toFixed(3)}_${endSec.toFixed(3)}_${targetTempo}_${section.fadeIn}`;
        if (this.stretchCache && this.stretchCache.key === cacheKey) {
          playBuffer = this.stretchCache.buffer;
        } else {
          playBuffer = WsolaTimeStretcher.stretch(trimmed, this.ctx, ratio);
          this.stretchCache = { key: cacheKey, buffer: playBuffer };
        }
      }
    }

    this.stretchedBuffer = playBuffer;
    this.currentLoopDuration = playBuffer.duration;

    // 3. Compute playback start offset within playBuffer
    let playOffset = 0.0;
    if (startOffsetSec > startSec) {
      const rawOffset = Math.min(trimmed.duration - 0.02, startOffsetSec - startSec);
      if (rawOffset > 0) {
        const actualRatio = playBuffer.duration / Math.max(0.001, trimmed.duration);
        playOffset = Math.max(0, Math.min(playBuffer.duration - 0.02, rawOffset * actualRatio));
      }
    }

    this.playbackStartTime = this.ctx.currentTime - playOffset;
    this.isPlaying = true;

    // 4. Create audio graph: Source -> Section Gain -> Section Panner -> Master Gain
    const src = this.ctx.createBufferSource();
    src.buffer = playBuffer;
    src.loop = this.isLooping;

    const secGain = this.ctx.createGain();
    secGain.gain.value = (section.volume !== undefined ? section.volume : 80) / 100.0;
    this.sectionGain = secGain;

    if (this.ctx.createStereoPanner) {
      const secPanner = this.ctx.createStereoPanner();
      const panVal = section.pan !== undefined ? section.pan : 64;
      secPanner.pan.value = Math.max(-1.0, Math.min(1.0, (panVal - 64) / 64.0));
      this.sectionPanner = secPanner;

      src.connect(secGain);
      secGain.connect(secPanner);
      secPanner.connect(this.masterGain);
    } else {
      this.sectionPanner = null;
      src.connect(secGain);
      secGain.connect(this.masterGain);
    }

    src.onended = () => {
      if (!this.isLooping && this.isPlaying) {
        this.stop(true);
      }
    };

    this.activeSource = src;
    if (playOffset > 0.005) {
      src.start(0, playOffset);
    } else {
      src.start(0);
    }

    // 5. Start Metronome Scheduler if enabled
    if (this.metronome && this.metronome.enabled) {
      this.startMetronomeScheduler(section, targetTempo, playOffset);
    }

    // 6. Start Animation Playhead Loop
    this.startPlayheadTracking();
  }

  /**
   * Real-time live settings update during active playback.
   * Instantly re-slices/stretches and swaps audio node without stopping playback.
   */
  async updateLiveSettings(section, targetTempo) {
    if (!this.isPlaying || !this.playbackSection || !this.activeSource) return;

    this.playbackSection = section;

    // Calculate current playback phase (0.0 to 1.0)
    const now = this.ctx.currentTime;
    const elapsed = now - this.playbackStartTime;
    const prevDuration = this.currentLoopDuration > 0 ? this.currentLoopDuration : 1.0;
    const currentPhase = (elapsed % prevDuration) / prevDuration;

    // Re-slice and re-stretch
    const startSec = section.trimStart;
    const endSec = section.trimEnd > 0 ? section.trimEnd : section.duration;
    const trimmed = this.sliceBuffer(section.audioBuffer, startSec, endSec, section.fadeIn);
    if (!trimmed) return;

    let playBuffer = trimmed;
    const secExpectedDuration = section.getSectionExpectedDuration(targetTempo);

    if (section.timeStretchEnabled && secExpectedDuration > 0.05 && trimmed.duration > 0.05) {
      const ratio = secExpectedDuration / trimmed.duration;
      if (Math.abs(ratio - 1.0) >= 0.01) {
        const cacheKey = `${section.id}_${startSec.toFixed(3)}_${endSec.toFixed(3)}_${targetTempo}_${section.fadeIn}`;
        if (this.stretchCache && this.stretchCache.key === cacheKey) {
          playBuffer = this.stretchCache.buffer;
        } else {
          playBuffer = WsolaTimeStretcher.stretch(trimmed, this.ctx, ratio);
          this.stretchCache = { key: cacheKey, buffer: playBuffer };
        }
      }
    }

    this.stretchedBuffer = playBuffer;
    this.currentLoopDuration = playBuffer.duration;

    const newOffset = Math.max(0, Math.min(playBuffer.duration - 0.01, currentPhase * playBuffer.duration));
    this.playbackStartTime = this.ctx.currentTime - newOffset;

    const newSrc = this.ctx.createBufferSource();
    newSrc.buffer = playBuffer;
    newSrc.loop = this.isLooping;

    if (this.sectionGain) {
      newSrc.connect(this.sectionGain);
    } else {
      newSrc.connect(this.masterGain);
    }

    newSrc.onended = () => {
      if (!this.isLooping && this.isPlaying) {
        this.stop(true);
      }
    };

    const oldSrc = this.activeSource;
    this.activeSource = newSrc;

    if (newOffset > 0.005) {
      newSrc.start(0, newOffset);
    } else {
      newSrc.start(0);
    }

    if (oldSrc) {
      try {
        oldSrc.stop();
        oldSrc.disconnect();
      } catch (e) {}
    }

    if (this.metronome && this.metronome.enabled) {
      this.startMetronomeScheduler(section, targetTempo, newOffset);
    }
  }

  stop(notify = true) {
    this.isPlaying = false;
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch (e) {}
      this.activeSource = null;
    }
    this.stopMetronomeScheduler();

    if (notify && this.onPlaybackStopped) {
      this.onPlaybackStopped();
    }
  }

  stopMetronomeScheduler() {
    if (this.metroTimer) {
      clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
  }

  startMetronomeScheduler(section, bpm, currentPlayOffset = 0) {
    this.stopMetronomeScheduler();
    if (!this.metronome || !this.metronome.enabled) return;

    const timeSig = section?.timeSignature || { numerator: 4, denominator: 4 };
    const beatsPerBar = timeSig.numerator;
    const secondsPerBeat = (60.0 / Math.max(5, bpm)) * (4.0 / (timeSig.denominator || 4));

    const startBeatIndex = Math.floor(currentPlayOffset / secondsPerBeat);
    const offsetInBeat = currentPlayOffset % secondsPerBeat;
    let nextBeatTime = this.ctx.currentTime + (secondsPerBeat - offsetInBeat);
    let beatIndex = startBeatIndex + 1;

    if (offsetInBeat < 0.02) {
      this.metronome.scheduleClick(this.ctx.currentTime, startBeatIndex % beatsPerBar === 0);
    }

    const scheduleAheadTime = 0.15; // 150ms lookahead
    const checkInterval = 25;       // 25ms interval

    this.metroTimer = setInterval(() => {
      if (!this.isPlaying) return;
      const now = this.ctx.currentTime;

      while (nextBeatTime < now + scheduleAheadTime) {
        const isDownbeat = beatIndex % beatsPerBar === 0;
        this.metronome.scheduleClick(nextBeatTime, isDownbeat);
        nextBeatTime += secondsPerBeat;
        beatIndex++;

        // Wrap beatIndex at loop boundary
        if (this.isLooping && this.currentLoopDuration > 0) {
          const loopTime = nextBeatTime - this.playbackStartTime;
          if (loopTime >= this.currentLoopDuration) {
            nextBeatTime = this.playbackStartTime + (loopTime % this.currentLoopDuration);
            beatIndex = 0;
          }
        }
      }
    }, checkInterval);
  }

  startPlayheadTracking() {
    const update = () => {
      if (!this.isPlaying || !this.playbackSection) return;

      const now = this.ctx.currentTime;
      const elapsed = now - this.playbackStartTime;
      const loopLen = this.currentLoopDuration > 0 ? this.currentLoopDuration : 1.0;
      const normalizedPos = (elapsed % loopLen) / loopLen; // 0.0 to 1.0

      // Map back to trimmed waveform range in seconds
      const startSec = this.playbackSection.trimStart;
      const endSec = this.playbackSection.trimEnd > 0 ? this.playbackSection.trimEnd : this.playbackSection.duration;
      const currentWaveformSec = startSec + normalizedPos * (endSec - startSec);

      if (this.onPlayheadUpdate) {
        this.onPlayheadUpdate({
          normalizedPos,
          currentSec: currentWaveformSec,
          elapsed
        });
      }

      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);
  }
}
