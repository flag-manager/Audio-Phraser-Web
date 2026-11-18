/**
 * Yamaha Audio Phraser - Modal Dialogs
 * Styled with StyleCraft Studio design language and crisp SVG vector icons.
 * Features keyboard accessibility (Escape to dismiss, backdrop click dismiss).
 */

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
   * Export Audio Style Dialog with SVG vector graphics.
   */
  static showExportDialog(project, onExecuteExport) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    let sectionsListHtml = '';
    let hasAnyAudio = false;

    for (const [id, sec] of project.sections.entries()) {
      if (sec.hasAudio) {
        hasAnyAudio = true;
        sectionsListHtml += `
          <div class="export-sec-item" data-section-family="${sec.category.toLowerCase()}">
            <span class="sec-badge badge-${sec.category.toLowerCase()}">${sec.name}</span>
            <span class="file">${sec.audioFileName}</span>
            <span class="len">${sec.trimmedDuration.toFixed(2)}s (${sec.bars} bars)</span>
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
          <div class="form-group">
            <label>Style File Name:</label>
            <input type="text" id="exportFileName" class="input-text" value="${project.name.replace(/\.[^/.]+$/, '')}.aus" />
          </div>

          <div class="form-group">
            <label>Assigned Audio Sections (${project.masterTempo} BPM, ${project.timeSignature.numerator}/${project.timeSignature.denominator}):</label>
            <div class="export-sections-list">
              ${sectionsListHtml}
            </div>
          </div>

          <div class="export-info-box">
            <svg class="info-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div>The exported <strong>.aus</strong> file contains standard Yamaha SFF2 style MIDI headers along with binary <code>AASM</code>, <code>ASEG</code>, <code>Adec</code>, <code>AMix</code>, and <code>AWav</code> chunks for immediate plug-and-play USB playback on your Yamaha arranger keyboard.</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-cancel">Cancel</button>
          <button class="btn btn-primary btn-do-export" ${!hasAnyAudio ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export .aus Style
          </button>
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
    modal.querySelector('.btn-cancel').onclick = close;
    modal.querySelector('.modal-close-btn').onclick = close;

    const doExportBtn = modal.querySelector('.btn-do-export');
    if (doExportBtn) {
      doExportBtn.onclick = async () => {
        const fn = modal.querySelector('#exportFileName').value.trim() || 'AudioStyle.aus';
        doExportBtn.disabled = true;
        doExportBtn.textContent = 'Generating .aus Style...';
        try {
          await onExecuteExport(fn);
          close();
        } catch (err) {
          ModalDialogs.showAlert('Export Error', err.message, 'error');
          doExportBtn.disabled = false;
          doExportBtn.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export .aus Style
          `;
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
