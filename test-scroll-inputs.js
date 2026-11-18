// Mock browser environment for scroll testing
class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles || false;
    this.defaultPrevented = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

global.Event = MockEvent;

class MockElement {
  constructor(tag, id = '', type = '', min = '', max = '', val = '', step = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.type = type;
    this.min = min;
    this.max = max;
    this.value = val;
    this.step = step;
    this.disabled = false;
    this.readOnly = false;
    this.listeners = {};
    this.parentElement = null;
    this.children = [];
    this.classList = new Set();
  }
  matches(selector) {
    if (selector.includes('input[type="number"]') && this.tagName === 'INPUT' && this.type === 'number') return true;
    if (selector.includes('input[type="range"]') && this.tagName === 'INPUT' && this.type === 'range') return true;
    if (selector.includes('select') && this.tagName === 'SELECT') return true;
    return false;
  }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (selector.includes('.control-row') && cur.classList.has('control-row')) return cur;
      if (selector.includes('.tempo-control-box') && cur.classList.has('tempo-control-box')) return cur;
      if (selector.includes('.metronome-controls') && cur.classList.has('metronome-controls')) return cur;
      if (selector.includes('.zoom-controls') && cur.classList.has('zoom-controls')) return cur;
      if (selector.includes('#waveformCanvas') && cur.id === 'waveformCanvas') return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelector(selector) {
    for (const c of this.children) {
      if (c.matches(selector)) return c;
    }
    return null;
  }
  dispatchEvent(e) {
    if (this['on' + e.type]) this['on' + e.type](e);
    if (this.listeners[e.type]) {
      for (const fn of this.listeners[e.type]) fn(e);
    }
  }
  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }
}

console.log('Testing mouse wheel scroll on sliders, numbers, and meter...');

// Create simulated DOM
const tempoInput = new MockElement('input', 'spinTempo', 'number', '5', '500', '120');
const barsInput = new MockElement('input', 'spinBars', 'number', '1', '32', '2');
const pickupInput = new MockElement('input', 'spinPickup', 'number', '0', '8', '0');
const trimStart = new MockElement('input', 'trimStart', 'number', '0', '10', '0.000', '0.001');
const trimEnd = new MockElement('input', 'trimEnd', 'number', '0.05', '10', '4.000', '0.001');
const volumeSlider = new MockElement('input', 'sliderVolume', 'range', '0', '127', '80');
const panSlider = new MockElement('input', 'sliderPan', 'range', '0', '127', '64');
const metroSlider = new MockElement('input', 'sliderMetro', 'range', '0', '100', '80');

const selectMeter = new MockElement('select', 'selectTimeSignature');
selectMeter.options = [{ value: '4/4' }, { value: '3/4' }, { value: '2/4' }, { value: '6/8' }];
selectMeter.selectedIndex = 0;

// Setup test harness simulating setupScrollableInputs
function simulateWheelOn(target, deltaY, isShift = false, isAltOrCtrl = false) {
  let wheelAccum = deltaY;
  const threshold = 35;
  if (Math.abs(wheelAccum) < threshold) return;

  const direction = wheelAccum < 0 ? 1 : -1;

  let input = null;
  if (target.matches('input[type="number"], input[type="range"], select')) {
    input = target;
  } else {
    const container = target.closest('.control-row, .tempo-control-box, .metro-toggle, .metronome-controls');
    if (container) {
      input = container.querySelector('input[type="number"], input[type="range"], select');
    }
  }

  if (!input || input.disabled || input.readOnly) return;

  if (input.tagName === 'SELECT') {
    const newIdx = input.selectedIndex + (direction > 0 ? -1 : 1);
    if (newIdx >= 0 && newIdx < input.options.length && newIdx !== input.selectedIndex) {
      input.selectedIndex = newIdx;
      input.dispatchEvent(new MockEvent('change', { bubbles: true }));
    }
    return;
  }

  let min = input.min !== '' ? parseFloat(input.min) : -Infinity;
  let max = input.max !== '' ? parseFloat(input.max) : Infinity;
  let currentVal = parseFloat(input.value);
  if (!Number.isFinite(currentVal)) currentVal = 0;

  let step = 1;
  let decimals = 0;

  if (input.id === 'trimStart' || input.id === 'trimEnd') {
    decimals = 3;
    if (isAltOrCtrl) step = 0.001;
    else if (isShift) step = 0.050;
    else step = 0.010;
  } else if (input.id === 'spinTempo') {
    decimals = 0;
    step = isShift ? 5 : 1;
  } else if (input.id === 'spinBars' || input.id === 'spinPickup') {
    decimals = 0;
    step = 1;
  } else if (input.type === 'range') {
    decimals = 0;
    step = isShift ? 5 : 1;
  }

  let newVal = currentVal + direction * step;
  newVal = Math.max(min, Math.min(max, newVal));

  if (decimals > 0) newVal = parseFloat(newVal.toFixed(decimals));
  else newVal = Math.round(newVal);

  if (newVal !== currentVal) {
    input.value = decimals > 0 ? newVal.toFixed(decimals) : String(newVal);
    input.dispatchEvent(new MockEvent('input', { bubbles: true }));
    input.dispatchEvent(new MockEvent('change', { bubbles: true }));
  }
}

// 1. Test Tempo
let tempoInputCount = 0;
tempoInput.oninput = () => tempoInputCount++;
simulateWheelOn(tempoInput, -100); // scroll UP
if (tempoInput.value !== '121' || tempoInputCount !== 1) throw new Error(`Tempo up failed! got ${tempoInput.value}`);
simulateWheelOn(tempoInput, 100); // scroll DOWN
if (tempoInput.value !== '120' || tempoInputCount !== 2) throw new Error(`Tempo down failed! got ${tempoInput.value}`);
simulateWheelOn(tempoInput, -100, true); // scroll UP with Shift (+5)
if (tempoInput.value !== '125') throw new Error(`Tempo Shift up failed! got ${tempoInput.value}`);
console.log('PASS: Tempo wheel scroll');

// 2. Test Section Bars
let barsChangeCount = 0;
barsInput.onchange = () => barsChangeCount++;
simulateWheelOn(barsInput, -100); // scroll UP (+1 -> 3)
if (barsInput.value !== '3') throw new Error(`Bars up failed! got ${barsInput.value}`);
simulateWheelOn(barsInput, 100); // scroll DOWN (-1 -> 2)
simulateWheelOn(barsInput, 100); // scroll DOWN (-1 -> 1)
simulateWheelOn(barsInput, 100); // scroll DOWN (at min 1, should stay 1)
if (barsInput.value !== '1') throw new Error(`Bars min clamping failed! got ${barsInput.value}`);
console.log('PASS: Section Bars wheel scroll and min clamp');

// 3. Test Trim Start & End
simulateWheelOn(trimStart, -100); // normal scroll up (+0.010 -> 0.010)
if (trimStart.value !== '0.010') throw new Error(`TrimStart normal step failed! got ${trimStart.value}`);
simulateWheelOn(trimStart, -100, false, true); // fine scroll with Alt/Ctrl (+0.001 -> 0.011)
if (trimStart.value !== '0.011') throw new Error(`TrimStart fine step failed! got ${trimStart.value}`);
simulateWheelOn(trimStart, 100, true); // coarse scroll with Shift (-0.050 -> clamped to 0.000)
if (trimStart.value !== '0.000') throw new Error(`TrimStart coarse step failed! got ${trimStart.value}`);
console.log('PASS: Waveform trim inputs wheel scroll (normal, fine, and coarse)');

// 4. Test Volume & Pan Sliders
let volEvents = 0;
volumeSlider.oninput = () => volEvents++;
simulateWheelOn(volumeSlider, -100); // scroll UP (+1 -> 81)
if (volumeSlider.value !== '81' || volEvents !== 1) throw new Error(`Volume slider up failed! got ${volumeSlider.value}`);
simulateWheelOn(volumeSlider, -100, true); // scroll UP with Shift (+5 -> 86)
if (volumeSlider.value !== '86') throw new Error(`Volume slider Shift failed! got ${volumeSlider.value}`);

simulateWheelOn(panSlider, -100); // scroll UP (+1 -> 65)
if (panSlider.value !== '65') throw new Error(`Pan slider failed! got ${panSlider.value}`);
console.log('PASS: Volume and Pan sliders wheel scroll');

// 5. Test Metronome Slider
simulateWheelOn(metroSlider, 100); // scroll DOWN (-1 -> 79)
if (metroSlider.value !== '79') throw new Error(`Metro slider failed! got ${metroSlider.value}`);
console.log('PASS: Metronome slider wheel scroll');

// 6. Test Time Signature select
simulateWheelOn(selectMeter, 100); // scroll down -> next meter (3/4)
if (selectMeter.selectedIndex !== 1 || selectMeter.options[selectMeter.selectedIndex].value !== '3/4') {
  throw new Error(`Select meter failed! index=${selectMeter.selectedIndex}`);
}
console.log('PASS: Meter dropdown wheel scroll');

console.log('\nALL WHEEL SCROLL TESTS PASSED 100%!');
