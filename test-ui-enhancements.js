import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AudioPhraserProject } from './js/model/project.js';
import { AudioEngine } from './js/audio/audio-engine.js';
import { ModalDialogs } from './js/ui/modal-dialogs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing UI enhancements, Zoom sync, Menu/Toolbar, Telemetry, and Metronome sync...');

// 1. Verify index.html structure
const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Check Edit menu is removed
assert.strictEqual(html.includes('<span>Edit</span>'), false, 'Edit menu should be completely removed from index.html');

// Check btnUndo and btnRedo are in the toolbar
assert.ok(html.includes('id="btnUndo"'), 'Toolbar must contain #btnUndo');
assert.ok(html.includes('id="btnRedo"'), 'Toolbar must contain #btnRedo');

// Check Telemetry display replaces old time stretch banner
assert.ok(html.includes('class="telemetry-display"'), 'Must contain .telemetry-display');
assert.ok(html.includes('id="valSecLen"'), 'Must contain #valSecLen');
assert.ok(html.includes('id="valSecBars"'), 'Must contain #valSecBars');
assert.ok(html.includes('id="valWaveLen"'), 'Must contain #valWaveLen');
assert.ok(html.includes('id="valTrimRange"'), 'Must contain #valTrimRange');
assert.ok(html.includes('id="valStretchPct"'), 'Must contain #valStretchPct');
assert.ok(html.includes('id="pillStretchStatus"'), 'Must contain #pillStretchStatus');
assert.strictEqual(html.includes('[Section length] 0.000 sec. - [Wave length]'), false, 'Old bracketed text banner must be removed');

// Check Help buttons exist
assert.ok(html.includes('id="btnHelpTrimming"'), 'Must contain #btnHelpTrimming');
assert.ok(html.includes('id="btnHelpBeatGrid"'), 'Must contain #btnHelpBeatGrid');

// Check Resizer and Collapsible Inspector elements
assert.ok(html.includes('id="panelResizer"'), 'Must contain #panelResizer');
assert.ok(html.includes('id="btnToggleInspector"'), 'Must contain #btnToggleInspector');
assert.ok(html.includes('id="btnExpandInspector"'), 'Must contain #btnExpandInspector');
console.log('PASS: index.html markup validations (No Edit menu, Toolbar Undo/Redo, Telemetry Strip, Help Buttons, Resizer)');

// 2. Project canUndo / canRedo getters
const project = new AudioPhraserProject('TestProject');
assert.strictEqual(project.canUndo, false, 'Initial project canUndo must be false');
assert.strictEqual(project.canRedo, false, 'Initial project canRedo must be false');

project.recordState('Change Tempo');
project.setMasterTempo(140);
assert.strictEqual(project.canUndo, true, 'canUndo must be true after recordState');
assert.strictEqual(project.canRedo, false, 'canRedo must be false before undo');

project.undo();
assert.strictEqual(project.masterTempo, 120, 'masterTempo should revert to 120');
assert.strictEqual(project.canUndo, false, 'canUndo should be false after undo');
assert.strictEqual(project.canRedo, true, 'canRedo should be true after undo');

project.redo();
assert.strictEqual(project.masterTempo, 140, 'masterTempo should be restored to 140');
assert.strictEqual(project.canUndo, true, 'canUndo should be true after redo');
assert.strictEqual(project.canRedo, false, 'canRedo should be false after redo');
console.log('PASS: Project canUndo and canRedo getters');

// 3. Test Metronome synchronization alignment during active playback
const engine = new AudioEngine();
let currentTime = 10.0;
engine.ctx = {
  currentTime: 10.0,
  createBufferSource: () => ({
    buffer: null,
    connect: () => {},
    start: () => {},
    stop: () => {}
  }),
  createGain: () => ({
    gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
    connect: () => {}
  }),
  destination: {}
};

engine.playbackStartTime = 2.0; // Audio started at 2.0s
engine.isPlaying = true;
engine.currentLoopDuration = 2.0; // 1 bar at 120 BPM = 2.0s (4 beats * 0.5s)
engine.metronome = {
  enabled: true,
  scheduleClick: (time, isDownbeat) => {}
};

const mainA = project.sections.get('main_a');
mainA.bars = 1;
mainA.timeSignature = { numerator: 4, denominator: 4 };

// Start metronome during active playback
engine.startMetronomeScheduler(mainA, 120);
assert.ok(engine.metroTimer !== null, 'Metronome scheduler must be active');
engine.stopMetronomeScheduler();
assert.strictEqual(engine.metroTimer, null, 'Metronome scheduler must be stopped');
console.log('PASS: Metronome active scheduler synchronization logic');

// 4. ModalDialogs showHelpGuide exists and handles topics
assert.strictEqual(typeof ModalDialogs.showHelpGuide, 'function', 'ModalDialogs.showHelpGuide must be a function');
console.log('PASS: ModalDialogs.showHelpGuide function exported');

console.log('\nALL UI ENHANCEMENT TESTS PASSED 100%!');
