/**
 * Audio Style Slicer (Audio Phraser Web Version) - Application Main Controller
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
import { AudioConverter } from './audio/audio-converter.js';
import { KeyboardManager } from './model/keyboard-profiles.js';

// SVG Vector Icon Templates
const PLAY_ICON_SVG = `<svg class="transport-icon" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const PAUSE_ICON_SVG = `<svg class="transport-icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

class AudioPhraserApp {
  constructor() {
    this.project = new AudioPhraserProject();
    this.audioEngine = new AudioEngine();
    this.emptyStyBuffer = null;
    this.currentFileHandle = null;

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
    this.setupInspectorResizer();
    this.bindEvents();
    this.setupShortcuts();
    this.setupScrollableInputs();
    this.renderRecentProjects();

    // Load Empty.sty template in background
    await this.loadEmptyStyTemplate();

    // Check for prior unsaved session in IndexedDB
    await this.checkAndPromptSessionRestore();

    // Restore preferred target keyboard from localStorage
    const savedKeyboard = localStorage.getItem('audio_phraser_target_keyboard');
    if (savedKeyboard) {
      this.project.setTargetKeyboard(savedKeyboard);
    }
    if (this.dom.selectTargetKeyboard) {
      this.dom.selectTargetKeyboard.value = this.project.targetKeyboard || 'psr_sx920';
    }
    if (this.dom.selectKeyboardDisplay) {
      const profile = KeyboardManager.getProfile(this.project.targetKeyboard || 'psr_sx920');
      this.dom.selectKeyboardDisplay.textContent = profile.name;
    }

    // Initial render
    this.selectSection(this.project.selectedSectionId || 'main_a');
    this.updateUI();
    this.updateKeyboardPlayability();
  }

  bindDomElements() {
    const ids = [
      'waveformCanvas', 'waveformBox', 'sectionPanel',
      'btnNew', 'btnOpen', 'btnSave', 'btnUndo', 'btnRedo', 'btnImportAudio', 'btnUnlinkAudio',
      'spinTempo', 'selectTimeSignature', 'btnExportSty',
      'selectTargetKeyboard', 'selectKeyboardDisplay', 'styleSizeBox', 'lblStyleSize', 'lblStyleLimit', 'styleSizeBarFill', 'badgeStylePlayable',
      'conversionToast',
      'btnZoomIn', 'btnZoomOut', 'zoomLevelText', 'timeStretchBanner',
      'valSecLen', 'valSecBars', 'valWaveLen', 'valTrimRange', 'valStretchPct', 'pillStretchStatus',
      'panelResizer', 'controlsPanel', 'btnToggleInspector', 'btnExpandInspector',
      'lblAssignedFile', 'lblAudioDuration', 'lblAudioChannels',
      'spinBars', 'spinPickup', 'trimStart', 'trimEnd', 'chkFade', 'chkBlank',
      'btnHelpTrimming', 'btnHelpBeatGrid',
      'btnAutoDetectBeat', 'btnBeatHalf', 'btnBeatDouble', 'btnToggleShiftBeat',
      'sliderVolume', 'lblVolumeVal', 'sliderPan', 'lblPanVal', 'chkTimeStretch',
      'btnPlayLoop', 'btnStop', 'playIconWrap', 'playText',
      'chkClick', 'sliderMetro', 'lblActiveSectionName',
      'sessionDot', 'sessionStatus',
      'audioFileInput', 'projectFileInput',
      'menuNewProject', 'menuOpenProject', 'menuRecents', 'recentProjectsMenu',
      'menuSaveProject', 'menuSaveProjectAs',
      'menuImportAudio', 'menuExportStyle', 'menuExportWav',
      'menuAudioSettings'
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

    this.waveformView.onZoomChanged = (zoom) => {
      if (this.dom.zoomLevelText) {
        this.dom.zoomLevelText.textContent = `${zoom.toFixed(1)}x`;
      }
    };

    this.waveformView.onTrimChanged = (start, end) => {
      const sec = this.project.selectedSection;
      if (sec) {
        sec.trimStart = start;
        sec.trimEnd = end;
        this.dom.trimStart.value = start.toFixed(3);
        this.dom.trimEnd.value = end.toFixed(3);
        this.updateTimeStretchBanner();
        this.updateKeyboardPlayability();
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
      let chanStr = `${sec.audioBuffer.numberOfChannels === 2 ? 'Stereo' : 'Mono'} 44.1 kHz · 16-bit PCM`;
      if (sec.audioFormatInfo && sec.audioFormatInfo.wasConverted) {
        const origDesc = sec.audioFormatInfo.originalFormat || 'Audio';
        const origSr = sec.audioFormatInfo.originalSampleRate ? ` ${sec.audioFormatInfo.originalSampleRate}Hz` : '';
        chanStr += ` (Converted from ${origDesc}${origSr})`;
      }
      this.dom.lblAudioChannels.textContent = chanStr;
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
    const targetTempo = this.project.masterTempo || 120;
    const secBars = sec ? sec.bars : 2;
    const barText = `${secBars} ${secBars === 1 ? 'Bar' : 'Bars'}`;

    if (!sec || !sec.hasAudio) {
      const secLen = sec ? sec.getSectionExpectedDuration(targetTempo) : 0;
      if (this.dom.valSecLen) this.dom.valSecLen.textContent = `${secLen.toFixed(3)}s`;
      if (this.dom.valSecBars) this.dom.valSecBars.textContent = barText;
      if (this.dom.valWaveLen) this.dom.valWaveLen.textContent = '0.000s';
      if (this.dom.valTrimRange) this.dom.valTrimRange.textContent = 'No Audio';
      if (this.dom.valStretchPct) {
        this.dom.valStretchPct.textContent = '100.00%';
        this.dom.valStretchPct.className = 'telemetry-chip-val';
      }
      if (this.dom.pillStretchStatus) {
        this.dom.pillStretchStatus.textContent = 'IDLE';
        this.dom.pillStretchStatus.className = 'telemetry-status-badge status-off';
      }
      return;
    }

    const secLen = sec.getSectionExpectedDuration(targetTempo);
    const waveLen = sec.trimmedDuration;
    const ratio = sec.getTimeStretchRatio(targetTempo);

    if (this.dom.valSecLen) this.dom.valSecLen.textContent = `${secLen.toFixed(3)}s`;
    if (this.dom.valSecBars) this.dom.valSecBars.textContent = barText;
    if (this.dom.valWaveLen) this.dom.valWaveLen.textContent = `${waveLen.toFixed(3)}s`;

    if (this.dom.valTrimRange) {
      if (sec.trimStart === 0 && Math.abs(sec.trimEnd - sec.duration) < 0.002) {
        this.dom.valTrimRange.textContent = 'Full Wave';
      } else {
        this.dom.valTrimRange.textContent = `${sec.trimStart.toFixed(2)}–${sec.trimEnd.toFixed(2)}s`;
      }
    }

    if (this.dom.valStretchPct) {
      this.dom.valStretchPct.textContent = `${ratio.toFixed(2)}%`;
    }

    if (this.dom.pillStretchStatus) {
      if (!sec.timeStretchEnabled) {
        this.dom.pillStretchStatus.textContent = 'STRETCH OFF';
        this.dom.pillStretchStatus.className = 'telemetry-status-badge status-off';
        if (this.dom.valStretchPct) this.dom.valStretchPct.className = 'telemetry-chip-val';
      } else if (Math.abs(ratio - 100.0) < 0.5) {
        this.dom.pillStretchStatus.textContent = '1:1 MATCH';
        this.dom.pillStretchStatus.className = 'telemetry-status-badge status-good';
        if (this.dom.valStretchPct) this.dom.valStretchPct.className = 'telemetry-chip-val val-green';
      } else if (ratio >= 80.0 && ratio <= 125.0) {
        this.dom.pillStretchStatus.textContent = ratio > 100 ? 'STRETCH' : 'COMPRESS';
        this.dom.pillStretchStatus.className = 'telemetry-status-badge status-good';
        if (this.dom.valStretchPct) this.dom.valStretchPct.className = 'telemetry-chip-val val-green';
      } else if (ratio >= 65.0 && ratio <= 150.0) {
        this.dom.pillStretchStatus.textContent = 'MODERATE';
        this.dom.pillStretchStatus.className = 'telemetry-status-badge status-warn';
        if (this.dom.valStretchPct) this.dom.valStretchPct.className = 'telemetry-chip-val';
      } else {
        this.dom.pillStretchStatus.textContent = 'EXTREME';
        this.dom.pillStretchStatus.className = 'telemetry-status-badge status-alert';
        if (this.dom.valStretchPct) this.dom.valStretchPct.className = 'telemetry-chip-val val-red';
      }
    }
  }

  async importAudioFile(file, targetSectionId = null) {
    await this.audioEngine.init();

    try {
      const conversion = await AudioConverter.convert(file, this.audioEngine.ctx);
      const audioBuffer = conversion.audioBuffer;

      const secId = targetSectionId || this.project.selectedSectionId;
      this.project.assignAudioToSection(secId, file.name, audioBuffer, {
        originalFormat: conversion.originalFormat,
        originalSampleRate: conversion.originalSampleRate,
        originalBitDepth: conversion.originalBitDepth,
        originalChannels: conversion.originalChannels,
        wasConverted: conversion.wasConverted,
        summary: conversion.summary
      });

      const sec = this.project.sections.get(secId);

      // Run automatic beat & onset detection on the converted 44.1kHz 16-bit audio
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
      this.updateKeyboardPlayability();
      this.scheduleAutoSave();
      RecentProjectsManager.addProject(this.project);
      this.renderRecentProjects();

      // Show toast notification if conversion/resampling occurred
      if (conversion.wasConverted) {
        this.showToast(conversion.summary);
      }
    } catch (err) {
      console.error('Audio import failed:', err);
      ModalDialogs.showAlert('Audio Import Error', 'Failed to decode or convert audio file: ' + (err?.message || err), 'error');
    }
  }

  handleFileDropOnSection(sectionId, file) {
    if (file.name.match(/\.(wav|aif|aiff|mp3|ogg|flac|m4a|aac)$/i)) {
      this.importAudioFile(file, sectionId);
    } else {
      ModalDialogs.showAlert('Invalid File', 'Please drop a valid audio file (.mp3, .wav, .aiff, .ogg, .flac).', 'warning');
    }
  }

  bindEvents() {
    // Toolbar buttons
    if (this.dom.btnNew) this.dom.btnNew.onclick = () => this.newProject();
    if (this.dom.btnOpen) this.dom.btnOpen.onclick = () => this.dom.projectFileInput.click();
    if (this.dom.btnSave) this.dom.btnSave.onclick = () => this.saveProject();
    if (this.dom.btnUndo) this.dom.btnUndo.onclick = () => this.undo();
    if (this.dom.btnRedo) this.dom.btnRedo.onclick = () => this.redo();
    if (this.dom.btnImportAudio) this.dom.btnImportAudio.onclick = () => this.dom.audioFileInput.click();
    if (this.dom.btnUnlinkAudio) this.dom.btnUnlinkAudio.onclick = () => this.unlinkAudio();
    if (this.dom.btnExportSty) this.dom.btnExportSty.onclick = () => this.openExportModal();

    // Target Keyboard selection listener
    if (this.dom.selectTargetKeyboard) {
      this.dom.selectTargetKeyboard.onchange = () => {
        const val = this.dom.selectTargetKeyboard.value;
        this.project.setTargetKeyboard(val);
        localStorage.setItem('audio_phraser_target_keyboard', val);
        this.updateKeyboardPlayability();
        this.scheduleAutoSave();
      };
    }

    // Menu bar items
    this.dom.menuNewProject.onclick = () => this.newProject();
    this.dom.menuOpenProject.onclick = () => this.dom.projectFileInput.click();
    this.dom.menuSaveProject.onclick = () => this.saveProject();
    this.dom.menuSaveProjectAs.onclick = () => this.saveProjectAs();
    this.dom.menuImportAudio.onclick = () => this.dom.audioFileInput.click();
    this.dom.menuExportStyle.onclick = () => this.openExportModal();
    this.dom.menuExportWav.onclick = () => this.exportCurrentSectionWav();
    if (this.dom.menuUndo) this.dom.menuUndo.onclick = () => this.undo();
    if (this.dom.menuRedo) this.dom.menuRedo.onclick = () => this.redo();
    if (this.dom.menuClearSection) this.dom.menuClearSection.onclick = () => this.unlinkAudio();
    if (this.dom.menuAudioSettings) this.dom.menuAudioSettings.onclick = () => ModalDialogs.showAudioSettings(this.audioEngine);

    // Inspector toggle & help buttons
    if (this.dom.btnToggleInspector) this.dom.btnToggleInspector.onclick = () => this.toggleInspector();
    if (this.dom.btnExpandInspector) this.dom.btnExpandInspector.onclick = () => this.toggleInspector(true);
    if (this.dom.btnHelpTrimming) this.dom.btnHelpTrimming.onclick = () => ModalDialogs.showHelpGuide('trimming');
    if (this.dom.btnHelpBeatGrid) this.dom.btnHelpBeatGrid.onclick = () => ModalDialogs.showHelpGuide('beatgrid');

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
        this.updateKeyboardPlayability();
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
        this.updateKeyboardPlayability();
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
        this.updateKeyboardPlayability();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        } else {
          this.audioEngine.clearCache();
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };
    this.dom.trimStart.oninput = this.dom.trimStart.onchange;

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
        this.updateKeyboardPlayability();
        if (this.audioEngine.isPlaying) {
          this.audioEngine.updateLiveSettings(sec, this.project.masterTempo);
        } else {
          this.audioEngine.clearCache();
        }
        this.project.isModified = true;
        this.scheduleAutoSave();
      }
    };
    this.dom.trimEnd.oninput = this.dom.trimEnd.onchange;

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
        this.updateKeyboardPlayability();
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
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        this.toggleInspector();
      }
    });
  }

  /**
   * Enables mouse wheel scrolling over all number inputs, sliders, and controls.
   * Scrolling up increases value; scrolling down decreases value.
   * Shift = coarse step (5x / 50ms); Ctrl/Alt = fine step (1ms).
   */
  setupScrollableInputs() {
    let wheelAccum = 0;
    let lastTarget = null;
    let resetTimer = null;

    window.addEventListener('wheel', (e) => {
      // Isolate while modal dialogs are open or when mouse is inside waveform canvas
      if (document.querySelector('.modal-overlay')) return;
      if (e.target.closest('#waveformCanvas, #waveformBox')) return;

      // Check if mouse is hovering over zoom controls
      const zoomControl = e.target.closest('.zoom-controls');
      if (zoomControl) {
        e.preventDefault();
        if (e.deltaY < 0) {
          this.waveformView.zoomIn();
        } else if (e.deltaY > 0) {
          this.waveformView.zoomOut();
        }
        this.dom.zoomLevelText.textContent = `${this.waveformView.zoom.toFixed(1)}x`;
        return;
      }

      // Find if mouse is over an input[type="number"], input[type="range"], or select
      let input = null;
      if (e.target.matches('input[type="number"], input[type="range"], select')) {
        input = e.target;
      } else {
        const container = e.target.closest('.control-row, .tempo-control-box, .metro-toggle, .metronome-controls');
        if (container) {
          input = container.querySelector('input[type="number"], input[type="range"], select');
        }
      }

      if (!input || input.disabled || input.readOnly) return;

      // Prevent whole page / panel scrolling while mouse is over the control
      e.preventDefault();

      if (lastTarget !== input) {
        wheelAccum = 0;
        lastTarget = input;
      }

      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        wheelAccum = 0;
      }, 200);

      // Accumulate wheel delta (supports mouse wheel clicks and smooth trackpads)
      wheelAccum += e.deltaY;
      const threshold = 35; // Sensitivity threshold in pixels

      if (Math.abs(wheelAccum) < threshold) {
        return;
      }

      const direction = wheelAccum < 0 ? 1 : -1;
      wheelAccum = 0; // Reset accumulator on each step

      // Special handling for <select>
      if (input.tagName === 'SELECT') {
        const newIdx = input.selectedIndex + (direction > 0 ? -1 : 1);
        if (newIdx >= 0 && newIdx < input.options.length && newIdx !== input.selectedIndex) {
          input.selectedIndex = newIdx;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      const isShift = e.shiftKey;
      const isAltOrCtrl = e.altKey || e.ctrlKey || e.metaKey;

      let min = input.min !== '' ? parseFloat(input.min) : -Infinity;
      let max = input.max !== '' ? parseFloat(input.max) : Infinity;
      let currentVal = parseFloat(input.value);
      if (!Number.isFinite(currentVal)) currentVal = 0;

      let step = 1;
      let decimals = 0;

      if (input.id === 'trimStart' || input.id === 'trimEnd') {
        decimals = 3;
        if (isAltOrCtrl) {
          step = 0.001; // fine 1ms
        } else if (isShift) {
          step = 0.050; // coarse 50ms
        } else {
          step = 0.010; // normal 10ms
        }
      } else if (input.id === 'spinTempo') {
        decimals = 0;
        step = isShift ? 5 : 1;
      } else if (input.id === 'spinBars' || input.id === 'spinPickup') {
        decimals = 0;
        step = 1;
      } else if (input.type === 'range') {
        decimals = 0;
        step = isShift ? 5 : 1;
      } else {
        const attrStep = parseFloat(input.step);
        if (Number.isFinite(attrStep) && attrStep > 0) {
          step = attrStep;
          const stepStr = String(input.step);
          decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
        } else {
          step = 1;
          decimals = 0;
        }
      }

      let newVal = currentVal + direction * step;
      newVal = Math.max(min, Math.min(max, newVal));

      if (decimals > 0) {
        newVal = parseFloat(newVal.toFixed(decimals));
      } else {
        newVal = Math.round(newVal);
      }

      if (newVal !== currentVal) {
        input.value = decimals > 0 ? newVal.toFixed(decimals) : String(newVal);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { passive: false });
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
    this.currentFileHandle = null;
    this.project = new AudioPhraserProject();
    await SessionStorageManager.clearSession();
    this.sectionPanel.render(this.project);
    this.selectSection('main_a');
    this.updateUI();
    this.setSessionStatus('New Project', false);
  }

  async loadProjectFile(file) {
    try {
      this.currentFileHandle = null;
      await this.audioEngine.init();
      await ApprojIO.importProject(file, this.project, this.audioEngine.ctx);
      if (this.dom.selectTargetKeyboard) {
        this.dom.selectTargetKeyboard.value = this.project.targetKeyboard || 'psr_sx920';
      }
      if (this.dom.selectKeyboardDisplay) {
        const profile = KeyboardManager.getProfile(this.project.targetKeyboard || 'psr_sx920');
        this.dom.selectKeyboardDisplay.textContent = profile.name;
      }
      this.sectionPanel.render(this.project);
      this.selectSection(this.project.selectedSectionId);
      this.updateUI();
      this.updateKeyboardPlayability();
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
    try {
      const blob = await ApprojIO.exportProject(this.project, true);
      const baseName = (this.project.name || 'Untitled').replace(/\.[^/.]+$/, '');
      const fileName = `${baseName}.approj`;

      // If user has an active file handle from previous save, write directly
      if (this.currentFileHandle) {
        try {
          const writable = await this.currentFileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          this.project.isModified = false;
          this.setSessionStatus('Saved', false);
          this.updateUndoRedoButtons();
          RecentProjectsManager.addProject(this.project);
          this.renderRecentProjects();
          return;
        } catch (handleErr) {
          console.warn('Could not write to cached file handle, opening file picker:', handleErr);
          this.currentFileHandle = null;
        }
      }

      // Open native OS Explorer File Save Dialog (Chromium File System Access API)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Audio Style Slicer Project (*.approj)',
              accept: { 'application/octet-stream': ['.approj'], 'application/zip': ['.approj'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          this.currentFileHandle = handle;
          const chosenName = handle.name.replace(/\.approj$/i, '');
          if (chosenName) {
            this.project.name = chosenName;
            const titleEl = document.getElementById('titlebarTitle');
            if (titleEl) titleEl.textContent = `${chosenName} — Audio Style Slicer`;
          }
          this.project.isModified = false;
          this.setSessionStatus('Saved', false);
          this.updateUndoRedoButtons();
          RecentProjectsManager.addProject(this.project);
          this.renderRecentProjects();
          return;
        } catch (err) {
          if (err.name === 'AbortError') {
            // User cancelled Explorer save dialog - do not force browser download
            return;
          }
          console.warn('showSaveFilePicker failed, falling back to download:', err);
        }
      }

      // Fallback for browsers that do not support showSaveFilePicker
      this.downloadBlob(blob, fileName);
      this.project.isModified = false;
      this.setSessionStatus('Exported to file', false);
      this.updateUndoRedoButtons();
      RecentProjectsManager.addProject(this.project);
      this.renderRecentProjects();
    } catch (err) {
      console.error('Save project error:', err);
      ModalDialogs.showAlert('Save Error', 'Failed to save project: ' + err.message, 'error');
    }
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
    this.currentFileHandle = null;
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
    this.currentFileHandle = null;
    await this.saveProject();
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

  updateUndoRedoButtons() {
    if (this.dom.btnUndo) {
      this.dom.btnUndo.disabled = !this.project.canUndo;
    }
    if (this.dom.btnRedo) {
      this.dom.btnRedo.disabled = !this.project.canRedo;
    }
  }

  setupInspectorResizer() {
    const resizer = this.dom.panelResizer;
    const panel = this.dom.controlsPanel;
    if (!resizer || !panel) return;

    // Load persisted inspector width and collapsed state
    const savedWidth = localStorage.getItem('audioPhraser_inspectorWidth');
    if (savedWidth) {
      const w = parseInt(savedWidth, 10);
      if (w >= 220 && w <= 550) {
        panel.style.width = `${w}px`;
        panel.style.minWidth = `${w}px`;
      }
    }

    const isCollapsed = localStorage.getItem('audioPhraser_inspectorCollapsed') === 'true';
    if (isCollapsed) {
      this.toggleInspector(false, true);
    }

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const newWidth = Math.max(220, Math.min(550, startWidth + dx));
      panel.style.width = `${newWidth}px`;
      panel.style.minWidth = `${newWidth}px`;
      if (this.waveformView) this.waveformView.resize();
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      panel.classList.remove('resizing-active');
      resizer.classList.remove('resizing');
      document.body.classList.remove('panel-resizing');
      try { resizer.releasePointerCapture(e.pointerId); } catch (_) { }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const finalWidth = parseInt(panel.style.width, 10);
      if (finalWidth) {
        localStorage.setItem('audioPhraser_inspectorWidth', finalWidth);
      }
      if (this.waveformView) this.waveformView.resize();
    };

    resizer.addEventListener('pointerdown', (e) => {
      if (panel.classList.contains('collapsed')) return;
      isDragging = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      panel.classList.add('resizing-active');
      resizer.classList.add('resizing');
      document.body.classList.add('panel-resizing');
      try { resizer.setPointerCapture(e.pointerId); } catch (_) { }
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      e.preventDefault();
    });

    resizer.addEventListener('dblclick', () => {
      panel.style.width = '320px';
      panel.style.minWidth = '320px';
      localStorage.setItem('audioPhraser_inspectorWidth', 320);
      if (this.waveformView) this.waveformView.resize();
    });
  }

  toggleInspector(forceOpen = false, silent = false) {
    const panel = this.dom.controlsPanel;
    const resizer = this.dom.panelResizer;
    const expandBtn = this.dom.btnExpandInspector;
    if (!panel) return;

    const isCurrentlyCollapsed = panel.classList.contains('collapsed');
    const shouldCollapse = forceOpen ? false : !isCurrentlyCollapsed;

    if (shouldCollapse) {
      panel.classList.add('collapsed');
      if (resizer) resizer.classList.add('collapsed');
      if (expandBtn) expandBtn.style.display = 'flex';
      localStorage.setItem('audioPhraser_inspectorCollapsed', 'true');
    } else {
      panel.classList.remove('collapsed');
      if (resizer) resizer.classList.remove('collapsed');
      if (expandBtn) expandBtn.style.display = 'none';
      localStorage.setItem('audioPhraser_inspectorCollapsed', 'false');
      const savedWidth = localStorage.getItem('audioPhraser_inspectorWidth') || 320;
      panel.style.width = `${savedWidth}px`;
      panel.style.minWidth = `${savedWidth}px`;
    }

    if (!silent && this.waveformView) {
      setTimeout(() => this.waveformView.resize(), 160);
    }
  }

  openExportModal() {
    ModalDialogs.showExportDialog(
      this.project,
      async (fileName, targetKbId) => {
        if (!this.emptyStyBuffer) {
          await this.loadEmptyStyTemplate();
        }
        if (!this.emptyStyBuffer) {
          throw new Error('Could not load base Empty.sty template.');
        }

        const blob = await AusWriter.exportToAus(this.project, this.emptyStyBuffer, { targetKeyboard: targetKbId });
        this.downloadBlob(blob, fileName);
        ModalDialogs.showAlert('Export Complete', `Successfully exported Yamaha Audio Style: ${fileName}`, 'info');
      },
      (newKbId) => {
        if (this.dom.selectTargetKeyboard) {
          this.dom.selectTargetKeyboard.value = newKbId;
        }
        if (this.dom.selectKeyboardDisplay) {
          const profile = KeyboardManager.getProfile(newKbId);
          this.dom.selectKeyboardDisplay.textContent = profile.name;
        }
        localStorage.setItem('audio_phraser_target_keyboard', newKbId);
        this.updateKeyboardPlayability();
      }
    );
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

  /**
   * Update live Yamaha Target Keyboard playability monitor and memory meter in workspace toolbar.
   */
  updateKeyboardPlayability() {
    const kbId = this.project.targetKeyboard || 'psr_sx920';
    const validation = KeyboardManager.validateExport(this.project, kbId, this.emptyStyBuffer?.byteLength || 13500);

    if (this.dom.selectKeyboardDisplay) {
      this.dom.selectKeyboardDisplay.textContent = validation.keyboard.name;
    }

    if (this.dom.lblStyleSize) {
      this.dom.lblStyleSize.textContent = `${validation.estimatedMB.toFixed(1)} MB`;
    }
    if (this.dom.lblStyleLimit) {
      this.dom.lblStyleLimit.textContent = `${validation.maxMB.toFixed(0)} MB`;
    }
    if (this.dom.styleSizeBarFill) {
      const clampedPct = Math.min(100, validation.percentOfLimit);
      this.dom.styleSizeBarFill.style.width = `${clampedPct}%`;
      if (validation.isBlocked) {
        this.dom.styleSizeBarFill.style.backgroundColor = 'var(--red)';
      } else if (validation.isWarning) {
        this.dom.styleSizeBarFill.style.backgroundColor = 'var(--amber)';
      } else {
        this.dom.styleSizeBarFill.style.backgroundColor = 'var(--green)';
      }
    }
    if (this.dom.badgeStylePlayable) {
      if (validation.isBlocked) {
        this.dom.badgeStylePlayable.className = 'style-playability-badge badge-danger';
        this.dom.badgeStylePlayable.textContent = 'EXCEEDS LIMIT';
        this.dom.badgeStylePlayable.title = `Total size (${validation.estimatedMB.toFixed(1)} MB) exceeds ${validation.keyboard.name} limit (${validation.maxMB.toFixed(0)} MB). Export is blocked.`;
      } else if (validation.isWarning) {
        this.dom.badgeStylePlayable.className = 'style-playability-badge badge-warn';
        this.dom.badgeStylePlayable.textContent = 'NEAR LIMIT';
        this.dom.badgeStylePlayable.title = `Size is approaching ${validation.keyboard.name} limit (${validation.percentOfLimit}%).`;
      } else {
        this.dom.badgeStylePlayable.className = 'style-playability-badge badge-safe';
        this.dom.badgeStylePlayable.textContent = 'READY';
        this.dom.badgeStylePlayable.title = `Playable on ${validation.keyboard.name} (${validation.percentOfLimit}% of limit).`;
      }
    }
    if (this.dom.btnExportSty) {
      if (validation.isBlocked) {
        this.dom.btnExportSty.classList.add('btn-export-blocked');
        this.dom.btnExportSty.title = `Export blocked: Exceeds ${validation.keyboard.name} playability limit.`;
      } else {
        this.dom.btnExportSty.classList.remove('btn-export-blocked');
        this.dom.btnExportSty.title = `Export as Yamaha Audio Style (.aus) for ${validation.keyboard.name}`;
      }
    }
  }

  /**
   * Display non-intrusive conversion toast feedback.
   */
  showToast(message, duration = 4000) {
    if (!this.dom.conversionToast) return;
    this.dom.conversionToast.innerHTML = `
      <svg class="conversion-toast-icon" viewBox="0 0 24 24">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
      </svg>
      <span>${message}</span>
    `;
    this.dom.conversionToast.classList.add('visible');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.dom.conversionToast.classList.remove('visible');
    }, duration);
  }

  updateUI() {
    this.dom.spinTempo.value = this.project.masterTempo;
    this.dom.selectTimeSignature.value = `${this.project.timeSignature.numerator}/${this.project.timeSignature.denominator}`;
    this.updateTimeStretchBanner();
    this.updateUndoRedoButtons();
    this.updateKeyboardPlayability();
  }
}

// Start app on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new AudioPhraserApp();
  app.init();
  window.audioPhraserApp = app;
});
