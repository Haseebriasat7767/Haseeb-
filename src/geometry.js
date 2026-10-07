// geometry.js
// 4D regular polytope (polychoron) definitions: vertices, edges, and 2-faces.
// Pure data + combinatorics -- no rendering dependencies, so it is unit-testable in Node.

export const PHI = (1 + Math.sqrt(5)) / 2;

/* ----------------------------- small utilities ---------------------------- */

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function permParity(p) {
  let inv = 0;
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++)
      if (p[i] > p[j]) inv++;
  return inv % 2; // 0 = even, 1 = odd
}

// All 12 even permutations of [0,1,2,3] (used for 600-cell vertices).
const EVEN_PERMS = permutations([0, 1, 2, 3]).filter((p) => permParity(p) === 0);

function dedupeVertices(verts) {
  const map = new Map();
  const out = [];
  for (const v of verts) {
    const key = v.map((x) => x.toFixed(6)).join(',');
    if (!map.has(key)) {
      map.set(key, out.length);
      out.push(v.slice());
    }
  }
  return { vertices: out, indexOf: (v) => map.get(v.map((x) => x.toFixed(6)).join(',')) };
}

function normalize(vertices, targetRadius = 1) {
  let maxLen = 0;
  for (const v of vertices) {
    const len = Math.hypot(v[0], v[1], v[2], v[3]);
    if (len > maxLen) maxLen = len;
  }
  const s = targetRadius / maxLen;
  return vertices.map((v) => v.map((x) => x * s));
}

/* ------------------------------ edge helpers ------------------------------ */

// edges where predicate(|a-b|^2 or dot) holds. Here we pass a custom test on vertex pair.
function edgesByPredicate(vertices, test) {
  const edges = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (test(vertices[i], vertices[j])) edges.push([i, j]);
  return edges;
}

function edgesByMinDistance(vertices) {
  const n = vertices.length;
  let minSq = Infinity;
  const dists = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = vertices[i][0] - vertices[j][0];
      const dy = vertices[i][1] - vertices[j][1];
      const dz = vertices[i][2] - vertices[j][2];
      const dw = vertices[i][3] - vertices[j][3];
      const d = dx * dx + dy * dy + dz * dz + dw * dw;
      dists.push([i, j, d]);
      if (d < minSq) minSq = d;
    }
  }
  const tol = minSq * 1.0001;
  return dists.filter(([, , d]) => d <= tol).map(([i, j]) => [i, j]);
}

function hamming(a, b) {
  let h = 0;
  for (let k = 0; k < 4; k++) if (a[k] !== b[k]) h++;
  return h;
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/* ------------------------------ face helpers ------------------------------ */

// Triangular 2-faces = triples of mutually-adjacent vertices.
// Valid for the regular polychora whose vertex figure has triangular faces
// (5-cell, 16-cell, 24-cell, 600-cell). The tesseract's 2-faces are squares
// and are generated separately.
function triangularFaces(vertices, edges) {
  const n = vertices.length;
  const adj = Array.from({ length: n }, () => new Set());
  for (const [a, b] of edges) {
    adj[a].add(b);
    adj[b].add(a);
  }
  const seen = new Set();
  const faces = [];
  for (const [a, b] of edges) {
    for (const c of adj[a]) {
      if (c !== b && adj[b].has(c)) {
        const tri = [a, b, c].sort((x, y) => x - y);
        const key = tri.join(',');
        if (!seen.has(key)) {
          seen.add(key);
          faces.push(tri);
        }
      }
    }
  }
  return faces;
}

// Tesseract square faces: choose 2 varying axes + fixed signs for the other 2.
function tesseractSquareFaces(vertices) {
  const { indexOf } = dedupeVertices(vertices);
  const axisPairs = [
    [0, 1], [0, 2], [0, 3],
    [1, 2], [1, 3],
    [2, 3],
  ];
  const faces = [];
  for (const [a, b] of axisPairs) {
    const others = [0, 1, 2, 3].filter((x) => x !== a && x !== b);
    for (const s0 of [1, -1])
      for (const s1 of [1, -1]) {
        const base = [0, 0, 0, 0];
        base[others[0]] = s0;
        base[others[1]] = s1;
        // cycle around the square: (+,+)->(+,-)->(-,-)->(-,+)
        const cyc = [
          [1, 1],
          [1, -1],
          [-1, -1],
          [-1, 1],
        ];
        const face = cyc.map(([va, vb]) => {
          const v = base.slice();
          v[a] = va;
          v[b] = vb;
          return indexOf(v);
        });
        faces.push(face);
      }
  }
  return faces;
}

/* ------------------------------- the shapes ------------------------------- */

function make5Cell() {
  // Regular 4-simplex: 4 unit-axis vertices + 1 symmetric vertex.
  const a = (Math.sqrt(5) - 1) / 4; // ~0.309
  const vertices = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
    [-a, -a, -a, -a],
  ];
  const edges = edgesByPredicate(vertices, () => true); // complete graph K5
  const faces = triangularFaces(vertices, edges); // C(5,3) = 10 triangles
  return finalize('5-cell (pentachoron)', vertices, edges, faces, 5);
}

function makeTesseract() {
  const vertices = [];
  for (let i = 0; i < 16; i++)
    vertices.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1,
    ]);
  const edges = edgesByPredicate(vertices, (a, b) => hamming(a, b) === 1);
  const faces = tesseractSquareFaces(vertices); // 24 squares
  return finalize('Tesseract (8-cell)', vertices, edges, faces, 8);
}

function make16Cell() {
  const vertices = [];
  for (let ax = 0; ax < 4; ax++)
    for (const s of [1, -1]) {
      const v = [0, 0, 0, 0];
      v[ax] = s;
      vertices.push(v);
    }
  // adjacent iff different axes (dot == 0); antipodal pairs (dot == -1) excluded.
  const edges = edgesByPredicate(vertices, (a, b) => dot(a, b) === 0);
  const faces = triangularFaces(vertices, edges); // 32 triangles
  return finalize('16-cell (hexadecachoron)', vertices, edges, faces, 16);
}

function make24Cell() {
  const vertices = [];
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      for (const si of [1, -1])
        for (const sj of [1, -1]) {
          const v = [0, 0, 0, 0];
          v[i] = si;
          v[j] = sj;
          vertices.push(v);
        }
  // adjacent iff dot product == 1.
  const edges = edgesByPredicate(vertices, (a, b) => Math.abs(dot(a, b) - 1) < 1e-9);
  const faces = triangularFaces(vertices, edges); // 96 triangles
  return finalize('24-cell (icositetrachoron)', vertices, edges, faces, 24);
}

function make600Cell() {
  const raw = [];
  // Type A: permutations of (+-2, 0, 0, 0)  -> 8
  for (let ax = 0; ax < 4; ax++)
    for (const s of [1, -1]) {
      const v = [0, 0, 0, 0];
      v[ax] = s * 2;
      raw.push(v);
    }
  // Type B: (+-1, +-1, +-1, +-1)  -> 16
  for (let i = 0; i < 16; i++)
    raw.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1,
    ]);
  // Type C: even permutations of (+-phi, +-1, +-1/phi, 0)  -> 96
  const invPhi = 1 / PHI;
  for (const sPhi of [1, -1])
    for (const s1 of [1, -1])
      for (const sR of [1, -1]) {
        const base = [sPhi * PHI, s1 * 1, sR * invPhi, 0];
        for (const p of EVEN_PERMS) raw.push(p.map((idx) => base[idx]));
      }
  const { vertices } = dedupeVertices(raw);
  const edges = edgesByMinDistance(vertices); // 720
  const faces = triangularFaces(vertices, edges); // 1200 triangles
  return finalize('600-cell (hexacosichoron)', vertices, edges, faces, 600);
}

function center(vertices) {
  // subtract the centroid so the shape orbits cleanly around the origin
  const c = [0, 0, 0, 0];
  for (const v of vertices)
    for (let k = 0; k < 4; k++) c[k] += v[k];
  for (let k = 0; k < 4; k++) c[k] /= vertices.length;
  return vertices.map((v) => v.map((x, k) => x - c[k]));
}

function finalize(name, vertices, edges, faces, cellCount) {
  const norm = normalize(center(vertices), 1);
  // re-map edge/face indices through the dedupe that normalize preserved (same order)
  return {
    name,
    vertices: norm,
    edges,
    faces,
    cells: cellCount,
    counts: {
      vertices: norm.length,
      edges: edges.length,
      faces: faces.length,
      cells: cellCount,
    },
  };
}

export const SHAPES = [
  make5Cell(),
  makeTesseract(),
  make16Cell(),
  make24Cell(),
  make600Cell(),
];

export function getShape(index) {
  return SHAPES[((index % SHAPES.length) + SHAPES.length) % SHAPES.length];
}
