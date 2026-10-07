// renderer.js
// WebGL2 renderer. The 4D rotation (six plane rotations composed into one 4x4
// matrix) and the 4D -> 3D -> 2D perspective projection all run on the GPU in
// the vertex shader. The CPU only uploads uniforms and index buffers.

/* ------------------------------ mat4 helpers ------------------------------ */
// Matrices are column-major Float32Array(16), ready for uniformMatrix4fv.

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

// Rotation in the (i,j) plane by theta: i' = i cos - j sin, j' = i sin + j cos.
export function mat4PlaneRotation(i, j, theta) {
  const m = mat4Identity();
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  m[i * 4 + i] = c;
  m[j * 4 + i] = -s; // M[i][j]
  m[i * 4 + j] = s; //  M[j][i]
  m[j * 4 + j] = c;
  return m;
}

export function mat4Translation(tx, ty, tz) {
  const m = mat4Identity();
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  return m;
}

// Compose the six 4D plane rotations into a single 4x4 matrix.
// Applied to a vector, Rxy acts first, Rzw last.
export function compose4DRotation(a) {
  const planes = [
    [0, 1, a.xy],
    [0, 2, a.xz],
    [0, 3, a.xw],
    [1, 2, a.yz],
    [1, 3, a.yw],
    [2, 3, a.zw],
  ];
  let rot = mat4Identity();
  for (const [i, j, ang] of planes) rot = mat4Mul(mat4PlaneRotation(i, j, ang), rot);
  return rot;
}

// 3D view matrix: translate back, then orbit (yaw around Y, pitch around X).
export function composeView(yaw, pitch, dist) {
  const rx = mat4PlaneRotation(1, 2, pitch); // X axis = 1, Z axis = 2 in 3D
  const ry = mat4PlaneRotation(0, 2, yaw); // X = 0, Z = 2
  const t = mat4Translation(0, 0, -dist);
  return mat4Mul(t, mat4Mul(ry, rx));
}

/* --------------------------------- shaders -------------------------------- */

const VERT = `#version 300 es
precision highp float;

in vec4 a_pos;   // 4D position (x, y, z, w)
in vec4 a_col;   // per-vertex colour

uniform mat4  u_rot4;     // composed 4D rotation
uniform mat4  u_view;     // 3D view (orbit + translate)
uniform float u_wCam;     // 4D camera distance (perspective strength)
uniform float u_fov;      // 1 / tan(fovY/2)
uniform float u_aspect;
uniform float u_zA;       // depth mapping coefficients
uniform float u_zB;
uniform float u_zNear;
uniform float u_zFar;
uniform float u_pointScale;

out vec4  v_col;
out float v_w;      // rotated 4th coordinate (for colour shading)
out float v_depth;  // normalised view depth (for fog)

void main() {
  // --- 4D rotation (GPU) ---
  vec4 p = u_rot4 * a_pos;

  // --- 4D -> 3D perspective projection (GPU) ---
  float s = u_wCam / (u_wCam - p.w);
  vec3 p3 = p.xyz * s;

  // --- 3D view transform (GPU) ---
  vec4 v = u_view * vec4(p3, 1.0);
  float viewZ = v.z;
  float zw = -viewZ; // positive depth in front of camera

  // --- 3D -> 2D perspective (GPU) ---
  gl_Position = vec4(
    v.x * u_fov / u_aspect,
    v.y * u_fov,
    u_zA * viewZ + u_zB,
    zw
  );

  v_col   = a_col;
  v_w     = p.w;
  v_depth = clamp((zw - u_zNear) / (u_zFar - u_zNear), 0.0, 1.0);

  gl_PointSize = clamp(u_pointScale / max(zw, 0.001), 1.0, 64.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

in vec4  v_col;
in float v_w;
in float v_depth;

uniform vec3  u_fog;
uniform float u_time;
uniform float u_rgbScale;
uniform float u_alphaScale;
uniform float u_isPoint;

out vec4 frag;

void main() {
  vec3 c = v_col.rgb * u_rgbScale;

  // subtle shimmer driven by the 4th coordinate + time
  float wshade = 0.72 + 0.28 * sin(v_w * 2.5 + u_time * 0.6);
  c *= wshade;

  // depth fog toward the background colour
  c = mix(c, u_fog, clamp(v_depth, 0.0, 1.0) * 0.55);

  float alpha = v_col.a * u_alphaScale;

  if (u_isPoint > 0.5) {
    // round, soft point sprite
    vec2 pc = gl_PointCoord * 2.0 - 1.0;
    float r = dot(pc, pc);
    if (r > 1.0) discard;
    alpha *= 1.0 - smoothstep(0.55, 1.0, r);
  }

  frag = vec4(c, alpha);
}
`;

/* ------------------------------ colour helpers ---------------------------- */

export function hslToRgb(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// Per-vertex colour from the vertex's 4D coordinates so colours swirl as the
// shape rotates through the 4th dimension.
export function vertexColor(v, scheme) {
  const aXY = Math.atan2(v[1], v[0]);
  const aZW = Math.atan2(v[3], v[2]);
  if (scheme === 'heat') {
    const t = (aZW / Math.PI + 1) / 2;
    return [1.0, 0.35 + 0.5 * t, 0.15];
  }
  if (scheme === 'cool') {
    const t = (aZW / Math.PI + 1) / 2;
    return [0.2, 0.5 + 0.3 * t, 0.9];
  }
  if (scheme === 'mono') {
    const t = 0.55 + 0.4 * Math.sin(aZW);
    return [t, t, t + 0.1];
  }
  // rainbow (default)
  const hue = (aXY / (2 * Math.PI)) * 0.5 + (aZW / (2 * Math.PI)) * 0.5 + 0.5;
  return hslToRgb(hue, 0.85, 0.62);
}

/* -------------------------------- renderer -------------------------------- */

const NEAR = 0.1;
const FAR = 100.0;
const ZA = -(FAR + NEAR) / (FAR - NEAR);
const ZB = (-2 * FAR * NEAR) / (FAR - NEAR);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.program = this._buildProgram(VERT, FRAG);
    this._locs();

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.posColBuffer = gl.createBuffer();
    this.edgeIndexBuffer = gl.createBuffer();
    this.faceIndexBuffer = gl.createBuffer();
    this.vertexIndexBuffer = gl.createBuffer();

    this.state = {
      angles: { xy: 0.6, xz: 0.0, xw: 0.0, yz: 0.0, yw: 0.0, zw: 0.0 },
      yaw: 0.7,
      pitch: -0.35,
      dist: 6.5,
      wCam: 3.5,
      fovDeg: 50,
      scale: 1.0,
      scheme: 'rainbow',
      showFaces: true,
      showEdges: true,
      showVertices: true,
      time: 0,
    };

    this._resize();
    gl.enable(gl.BLEND);
    gl.clearColor(0.012, 0.014, 0.03, 1);
  }

  _locs() {
    const gl = this.gl;
    const p = this.program;
    this.loc = {
      a_pos: gl.getAttribLocation(p, 'a_pos'),
      a_col: gl.getAttribLocation(p, 'a_col'),
      u_rot4: gl.getUniformLocation(p, 'u_rot4'),
      u_view: gl.getUniformLocation(p, 'u_view'),
      u_wCam: gl.getUniformLocation(p, 'u_wCam'),
      u_fov: gl.getUniformLocation(p, 'u_fov'),
      u_aspect: gl.getUniformLocation(p, 'u_aspect'),
      u_zA: gl.getUniformLocation(p, 'u_zA'),
      u_zB: gl.getUniformLocation(p, 'u_zB'),
      u_zNear: gl.getUniformLocation(p, 'u_zNear'),
      u_zFar: gl.getUniformLocation(p, 'u_zFar'),
      u_pointScale: gl.getUniformLocation(p, 'u_pointScale'),
      u_fog: gl.getUniformLocation(p, 'u_fog'),
      u_time: gl.getUniformLocation(p, 'u_time'),
      u_rgbScale: gl.getUniformLocation(p, 'u_rgbScale'),
      u_alphaScale: gl.getUniformLocation(p, 'u_alphaScale'),
      u_isPoint: gl.getUniformLocation(p, 'u_isPoint'),
    };
  }

  _buildProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
    return prog;
  }

  _resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(c.clientWidth * dpr);
    const h = Math.floor(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.gl.viewport(0, 0, c.width, c.height);
  }

  // Upload a shape: builds the interleaved position+colour vertex buffer and the
  // edge / face / vertex index buffers.
  setShape(shape) {
    const gl = this.gl;
    this.shape = shape;

    const n = shape.vertices.length;
    const data = new Float32Array(n * 8); // pos(4) + col(4)
    for (let i = 0; i < n; i++) {
      const v = shape.vertices[i];
      const col = vertexColor(v, this.state.scheme);
      data[i * 8 + 0] = v[0];
      data[i * 8 + 1] = v[1];
      data[i * 8 + 2] = v[2];
      data[i * 8 + 3] = v[3];
      data[i * 8 + 4] = col[0];
      data[i * 8 + 5] = col[1];
      data[i * 8 + 6] = col[2];
      data[i * 8 + 7] = 1.0;
    }

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posColBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(this.loc.a_pos);
    gl.vertexAttribPointer(this.loc.a_pos, 4, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.loc.a_col);
    gl.vertexAttribPointer(this.loc.a_col, 4, gl.FLOAT, false, stride, 16);

    // edges
    const edgeIdx = new Uint16Array(shape.edges.length * 2);
    shape.edges.forEach(([a, b], i) => {
      edgeIdx[i * 2] = a;
      edgeIdx[i * 2 + 1] = b;
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edgeIdx, gl.STATIC_DRAW);
    this.edgeCount = edgeIdx.length;

    // faces -> triangulate (fan) each polygonal face
    const tris = [];
    for (const f of shape.faces) {
      for (let k = 1; k + 1 < f.length; k++) {
        tris.push(f[0], f[k], f[k + 1]);
      }
    }
    const faceIdx = new Uint16Array(tris);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.faceIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, faceIdx, gl.STATIC_DRAW);
    this.faceCount = faceIdx.length;

    // vertices (points)
    const vertIdx = new Uint16Array(n);
    for (let i = 0; i < n; i++) vertIdx[i] = i;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, vertIdx, gl.STATIC_DRAW);
    this.vertexCount = n;
  }

  setScheme(scheme) {
    this.state.scheme = scheme;
    if (this.shape) this.setShape(this.shape); // rebuild colours
  }

  render() {
    const gl = this.gl;
    this._resize();
    const s = this.state;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const fov = 1 / Math.tan((s.fovDeg * Math.PI / 180) / 2);

    const rot4 = compose4DRotation(s.angles);
    const view = composeView(s.yaw, s.pitch, s.dist);

    gl.uniformMatrix4fv(this.loc.u_rot4, false, rot4);
    gl.uniformMatrix4fv(this.loc.u_view, false, view);
    gl.uniform1f(this.loc.u_wCam, s.wCam);
    gl.uniform1f(this.loc.u_fov, fov);
    gl.uniform1f(this.loc.u_aspect, aspect);
    gl.uniform1f(this.loc.u_zA, ZA);
    gl.uniform1f(this.loc.u_zB, ZB);
    gl.uniform1f(this.loc.u_zNear, NEAR);
    gl.uniform1f(this.loc.u_zFar, FAR);
    gl.uniform1f(this.loc.u_pointScale, 26 * s.scale);
    gl.uniform3f(this.loc.u_fog, 0.012, 0.014, 0.03);
    gl.uniform1f(this.loc.u_time, s.time);

    gl.bindVertexArray(this.vao);

    // ---- Pass 1: translucent faces (additive glow, no depth write) ----
    if (s.showFaces && this.faceCount) {
      gl.depthMask(false);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.blendFunc(gl.ONE, gl.ONE); // additive
      gl.uniform1f(this.loc.u_rgbScale, 0.16 * s.scale);
      gl.uniform1f(this.loc.u_alphaScale, 1.0);
      gl.uniform1f(this.loc.u_isPoint, 0.0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.faceIndexBuffer);
      gl.drawElements(gl.TRIANGLES, this.faceCount, gl.UNSIGNED_SHORT, 0);
    }

    // ---- Pass 2: edges (x-ray: always on top, no depth write) ----
    if (s.showEdges && this.edgeCount) {
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(this.loc.u_rgbScale, 1.25);
      gl.uniform1f(this.loc.u_alphaScale, 0.95);
      gl.uniform1f(this.loc.u_isPoint, 0.0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgeIndexBuffer);
      gl.drawElements(gl.LINES, this.edgeCount, gl.UNSIGNED_SHORT, 0);
    }

    // ---- Pass 3: vertices (bright round points) ----
    if (s.showVertices && this.vertexCount) {
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(this.loc.u_rgbScale, 1.7);
      gl.uniform1f(this.loc.u_alphaScale, 1.0);
      gl.uniform1f(this.loc.u_isPoint, 1.0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
      gl.drawElements(gl.POINTS, this.vertexCount, gl.UNSIGNED_SHORT, 0);
    }

    gl.depthMask(true);
  }
}
