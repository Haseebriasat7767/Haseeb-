// Node test: drive the real Renderer class with a mock WebGL2 context to
// verify setShape() + render() run without errors for every shape and produce
// sane buffer sizes / draw calls. This catches runtime typos, bad buffer
// sizing, and WebGL API misuse in the render path (not GLSL semantics).

import { Renderer } from '../src/renderer.js';
import { SHAPES } from '../src/geometry.js';

// renderer.js reads window.devicePixelRatio in _resize()
globalThis.window = { devicePixelRatio: 1 };

/* ----------------------------- mock WebGL2 -------------------------------- */

const CONST = {
  COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4,
  ARRAY_BUFFER: 5, ELEMENT_ARRAY_BUFFER: 6, STATIC_DRAW: 7, FLOAT: 8,
  UNSIGNED_SHORT: 9, BLEND: 10, COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x100,
  DEPTH_TEST: 11, LESS: 12, ONE: 13, SRC_ALPHA: 14, ONE_MINUS_SRC_ALPHA: 15,
  TRIANGLES: 16, LINES: 17, POINTS: 18,
};

let attribCounter = 0;
const draws = [];
const buffers = new Map();
let curElementBuffer = null;

const gl = {
  ...CONST,
  createShader: () => ({}),
  shaderSource: () => {},
  compileShader: () => {},
  getShaderParameter: () => true,
  getShaderInfoLog: () => '',
  createProgram: () => ({}),
  attachShader: () => {},
  linkProgram: () => {},
  getProgramParameter: () => true,
  getProgramInfoLog: () => '',
  getAttribLocation: () => attribCounter++ % 8,
  getUniformLocation: (p, name) => ({ name }),
  createVertexArray: () => ({}),
  bindVertexArray: () => {},
  createBuffer: () => ({}),
  bindBuffer: (target, buf) => {
    if (target === CONST.ELEMENT_ARRAY_BUFFER) curElementBuffer = buf;
  },
  bufferData: (target, data, usage) => {
    buffers.set(curElementBuffer ?? 'array', { bytes: data.byteLength, count: data.length });
  },
  enableVertexAttribArray: () => {},
  vertexAttribPointer: () => {},
  viewport: () => {},
  enable: () => {},
  disable: () => {},
  clearColor: () => {},
  clear: () => {},
  useProgram: () => {},
  uniformMatrix4fv: () => {},
  uniform1f: () => {},
  uniform3f: () => {},
  depthMask: () => {},
  depthFunc: () => {},
  blendFunc: () => {},
  drawElements: (mode, count, type, offset) => {
    draws.push({ mode, count, type });
  },
};

const canvas = {
  clientWidth: 800,
  clientHeight: 600,
  width: 800,
  height: 600,
  getContext: () => gl,
};

/* --------------------------------- run ------------------------------------ */

let failures = 0;
function check(name, cond) {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
}

const renderer = new Renderer(canvas);
check('Renderer constructs with mock WebGL2', !!renderer);

for (const shape of SHAPES) {
  draws.length = 0;
  renderer.setShape(shape);
  // verify index buffer sizes match the combinatorics
  const n = shape.vertices.length;
  check(`${shape.name}: vertex count = ${n}`, renderer.vertexCount === n);
  check(`${shape.name}: edge index count = ${shape.edges.length * 2}`,
    renderer.edgeCount === shape.edges.length * 2);
  const triCount = shape.faces.reduce((s, f) => s + (f.length - 2), 0) * 3;
  check(`${shape.name}: face index count = ${triCount}`,
    renderer.faceCount === triCount);

  // render all three passes
  renderer.state.showFaces = true;
  renderer.state.showEdges = true;
  renderer.state.showVertices = true;
  let threw = null;
  try { renderer.render(); } catch (e) { threw = e; }
  check(`${shape.name}: render() runs without error`, !threw);
  if (threw) console.log('   ->', threw.message);

  const modes = draws.map((d) => d.mode);
  check(`${shape.name}: drew faces+edges+vertices (${draws.length} draw calls)`,
    draws.length === 3 &&
    modes.includes(CONST.TRIANGLES) &&
    modes.includes(CONST.LINES) &&
    modes.includes(CONST.POINTS));

  // toggle passes off
  draws.length = 0;
  renderer.state.showFaces = false;
  renderer.state.showEdges = false;
  renderer.state.showVertices = false;
  renderer.render();
  check(`${shape.name}: all passes hidden -> 0 draw calls`, draws.length === 0);
}

// scheme switching rebuilds without error
for (const scheme of ['rainbow', 'heat', 'cool', 'mono']) {
  let threw = null;
  try { renderer.setScheme(scheme); renderer.render(); } catch (e) { threw = e; }
  check(`scheme '${scheme}' renders without error`, !threw);
}

console.log(failures === 0 ? '\nAll renderer-mock checks passed.' : `\n${failures} FAILURE(S).`);
process.exit(failures === 0 ? 0 : 1);
