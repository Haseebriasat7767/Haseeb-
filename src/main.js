// main.js -- UI wiring + animation loop for the GPU 4D renderer.

import { Renderer } from './renderer.js';
import { SHAPES, getShape } from './geometry.js';

const $ = (id) => document.getElementById(id);

const canvas = $('gl');
const renderer = new Renderer(canvas);

let shapeIndex = 1; // start on the tesseract
let animating = true;
let lastTime = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fpsLast = performance.now();

/* ------------------------------- shape select ----------------------------- */

function applyShape() {
  const shape = getShape(shapeIndex);
  renderer.setShape(shape);
  $('shapeName').textContent = shape.name;
  $('statV').textContent = shape.counts.vertices;
  $('statE').textContent = shape.counts.edges;
  $('statF').textContent = shape.counts.faces;
  $('statC').textContent = shape.counts.cells;
  // populate the shape <select>
  const sel = $('shapeSelect');
  if (sel.options.length !== SHAPES.length) {
    SHAPES.forEach((s, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = s.name;
      sel.appendChild(o);
    });
  }
  sel.value = String(shapeIndex);
}

$('shapeSelect').addEventListener('change', (e) => {
  shapeIndex = parseInt(e.target.value, 10);
  applyShape();
});

/* ------------------------------ 4D rotation UI ---------------------------- */

const PLANE_LABELS = [
  ['xy', 'XY'],
  ['xz', 'XZ'],
  ['xw', 'XW'],
  ['yz', 'YZ'],
  ['yw', 'YW'],
  ['zw', 'ZW'],
];

const planeInputs = {};
for (const [key, label] of PLANE_LABELS) {
  const slider = $(`rot-${key}`);
  const val = $(`rot-${key}-val`);
  const deg = () => (renderer.state.angles[key] * 180 / Math.PI).toFixed(0) + '°';
  val.textContent = deg();
  slider.addEventListener('input', () => {
    renderer.state.angles[key] = parseFloat(slider.value) * Math.PI / 180;
    val.textContent = deg();
  });
  planeInputs[key] = slider;
}

// sensible defaults so the tesseract reads as a "hypercube" immediately
renderer.state.angles = { xy: 0.0, xz: 0.0, xw: 0.55, yz: 0.0, yw: 0.35, zw: 0.0 };
for (const [key] of PLANE_LABELS) {
  planeInputs[key].value = (renderer.state.angles[key] * 180 / Math.PI).toFixed(1);
  $(`rot-${key}-val`).textContent = (renderer.state.angles[key] * 180 / Math.PI).toFixed(0) + '°';
}

/* ------------------------------ other controls ---------------------------- */

$('wCam').addEventListener('input', (e) => {
  renderer.state.wCam = parseFloat(e.target.value);
  $('wCamVal').textContent = renderer.state.wCam.toFixed(2);
});
$('scale').addEventListener('input', (e) => {
  renderer.state.scale = parseFloat(e.target.value);
  $('scaleVal').textContent = renderer.state.scale.toFixed(2);
});
$('fov').addEventListener('input', (e) => {
  renderer.state.fovDeg = parseFloat(e.target.value);
  $('fovVal').textContent = renderer.state.fovDeg.toFixed(0) + '°';
});
$('speed').addEventListener('input', (e) => {
  $('speedVal').textContent = parseFloat(e.target.value).toFixed(2);
});

$('showFaces').addEventListener('change', (e) => (renderer.state.showFaces = e.target.checked));
$('showEdges').addEventListener('change', (e) => (renderer.state.showEdges = e.target.checked));
$('showVertices').addEventListener('change', (e) => (renderer.state.showVertices = e.target.checked));

$('scheme').addEventListener('change', (e) => renderer.setScheme(e.target.value));

$('animate').addEventListener('change', (e) => (animating = e.target.checked));

$('resetView').addEventListener('click', () => {
  renderer.state.yaw = 0.7;
  renderer.state.pitch = -0.35;
  renderer.state.dist = 6.5;
});

$('resetRot').addEventListener('click', () => {
  renderer.state.angles = { xy: 0, xz: 0, xw: 0.55, yz: 0, yw: 0.35, zw: 0 };
  for (const [key] of PLANE_LABELS) {
    planeInputs[key].value = (renderer.state.angles[key] * 180 / Math.PI).toFixed(1);
    $(`rot-${key}-val`).textContent = (renderer.state.angles[key] * 180 / Math.PI).toFixed(0) + '°';
  }
});

/* --------------------------- mouse / touch orbit -------------------------- */

let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  renderer.state.yaw += dx * 0.008;
  renderer.state.pitch += dy * 0.008;
  renderer.state.pitch = Math.max(-1.5, Math.min(1.5, renderer.state.pitch));
});
canvas.addEventListener('pointerup', () => (dragging = false));
canvas.addEventListener('pointercancel', () => (dragging = false));

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.state.dist = Math.max(2.5, Math.min(20, renderer.state.dist * (1 + e.deltaY * 0.001)));
}, { passive: false });

/* ------------------------------ resize handling --------------------------- */

window.addEventListener('resize', () => renderer._resize());

/* ------------------------------- animation -------------------------------- */

// Per-plane auto-rotation rates (rad/s) for a hyperspace drift.
const AUTO_RATES = {
  xy: 0.20,
  xz: 0.13,
  xw: 0.31,
  yz: 0.17,
  yw: 0.24,
  zw: 0.11,
};

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (animating) {
    const speed = parseFloat($('speed').value);
    const a = renderer.state.angles;
    a.xy += AUTO_RATES.xy * speed * dt;
    a.xz += AUTO_RATES.xz * speed * dt;
    a.xw += AUTO_RATES.xw * speed * dt;
    a.yz += AUTO_RATES.yz * speed * dt;
    a.yw += AUTO_RATES.yw * speed * dt;
    a.zw += AUTO_RATES.zw * speed * dt;
    // keep sliders in sync while animating
    for (const [key] of PLANE_LABELS) {
      planeInputs[key].value = ((a[key] * 180 / Math.PI) % 360).toFixed(1);
      $(`rot-${key}-val`).textContent = ((a[key] * 180 / Math.PI) % 360).toFixed(0) + '°';
    }
  }

  renderer.state.time = now / 1000;
  renderer.render();

  // FPS
  fpsAcc += dt;
  fpsFrames++;
  if (now - fpsLast >= 500) {
    $('fps').textContent = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
    fpsLast = now;
  }

  requestAnimationFrame(frame);
}

/* --------------------------------- start ---------------------------------- */

applyShape();
requestAnimationFrame(frame);
