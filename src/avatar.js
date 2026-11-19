// Sudo Make Avatar Pose: a posing studio for VRM characters (VRoid Studio and friends). Turn the camera, bend arms and legs,
// change the face, show or hide clothes, wear pieces from another VRM, then save poses and use them in Sudo Make Manga.
// Original code for this project. It uses the 3D engine in src/sma3d.js; everything stays on this computer.
(() => {
'use strict';
const S3 = window.SMA3D, CH = window.SMA_char, SMA = window.SMA, $ = s => document.querySelector(s);
if (!S3 || !SMA || !$('#mangaview')) return;
const el = (tag, attrs = {}, text) => { const e = Object.assign(document.createElement(tag), attrs); if (text !== undefined) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const LS = 'sma-poses', newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const BONE_LABEL = b => b.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// ---------- state ----------
let name = 'Untitled avatar', pid = null, model = null, modelB64 = null, modelName = '', builtin = false;
let pose = {}, expr = {}, hide = [], outfits = [];           // outfits: { name, b64, keys }
let view = { yaw: 0, pitch: 0, zoom: 1, fov: 22, ox: 0, oy: 0, style: 'color', outline: 1 };
let tab = 'pose', bone = 'head', showDots = true, bg = 'dark', busy = false, msg = '';
const touch = () => document.dispatchEvent(new Event('sma-edit'));

// ---------- more poses (the ready-made ones from the character maker are added too) ----------
const both = (o, k, v) => { o['left' + k] = v.slice(); o['right' + k] = S3 && CH ? CH.mirror(v) : v.slice(); };
const EXTRA = {
  'Punch': () => { const o = {}; o.hips = [0, 25, 0]; o.spine = [6, 15, 0]; o.leftUpperLeg = [-28, 0, 10]; o.leftLowerLeg = [24, 0, 0]; o.rightUpperLeg = [18, 0, -12]; o.rightLowerLeg = [18, 0, 0]; o.rightUpperArm = [0, 88, 0]; o.rightLowerArm = [0, 0, 0]; o.leftUpperArm = [0, -50, -30]; o.leftLowerArm = [0, -120, 0]; o.head = [0, -15, 0]; return o; },
  'Kick': () => { const o = {}; o.hips = [0, 0, 8]; o.rightUpperLeg = [-95, 0, -6]; o.rightLowerLeg = [5, 0, 0]; o.rightFoot = [-20, 0, 0]; o.leftUpperLeg = [6, 0, 6]; o.leftUpperArm = [0, -40, -40]; o.leftLowerArm = [0, -90, 0]; o.rightUpperArm = [0, -20, 55]; o.rightLowerArm = [0, 60, 0]; o.spine = [-10, 0, -8]; return o; },
  'Jump': () => { const o = {}; o.leftUpperLeg = [-45, 0, 8]; o.leftLowerLeg = [80, 0, 0]; o.rightUpperLeg = [-30, 0, -8]; o.rightLowerLeg = [70, 0, 0]; o.leftUpperArm = [0, 0, 120]; o.rightUpperArm = [0, 0, -120]; o.head = [-10, 0, 0]; o.spine = [-6, 0, 0]; return o; },
  'Salute': () => { const o = {}; o.leftUpperArm = [0, 0, -72]; o.leftLowerArm = [0, -6, 0]; o.rightUpperArm = [0, 40, 15]; o.rightLowerArm = [0, 130, 0]; return o; },
  'Sit (legs forward)': () => { const o = {}; o.leftUpperLeg = [-90, 0, 4]; o.rightUpperLeg = [-90, 0, -4]; o.leftLowerLeg = [10, 0, 0]; o.rightLowerLeg = [10, 0, 0]; o.leftUpperArm = [0, 20, -62]; o.rightUpperArm = [0, -20, 62]; o.spine = [-4, 0, 0]; return o; },
  'Look back': () => { const o = {}; o.spine = [0, 30, 0]; o.chest = [0, 25, 0]; o.head = [0, 40, 0]; o.leftUpperArm = [0, 0, -72]; o.rightUpperArm = [0, 0, 72]; return o; },
};
const PRESETS = () => Object.assign({}, CH ? CH.PRESETS : {}, EXTRA);

// ---------- the pose library (shared with Sudo Make Manga) ----------
const lib = () => { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const saveLib = a => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) { say('Could not save: the browser storage is full.'); } };
const cleanPose = p => { const o = {}; if (p && typeof p === 'object') for (const [k, v] of Object.entries(p)) if (/^[a-zA-Z]{3,24}$/.test(k) && Array.isArray(v) && v.length === 3) { const a = v.map(Number); if (a.every(Number.isFinite)) o[k] = a.map(x => clamp(Math.round(x * 10) / 10, -360, 360)); } return o; };
const cleanExpr = e => { const o = {}; if (e && typeof e === 'object') for (const [k, v] of Object.entries(e)) if (typeof k === 'string' && k.length < 41 && Number.isFinite(+v) && +v > 0) o[k] = clamp(+v, 0, 1); return o; };

// ---------- the page ----------
const root = el('section', { id: 'avatarview' });
root.innerHTML = '<div id="av-bar"><input id="av-name" maxlength="60" aria-label="Avatar name"><button id="av-open" class="pri" type="button">Open VRM…</button><button id="av-builtin" type="button" title="A simple built-in character to try the poses">Try a built-in character</button><span class="sp"></span><button id="av-png" type="button" title="Save the picture with a see-through background">Save picture</button><button id="av-copy" type="button">Copy picture</button></div>' +
  '<div id="av-main"><div id="av-stage"><canvas id="av-cv" tabindex="0" aria-label="3D view of the avatar. Drag to turn, scroll to zoom."></canvas><div id="av-empty"><h2>Pose a VRM character</h2><p>Open a <b>.vrm</b> file (from VRoid Studio, for example) or drop it here. Then turn the camera, bend arms and legs, change the face, swap clothes and save poses.</p><p class="hint">Models stay on this computer. Check the model\'s own licence before you publish pictures of it.</p></div><div id="av-hint">Drag to turn · Scroll to zoom · Shift-drag to move · Click a dot to pick a body part</div></div>' +
  '<div id="av-side"><div id="av-tabs" role="tablist"></div><div id="av-body"></div></div></div><div id="av-foot"><span id="av-msg"></span></div><input id="av-file" type="file" accept=".vrm,.glb" hidden><input id="av-file2" type="file" accept=".vrm,.glb" hidden><input id="av-posefile" type="file" accept=".json,.smapose" multiple hidden>';
$('#mangaview').after(root);
const cv = $('#av-cv'), stage = $('#av-stage'), body = $('#av-body'), nameBox = $('#av-name'), foot = $('#av-msg');
const say = t => { msg = t; foot.textContent = t; };
nameBox.value = name; nameBox.oninput = () => { name = nameBox.value || 'Untitled avatar'; touch(); };

// ---------- drawing ----------
let dirty = false, raf = 0, dots = {};
function viewSt() { return { pose, yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, fov: view.fov, ox: view.ox, oy: view.oy, style: view.style, outline: view.outline, expr, hide }; }
function size() { const r = stage.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); return [Math.max(80, Math.round(r.width)), Math.max(80, Math.round(r.height)), d]; }
function draw() {
  raf = 0; dirty = false; const [w, h, d] = size(); const W = Math.round(w * d), H = Math.round(h * d); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  const x = cv.getContext('2d'); x.clearRect(0, 0, W, H); $('#av-empty').hidden = !!model;
  if (!model) return;
  try { const c = S3.render(model, viewSt(), W, H); x.drawImage(c, 0, 0); } catch (e) { say(String(e.message || e)); return; }
  dots = showDots ? S3.project(model, viewSt(), W, H) : {};
  if (showDots) for (const [b, p] of Object.entries(dots)) { if (!S3.HUMAN_BONES.includes(b)) continue; const on = b === bone; x.beginPath(); x.arc(p[0], p[1], (on ? 8 : 5) * d, 0, 7); x.fillStyle = on ? '#f4ff2b' : 'rgba(120,200,255,.85)'; x.fill(); x.lineWidth = 1.5 * d; x.strokeStyle = '#000b'; x.stroke(); }
}
const redraw = () => { if (!dirty) { dirty = true; raf = requestAnimationFrame(draw); } };
new ResizeObserver(() => { if (document.body.classList.contains('avatar-mode')) redraw(); }).observe(stage);

// ---------- mouse and touch on the picture ----------
let drag = null;
cv.addEventListener('pointerdown', ev => { if (ev.button > 0 && ev.button !== 2) return; cv.setPointerCapture(ev.pointerId); const r = cv.getBoundingClientRect(), k = cv.width / r.width, px = (ev.clientX - r.left) * k, py = (ev.clientY - r.top) * k;
  let hit = null, best = (14 * k) ** 2; for (const [b, p] of Object.entries(dots)) { if (!S3.HUMAN_BONES.includes(b)) continue; const dd = (p[0] - px) ** 2 + (p[1] - py) ** 2; if (dd < best) { best = dd; hit = b; } }
  drag = { x: ev.clientX, y: ev.clientY, pan: ev.shiftKey || ev.button === 2, hit, moved: false, yaw: view.yaw, pitch: view.pitch, ox: view.ox, oy: view.oy }; });
cv.addEventListener('pointermove', ev => { if (!drag) return; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (!drag.moved) return;
  if (drag.pan) { const h = cv.getBoundingClientRect().height; view.ox = clamp(drag.ox - dx / h * 1.1 / view.zoom, -2, 2); view.oy = clamp(drag.oy + dy / h * 1.1 / view.zoom, -2, 2); }
  else { view.yaw = ((drag.yaw - dx * 0.5) % 360 + 540) % 360 - 180; view.pitch = clamp(drag.pitch + dy * 0.4, -85, 85); }
  redraw(); });
cv.addEventListener('pointerup', ev => { if (!drag) return; const d = drag; drag = null; if (!d.moved && d.hit) { bone = d.hit; if (tab !== 'pose') setTab('pose'); else build(); redraw(); } else if (d.moved) { touch(); if (tab === 'view') build(); } });
cv.addEventListener('wheel', ev => { ev.preventDefault(); view.zoom = clamp(view.zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1), 0.3, 8); redraw(); clearTimeout(cv._t); cv._t = setTimeout(touch, 400); }, { passive: false });
cv.addEventListener('contextmenu', ev => ev.preventDefault());

// ---------- loading models ----------
const u8b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const b64u8 = b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function freeModel() { if (model) { try { S3.disposeModel(model); } catch (e) {} } model = null; }
async function setModel(buf, nm, keep) {
  if (buf.byteLength > 120e6) throw new Error('That model file is too big (over 120 MB).');
  const m = await S3.loadVRM(buf); freeModel(); model = m; builtin = false; modelName = nm; modelB64 = u8b64(new Uint8Array(buf));
  if (!keep) { pose = {}; expr = {}; hide = []; outfits = []; bone = m.human.head !== undefined ? 'head' : 'hips'; view = { yaw: 0, pitch: 0, zoom: 1, fov: 22, ox: 0, oy: 0, style: view.style, outline: view.outline }; if (name === 'Untitled avatar') { name = String(m.meta && (m.meta.title || m.meta.name) || nm.replace(/\.(vrm|glb)$/i, '')).slice(0, 60); nameBox.value = name; } }
  const mt = m.meta || {}; say(`Opened "${modelName}"${mt.author ? ' by ' + mt.author : ''}. Models carry their own licence${mt.licenseName ? ' (' + mt.licenseName + ')' : ''}: check the terms before you publish pictures of it.`);
  thumbCache.clear(); build(); redraw(); touch();
}
async function openFile(f) { try { say('Opening…'); await setModel(await f.arrayBuffer(), f.name); } catch (e) { say(String(e.message || e)); } }
function useBuiltin() { if (!CH) return; freeModel(); model = CH.buildCharacter(CH.cleanParams({}), { faceSize: 512 }); builtin = true; modelB64 = null; modelName = 'Built-in character'; pose = {}; expr = {}; hide = []; outfits = []; bone = 'head'; thumbCache.clear(); say('A simple built-in character. Open a VRM for a full model with face controls and clothes.'); build(); redraw(); touch(); }
$('#av-open').onclick = () => $('#av-file').click(); $('#av-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
$('#av-builtin').onclick = useBuiltin;
stage.addEventListener('dragover', e => { e.preventDefault(); }); stage.addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => /\.(vrm|glb)$/i.test(x.name)); if (f) openFile(f); });

// ---------- the side panel ----------
const TABS = [['pose', 'Pose'], ['face', 'Face'], ['outfit', 'Outfit'], ['view', 'Camera'], ['saved', 'Saved poses']];
const tabsBox = $('#av-tabs');
TABS.forEach(([k, t]) => { const b = el('button', { type: 'button', role: 'tab', id: 'av-t-' + k }, t); b.onclick = () => setTab(k); tabsBox.append(b); });
function setTab(k) { tab = k; build(); }
function slider(box, label, get, set, lo, hi, step, fmt) { const row = el('label', { className: 'av-sl' }), v = el('span', { className: 'v' }), r = el('input', { type: 'range', min: lo, max: hi, step: step || 1, value: get() });
  const upd = () => { v.textContent = fmt ? fmt(+r.value) : String(Math.round(+r.value * 10) / 10); }; upd(); r.oninput = () => { set(+r.value); upd(); redraw(); }; r.onchange = touch; row.append(el('span', {}, label), r, v); box.append(row); return r; }
const thumbCache = new Map();
function thumbOf(key, st, w, h) { const k = key + '|' + w; if (!thumbCache.has(k)) { try { thumbCache.set(k, S3.render(model, st, w, h)); } catch (e) { thumbCache.set(k, null); } } return thumbCache.get(k); }
function tiles(box, items, onPick) { const g = el('div', { className: 'av-tiles' }); for (const [k, label, th] of items) { const b = el('button', { type: 'button', className: 'av-tile', title: label }); if (th) b.append(th); b.append(el('small', {}, label)); b.onclick = () => onPick(k); g.append(b); } box.append(g); }
const humanBones = () => S3.HUMAN_BONES.filter(b => model && model.human[b] !== undefined);

function build() {
  TABS.forEach(([k]) => { const b = $('#av-t-' + k); b.classList.toggle('on', k === tab); b.setAttribute('aria-selected', String(k === tab)); });
  body.textContent = ''; if (!model) { body.append(el('p', { className: 'hint' }, 'Open a VRM model to start.')); return; }
  ({ pose: buildPose, face: buildFace, outfit: buildOutfit, view: buildView, saved: buildSaved })[tab]();
}
function applyPose(p) { pose = {}; const hm = model.human; for (const k of Object.keys(p)) if (hm[k] !== undefined) pose[k] = p[k].slice(); touch(); build(); redraw(); }
function buildPose() {
  const P = PRESETS(), names = Object.keys(P); body.append(el('h5', {}, 'Ready-made poses'));
  const hm = model.human; tiles(body, names.map(n => { const p = P[n](), ps = {}; for (const k of Object.keys(p)) if (hm[k] !== undefined) ps[k] = p[k]; return [n, n, thumbOf('p|' + n, { pose: ps, yaw: 0, pitch: 0, zoom: 1.05, fov: 22, style: 'color', outline: 1, hide }, 60, 96)]; }), n => applyPose(P[n]()));
  body.append(el('h5', {}, 'Move one part'));
  const bones = humanBones(); if (!bones.includes(bone)) bone = bones[0];
  const sel = el('select'); bones.forEach(k => sel.append(el('option', { value: k }, BONE_LABEL(k)))); sel.value = bone; sel.onchange = () => { bone = sel.value; build(); redraw(); };
  const lab = el('label', {}, 'Body part '); lab.append(sel); body.append(lab);
  const cur = () => pose[bone] || (pose[bone] = [0, 0, 0]);
  [['Tilt forward / back', 0], ['Turn', 1], ['Lean sideways', 2]].forEach(([t, i]) => slider(body, t, () => (pose[bone] || [0, 0, 0])[i], v => { cur()[i] = v; }, -180, 180, 1, v => Math.round(v) + '°'));
  const row = el('div', { className: 'av-row' }), mk = (t, f, title) => { const b = el('button', { type: 'button', title }, t); b.onclick = f; row.append(b); };
  mk('Copy to other side', () => { const other = bone.startsWith('left') ? 'right' + bone.slice(4) : bone.startsWith('right') ? 'left' + bone.slice(5) : null; if (other && hm[other] !== undefined) { pose[other] = CH ? CH.mirror(cur()) : cur().slice(); touch(); redraw(); say('Copied to ' + BONE_LABEL(other) + '.'); } }, 'Gives the matching part on the other side the mirrored pose');
  mk('Reset this part', () => { delete pose[bone]; touch(); build(); redraw(); }); mk('Reset everything', () => { pose = {}; touch(); build(); redraw(); });
  mk('Swap left and right', () => { const np = {}; for (const [k, v] of Object.entries(pose)) { const o = k.startsWith('left') ? 'right' + k.slice(4) : k.startsWith('right') ? 'left' + k.slice(5) : null; if (o) np[o] = CH ? CH.mirror(v) : v.slice(); else np[k] = [v[0], -v[1], -v[2]]; } pose = np; touch(); redraw(); });
  body.append(row); const dl = el('label', { className: 'cv-chk' }); const cb = el('input', { type: 'checkbox', checked: showDots }); cb.onchange = () => { showDots = cb.checked; redraw(); }; dl.append(cb, ' Show joint dots on the picture'); body.append(dl);
  body.append(el('div', { className: 'hint' }, 'Tip: click a dot on the picture to pick that part, then use the sliders. Arms and legs bend from the part you pick and everything below follows. Arms: pick the upper arm to swing the whole arm, the lower arm to bend the elbow.'));
}
const FACE_MAIN = [['happy', 'Happy'], ['sad', 'Sad'], ['angry', 'Angry'], ['relaxed', 'Relaxed'], ['surprised', 'Surprised'], ['blink', 'Blink'], ['blinkL', 'Wink left'], ['blinkR', 'Wink right'], ['a', 'Mouth “A”'], ['i', 'Mouth “I”'], ['u', 'Mouth “U”'], ['e', 'Mouth “E”'], ['o', 'Mouth “O”']];
function buildFace() {
  const ex = model.exprs || {}, keys = Object.keys(ex); if (!keys.length) { body.append(el('p', { className: 'hint' }, builtin ? 'The built-in character has a painted face without controls. Open a VRM for faces you can change.' : 'This model has no face controls (no expressions inside the file).')); return; }
  const have = FACE_MAIN.filter(([k]) => ex[k]), custom = keys.filter(k => !FACE_MAIN.some(([m]) => m === k) && !/^look/.test(k));
  body.append(el('h5', {}, 'Moods'));
  const g = el('div', { className: 'av-chips' }); [['', 'Neutral'], ...have.filter(([k]) => ['happy', 'sad', 'angry', 'relaxed', 'surprised'].includes(k))].forEach(([k, t]) => { const b = el('button', { type: 'button', className: (!k && !Object.keys(expr).some(x => ['happy', 'sad', 'angry', 'relaxed', 'surprised'].includes(x))) || (k && expr[k] ? true : false) ? 'on' : '' }, t); b.onclick = () => { for (const m of ['happy', 'sad', 'angry', 'relaxed', 'surprised']) delete expr[m]; if (k) expr[k] = 1; touch(); build(); redraw(); }; g.append(b); }); body.append(g);
  body.append(el('h5', {}, 'Fine tune'));
  for (const [k, t] of have) slider(body, t, () => expr[k] || 0, v => { if (v > 0) expr[k] = v; else delete expr[k]; }, 0, 1, 0.01, v => Math.round(v * 100) + '%');
  if (custom.length) { body.append(el('h5', {}, 'This model\'s own faces')); for (const k of custom) slider(body, k, () => expr[k] || 0, v => { if (v > 0) expr[k] = v; else delete expr[k]; }, 0, 1, 0.01, v => Math.round(v * 100) + '%'); }
  const r = el('div', { className: 'av-row' }), z = el('button', { type: 'button' }, 'Reset face'); z.onclick = () => { expr = {}; touch(); build(); redraw(); }; r.append(z); body.append(r);
}
function buildOutfit() {
  const parts = S3.parts(model), kinds = [['cloth', 'Clothes'], ['accessory', 'Accessories'], ['hair', 'Hair'], ['skin', 'Body'], ['face', 'Face'], ['eye', 'Eyes'], ['other', 'Other']];
  if (parts.length <= 1 && builtin) body.append(el('p', { className: 'hint' }, 'The built-in character is one piece. Open a VRM to swap clothes.'));
  for (const [kind, title] of kinds) { const list = parts.filter(p => p.kind === kind); if (!list.length) continue; body.append(el('h5', {}, title));
    for (const p of list) { const row = el('label', { className: 'cv-chk av-part' }), cb = el('input', { type: 'checkbox', checked: !hide.includes(p.key) }); cb.onchange = () => { hide = cb.checked ? hide.filter(k => k !== p.key) : [...hide, p.key]; touch(); redraw(); }; row.append(cb, ' ' + p.label);
      if (p.added) { const x = el('button', { type: 'button', className: 'x', title: 'Take this piece off for good' }, '×'); x.onclick = e => { e.preventDefault(); removePart(p.key); }; row.append(x); } body.append(row); } }
  body.append(el('h5', {}, 'Wear pieces from another model'));
  body.append(el('div', { className: 'hint' }, 'Pick another VRM, then choose which of its clothes or accessories to put on. Works best between models made in VRoid Studio, which share the same skeleton. Check that model\'s licence allows it.'));
  const b = el('button', { type: 'button', className: 'pri' }, 'Add pieces from a VRM…'); b.onclick = () => $('#av-file2').click(); body.append(b);
}
function removePart(key) { model.prims = model.prims.filter(p => !(p.added && S3.groupOf(p) === key)); S3.disposeModel(model); outfits = outfits.map(o => Object.assign({}, o, { keys: o.keys.filter(k => k !== key) })).filter(o => o.keys.length); hide = hide.filter(k => k !== key); thumbCache.clear(); touch(); build(); redraw(); }
$('#av-file2').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f || !model) return; try {
  say('Reading ' + f.name + '…'); const buf = await f.arrayBuffer(), donor = await S3.loadVRM(buf), parts = S3.parts(donor).filter(p => ['cloth', 'accessory', 'hair'].includes(p.kind));
  if (!parts.length) { say('That model has no clothes or accessories to add.'); S3.disposeModel(donor); return; }
  const dlg = el('dialog', { id: 'av-dlg' }), form = el('form', { method: 'dialog' }); form.append(el('h3', {}, 'Wear pieces from "' + (donor.name || f.name) + '"')); const checks = [];
  parts.forEach(p => { const l = el('label', { className: 'cv-chk' }), c = el('input', { type: 'checkbox', checked: p.kind !== 'hair' }); checks.push([c, p]); l.append(c, ' ' + p.label + '  ·  ' + p.kind); form.append(l); });
  const row = el('div', { className: 'av-row' }), ok = el('button', { type: 'submit', className: 'pri' }, 'Put on'), no = el('button', { type: 'button' }, 'Cancel'); no.onclick = () => { dlg.close(); }; row.append(ok, no); form.append(row); dlg.append(form); document.body.append(dlg); dlg.showModal();
  form.onsubmit = () => { const keys = checks.filter(([c]) => c.checked).map(([, p]) => p.key); if (keys.length) { const n = S3.addOutfit(model, donor, keys, String(donor.name || f.name).slice(0, 30)); outfits.push({ name: f.name, b64: u8b64(new Uint8Array(buf)), keys }); thumbCache.clear(); say(`Added ${n} piece${n === 1 ? '' : 's'} from "${donor.name || f.name}".`); touch(); build(); redraw(); } };
  dlg.addEventListener('close', () => { dlg.remove(); S3.disposeModel(donor); });
} catch (err) { say(String(err.message || err)); } };
const ANGLES = [['Front', { yaw: 0, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Three-quarter L', { yaw: 35, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Three-quarter R', { yaw: -35, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Side', { yaw: 90, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Back', { yaw: 180, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['From above', { yaw: 0, pitch: 32, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['From below', { yaw: 0, pitch: -26, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Dramatic low', { yaw: 20, pitch: -22, zoom: 1.1, oy: 0, ox: 0, fov: 45 }], ['Waist up', { yaw: 0, pitch: 0, zoom: 1.7, oy: 0.2, ox: 0, fov: 22 }], ['Bust', { yaw: 0, pitch: 0, zoom: 2.4, oy: 0.3, ox: 0, fov: 20 }], ['Face', { yaw: 0, pitch: 0, zoom: 3.6, oy: 0.42, ox: 0, fov: 16 }], ['Face, turned', { yaw: 28, pitch: 4, zoom: 3.4, oy: 0.42, ox: 0, fov: 16 }]];
function buildView() {
  body.append(el('h5', {}, 'Camera angle')); tiles(body, ANGLES.map(([n, v]) => [n, n, thumbOf('c|' + n + '|' + JSON.stringify(expr), Object.assign({ pose, style: 'color', outline: 1, expr, hide }, v), 60, 80)]), n => { Object.assign(view, ANGLES.find(a => a[0] === n)[1]); touch(); build(); redraw(); });
  body.append(el('h5', {}, 'Fine tune'));
  slider(body, 'Turn around', () => view.yaw, v => { view.yaw = v; }, -180, 180, 1, v => Math.round(v) + '°'); slider(body, 'Look from above / below', () => view.pitch, v => { view.pitch = v; }, -85, 85, 1, v => Math.round(v) + '°');
  slider(body, 'Zoom', () => view.zoom, v => { view.zoom = v; }, 0.3, 8, 0.05, v => v.toFixed(2) + '×'); slider(body, 'Lens (wide to flat)', () => view.fov, v => { view.fov = v; }, 8, 60, 1, v => Math.round(v) + '°');
  slider(body, 'Outline', () => view.outline, v => { view.outline = v; }, 0, 3, 0.1, v => v.toFixed(1));
  const st = el('select'); [['color', 'Colour'], ['gray', 'Grey'], ['ink', 'Black and white (ink)']].forEach(([v, t]) => st.append(el('option', { value: v }, t))); st.value = view.style; st.onchange = () => { view.style = st.value; thumbCache.clear(); touch(); redraw(); }; const sl = el('label', {}, 'Look '); sl.append(st); body.append(sl);
  const bs = el('select'); [['dark', 'Dark'], ['light', 'Light'], ['green', 'Green screen']].forEach(([v, t]) => bs.append(el('option', { value: v }, t))); bs.value = bg; bs.onchange = () => { bg = bs.value; stage.dataset.bg = bg; }; const bl = el('label', {}, 'Background on screen '); bl.append(bs); body.append(bl);
  const r = el('div', { className: 'av-row' }), z = el('button', { type: 'button' }, 'Reset camera'); z.onclick = () => { Object.assign(view, { yaw: 0, pitch: 0, zoom: 1, fov: 22, ox: 0, oy: 0 }); touch(); build(); redraw(); }; r.append(z); body.append(r);
}
// ----- saved poses -----
function poseThumb() { try { const c = S3.render(model, { pose, yaw: 0, pitch: 0, zoom: 1.05, fov: 22, style: 'color', outline: 1, expr: {}, hide }, 60, 96), o = el('canvas', { width: 60, height: 96 }), x = o.getContext('2d'); x.fillStyle = '#e8e8ee'; x.fillRect(0, 0, 60, 96); x.drawImage(c, 0, 0); return o.toDataURL('image/jpeg', 0.7); } catch (e) { return null; } }
function download(fn, text) { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: fn }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
const poseFile = p => JSON.stringify({ app: 'sudo-make-pose', v: 1, name: p.name, pose: p.pose, expr: p.expr || {} });
function buildSaved() {
  const nm = el('input', { placeholder: 'Name this pose', maxLength: 60, value: '' }), save = el('button', { type: 'button', className: 'pri' }, 'Save this pose'); const r0 = el('div', { className: 'av-row' }); r0.append(nm, save); body.append(r0);
  save.onclick = () => { const a = lib(), n = (nm.value.trim() || 'Pose ' + (a.length + 1)).slice(0, 60); a.unshift({ id: newId(), name: n, pose: cleanPose(pose), expr: cleanExpr(expr), thumb: poseThumb(), created: Date.now() }); saveLib(a); say(`Saved "${n}". It is ready to use in Sudo Make Manga.`); build(); };
  body.append(el('div', { className: 'hint' }, 'Saved poses are kept in a shared list. In Sudo Make Manga, open a character\'s Pose tab and pick one under “My saved poses”.'));
  const a = lib(); body.append(el('h5', {}, a.length ? `Your poses (${a.length})` : 'No saved poses yet'));
  const g = el('div', { className: 'av-tiles' });
  for (const p of a) { const b = el('div', { className: 'av-tile sp' }); const use = el('button', { type: 'button', title: 'Use this pose' }); if (p.thumb) use.append(Object.assign(el('img'), { src: p.thumb, alt: '' })); use.append(el('small', {}, p.name)); use.onclick = () => { applyPose(cleanPose(p.pose)); expr = cleanExpr(p.expr); redraw(); say(`Using "${p.name}".`); };
    const x = el('button', { type: 'button', className: 'x', title: 'Delete', textContent: '×' }); x.onclick = () => { if (confirm(`Delete the pose "${p.name}"?`)) { saveLib(lib().filter(q => q.id !== p.id)); build(); } };
    const d = el('button', { type: 'button', className: 'x d', title: 'Save as a file to share', textContent: '⬇' }); d.onclick = () => download(p.name.replace(/[^\w -]+/g, '_') + '.smapose.json', poseFile(p)); b.append(use, d, x); g.append(b); }
  body.append(g); const r = el('div', { className: 'av-row' }), imp = el('button', { type: 'button' }, 'Import pose files…'), all = el('button', { type: 'button' }, 'Export all'); imp.onclick = () => $('#av-posefile').click(); all.onclick = () => { const L = lib(); if (L.length) download('sudo-make-poses.json', JSON.stringify({ app: 'sudo-make-pose', v: 1, poses: L.map(p => ({ name: p.name, pose: p.pose, expr: p.expr || {} })) })); }; r.append(imp, all); body.append(r);
}
$('#av-posefile').onchange = async e => { const files = [...e.target.files]; e.target.value = ''; let n = 0; const a = lib(); for (const f of files) { try { if (f.size > 5e6) continue; const o = JSON.parse(await f.text()); const list = o && o.app === 'sudo-make-pose' ? (Array.isArray(o.poses) ? o.poses : [o]) : []; for (const p of list) { const ps = cleanPose(p.pose); if (!Object.keys(ps).length) continue; a.unshift({ id: newId(), name: String(p.name || f.name.replace(/\.[^.]*$/, '')).slice(0, 60), pose: ps, expr: cleanExpr(p.expr), thumb: null, created: Date.now() }); n++; } } catch (err) {} } saveLib(a); say(n ? `Imported ${n} pose${n === 1 ? '' : 's'}.` : 'No poses found in those files.'); if (tab === 'saved') build(); };

// ---------- picture out ----------
function picture() { const [w, h] = size(); return S3.render(model, viewSt(), Math.max(512, w * 2), Math.max(512, h * 2)); }
$('#av-png').onclick = () => { if (!model) return; picture().toBlob(b => { const a = el('a', { href: URL.createObjectURL(b), download: (name || 'avatar').replace(/[^\w -]+/g, '_') + '.png' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); say('Saved the picture.'); }, 'image/png'); };
$('#av-copy').onclick = () => { if (!model) return; picture().toBlob(async b => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); say('Copied the picture.'); } catch (e) { say('Could not copy: ' + e.message); } }, 'image/png'); };

// ---------- saving the project ----------
function serialize() { return JSON.stringify({ app: 'sudo-make-avatar', kind: 'avatar', v: 1, name, model: modelB64 ? { name: modelName, b64: modelB64 } : null, builtin, pose, expr, hide, view, outfits }); }
async function load(json) {
  const o = JSON.parse(json); if (!o || o.app !== 'sudo-make-avatar') throw new Error('Not a Sudo Make Avatar Pose file');
  name = String(o.name || 'Untitled avatar').slice(0, 60); nameBox.value = name; freeModel(); modelB64 = null; builtin = false; outfits = [];
  try {
    if (o.model && o.model.b64) { const buf = b64u8(o.model.b64); await setModel(buf.buffer, String(o.model.name || 'model').slice(0, 80), true); for (const of of Array.isArray(o.outfits) ? o.outfits : []) { try { const d = await S3.loadVRM(b64u8(of.b64).buffer); S3.addOutfit(model, d, of.keys.map(String), String(d.name || of.name).slice(0, 30)); S3.disposeModel(d); outfits.push({ name: String(of.name), b64: of.b64, keys: of.keys.map(String) }); } catch (e) {} } }
    else if (o.builtin) useBuiltin();
  } catch (e) { say(String(e.message || e)); }
  pose = model ? cleanPose(o.pose) : {}; expr = cleanExpr(o.expr); hide = Array.isArray(o.hide) ? o.hide.map(String).slice(0, 200) : []; const v = o.view || {};
  view = { yaw: clamp(+v.yaw || 0, -360, 360), pitch: clamp(+v.pitch || 0, -85, 85), zoom: clamp(+v.zoom || 1, 0.3, 8), fov: clamp(+v.fov || 22, 8, 60), ox: clamp(+v.ox || 0, -2, 2), oy: clamp(+v.oy || 0, -2, 2), style: ['color', 'gray', 'ink'].includes(v.style) ? v.style : 'color', outline: clamp(v.outline === undefined ? 1 : +v.outline, 0, 3) };
  build(); redraw();
}
function thumb() { try { if (!model) return Promise.resolve(null); const c = S3.render(model, Object.assign(viewSt(), { zoom: 1, ox: 0, oy: 0, pitch: 0 }), 150, 140), o = el('canvas', { width: 200, height: 120 }), x = o.getContext('2d'); x.fillStyle = '#2b2d3a'; x.fillRect(0, 0, 200, 120); x.drawImage(c, 25, 0, 150, 120 * 150 / 140 > 120 ? 120 : 140 * 120 / 140); return Promise.resolve(o.toDataURL('image/jpeg', 0.7)); } catch (e) { return Promise.resolve(null); } }
function reset() { freeModel(); modelB64 = null; builtin = false; name = 'Untitled avatar'; nameBox.value = name; pose = {}; expr = {}; hide = []; outfits = []; pid = null; thumbCache.clear(); build(); redraw(); }
window.SMA_avatar = { serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => name, setName: n => { name = n; nameBox.value = n; }, load, reset, show() { build(); redraw(); }, hide() {}, loadBuffer: (buf, nm) => setModel(buf, nm), state: () => ({ pose, expr, hide, view, hasModel: !!model, parts: model ? S3.parts(model).map(p => p.label) : [], exprs: model && model.exprs ? Object.keys(model.exprs) : [] }), setState: s => { if (s.pose) pose = s.pose; if (s.expr) expr = s.expr; if (s.hide) hide = s.hide; if (s.view) Object.assign(view, s.view); build(); redraw(); } };
build();
})();
