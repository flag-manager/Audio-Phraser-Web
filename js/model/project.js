/**
 * Yamaha Audio Phraser - Project Model & State Manager
 */

import { STYLE_SECTIONS, StyleSection } from './section.js';

export class AudioPhraserProject {
  constructor(name = 'New Audio Style') {
    this.name = name;
    this.filePath = null;
    this.masterTempo = 120; // 5 to 500 BPM
    this.timeSignature = { numerator: 4, denominator: 4 };
    this.ppq = 480;
    this.sampleRate = 44100;
    this.targetKeyboard = 'psr_sx920'; // Default target keyboard ('psr_sx920', 'psr_s970', etc.)
    
    // Initialize 15 sections
    this.sections = new Map();
    for (const def of STYLE_SECTIONS) {
      this.sections.set(def.id, new StyleSection(def));
    }
    
    this.selectedSectionId = 'main_a';
    this.audioPool = new Map(); // fileName -> { buffer, name, duration }
    this.isModified = false;
    
    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];
  }

  get selectedSection() {
    return this.sections.get(this.selectedSectionId);
  }

  selectSection(id) {
    if (this.sections.has(id)) {
      this.selectedSectionId = id;
      return this.sections.get(id);
    }
    return null;
  }

  setMasterTempo(tempo) {
    this.masterTempo = Math.max(5, Math.min(500, tempo));
    this.isModified = true;
  }

  setTimeSignature(num, denom) {
    if (num >= 1 && num <= 12 && [2, 4, 8].includes(denom)) {
      this.timeSignature = { numerator: num, denominator: denom };
      for (const sec of this.sections.values()) {
        sec.timeSignature = { ...this.timeSignature };
      }
      this.isModified = true;
    }
  }

  setTargetKeyboard(keyboardId) {
    if (keyboardId && this.targetKeyboard !== keyboardId) {
      this.targetKeyboard = keyboardId;
      this.isModified = true;
    }
  }

  addAudioToPool(fileName, audioBuffer) {
    this.audioPool.set(fileName, {
      name: fileName,
      buffer: audioBuffer,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels
    });
  }

  assignAudioToSection(sectionId, fileName, audioBuffer, formatInfo = null) {
    const sec = this.sections.get(sectionId);
    if (!sec) return;
    
    this.recordState(`Assign audio to ${sec.name}`);
    
    sec.audioFileName = fileName;
    sec.audioBuffer = audioBuffer;
    sec.audioFormatInfo = formatInfo;
    sec.trimStart = 0.0;
    sec.trimEnd = audioBuffer.duration;
    sec.originalTempo = this.masterTempo;
    sec.timeSignature = { ...this.timeSignature };
    
    this.addAudioToPool(fileName, audioBuffer);
    this.isModified = true;
  }

  unlinkAudioFromSection(sectionId) {
    const sec = this.sections.get(sectionId);
    if (!sec || !sec.hasAudio) return;
    
    this.recordState(`Unlink audio from ${sec.name}`);
    sec.clearAudio();
    this.isModified = true;
  }

  recordState(actionDesc) {
    // Snapshot current state for undo
    const snapshot = this.serializeState();
    this.undoStack.push({ desc: actionDesc, data: snapshot });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const current = this.serializeState();
    const prev = this.undoStack.pop();
    this.redoStack.push({ desc: 'Revert', data: current });
    this.restoreState(prev.data);
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const current = this.serializeState();
    const next = this.redoStack.pop();
    this.undoStack.push({ desc: 'Redo', data: current });
    this.restoreState(next.data);
    return true;
  }

  serializeState() {
    const sectionsObj = {};
    for (const [id, s] of this.sections.entries()) {
      sectionsObj[id] = {
        bars: s.bars,
        pickup: s.pickup,
        audioFileName: s.audioFileName,
        audioFormatInfo: s.audioFormatInfo ? { ...s.audioFormatInfo } : null,
        trimStart: s.trimStart,
        trimEnd: s.trimEnd,
        fadeIn: s.fadeIn,
        blank: s.blank,
        originalTempo: s.originalTempo,
        timeSignature: { ...s.timeSignature },
        beatPoints: [...s.beatPoints],
        volume: s.volume,
        pan: s.pan,
        reverbSend: s.reverbSend,
        timeStretchEnabled: s.timeStretchEnabled
      };
    }
    return {
      name: this.name,
      masterTempo: this.masterTempo,
      timeSignature: { ...this.timeSignature },
      selectedSectionId: this.selectedSectionId,
      targetKeyboard: this.targetKeyboard,
      sections: sectionsObj
    };
  }

  restoreState(data) {
    this.name = data.name || this.name;
    this.masterTempo = data.masterTempo || 120;
    this.timeSignature = data.timeSignature || { numerator: 4, denominator: 4 };
    this.selectedSectionId = data.selectedSectionId || 'main_a';
    this.targetKeyboard = data.targetKeyboard || this.targetKeyboard;
    
    if (data.sections) {
      for (const [id, sData] of Object.entries(data.sections)) {
        const sec = this.sections.get(id);
        if (sec) {
          sec.bars = sData.bars;
          sec.pickup = sData.pickup || 0;
          sec.audioFileName = sData.audioFileName;
          sec.audioFormatInfo = sData.audioFormatInfo || null;
          // Reconnect buffer from pool if available
          if (sData.audioFileName && this.audioPool.has(sData.audioFileName)) {
            sec.audioBuffer = this.audioPool.get(sData.audioFileName).buffer;
          }
          sec.trimStart = sData.trimStart;
          sec.trimEnd = sData.trimEnd;
          sec.fadeIn = sData.fadeIn;
          sec.blank = sData.blank;
          sec.originalTempo = sData.originalTempo;
          sec.timeSignature = sData.timeSignature;
          sec.beatPoints = [...(sData.beatPoints || [])];
          sec.volume = sData.volume;
          sec.pan = sData.pan;
          sec.reverbSend = sData.reverbSend;
          sec.timeStretchEnabled = sData.timeStretchEnabled;
        }
      }
    }
    this.isModified = true;
  }
}
