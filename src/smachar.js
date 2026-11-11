// The character maker and the pose presets. Original code for this project (uses src/sma3d.js).
// buildCharacter(params) makes a smooth, skinned male or female anime-style figure on the standard VRM humanoid skeleton, so the same
// pose editor, presets and drawing code work for characters made here and for imported VRM models.
(() => {
'use strict';
const S3 = typeof module !== 'undefined' && module.exports ? require('./sma3d.js') : window.SMA3D;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), lerp = (a, b, t) => a + (b - a) * t;
const hexRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], dark = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d), pick = (v, list, d) => (list.includes(v) ? v : d), n01 = (v, d) => { v = +v; return Number.isFinite(v) ? clamp(v, 0, 1) : d; };
const HAIR = ['short', 'spiky', 'bob', 'long', 'ponytail', 'twin', 'none'], OUTFIT = ['uniform', 'casual', 'dress', 'sport'], ACC = ['none', 'glasses', 'cat ears', 'ribbon', 'headband'];
const DEFAULTS = { gender: 'female', height: 0.5, build: 0.4, shoulders: 0.5, hips: 0.5, bust: 0.5, head: 0.5, legs: 0.5, skin: '#f6d2b8', hairStyle: 'long', hair: '#3a2a4a', eyes: '#3f7fe0', eyeStyle: 0, outfit: 'uniform', top: '#ffffff', bottom: '#2c3f78', shoes: '#4a3328', accent: '#d9304f', accessory: 'none' };
function cleanParams(p) { p = p || {}; return { gender: p.gender === 'male' ? 'male' : 'female', height: n01(p.height, 0.5), build: n01(p.build, 0.4), shoulders: n01(p.shoulders, 0.5), hips: n01(p.hips, 0.5), bust: n01(p.bust, 0.5), head: n01(p.head, 0.5), legs: n01(p.legs, 0.5), skin: col(p.skin, DEFAULTS.skin), hairStyle: pick(p.hairStyle, HAIR, 'long'), hair: col(p.hair, DEFAULTS.hair), eyes: col(p.eyes, DEFAULTS.eyes), eyeStyle: clamp(Math.round(+p.eyeStyle || 0), 0, 3), outfit: pick(p.outfit, OUTFIT, 'uniform'), top: col(p.top, DEFAULTS.top), bottom: col(p.bottom, DEFAULTS.bottom), shoes: col(p.shoes, DEFAULTS.shoes), accent: col(p.accent, DEFAULTS.accent), accessory: pick(p.accessory, ACC, 'none') }; }

// ----- the face, painted on a texture that wraps the head (front of the face at the middle) -----
function paintFace(P, size = 2048) {
  const W = size, H = size / 2, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), skin = hexRGB(P.skin), male = P.gender === 'male';
  const css = (a, al = 1) => `rgba(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)},${al})`, px = lon => (0.5 + lon / 360) * W, py = lat => (0.5 - lat / 180) * H, S = W / 360;
  x.fillStyle = css(skin); x.fillRect(0, 0, W, H);
  const eye = (side) => { const cx = px(side * 24), cy = py(-9), w = S * (P.eyeStyle === 3 ? 8 : P.eyeStyle === 1 ? 21 : 18), h = S * (P.eyeStyle === 1 ? 14 : P.eyeStyle === 2 ? 17 : P.eyeStyle === 3 ? 8 : 25), iris = hexRGB(P.eyes);
    x.save(); x.translate(cx, cy); x.rotate(P.eyeStyle === 1 ? side * -0.14 : 0);
    if (P.eyeStyle !== 3) { x.fillStyle = '#fffdfb'; x.beginPath(); x.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); x.fill(); const g = x.createRadialGradient(0, h * 0.1, h * 0.1, 0, h * 0.1, h * 0.95); g.addColorStop(0, css(mix(iris, [1, 1, 1], 0.45))); g.addColorStop(0.6, css(iris)); g.addColorStop(1, css(dark(iris, 0.45))); x.fillStyle = g; x.beginPath(); x.ellipse(0, h * 0.06, w * 0.66, h * 0.92, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#10101a'; x.beginPath(); x.ellipse(0, h * 0.08, w * 0.3, h * 0.46, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(-w * 0.28, -h * 0.28, w * 0.2, h * 0.17, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(w * 0.25, h * 0.35, w * 0.1, h * 0.08, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#15121c'; x.lineWidth = S * 2.4; x.lineCap = 'round'; x.beginPath(); x.ellipse(0, 0, w * 1.02, h * 1.02, 0, Math.PI * 1.04, Math.PI * 1.96); x.stroke(); x.lineWidth = S * 1.2; x.globalAlpha = 0.55; x.beginPath(); x.ellipse(0, 0, w * 1.0, h * 1.0, 0, Math.PI * 0.12, Math.PI * 0.88); x.stroke(); x.globalAlpha = 1;
      if (P.eyeStyle === 2) { x.fillStyle = css(skin); x.beginPath(); x.ellipse(0, -h * 0.78, w * 1.15, h * 0.62, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#15121c'; x.lineWidth = S * 2.2; x.beginPath(); x.moveTo(-w, h * 0.05); x.quadraticCurveTo(0, -h * 0.12, w, h * 0.05); x.stroke(); }
    } else { x.fillStyle = '#15121c'; x.beginPath(); x.ellipse(0, 0, w, h * 1.3, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(-w * 0.3, -h * 0.5, w * 0.28, 0, Math.PI * 2); x.fill(); }
    x.restore();
    x.strokeStyle = css(P.eyeStyle === 3 ? [0.2, 0.15, 0.2] : dark(hexRGB(P.hair), 0.85)); x.lineWidth = S * (male ? 3.4 : 2.2); x.lineCap = 'round'; x.beginPath(); const bx = px(side * 24), by = py(male ? 17 : 20); x.moveTo(bx - side * -S * 8, by + S * (male ? 0 : 1)); x.quadraticCurveTo(bx, by - S * (male ? 2.5 : 4.5), bx + side * -S * -8 * -1, by + S * 2); x.stroke(); };
  eye(-1); eye(1);
  x.fillStyle = 'rgba(255,120,130,0.22)'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(px(s * 34), py(-22), S * 8, S * 4, 0, 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = css(dark(skin, 0.62)); x.lineWidth = S * 1.2; x.beginPath(); x.moveTo(px(-1), py(-23)); x.lineTo(px(0.6), py(-25)); x.stroke();
  x.strokeStyle = '#7a2a3a'; x.lineWidth = S * 1.8; x.beginPath(); x.moveTo(px(-4), py(-33)); x.quadraticCurveTo(px(0), py(male ? -34 : -36), px(4), py(-33)); x.stroke();
  return c;
}

// ----- building meshes -----
function Part(m, joint, tex) { return { positions: [], normals: [], uvs: [], colors: [], joints: [], weights: [], idx: [], joint, tex: !!tex, m }; }
function addV(p, pos, nor, uv, color, jw) { p.positions.push(pos[0], pos[1], pos[2]); p.normals.push(nor[0], nor[1], nor[2]); p.uvs.push(uv[0], uv[1]); p.colors.push(color[0], color[1], color[2]); const w = jw.slice(0, 4); while (w.length < 4) w.push([0, 0]); for (const [j, wt] of w) { p.joints.push(j); p.weights.push(wt); } return p.positions.length / 3 - 1; }
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ellipsoid(p, c, r, colorFn, jw, opt = {}) {
  const seg = opt.seg || 24, rings = opt.rings || 14, base = p.positions.length / 3, rot = opt.rot;
  for (let i = 0; i <= rings; i++) { const lat = Math.PI * (i / rings - 0.5); for (let k = 0; k <= seg; k++) { const lon = (k / seg) * Math.PI * 2, dx = Math.cos(lat) * Math.sin(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.cos(lon);
    let x = dx * r[0], y = dy * r[1], z = dz * r[2], nx = dx / r[0], ny = dy / r[1], nz = dz / r[2];
    if (opt.jaw && dy < 0) { const k2 = 1 - opt.jaw * (-dy) ** 1.4; x *= k2; z *= 1 - opt.jaw * 0.5 * (-dy) ** 1.4; }
    let pos = [x, y, z], nor = norm3([nx, ny, nz]); if (rot) { pos = rot(pos); nor = rot(nor); }
    addV(p, [c[0] + pos[0], c[1] + pos[1], c[2] + pos[2]], nor, opt.uv ? [0.5 + Math.atan2(dx, dz) / (Math.PI * 2), 0.5 - lat / Math.PI] : [0, 0], colorFn(dx, dy, dz, c[1] + pos[1]), jw); } }
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) { const a = base + i * (seg + 1) + k, b = a + seg + 1; if (opt.keep && !opt.keep(p, a, b)) continue; p.idx.push(a, b, a + 1, a + 1, b, b + 1); }
}
// a tube along a path of points; ring radii rx (across x/side) and rz; weightsAt(t, point) gives [[joint, weight], ...]
function densify(path, rx, rz, N) { const n = path.length, P = [], X = [], Z = []; for (let i = 0; i < N; i++) { const f = (i / (N - 1)) * (n - 1), k = Math.min(n - 2, Math.floor(f)), t = f - k; P.push([lerp(path[k][0], path[k + 1][0], t), lerp(path[k][1], path[k + 1][1], t), lerp(path[k][2], path[k + 1][2], t)]); X.push(lerp(rx[k], rx[k + 1], t)); Z.push(lerp(rz[k], rz[k + 1], t)); } return [P, X, Z]; }
function tube(p, path, rx, rz, colorFn, weightsAt, opt = {}) {
  // Each quad gets ONE flat colour (picked at its centre), so a change of clothes is a crisp edge instead of a smear.
  if (opt.dense && path.length > 2) [path, rx, rz] = densify(path, rx, rz, opt.dense);
  const seg = opt.seg || 14, n = path.length, ref = opt.ref || [0, 0, 1], rings = [];
  for (let i = 0; i < n; i++) { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], T = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]); const N1 = norm3(cross(T, Math.abs(T[2]) > 0.95 ? [1, 0, 0] : ref)), N2 = norm3(cross(T, N1)), jw = weightsAt(i / (n - 1), path[i]), r = [];
    for (let k = 0; k <= seg; k++) { const an = (k / seg) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an); r.push({ pos: [path[i][0] + N1[0] * rx[i] * ca + N2[0] * rz[i] * sa, path[i][1] + N1[1] * rx[i] * ca + N2[1] * rz[i] * sa, path[i][2] + N1[2] * rx[i] * ca + N2[2] * rz[i] * sa], nor: norm3([N1[0] * ca / rx[i] + N2[0] * sa / rz[i], N1[1] * ca / rx[i] + N2[1] * sa / rz[i], N1[2] * ca / rx[i] + N2[2] * sa / rz[i]]), jw, ca, sa }); } rings.push(r); }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const q = [rings[i][k], rings[i + 1][k], rings[i][k + 1], rings[i + 1][k + 1]], mid = [0, 1, 2].map(d => (q[0].pos[d] + q[1].pos[d] + q[2].pos[d] + q[3].pos[d]) / 4), ca = (q[0].ca + q[3].ca) / 2, sa = (q[0].sa + q[3].sa) / 2, c = colorFn((i + 0.5) / (n - 1), ca, sa, mid), base = p.positions.length / 3;
    for (const v of q) addV(p, v.pos, v.nor, [0, 0], c, v.jw); p.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3); }
  for (const end of [0, n - 1]) { const e = path[end], o = path[end === 0 ? 1 : n - 2], T = norm3([e[0] - o[0], e[1] - o[1], e[2] - o[2]]), col = colorFn(end / (n - 1), 0, 0, e), jw = weightsAt(end / (n - 1), e), c = addV(p, e, T, [0, 0], col, jw), r0 = [];
    for (let k = 0; k <= seg; k++) r0.push(addV(p, rings[end][k].pos, T, [0, 0], col, jw)); for (let k = 0; k < seg; k++) p.idx.push(c, r0[k], r0[k + 1]); }
}
function fixWinding(p) { for (let t = 0; t < p.idx.length; t += 3) { const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]], P = i => [p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]], A = P(a), B = P(b), C = P(c), fn = cross([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]); const nx = p.normals[a * 3] + p.normals[b * 3] + p.normals[c * 3], ny = p.normals[a * 3 + 1] + p.normals[b * 3 + 1] + p.normals[c * 3 + 1], nz = p.normals[a * 3 + 2] + p.normals[b * 3 + 2] + p.normals[c * 3 + 2]; if (fn[0] * nx + fn[1] * ny + fn[2] * nz < 0) { p.idx[t + 1] = c; p.idx[t + 2] = b; } } }

function buildCharacter(raw) {
  const P = cleanParams(raw), male = P.gender === 'male', skin = hexRGB(P.skin), hair = hexRGB(P.hair), top = hexRGB(P.top), bottom = hexRGB(P.bottom), shoes = hexRGB(P.shoes), accent = hexRGB(P.accent);
  const H = (male ? 1.72 : 1.6) * lerp(0.8, 1.15, P.height), build = P.build, legsK = lerp(0.9, 1.1, P.legs), headR = H * lerp(0.056, 0.084, P.head), anyHead = headR;
  const names = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'];
  const J = Object.fromEntries(names.map((n, i) => [n, i])), parent = { spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck', leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm', rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm', leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot', rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot' };
  const ank = H * 0.04, L = H * 0.262 * legsK, kneeY = ank + L, hipJ = kneeY + L, hipsY = hipJ + H * 0.02, hipW = H * (0.032 + P.hips * 0.016) * (male ? 0.95 : 1.1), shW = H * (0.06 + P.shoulders * 0.032) * (male ? 1.18 : 1), uaLen = H * 0.138, laLen = H * 0.128, neckY = hipsY + H * 0.245;
  const W = {}; // world positions at rest
  W.hips = [0, hipsY, 0]; W.spine = [0, hipsY + H * 0.052, 0]; W.chest = [0, hipsY + H * 0.12, 0]; W.upperChest = [0, hipsY + H * 0.19, 0]; W.neck = [0, neckY, 0]; W.head = [0, neckY + H * 0.035, 0];
  for (const [side, sg] of [['left', 1], ['right', -1]]) { W[side + 'Shoulder'] = [sg * H * 0.02, hipsY + H * 0.222, 0]; W[side + 'UpperArm'] = [sg * shW, hipsY + H * 0.228, 0]; W[side + 'LowerArm'] = [sg * (shW + uaLen), hipsY + H * 0.228, 0]; W[side + 'Hand'] = [sg * (shW + uaLen + laLen), hipsY + H * 0.228, 0];
    W[side + 'UpperLeg'] = [sg * hipW, hipJ, 0]; W[side + 'LowerLeg'] = [sg * hipW, kneeY, H * 0.004]; W[side + 'Foot'] = [sg * hipW, ank, 0]; W[side + 'Toes'] = [sg * hipW, ank - H * 0.018, H * 0.08]; }
  const nodes = names.map(n => { const pn = parent[n], w = W[n], pw = pn ? W[pn] : [0, 0, 0]; return { name: n, parent: pn ? J[pn] : -1, children: [], t: [w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]], r: [0, 0, 0, 1], s: [1, 1, 1] }; }); nodes.forEach((nd, i) => { if (nd.parent >= 0) nodes[nd.parent].children.push(i); });
  const jw1 = n => [[J[n], 1]], blend = (y, stops, range) => { // stops: [[y, bone], ...] from top to bottom; smooth hand-over between neighbours
    let out = [[J[stops[0][1]], 1]]; for (let i = 1; i < stops.length; i++) { const edge = stops[i][0], t = clamp((edge + range - y) / (2 * range), 0, 1); if (t > 0) { out = out.map(([j, w]) => [j, w * (1 - t)]); out.push([J[stops[i][1]], t]); } } return out.filter(([, w]) => w > 0.001).slice(0, 4); };
  const solid = Part(null, -1, false), face = Part(null, -1, true), parts = [solid, face];
  const skinC = () => skin, hairC = () => hair, skinShade = (y) => skin;
  // --- torso ---
  const waistX = H * (0.04 + build * 0.03) * (male ? 1.18 : 0.92), hipX = H * (0.056 + P.hips * 0.026) * (male ? 0.95 : 1.12), chestX = H * (0.054 + build * 0.026) * (male ? 1.22 : 0.98), waistZ = waistX * 0.68, chestZ = chestX * (male ? 0.72 : 0.7) , hipZ = hipX * 0.72;
  const ty = [hipsY - H * 0.04, hipsY + H * 0.009, hipsY + H * 0.056, hipsY + H * 0.108, hipsY + H * 0.16, hipsY + H * 0.2, hipsY + H * 0.225, hipsY + H * 0.243, neckY + H * 0.01];
  const trx = [hipX, hipX * 1.02, waistX, lerp(waistX, chestX, 0.5), chestX, lerp(chestX, shW, 0.7), shW * 0.62, headR * 0.45, headR * 0.3], trz = [hipZ, hipZ, waistZ, lerp(waistZ, chestZ, 0.5), chestZ, chestZ * 0.85, chestZ * 0.6, headR * 0.42, headR * 0.34];
  const torsoPath = ty.map(y => [0, y, 0]), uniformF = P.outfit === 'uniform' || P.outfit === 'dress', waistLine = hipsY + (P.outfit === 'sport' ? H * 0.12 : H * 0.04);
  const torsoColor = (t, ca, sa, pos) => { const y = pos[1]; if (P.outfit === 'dress') return y < neckY - H * 0.02 ? top : skin; if (P.outfit === 'sport') return y > hipsY + H * 0.13 && y < neckY - H * 0.01 ? top : (y <= hipsY + H * 0.02 ? bottom : skin); if (y > neckY - H * 0.01) return skin; return y > waistLine ? top : (male || P.outfit === 'casual' ? bottom : skin); };
  tube(solid, torsoPath, trx, trz, torsoColor, (t, pt) => blend(pt[1], [[ty[8], 'upperChest'], [hipsY + H * 0.16, 'chest'], [hipsY + H * 0.1, 'spine'], [hipsY + H * 0.03, 'hips']], H * 0.025), { seg: 24, dense: 110 });
  if (!male) { const bs = H * lerp(0.012, 0.026, P.bust); for (const sg of [-1, 1]) ellipsoid(solid, [sg * chestX * 0.42, hipsY + H * 0.15, chestZ * 0.7], [bs * 1.1, bs, bs * 0.95], (dx, dy, dz, y) => (P.outfit === 'casual' || P.outfit === 'sport' || P.outfit === 'dress' || P.outfit === 'uniform' ? top : skin), jw1('chest'), { seg: 14, rings: 10 }); }
  // --- neck and head ---
  const neckPath = [[0, neckY - H * 0.005, 0], [0, neckY + H * 0.02, 0], [0, neckY + H * 0.05, 0]]; tube(solid, neckPath, [headR * 0.36, headR * 0.34, headR * 0.33], [headR * 0.36, headR * 0.34, headR * 0.33], skinC, t => (t < 0.5 ? jw1('neck') : [[J.neck, 1 - (t - 0.5) * 2], [J.head, (t - 0.5) * 2]]), { seg: 12 });
  const hc = [0, neckY + H * 0.035 + headR * 0.88, headR * 0.02]; ellipsoid(face, hc, [headR * 0.94, headR * 1.02, headR * 0.98], () => [1, 1, 1], jw1('head'), { seg: 48, rings: 32, uv: true, jaw: 0.34 });
  // --- hair ---
  const hr = headR, hCol = () => hair, hairJ = jw1('head'), hairCap = (keep, scale = 1.07, extra = {}) => ellipsoid(solid, hc, [hr * 0.94 * scale, hr * 1.02 * scale, hr * 0.98 * scale], hCol, hairJ, { seg: 40, rings: 26, keep: (p, a, b) => { const cx = (p.positions[a * 3] + p.positions[b * 3 + 3]) / 2 - hc[0], cy = (p.positions[a * 3 + 1] + p.positions[b * 3 + 4]) / 2 - hc[1], cz = (p.positions[a * 3 + 2] + p.positions[b * 3 + 5]) / 2 - hc[2], l = Math.hypot(cx, cy, cz) || 1; return keep(cx / l, cy / l, cz / l); }, ...extra });
  const lock = (pts, r0, r1, seg = 8) => tube(solid, pts, pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1))), pts.map((_, i) => lerp(r0, r1, i / (pts.length - 1)) * 0.8), hCol, () => hairJ, { seg, ref: [1, 0, 0] });
  const at = (dx, dy, dz, k = 1.07) => [hc[0] + dx * hr * 0.94 * k, hc[1] + dy * hr * 1.02 * k, hc[2] + dz * hr * 0.98 * k];
  const hs = P.hairStyle, D = Math.PI / 180;
  for (const sg of [-1, 1]) ellipsoid(solid, [hc[0] + sg * hr * 0.9, hc[1] - hr * 0.1, hc[2] - hr * 0.02], [hr * 0.09, hr * 0.2, hr * 0.13], () => skin, hairJ, { seg: 10, rings: 8 });
  // a point on a slightly enlarged head: lon 0 = front, + = character's left; lat 90 = crown; k = distance from the scalp; dy = hang below, in head radii
  const sph = (lon, lat, k = 1.08, dy = 0, dx = 0) => [hc[0] + Math.sin(lon * D) * Math.cos(lat * D) * hr * 0.94 * k + dx * hr, hc[1] + Math.sin(lat * D) * hr * 1.02 * k - dy * hr, hc[2] + Math.cos(lon * D) * Math.cos(lat * D) * hr * 0.98 * k];
  const hl = mix(hair, [0.72, 0.78, 1], 0.6), ctrlPath = c => c.map(q => sph(q[0], q[1], q[2], q[3] || 0, q[4] || 0));
  // one flat, tapering strand of hair (a ribbon along the path), lighter down its middle like a painted highlight
  const strand = (ctrl, w, opt = {}) => { const pts = ctrlPath(ctrl), n = pts.length, mid = pts[Math.floor((n - 1) / 2)], ref = norm3([mid[0] - hc[0], mid[1] - hc[1] * 0.0 - hc[1] * 1.0 + 0, mid[2] - hc[2]]), sh = opt.shade || 1, tip = opt.tip === undefined ? 0.04 : opt.tip, hold = opt.hold === undefined ? 0.45 : opt.hold;
    const rx = pts.map((_, i) => { const t = i / (n - 1); return hr * w * (t < hold ? 1 : lerp(1, tip, ((t - hold) / (1 - hold)) ** 1.15)) * (t < 0.12 ? 0.8 + t * 1.6 : 1); }), rz = rx.map(v => Math.max(hr * 0.012, v * 0.16));
    tube(solid, pts, rx, rz, (t, ca, sa) => { let c = dark(hair, sh); if (t < 0.14) c = dark(c, 0.72); if (sa > 0.15 && Math.abs(ca) < 0.5 && t > 0.12 && t < 0.88) c = mix(c, hl, 0.5 * (1 - Math.abs(ca) * 1.6)); return c; }, () => hairJ, { seg: 8, ref, dense: 16 }); };
  if (hs !== 'none') {
    // the scalp: a smooth shell with a curved hairline
    const low = { short: -0.1, spiky: 0.02, bob: -0.45, long: -0.35, ponytail: -0.2, twin: -0.2 }[hs];
    hairCap((dx, dy, dz) => !(dz > 0.28 && dy < 0.7 - 0.38 * dx * dx && Math.abs(dx) < 0.95) && !(dz > 0.3 && dy < 0.15) && dy > (dz > 0.2 ? Math.max(low, 0.1) : low), 1.06, { seg: 72, rings: 44 });
    const spiky = hs === 'spiky', nb = spiky ? 7 : 9;
    // fringe: strands from a centre parting, sweeping outwards over the forehead
    for (let i = 0; i < nb; i++) { const u = (i / (nb - 1)) * 2 - 1, sg = u < 0 ? -1 : 1, au = Math.abs(u), lon = u * 72, tipLat = spiky ? 14 + au * 24 : 16 + au * 22 + ((i * 7) % 3) * 3; strand([[lon * 0.15, 86, 1.04], [lon * 0.6, 66, 1.1], [lon * 1.0, 44, 1.15], [lon * 1.06 + sg * (spiky ? 4 : 2), tipLat, 1.13, 0, sg * (spiky ? 0.12 : 0.04) * (1 - au * 0.4)]], spiky ? 0.2 : 0.23, { shade: 0.9 + ((i * 5) % 4) * 0.05, tip: spiky ? 0 : 0.05, hold: spiky ? 0.3 : 0.55 }); }
    // the strands that frame the face
    if (hs !== 'short' && !spiky) for (const sg of [-1, 1]) for (let j = 0; j < 3; j++) { const off = (j - 1) * 7, len = hs === 'bob' ? 1.1 + j * 0.2 : hs === 'long' ? 3.2 + j * 0.5 : 2.2 + j * 0.4; strand([[sg * (66 + off * 0.3), 66, 1.1], [sg * (80 + off), 36, 1.14], [sg * (88 + off * 0.5), 6, 1.14, 0.4 * len * 0.2], [sg * (84 + off * 0.5), -20, 1.14, 0.55 * len, sg * 0.05], [sg * (80 + off * 0.5), -30, 1.12, len, -sg * 0.06]], 0.2 - j * 0.02, { shade: 0.95 + j * 0.04, hold: 0.5 }); }
    if (hs === 'short') for (const sg of [-1, 1]) for (let j = 0; j < 2; j++) strand([[sg * 72, 62, 1.1], [sg * 86, 30, 1.13], [sg * (92 - j * 6), 4, 1.12, 0.1], [sg * (88 - j * 6), -8, 1.1, 0.35]], 0.19, { shade: 0.9 + j * 0.1, tip: 0.03 });
    const back = (count, from, to, dropMin, dropMax, wave = 0.5, wide = 0.3) => { for (let i = 0; i < count; i++) { const u = count === 1 ? 0.5 : i / (count - 1), lon = lerp(from, to, u), dr = lerp(dropMin, dropMax, 0.5 + 0.5 * Math.sin(i * 2.4)) * (1 - 0.28 * Math.abs(u - 0.5) * 2), kk = 1.14 + dr * 0.04; strand([[lon, 78, 1.05], [lon, 40, 1.12], [lon, 4, kk, 0.15], [lon + wave * 6 * Math.sin(i), -20, kk + 0.04, dr * 0.35, 0], [lon + wave * 4 * Math.cos(i * 1.7), -30, kk + 0.08, dr * 0.7, 0], [lon + wave * 7 * Math.sin(i * 1.3), -35, kk + 0.1, dr, 0]], wide, { shade: 0.88 + ((i * 3) % 5) * 0.05, hold: 0.55, tip: 0.02 }); } };
    if (hs === 'long') back(12, 98, 262, 3.4, 4.6, 1);
    if (hs === 'bob') back(10, 98, 262, 0.9, 1.3, 0.2, 0.34);
    if (hs === 'short') back(6, 120, 240, 0.12, 0.35, 0, 0.36);
    if (hs === 'spiky') back(5, 120, 240, 0.0, 0.3, 0, 0.3);
    if (hs === 'ponytail') { back(5, 130, 230, 0.1, 0.4, 0, 0.36); for (let i = 0; i < 6; i++) { const o = (i - 2.5) * 0.14, sw = Math.sin(i * 1.9); strand([[180 + sw * 6, 52, 1.1], [180, 40, 1.25, 0, o], [180 + sw * 6, 22, 1.55, -0.3, o * 1.4], [180 + sw * 8, 0, 1.55, 1.5, o * 1.8], [180 + sw * 10, -10, 1.45, 3.2, o * 1.6], [180 + sw * 12, -14, 1.35, 4.8, o]], 0.2, { shade: 0.9 + (i % 3) * 0.06, hold: 0.4, tip: 0.02 }); } }
    if (hs === 'twin') for (const sg of [-1, 1]) { back(2, sg > 0 ? 110 : 250, sg > 0 ? 140 : 220, 0.1, 0.3, 0, 0.3); for (let i = 0; i < 5; i++) { const o = (i - 2) * 0.035, sw = Math.sin(i * 1.7 + sg); strand([[sg * 96 + sw * 2, 56, 1.1], [sg * 100, 40, 1.24, 0, sg * (0.3 + o)], [sg * 100, 22, 1.45, 0.5, sg * (0.8 + o)], [sg * 98, 4, 1.55, 2.2, sg * (1.0 + o * 2)], [sg * 96, -6, 1.55, 4, sg * (1.05 + o * 2)], [sg * 94, -10, 1.5, 5.2 - (i % 2) * 0.5, sg * (1.0 + o * 2)]], 0.27, { shade: 0.9 + (i % 3) * 0.06, hold: 0.45, tip: 0.03 }); } }
    if (spiky) for (let i = 0; i < 12; i++) { const lon = i / 12 * 360, up = 0.6 + (i % 3) * 0.28; strand([[lon, 60, 1.05], [lon, 74, 1.25, 0, 0], [lon + 8, 78 + up * 6, 1.4 + up * 0.5, 0, 0]], 0.2, { tip: 0, hold: 0.2, shade: 0.9 + (i % 3) * 0.07 }); }
  }
  // --- accessories ---
  if (P.accessory === 'glasses') { for (const sg of [-1, 1]) tube(solid, Array.from({ length: 17 }, (_, i) => { const a = i / 16 * Math.PI * 2; return [hc[0] + sg * hr * 0.4 + Math.cos(a) * hr * 0.3, hc[1] - hr * 0.04 + Math.sin(a) * hr * 0.27, hc[2] + hr * 1.0]; }), new Array(17).fill(hr * 0.028), new Array(17).fill(hr * 0.028), () => dark(accent, 0.5), () => hairJ, { seg: 6, ref: [0, 0, 1] }); tube(solid, [[hc[0] - hr * 0.12, hc[1] - hr * 0.02, hc[2] + hr * 1.01], [hc[0] + hr * 0.12, hc[1] - hr * 0.02, hc[2] + hr * 1.01]], [hr * 0.02, hr * 0.02], [hr * 0.02, hr * 0.02], () => dark(accent, 0.5), () => hairJ, { seg: 6 }); }
  if (P.accessory === 'cat ears') for (const sg of [-1, 1]) lock([at(sg * 0.55, 0.78, 0.0, 1.0), at(sg * 0.7, 1.25, -0.05, 1.05), at(sg * 0.66, 1.62, -0.05, 1.05)], hr * 0.34, hr * 0.012, 10);
  if (P.accessory === 'ribbon') { const c0 = at(0.78, 0.7, 0.35, 1.09); for (const sg of [-1, 1]) ellipsoid(solid, [c0[0] + sg * hr * 0.03, c0[1] + sg * hr * 0.2, c0[2]], [hr * 0.13, hr * 0.26, hr * 0.1], () => accent, hairJ, { seg: 10, rings: 8, rot: p => p }); ellipsoid(solid, c0, [hr * 0.09, hr * 0.09, hr * 0.1], () => dark(accent, 0.8), hairJ, { seg: 8, rings: 6 }); }
  if (P.accessory === 'headband') tube(solid, Array.from({ length: 15 }, (_, i) => { const a = (i / 14 - 0.5) * 2.7; return [hc[0] + Math.sin(a) * hr * 1.0, hc[1] + hr * 0.62 + Math.cos(a) * hr * 0.55 * 0.7, hc[2] + Math.cos(a) * hr * 0.25 + hr * 0.52]; }), new Array(15).fill(hr * 0.07), new Array(15).fill(hr * 0.045), () => accent, () => hairJ, { seg: 8 });
  // --- arms and hands ---
  const shortSleeve = P.outfit === 'casual' || P.outfit === 'dress' || (P.outfit === 'uniform' && !male), noSleeve = P.outfit === 'sport';
  for (const [side, sg] of [['left', 1], ['right', -1]]) {
    const sx = W[side + 'UpperArm'][0], ex = W[side + 'LowerArm'][0], wx = W[side + 'Hand'][0], ay = W[side + 'UpperArm'][1], r = build * H * 0.006;
    const xs = [sg * shW * 0.8, sx, lerp(sx, ex, 0.55), ex, lerp(ex, wx, 0.55), wx, wx + sg * H * 0.012], path = xs.map(x => [x, ay, 0]), rr = [H * 0.027 + r, H * 0.023 + r, H * 0.02 + r * 0.7, H * 0.017, H * 0.015, H * 0.012, H * 0.012];
    const sleeveEnd = noSleeve ? sg * shW * 0.8 : shortSleeve ? sx + sg * uaLen * 0.5 : ex + sg * laLen * 0.82;
    tube(solid, path, rr, rr.map(v => v * 0.92), (t, ca, sa, pos) => ((pos[0] * sg) < (sleeveEnd * sg) && !noSleeve ? (P.outfit === 'dress' ? top : top) : skin), (t, pt) => { const x = pt[0] * sg; if (x < sx * sg) return [[J[side + 'Shoulder'], 0.5], [J[side + 'UpperArm'], 0.5]]; return blend2(x, [[ex * sg, side + 'LowerArm'], [wx * sg, side + 'Hand']], sx * sg, side + 'UpperArm', uaLen * 0.1); }, { seg: 14, ref: [0, 0, 1], dense: 110 });
    ellipsoid(solid, [sx, ay, 0], [H * 0.0235 + r, H * 0.0235 + r, H * 0.0225 + r], (dx, dy, dz, y) => (noSleeve ? skin : top), [[J[side + 'UpperArm'], 0.75], [J[side + 'Shoulder'], 0.25]], { seg: 14, rings: 10 });
    ellipsoid(solid, [wx + sg * H * 0.03, ay, 0], [H * 0.032, H * 0.013, H * 0.024], skinC, jw1(side + 'Hand'), { seg: 12, rings: 8 });
  }
  function blend2(x, stops, startX, startBone, range) { let out = [[J[startBone], 1]]; for (const [edge, bone] of stops) { const t = clamp((x - (edge - range)) / (2 * range), 0, 1); if (t > 0) { out = out.map(([j, w]) => [j, w * (1 - t)]); out.push([J[bone], t]); } } return out.filter(([, w]) => w > 0.001).slice(0, 4); }
  // --- legs and feet ---
  const legLen = P.outfit === 'casual' ? (male ? 1 : 0.42) : P.outfit === 'sport' ? 0.42 : male && P.outfit === 'uniform' ? 1 : 0;
  for (const [side, sg] of [['left', 1], ['right', -1]]) {
    const x = sg * hipW, ys = [hipJ + H * 0.025, hipJ - L * 0.4, kneeY + H * 0.01, kneeY - L * 0.1, ank + L * 0.45, ank + H * 0.012, ank], rl = [H * (0.04 + build * 0.01) * (male ? 1.0 : 1.04), H * (0.034 + build * 0.008), H * 0.024, H * 0.026, H * 0.021, H * 0.015, H * 0.015], path = ys.map(y => [x, y, 0]);
    const hemY = hipJ - L * (legLen * 2.0); const sock = ank + H * 0.07;
    tube(solid, path, rl, rl.map(v => v * 0.98), (t, ca, sa, pos) => (legLen > 0 && pos[1] > hemY ? bottom : pos[1] < sock ? (male ? shoes : [0.96, 0.96, 0.98]) : skin), (t, pt) => { const y = pt[1]; return blend(y, [[hipJ + H * 0.03, side + 'UpperLeg'], [kneeY, side + 'LowerLeg'], [ank + H * 0.005, side + 'Foot']], H * 0.03); }, { seg: 16, ref: [1, 0, 0], dense: 140 });
    ellipsoid(solid, [x, ank - H * 0.004, H * 0.034], [H * 0.024, H * 0.02, H * 0.062], () => shoes, jw1(side + 'Foot'), { seg: 14, rings: 10 });
  }
  if (P.outfit === 'uniform' && !male || P.outfit === 'dress') { const topY = hipsY + H * (P.outfit === 'dress' ? 0.08 : 0.05), botY = hipJ - L * (P.outfit === 'dress' ? 0.62 : 0.34), rt = hipX * 1.08, rb = hipX * (P.outfit === 'dress' ? 2.1 : 2.3); const n = 7, path = Array.from({ length: n }, (_, i) => [0, lerp(topY, botY, i / (n - 1)), 0]); const rx = path.map((_, i) => lerp(rt, rb, (i / (n - 1)) ** 0.8)), rz = rx.map(v => v * 0.92); tube(solid, path, rx, rz, (t, ca, sa, pos) => (P.outfit === 'dress' ? (t > 0.8 ? mix(top, accent, 0.5) : top) : (t > 0.9 ? accent : bottom)), () => jw1('hips'), { seg: 28 }); }
  if (P.outfit === 'uniform') { const by = hipsY + H * 0.2, bz = chestZ * 1.0 + H * 0.004; for (const sg of [-1, 1]) ellipsoid(solid, [sg * H * 0.017, by - H * 0.002, bz], [H * 0.018, H * 0.011, H * 0.007], () => accent, jw1('upperChest'), { seg: 10, rings: 6, rot: q => { const a = sg * 0.35, c = Math.cos(a), sn = Math.sin(a); return [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c, q[2]]; } }); ellipsoid(solid, [0, by, bz + H * 0.002], [H * 0.007, H * 0.008, H * 0.007], () => dark(accent, 0.75), jw1('upperChest'), { seg: 8, rings: 6 }); for (const sg of [-1, 1]) tube(solid, [[sg * H * 0.004, by - H * 0.006, bz], [sg * H * 0.01, by - H * 0.04, bz - H * 0.002], [sg * H * 0.014, by - H * 0.07, bz - H * 0.006]], [H * 0.007, H * 0.007, H * 0.005], [H * 0.003, H * 0.003, H * 0.003], () => accent, () => jw1('chest'), { seg: 6 }); }
  fixWinding(solid); fixWinding(face);
  const prims = [], mat = { solid: { color: [1, 1, 1, 1], shade: null, tex: -1, cut: -1, double: false, queue: 2000, outlineMode: 1, outlineWidth: 0.007, outlineColor: [0.2, 0.07, 0.09] }, face: { color: [1, 1, 1, 1], shade: null, tex: 0, cut: -1, double: false, queue: 2000, outlineMode: 1, outlineWidth: 0.007, outlineColor: [0.2, 0.07, 0.09] } };
  for (const [p, mm] of [[solid, mat.solid], [face, mat.face]]) { if (!p.idx.length) continue; prims.push({ pos: new Float32Array(p.positions), nor: new Float32Array(p.normals), uv: new Float32Array(p.uvs), col: new Float32Array(p.colors), idx: p.positions.length / 3 > 65000 ? new Uint32Array(p.idx) : new Uint16Array(p.idx), mat: mm, node: 0, skin: 0, joints: new Uint16Array(p.joints), weights: new Float32Array(p.weights) }); }
  const model = { kind: 'maker', name: 'Character', meta: {}, nodes, human: J, prims, skins: [{ joints: names.map((_, i) => i), ibm: null }], textures: [paintFace(P)], facing: [0, 0, 1], params: P };
  return model;
}

// ----- poses: each is { bone: [x, y, z] degrees in character space (x: toward the character's left, y: up, z: forward) } -----
// Left-side values are given; mirror() flips them to the right side (the sign of the twist and roll turns round).
const mirror = e => [e[0], -e[1], -e[2]];
const both = (o, bone, e) => { o['left' + bone] = e; o['right' + bone] = mirror(e); return o; };
const PRESETS = {
  'Stand (relaxed)': () => { const o = {}; both(o, 'UpperArm', [0, 0, -72]); both(o, 'LowerArm', [0, -6, 0]); both(o, 'Hand', [0, 0, 0]); return o; },
  'T-pose': () => ({}),
  'Hands on hips': () => { const o = {}; both(o, 'UpperArm', [0, 20, -52]); both(o, 'LowerArm', [0, 0, 0]); o.leftLowerArm = [0, -95, -10]; o.rightLowerArm = [0, 95, 10]; o.chest = [0, 0, 4]; o.head = [-4, 8, 0]; return o; },
  'Wave hello': () => { const o = {}; o.leftUpperArm = [0, 0, -72]; o.leftLowerArm = [0, -6, 0]; o.rightUpperArm = [0, 25, -70]; o.rightLowerArm = [0, 70, -20]; o.head = [0, -8, -6]; return o; },
  'Walking': () => { const o = {}; o.leftUpperLeg = [-26, 0, 2]; o.leftLowerLeg = [10, 0, 0]; o.rightUpperLeg = [22, 0, -2]; o.rightLowerLeg = [35, 0, 0]; o.rightFoot = [-10, 0, 0]; o.leftUpperArm = [0, 28, -72]; o.rightUpperArm = [0, 28, 72]; o.leftLowerArm = [0, -25, 0]; o.rightLowerArm = [0, 35, 0]; o.spine = [3, -4, 0]; o.chest = [0, 4, 0]; return o; },
  'Running': () => { const o = {}; o.hips = [14, 0, 0]; o.spine = [10, 0, 0]; o.leftUpperLeg = [-65, 0, 3]; o.leftLowerLeg = [55, 0, 0]; o.rightUpperLeg = [30, 0, -3]; o.rightLowerLeg = [85, 0, 0]; o.rightFoot = [-25, 0, 0]; o.leftUpperArm = [0, 75, -55]; o.leftLowerArm = [0, -95, 0]; o.rightUpperArm = [0, -40, 62]; o.rightLowerArm = [0, 70, 0]; o.head = [-10, 0, 0]; return o; },
  'Pointing': () => { const o = {}; o.leftUpperArm = [0, 0, -72]; o.leftLowerArm = [0, -6, 0]; o.rightUpperArm = [0, 88, 0]; o.rightLowerArm = [0, 0, 0]; o.chest = [0, -8, 0]; o.head = [0, -8, 0]; return o; },
  'Fighting stance': () => { const o = {}; o.hips = [0, -25, 0]; o.leftUpperLeg = [-30, 0, 18]; o.leftLowerLeg = [30, 0, 0]; o.rightUpperLeg = [18, 0, -18]; o.rightLowerLeg = [20, 0, 0]; o.leftUpperArm = [0, 55, -35]; o.leftLowerArm = [0, -115, 0]; o.rightUpperArm = [0, 25, 40]; o.rightLowerArm = [0, 110, 0]; o.spine = [8, 20, 0]; o.head = [8, 20, 0]; return o; },
  'Arms crossed': () => { const o = {}; o.leftUpperArm = [0, 30, -50]; o.leftLowerArm = [0, -140, 0]; o.rightUpperArm = [0, -30, 50]; o.rightLowerArm = [0, 140, 0]; o.head = [0, 0, 5]; return o; },
  'Cheer': () => { const o = {}; both(o, 'UpperArm', [0, 0, 150]); o.leftUpperArm = [0, 0, 150]; o.rightUpperArm = [0, 0, -150]; o.leftLowerArm = [0, 0, 8]; o.rightLowerArm = [0, 0, -8]; o.head = [-12, 0, 0]; o.leftUpperLeg = [0, 0, 8]; o.rightUpperLeg = [0, 0, -8]; return o; },
  'Bow': () => { const o = {}; both(o, 'UpperArm', [0, 0, -72]); both(o, 'LowerArm', [0, -6, 0]); o.spine = [28, 0, 0]; o.chest = [20, 0, 0]; o.head = [10, 0, 0]; return o; },
  'Thinking': () => { const o = {}; o.leftUpperArm = [0, 0, -72]; o.leftLowerArm = [0, -6, 0]; o.rightUpperArm = [0, 62, -12]; o.rightLowerArm = [0, 150, 0]; o.head = [8, 14, 6]; o.spine = [4, 0, 0]; return o; },
};
const api = { buildCharacter, cleanParams, paintFace, PRESETS, DEFAULTS, HAIR, OUTFIT, ACC, mirror };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA_char = api;
})();
