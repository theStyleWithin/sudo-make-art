// A small 3D engine for posing characters. Original code for this project; it needs no outside library.
// It reads VRM / glTF models (.vrm, .glb), poses their skeleton, and draws them with flat "toon" shading and an ink outline using
// WebGL. Models are always still: this is for drawing manga pages, not animation. Characters made in the character maker use the
// same skeleton (VRM humanoid bone names), so one pose editor works for both.
(() => {
'use strict';
// ---------- a little maths: quaternions [x,y,z,w] and 4x4 matrices (column-major, like WebGL) ----------
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qconj = q => [-q[0], -q[1], -q[2], q[3]];
const qaxis = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
const D2R = Math.PI / 180;
const qeuler = e => qmul(qaxis(0, 0, 1, e[2] * D2R), qmul(qaxis(0, 1, 0, e[1] * D2R), qaxis(1, 0, 0, e[0] * D2R)));   // X first, then Y, then Z
function qfromBasis(x, y, z) { // rotation matrix with these columns -> quaternion
  const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2], tr = m00 + m11 + m22;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
}
function mcompose(t, q, s, out = new Float32Array(16)) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0; out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
  out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0; out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1; return out;
}
function mmul(a, b, out = new Float32Array(16)) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; out[c * 4 + r] = s; } return out; }
function minvRigid(m) { // inverse of a rotation+translation (+uniform scale) matrix
  const out = new Float32Array(16), s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2], k = 1 / s2;
  out[0] = m[0] * k; out[1] = m[4] * k; out[2] = m[8] * k; out[4] = m[1] * k; out[5] = m[5] * k; out[6] = m[9] * k; out[8] = m[2] * k; out[9] = m[6] * k; out[10] = m[10] * k;
  out[12] = -(out[0] * m[12] + out[4] * m[13] + out[8] * m[14]); out[13] = -(out[1] * m[12] + out[5] * m[13] + out[9] * m[14]); out[14] = -(out[2] * m[12] + out[6] * m[13] + out[10] * m[14]); out[15] = 1; return out;
}
function perspective(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far); o[11] = -1; o[14] = 2 * far * near / (near - far); return o; }
function lookAt(eye, c, up) { let zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l; let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l; const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]); }

// ---------- reading a .glb / .vrm file ----------
const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] }, NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function parseGLB(buf) {
  const dv = new DataView(buf); if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error('This is not a .vrm or .glb model file.');
  let off = 12, json = null, bin = null; while (off + 8 <= buf.byteLength) { const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len))); else if (type === 0x004e4942 && !bin) bin = new Uint8Array(buf, off + 8, len); off += 8 + len + ((4 - (len % 4)) % 4); }
  if (!json || !bin) throw new Error('This model file is incomplete.'); return { json, bin };
}
function readAccessor(g, i) {
  const a = g.json.accessors[i], [T, bytes] = COMP[a.componentType], n = NCOMP[a.type], out = new T(a.count * n); if (a.bufferView === undefined) return { data: out, n, normalized: !!a.normalized, type: a.componentType };
  const bv = g.json.bufferViews[a.bufferView], base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * bytes, src = new DataView(g.bin.buffer, g.bin.byteOffset);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = src[get](base + k * stride + c * bytes, true); return { data: out, n, normalized: !!a.normalized, type: a.componentType };
}
const normFloat = (v, type) => (type === 5121 ? v / 255 : type === 5123 ? v / 65535 : type === 5120 ? Math.max(v / 127, -1) : type === 5122 ? Math.max(v / 32767, -1) : v);

// A model: nodes (a skeleton), meshes (drawn pieces) and textures. Both VRM files and the character maker produce this shape.
async function loadVRM(buf, onProgress) {
  const g = parseGLB(buf), J = g.json, nodes = J.nodes.map((n, i) => {
    let t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    if (n.matrix) { const m = n.matrix; s = [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])]; t = [m[12], m[13], m[14]]; r = qfromBasis([m[0] / s[0], m[1] / s[0], m[2] / s[0]], [m[4] / s[1], m[5] / s[1], m[6] / s[1]], [m[8] / s[2], m[9] / s[2], m[10] / s[2]]); }
    return { name: n.name || 'node' + i, parent: -1, children: n.children || [], t, r, s };
  });
  nodes.forEach((n, i) => n.children.forEach(c => { nodes[c].parent = i; }));
  const v0 = J.extensions && J.extensions.VRM, v1 = J.extensions && J.extensions.VRMC_vrm, human = {};
  if (v0 && v0.humanoid) for (const b of v0.humanoid.humanBones || []) { if (b.node >= 0) human[b.bone] = b.node; }
  else if (v1 && v1.humanoid) for (const [k, b] of Object.entries(v1.humanoid.humanBones || {})) human[k] = b.node;
  if (!human.hips) throw new Error('This model has no human skeleton (it is not a VRM character).');
  const meta = v0 ? (v0.meta || {}) : (v1 ? (v1.meta || {}) : {});
  const matProps = v0 && v0.materialProperties ? v0.materialProperties : [];
  const textures = new Array((J.textures || []).length).fill(null), imgOf = i => J.images[J.textures[i].source];
  const decodeTex = async i => { if (textures[i]) return textures[i]; const im = imgOf(i); if (!im || im.bufferView === undefined) return null; const bv = J.bufferViews[im.bufferView], blob = new Blob([g.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: im.mimeType || 'image/png' }); let bmp = await createImageBitmap(blob); const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height)); if (k < 1) { const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp = c; } textures[i] = bmp; return bmp; };
  const materials = await Promise.all((J.materials || []).map(async (m, mi) => {
    const mp = matProps[mi] || {}, vec = mp.vectorProperties || {}, fl = mp.floatProperties || {}, tp = mp.textureProperties || {}, pbr = m.pbrMetallicRoughness || {}, tag = (mp.tagMap || {}).RenderType || '', kw = mp.keywordMap || {};
    const color = vec._Color || pbr.baseColorFactor || [1, 1, 1, 1], shade = vec._ShadeColor || null, texIdx = tp._MainTex !== undefined ? tp._MainTex : (pbr.baseColorTexture ? pbr.baseColorTexture.index : -1);
    if (texIdx >= 0) await decodeTex(texIdx); if (onProgress) onProgress(mi / Math.max(1, J.materials.length));
    return { color: color.slice(0, 4).map((v, k) => (k < 3 ? Math.min(1, Math.max(0, v)) : v)), shade: shade ? shade.slice(0, 3) : null, tex: texIdx, cut: kw._ALPHATEST_ON || tag === 'TransparentCutout' ? (fl._Cutoff === undefined ? 0.5 : fl._Cutoff) : (tag === 'Transparent' ? 0.02 : -1), blend: tag === 'Transparent', double: fl._CullMode === 0 || !!m.doubleSided, queue: mp.renderQueue || (tag === 'Transparent' ? 3000 : tag === 'TransparentCutout' ? 2450 : 2000), unlit: false, outlineMode: fl._OutlineWidthMode || 0, outlineWidth: fl._OutlineWidth || 0, outlineColor: vec._OutlineColor ? vec._OutlineColor.slice(0, 3) : [0.1, 0.07, 0.07] };
  }));
  const skins = (J.skins || []).map(s => ({ joints: s.joints, ibm: s.inverseBindMatrices !== undefined ? readAccessor(g, s.inverseBindMatrices).data : null }));
  const prims = [];
  J.nodes.forEach((n, ni) => { if (n.mesh === undefined) return; for (const p of J.meshes[n.mesh].primitives) {
    if ((p.mode === undefined ? 4 : p.mode) !== 4 || p.attributes.POSITION === undefined) continue;
    const pos = readAccessor(g, p.attributes.POSITION).data, nor = p.attributes.NORMAL !== undefined ? readAccessor(g, p.attributes.NORMAL).data : new Float32Array(pos.length), uvA = p.attributes.TEXCOORD_0 !== undefined ? readAccessor(g, p.attributes.TEXCOORD_0).data : new Float32Array(pos.length / 3 * 2);
    let idx = p.indices !== undefined ? readAccessor(g, p.indices).data : Uint32Array.from({ length: pos.length / 3 }, (_, k) => k); if (!(idx instanceof Uint16Array) && !(idx instanceof Uint32Array)) idx = Uint32Array.from(idx);
    const prim = { pos, nor, uv: uvA, idx, mat: materials[p.material !== undefined ? p.material : 0] || { color: [1, 1, 1, 1], shade: null, tex: -1, cut: -1, double: true, queue: 2000, outlineMode: 0, outlineColor: [0, 0, 0] }, node: ni, skin: n.skin !== undefined ? n.skin : -1 };
    if (n.skin !== undefined && p.attributes.JOINTS_0 !== undefined) { const jj = readAccessor(g, p.attributes.JOINTS_0), ww = readAccessor(g, p.attributes.WEIGHTS_0); prim.joints = Uint16Array.from(jj.data); prim.weights = Float32Array.from(ww.data, v => normFloat(v, ww.type)); }
    prims.push(prim);
  } });
  return { kind: 'vrm', name: meta.title || meta.name || 'VRM model', meta, nodes, human, prims, skins, textures, facing: v1 ? [0, 0, 1] : [0, 0, -1] };
}

// ---------- the skeleton and its pose ----------
const HUMAN_BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'];
function prepare(m) { // rest-pose numbers every later step needs
  if (m._ready) return m; const n = m.nodes.length, order = [], seen = new Uint8Array(n), visit = i => { if (seen[i]) return; if (m.nodes[i].parent >= 0) visit(m.nodes[i].parent); seen[i] = 1; order.push(i); }; for (let i = 0; i < n; i++) visit(i); m.order = order;
  m.boneOf = new Array(n).fill(null); for (const [b, i] of Object.entries(m.human)) m.boneOf[i] = b;
  m.restW = new Array(n); m.restWq = new Array(n); const world = new Array(n);
  for (const i of order) { const nd = m.nodes[i], local = mcompose(nd.t, nd.r, nd.s), p = nd.parent; world[i] = p >= 0 ? mmul(world[p], local) : local; m.restWq[i] = p >= 0 ? qmul(m.restWq[p], nd.r) : nd.r; }
  m.restW = world; m.restInv = world.map(w => minvRigid(w));
  const P = i => [world[i][12], world[i][13], world[i][14]]; m.restPos = world.map((_, i) => P(i));
  // character space: x = the character's left, y = up, z = forward
  const f = m.facing, up = [0, 1, 0], left = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]]; m.cq = qfromBasis(left, up, f);
  // size and centre at rest
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const p of m.prims) { const M = p.rigid !== undefined ? m.restW[p.rigid] : (p.skin >= 0 ? null : m.restW[p.node]); for (let k = 0; k < p.pos.length; k += 3) { let x = p.pos[k], y = p.pos[k + 1], z = p.pos[k + 2]; if (M && p.rigid === undefined) { const X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14]; x = X; y = Y; z = Z; } if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z; if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z; } }
  m.bounds = { min: mn, max: mx, h: mx[1] - mn[1], c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] }; m._ready = true; return m;
}
function poseWorld(m, pose) {
  prepare(m); const n = m.nodes.length, W = new Array(n), cq = m.cq, ccq = qconj(cq);
  for (const i of m.order) { const nd = m.nodes[i], b = m.boneOf[i], e = b && pose && pose[b]; let r = nd.r;
    if (e && (e[0] || e[1] || e[2])) { const Ew = qmul(cq, qmul(qeuler(e), ccq)), Wr = m.restWq[i], delta = qmul(qconj(Wr), qmul(Ew, Wr)); r = qmul(nd.r, delta); }
    const local = mcompose(nd.t, r, nd.s); W[i] = nd.parent >= 0 ? mmul(W[nd.parent], local) : local; }
  return W;
}
function skinPrim(m, p, W) { // fills p.outPos / p.outNor for the current pose
  const nv = p.pos.length / 3; if (!p.outPos) { p.outPos = new Float32Array(p.pos.length); p.outNor = new Float32Array(p.pos.length); }
  const op = p.outPos, on = p.outNor;
  if (p.skin >= 0 && p.joints) { const sk = m.skins[p.skin], nj = sk.joints.length, JM = new Float32Array(nj * 16), tmp = new Float32Array(16); for (let j = 0; j < nj; j++) { const ibm = sk.ibm ? sk.ibm.subarray(j * 16, j * 16 + 16) : m.restInv[sk.joints[j]]; mmul(W[sk.joints[j]], ibm, tmp); JM.set(tmp, j * 16); }
    for (let v = 0; v < nv; v++) { const x = p.pos[v * 3], y = p.pos[v * 3 + 1], z = p.pos[v * 3 + 2], nx = p.nor[v * 3], ny = p.nor[v * 3 + 1], nz = p.nor[v * 3 + 2]; let px = 0, py = 0, pz = 0, qx = 0, qy = 0, qz = 0;
      for (let k = 0; k < 4; k++) { const w = p.weights[v * 4 + k]; if (!w) continue; const o = p.joints[v * 4 + k] * 16; px += w * (JM[o] * x + JM[o + 4] * y + JM[o + 8] * z + JM[o + 12]); py += w * (JM[o + 1] * x + JM[o + 5] * y + JM[o + 9] * z + JM[o + 13]); pz += w * (JM[o + 2] * x + JM[o + 6] * y + JM[o + 10] * z + JM[o + 14]); qx += w * (JM[o] * nx + JM[o + 4] * ny + JM[o + 8] * nz); qy += w * (JM[o + 1] * nx + JM[o + 5] * ny + JM[o + 9] * nz); qz += w * (JM[o + 2] * nx + JM[o + 6] * ny + JM[o + 10] * nz); }
      op[v * 3] = px; op[v * 3 + 1] = py; op[v * 3 + 2] = pz; on[v * 3] = qx; on[v * 3 + 1] = qy; on[v * 3 + 2] = qz; }
  } else { const j = p.rigid !== undefined ? p.rigid : p.node, M = p.rigid !== undefined ? mmul(W[j], m.restInv[j]) : W[j];
    for (let v = 0; v < nv; v++) { const x = p.pos[v * 3], y = p.pos[v * 3 + 1], z = p.pos[v * 3 + 2], nx = p.nor[v * 3], ny = p.nor[v * 3 + 1], nz = p.nor[v * 3 + 2]; op[v * 3] = M[0] * x + M[4] * y + M[8] * z + M[12]; op[v * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; op[v * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; on[v * 3] = M[0] * nx + M[4] * ny + M[8] * nz; on[v * 3 + 1] = M[1] * nx + M[5] * ny + M[9] * nz; on[v * 3 + 2] = M[2] * nx + M[6] * ny + M[10] * nz; } }
}

// ---------- drawing with WebGL ----------
const VS = `attribute vec3 aPos;attribute vec3 aNor;attribute vec2 aUv;attribute vec3 aCol;uniform mat4 uVP;uniform mat3 uV3;uniform float uOut;varying vec3 vN;varying vec2 vUv;varying vec3 vCol;
void main(){vec3 n=normalize(aNor);vec3 p=aPos+n*uOut;gl_Position=uVP*vec4(p,1.0);vN=uV3*n;vUv=aUv;vCol=aCol;}`;
const FS = `precision mediump float;varying vec3 vN;varying vec2 vUv;varying vec3 vCol;uniform sampler2D uTex;uniform bool uHasTex;uniform vec4 uColor;uniform vec3 uShade;uniform bool uHasShade;uniform float uCut;uniform int uStyle;uniform bool uOutPass;uniform vec3 uOutColor;uniform vec3 uLight;
void main(){vec4 t=uHasTex?texture2D(uTex,vUv):vec4(1.0);vec4 base=t*uColor*vec4(vCol,1.0);if(base.a<uCut||base.a<0.01)discard;
if(uOutPass){if(uStyle==0)gl_FragColor=vec4(uOutColor,1.0);else gl_FragColor=vec4(0.04,0.04,0.04,1.0);return;}
vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;float d=dot(n,normalize(uLight));float k=smoothstep(-0.05,0.18,d);
vec3 lit=base.rgb;vec3 shd=uHasShade?uShade*t.rgb*vCol:base.rgb*0.74;vec3 col=mix(shd,lit,k);
float g=dot(col,vec3(0.299,0.587,0.114));
if(uStyle==1)col=vec3(g);
if(uStyle==2){float q=g<0.2?0.0:(g<0.45?0.45:(g<0.75?0.82:1.0));col=vec3(q);}
gl_FragColor=vec4(col*base.a,base.a);}`;
let GL = null;
function glInit() {
  if (GL) return GL; const c = document.createElement('canvas'); c.width = 16; c.height = 16; const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true }); if (!gl) throw new Error('3D drawing is not available on this computer.');
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(pr));
  const U = {}; for (const u of ['uVP', 'uV3', 'uOut', 'uTex', 'uHasTex', 'uColor', 'uShade', 'uHasShade', 'uCut', 'uStyle', 'uOutPass', 'uOutColor', 'uLight']) U[u] = gl.getUniformLocation(pr, u);
  const A = { aPos: gl.getAttribLocation(pr, 'aPos'), aNor: gl.getAttribLocation(pr, 'aNor'), aUv: gl.getAttribLocation(pr, 'aUv'), aCol: gl.getAttribLocation(pr, 'aCol') }; gl.getExtension('OES_element_index_uint'); GL = { c, gl, pr, U, A }; return GL;
}
function gpuFor(m) {
  const { gl } = glInit(); if (m._gpu) return m._gpu; const g = { prims: [], tex: [] };
  const buf = (target, data, usage) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b; };
  for (const p of m.prims) g.prims.push({ pos: buf(gl.ARRAY_BUFFER, p.pos.length * 4, gl.DYNAMIC_DRAW), nor: buf(gl.ARRAY_BUFFER, p.pos.length * 4, gl.DYNAMIC_DRAW), uv: buf(gl.ARRAY_BUFFER, p.uv, gl.STATIC_DRAW), col: p.col ? buf(gl.ARRAY_BUFFER, p.col, gl.STATIC_DRAW) : null, idx: buf(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW), n: p.idx.length, type: p.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT });
  m.textures.forEach((bmp, i) => { if (!bmp) { g.tex[i] = null; return; } const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp); const pow2 = v => (v & (v - 1)) === 0; if (pow2(bmp.width) && pow2(bmp.height)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); g.tex[i] = t; });
  m._gpu = g; return g;
}
const STYLES = { color: 0, gray: 1, ink: 2 };
// Draws the model into a new canvas (transparent background). st: { pose, yaw, pitch, zoom, fov, ox, oy, style, outline }
function render(m, st, W, H) {
  prepare(m); const { c, gl, pr, U, A } = glInit(), gpu = gpuFor(m), SS = Math.min(2, 2400 / Math.max(W, H)); const w = Math.max(8, Math.round(W * SS)), h = Math.max(8, Math.round(H * SS));
  c.width = w; c.height = h; gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(pr);
  const Wd = poseWorld(m, st.pose), b = m.bounds, ht = b.h, fov = Math.max(5, Math.min(70, st.fov || 25)) * D2R, zoom = Math.max(0.2, st.zoom || 1);
  const target = [b.c[0] + (st.ox || 0) * ht, b.c[1] + (st.oy || 0) * ht, b.c[2]], dist = (ht * 0.56) / Math.tan(fov / 2) / zoom * Math.max(1, (h / w) < 1.2 ? 1 : 1);
  const yaw = (st.yaw || 0) * D2R, pitch = (st.pitch || 0) * D2R, f = m.facing, fa = Math.atan2(f[0], f[2]);          // start in front of the character
  const dir = [Math.sin(fa + yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(fa + yaw) * Math.cos(pitch)], eye = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
  const V = lookAt(eye, target, [0, 1, 0]), P = perspective(fov, w / h, dist * 0.05, dist * 4), VP = mmul(P, V); gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniformMatrix3fv(U.uV3, false, new Float32Array([V[0], V[1], V[2], V[4], V[5], V[6], V[8], V[9], V[10]]));
  gl.uniform3f(U.uLight, -0.45, 0.65, 0.75); gl.uniform1i(U.uStyle, STYLES[st.style] || 0); gl.uniform1i(U.uTex, 0);
  for (const p of m.prims) skinPrim(m, p, Wd);
  const order = m.prims.map((p, i) => i).sort((a, b2) => (m.prims[a].mat.queue - m.prims[b2].mat.queue) || (a - b2));
  const bind = (i) => { const p = m.prims[i], g = gpu.prims[i]; gl.bindBuffer(gl.ARRAY_BUFFER, g.pos); gl.bufferData(gl.ARRAY_BUFFER, p.outPos, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(A.aPos); gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.nor); gl.bufferData(gl.ARRAY_BUFFER, p.outNor, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(A.aNor); gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.uv); gl.enableVertexAttribArray(A.aUv); gl.vertexAttribPointer(A.aUv, 2, gl.FLOAT, false, 0, 0);
    if (g.col) { gl.bindBuffer(gl.ARRAY_BUFFER, g.col); gl.enableVertexAttribArray(A.aCol); gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, 0, 0); } else { gl.disableVertexAttribArray(A.aCol); gl.vertexAttrib3f(A.aCol, 1, 1, 1); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx); };
  const setMat = (mat, outline) => { const t = mat.tex >= 0 ? gpu.tex[mat.tex] : null; gl.uniform1i(U.uHasTex, t ? 1 : 0); if (t) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t); } gl.uniform4f(U.uColor, mat.color[0], mat.color[1], mat.color[2], mat.color[3] === undefined ? 1 : mat.color[3]); gl.uniform1i(U.uHasShade, mat.shade ? 1 : 0); if (mat.shade) gl.uniform3f(U.uShade, mat.shade[0], mat.shade[1], mat.shade[2]); gl.uniform1f(U.uCut, mat.cut); if (outline) gl.uniform3f(U.uOutColor, mat.outlineColor[0], mat.outlineColor[1], mat.outlineColor[2]); };
  const ow = (st.outline === undefined ? 1 : st.outline) * ht * 0.0042;
  if (ow > 0) { gl.uniform1i(U.uOutPass, 1); gl.uniform1f(U.uOut, ow); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.depthMask(true);
    for (const i of order) { const p = m.prims[i]; if (p.mat.blend || p.mat.outlineMode === 0 && p.mat.noOutline) continue; if (p.mat.outlineMode === 0 && m.kind === 'vrm') continue; bind(i); setMat(p.mat, true); gl.drawElements(gl.TRIANGLES, gpu.prims[i].n, gpu.prims[i].type, 0); } }
  gl.uniform1i(U.uOutPass, 0); gl.uniform1f(U.uOut, 0);
  for (const i of order) { const p = m.prims[i]; bind(i); setMat(p.mat, false); if (p.mat.double) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } gl.depthMask(!p.mat.blend); gl.drawElements(gl.TRIANGLES, gpu.prims[i].n, gpu.prims[i].type, 0); }
  gl.depthMask(true); const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(W)); out.height = Math.max(1, Math.round(H)); const x = out.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, out.width, out.height); return out;
}
function disposeModel(m) { if (!m._gpu || !GL) return; const { gl } = GL; for (const g of m._gpu.prims) [g.pos, g.nor, g.uv, g.col, g.idx].forEach(b => b && gl.deleteBuffer(b)); m._gpu.tex.forEach(t => t && gl.deleteTexture(t)); m._gpu = null; }

const api = { loadVRM, parseGLB, render, prepare, poseWorld, disposeModel, HUMAN_BONES, qmul, qconj, qeuler, qaxis, qfromBasis, mcompose, mmul, minvRigid, D2R };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA3D = api;
})();
