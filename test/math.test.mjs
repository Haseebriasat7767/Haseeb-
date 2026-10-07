// Node test: verify the 4x4 matrix math used to build the GPU uniforms.
import {
  mat4Identity,
  mat4Mul,
  mat4PlaneRotation,
  mat4Translation,
  compose4DRotation,
  composeView,
} from '../src/renderer.js';

let failures = 0;
function check(name, cond) {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
}
function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}
function vecNear(a, b, eps = 1e-6) {
  return a.every((x, i) => near(x, b[i], eps));
}
// apply column-major mat4 to a vec4
function apply(m, v) {
  const o = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let c = 0; c < 4; c++) s += m[c * 4 + r] * v[c];
    o[r] = s;
  }
  return o;
}

// identity
check('identity leaves vector unchanged', vecNear(apply(mat4Identity(), [1, 2, 3, 4]), [1, 2, 3, 4]));

// plane rotation XY by 90deg: (1,0,0,0) -> (0,1,0,0)
const rxy90 = mat4PlaneRotation(0, 1, Math.PI / 2);
check('XY 90deg maps +x to +y', vecNear(apply(rxy90, [1, 0, 0, 0]), [0, 1, 0, 0]));
check('XY 90deg maps +y to -x', vecNear(apply(rxy90, [0, 1, 0, 0]), [-1, 0, 0, 0]));

// plane rotation XW by 90deg: (1,0,0,0) -> (0,0,0,1)  (x-axis into w-axis)
const rxw90 = mat4PlaneRotation(0, 3, Math.PI / 2);
check('XW 90deg maps +x to +w', vecNear(apply(rxw90, [1, 0, 0, 0]), [0, 0, 0, 1]));

// plane rotation ZW by 90deg: (0,0,1,0) -> (0,0,0,1)
const rzw90 = mat4PlaneRotation(2, 3, Math.PI / 2);
check('ZW 90deg maps +z to +w', vecNear(apply(rzw90, [0, 0, 1, 0]), [0, 0, 0, 1]));

// rotation by 0 is identity
check('plane rotation by 0 is identity', vecNear(apply(mat4PlaneRotation(1, 3, 0), [5, 6, 7, 8]), [5, 6, 7, 8]));

// compose4DRotation all-zero == identity
const rot0 = compose4DRotation({ xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 });
check('compose4DRotation(0) == identity', vecNear(apply(rot0, [1, 2, 3, 4]), [1, 2, 3, 4]));

// compose4DRotation with only xy=90 equals single XY rotation
const rotXY = compose4DRotation({ xy: Math.PI / 2, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 });
check('compose4DRotation(xy=90) == planeRot(0,1,90)', vecNear(apply(rotXY, [1, 0, 0, 0]), [0, 1, 0, 0]));

// compose applies Rxy first: xy=90 then xw=90 on (1,0,0,0):
//  Rxy: (1,0,0,0)->(0,1,0,0);  then Rxw (plane 0,3) leaves (0,1,0,0) unchanged -> (0,1,0,0)
const rotXY_XW = compose4DRotation({ xy: Math.PI / 2, xz: 0, xw: Math.PI / 2, yz: 0, yw: 0, zw: 0 });
check('compose order: Rxy applied first', vecNear(apply(rotXY_XW, [1, 0, 0, 0]), [0, 1, 0, 0]));

// mat4Mul: A*B applied to v == A*(B*v)
const A = mat4PlaneRotation(0, 1, 0.3);
const B = mat4PlaneRotation(2, 3, 0.7);
const v = [0.5, -0.4, 0.8, 0.2];
const seq = apply(A, apply(B, v));
const prod = apply(mat4Mul(A, B), v);
check('mat4Mul(A,B)*v == A*(B*v)', vecNear(seq, prod, 1e-5));

// translation
const T = mat4Translation(0, 0, -6.5);
check('translation moves origin to (0,0,-6.5)', vecNear(apply(T, [0, 0, 0, 1]), [0, 0, -6.5, 1]));

// composeView with zero angles == pure translation
const view0 = composeView(0, 0, 6.5);
check('composeView(0,0,dist) == translate(0,0,-dist)', vecNear(apply(view0, [0, 0, 0, 1]), [0, 0, -6.5, 1]));

// composeView with yaw=90 (rotate around Y in XZ plane): origin stays, +x goes to -z? 
// plane(0,2): x' = x cos - z sin, z' = x sin + z cos. (1,0,0)->(cos,0,sin)=(0,0,1) for 90deg. then translate z -6.5
// so (1,0,0,1) -> (0,0,1,1) -> (0,0,1-6.5)=(0,0,-5.5)
const viewYaw = composeView(Math.PI / 2, 0, 6.5);
const p = apply(viewYaw, [1, 0, 0, 1]);
check('composeView yaw=90 maps +x toward +z then translates', vecNear(p, [0, 0, -5.5, 1], 1e-5));

console.log(failures === 0 ? '\nAll math checks passed.' : `\n${failures} FAILURE(S).`);
process.exit(failures === 0 ? 0 : 1);
