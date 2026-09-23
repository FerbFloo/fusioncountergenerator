import {
  generateSettingContent,
  calculateOdometerState,
  buildCliCommand
} from './counterEngine.js';

// DOM Elements
const inputStart = document.getElementById('input-start');
const inputEnd = document.getElementById('input-end');
const inputDuration = document.getElementById('input-duration');
const selectEasing = document.getElementById('select-easing');
const inputFps = document.getElementById('input-fps');
const inputStartFrame = document.getElementById('input-start-frame');

const inputFont = document.getElementById('input-font');
const inputStyle = document.getElementById('input-style');
const inputSize = document.getElementById('input-size');
const inputColor = document.getElementById('input-color');
const colorHexLabel = document.getElementById('color-hex-label');
const inputWidthFactor = document.getElementById('input-width-factor');
const inputCellFactor = document.getElementById('input-cell-factor');

const btnCopyNodes = document.getElementById('btn-copy-nodes');
const btnDownload = document.getElementById('btn-download');
const btnCopyCli = document.getElementById('btn-copy-cli');
const cliOutput = document.getElementById('cli-output');
const presetBtns = document.querySelectorAll('.btn-preset');

const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const scrubber = document.getElementById('timeline-scrubber');
const timeDisplay = document.getElementById('time-display');
const frameBadge = document.getElementById('preview-frame-badge');
const calculatedValueEl = document.getElementById('calculated-value');
const toastEl = document.getElementById('toast');

// Player State
let isPlaying = true;
let currentProgress = 0; // 0 to 1
let lastTimestamp = 0;

function hexToRgbNormalized(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255
  ];
}

function getParams() {
  const start = parseFloat(inputStart.value) || 0;
  const end = parseFloat(inputEnd.value) || 0;
  const duration = Math.max(0.1, parseFloat(inputDuration.value) || 5);
  const easing = selectEasing.value || 'inout';
  const fps = parseFloat(inputFps.value) || 25;
  const startFrame = parseFloat(inputStartFrame.value) || 0;

  const font = inputFont.value.trim() || 'Open Sans';
  const style = inputStyle.value.trim() || 'Bold';
  const size = parseFloat(inputSize.value) || 0.25;
  const color = hexToRgbNormalized(inputColor.value);
  const widthFactor = parseFloat(inputWidthFactor.value) || 0.80;
  const cellFactor = parseFloat(inputCellFactor.value) || 1.25;

  return {
    start,
    end,
    duration,
    easing,
    fps,
    startFrame,
    font,
    style,
    size,
    color,
    widthFactor,
    cellFactor
  };
}

function updateCliPreview() {
  const p = getParams();
  cliOutput.textContent = buildCliCommand(p);
}

// Show Toast Notification
let toastTimeout;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2500);
}

// Copy Text Helper
async function copyToClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(successMsg);
  }
}

// Canvas Preview Rendering Engine
function renderCanvas() {
  const params = getParams();
  const W = canvas.width;
  const H = canvas.height;

  // Clear Canvas
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, W, H);

  // Grid background effect
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < W; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Calculate Odometer state
  const state = calculateOdometerState(params.start, params.end, currentProgress, params.easing);
  calculatedValueEl.textContent = state.currentVal.toFixed(2);

  const totalFrames = Math.round(params.duration * params.fps);
  const currentFrame = Math.round(currentProgress * totalFrames);
  const currentTimeSec = (currentProgress * params.duration).toFixed(2);

  frameBadge.textContent = `Frame ${currentFrame} / ${totalFrames}`;
  timeDisplay.textContent = `${currentTimeSec}s / ${params.duration.toFixed(2)}s`;
  scrubber.value = (currentProgress * 100).toFixed(1);

  // Window Mask bounds
  const cellHeightPx = params.cellFactor * params.size * H;
  const maskTop = (H - cellHeightPx) / 2;
  const maskBottom = (H + cellHeightPx) / 2;

  // Draw Mask Outline Overlay
  ctx.fillStyle = 'rgba(99, 102, 241, 0.06)';
  ctx.fillRect(0, maskTop, W, cellHeightPx);
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, maskTop, W, cellHeightPx);

  // Render Digit Wheels
  const spacingPx = (params.widthFactor * params.size * H) / (16 / 9);
  const totalWidth = (state.ndig - 1) * spacingPx;
  const startX = (W / 2) + (totalWidth / 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSizePx = Math.round(params.size * H);
  ctx.font = `${params.style} ${fontSizePx}px "${params.font}", sans-serif`;
  ctx.fillStyle = inputColor.value;

  // Clip to mask window for clean odometer look
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, maskTop, W, cellHeightPx);
  ctx.clip();

  state.wheels.forEach((w) => {
    const wheelX = startX - (w.digitIndex * spacingPx);
    const p_i = w.position;

    // Draw digits around current position
    const floorP = Math.floor(p_i);
    for (let d = floorP - 2; d <= floorP + 2; d++) {
      if (d < 0) continue;
      const digitChar = String(Math.abs(d) % 10);

      // Vertical position calculation matching Python: y = 0.5 - (p_i - d) * cell_h
      const yOffset = (p_i - d) * cellHeightPx;
      const digitY = (H / 2) + yOffset;

      ctx.fillText(digitChar, wheelX, digitY);
    }
  });

  ctx.restore();
}

// Animation Loop
function animLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  if (isPlaying) {
    const dur = getParams().duration;
    currentProgress += dt / dur;
    if (currentProgress >= 1) {
      currentProgress = 0;
    }
  }

  renderCanvas();
  requestAnimationFrame(animLoop);
}

// Event Listeners
btnPlayPause.addEventListener('click', () => {
  isPlaying = !isPlaying;
  iconPlay.classList.toggle('hidden', isPlaying);
  iconPause.classList.toggle('hidden', !isPlaying);
});

scrubber.addEventListener('input', (e) => {
  isPlaying = false;
  iconPlay.classList.remove('hidden');
  iconPause.classList.add('hidden');
  currentProgress = parseFloat(e.target.value) / 100;
  renderCanvas();
});

// Update CLI and canvas when inputs change
[inputStart, inputEnd, inputDuration, selectEasing, inputFps, inputStartFrame,
 inputFont, inputStyle, inputSize, inputColor, inputWidthFactor, inputCellFactor].forEach(el => {
  el.addEventListener('input', () => {
    if (el === inputColor) {
      colorHexLabel.textContent = inputColor.value.toUpperCase();
    }
    updateCliPreview();
    renderCanvas();
  });
});

// Presets
presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    inputStart.value = btn.dataset.start;
    inputEnd.value = btn.dataset.end;
    inputDuration.value = btn.dataset.duration;
    selectEasing.value = btn.dataset.easing;

    currentProgress = 0;
    updateCliPreview();
    renderCanvas();
  });
});

// Action: Copy Nodes to Clipboard
btnCopyNodes.addEventListener('click', () => {
  try {
    const params = getParams();
    const settingText = generateSettingContent(params);
    copyToClipboard(settingText, '✨ Nodes copied! Press Cmd+V in Resolve Fusion');
  } catch (err) {
    alert('Error generating counter: ' + err.message);
  }
});

// Action: Download .setting file
btnDownload.addEventListener('click', () => {
  try {
    const params = getParams();
    const settingText = generateSettingContent(params);
    const fileName = `counter_${params.start}_${params.end}.setting`;

    const blob = new Blob([settingText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`📥 Saved ${fileName}`);
  } catch (err) {
    alert('Error generating file: ' + err.message);
  }
});

// Action: Copy CLI command
btnCopyCli.addEventListener('click', () => {
  copyToClipboard(cliOutput.textContent, 'Terminal command copied!');
});

// Initialize
updateCliPreview();
requestAnimationFrame(animLoop);
