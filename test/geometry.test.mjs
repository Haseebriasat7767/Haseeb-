// Node test: verify the 4D polytope combinatorics against known values.
import { SHAPES } from '../src/geometry.js';

const EXPECTED = {
  '5-cell (pentachoron)':        { v: 5,   e: 10,  f: 10,   c: 5 },
  'Tesseract (8-cell)':          { v: 16,  e: 32,  f: 24,   c: 8 },
  '16-cell (hexadecachoron)':    { v: 8,   e: 24,  f: 32,   c: 16 },
  '24-cell (icositetrachoron)':  { v: 24,  e: 96,  f: 96,   c: 24 },
  '600-cell (hexacosichoron)':   { v: 120, e: 720, f: 1200, c: 600 },
};

let failures = 0;
for (const shape of SHAPES) {
  const exp = EXPECTED[shape.name];
  const got = {
    v: shape.counts.vertices,
    e: shape.counts.edges,
    f: shape.counts.faces,
    c: shape.counts.cells,
  };
  const ok =
    got.v === exp.v && got.e === exp.e && got.f === exp.f && got.c === exp.c;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${shape.name.padEnd(28)} ` +
    `V=${got.v}/${exp.v}  E=${got.e}/${exp.e}  F=${got.f}/${exp.f}  C=${got.c}/${exp.c}`
  );

  // sanity: every edge/face index is in range
  const n = shape.vertices.length;
  for (const [a, b] of shape.edges) {
    if (a < 0 || a >= n || b < 0 || b >= n) { console.log('  bad edge index'); failures++; break; }
  }
  for (const f of shape.faces) {
    for (const idx of f) {
      if (idx < 0 || idx >= n) { console.log('  bad face index'); failures++; break; }
    }
    if (f.length < 3) { console.log('  face with <3 verts'); failures++; break; }
  }
}

// sanity: every vertex is unit length after normalization
for (const shape of SHAPES) {
  for (const v of shape.vertices) {
    const len = Math.hypot(v[0], v[1], v[2], v[3]);
    if (Math.abs(len - 1) > 1e-6) { console.log(`  ${shape.name}: vertex not unit (${len})`); failures++; break; }
  }
}

console.log(failures === 0 ? '\nAll geometry checks passed.' : `\n${failures} FAILURE(S).`);
process.exit(failures === 0 ? 0 : 1);
