// Sudo Make VTuber, the studio: pick a model, set up face tracking, microphone lip sync, mouse and idle motion, the picture size
// and background, and watch the result live. The same settings can then be used as a source in Sudo Make Live.
// Original code for this project; the engine is in src/vtcore.js.
(() => {
'use strict';
const VT = window.SMA_vt, SMA = window.SMA, $ = s => document.querySelector(s);
if (!VT || !SMA || !$('#mangaview')) return;
const el = (tag, attrs = {}, text) => { const e = Object.assign(document.createElement(tag), attrs); if (text !== undefined) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const api = window.sma && window.sma.vtuber;

let cfg = VT.loadCfg(), sess = null, panel = 'models', msg = '', filter = '', libCache = [], loadingId = null, fpsShown = 0;
const save = () => VT.saveCfg(cfg);
const say = t => { msg = t; const m = $('#vt-msg'); if (m) m.textContent = t; };

// ---------- the page ----------
const root = el('section', { id: 'vtview' });
root.innerHTML = '<div id="vt-rail" role="tablist"></div><div id="vt-panel"></div><div id="vt-stage"><canvas id="vt-cv" aria-label="Live preview of your avatar"></canvas><div id="vt-empty"><h2>Sudo Make VTuber</h2><p>Pick or import a <b>.vrm</b> model (or a Live2D <b>.zip</b>) on the left. Turn on camera tracking and the microphone and your avatar follows you.</p></div><div id="vt-stat"></div></div><input id="vt-file" type="file" accept=".vrm,.glb,.zip" multiple hidden>';
$('#mangaview').after(root);
const cv = $('#vt-cv'), stage = $('#vt-stage'), side = $('#vt-panel');
$('#vt-stage').after(el('div', { id: 'vt-foot' }, ''));
root.append(el('div', { id: 'vt-msg' }));
const RAIL = [['models', 'Model', '🧍'], ['camera', 'Camera', '📷'], ['mic', 'Microphone', '🎤'], ['motion', 'Mouse & idle', '🖱'], ['display', 'Display', '🖥'], ['output', 'Output', '📡']];
const rail = $('#vt-rail'); RAIL.forEach(([k, t, ic]) => { const b = el('button', { type: 'button', role: 'tab', id: 'vt-r-' + k, title: t }); b.append(el('span', { className: 'ic' }, ic), el('small', {}, t)); b.onclick = () => { panel = k; build(); }; rail.append(b); });

// ---------- helpers for the settings pages ----------
function row(label, ctl, hint) { const r = el('label', { className: 'vt-row' }); r.append(el('span', {}, label), ctl); if (hint) r.title = hint; return r; }
function select(opts, get, set) { const s = el('select'); for (const [v, t] of opts) s.append(el('option', { value: String(v) }, t)); s.value = String(get()); s.onchange = () => { set(isNaN(+s.value) || s.value === '' ? s.value : (typeof opts[0][0] === 'number' ? +s.value : s.value)); save(); sync(); }; return s; }
function slider(label, get, set, lo, hi, step, fmt, reset) {
  const r = el('label', { className: 'vt-sl' }), v = el('span', { className: 'v' }), i = el('input', { type: 'range', min: lo, max: hi, step: step || 0.01, value: get() }), upd = () => { v.textContent = fmt ? fmt(+i.value) : (Math.round(+i.value * 100) / 100); }; upd();
  i.oninput = () => { set(+i.value); upd(); }; i.onchange = () => { save(); sync(); }; r.append(el('span', {}, label), i, v);
  if (reset !== undefined) { const b = el('button', { type: 'button', className: 'rs', title: 'Reset' }, '↺'); b.onclick = e => { e.preventDefault(); i.value = reset; set(reset); upd(); save(); sync(); }; r.append(b); }
  return r;
}
function check(label, get, set) { const l = el('label', { className: 'cv-chk' }), c = el('input', { type: 'checkbox', checked: !!get() }); c.onchange = () => { set(c.checked); save(); sync(); }; l.append(c, ' ' + label); return l; }
const h = t => el('h5', {}, t), hint = t => el('div', { className: 'hint' }, t);
async function devices(kind) { try { const s = await navigator.mediaDevices.getUserMedia(kind === 'videoinput' ? { video: true } : { audio: true }); s.getTracks().forEach(t => t.stop()); } catch (e) {} try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === kind); } catch (e) { return []; } }

// ---------- running the session ----------
let applying = Promise.resolve();
function sync() { // push the current settings into the running session
  if (!sess) return; sess.rig.cfg = VT.mergeCfg(Object.assign({}, cfg, { model: sess.rig.cfg.model })); cfg = Object.assign(cfg, { model: sess.rig.cfg.model || cfg.model });
  applying = applying.then(() => sess.applyTrackers()).then(() => { if (panel === 'camera' || panel === 'mic') statusLine(); });
}
async function ensureSession() { if (!sess) { sess = new VT.Session(cfg); } return sess; }
async function selectModel(id) {
  if (loadingId) return; loadingId = id; say('Loading the model…'); build();
  try { await ensureSession(); const rec = await sess.load(id); cfg.model = id; save(); say(`"${rec.name}" is ready.${rec.author ? ' By ' + rec.author + '.' : ''} Models carry their own licence${rec.licenseName ? ' (' + rec.licenseName + ')' : ''}: check it before you stream or publish with it.`); sync(); }
  catch (e) { say(String(e.message || e)); } finally { loadingId = null; build(); }
}
function unload() { if (cfg.lock) return; if (sess) { sess.stop(); sess = null; } cfg.model = null; save(); say('Model unloaded.'); build(); }

// ---------- the settings pages ----------
async function refreshLib() { try { libCache = await VT.models.list(); } catch (e) { libCache = []; } }
async function pageModels(b) {
  await refreshLib(); b.textContent = '';
  const top = el('div', { className: 'vt-bar' }), imp = el('button', { type: 'button', className: 'pri' }, 'Import model…'), un = el('button', { type: 'button', disabled: !cfg.model || cfg.lock }, 'Unload model'); imp.onclick = () => $('#vt-file').click(); un.onclick = unload; top.append(imp, un); b.append(top);
  b.append(check('Model lock (stops the model changing by accident)', () => cfg.lock, v => { cfg.lock = v; build(); }));
  const f = el('input', { type: 'search', placeholder: 'Filter models', value: filter }); f.oninput = () => { filter = f.value; grid(); }; b.append(f);
  const g = el('div', { className: 'vt-grid' }); b.append(g);
  function grid() { g.textContent = ''; const list = libCache.filter(m => !filter || m.name.toLowerCase().includes(filter.toLowerCase()));
    if (!libCache.length) g.append(hint('No models yet. Import a .vrm file (VRoid Studio makes them) or a Live2D model .zip. They are kept on this computer.')); else if (!list.length) g.append(hint('No models match.'));
    for (const m of list) { const t = el('div', { className: 'vt-tile' + (m.id === cfg.model ? ' on' : '') + (m.id === loadingId ? ' busy' : ''), title: m.name }); const pick = el('button', { type: 'button', disabled: cfg.lock && m.id !== cfg.model }); if (m.thumb) pick.append(Object.assign(el('img'), { src: m.thumb, alt: '' })); pick.append(el('small', {}, (m.kind === 'live2d' ? '◆ ' : '') + m.name)); pick.onclick = () => { if (m.id !== cfg.model) selectModel(m.id); };
      const x = el('button', { type: 'button', className: 'x', title: 'Remove from the library' }, '×'); x.onclick = async e => { e.stopPropagation(); if (cfg.lock) return; if (confirm(`Remove "${m.name}" from the library?`)) { if (cfg.model === m.id) unload(); await VT.models.del(m.id); build(); } }; t.append(pick, x); g.append(t); } }
  grid(); b.append(h('Live2D models')); const l2 = el('div', { id: 'vt-l2d' }); b.append(l2); l2dBox(l2);
}
async function pageCamera(b) {
  const T = cfg.tracking; b.append(check('Use camera tracking', () => T.on, v => { T.on = v; if (v) statusLine(); }));
  const st = el('div', { id: 'vt-cam-status', className: 'vt-status' }); b.append(st); b.append(el('div', { id: 'vt-model-box' }));
  const cams = await devices('videoinput'), cs = el('select'); cs.append(el('option', { value: '' }, 'Default camera')); cams.forEach((d, i) => cs.append(el('option', { value: d.deviceId }, d.label || 'Camera ' + (i + 1)))); cs.value = T.device; cs.onchange = () => { T.device = cs.value; save(); sync(); }; b.append(row('Camera', cs));
  b.append(row('Tracking quality', select([['fast', 'Fast (small picture)'], ['good', 'Good'], ['best', 'Best (HD)']], () => T.quality, v => { T.quality = v; })));
  b.append(row('Tracking FPS limit', select([[10, '10'], [15, '15'], [24, '24'], [30, '30'], [45, '45'], [60, '60']], () => T.fps, v => { T.fps = +v; })));
  b.append(row('When tracking is lost', select([['default', 'Go back to default pose'], ['stay', 'Stay where it was']], () => T.lost, v => { T.lost = v; })));
  b.append(row('Parameter calculation', select([['auto', 'Automatic'], ['manual', 'Manual']], () => T.calc, v => { T.calc = v; build(); })));
  if (T.calc === 'manual') { b.append(slider('Head movement', () => T.head, v => { T.head = v; }, 0, 2, 0.05, v => Math.round(v * 100) + '%', 1)); const c = el('button', { type: 'button' }, 'Calibrate: look straight at the camera, then press'); c.onclick = () => { const tk = sess && sess.cam && sess.cam.last; if (!tk) { say('No face is being tracked yet.'); return; } T.neutral = [T.neutral[0] + tk.pitch, T.neutral[1] + tk.yaw, T.neutral[2] + tk.roll]; save(); sync(); say('Calibrated.'); }; b.append(c); }
  b.append(row('Link eye blinking', select([['never', 'Never'], ['always', 'Always'], ['rotated', 'When the head is rotated']], () => T.link, v => { T.link = v; })));
  b.append(check('Mirror (move like a mirror, not like a camera)', () => T.mirror, v => { T.mirror = v; }));
  b.append(h('Sensitivity'));
  [['blink', 'Eye blink'], ['eyeOpen', 'Eye open (wide)'], ['mouthOpen', 'Mouth open'], ['mouthSmile', 'Mouth smile'], ['brow', 'Eyebrows']].forEach(([k, t]) => b.append(slider(t, () => T.sens[k], v => { T.sens[k] = v; }, 0.2, 3, 0.05, v => Math.round(v * 100) + '%', 1)));
  b.append(hint('Face tracking runs on this computer. The camera picture is never saved or sent anywhere.'));
  modelBox(); statusLine();
}
function modelBox() {
  const box = $('#vt-model-box'); if (!box || !api) return; api.status().then(s => { if (!$('#vt-model-box')) return; box.textContent = '';
    if (s.present) { const r = el('div', { className: 'vt-status ok' }, `Face tracking model installed (${(s.size / 1e6).toFixed(1)} MB). `), x = el('button', { type: 'button', className: 'link' }, 'Remove'); x.onclick = async () => { await api.remove(); modelBox(); }; r.append(x); box.append(r); return; }
    const w = el('div', { className: 'vt-warn' }); w.append(el('b', {}, 'One download is needed for camera tracking. '), 'It is MediaPipe’s Face Landmarker (Google, Apache-2.0 licence), about 3.8 MB, saved on this computer. Nothing else is downloaded, and your camera picture never leaves this computer. The app only fetches it if you press the button.', el('br'));
    const bar = el('progress', { max: 100, value: 0, hidden: true }), btn = el('button', { type: 'button', className: 'pri' }, 'Download face tracking model (3.8 MB)'), cancel = el('button', { type: 'button', hidden: true }, 'Cancel'); const off = api.onProgress(d => { bar.hidden = false; bar.value = d.total ? d.got / d.total * 100 : 0; });
    btn.onclick = async () => { btn.disabled = true; cancel.hidden = false; bar.hidden = false; try { await api.download(); off(); say('The face tracking model is installed.'); modelBox(); if (cfg.tracking.on) sync(); } catch (e) { off(); btn.disabled = false; cancel.hidden = true; bar.hidden = true; say(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } }; cancel.onclick = () => api.cancel();
    w.append(btn, ' ', cancel, bar); box.append(w); }); }
function statusLine() { const s = $('#vt-cam-status'); if (!s) return; const T = cfg.tracking, c = sess && sess.status.camera; const face = sess && sess.rig.hasFace;
  s.textContent = !T.on ? 'Camera tracking is off.' : !sess ? 'Pick a model first, then tracking starts.' : c === 'nomodel' ? 'Waiting for the face tracking model (see below).' : c === 'on' ? (face ? 'Tracking your face.' : 'Camera on, no face seen yet.') : (c || 'Starting…'); s.className = 'vt-status' + (c === 'on' && face ? ' ok' : c && c !== 'on' && c !== 'nomodel' ? ' bad' : ''); }
async function pageMic(b) {
  const M = cfg.mic; b.append(check('Use microphone', () => M.on, v => { M.on = v; }));
  const ds = await devices('audioinput'), s = el('select'); s.append(el('option', { value: '' }, 'Default microphone')); ds.forEach((d, i) => s.append(el('option', { value: d.deviceId }, d.label || 'Microphone ' + (i + 1)))); s.value = M.device; s.onchange = () => { M.device = s.value; save(); sync(); }; b.append(row('Device', s));
  const meter = el('div', { className: 'vt-meter' }, ''); meter.append(el('i')); b.append(el('div', { className: 'vt-row' }, '')); b.lastChild.append(el('span', {}, 'Level'), meter);
  b.append(slider('Volume gain', () => M.gain, v => { M.gain = v; }, 0.1, 6, 0.05, v => Math.round(v * 100) + '%', 1), slider('Volume cutoff', () => M.cutoff, v => { M.cutoff = v; }, 0, 0.9, 0.01, v => Math.round(v * 100) + '%', 0.08), slider('Frequency gain', () => M.freq, v => { M.freq = v; }, 0.3, 3, 0.05, v => Math.round(v * 100) + '%', 1));
  b.append(row('Lip sync type', select([['volume', 'Volume (mouth opens with loudness)'], ['vowels', 'Vowels (A I U E O)']], () => M.lipsync, v => { M.lipsync = v; build(); })));
  if (M.lipsync === 'vowels') { b.append(h('Calibrate vowels')); b.append(hint('For each vowel: press its button, then say that sound and hold it for about a second. Calibrate at least three. Until then the mouth just opens with volume.'));
    const g = el('div', { className: 'vt-vow' }); for (const k of ['a', 'i', 'u', 'e', 'o']) { const bt = el('button', { type: 'button', className: M.calib[k] ? 'on' : '' }, k.toUpperCase() + (M.calib[k] ? ' ✓' : '')); bt.onclick = async () => { if (!sess || !sess.mic || !M.on) { say('Turn on the microphone and pick a model first.'); return; } say('Say “' + k.toUpperCase() + '” now…'); const f = await sess.mic.sample(1300); if (!f) { say('Could not hear you. Speak louder or lower the cutoff.'); return; } M.calib[k] = f; save(); sync(); say(k.toUpperCase() + ' saved.'); build(); }; g.append(bt); } b.append(g); const r = el('button', { type: 'button' }, 'Reset vowels'); r.onclick = () => { M.calib = {}; save(); sync(); build(); }; b.append(r); }
  b.append(hint('The microphone is analysed on this computer and never recorded.'));
  const upd = () => { if (!$('#vt-panel .vt-meter')) return; const lv = sess && sess.mic && sess.mic.level ? clamp(sess.mic.level * 22 * M.gain, 0, 1) : 0; meter.firstChild.style.width = lv * 100 + '%'; meter.classList.toggle('over', lv > M.cutoff); requestAnimationFrame(upd); }; upd();
}
function pageMotion(b) {
  b.append(h('Mouse')); b.append(check('Head follows the mouse pointer (when the camera has no face)', () => cfg.mouse.on, v => { cfg.mouse.on = v; build(); }));
  if (cfg.mouse.on) b.append(slider('Strength', () => cfg.mouse.strength, v => { cfg.mouse.strength = v; }, 0, 1, 0.05, v => Math.round(v * 100) + '%', 0.6));
  b.append(h('Idle life')); b.append(check('Blink now and then', () => cfg.idle.blink, v => { cfg.idle.blink = v; }), check('Breathing', () => cfg.idle.breathe, v => { cfg.idle.breathe = v; }), check('Gentle sway', () => cfg.idle.sway, v => { cfg.idle.sway = v; }));
  b.append(hint('Idle motion fills in when nothing is tracking you, so the avatar never looks frozen.'));
}
const SIZES = [['1280x720', '1280 × 720 (HD)'], ['1920x1080', '1920 × 1080 (Full HD)'], ['1080x1920', '1080 × 1920 (portrait)'], ['1080x1080', '1080 × 1080 (square)'], ['720x1280', '720 × 1280 (portrait HD)'], ['512x512', '512 × 512']];
function pageDisplay(b) {
  const D = cfg.display; b.append(row('App FPS', select([[60, '60'], [30, '30'], [24, '24'], [15, '15']], () => D.fps, v => { D.fps = +v; })));
  const cur = D.width + 'x' + D.height, sz = el('select'); SIZES.forEach(([v, t]) => sz.append(el('option', { value: v }, t))); if (!SIZES.some(([v]) => v === cur)) sz.append(el('option', { value: cur }, D.width + ' × ' + D.height)); sz.value = cur; sz.onchange = () => { const [w, hh] = sz.value.split('x').map(Number); D.width = w; D.height = hh; save(); sync(); }; b.append(row('Picture size', sz));
  b.append(row('Background', select([['transparent', 'Transparent (for Live and recording)'], ['color', 'Solid colour']], () => D.bg, v => { D.bg = v; build(); })));
  if (D.bg === 'color') { const c = el('input', { type: 'color', value: D.color }); c.oninput = () => { D.color = c.value; }; c.onchange = () => { save(); sync(); }; b.append(row('Colour', c)); }
  b.append(h('Avatar placement'));
  b.append(slider('Zoom', () => D.zoom, v => { D.zoom = v; }, 0.3, 6, 0.05, v => v.toFixed(2) + '×', 1.6), slider('Move left / right', () => D.ox, v => { D.ox = v; }, -1, 1, 0.01, v => v.toFixed(2), 0), slider('Move up / down', () => D.oy, v => { D.oy = v; }, -1, 1, 0.01, v => v.toFixed(2), 0.2));
  b.append(h('Look')); b.append(slider('Outline', () => D.outline, v => { D.outline = v; }, 0, 3, 0.1, v => v.toFixed(1), 1)); b.append(row('Style', select([['color', 'Colour'], ['gray', 'Grey'], ['ink', 'Black and white']], () => D.style, v => { D.style = v; })));
}
async function pageOutput(b) {
  b.append(h('Sudo Make Live')); b.append(hint('Your setup here can be added to a Sudo Make Live scene as a source. It follows your camera and microphone just like this window, with a transparent background, so you can put it over a game or screen capture.'));
  const add = el('button', { type: 'button', className: 'pri', disabled: !cfg.model }, 'Add to Sudo Make Live'); add.onclick = () => { const L = window.SMA_live; if (!L || !L.addVTuber) { say('Sudo Make Live is not ready.'); return; } window.SMA_apps.choose('live'); setTimeout(() => L.addVTuber(JSON.parse(JSON.stringify(cfg))), 150); }; b.append(add);
  if (!cfg.model) b.append(hint('Pick a model first.'));
  b.append(h('Picture')); const pic = el('button', { type: 'button', disabled: !cfg.model }, 'Save a picture (PNG)'); pic.onclick = () => { if (!sess) return; const D = cfg.display, c = sess.rig.render(D.width, D.height); c.toBlob(bl => { const a = el('a', { href: URL.createObjectURL(bl), download: 'vtuber.png' }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }, 'image/png'); }; b.append(pic);
  b.append(h('Record animation'));
  b.append(hint('Records what you see in the preview, at the picture size you chose in Display, as a WebM video. Plain WebM cannot keep a see-through background, so pick a background colour for the recording (a green screen colour lets you remove it later).'));
  const rc = el('input', { type: 'color', value: rec.color }); rc.oninput = () => { rec.color = rc.value; }; b.append(row('Recording background', rc));
  b.append(check('Record the microphone sound too', () => rec.audio, v => { rec.audio = v; }));
  const rb = el('button', { type: 'button', className: rec.on ? 'pri' : '', disabled: !cfg.model }, rec.on ? 'Stop recording' : '● Start recording'); rb.onclick = () => { if (rec.on) recStop(); else recStart(); };
  const st = el('div', { id: 'vt-recstat', className: 'vt-status' }, rec.on ? 'Recording…' : 'Not recording.'); b.append(rb, st);
  b.append(h('Spout and NDI')); b.append(hint('Spout (Windows) and NDI output are not built: Spout needs Windows-only native code, and NDI needs NDI’s own runtime. On Linux use the virtual webcam, or add the VTuber to Sudo Make Live.'));
  await vcamBox(b);
}
// ----- virtual webcam (Linux, through a v4l2loopback device) -----
const vc = { on: false, device: '', color: '#00b140', cvs: null, ctx: null };
async function vcamStart() { const api = window.sma && window.sma.vcam; if (!api || !vc.device || !sess || !sess.rig.model) return; const D = cfg.display; try { await api.start({ device: vc.device, w: D.width, h: D.height, fps: D.fps }); vc.cvs = el('canvas', { width: D.width, height: D.height }); vc.ctx = vc.cvs.getContext('2d', { willReadFrequently: true }); vc.on = true; vc.w = D.width; vc.h = D.height; say('The virtual webcam is on. Pick “' + (vc.name || vc.device) + '” as the camera in your other program.'); } catch (e) { say(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } if (panel === 'output') build(); }
async function vcamStop() { vc.on = false; const api = window.sma && window.sma.vcam; if (api) await api.stop(); vc.cvs = null; say('The virtual webcam is off.'); if (panel === 'output') build(); }
function vcFrame(c) { const D = cfg.display; if (D.width !== vc.w || D.height !== vc.h) { vcamStop(); say('The picture size changed, so the virtual webcam was stopped. Start it again.'); return; } const x = vc.ctx; x.fillStyle = D.bg === 'color' ? D.color : vc.color; x.fillRect(0, 0, vc.w, vc.h); if (c) x.drawImage(c, 0, 0); window.sma.vcam.frame(x.getImageData(0, 0, vc.w, vc.h).data.buffer); }
if (window.sma && window.sma.vcam) window.sma.vcam.onEnded((code, err) => { if (vc.on) { vc.on = false; vc.cvs = null; say('The virtual webcam stopped. ' + (err || '')); if (panel === 'output') build(); } });
async function vcamBox(b) {
  const api = window.sma && window.sma.vcam; b.append(h('Virtual webcam')); if (!api) { b.append(hint('The virtual webcam needs the desktop app.')); return; } const info = await api.devices();
  if (!info.ok) { b.append(hint(info.why)); return; }
  b.append(hint('Shows your avatar as a webcam in other programs (Zoom, Discord, a browser, OBS). A webcam has no see-through background, so the picture is placed on a colour.'));
  if (!info.list.length) { const w = el('div', { className: 'vt-warn' }); w.append(el('b', {}, 'No virtual camera found. '), info.module ? 'The v4l2loopback module is loaded, but no loopback camera device was found. Load it with a device:' : 'Linux needs the v4l2loopback driver, which has to be installed and loaded by an administrator. Run these in a terminal, then press Check again:', el('br')); const pre = el('pre', { textContent: info.command }); pre.style.cssText = 'white-space:pre-wrap;font-size:11px;margin:6px 0'; const cp = el('button', { type: 'button' }, 'Copy the commands'); cp.onclick = () => navigator.clipboard.writeText(info.command).then(() => say('Copied.')); const ck = el('button', { type: 'button' }, 'Check again'); ck.onclick = () => build(); w.append(pre, cp, ' ', ck); b.append(w); return; }
  const sel = el('select'); info.list.forEach(d => sel.append(el('option', { value: d.path }, `${d.name} (${d.path})${d.writable ? '' : ' - no permission'}`))); if (!vc.device || !info.list.some(d => d.path === vc.device)) vc.device = info.list[0].path; sel.value = vc.device; vc.name = (info.list.find(d => d.path === vc.device) || {}).name; sel.onchange = () => { vc.device = sel.value; vc.name = (info.list.find(d => d.path === sel.value) || {}).name; }; b.append(row('Camera device', sel));
  const c = el('input', { type: 'color', value: vc.color }); c.oninput = () => { vc.color = c.value; }; b.append(row('Background colour', c));
  const bt = el('button', { type: 'button', className: vc.on ? 'pri' : '', disabled: !cfg.model || (!vc.on && !info.list.find(d => d.path === vc.device && d.writable)) }, vc.on ? 'Stop the virtual webcam' : 'Start the virtual webcam'); bt.onclick = () => (vc.on ? vcamStop() : vcamStart()); b.append(bt);
}
// ----- recording the animation -----
const rec = { on: false, color: '#00b140', audio: false, mr: null, chunks: [], cvs: null, stream: null, mic: null, t0: 0 };
async function recStart() {
  if (!sess || !sess.rig.model || rec.on) return; const D = cfg.display; rec.cvs = el('canvas', { width: D.width, height: D.height }); rec.chunks = [];
  const fps = D.fps; rec.stream = rec.cvs.captureStream(fps);
  if (rec.audio) { try { rec.mic = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: cfg.mic.device ? { exact: cfg.mic.device } : undefined }, video: false }); rec.mic.getAudioTracks().forEach(t => rec.stream.addTrack(t)); } catch (e) { say('No microphone for the recording: ' + e.message); } }
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  rec.mr = new MediaRecorder(rec.stream, { mimeType: mime, videoBitsPerSecond: Math.round(D.width * D.height * fps * 0.12) }); rec.mr.ondataavailable = e => { if (e.data.size) rec.chunks.push(e.data); };
  rec.mr.onstop = () => { const blob = new Blob(rec.chunks, { type: 'video/webm' }), d = new Date(), p2 = n => String(n).padStart(2, '0'), name = `vtuber-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.webm`; const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); say(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB).`); if (rec.mic) rec.mic.getTracks().forEach(t => t.stop()); rec.mic = null; rec.stream = null; rec.cvs = null; };
  rec.mr.start(500); rec.on = true; rec.t0 = performance.now(); say('Recording…'); if (panel === 'output') build();
}
function recStop() { if (!rec.on) return; rec.on = false; try { rec.mr.stop(); } catch (e) {} if (panel === 'output') build(); }
function recFrame(c) { const D = cfg.display, x = rec.cvs.getContext('2d'); if (rec.cvs.width !== D.width || rec.cvs.height !== D.height) return; x.fillStyle = D.bg === 'color' ? D.color : rec.color; x.fillRect(0, 0, rec.cvs.width, rec.cvs.height); if (c) x.drawImage(c, 0, 0); const s = $('#vt-recstat'); if (s) s.textContent = `Recording… ${((performance.now() - rec.t0) / 1000).toFixed(0)} s`; }
async function build() {
  RAIL.forEach(([k]) => { const b = $('#vt-r-' + k); b.classList.toggle('on', k === panel); b.setAttribute('aria-selected', String(k === panel)); });
  const b = el('div', { className: 'vt-body' }); side.textContent = ''; side.append(b); const mine = panel;
  try { await ({ models: pageModels, camera: pageCamera, mic: pageMic, motion: pageMotion, display: pageDisplay, output: pageOutput })[panel](b); } catch (e) { b.append(hint(String(e.message || e))); }
  if (mine !== panel) return; $('#vt-empty').hidden = !!cfg.model; $('#vt-msg').textContent = msg;
}
let pendingZips = [];
async function importFiles(files) {
  let last = null; for (const f of files) { try { say('Importing ' + f.name + '…'); last = await VT.importModel(f); } catch (err) { if (err.code === 'NORUNTIME') { pendingZips.push(f); panel = 'models'; say('Live2D models need the Live2D runtime. Read the licence and install it below, then the model is added.'); } else say(String(err.message || err)); } }
  if (last) { say(`Added "${last.name}".`); await build(); if (!cfg.model) selectModel(last.id); } else if (pendingZips.length) await build();
}
// the optional Live2D runtime: licence first, then an explicit download
async function l2dBox(box) {
  const api = window.sma && window.sma.live2d; if (!api) { box.append(hint('Live2D models need the desktop app.')); return; } const s = await api.status(); box.textContent = '';
  if (s.installed) { const r = el('div', { className: 'vt-status ok' }, 'Live2D runtime installed. Import a model as a .zip that contains a .model3.json. '), x = el('button', { type: 'button', className: 'link' }, 'Remove the runtime'); x.onclick = async () => { await api.remove(); l2dBox(box); }; r.append(x); box.append(r); box.append(hint('Not supported yet for Live2D: swaying hair and clothes (physics), and Live2D’s own motions and expressions. Head turns, blinking, eyebrows and mouth follow your tracking and microphone.')); return; }
  const w = el('div', { className: 'vt-warn' });
  w.append(el('b', {}, 'Live2D support needs a separate download. '), 'It is Live2D’s own “Cubism Core” (about 200 KB), which is Live2D Inc.’s proprietary software and is not part of this app. It is only fetched if you accept Live2D’s licence below and press the button. Nothing about you or your models is sent anywhere, and it is saved on this computer.', el('br'), el('br'));
  const lic = el('button', { type: 'button', className: 'link' }, 'Read Live2D’s Proprietary Software License Agreement'); lic.onclick = () => api.license(); w.append(lic, el('br'));
  const ck = el('input', { type: 'checkbox' }), lab = el('label', { className: 'cv-chk' }); lab.append(ck, ' I have read and accept Live2D’s licence agreement.'); w.append(lab, el('br'));
  const btn = el('button', { type: 'button', className: 'pri', disabled: true }, 'Download the Live2D runtime'); ck.onchange = () => { btn.disabled = !ck.checked; };
  btn.onclick = async () => { btn.disabled = true; try { await api.download(true); say('The Live2D runtime is installed.'); const q = pendingZips; pendingZips = []; if (q.length) await importFiles(q); else build(); } catch (e) { btn.disabled = false; say(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } };
  w.append(btn); box.append(w); }
$('#vt-file').onchange = async e => { const files = [...e.target.files]; e.target.value = ''; await importFiles(files); };
stage.addEventListener('dragover', e => e.preventDefault()); stage.addEventListener('drop', async e => { e.preventDefault(); const fs = [...e.dataTransfer.files].filter(x => /\.(vrm|glb|zip)$/i.test(x.name)); if (fs.length) await importFiles(fs); });

// ---------- the preview loop ----------
let last = 0, frames = 0, t0 = 0, running = false;
function loop(now) {
  if (!running) return; requestAnimationFrame(loop); const D = cfg.display, gap = 1000 / D.fps; if (now - last < gap - 1) return; last = now;
  if (!sess || !sess.rig.model) { const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); return; }
  sess.frame(now); const t = performance.now(); const r = stage.getBoundingClientRect(), s = Math.min(r.width / D.width, r.height / D.height), w = Math.max(80, Math.round(D.width * s)), hh = Math.max(80, Math.round(D.height * s)); // preview at the size it is shown, so it stays smooth
  const rw = Math.min(w * (devicePixelRatio > 1 ? 2 : 1), D.width), rh = Math.round(rw * D.height / D.width);
  if (cv.width !== rw || cv.height !== rh) { cv.width = rw; cv.height = rh; cv.style.width = w + 'px'; cv.style.height = hh + 'px'; }
  const x = cv.getContext('2d'); x.clearRect(0, 0, rw, rh); if (D.bg === 'color') { x.fillStyle = D.color; x.fillRect(0, 0, rw, rh); } cv.classList.toggle('chk', D.bg === 'transparent');
  const c = sess.rig.render(rw, rh); if (c) x.drawImage(c, 0, 0);
  if ((rec.on && rec.cvs) || vc.on) { const full = sess.rig.render(D.width, D.height); if (rec.on && rec.cvs) recFrame(full); if (vc.on) vcFrame(full); }
  frames++; if (now - t0 > 1000) { fpsShown = frames * 1000 / (now - t0); frames = 0; t0 = now; const st = $('#vt-stat'); if (st) st.textContent = `${fpsShown.toFixed(0)} fps · render ${(performance.now() - t).toFixed(0)} ms${sess.rig.hasFace ? ' · face tracked' : cfg.tracking.on ? ' · no face' : ''}`; if (panel === 'camera') statusLine(); }
}
function start() { if (running) return; running = true; build(); requestAnimationFrame(loop); if (cfg.model && !sess) selectModel(cfg.model); else if (sess) sync(); }
function stop() { if (rec.on) recStop(); if (vc.on) vcamStop(); running = false; if (sess) { sess.stop(); sess = null; } }
document.addEventListener('sma-mode', ev => { if (ev.detail === 'vtuber') start(); else if (running) stop(); });
window.SMA_vtuber = { show: start, hide: stop, cfg: () => cfg, session: () => sess, selectModel, setCfg: c => { cfg = VT.mergeCfg(c); save(); sync(); build(); }, state: () => ({ model: cfg.model, face: !!(sess && sess.rig.hasFace), fps: fpsShown, status: sess ? sess.status : null }) };
})();
