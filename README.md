<p align="center">
  <img src="assets/logo.png" alt="Audio Style Slicer Logo" width="160">
</p>

<h1 align="center">Audio Style Slicer</h1>

<p align="center">
  <strong>Audio Phraser Web Version</strong> — Universal Web Workstation for Creating Yamaha Audio Styles
</p>

---

## 🎹 Overview & Description

**Audio Style Slicer** (**Audio Phraser Web Version**) is a complete, full-featured web-based audio workstation for slicing rhythm loops and creating custom **Yamaha Audio Styles (`.aus`)**. Designed as an accessible, high-performance web edition of Yamaha's Audio Phraser desktop utility, it runs directly in all modern web browsers (Chrome, Edge, Firefox, Safari, iOS, and Android) with zero installation, zero server dependencies, and client-side hardware-accelerated audio processing.

Musicians and producers can transform standard `.wav`, `.mp3`, `.aiff`, `.flac`, and `.ogg` rhythm loops into authentic, tempo-synced Yamaha Arranger Audio Styles compatible with:
- **Yamaha Genos & Genos 2**
- **Yamaha Tyros 5**
- **Yamaha PSR-SX920, PSR-SX900, PSR-SX720, PSR-SX700**
- **Yamaha PSR-S975 & PSR-S970**

---

## 🚀 Key Features

### 1. Complete 15 Yamaha Style Sections
- **Intros**: Intro 1 (Intro A), Intro 2 (Intro B), Intro 3 (Intro C)
- **Mains**: Main A, Main B, Main C, Main D
- **Fills**: Fill In A (Fill In AA), Fill In B (Fill In BB), Fill In C (Fill In CC), Fill In DD
- **Break**: Break (Fill In BA)
- **Endings**: Ending 1 (Ending A), Ending 2 (Ending B), Ending 3 (Ending C)
- Per-section bar length control (1 to 32 bars) and pickup beats.

### 2. High-DPI Interactive Waveform Editor
- Real-time zoom from 1.0x to 64.0x with dedicated zoom controls and wheel zooming.
- Interactive, draggable **Trim Start** (IN) and **Trim End** (OUT) handles with sub-millisecond precision.
- Drag-to-pan scrubbing and horizontal scroll navigation.
- Anti-click **Fade In / Fade Out** edge smoothing.
- Real-time 60fps playhead tracking during auditioning.

### 3. Client-Side Beat & Tempo Analysis
- Energy and spectral flux onset detection.
- Autocorrelation tempo estimation (60–220 BPM).
- **2X** (double tempo) and **/2** (half tempo) instant grid re-quantization.
- **Shift Beat Position** toggle to instantly correct upbeat/downbeat phase.
- Interactive, draggable beat markers for manual fine-tuning.

### 4. WSOLA Pitch-Preserving Time-Stretching
- Built-in **WSOLA (Waveform Similarity Overlap-Add)** audio processor.
- Change the master style tempo (5 to 500 BPM) with real-time pitch preservation.
- Live time-stretch ratio monitor: `[Section length] X sec - [Wave length] Y sec - [Time stretch] Z %`.

### 5. Yamaha Metronome Engine
- Integrated downbeat accent click (`Metro1.wav`) and regular beat tick (`Metro2.wav`).
- Real-time Web Audio lookahead scheduling synchronized with loop playback.
- Metronome volume slider and mute toggle.

### 6. Full Yamaha Exporter & Project Management
- **Export Audio Style (`.aus`)**: Merges the Yamaha SFF2 base structure (`Empty.sty`) with Yamaha `AASM` (Audio CASM), `ASEG`, `Adec`, `AMix`, and `AWav`/`AInf` chunks containing 44.1kHz 16-bit PCM WAV audio and `BPnt` beat tables. Load directly via USB stick into your Yamaha keyboard!
- **Save / Open Projects (`.approj`)**: Save complete arrangements, audio links, and marker layouts to revisit anytime.
- **Export Section WAV**: Export individual trimmed loops as standard 44.1kHz WAV files.

---

## 🛠️ Development & Usage

### Start Development Server
```bash
npm run dev
```
Open [http://localhost:5174](http://localhost:5174) in your browser.

### Build Production Bundle
```bash
npm run build
```
The optimized, standalone production files will be output to `dist/`.

### Preview Production Build
```bash
npm run preview
```

### Run Module Tests
```bash
npm test
```

---

## 📄 License & Attribution
- Based on Yamaha Audio Phraser specifications.
- `Empty.sty` and metronome audio assets copyright &copy; Yamaha Corporation.
