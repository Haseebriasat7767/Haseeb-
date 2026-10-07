# GPU 4D Renderer

An interactive, browser-based **4-dimensional** renderer. The 4D rotation
(six independent plane rotations) and the full **4D → 3D → 2D perspective
projection** are computed **on the GPU** in a WebGL2 vertex shader — the CPU
only uploads uniforms and index buffers.

## What it renders

Regular 4D polytopes (polychora), with correct vertices / edges / faces:

| Shape | Vertices | Edges | Faces | Cells |
|---|---|---|---|---|
| 5-cell (pentachoron) | 5 | 10 | 10 | 5 |
| Tesseract (8-cell) | 16 | 32 | 24 | 8 |
| 16-cell (hexadecachoron) | 8 | 24 | 32 | 16 |
| 24-cell (icositetrachoron) | 24 | 96 | 96 | 24 |
| 600-cell (hexacosichoron) | 120 | 720 | 1200 | 600 |

## How the GPU pipeline works

For every vertex `p = (x, y, z, w)`:

1. **4D rotation** — `p' = R · p`, where `R` is a composed 4×4 matrix of six
   plane rotations (`XY, XZ, XW, YZ, YW, ZW`), built on the CPU and uploaded
   as a uniform. One matrix multiply per vertex on the GPU.
2. **4D → 3D perspective projection** — `s = wCam / (wCam − w)`, `p3 = p'.xyz · s`.
3. **3D view transform** — orbit (yaw/pitch) + dolly, a 4×4 uniform matrix.
4. **3D → 2D perspective** — standard pinhole projection into clip space.

Rendering is three passes:
- **Faces** — translucent triangles, additive blending (glassy glow).
- **Edges** — x-ray wireframe drawn on top (always visible).
- **Vertices** — bright round point sprites.

Per-vertex colours are derived from the vertex's 4D coordinates, so the
colours swirl as the shape rotates through the 4th dimension.

## Controls

- **Shape** — pick a polychoron.
- **4D Rotation** — six sliders (one per rotation plane) + Animate toggle.
- **Projection & View** — W-camera (4D perspective strength), scale, FOV, speed.
- **Display** — toggle faces / edges / vertices, choose a colour scheme.
- **Mouse / touch** — drag to orbit the 3D view, scroll to zoom.

## Run

```bash
node server.js
# then open http://localhost:8000
```

Requires a WebGL2-capable browser (any modern browser). Rendering uses the
GPU via WebGL2 (`powerPreference: 'high-performance'`).

## Files

- `index.html`, `style.css` — page and UI.
- `src/geometry.js` — 4D polytope data (vertices, edges, faces). Pure JS,
  unit-testable in Node.
- `src/renderer.js` — WebGL2 renderer + the GPU vertex/fragment shaders.
- `src/main.js` — UI wiring and the animation loop.
- `server.js` — static file server.
- `test/geometry.test.mjs` — Node test verifying polytope counts.
