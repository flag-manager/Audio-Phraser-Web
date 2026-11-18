/**
 * Yamaha Audio Phraser - Modal Dialogs
 * Styled with StyleCraft Studio design language and crisp SVG vector icons.
 * Features keyboard accessibility (Escape to dismiss, backdrop click dismiss).
 */

import { KeyboardManager } from '../model/keyboard-profiles.js';

export class ModalDialogs {
  /**
   * Helper to bind backdrop click and Escape key dismissal
   */
  static bindModalDismiss(modal, closeFn) {
    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeFn();
      }
    });

    // Escape key
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        window.removeEventListener('keydown', onKey);
        closeFn();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }

  /**
   * Display alert modal dialog with crisp SVG vector icons.
   */
  static showAlert(title, message, iconType = 'info') {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';

      let iconSvg = '';
      if (iconType === 'error') {
        iconSvg = `<svg class="modal-icon error" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
      } else if (iconType === 'warning') {
        iconSvg = `<svg class="modal-icon warning" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      } else {
        iconSvg = `<svg class="modal-icon info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
      }

      modal.innerHTML = `
        <div class="modal-box alert-box">
          <div class="modal-header">
            <span class="modal-title">${title}</span>
            <button class="modal-close-btn" aria-label="Close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            ${iconSvg}
            <div class="alert-message">${message}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary btn-ok">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      let cleanKey = null;
      const close = () => {
        if (cleanKey) cleanKey();
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 150);
        resolve(true);
      };

      cleanKey = this.bindModalDismiss(modal, close);
      modal.querySelector('.btn-ok').onclick = close;
      modal.querySelector('.modal-close-btn').onclick = close;
    });
  }

  /**
   * Display interactive Help Guide modal with structured documentation.
   */
  static showHelpGuide(topic) {
    let title = 'Help Guide';
    let contentHtml = '';

    if (topic === 'trimming') {
      title = 'Waveform Trimming & Optimization';
      contentHtml = `
        <div class="help-guide-modal-content">
          <div class="help-guide-section">
            <div class="help-section-title">
              <span class="help-tag green">FEATURE</span>
              Anti-Click Fade (5ms Micro-Fade)
            </div>
            <p class="help-section-text">
              When audio is sliced or looped at non-zero crossing points, instantaneous voltage steps produce high-frequency clicks and pops. <strong>Anti-Click Fade</strong> applies a smooth 5-millisecond raised micro-fade at the loop start and end boundaries.
            </p>
            <div class="help-tip-box">
              <strong>Tip:</strong> Always keep this enabled for seamless drum and percussion loops to prevent audible clicks during continuous loop playback on Yamaha keyboards (Genos, Tyros, PSR-SX).
            </div>
          </div>

          <div class="help-guide-section">
            <div class="help-section-title">
              <span class="help-tag cyan">FEATURE</span>
              Blank (Silent Style Section)
            </div>
            <p class="help-section-text">
              Yamaha SFF2 Style architecture requires defined accompaniment sections. Checking <strong>Blank</strong> exports an empty, silent section with proper bar and timing markers.
            </p>
            <div class="help-tip-box">
              <strong>Use Case:</strong> Use this when you want a style section (e.g., Intro 3, Ending 2, or Fill AA) to play MIDI-only accompaniment tracks without an audio loop, eliminating the need to create dummy silent audio files.
            </div>
          </div>

          <div class="help-guide-section">
            <div class="help-section-title">
              <span class="help-tag amber">TRIM CONTROLS</span>
              Trim Start &amp; Trim End
            </div>
            <p class="help-section-text">
              Sets the exact start and end boundaries (in seconds) of the audio performance. You can adjust boundaries by dragging the amber/red handles on the waveform canvas, scrolling over the numeric inputs, or typing values directly.
            </p>
          </div>
        </div>
      `;
    } else if (topic === 'beatgrid') {
      title = 'Beat Grid & Alignment Guide';
      contentHtml = `
        <div class="help-guide-modal-content">
          <div class="help-guide-section">
            <div class="help-section-title">
              <span class="help-tag green">AUTO-ANALYSIS</span>
              Detect (Beat &amp; Tempo Analysis)
            </div>
            <p class="help-section-text">
              Scans audio transients and energy peaks across frequency bands to identify rhythmic hits, calculate the native tempo (BPM), and lock beat markers directly onto the beat.
            </p>
          </div>

          <div class="help-guide-section">
            <div class="help-section-title">
              <span class="help-tag cyan">TEMPO SCALING</span>
              / 2 and 2 X Grid Modifiers
            </div>
            <p class="help-section-text">
              <strong>/ 2 (Halve):</strong> Cuts the beat grid density by half (e.g., 140 BPM &rarr; 70 BPM). Essential for half-time grooves or when beats were detected on 8th notes.<br>
              <strong>2 X (Double):</strong> Multiplies beat grid density by two (e.g., 60 BPM &rarr; 120 BPM) for double-time feels or sparse percussion tracks.
            </p>
          </div>

          <div class="help-guide-section">
            <div class="help-section-title">
              <span class="help-tag purple">PHASE ALIGNMENT</span>
              Shift Beat Position
            </div>
            <p class="help-section-text">
              Slides the entire beat grid by half an interval. This is crucial when an audio loop starts on a pickup beat (anacrusis) or an upbeat, aligning the downbeat marker (Beat 1) with the groove's true downbeat.
            </p>
          </div>
        </div>
      `;
    }

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box help-guide-box">
          <div class="modal-header">
            <div class="modal-title-with-badge">
              <svg class="modal-header-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span class="modal-title">${title}</span>
            </div>
            <button class="modal-close-btn" aria-label="Close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            ${contentHtml}
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary btn-close-help">Got it</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      let cleanKey = null;
      const close = () => {
        if (cleanKey) cleanKey();
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 150);
        resolve(true);
      };

      cleanKey = this.bindModalDismiss(modal, close);
      modal.querySelector('.btn-close-help').onclick = close;
      modal.querySelector('.modal-close-btn').onclick = close;
    });
  }

  /**
   * Display confirm dialog with SVG icons.
   */
  static showConfirm(title, message) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-box confirm-box">
          <div class="modal-header">
            <span class="modal-title">${title}</span>
            <button class="modal-close-btn" aria-label="Close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <svg class="modal-icon warning" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div class="alert-message">${message}</div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-cancel">Cancel</button>
            <button class="btn btn-primary btn-confirm">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      let cleanKey = null;
      const finish = (result) => {
        if (cleanKey) cleanKey();
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 150);
        resolve(result);
      };

      cleanKey = this.bindModalDismiss(modal, () => finish(false));
      modal.querySelector('.btn-confirm').onclick = () => finish(true);
      modal.querySelector('.btn-cancel').onclick = () => finish(false);
      modal.querySelector('.modal-close-btn').onclick = () => finish(false);
    });
  }

  /**
   * Session Recovery Prompt Dialog shown upon reload.
   */
  static showRestoreSessionPrompt(summary) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';

      const dateStr = summary.savedAt ? new Date(summary.savedAt).toLocaleString() : 'Unknown date';
      const secTags = (summary.activeSectionNames || [])
        .map(n => `<span class="restore-sec-tag">${n}</span>`)
        .join('');

      modal.innerHTML = `
        <div class="modal-box restore-box">
          <div class="modal-header">
            <div class="restore-title-group">
              <svg class="modal-header-icon" viewBox="0 0 24 24">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <polyline points="12 7 12 12 15 15"/>
              </svg>
              <span class="modal-title">Restore Previous Session?</span>
            </div>
            <button class="modal-close-btn" aria-label="Close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body restore-body">
            <p class="restore-lead">
              A previous unsaved session from <strong>${dateStr}</strong> was found in local browser storage.
            </p>

            <div class="restore-summary-card">
              <div class="summary-field">
                <span class="label">Project Name:</span>
                <span class="value cyan-text">${summary.projectName || 'Untitled Style'}</span>
              </div>
              <div class="summary-field">
                <span class="label">Tempo &amp; Meter:</span>
                <span class="value">${summary.masterTempo || 120} BPM · ${summary.timeSignature?.numerator || 4}/${summary.timeSignature?.denominator || 4}</span>
              </div>
              <div class="summary-field">
                <span class="label">Audio Sections:</span>
                <span class="value highlight-text">${summary.activeSectionCount || 0} Assigned Loops</span>
              </div>
              ${secTags ? `<div class="restore-tags-row">${secTags}</div>` : ''}
            </div>

            <p class="restore-subtext">
              Would you like to restore this session and continue working, or discard it and start fresh?
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-discard">
              <svg viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Start Fresh
            </button>
            <button class="btn btn-primary btn-restore">
              <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Restore Session
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      let cleanKey = null;
      const finish = (restore) => {
        if (cleanKey) cleanKey();
        modal.classList.add('closing');
        setTimeout(() => modal.remove(), 150);
        resolve(restore);
      };

      cleanKey = this.bindModalDismiss(modal, () => finish(false));
      modal.querySelector('.btn-restore').onclick = () => finish(true);
      modal.querySelector('.btn-discard').onclick = () => finish(false);
      modal.querySelector('.modal-close-btn').onclick = () => finish(false);
    });
  }

  /**
   * Export Audio Style Dialog with Yamaha Keyboard Awareness & Size Validation.
   */
  static showExportDialog(project, onExecuteExport, onKeyboardChange = null) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    let currentKeyboardId = project.targetKeyboard || 'psr_sx920';
    const allKeyboards = KeyboardManager.getAllProfiles();

    // Build keyboard options HTML
    let keyboardOptionsHtml = '';
    for (const kb of allKeyboards) {
      const isSelected = kb.id === currentKeyboardId ? 'selected' : '';
      const limitMb = Math.round(kb.maxStyleSizeBytes / (1024 * 1024));
      keyboardOptionsHtml += `
        <option value="${kb.id}" ${isSelected}>
          ${kb.name} (${kb.directUsbPlayback ? 'Direct USB' : 'YEM Pack'} · Max ${limitMb} MB)
        </option>
      `;
    }

    // Build sections list with size breakdown
    const sizeInfo = KeyboardManager.estimateStyleSize(project);
    let sectionsListHtml = '';
    let hasAnyAudio = false;

    for (const [id, sec] of project.sections.entries()) {
      if (sec.hasAudio) {
        hasAnyAudio = true;
        const secBreakdown = sizeInfo.sectionBreakdown.find(b => b.id === id);
        const secMbStr = secBreakdown ? `${secBreakdown.mb.toFixed(2)} MB` : '';
        sectionsListHtml += `
          <div class="export-sec-item" data-section-family="${sec.category.toLowerCase()}">
            <span class="sec-badge badge-${sec.category.toLowerCase()}">${sec.name}</span>
            <span class="file">${sec.audioFileName}</span>
            <span class="len">${sec.trimmedDuration.toFixed(2)}s (${sec.bars} bars) · <span class="sec-size">${secMbStr}</span></span>
          </div>
        `;
      }
    }

    if (!hasAnyAudio) {
      sectionsListHtml = `<div class="empty-notice">No sections currently have audio assigned. Please assign at least one audio loop before exporting.</div>`;
    }

    modal.innerHTML = `
      <div class="modal-box export-box">
        <div class="modal-header">
          <div class="restore-title-group">
            <svg class="modal-header-icon" viewBox="0 0 24 24">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <path d="M6 5v7m4-7v7m4-7v7m4-7v7"/>
            </svg>
            <span class="modal-title">Export Yamaha Audio Style File</span>
          </div>
          <button class="modal-close-btn" aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group flex-1">
              <label>Style File Name:</label>
              <input type="text" id="exportFileName" class="input-text" value="${project.name.replace(/\.[^/.]+$/, '')}.aus" />
            </div>
            <div class="form-group flex-1">
              <label>Target Yamaha Keyboard:</label>
              <select id="exportTargetKeyboard" class="input-select">
                ${keyboardOptionsHtml}
              </select>
            </div>
          </div>

          <!-- Playability & Memory Gauge -->
          <div class="export-gauge-container" id="exportGaugeContainer">
            <div class="gauge-header">
              <span class="gauge-title">KEYBOARD PLAYABILITY &amp; MEMORY USAGE</span>
              <span class="gauge-stats" id="exportGaugeStats">Calculating...</span>
            </div>
            <div class="export-gauge-track">
              <div id="exportGaugeBar" class="export-gauge-fill" style="width: 0%;"></div>
            </div>
            <div id="exportPlayabilityCard" class="export-playability-card"></div>
          </div>

          <div class="form-group">
            <label>Assigned Audio Loops (${project.masterTempo} BPM, ${project.timeSignature.numerator}/${project.timeSignature.denominator}):</label>
            <div class="export-sections-list">
              ${sectionsListHtml}
            </div>
          </div>

          <div class="export-info-box" id="exportTransferNotes">
            <svg class="info-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div id="exportTransferText">Loading hardware instructions...</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-cancel">Cancel</button>
          <button class="btn btn-primary btn-do-export" id="btnDoExport">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span id="btnExportText">Export .aus Style</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const targetSelect = modal.querySelector('#exportTargetKeyboard');
    const gaugeStats = modal.querySelector('#exportGaugeStats');
    const gaugeBar = modal.querySelector('#exportGaugeBar');
    const playabilityCard = modal.querySelector('#exportPlayabilityCard');
    const transferText = modal.querySelector('#exportTransferText');
    const doExportBtn = modal.querySelector('#btnDoExport');
    const btnExportText = modal.querySelector('#btnExportText');

    const updateValidationView = (kbId) => {
      const v = KeyboardManager.validateExport(project, kbId);
      currentKeyboardId = kbId;

      // Update Gauge Bar & Stats
      const clampedPercent = Math.min(100, v.percentOfLimit);
      gaugeBar.style.width = `${clampedPercent}%`;
      gaugeStats.innerHTML = `<strong>${v.estimatedMB.toFixed(1)} MB</strong> / ${v.maxMB.toFixed(0)} MB max (${v.percentOfLimit}%)`;

      gaugeBar.className = 'export-gauge-fill ' + (v.isBlocked ? 'gauge-danger' : (v.isWarning ? 'gauge-warn' : 'gauge-safe'));

      // Update Playability Card
      if (!hasAnyAudio) {
        playabilityCard.className = 'export-playability-card alert-warning';
        playabilityCard.innerHTML = `
          <div class="card-title">⚠️ No Audio Loops Assigned</div>
          <div class="card-desc">Assign audio loops to at least one section before exporting.</div>
        `;
        doExportBtn.disabled = true;
        btnExportText.textContent = 'No Audio Loops';
      } else if (v.isBlocked) {
        playabilityCard.className = 'export-playability-card alert-blocked';
        let suggestionsHtml = v.suggestions.map(s => `<li>${s}</li>`).join('');
        playabilityCard.innerHTML = `
          <div class="card-title">
            <svg viewBox="0 0 24 24" class="card-icon error"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            Export Blocked: Exceeds ${v.keyboard.name} Playability Limit
          </div>
          <div class="card-desc">
            The generated style size is <strong>${v.estimatedMB.toFixed(1)} MB</strong>, which exceeds the <strong>${v.maxMB.toFixed(0)} MB</strong> memory limit for ${v.keyboard.name}.
            If exported, this file will fail on the keyboard with <em>"Data not loaded properly"</em> or cause system lockup.
          </div>
          ${suggestionsHtml ? `<div class="card-suggestions"><strong>Recommended Solutions:</strong><ul>${suggestionsHtml}</ul></div>` : ''}
        `;
        doExportBtn.disabled = true;
        btnExportText.textContent = `Blocked for ${v.keyboard.shortName}`;
      } else if (v.isWarning) {
        playabilityCard.className = 'export-playability-card alert-warning';
        playabilityCard.innerHTML = `
          <div class="card-title">
            <svg viewBox="0 0 24 24" class="card-icon warning"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Approaching ${v.keyboard.name} Size Ceiling (${v.percentOfLimit}%)
          </div>
          <div class="card-desc">
            Total size is <strong>${v.estimatedMB.toFixed(1)} MB</strong>. The file is playable, but may require longer initial loading time on ${v.keyboard.name}.
          </div>
        `;
        doExportBtn.disabled = false;
        btnExportText.textContent = `Export for ${v.keyboard.shortName}`;
      } else {
        playabilityCard.className = 'export-playability-card alert-safe';
        playabilityCard.innerHTML = `
          <div class="card-title">
            <svg viewBox="0 0 24 24" class="card-icon success"><polyline points="20 6 9 17 4 12"/></svg>
            Playable &amp; Verified for ${v.keyboard.name}
          </div>
          <div class="card-desc">
            Audio style footprint is <strong>${v.estimatedMB.toFixed(1)} MB</strong> (using only ${v.percentOfLimit}% of ${v.maxMB.toFixed(0)} MB capacity). SFF2 MIDI chunks and 44.1kHz 16-bit PCM waveforms are ready for export.
          </div>
        `;
        doExportBtn.disabled = false;
        btnExportText.textContent = `Export for ${v.keyboard.shortName}`;
      }

      // Update Transfer instructions
      if (v.keyboard.directUsbPlayback) {
        transferText.innerHTML = `
          <strong>${v.keyboard.name} (Direct USB Playback):</strong> You can copy the exported <strong>.aus</strong> file directly to a USB flash drive and plug it into your ${v.keyboard.shortName}. It will load and play immediately from the USB drive!
        `;
      } else {
        transferText.innerHTML = `
          <strong>${v.keyboard.name} (YEM Expansion Pack):</strong> To load this style onto your ${v.keyboard.shortName}, import the <strong>.aus</strong> file into <strong>Yamaha Expansion Manager (YEM)</strong> on your computer, bundle it into an Expansion Pack (.cpi/.ppi), copy to USB, and install via the keyboard's Expansion Installer menu.
        `;
      }
    };

    // Initialize validation
    updateValidationView(currentKeyboardId);

    // Keyboard selection change listener
    targetSelect.addEventListener('change', () => {
      const newKbId = targetSelect.value;
      project.setTargetKeyboard(newKbId);
      updateValidationView(newKbId);
      if (onKeyboardChange) {
        onKeyboardChange(newKbId);
      }
    });

    let cleanKey = null;
    const close = () => {
      if (cleanKey) cleanKey();
      modal.classList.add('closing');
      setTimeout(() => modal.remove(), 150);
    };

    cleanKey = this.bindModalDismiss(modal, close);
    modal.querySelector('.btn-cancel').onclick = close;
    modal.querySelector('.modal-close-btn').onclick = close;

    if (doExportBtn) {
      doExportBtn.onclick = async () => {
        const fn = modal.querySelector('#exportFileName').value.trim() || 'AudioStyle.aus';
        doExportBtn.disabled = true;
        btnExportText.textContent = 'Generating .aus Style...';
        try {
          await onExecuteExport(fn, currentKeyboardId);
          close();
        } catch (err) {
          ModalDialogs.showAlert('Export Error', err.message, 'error');
          updateValidationView(currentKeyboardId);
        }
      };
    }
  }

  /**
   * Audio Hardware Settings Dialog.
   */
  static showAudioSettings(audioEngine) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    const ctx = audioEngine.ctx;
    const sr = ctx ? ctx.sampleRate : 44100;
    const state = ctx ? ctx.state : 'Ready';

    modal.innerHTML = `
      <div class="modal-box settings-box">
        <div class="modal-header">
          <div class="restore-title-group">
            <svg class="modal-header-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span class="modal-title">Audio Output Device Settings</span>
          </div>
          <button class="modal-close-btn" aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Driver / Audio Subsystem:</label>
            <div class="status-badge running">Web Audio API (Hardware Direct)</div>
          </div>
          <div class="form-group">
            <label>Sample Rate:</label>
            <input type="text" class="input-text" value="${sr} Hz" readonly />
          </div>
          <div class="form-group">
            <label>Driver State:</label>
            <input type="text" class="input-text" value="${state}" readonly />
          </div>
          <div class="form-group">
            <label>Master Output Latency:</label>
            <input type="text" class="input-text" value="${((ctx?.baseLatency || 0.005) * 1000).toFixed(1)} ms" readonly />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary btn-close">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let cleanKey = null;
    const close = () => {
      if (cleanKey) cleanKey();
      modal.classList.add('closing');
      setTimeout(() => modal.remove(), 150);
    };

    cleanKey = this.bindModalDismiss(modal, close);
    modal.querySelector('.btn-close').onclick = close;
    modal.querySelector('.modal-close-btn').onclick = close;
  }
}
