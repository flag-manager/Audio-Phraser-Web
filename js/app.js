/**
 * Yamaha Audio Phraser Studio Web - Application Main Controller
 * Orchestrates UI, audio engine, beat detection, Yamaha style export,
 * session auto-save persistence via IndexedDB, and StyleCraft Studio aesthetics.
 */

import { AudioPhraserProject } from './model/project.js';
import { AudioEngine } from './audio/audio-engine.js';
import { WaveformView } from './ui/waveform-view.js';
import { SectionPanel } from './ui/section-panel.js';
import { BeatDetector } from './analysis/beat-detector.js';
import { WavEncoder } from './export/wav-encoder.js';
import { AusWriter } from './export/aus-writer.js';
import { ApprojIO } from './export/approj-io.js';
import { ModalDialogs } from './ui/modal-dialogs.js';
import { SessionStorageManager } from './model/session-storage.js';
import { RecentProjectsManager } from './model/recent-projects.js';

// SVG Vector Icon Templates
const PLAY_ICON_SVG = `<svg class="transport-icon" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const PAUSE_ICON_SVG = `<svg class="transport-icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

class AudioPhraserApp {
  constructor() {
    this.project = new AudioPhraserProject();
    this.audioEngine = new AudioEngine();
    this.emptyStyBuffer = null;

    // UI Components
    this.waveformView = null;
    this.sectionPanel = null;

    // Auto-save debounce timer
    this.autoSaveTimer = null;

    // Elements
    this.dom = {};
  }

  async init() {
    this.bindDomElements();
    this.initWaveform();
    this.initSectionPanel();
    this.bindEvents();
    this.setupShortcuts();
    this.renderRecentProjects();

    // Load Empty.sty template in background
    await this.loadEmptyStyTemplate();

    // Check for prior unsaved session in IndexedDB
    await this.checkAndPromptSessionRestore();

    // Initial render
    this.selectSection(this.project.selectedSectionId || 'main_a');
    this.updateUI();
  }

  bindDomElements() {
    const ids = [
      'waveformCanvas', 'waveformBox', 'sectionPanel',
      'btnNew', 'btnOpen', 'btnSave', 'btnImportAudio', 'btnUnlinkAudio',
      'spinTempo', 'selectTimeSignature', 'btnExportSty',
      'btnZoomIn', 'btnZoomOut', 'zoomLevelText', 'timeStretchBanner',
      'lblAssignedFile', 'lblAudioDuration', 'lblAudioChannels',
      'spinBars', 'spinPickup', 'trimStart', 'trimEnd', 'chkFade', 'chkBlank',
      'btnAutoDetectBeat', 'btnBeatHalf', 'btnBeatDouble', 'btnToggleShiftBeat',
      'sliderVolume', 'lblVolumeVal', 'sliderPan', 'lblPanVal', 'chkTimeStretch',
      'btnPlayLoop', 'btnStop', 'playIconWrap', 'playText',
      'chkClick', 'sliderMetro', 'lblActiveSectionName',
      'sessionDot', 'sessionStatus',
      'audioFileInput', 'projectFileInput',
      'menuNewProject', 'menuOpenProject', 'menuRecents', 'recentProjectsMenu',
      'menuSaveProject', 'menuSaveProjectAs',
      'menuImportAudio', 'menuExportStyle', 'menuExportWav',
      'menuUndo', 'menuRedo', 'menuClearSection', 'menuAudioSettings'
    ];

    for (const id of ids) {
      this.dom[id] = document.getElementById(id);
    }
  }

  /**
   * Session Recovery: Check IndexedDB and ask user if they want to restore.
   */
  async checkAndPromptSessionRestore() {
    try {
      const hasSession = await SessionStorageManager.hasSession();
      if (!hasSession) {
        this.setSessionStatus('Ready', false);
        return;
      }

      const summary = await SessionStorageManager.getSessionSummary();
      if (!summary) return;

      const shouldRestore = await ModalDialogs.showRestoreSessionPrompt(summary);
      if (shouldRestore) {
        await this.audioEngine.init();
        await SessionStorageManager.restoreSession(this.project, this.audioEngine.ctx);
        this.sectionPanel.render(this.project);
        this.selectSection(this.project.selectedSectionId || 'main_a');
        this.updateUI();
        this.setSessionStatus('Restored', false);
      } else {
        await SessionStorageManager.clearSession();
        this.setSessionStatus('Fresh Session', false);
      }
    } catch (err) {
      console.warn('Session restore check error:', err);
      this.setSessionStatus('Ready', false);
    }
  }

  setSessionStatus(text, isSaving = false) {
    if (this.dom.sessionStatus) {
      this.dom.sessionStatus.textContent = text;
    }
    if (this.dom.sessionDot) {
      if (isSaving) {
        this.dom.sessionDot.classList.add('saving');
      } else {
        this.dom.sessionDot.classList.remove('saving');
      }
    }
  }

  scheduleAutoSave() {
    this.setSessionStatus('Saving...', true);
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(async () => {
      try {
        await SessionStorageManager.saveSession(this.project);
        this.setSessionStatus('Saved to browser', false);
      } catch (err) {
        console.warn('Auto-save error:', err);
        this.setSessionStatus('Save error', false);
      }
    }, 800);
  }

  async loadEmptyStyTemplate() {
    const paths = ['assets/Empty.sty', 'Empty.sty', './Empty.sty', '/Empty.sty'];
    for (const p of paths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          this.emptyStyBuffer = await res.arrayBuffer();
          return;
        }
      } catch (e) { }
    }
    console.warn('Could not load Empty.sty from standard paths');
  }

  initWaveform() {
    this.waveformView = new WaveformView(this.dom.waveformCanvas, this.dom.waveformBox);

    this.waveformView.onTrimChanged = (start, end) => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.trimStart = start;
        sec.trimEnd = end;
        this.dom.trimStart.value = start.toFixed(3);
        this.dom.trimEnd.value = end.toFixed(3);
        this.updateTimeStretchBanner();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.waveformView.onBeatMarkerChanged = (beatPoints) => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.beatPoints = [...beatPoints];
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.waveformView.onSeek = (seekSec) => {
      if (this.audioEngine.isPlaying) {
        const sec = this.project.selectedSection;
        if (sec && sec.hasAudio) {
          this.audioEngine.playSection(sec, this.project.masterTempo, true, seekSec);
        }
      } else {
        this.waveformView.setPlayhead(seekSec);
      }
    };

    // Connect playhead update from audio engine
    this.audioEngine.onPlayheadUpdate = ({ currentSec }) => {
      this.waveformView.setPlayhead(currentSec);
    };

    this.audioEngine.onPlaybackStopped = () => {
      this.waveformView.setPlayhead(-1);
      this.dom.btnPlayLoop.classList.remove('playing');
      this.dom.playIconWrap.innerHTML = PLAY_ICON_SVG;
      this.dom.playText.textContent = 'Play Loop';
    };
  }

  initSectionPanel() {
    this.sectionPanel = new SectionPanel(
      this.dom.sectionPanel,
      (sectionId) => this.selectSection(sectionId),
      (sectionId, file) => this.handleFileDropOnSection(sectionId, file)
    );
    this.sectionPanel.render(this.project);
  }

  selectSection(id) {
    if (this.audioEngine.isPlaying) {
      this.audioEngine.stop();
    }

    const sec = this.project.selectSection(id);
    if (!sec) return;

    this.sectionPanel.updateSelection(id);
    this.waveformView.setSection(sec);
    this.updateControlsForSection(sec);
    this.updateTimeStretchBanner();
  }

  updateControlsForSection(sec) {
    this.dom.lblActiveSectionName.textContent = sec.name;

    const hasAudio = !!(sec && sec.hasAudio);

    // Dynamic button state management based on audio availability
    this.dom.btnUnlinkAudio.disabled = !hasAudio;
    this.dom.btnAutoDetectBeat.disabled = !hasAudio;
    this.dom.btnBeatHalf.disabled = !hasAudio;
    this.dom.btnBeatDouble.disabled = !hasAudio;
    this.dom.btnToggleShiftBeat.disabled = !hasAudio;
    this.dom.trimStart.disabled = !hasAudio;
    this.dom.trimEnd.disabled = !hasAudio;
    this.dom.chkFade.disabled = !hasAudio;
    this.dom.chkBlank.disabled = !hasAudio;

    if (hasAudio) {
      this.dom.lblAssignedFile.textContent = sec.audioFileName;
      this.dom.lblAudioDuration.textContent = `Duration: ${sec.duration.toFixed(3)} s`;
      this.dom.lblAudioChannels.textContent = `${sec.audioBuffer.numberOfChannels === 2 ? 'Stereo' : 'Mono'} ${sec.audioBuffer.sampleRate} Hz`;
    } else {
      this.dom.lblAssignedFile.textContent = 'No audio assigned';
      this.dom.lblAudioDuration.textContent = 'Duration: 0.000 s';
      this.dom.lblAudioChannels.textContent = '-';
    }

    this.dom.spinBars.value = sec.bars;
    this.dom.spinPickup.value = sec.pickup;
    this.dom.trimStart.value = sec.trimStart.toFixed(3);
    this.dom.trimEnd.value = (sec.trimEnd > 0 ? sec.trimEnd : sec.duration).toFixed(3);
    this.dom.chkFade.checked = sec.fadeIn;
    this.dom.chkBlank.checked = sec.blank;
    this.dom.sliderVolume.value = sec.volume;
    this.dom.lblVolumeVal.textContent = sec.volume;
    this.dom.sliderPan.value = sec.pan;
    this.dom.lblPanVal.textContent = sec.pan === 64 ? 'C64' : (sec.pan < 64 ? `L${64 - sec.pan}` : `R${sec.pan - 64}`);
    this.dom.chkTimeStretch.checked = sec.timeStretchEnabled;

    this.dom.spinTempo.value = this.project.masterTempo;
    this.dom.selectTimeSignature.value = `${this.project.timeSignature.numerator}/${this.project.timeSignature.denominator}`;
  }

  updateTimeStretchBanner() {
    const sec = this.project.selectedSection;
    if (!sec || !sec.hasAudio) {
      this.dom.timeStretchBanner.innerHTML = `[Section length] 0.000 sec. - [Wave length] 0.000 sec. - [Time stretch] <span class="val-green">100.00 %</span>`;
      return;
    }

    const targetTempo = this.project.masterTempo;
    const secLen = sec.getSectionExpectedDuration(targetTempo);
    const waveLen = sec.trimmedDuration;
    const ratio = sec.getTimeStretchRatio(targetTempo);

    const isGoodRatio = ratio >= 70.0 && ratio <= 140.0;
    const valClass = isGoodRatio ? 'val-green' : 'val-red';

    this.dom.timeStretchBanner.innerHTML = `
      [Section length] ${secLen.toFixed(3)} sec. - [Wave length] ${waveLen.toFixed(3)} sec. - [Time stretch] <span class="${valClass}">${ratio.toFixed(2)} %</span>
    `;
  }

  async importAudioFile(file, targetSectionId = null) {
    await this.audioEngine.init();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioEngine.ctx.decodeAudioData(arrayBuffer);

      const secId = targetSectionId || this.project.selectedSectionId;
      this.project.assignAudioToSection(secId, file.name, audioBuffer);

      const sec = this.project.sections.get(secId);

      // Run automatic beat & onset detection
      const analysis = BeatDetector.analyze(audioBuffer, {
        defaultTempo: this.project.masterTempo,
        timeSignature: sec.timeSignature,
        bars: sec.bars
      });

      sec.beatPoints = analysis.beatPoints;
      sec.onsetPoints = analysis.onsetPoints;
      sec.originalTempo = analysis.bpm;

      // Update project master tempo if it was default
      if (this.project.masterTempo === 120 && analysis.bpm !== 120) {
        this.project.setMasterTempo(analysis.bpm);
      }

      this.sectionPanel.render(this.project);
      this.selectSection(secId);
      this.updateUI();
      this.scheduleAutoSave();
      RecentProjectsManager.addProject(this.project);
      this.renderRecentProjects();
    } catch (err) {
      console.error('Audio import failed:', err);
      ModalDialogs.showAlert('Audio Import Error', 'Failed to decode audio file. Please ensure it is a valid WAV, AIFF, MP3, or OGG file.', 'error');
    }
  }

  handleFileDropOnSection(sectionId, file) {
    if (file.name.match(/\.(wav|aif|aiff|mp3|ogg|flac)$/i)) {
      this.importAudioFile(file, sectionId);
    } else {
      ModalDialogs.showAlert('Invalid File', 'Please drop a valid audio file (.wav, .aiff, .mp3).', 'warning');
    }
  }

  bindEvents() {
    // Toolbar buttons
    this.dom.btnNew.onclick = () => this.newProject();
    this.dom.btnOpen.onclick = () => this.dom.projectFileInput.click();
    this.dom.btnSave.onclick = () => this.saveProject();
    this.dom.btnImportAudio.onclick = () => this.dom.audioFileInput.click();
    this.dom.btnUnlinkAudio.onclick = () => this.unlinkAudio();
    this.dom.btnExportSty.onclick = () => this.openExportModal();

    // Menu bar items
    this.dom.menuNewProject.onclick = () => this.newProject();
    this.dom.menuOpenProject.onclick = () => this.dom.projectFileInput.click();
    this.dom.menuSaveProject.onclick = () => this.saveProject();
    this.dom.menuSaveProjectAs.onclick = () => this.saveProjectAs();
    this.dom.menuImportAudio.onclick = () => this.dom.audioFileInput.click();
    this.dom.menuExportStyle.onclick = () => this.openExportModal();
    this.dom.menuExportWav.onclick = () => this.exportCurrentSectionWav();
    this.dom.menuUndo.onclick = () => this.undo();
    this.dom.menuRedo.onclick = () => this.redo();
    this.dom.menuClearSection.onclick = () => this.unlinkAudio();
    this.dom.menuAudioSettings.onclick = () => ModalDialogs.showAudioSettings(this.audioEngine);

    // File input handlers
    this.dom.audioFileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        this.importAudioFile(e.target.files[0]);
        e.target.value = '';
      }
    };

    this.dom.projectFileInput.onchange = async (e) => {
      if (e.target.files && e.target.files[0]) {
        await this.loadProjectFile(e.target.files[0]);
        e.target.value = '';
      }
    };

    // Tempo & Time Signature with real-time live playback update
    const handleTempoChange = () => {
      const val = Math.max(5, Math.min(500, parseInt(this.dom.spinTempo.value, 10) || 120));
      this.project.setMasterTempo(val);
      this.updateTimeStretchBanner();
      if (this.audioEngine.isPlaying) {
        this.audioEngine.updateLiveSettings(this.project.selectedSection, val);
      } else {
        this.audioEngine.clearCache();
      }
      this.scheduleAutoSave();
    };
    this.dom.spinTempo.onchange = handleTempoChange;
    this.dom.spinTempo.oninput = handleTempoChange;

    this.dom.selectTimeSignature.onchange = () => {
      const [num, den] = this.dom.selectTimeSignature.value.split('/').map(Number);
      this.project.setTimeSignature(num, den);
      this.waveformView.render();
      this.updateTimeStretchBanner();
      if (this.audioEngine.isPlaying) {
        this.audioEngine.updateLiveSettings(this.project.selectedSection, this.project.masterTempo);
      } else {
        this.audioEngine.clearCache();
      }
      this.scheduleAutoSave();
    };

    // Zoom buttons
    this.dom.btnZoomIn.onclick = () => {
      this.waveformView.zoomIn();
      this.dom.zoomLevelText.textContent = `${this.waveformView.zoom.toFixed(1)}x`;
    };
    this.dom.btnZoomOut.onclick = () => {
      this.waveformView.zoomOut();
      this.dom.zoomLevelText.textContent = `${this.waveformView.zoom.toFixed(1)}x`;
    };

    // Section Bars & Pickup with real-time live playback update
    const handleBarsChange = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        const bars = Math.max(1, Math.min(32, parseInt(this.dom.spinBars.value, 10) || 1));
        sec.bars = bars;
        this.sectionPanel.updateSectionCard(sec.id, sec);
        this.updateTimeStretchBanner();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        } else {
          this.audioEngine.clearCache();
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };
    this.dom.spinBars.onchange = handleBarsChange;
    this.dom.spinBars.oninput = handleBarsChange;

    const handlePickupChange = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        const pickup = Math.max(0, Math.min(8, parseInt(this.dom.spinPickup.value, 10) || 0));
        sec.pickup = pickup;
        this.updateTimeStretchBanner();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        } else {
          this.audioEngine.clearCache();
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };
    this.dom.spinPickup.onchange = handlePickupChange;
    this.dom.spinPickup.oninput = handlePickupChange;

    // Numeric Trim Inputs with real-time live playback update
    this.dom.trimStart.onchange = () => {
      const sec = this.project.selectedSection;
      if (sec && sec.hasAudio) {
        const maxStart = (sec.trimEnd > 0 ? sec.trimEnd : sec.duration) - 0.05;
        const clamped = Math.max(0, Math.min(maxStart, parseFloat(this.dom.trimStart.value) || 0));
        sec.trimStart = clamped;
        this.dom.trimStart.value = clamped.toFixed(3);
        this.waveformView.invalidateStatic();
        this.waveformView.render();
        this.updateTimeStretchBanner();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.trimEnd.onchange = () => {
      const sec = this.project.selectedSection;
      if (sec && sec.hasAudio) {
        const minEnd = sec.trimStart + 0.05;
        const clamped = Math.max(minEnd, Math.min(sec.duration, parseFloat(this.dom.trimEnd.value) || sec.duration));
        sec.trimEnd = clamped;
        this.dom.trimEnd.value = clamped.toFixed(3);
        this.waveformView.invalidateStatic();
        this.waveformView.render();
        this.updateTimeStretchBanner();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.chkFade.onchange = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.fadeIn = this.dom.chkFade.checked;
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.chkBlank.onchange = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.blank = this.dom.chkBlank.checked;
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    // Beat & Grid tools
    this.dom.btnAutoDetectBeat.onclick = () => {
      const sec = this.project.selectedSection;
      if (!sec || !sec.hasAudio) return;
      const res = BeatDetector.analyze(sec.audioBuffer, {
        defaultTempo: this.project.masterTempo,
        timeSignature: sec.timeSignature,
        bars: sec.bars
      });
      sec.beatPoints = res.beatPoints;
      sec.originalTempo = res.bpm;
      this.waveformView.invalidateStatic();
      this.waveformView.render();
      this.updateTimeStretchBanner();
      this.project.isModified = true;
      this.scheduleAutoSave();
    };

    this.dom.btnBeatHalf.onclick = () => {
      const sec = this.project.selectedSection;
      if (sec && sec.beatPoints) {
        sec.beatPoints = BeatDetector.halfTempo(sec.beatPoints);
        this.waveformView.invalidateStatic();
        this.waveformView.render();
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.btnBeatDouble.onclick = () => {
      const sec = this.project.selectedSection;
      if (sec && sec.beatPoints) {
        sec.beatPoints = BeatDetector.doubleTempo(sec.beatPoints, sec.duration);
        this.waveformView.invalidateStatic();
        this.waveformView.render();
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.btnToggleShiftBeat.onclick = () => {
      const sec = this.project.selectedSection;
      if (sec && sec.beatPoints) {
        sec.beatPoints = BeatDetector.shiftBeatGrid(sec.beatPoints, sec.duration);
        this.waveformView.invalidateStatic();
        this.waveformView.render();
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    // Real-time Mixer sliders
    this.dom.sliderVolume.oninput = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.volume = Math.max(0, Math.min(127, parseInt(this.dom.sliderVolume.value, 10) || 80));
        this.dom.lblVolumeVal.textContent = sec.volume;
        this.audioEngine.setSectionVolume(sec.volume);
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.sliderPan.oninput = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.pan = Math.max(0, Math.min(127, parseInt(this.dom.sliderPan.value, 10) || 64));
        const panStr = sec.pan === 64 ? 'C64' : (sec.pan < 64 ? `L${64 - sec.pan}` : `R${sec.pan - 64}`);
        this.dom.lblPanVal.textContent = panStr;
        this.audioEngine.setSectionPan(sec.pan);
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    this.dom.chkTimeStretch.onchange = () => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.timeStretchEnabled = this.dom.chkTimeStretch.checked;
        this.updateTimeStretchBanner();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };

    // Transport controls
    this.dom.btnPlayLoop.onclick = () => this.togglePlayback();
    this.dom.btnStop.onclick = () => this.stopPlayback();

    // Metronome controls with dynamic live playback toggle
    this.dom.chkClick.onchange = () => {
      const enabled = this.dom.chkClick.checked;
      this.audioEngine.metronome.setEnabled(enabled);
      if (enabled && this.audioEngine.isPlaying) {
        this.audioEngine.startMetronomeScheduler(this.project.selectedSection, this.project.masterTempo);
      } else if (!enabled) {
        this.audioEngine.stopMetronomeScheduler();
      }
    };

    this.dom.sliderMetro.oninput = () => {
      const vol = parseInt(this.dom.sliderMetro.value, 10) / 100.0;
      this.audioEngine.metronome.setVolume(vol);
    };

    // Waveform Drag & Drop handler
    this.dom.waveformBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dom.waveformBox.style.outline = '2px dashed var(--cyan)';
    });

    this.dom.waveformBox.addEventListener('dragleave', () => {
      this.dom.waveformBox.style.outline = 'none';
    });

    this.dom.waveformBox.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dom.waveformBox.style.outline = 'none';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.approj') || file.name.endsWith('.json')) {
          this.loadProjectFile(file);
        } else {
          this.importAudioFile(file);
        }
      }
    });
  }

  setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Isolate shortcuts while modal dialogs are open
      if (document.querySelector('.modal-overlay')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayback();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.stopPlayback();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        this.dom.projectFileInput.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        this.dom.audioFileInput.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        this.openExportModal();
      }
    });
  }

  async togglePlayback() {
    if (this.audioEngine.isPlaying) {
      this.stopPlayback();
    } else {
      const sec = this.project.selectedSection;
      if (!sec || !sec.hasAudio) {
        ModalDialogs.showAlert('No Audio Assigned', 'Please import or drop an audio file onto this section to audition playback.', 'info');
        return;
      }

      try {
        await this.audioEngine.init();
        if (this.audioEngine.ctx && this.audioEngine.ctx.state === 'suspended') {
          await this.audioEngine.ctx.resume();
        }

        this.dom.btnPlayLoop.classList.add('playing');
        this.dom.playIconWrap.innerHTML = PAUSE_ICON_SVG;
        this.dom.playText.textContent = 'Pause';

        const endSec = sec.trimEnd > 0 ? sec.trimEnd : sec.duration;
        const startOffset = (this.waveformView.playheadSec > sec.trimStart && this.waveformView.playheadSec < endSec)
          ? this.waveformView.playheadSec
          : 0;

        await this.audioEngine.playSection(sec, this.project.masterTempo, true, startOffset);
      } catch (err) {
        console.error('Playback error:', err);
        this.stopPlayback();
        ModalDialogs.showAlert('Playback Error', 'Failed to start playback: ' + (err?.message || err), 'error');
      }
    }
  }

  stopPlayback() {
    this.audioEngine.stop();
    this.waveformView.setPlayhead(-1);
    this.dom.btnPlayLoop.classList.remove('playing');
    this.dom.playIconWrap.innerHTML = PLAY_ICON_SVG;
    this.dom.playText.textContent = 'Play Loop';
  }

  async newProject() {
    if (this.project.isModified) {
      const ok = await ModalDialogs.showConfirm('New Project', 'Current project contains unsaved changes. Do you wish to proceed and start fresh?');
      if (!ok) return;
    }
    this.stopPlayback();
    this.project = new AudioPhraserProject();
    await SessionStorageManager.clearSession();
    this.sectionPanel.render(this.project);
    this.selectSection('main_a');
    this.updateUI();
    this.setSessionStatus('New Project', false);
  }

  async loadProjectFile(file) {
    try {
      await this.audioEngine.init();
      await ApprojIO.importProject(file, this.project, this.audioEngine.ctx);
      this.sectionPanel.render(this.project);
      this.selectSection(this.project.selectedSectionId);
      this.updateUI();
      this.scheduleAutoSave();
      RecentProjectsManager.addProject(this.project);
      this.renderRecentProjects();
      ModalDialogs.showAlert('Project Loaded', `Successfully loaded project: ${this.project.name}`, 'info');
    } catch (err) {
      console.error('Load project error:', err);
      ModalDialogs.showAlert('Load Error', 'Failed to load .approj file: ' + err.message, 'error');
    }
  }

  async saveProject() {
    const blob = await ApprojIO.exportProject(this.project, true);
    const fileName = `${this.project.name.replace(/\.[^/.]+$/, '')}.approj`;
    this.downloadBlob(blob, fileName);
    this.project.isModified = false;
    this.setSessionStatus('Exported to file', false);
    RecentProjectsManager.addProject(this.project);
    this.renderRecentProjects();
  }

  renderRecentProjects() {
    const menuEl = this.dom.recentProjectsMenu;
    if (!menuEl) return;

    const recents = RecentProjectsManager.getRecents();
    if (recents.length === 0) {
      menuEl.innerHTML = `<div class="empty-recent">No recent projects</div>`;
      return;
    }

    menuEl.innerHTML = '';
    for (const item of recents) {
      const itemEl = document.createElement('div');
      itemEl.className = 'recent-project-entry';
      const dateStr = item.savedAt ? new Date(item.savedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      itemEl.innerHTML = `
        <span class="recent-project-title">${item.name || 'Untitled'}</span>
        <span class="recent-project-meta">
          <span class="highlight">${item.masterTempo} BPM</span> · <span>${item.activeSectionCount || 0} loops</span> · <span>${dateStr}</span>
        </span>
      `;
      itemEl.onclick = async (e) => {
        e.stopPropagation();
        await this.loadRecentProject(item);
      };
      menuEl.appendChild(itemEl);
    }

    const clearBtn = document.createElement('div');
    clearBtn.className = 'dropdown-item clear-recents-btn';
    clearBtn.innerHTML = `
      <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Clear Recents
    `;
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      RecentProjectsManager.clearRecents();
      this.renderRecentProjects();
    };
    menuEl.appendChild(clearBtn);
  }

  async loadRecentProject(recentEntry) {
    if (this.project.isModified) {
      const ok = await ModalDialogs.showConfirm('Load Recent Project', `Current project contains unsaved changes. Discard and load "${recentEntry.name}"?`);
      if (!ok) return;
    }
    this.stopPlayback();
    this.audioEngine.clearCache();
    if (recentEntry.data) {
      this.project.restoreState(recentEntry.data);
      this.sectionPanel.render(this.project);
      this.selectSection(this.project.selectedSectionId || 'main_a');
      this.updateUI();
      this.scheduleAutoSave();
    }
  }

  async saveProjectAs() {
    const fn = prompt('Enter project file name:', `${this.project.name}.approj`);
    if (fn) {
      this.project.name = fn.replace(/\.approj$/i, '');
      await this.saveProject();
    }
  }

  unlinkAudio() {
    const sec = this.project.selectedSection;
    if (sec && sec.hasAudio) {
      this.stopPlayback();
      this.project.unlinkAudioFromSection(sec.id);
      this.sectionPanel.render(this.project);
      this.selectSection(sec.id);
      this.updateUI();
      this.scheduleAutoSave();
    }
  }

  undo() {
    if (this.project.undo()) {
      this.sectionPanel.render(this.project);
      this.selectSection(this.project.selectedSectionId);
      this.updateUI();
      this.scheduleAutoSave();
    }
  }

  redo() {
    if (this.project.redo()) {
      this.sectionPanel.render(this.project);
      this.selectSection(this.project.selectedSectionId);
      this.updateUI();
      this.scheduleAutoSave();
    }
  }

  openExportModal() {
    ModalDialogs.showExportDialog(this.project, async (fileName) => {
      if (!this.emptyStyBuffer) {
        await this.loadEmptyStyTemplate();
      }
      if (!this.emptyStyBuffer) {
        throw new Error('Could not load base Empty.sty template.');
      }

      const blob = await AusWriter.exportToAus(this.project, this.emptyStyBuffer);
      this.downloadBlob(blob, fileName);
      ModalDialogs.showAlert('Export Complete', `Successfully exported Yamaha Audio Style: ${fileName}`, 'info');
    });
  }

  exportCurrentSectionWav() {
    const sec = this.project.selectedSection;
    if (!sec || !sec.hasAudio) {
      ModalDialogs.showAlert('No Audio', 'Please select a section with assigned audio to export.', 'warning');
      return;
    }
    const trimmed = this.audioEngine.sliceBuffer(sec.audioBuffer, sec.trimStart, sec.trimEnd > 0 ? sec.trimEnd : sec.duration, sec.fadeIn);
    const wavBytes = WavEncoder.encode(trimmed, 44100, false);
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    this.downloadBlob(blob, `${sec.name}_trimmed.wav`);
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }

  updateUI() {
    this.dom.spinTempo.value = this.project.masterTempo;
    this.dom.selectTimeSignature.value = `${this.project.timeSignature.numerator}/${this.project.timeSignature.denominator}`;
    this.updateTimeStretchBanner();
  }
}

// Start app on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new AudioPhraserApp();
  app.init();
  window.audioPhraserApp = app;
});
