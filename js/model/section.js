/**
 * Yamaha Audio Phraser - Section Definitions and Model
 * Represents the 15 standard Yamaha Style Sections.
 */

export const STYLE_SECTIONS = [
  { id: 'intro_a', name: 'Intro A', code: 'Intro A', category: 'Intro', defaultBars: 4, sortOrder: 1 },
  { id: 'intro_b', name: 'Intro B', code: 'Intro B', category: 'Intro', defaultBars: 4, sortOrder: 2 },
  { id: 'intro_c', name: 'Intro C', code: 'Intro C', category: 'Intro', defaultBars: 4, sortOrder: 3 },
  { id: 'main_a', name: 'Main A', code: 'Main A', category: 'Main', defaultBars: 4, sortOrder: 4 },
  { id: 'main_b', name: 'Main B', code: 'Main B', category: 'Main', defaultBars: 4, sortOrder: 5 },
  { id: 'main_c', name: 'Main C', code: 'Main C', category: 'Main', defaultBars: 4, sortOrder: 6 },
  { id: 'main_d', name: 'Main D', code: 'Main D', category: 'Main', defaultBars: 4, sortOrder: 7 },
  { id: 'fill_aa', name: 'Fill In AA', code: 'Fill In AA', category: 'Fill', defaultBars: 1, sortOrder: 8 },
  { id: 'fill_bb', name: 'Fill In BB', code: 'Fill In BB', category: 'Fill', defaultBars: 1, sortOrder: 9 },
  { id: 'fill_cc', name: 'Fill In CC', code: 'Fill In CC', category: 'Fill', defaultBars: 1, sortOrder: 10 },
  { id: 'fill_dd', name: 'Fill In DD', code: 'Fill In DD', category: 'Fill', defaultBars: 1, sortOrder: 11 },
  { id: 'break', name: 'Break', code: 'Fill In BA', category: 'Break', defaultBars: 1, sortOrder: 12 },
  { id: 'ending_a', name: 'Ending A', code: 'Ending A', category: 'Ending', defaultBars: 4, sortOrder: 13 },
  { id: 'ending_b', name: 'Ending B', code: 'Ending B', category: 'Ending', defaultBars: 4, sortOrder: 14 },
  { id: 'ending_c', name: 'Ending C', code: 'Ending C', category: 'Ending', defaultBars: 4, sortOrder: 15 }
];

export class StyleSection {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.code = def.code;
    this.category = def.category;
    this.bars = def.defaultBars || 2;
    this.pickup = 0; // In beats
    
    // Audio assignment
    this.audioFileName = null;
    this.audioBuffer = null; // Decoded AudioBuffer
    this.rawPcm = null;      // Float32Array stereo/mono samples
    this.audioFormatInfo = null; // Original audio format metadata & conversion info
    
    // Trimming & boundary
    this.trimStart = 0.0;    // In seconds
    this.trimEnd = 0.0;      // In seconds
    this.fadeIn = false;
    this.blank = false;
    
    // Musical timing
    this.originalTempo = 120.0;
    this.timeSignature = { numerator: 4, denominator: 4 };
    this.beatPoints = [];    // Array of timestamps (in seconds) for each beat
    this.onsetPoints = [];   // Detected transients/onsets
    this.attackPoints = [];  // Attack points
    
    // Mixing & Playback
    this.volume = 80;        // Yamaha default 80 (0-127)
    this.pan = 64;           // Center 64 (0-127)
    this.reverbSend = 40;    // Default 40 (0-127)
    this.timeStretchEnabled = true;
  }

  get hasAudio() {
    return this.audioBuffer !== null && this.audioBuffer.duration > 0;
  }

  get duration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  get trimmedDuration() {
    if (!this.hasAudio) return 0;
    const end = this.trimEnd > 0 ? this.trimEnd : this.duration;
    return Math.max(0, end - this.trimStart);
  }

  /**
   * Calculate musical bar length in seconds at a target tempo (including pickup beats)
   */
  getSectionExpectedDuration(tempo = this.originalTempo) {
    const beatsPerBar = this.timeSignature.numerator;
    const beatValue = this.timeSignature.denominator; // e.g. 4 for quarter note
    const beatsTotal = this.bars * beatsPerBar + (this.pickup || 0);
    // (60 / tempo) * (4 / denominator) * beatsTotal
    const secondsPerBeat = (60.0 / Math.max(5, tempo)) * (4.0 / beatValue);
    return beatsTotal * secondsPerBeat;
  }

  /**
   * Time stretch percentage compared to target tempo
   */
  getTimeStretchRatio(targetTempo) {
    const waveLen = this.trimmedDuration;
    if (waveLen <= 0.001) return 100.0;
    const secLen = this.getSectionExpectedDuration(targetTempo);
    return (secLen / waveLen) * 100.0;
  }

  /**
   * Reset section to empty
   */
  clearAudio() {
    this.audioFileName = null;
    this.audioBuffer = null;
    this.rawPcm = null;
    this.audioFormatInfo = null;
    this.trimStart = 0.0;
    this.trimEnd = 0.0;
    this.beatPoints = [];
    this.onsetPoints = [];
    this.attackPoints = [];
  }
}
