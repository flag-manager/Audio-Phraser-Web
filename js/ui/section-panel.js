/**
 * Yamaha Audio Phraser - Section Selection Panel
 * Renders the 15 Yamaha Style Sections in an arranger grid layout
 * using StyleCraft Studio section pushbutton aesthetics and tactile hardware styling.
 * Optimized with in-place targeted card DOM updating.
 */

import { STYLE_SECTIONS } from '../model/section.js';

export class SectionPanel {
  constructor(containerElement, onSelectCallback, onDropAudioCallback) {
    this.container = containerElement;
    this.onSelect = onSelectCallback;
    this.onDropAudio = onDropAudioCallback;
    this.activeSectionId = 'main_a';
  }

  render(project) {
    this.container.innerHTML = '';

    const categories = [
      { name: 'Intro', family: 'intro' },
      { name: 'Main', family: 'main' },
      { name: 'Fill', family: 'fill' },
      { name: 'Break', family: 'break' },
      { name: 'Ending', family: 'ending' }
    ];

    for (const cat of categories) {
      const groupDiv = document.createElement('div');
      groupDiv.className = `section-group group-${cat.family}`;
      groupDiv.dataset.sectionFamily = cat.family;

      const title = document.createElement('div');
      title.className = 'group-title';
      title.textContent = cat.name.toUpperCase();
      groupDiv.appendChild(title);

      const buttonsRow = document.createElement('div');
      buttonsRow.className = 'buttons-row';

      const items = STYLE_SECTIONS.filter(s => s.category.toLowerCase() === cat.name.toLowerCase());
      for (const def of items) {
        const sec = project.sections.get(def.id);
        const isSelected = def.id === project.selectedSectionId;
        const hasAudio = sec && sec.hasAudio;

        const btn = document.createElement('button');
        btn.className = `section-card ${isSelected ? 'active' : ''} ${hasAudio ? 'has-audio' : ''}`;
        btn.dataset.sectionId = def.id;
        btn.dataset.sectionFamily = cat.family;
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

        btn.innerHTML = `
          <div class="card-indicator"></div>
          <div class="card-name">${def.name}</div>
          <div class="card-meta">
            <span class="card-bars">${sec ? sec.bars : def.defaultBars} B</span>
            ${hasAudio ? `<span class="card-status active">WAV</span>` : `<span class="card-status empty">-</span>`}
          </div>
        `;

        btn.addEventListener('click', () => {
          if (this.onSelect) this.onSelect(def.id);
        });

        // Drag and drop audio directly onto button
        btn.addEventListener('dragover', (e) => {
          e.preventDefault();
          btn.classList.add('drag-over');
        });
        btn.addEventListener('dragleave', () => {
          btn.classList.remove('drag-over');
        });
        btn.addEventListener('drop', (e) => {
          e.preventDefault();
          btn.classList.remove('drag-over');
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            if (this.onDropAudio) this.onDropAudio(def.id, e.dataTransfer.files[0]);
          }
        });

        buttonsRow.appendChild(btn);
      }

      groupDiv.appendChild(buttonsRow);
      this.container.appendChild(groupDiv);
    }
  }

  updateSelection(selectedId) {
    const cards = this.container.querySelectorAll('.section-card');
    cards.forEach(card => {
      const isSel = card.dataset.sectionId === selectedId;
      card.classList.toggle('active', isSel);
      card.setAttribute('aria-pressed', isSel ? 'true' : 'false');
    });
  }

  /**
   * Fast targeted update for a single section card without full DOM rebuild
   */
  updateSectionCard(sectionId, sec) {
    const card = this.container.querySelector(`.section-card[data-section-id="${sectionId}"]`);
    if (!card) return;

    const hasAudio = !!(sec && sec.hasAudio);
    card.classList.toggle('has-audio', hasAudio);

    const barsEl = card.querySelector('.card-bars');
    if (barsEl) {
      barsEl.textContent = `${sec ? sec.bars : 2} B`;
    }

    const statusEl = card.querySelector('.card-status');
    if (statusEl) {
      if (hasAudio) {
        statusEl.className = 'card-status active';
        statusEl.textContent = 'WAV';
      } else {
        statusEl.className = 'card-status empty';
        statusEl.textContent = '-';
      }
    }
  }
}
