// Sudo Make VTuber, the core: a model library, the settings, the rig that turns tracking / microphone / mouse / idle motion into
// a pose and a face, and the two trackers (webcam face tracking and microphone lip sync). It has no screen of its own, so both
// the VTuber studio and Sudo Make Live use it. Original code for this project; face tracking runs MediaPipe's Face Landmarker
// (Apache-2.0) fully on this computer, and its model file is only downloaded when the user presses the button for it.
(() => {
'use strict';
const S3 = window.SMA3D, CH = window.SMA_char;
if (!S3) return;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), c01 = v => clamp(v, 0, 1), lerp = (a, b, t) => a + (b - a) * t;
const RAD = 180 / Math.PI;

// ---------- settings (the same groups as a VTuber studio's settings pages) ----------
const DEFAULT_CFG = () => ({
  model: null,
  tracking: { on: false, device: '', fps: 30, quality: 'good', lost: 'default', calc: 'auto', link: 'rotated', mirror: true, head: 1, sens: { blink: 1, eyeOpen: 1, mouthOpen: 1, mouthSmile: 1, brow: 1 }, neutral: [0, 0, 0] },
  mic: { on: false, device: '', gain: 1, cutoff: 0.08, freq: 1, lipsync: 'volume', calib: {} },
  mouse: { on: false, strength: 0.6 },
  idle: { blink: true, breathe: true, sway: true },
  display: { fps: 30, width: 1280, height: 720, bg: 'transparent', color: '#00b140', zoom: 1.6, ox: 0, oy: 0.2, rot: 0, outline: 1, style: 'color' },
  lock: false,
});
function mergeCfg(src) { // fill in anything missing and keep values in range, so old or hand-edited files never break the rig
  const d = DEFAULT_CFG(), s = src && typeof src === 'object' ? src : {}, num = (v, lo, hi, def) => (Number.isFinite(+v) ? clamp(+v, lo, hi) : def), pick = (v, list, def) => (list.includes(v) ? v : def);
  const t = s.tracking || {}, m = s.mic || {}, ms = s.mouse || {}, i = s.idle || {}, dp = s.display || {}, se = t.sens || {};
  return {
    model: typeof s.model === 'string' ? s.model.slice(0, 60) : null,
    tracking: { on: !!t.on, device: String(t.device || '').slice(0, 200), fps: pick(+t.fps, [10, 15, 24, 30, 45, 60], 30), quality: pick(t.quality, ['fast', 'good', 'best'], 'good'), lost: pick(t.lost, ['stay', 'default'], 'default'), calc: pick(t.calc, ['auto', 'manual'], 'auto'), link: pick(t.link, ['never', 'always', 'rotated'], 'rotated'), mirror: t.mirror !== false, head: num(t.head, 0, 2, 1),
      sens: { blink: num(se.blink, 0.2, 3, 1), eyeOpen: num(se.eyeOpen, 0.2, 3, 1), mouthOpen: num(se.mouthOpen, 0.2, 3, 1), mouthSmile: num(se.mouthSmile, 0.2, 3, 1), brow: num(se.brow, 0.2, 3, 1) }, neutral: Array.isArray(t.neutral) && t.neutral.length === 3 ? t.neutral.map(v => num(v, -90, 90, 0)) : d.tracking.neutral },
    mic: { on: !!m.on, device: String(m.device || '').slice(0, 200), gain: num(m.gain, 0.1, 6, 1), cutoff: num(m.cutoff, 0, 0.9, 0.08), freq: num(m.freq, 0.3, 3, 1), lipsync: pick(m.lipsync, ['volume', 'vowels'], 'volume'), calib: m.calib && typeof m.calib === 'object' ? Object.fromEntries(['a', 'i', 'u', 'e', 'o'].filter(k => Array.isArray(m.calib[k]) && m.calib[k].length === 8).map(k => [k, m.calib[k].map(Number)])) : {} },
    mouse: { on: !!ms.on, strength: num(ms.strength, 0, 1, 0.6) },
    idle: { blink: i.blink !== false, breathe: i.breathe !== false, sway: i.sway !== false },
    display: { fps: pick(+dp.fps, [15, 24, 30, 60], 30), width: clamp(Math.round(+dp.width) || 1280, 160, 3840), height: clamp(Math.round(+dp.height) || 720, 160, 2160), bg: pick(dp.bg, ['transparent', 'color'], 'transparent'), color: /^#[0-9a-f]{6}$/i.test(dp.color) ? dp.color : '#00b140', zoom: num(dp.zoom, 0.3, 6, 1.6), ox: num(dp.ox, -2, 2, 0), oy: num(dp.oy, -2, 2, 0.2), rot: num(dp.rot, -180, 180, 0), outline: num(dp.outline, 0, 3, 1), style: pick(dp.style, ['color', 'gray', 'ink'], 'color') },
    lock: !!s.lock,
  };
}

// ---------- the model library (kept in this browser profile, not uploaded anywhere) ----------
const DB = 'sma-vtuber';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('models', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const q = fn(db.transaction('models', mode).objectStore('models')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
const models = { list: () => tx('readonly', s => s.getAll()).then(a => a.sort((x, y) => y.added - x.added)), get: id => tx('readonly', s => s.get(id)), put: r => tx('readwrite', s => s.put(r)), del: id => tx('readwrite', s => s.delete(id)) };
const newId = () => 'vm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function importVRM(file) { // checks the file really is a VRM, makes a small picture for the grid, keeps the bytes
  if (file.size > 150e6) throw new Error('That model file is too big (over 150 MB).');
  const buf = await file.arrayBuffer(), m = await S3.loadVRM(buf), mt = m.meta || {};
  let thumb = null; try { const c = S3.render(m, { pose: CH ? CH.PRESETS['Stand (relaxed)']() : {}, yaw: 0, pitch: 0, zoom: 2.2, oy: 0.3, fov: 20, style: 'color', outline: 1 }, 160, 160), o = document.createElement('canvas'); o.width = 160; o.height = 160; const x = o.getContext('2d'); x.fillStyle = '#2b2d3a'; x.fillRect(0, 0, 160, 160); x.drawImage(c, 0, 0); thumb = o.toDataURL('image/jpeg', 0.75); } catch (e) {}
  const str = (v, n) => String(v || '').slice(0, n);
  const rec = { id: newId(), name: str(mt.title || mt.name || file.name.replace(/\.(vrm|glb)$/i, ''), 80), blob: new Blob([buf], { type: 'application/octet-stream' }), added: Date.now(), thumb, author: str(mt.author || mt.authors, 80), licenseName: str(mt.licenseName || mt.license, 80), exprs: Object.keys(m.exprs || {}).length };
  S3.disposeModel(m); await models.put(rec); return rec;
}

async function importLive2D(file) { // a .zip holding a Live2D model (.model3.json, .moc3, textures)
  if (file.size > 150e6) throw new Error('That file is too big (over 150 MB).');
  const L = window.SMA_l2d; if (!L) throw new Error('Live2D support is not available.'); const m = await L.load(file); let thumb = null, name = m.name || file.name.replace(/\.zip$/i, '');
  try { const c = m.render(256, 256, { zoom: 1.5, ox: 0, oy: -0.15 }), o = document.createElement('canvas'); o.width = 160; o.height = 160; const x = o.getContext('2d'); x.fillStyle = '#2b2d3a'; x.fillRect(0, 0, 160, 160); x.drawImage(c, 0, 0, 160, 160); thumb = o.toDataURL('image/jpeg', 0.75); } catch (e) {}
  m.dispose(); const rec = { id: newId(), kind: 'live2d', name: String(name).slice(0, 80), blob: new Blob([await file.arrayBuffer()], { type: 'application/zip' }), added: Date.now(), thumb, author: '', licenseName: '', exprs: 0 }; await models.put(rec); return rec;
}
const importModel = file => (/\.zip$/i.test(file.name) ? importLive2D(file) : importVRM(file));
// ---------- the rig ----------
const ALL_EXPR = ['happy', 'sad', 'angry', 'relaxed', 'surprised', 'blink', 'blinkL', 'blinkR', 'a', 'i', 'u', 'e', 'o'];
class Rig {
  constructor(cfg) { this.cfg = mergeCfg(cfg); this.model = null; this.t = 0; this.p = this.zero(); this.raw = { track: null, mic: null, mouse: [0, 0] }; this.lastTrack = 0; this.nextBlink = 2; this.blinkT = -1; this.base = CH ? CH.PRESETS['Stand (relaxed)']() : {}; this.l2d = null; this.hasFace = false; this.fps = 0; }
  zero() { return { pitch: 0, yaw: 0, roll: 0, bl: 0, br: 0, mouth: 0, smile: 0, browUp: 0, browDown: 0, sad: 0, funnel: 0, pucker: 0, wide: 0, vow: { a: 0, i: 0, u: 0, e: 0, o: 0 } }; }
  _free() { if (this.l2d) { this.l2d.dispose(); this.l2d = null; } else if (this.model && this.model.kind !== 'live2d') S3.disposeModel(this.model); this.model = null; }
  async setModel(buf) { const m = await S3.loadVRM(buf); this._free(); this.model = m; return m; }
  async setLive2D(blob) { const L = window.SMA_l2d; if (!L) throw new Error('Live2D support is not available.'); const m = await L.load(blob); this._free(); this.l2d = m; this.model = { kind: 'live2d', human: {}, exprs: {}, prims: [], name: m.name }; return this.model; }
  dispose() { this._free(); }
  setTracking(tr) { this.raw.track = tr; if (tr) this.lastTrack = this.t; }
  setMic(m) { this.raw.mic = m; }
  setMouse(x, y) { this.raw.mouse = [x, y]; }
  // dt in seconds. Works out the target for every control, then eases towards it so motion looks smooth and not jittery.
  update(dt) {
    dt = clamp(dt, 0.001, 0.25); this.t += dt; const c = this.cfg, tgt = this.zero(), tk = this.raw.track, tc = c.tracking, fresh = tc.on && tk && (this.t - this.lastTrack) < 0.5;
    this.hasFace = !!fresh; let held = false;
    if (fresh) { Object.assign(tgt, tk); }
    else if (tc.on && tc.lost === 'stay' && this.lastTrack > 0) { held = true; }
    if (held) { for (const k of ['pitch', 'yaw', 'roll', 'bl', 'br', 'mouth', 'smile', 'browUp', 'browDown', 'sad', 'funnel', 'pucker', 'wide']) tgt[k] = this.p[k]; }
    // mouse: the head follows the pointer
    if (c.mouse.on && !fresh) { const [mx, my] = this.raw.mouse, k = c.mouse.strength; tgt.yaw = mx * 28 * k; tgt.pitch = my * 18 * k; }
    // idle life: blinking, breathing and a little sway when nothing else is moving the face
    if (c.idle.blink && !fresh) { if (this.blinkT < 0 && this.t > this.nextBlink) this.blinkT = 0; if (this.blinkT >= 0) { this.blinkT += dt; const ph = this.blinkT / 0.18; tgt.bl = tgt.br = ph < 1 ? Math.sin(ph * Math.PI) : 0; if (ph >= 1) { this.blinkT = -1; this.nextBlink = this.t + 2 + Math.random() * 4; } } }
    // microphone: the mouth follows what you say (it wins over the camera for the mouth when it is on)
    const mic = this.raw.mic; if (c.mic.on && mic) { tgt.mouth = mic.open; for (const k of ['a', 'i', 'u', 'e', 'o']) tgt.vow[k] = mic.vow ? mic.vow[k] || 0 : 0; if (!mic.vow) tgt.vow.a = mic.open; }
    else if (fresh && tk.vow) { for (const k of ['a', 'i', 'u', 'e', 'o']) tgt.vow[k] = tk.vow[k] || 0; }
    // ease (faster for blinks and the mouth, slower for the head)
    const ease = (cur, to, speed) => lerp(cur, to, 1 - Math.exp(-speed * dt)), p = this.p;
    for (const k of ['pitch', 'yaw', 'roll']) p[k] = ease(p[k], tgt[k], 14);
    for (const k of ['bl', 'br']) p[k] = ease(p[k], tgt[k], 40);
    for (const k of ['mouth', 'funnel', 'pucker']) p[k] = ease(p[k], tgt[k], 32);
    for (const k of ['smile', 'browUp', 'browDown', 'sad', 'wide']) p[k] = ease(p[k], tgt[k], 12);
    for (const k of ['a', 'i', 'u', 'e', 'o']) p.vow[k] = ease(p.vow[k], tgt.vow[k], 34);
    this._dt = dt; this._pose(); this._expr();
  }
  _pose() {
    const p = this.p, c = this.cfg, pose = {}, hm = this.model ? this.model.human : {}, t = this.t, set = (b, v) => { if (hm[b] !== undefined) pose[b] = v; };
    for (const [k, v] of Object.entries(this.base)) if (hm[k] !== undefined) pose[k] = v.slice();
    const sway = c.idle.sway ? [Math.sin(t * 0.7) * 1.2, Math.sin(t * 0.43) * 1.6, Math.sin(t * 0.55) * 0.8] : [0, 0, 0], br = c.idle.breathe ? Math.sin(t * 1.6) * 1.1 : 0;
    const hy = p.yaw * c.tracking.head, hp = p.pitch * c.tracking.head, hr = p.roll * c.tracking.head;
    set('head', [hp * 0.6 + sway[0], hy * 0.6 + sway[1], hr * 0.6 + sway[2]]); set('neck', [hp * 0.3, hy * 0.3, hr * 0.3]);
    set('chest', [br + hp * 0.06, hy * 0.08, hr * 0.1]); set('spine', [br * 0.5, hy * 0.05, hr * 0.06]);
    this.pose = pose;
  }
  _expr() {
    const p = this.p, ex = {}, m = this.model && this.model.exprs ? this.model.exprs : {}, put = (k, v) => { v = c01(v); if (v > 0.01 && m[k]) ex[k] = v; };
    const c = this.cfg.tracking; let bl = p.bl, br = p.br;
    if (c.link === 'always' || (c.link === 'rotated' && Math.abs(p.yaw) > 22)) bl = br = Math.max(bl, br);
    if (m.blinkL && m.blinkR) { put('blinkL', bl); put('blinkR', br); } else put('blink', (bl + br) / 2);
    put('happy', p.smile); put('sad', p.sad); put('surprised', p.wide * 0.8 + p.browUp * 0.4); put('angry', p.browDown);
    const v = p.vow, vs = v.a + v.i + v.u + v.e + v.o, open = p.mouth;
    if (vs > 0.05) { for (const k of ['a', 'i', 'u', 'e', 'o']) put(k, v[k]); } else { put('a', open); put('o', p.funnel * 0.9); put('u', p.pucker * 0.9); }
    this.expr = ex;
  }
  stateForRender() { const d = this.cfg.display; return { pose: this.pose || {}, expr: this.expr || {}, yaw: 0, pitch: 0, zoom: d.zoom, fov: 22, ox: d.ox, oy: d.oy, style: d.style, outline: d.outline, hide: [], ss: 1 }; }
  // draws the avatar (transparent background) into a fresh canvas of the given size
  render(w, h) { if (!this.model) return null; if (!this.pose) this.update(0.016); if (this.l2d) { this.l2d.apply(this.p, this._dt || 0.016, this.cfg.tracking); return this.l2d.render(w, h, this.cfg.display); } return S3.render(this.model, this.stateForRender(), w, h); }
}

// ---------- webcam face tracking (MediaPipe Face Landmarker) ----------
const MP_BASE = 'node_modules/@mediapipe/tasks-vision';
let mpLib = null;
const QUAL = { fast: [320, 240], good: [640, 480], best: [1280, 720] };
class FaceTracker {
  constructor() { this.lm = null; this.video = null; this.stream = null; this.timer = 0; this.onResult = null; this.running = false; this.last = null; this.fpsSeen = 0; }
  static async loadModelBuffer() { const api = window.sma && window.sma.vtuber; if (!api) throw new Error('Face tracking needs the desktop app.'); const st = await api.status(); if (!st.present) { const e = new Error('The face tracking model is not downloaded yet.'); e.code = 'NOMODEL'; throw e; } return new Uint8Array(await api.read()); }
  async init() {
    if (this.lm) return; const buf = await FaceTracker.loadModelBuffer();
    if (!mpLib) mpLib = await import('../' + MP_BASE + '/vision_bundle.mjs');
    const fs = await mpLib.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
    this.lm = await mpLib.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false });
  }
  async start(cfg, onResult, videoEl) {
    await this.init(); this.stop(true); const q = QUAL[cfg.quality] || QUAL.good;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: cfg.device ? { exact: cfg.device } : undefined, width: { ideal: q[0] }, height: { ideal: q[1] }, frameRate: { ideal: Math.max(cfg.fps, 15) } } });
    this.video = videoEl || document.createElement('video'); this.video.muted = true; this.video.playsInline = true; this.video.srcObject = this.stream; await this.video.play();
    this.cfg = cfg; this.onResult = onResult; this.running = true; this.frames = 0; this.t0 = performance.now();
    const step = () => { if (!this.running) return; try { this.tick(); } catch (e) { /* keep going */ } this.timer = setTimeout(step, 1000 / Math.max(5, this.cfg.fps)); }; step();
  }
  tick() {
    const v = this.video; if (!v || v.readyState < 2 || !v.videoWidth || !this.lm) return; const ts = performance.now();
    const r = this.lm.detectForVideo(v, ts); this.frames++; this.fpsSeen = this.frames / ((ts - this.t0) / 1000 || 1);
    if (!r.faceLandmarks || !r.faceLandmarks.length) { this.last = null; this.onResult && this.onResult(null); return; }
    this.last = FaceTracker.params(r.faceLandmarks[0], r.faceBlendshapes && r.faceBlendshapes[0] ? r.faceBlendshapes[0].categories : [], this.cfg); this.onResult && this.onResult(this.last);
  }
  stop(keepModel) { this.running = false; clearTimeout(this.timer); if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; if (this.video) { this.video.srcObject = null; } if (!keepModel) { /* the model stays loaded so restarting is quick */ } }
  // landmarks + blendshape scores -> the controls the rig understands (all 0..1 except the head angles, in degrees)
  static params(lm, cats, cfg) {
    const B = {}; for (const c of cats) B[c.categoryName] = c.score; const g = k => B[k] || 0, s = cfg.sens, mir = cfg.mirror;
    // head angles from landmarks: cheeks (234, 454), nose tip (1), forehead (10), chin (152), eye corners (33, 263)
    const L = lm[234], R = lm[454], N = lm[1], F = lm[10], Ch = lm[152], E1 = lm[33], E2 = lm[263];
    const half = Math.hypot(R.x - L.x, R.y - L.y) / 2 || 1e-3, mid = [(L.x + R.x) / 2, (L.y + R.y) / 2];
    let yaw = Math.asin(clamp((N.x - mid[0]) / half * 1.15, -1, 1)) * RAD, roll = Math.atan2(E2.y - E1.y, E2.x - E1.x) * RAD, pitch = ((N.y - F.y) / ((Ch.y - F.y) || 1e-3) - 0.56) * 110;
    // (the picture is the camera's view: turning to your left shows as the nose moving right in the picture)
    yaw = -yaw; roll = -roll; pitch = pitch;
    if (mir) { yaw = -yaw; roll = -roll; }
    const n = cfg.neutral || [0, 0, 0]; pitch -= n[0]; yaw -= n[1]; roll -= n[2];
    const bl = c01((mir ? g('eyeBlinkRight') : g('eyeBlinkLeft')) * s.blink * 1.25 - 0.08), br = c01((mir ? g('eyeBlinkLeft') : g('eyeBlinkRight')) * s.blink * 1.25 - 0.08);
    const open = c01(g('jawOpen') * 1.7 * s.mouthOpen), smile = c01(((g('mouthSmileLeft') + g('mouthSmileRight')) / 2) * 1.6 * s.mouthSmile), frown = c01(((g('mouthFrownLeft') + g('mouthFrownRight')) / 2) * 2.2);
    const up = c01((g('browInnerUp') * 1.1 + (g('browOuterUpLeft') + g('browOuterUpRight')) / 2 * 0.6) * s.brow), down = c01((((g('browDownLeft') + g('browDownRight')) / 2) - 0.15) * 1.7 * s.brow), wide = c01(((g('eyeWideLeft') + g('eyeWideRight')) / 2) * 2 * s.eyeOpen);
    return { pitch: clamp(pitch, -45, 45), yaw: clamp(yaw, -60, 60), roll: clamp(roll, -45, 45), bl, br, mouth: open, smile, browUp: up, browDown: down, sad: c01(frown * 0.7 + up * 0.3 * (frown > 0.2 ? 1 : 0)), funnel: c01(g('mouthFunnel') * 1.5), pucker: c01(g('mouthPucker') * 1.5), wide };
  }
}

// ---------- microphone lip sync ----------
class MicLip {
  constructor() { this.ctx = null; this.stream = null; this.an = null; this.timer = 0; this.last = { open: 0, vow: null }; this.spec = null; }
  async start(cfg, onResult) {
    this.stop(); this.cfg = cfg; this.onResult = onResult; this.stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: cfg.device ? { exact: cfg.device } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)(); const src = this.ctx.createMediaStreamSource(this.stream); this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.4; src.connect(this.an);
    this.td = new Float32Array(this.an.fftSize); this.fd = new Float32Array(this.an.frequencyBinCount); this.running = true;
    const step = () => { if (!this.running) return; this.tick(); this.timer = setTimeout(step, 1000 / 40); }; step();
  }
  // eight bands from about 200 Hz to 4 kHz, in dB-ish units, scaled to unit length so loudness does not matter
  features() { this.an.getFloatFrequencyData(this.fd); const sr = this.ctx.sampleRate, bin = sr / this.an.fftSize, edges = [200, 330, 500, 750, 1100, 1600, 2400, 3400, 4600], f = []; for (let b = 0; b < 8; b++) { let s = 0, n = 0; for (let k = Math.floor(edges[b] / bin); k < Math.min(this.fd.length, Math.ceil(edges[b + 1] / bin)); k++) { s += Math.pow(10, this.fd[k] / 20); n++; } f.push(Math.log10(s / Math.max(1, n) + 1e-7) * (b >= 4 ? this.cfg.freq || 1 : 1)); } const mean = f.reduce((a, v) => a + v, 0) / 8, d = f.map(v => v - mean), len = Math.hypot(...d) || 1; return d.map(v => v / len); }
  tick() {
    this.an.getFloatTimeDomainData(this.td); let e = 0; for (let i = 0; i < this.td.length; i++) e += this.td[i] * this.td[i]; const rms = Math.sqrt(e / this.td.length), c = this.cfg;
    this.level = rms; const v = c01((rms * 22 * c.gain - c.cutoff) / (1 - c.cutoff)), out = { open: v, vow: null };
    if (c.lipsync === 'vowels' && v > 0.05) { const f = this.features(), cal = c.calib || {}, keys = Object.keys(cal); this.spec = f; if (keys.length >= 3) { let best = null, bd = 9; const w = {}; for (const k of keys) { const d = Math.hypot(...f.map((x, i) => x - cal[k][i])); w[k] = 1 / (d + 0.05); if (d < bd) { bd = d; best = k; } } const tot = Object.values(w).reduce((a, x) => a + x, 0) || 1; out.vow = { a: 0, i: 0, u: 0, e: 0, o: 0 }; for (const k of keys) out.vow[k] = (w[k] / tot) * (k === best ? 1 : 0.5) * v * 1.3; } }
    this.last = out; this.onResult && this.onResult(out);
  }
  async sample(ms = 1200) { const acc = []; const t0 = performance.now(); return new Promise(res => { const h = setInterval(() => { if (this.level > 0.006) acc.push(this.features()); if (performance.now() - t0 > ms) { clearInterval(h); if (acc.length < 5) return res(null); const m = acc[0].map((_, i) => acc.reduce((a, f) => a + f[i], 0) / acc.length); const len = Math.hypot(...m) || 1; res(m.map(x => x / len)); } }, 40); }); }
  stop() { this.running = false; clearTimeout(this.timer); if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; } }
}

// ---------- one running studio: a rig plus whichever trackers its settings turn on ----------
// Used by the VTuber studio window and by Sudo Make Live sources, so both behave the same.
class Session {
  constructor(cfg) { this.rig = new Rig(cfg); this.cam = null; this.mic = null; this.lastT = 0; this.status = { model: '', camera: '', mic: '' }; this.mouseH = null; }
  get cfg() { return this.rig.cfg; }
  async load(id) { const rec = await models.get(id); if (!rec) throw new Error('This model is no longer in the VTuber library.'); if (rec.kind === 'live2d') await this.rig.setLive2D(rec.blob); else await this.rig.setModel(await rec.blob.arrayBuffer()); this.rig.cfg.model = id; this.status.model = rec.name; return rec; }
  async applyTrackers() {
    const c = this.rig.cfg;
    if (c.tracking.on) { if (!this.cam) this.cam = new FaceTracker(); try { await this.cam.start(c.tracking, tr => this.rig.setTracking(tr)); this.status.camera = 'on'; } catch (e) { this.status.camera = e.code === 'NOMODEL' ? 'nomodel' : String(e.message || e); this.cam.stop(); } } else if (this.cam) { this.cam.stop(); this.status.camera = ''; }
    if (c.mic.on) { if (!this.mic) this.mic = new MicLip(); try { await this.mic.start(c.mic, m => this.rig.setMic(m)); this.status.mic = 'on'; } catch (e) { this.status.mic = String(e.message || e); } } else if (this.mic) { this.mic.stop(); this.rig.setMic(null); this.status.mic = ''; }
    if (c.mouse.on && !this.mouseH) { this.mouseH = ev => this.rig.setMouse(clamp(ev.clientX / innerWidth * 2 - 1, -1, 1), clamp(ev.clientY / innerHeight * 2 - 1, -1, 1)); addEventListener('pointermove', this.mouseH); } else if (!c.mouse.on && this.mouseH) { removeEventListener('pointermove', this.mouseH); this.mouseH = null; }
  }
  frame(now) { const dt = this.lastT ? (now - this.lastT) / 1000 : 0.016; this.lastT = now; this.rig.update(dt); }
  stop() { if (this.cam) this.cam.stop(); if (this.mic) this.mic.stop(); if (this.mouseH) removeEventListener('pointermove', this.mouseH); this.mouseH = null; this.rig.dispose(); }
}

const CFG_KEY = 'sma-vtuber-cfg';
const loadCfg = () => { try { return mergeCfg(JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { return mergeCfg({}); } };
const saveCfg = c => { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} };
window.SMA_vt = { DEFAULT_CFG, mergeCfg, models, importVRM, importLive2D, importModel, Rig, FaceTracker, MicLip, Session, loadCfg, saveCfg, ALL_EXPR };
})();
