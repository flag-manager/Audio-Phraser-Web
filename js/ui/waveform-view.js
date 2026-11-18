/**
 * Yamaha Audio Phraser - Interactive Waveform & Beat Grid Canvas View
 * Provides high-DPI rendering, zooming, panning, trim handles, beat markers, and playhead.
 * Optimized with offscreen static canvas caching for 60 FPS playback with near-zero CPU usage.
 */

export class WaveformView {
  constructor(canvasElement, containerElement) {
    this.canvas = canvasElement;
    this.container = containerElement;
    this.ctx = this.canvas.getContext('2d');

    // Offscreen canvas for caching static elements (peaks, ruler, overlays, grid, handles)
    this.staticCanvas = document.createElement('canvas');
    this.staticCtx = this.staticCanvas.getContext('2d');
    this.isStaticDirty = true;

    this.section = null;
    this.audioBuffer = null;

    // Viewport & Zoom
    this.zoom = 1.0; // 1.0 = fit full audio, up to 64.0
    this.scrollOffsetSec = 0.0;
    this.dpr = window.devicePixelRatio || 1;

    // Dragging state
    this.draggingTarget = null; // 'trimStart', 'trimEnd', 'beatMarker', 'pan'
    this.draggedMarkerIndex = -1;
    this.dragStartX = 0;
    this.dragStartSec = 0;

    // Playhead state
    this.playheadSec = -1;

    // Callbacks
    this.onTrimChanged = null;
    this.onBeatMarkerChanged = null;
    this.onSeek = null;
    this.onZoomChanged = null;

    this.resizePending = false;
    this.setupEvents();
    this.resize();
  }

  setSection(section) {
    this.section = section;
    this.audioBuffer = section ? section.audioBuffer : null;
    this.zoom = 1.0;
    this.scrollOffsetSec = 0.0;
    this.playheadSec = -1;
    this.invalidateStatic();
    this.render();
    if (this.onZoomChanged) this.onZoomChanged(this.zoom);
  }

  invalidateStatic() {
    this.isStaticDirty = true;
  }

  resize() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(200, Math.floor(rect.width));
    const height = Math.max(160, Math.floor(rect.height));

    this.dpr = window.devicePixelRatio || 1;

    // Resize main canvas
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Resize static offscreen canvas
    this.staticCanvas.width = width * this.dpr;
    this.staticCanvas.height = height * this.dpr;
    this.staticCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.invalidateStatic();
    this.render();
  }

  zoomIn() {
    this.setZoom(this.zoom * 1.5);
  }

  zoomOut() {
    this.setZoom(this.zoom / 1.5);
  }

  setZoom(newZoom) {
    this.zoom = Math.max(1.0, Math.min(64.0, newZoom));

    // Clamp scroll
    if (this.audioBuffer) {
      const visibleSec = this.audioBuffer.duration / this.zoom;
      const maxScroll = Math.max(0, this.audioBuffer.duration - visibleSec);
      this.scrollOffsetSec = Math.max(0, Math.min(maxScroll, this.scrollOffsetSec));
    }
    this.invalidateStatic();
    this.render();
    if (this.onZoomChanged) this.onZoomChanged(this.zoom);
  }

  setScrollOffset(sec) {
    if (!this.audioBuffer) return;
    const visibleSec = this.audioBuffer.duration / this.zoom;
    const maxScroll = Math.max(0, this.audioBuffer.duration - visibleSec);
    this.scrollOffsetSec = Math.max(0, Math.min(maxScroll, sec));
    this.invalidateStatic();
    this.render();
  }

  setPlayhead(sec) {
    this.playheadSec = sec;
    this.render();
  }

  // Time <-> Pixel Coordinate Converters
  timeToX(timeSec) {
    if (!this.audioBuffer || this.audioBuffer.duration <= 0) return 0;
    const width = this.canvas.width / this.dpr;
    const visibleSec = this.audioBuffer.duration / this.zoom;
    return ((timeSec - this.scrollOffsetSec) / visibleSec) * width;
  }

  xToTime(x) {
    if (!this.audioBuffer || this.audioBuffer.duration <= 0) return 0;
    const width = this.canvas.width / this.dpr;
    const visibleSec = this.audioBuffer.duration / this.zoom;
    return this.scrollOffsetSec + (x / width) * visibleSec;
  }

  render() {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // 1. Re-render static elements if dirty
    if (this.isStaticDirty) {
      this.renderStatic(width, height);
      this.isStaticDirty = false;
    }

    // 2. Clear main canvas and blit static cache
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.staticCanvas, 0, 0, width, height);

    // 3. Draw fast dynamic playhead
    if (this.playheadSec >= 0 && this.audioBuffer) {
      const playX = this.timeToX(this.playheadSec);
      if (playX >= 0 && playX <= width) {
        const rulerHeight = 26;

        // Glowing playhead line
        this.ctx.strokeStyle = '#34d399';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(playX, rulerHeight);
        this.ctx.lineTo(playX, height);
        this.ctx.stroke();

        // Playhead triangle top cap
        this.ctx.fillStyle = '#34d399';
        this.ctx.beginPath();
        this.ctx.moveTo(playX - 6, rulerHeight);
        this.ctx.lineTo(playX + 6, rulerHeight);
        this.ctx.lineTo(playX, rulerHeight + 9);
        this.ctx.closePath();
        this.ctx.fill();
      }
    }
  }

  renderStatic(width, height) {
    const sCtx = this.staticCtx;
    sCtx.clearRect(0, 0, width, height);

    // StyleCraft Studio ultra dark DAW chassis background
    sCtx.fillStyle = '#060a12';
    sCtx.fillRect(0, 0, width, height);

    if (!this.audioBuffer || !this.section) {
      this.renderEmptyState(sCtx, width, height);
      return;
    }

    const duration = this.audioBuffer.duration;
    const visibleSec = duration / this.zoom;
    const rulerHeight = 26;
    const waveTop = rulerHeight;
    const waveHeight = height - rulerHeight;
    const waveCenterY = waveTop + waveHeight / 2;

    // 1. Draw Time Ruler
    this.renderRuler(sCtx, width, rulerHeight, visibleSec);

    // 2. Draw Waveform Peaks
    this.renderPeaks(sCtx, width, waveTop, waveHeight, waveCenterY, visibleSec);

    // 3. Draw Inactive / Out-of-trim Dimmed Overlays
    const trimStartX = this.timeToX(this.section.trimStart);
    const trimEndX = this.timeToX(this.section.trimEnd > 0 ? this.section.trimEnd : duration);

    sCtx.fillStyle = 'rgba(6, 10, 18, 0.65)';
    if (trimStartX > 0) {
      sCtx.fillRect(0, waveTop, Math.max(0, trimStartX), waveHeight);
    }
    if (trimEndX < width) {
      sCtx.fillRect(trimEndX, waveTop, width - trimEndX, waveHeight);
    }

    // 4. Draw Beat Grid & Downbeat Markers
    this.renderBeatGrid(sCtx, width, waveTop, waveHeight);

    // 5. Draw Trim Boundary Lines and Drag Handles
    this.renderTrimHandles(sCtx, width, waveTop, waveHeight, trimStartX, trimEndX);
  }

  renderEmptyState(ctx, width, height) {
    ctx.fillStyle = '#56677e';
    ctx.font = '500 13px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Drag & drop WAV/AIFF loop here, or click "Import Audio" to begin', width / 2, height / 2);
  }

  renderRuler(ctx, width, rulerHeight, visibleSec) {
    ctx.fillStyle = '#080d17';
    ctx.fillRect(0, 0, width, rulerHeight);
    ctx.strokeStyle = '#1d2c42';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight - 0.5);
    ctx.lineTo(width, rulerHeight - 0.5);
    ctx.stroke();

    // Calculate time intervals
    let interval = 1.0;
    if (visibleSec < 1.0) interval = 0.1;
    else if (visibleSec < 3.0) interval = 0.5;
    else if (visibleSec < 8.0) interval = 1.0;
    else if (visibleSec < 20.0) interval = 2.0;
    else interval = 5.0;

    const startSec = Math.floor(this.scrollOffsetSec / interval) * interval;
    const endSec = this.scrollOffsetSec + visibleSec;

    ctx.fillStyle = '#8292a8';
    ctx.font = '500 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let t = startSec; t <= endSec; t += interval) {
      const x = this.timeToX(t);
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = '#294561';
        ctx.beginPath();
        ctx.moveTo(x + 0.5, rulerHeight - 7);
        ctx.lineTo(x + 0.5, rulerHeight);
        ctx.stroke();

        const mins = Math.floor(t / 60);
        const secs = (t % 60).toFixed(interval < 1.0 ? 2 : 1);
        const timeStr = `${mins}:${secs.padStart(interval < 1.0 ? 5 : 4, '0')}`;
        ctx.fillText(timeStr, x, rulerHeight / 2 - 2);
      }
    }
  }

  renderPeaks(ctx, width, waveTop, waveHeight, waveCenterY, visibleSec) {
    const channelData = this.audioBuffer.getChannelData(0);
    const sr = this.audioBuffer.sampleRate;
    const startSample = Math.floor(this.scrollOffsetSec * sr);
    const visibleSamples = Math.floor(visibleSec * sr);
    const samplesPerPixel = Math.max(1, visibleSamples / width);

    // Center baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, waveCenterY + 0.5);
    ctx.lineTo(width, waveCenterY + 0.5);
    ctx.stroke();

    // Waveform gradient (StyleCraft Neon Cyan)
    const halfH = (waveHeight / 2) * 0.92;
    const grad = ctx.createLinearGradient(0, waveCenterY - halfH, 0, waveCenterY + halfH);
    grad.addColorStop(0, '#20d9f3');
    grad.addColorStop(0.5, '#0ea4bc');
    grad.addColorStop(1, '#20d9f3');
    ctx.fillStyle = grad;

    ctx.beginPath();
    for (let x = 0; x < width; x++) {
      const sStart = Math.min(channelData.length - 1, Math.floor(startSample + x * samplesPerPixel));
      const sEnd = Math.min(channelData.length, Math.floor(startSample + (x + 1) * samplesPerPixel));

      let min = 0.0;
      let max = 0.0;
      for (let s = sStart; s < sEnd; s++) {
        const val = channelData[s];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const topY = waveCenterY - max * halfH;
      const botY = waveCenterY - min * halfH;
      ctx.rect(x, topY, 1, Math.max(1, botY - topY));
    }
    ctx.fill();
  }

  renderBeatGrid(ctx, width, waveTop, waveHeight) {
    if (!this.section || !this.section.beatPoints || this.section.beatPoints.length === 0) return;

    const timeSig = this.section.timeSignature || { numerator: 4, denominator: 4 };
    const beatsPerBar = timeSig.numerator;

    for (let i = 0; i < this.section.beatPoints.length; i++) {
      const t = this.section.beatPoints[i];
      const x = this.timeToX(t);
      if (x < -10 || x > width + 10) continue;

      const isDownbeat = i % beatsPerBar === 0;
      const barNum = Math.floor(i / beatsPerBar) + 1;

      // Vertical line
      ctx.strokeStyle = isDownbeat ? 'rgba(247, 189, 66, 0.85)' : 'rgba(130, 146, 168, 0.28)';
      ctx.lineWidth = isDownbeat ? 1.5 : 1;
      ctx.setLineDash(isDownbeat ? [] : [3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, waveTop);
      ctx.lineTo(x + 0.5, waveTop + waveHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Top Handle / Tag
      ctx.fillStyle = isDownbeat ? '#f7bd42' : '#56677e';
      ctx.beginPath();
      ctx.arc(x, waveTop + 6, isDownbeat ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Bar label
      if (isDownbeat) {
        ctx.fillStyle = '#f7bd42';
        ctx.font = '700 10px "Space Grotesk", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Bar ${barNum}`, x + 4, waveTop + 14);
      }
    }
  }

  renderTrimHandles(ctx, width, waveTop, waveHeight, trimStartX, trimEndX) {
    // Trim Start Handle (Emerald Green)
    if (trimStartX >= 0 && trimStartX <= width) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trimStartX, waveTop);
      ctx.lineTo(trimStartX, waveTop + waveHeight);
      ctx.stroke();

      // Top flag handle
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.moveTo(trimStartX, waveTop);
      ctx.lineTo(trimStartX + 14, waveTop);
      ctx.lineTo(trimStartX + 14, waveTop + 16);
      ctx.lineTo(trimStartX, waveTop + 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#071810';
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('IN', trimStartX + 2, waveTop + 11);
    }

    // Trim End Handle (Crimson Red / Coral)
    if (trimEndX >= 0 && trimEndX <= width) {
      ctx.strokeStyle = '#fb6178';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trimEndX, waveTop);
      ctx.lineTo(trimEndX, waveTop + waveHeight);
      ctx.stroke();

      // Top flag handle
      ctx.fillStyle = '#fb6178';
      ctx.beginPath();
      ctx.moveTo(trimEndX, waveTop);
      ctx.lineTo(trimEndX - 14, waveTop);
      ctx.lineTo(trimEndX - 14, waveTop + 16);
      ctx.lineTo(trimEndX, waveTop + 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#260a10';
      ctx.font = '700 9px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('OUT', trimEndX - 2, waveTop + 11);
    }
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      if (!this.resizePending) {
        this.resizePending = true;
        requestAnimationFrame(() => {
          this.resizePending = false;
          this.resize();
        });
      }
    });

    // Mouse drag interactions for trim handles and beat points
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Wheel zoom & pan
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomDelta = e.deltaY < 0 ? 1.2 : 0.833;
        this.setZoom(this.zoom * zoomDelta);
      } else {
        // Pan
        if (!this.audioBuffer) return;
        const visibleSec = this.audioBuffer.duration / this.zoom;
        const deltaSec = (e.deltaX || e.deltaY) * 0.002 * visibleSec;
        this.setScrollOffset(this.scrollOffsetSec + deltaSec);
      }
    }, { passive: false });
  }

  onMouseDown(e) {
    if (!this.audioBuffer || !this.section) return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const trimStartX = this.timeToX(this.section.trimStart);
    const trimEndX = this.timeToX(this.section.trimEnd > 0 ? this.section.trimEnd : this.audioBuffer.duration);

    const hitDist = 8;

    // Check trim start
    if (Math.abs(mouseX - trimStartX) <= hitDist) {
      this.draggingTarget = 'trimStart';
      return;
    }

    // Check trim end
    if (Math.abs(mouseX - trimEndX) <= hitDist) {
      this.draggingTarget = 'trimEnd';
      return;
    }

    // Check beat marker drag near top ruler
    if (mouseY <= 40 && this.section.beatPoints) {
      for (let i = 0; i < this.section.beatPoints.length; i++) {
        const bx = this.timeToX(this.section.beatPoints[i]);
        if (Math.abs(mouseX - bx) <= 6) {
          this.draggingTarget = 'beatMarker';
          this.draggedMarkerIndex = i;
          return;
        }
      }
    }

    // Pan or click-to-seek
    this.draggingTarget = 'pan';
    this.dragStartX = e.clientX;
    this.dragStartSec = this.scrollOffsetSec;
    this.hasMovedDrag = false;
  }

  onMouseMove(e) {
    if (!this.draggingTarget || !this.audioBuffer || !this.section) {
      this.updateCursor(e);
      return;
    }

    this.hasMovedDrag = true;
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = Math.max(0, Math.min(this.audioBuffer.duration, this.xToTime(mouseX)));

    if (this.draggingTarget === 'trimStart') {
      const maxStart = (this.section.trimEnd > 0 ? this.section.trimEnd : this.audioBuffer.duration) - 0.05;
      const clamped = Math.min(maxStart, targetTime);
      this.section.trimStart = clamped;
      if (this.onTrimChanged) this.onTrimChanged(clamped, this.section.trimEnd);
      this.invalidateStatic();
      this.render();
    } else if (this.draggingTarget === 'trimEnd') {
      const minEnd = this.section.trimStart + 0.05;
      const clamped = Math.max(minEnd, targetTime);
      this.section.trimEnd = clamped;
      if (this.onTrimChanged) this.onTrimChanged(this.section.trimStart, clamped);
      this.invalidateStatic();
      this.render();
    } else if (this.draggingTarget === 'beatMarker') {
      if (this.draggedMarkerIndex >= 0 && this.draggedMarkerIndex < this.section.beatPoints.length) {
        this.section.beatPoints[this.draggedMarkerIndex] = targetTime;
        this.section.beatPoints.sort((a, b) => a - b);
        if (this.onBeatMarkerChanged) this.onBeatMarkerChanged(this.section.beatPoints);
        this.invalidateStatic();
        this.render();
      }
    } else if (this.draggingTarget === 'pan') {
      const deltaX = e.clientX - this.dragStartX;
      if (Math.abs(deltaX) > 3) {
        const visibleSec = this.audioBuffer.duration / this.zoom;
        const deltaSec = -(deltaX / rect.width) * visibleSec;
        this.setScrollOffset(this.dragStartSec + deltaSec);
      }
    }
  }

  onMouseUp(e) {
    if (this.draggingTarget === 'pan' && !this.hasMovedDrag && this.audioBuffer && e) {
      // Single click on waveform -> seek / cursor position
      const rect = this.canvas.getBoundingClientRect();
      const clickTime = this.xToTime(e.clientX - rect.left);
      if (this.onSeek) {
        this.onSeek(Math.max(0, Math.min(this.audioBuffer.duration, clickTime)));
      }
    }
    this.draggingTarget = null;
    this.draggedMarkerIndex = -1;
    this.hasMovedDrag = false;
  }

  updateCursor(e) {
    if (!this.audioBuffer || !this.section) {
      this.canvas.style.cursor = 'default';
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const trimStartX = this.timeToX(this.section.trimStart);
    const trimEndX = this.timeToX(this.section.trimEnd > 0 ? this.section.trimEnd : this.audioBuffer.duration);

    if (Math.abs(mouseX - trimStartX) <= 8 || Math.abs(mouseX - trimEndX) <= 8) {
      this.canvas.style.cursor = 'ew-resize';
      return;
    }

    if (mouseY <= 40 && this.section.beatPoints) {
      for (const t of this.section.beatPoints) {
        if (Math.abs(mouseX - this.timeToX(t)) <= 6) {
          this.canvas.style.cursor = 'col-resize';
          return;
        }
      }
    }

    this.canvas.style.cursor = 'crosshair';
  }
}
