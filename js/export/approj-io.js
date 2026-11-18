/**
 * Yamaha Audio Phraser - Project File (.approj) Serializer & Parser
 * Supports saving and loading complete Audio Phraser projects
 * with high-performance chunked Base64 encoding.
 */

import { WavEncoder } from './wav-encoder.js';

export class ApprojIO {
  /**
   * Export the project to an .approj JSON blob
   */
  static async exportProject(project, embedAudio = true) {
    const projectData = {
      format: 'AudioPhraserProject',
      version: '1.0.1',
      created: new Date().toISOString(),
      name: project.name,
      masterTempo: project.masterTempo,
      timeSignature: { ...project.timeSignature },
      ppq: project.ppq,
      selectedSectionId: project.selectedSectionId,
      sections: {},
      audioFiles: {}
    };

    // Serialize audio pool
    for (const [name, entry] of project.audioPool.entries()) {
      if (embedAudio && entry.buffer) {
        const wavBytes = WavEncoder.encode(entry.buffer, 44100, false);
        const base64 = this.arrayBufferToBase64(wavBytes);
        projectData.audioFiles[name] = {
          data: base64,
          duration: entry.duration,
          sampleRate: 44100,
          channels: entry.numberOfChannels
        };
      } else {
        projectData.audioFiles[name] = {
          fileName: name,
          duration: entry.duration
        };
      }
    }

    // Serialize sections
    for (const [id, sec] of project.sections.entries()) {
      projectData.sections[id] = {
        name: sec.name,
        code: sec.code,
        bars: sec.bars,
        pickup: sec.pickup,
        audioFileName: sec.audioFileName,
        trimStart: sec.trimStart,
        trimEnd: sec.trimEnd,
        fadeIn: sec.fadeIn,
        blank: sec.blank,
        originalTempo: sec.originalTempo,
        timeSignature: { ...sec.timeSignature },
        beatPoints: [...sec.beatPoints],
        onsetPoints: [...sec.onsetPoints],
        volume: sec.volume,
        pan: sec.pan,
        reverbSend: sec.reverbSend,
        timeStretchEnabled: sec.timeStretchEnabled
      };
    }

    const jsonStr = JSON.stringify(projectData, null, 2);
    return new Blob([jsonStr], { type: 'application/json' });
  }

  /**
   * Import an .approj file and restore state into project
   */
  static async importProject(fileOrBlob, project, audioContext) {
    const text = await fileOrBlob.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid project file format (.approj).');
    }

    project.name = data.name || 'Untitled';
    project.masterTempo = data.masterTempo || 120;
    project.timeSignature = data.timeSignature || { numerator: 4, denominator: 4 };
    project.selectedSectionId = data.selectedSectionId || 'main_a';

    // Decode and restore audio files
    if (data.audioFiles && audioContext) {
      for (const [name, audioEntry] of Object.entries(data.audioFiles)) {
        if (audioEntry.data) {
          const ab = this.base64ToArrayBuffer(audioEntry.data);
          const audioBuffer = await audioContext.decodeAudioData(ab);
          project.addAudioToPool(name, audioBuffer);
        }
      }
    }

    // Restore sections
    if (data.sections) {
      for (const [id, sData] of Object.entries(data.sections)) {
        const sec = project.sections.get(id);
        if (sec) {
          sec.bars = sData.bars || 2;
          sec.pickup = sData.pickup || 0;
          sec.audioFileName = sData.audioFileName || null;
          if (sData.audioFileName && project.audioPool.has(sData.audioFileName)) {
            sec.audioBuffer = project.audioPool.get(sData.audioFileName).buffer;
          }
          sec.trimStart = sData.trimStart || 0.0;
          sec.trimEnd = sData.trimEnd || 0.0;
          sec.fadeIn = !!sData.fadeIn;
          sec.blank = !!sData.blank;
          sec.originalTempo = sData.originalTempo || project.masterTempo;
          sec.timeSignature = sData.timeSignature || { ...project.timeSignature };
          sec.beatPoints = [...(sData.beatPoints || [])];
          sec.onsetPoints = [...(sData.onsetPoints || [])];
          sec.volume = sData.volume !== undefined ? sData.volume : 80;
          sec.pan = sData.pan !== undefined ? sData.pan : 64;
          sec.reverbSend = sData.reverbSend !== undefined ? sData.reverbSend : 40;
          sec.timeStretchEnabled = sData.timeStretchEnabled !== false;
        }
      }
    }

    project.isModified = false;
    return true;
  }

  /**
   * High-performance chunked ArrayBuffer to Base64 encoder.
   * Avoids stack overflows and intermediate string allocations for multi-megabyte audio files.
   */
  static arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    const CHUNK_SIZE = 0x8000; // 32KB chunking
    let binary = '';
    for (let i = 0; i < len; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  static base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
