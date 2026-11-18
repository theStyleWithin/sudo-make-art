// Sudo Make Live (the page side): scenes, sources, an audio mixer, channels and the Go Live / Record buttons.
// The design follows HopCast's way of working (no account, any server you type in, several servers at once from one
// encode, keys kept encrypted on this computer, no viewer numbers). The scene is drawn on a canvas here, sent to the
// main process as a WebM stream, encoded once and copied to every switched-on channel (electron/live.js).
(() => {
'use strict';
const api = window.sma && window.sma.live, $ = s => document.querySelector(s);
if (!api) return;
$('#mode-live').hidden = false;
const hb = document.createElement('button'); hb.id = 'h-live'; hb.textContent = 'Go live'; $('#h-vtrim').after(hb); hb.onclick = () => window.SMA.setMode('live');
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const uid = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const RES = { '1280x720': [1280, 720], '1920x1080': [1920, 1080], '854x480': [854, 480], '2560x1440': [2560, 1440], '720x1280': [720, 1280], '1080x1920': [1080, 1920] };
const KEY = 'sma-live';

// ---------- saved state ----------
let st; try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
st = Object.assign({ scenes: [{ id: uid(), name: 'Scene 1', items: [] }], cur: 0, sel: null, set: {}, audio: [{ id: uid(), name: 'Microphone', device: '', vol: 1, mute: false }] }, st || {});
st.set = Object.assign({ res: '1280x720', fps: 30, vbr: 4500, abr: 160, encoder: 'x264', preset: 'veryfast', recFormat: 'mkv', alsoRecord: false }, st.set);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st, (k, v) => (k[0] === '_' || k === 'err' ? undefined : v))); } catch (e) {} };
const scene = () => st.scenes[Math.min(st.cur, st.scenes.length - 1)];
const item = id => scene().items.find(i => i.id === id);
let info = { nvenc: false, protocols: ['rtmp', 'rtmps', 'srt'], recordDir: '' }, channels = [], status = { live: false }, tab = 'props';
api.info().then(i => { info = i; if (tab === 'set' || tab === 'chan') pane(); });
api.channels().then(c => { channels = c; if (tab === 'chan') pane(); });
const canvas = $('#lv-canvas'), ctx = canvas.getContext('2d');
function sizeCanvas(scale) {
  const [w, h] = RES[st.set.res] || RES['1280x720']; if (canvas.width === w && canvas.height === h) return;
  if (scale) { const kx = w / canvas.width, ky = h / canvas.height; st.scenes.forEach(s => s.items.forEach(i => { i.x *= kx; i.y *= ky; i.w *= kx; i.h *= ky; })); }
  canvas.width = w; canvas.height = h;
}
sizeCanvas(false);

// ---------- audio ----------
let actx = null, mixDest = null; const inputs = new Map(); // audio input id -> { stream, gain, an }
const ensureAudio = () => { if (!actx) { actx = new AudioContext({ sampleRate: 48000 }); mixDest = actx.createMediaStreamDestination(); } if (actx.state === 'suspended') actx.resume(); return actx; };
async function openInput(a) {
  ensureAudio(); closeInput(a.id);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: a.device ? { exact: a.device } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const src = actx.createMediaStreamSource(stream), gain = actx.createGain(), an = actx.createAnalyser(); an.fftSize = 512; gain.gain.value = a.mute ? 0 : a.vol; src.connect(gain); gain.connect(an); gain.connect(mixDest);
    inputs.set(a.id, { stream, gain, an }); a.err = '';
  } catch (e) { a.err = 'No access to this input'; }
  mixer();
}
function closeInput(id) { const i = inputs.get(id); if (i) { i.stream.getTracks().forEach(t => t.stop()); try { i.gain.disconnect(); } catch (e) {} inputs.delete(id); } }
const levelOf = an => { const b = new Uint8Array(an.fftSize); an.getByteTimeDomainData(b); let m = 0; for (const v of b) m = Math.max(m, Math.abs(v - 128)); return m / 128; };
async function audioDevices() { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch (e) {} return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); }
function mixer() {
  const box = $('#lv-mixer'); box.textContent = '';
  st.audio.forEach(a => {
    const row = el('div', { className: 'lv-ch' }); const name = el('span', { className: 'nm', textContent: a.name, title: 'Double-click to rename' });
    name.ondblclick = () => renameInline(name, a.name, v => { a.name = v; save(); mixer(); });
    const meter = el('div', { className: 'lv-meter' }, ''); const bar = el('i'); meter.append(bar); a._bar = bar;
    const vol = el('input', { type: 'range', min: 0, max: 2, step: 0.01, value: a.vol, title: 'Volume' }); vol.oninput = () => { a.vol = +vol.value; const i = inputs.get(a.id); if (i && !a.mute) i.gain.gain.value = a.vol; save(); };
    const mute = el('button', { textContent: a.mute ? '🔇' : '🔊', title: a.mute ? 'Unmute' : 'Mute' }); mute.onclick = () => { a.mute = !a.mute; const i = inputs.get(a.id); if (i) i.gain.gain.value = a.mute ? 0 : a.vol; save(); mixer(); };
    const dev = el('select', { title: 'Which audio input' }); dev.add(new Option('Default input', '')); if (a.device) dev.add(new Option('Chosen input', a.device, true, true)); dev.value = a.device || '';
    dev.onfocus = async () => { const list = await audioDevices(); dev.textContent = ''; dev.add(new Option('Default input', '')); list.forEach(d => dev.add(new Option(d.label || 'Input', d.deviceId))); dev.value = a.device || ''; };
    dev.onchange = () => { a.device = dev.value; save(); openInput(a); };
    const del = el('button', { textContent: '×', title: 'Remove this audio input' }); del.onclick = () => { closeInput(a.id); st.audio = st.audio.filter(x => x !== a); save(); mixer(); };
    row.append(name, meter, vol, mute, dev, del); if (a.err) row.append(el('small', { className: 'bad', textContent: a.err })); box.append(row);
  });
  const add = el('button', { textContent: '+ Audio input', title: 'Another microphone, or a monitor / loopback device to capture what the computer plays' }); add.onclick = () => { const a = { id: uid(), name: 'Audio input ' + (st.audio.length + 1), device: '', vol: 1, mute: false }; st.audio.push(a); save(); openInput(a); };
  box.append(add);
}
function renameInline(node, value, done) {
  const i = el('input', { value, className: 'rn' }); node.replaceWith(i); i.focus(); i.select(); let fin = false;
  const end = ok => { if (fin) return; fin = true; if (ok && i.value.trim()) done(i.value.trim()); else done(value); };
  i.onkeydown = ev => { if (ev.key === 'Enter') end(true); else if (ev.key === 'Escape') end(false); ev.stopPropagation(); }; i.onblur = () => end(true);
}

// ---------- the scene (drawn on the canvas) ----------
const rt = new Map(); // item id -> { el, stream }
function libSrc(id) { return window.SMA.getSources().find(s => s.id === id); }
async function runtime(it) {
  if (rt.has(it.id)) return rt.get(it.id); const r = { el: null, stream: null, err: '' }; rt.set(it.id, r);
  try {
    if (it.kind === 'image') { const s = libSrc(it.src); if (!s) throw new Error('This picture is no longer in Sources'); const im = new Image(); im.src = URL.createObjectURL(s.blob); await im.decode(); r.el = im; }
    else if (it.kind === 'media') { const s = libSrc(it.src); if (!s) throw new Error('This file is no longer in Sources'); const v = el('video', { loop: !!it.loop, playsInline: true, src: URL.createObjectURL(s.blob) }); await v.play().catch(() => {}); r.el = v;
      ensureAudio(); const sn = actx.createMediaElementSource(v), g = actx.createGain(); g.gain.value = it.vol ?? 1; sn.connect(g); g.connect(mixDest); r.gain = g; }
    else if (it.kind === 'screen' || it.kind === 'camera') {
      const c = it.kind === 'screen' ? { audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: it.sourceId, maxFrameRate: 60 } } } : { audio: false, video: { deviceId: it.device ? { exact: it.device } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } };
      if (it.kind === 'screen' && !it.sourceId) throw new Error('Choose a screen or window');
      const stream = await navigator.mediaDevices.getUserMedia(c), v = el('video', { srcObject: stream, muted: true, playsInline: true }); await v.play(); r.stream = stream; r.el = v;
      if (!it.w) fitItem(it, v.videoWidth, v.videoHeight);
    }
  } catch (e) { r.err = clean(e); }
  list(); return r;
}
function fitItem(it, w, h, fill) { const k = (fill ? Math.max : Math.min)(canvas.width / w, canvas.height / h); it.w = w * k; it.h = h * k; it.x = (canvas.width - it.w) / 2; it.y = (canvas.height - it.h) / 2; save(); }
function dropRuntime(id) { const r = rt.get(id); if (!r) return; if (r.stream) r.stream.getTracks().forEach(t => t.stop()); if (r.el && r.el.pause) r.el.pause(); if (r.gain) try { r.gain.disconnect(); } catch (e) {} rt.delete(id); }
function drawItem(it) {
  if (!it.visible && it.visible !== undefined) return;
  if (it.kind === 'color') { ctx.fillStyle = it.color || '#000'; ctx.fillRect(it.x, it.y, it.w, it.h); return; }
  if (it.kind === 'text') {
    ctx.save(); ctx.font = `${it.bold ? '700 ' : ''}${it.size}px ${window.SMA.cssFamily(it.font || 'Arial')}`; ctx.fillStyle = it.color; ctx.textBaseline = 'top'; const lines = String(it.text).split('\n'), lh = it.size * 1.2; let w = 0;
    lines.forEach((l, k) => { w = Math.max(w, ctx.measureText(l).width); if (it.stroke) { ctx.lineWidth = it.size / 8; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round'; ctx.strokeText(l, it.x, it.y + k * lh); } ctx.fillText(l, it.x, it.y + k * lh); }); it.w = w; it.h = lines.length * lh; ctx.restore(); return;
  }
  const r = rt.get(it.id); if (!r) { runtime(it); return; }
  if (r.el && (r.el.videoWidth !== 0 || r.el.naturalWidth)) { try { ctx.drawImage(r.el, it.x, it.y, it.w, it.h); } catch (e) {} }
  else { ctx.fillStyle = '#222'; ctx.fillRect(it.x, it.y, it.w || 320, it.h || 180); ctx.fillStyle = '#aaa'; ctx.font = '20px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(r.err || 'Waiting for the source…', it.x + 12, it.y + (it.h || 180) / 2); }
}
let timer = null;
function loop() { clearInterval(timer); timer = setInterval(() => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); scene().items.forEach(drawItem); meters(); overlay(); }, 1000 / st.set.fps); }
function meters() { st.audio.forEach(a => { const i = inputs.get(a.id); if (a._bar) a._bar.style.width = (i && !a.mute ? Math.min(100, levelOf(i.an) * 160) : 0) + '%'; }); }

// ---------- selecting and moving on the preview ----------
const stage = $('#lv-stage'), selBox = $('#lv-sel');
function overlay() {
  const it = st.sel && item(st.sel); if (!it || it.visible === false) { selBox.hidden = true; return; } selBox.hidden = false;
  Object.assign(selBox.style, { left: it.x / canvas.width * 100 + '%', top: it.y / canvas.height * 100 + '%', width: it.w / canvas.width * 100 + '%', height: it.h / canvas.height * 100 + '%' });
}
const pt = ev => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * canvas.width, (ev.clientY - r.top) / r.height * canvas.height]; };
let drag = null;
stage.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return; const [px, py] = pt(ev);
  if (ev.target.classList.contains('lv-h')) { const it = item(st.sel); drag = { kind: 'size', it, px, py, o: { ...it } }; }
  else { const hit = [...scene().items].reverse().find(i => i.visible !== false && px >= i.x && px <= i.x + i.w && py >= i.y && py <= i.y + i.h); if (!hit) { st.sel = null; list(); pane(); return; } st.sel = hit.id; drag = { kind: 'move', it: hit, px, py, o: { ...hit } }; list(); pane(); }
  stage.setPointerCapture(ev.pointerId); ev.preventDefault();
});
stage.addEventListener('pointermove', ev => { if (!drag) return; const [px, py] = pt(ev), dx = px - drag.px, dy = py - drag.py, it = drag.it;
  if (drag.kind === 'move') { it.x = drag.o.x + dx; it.y = drag.o.y + dy; } else { const r = drag.o.w / (drag.o.h || 1); it.w = Math.max(20, drag.o.w + dx); it.h = ev.shiftKey || it.kind === 'text' ? it.w / r : Math.max(20, drag.o.h + dy); if (it.kind === 'text') it.size = Math.max(8, Math.round(drag.o.size * it.w / drag.o.w)); } });
stage.addEventListener('pointerup', () => { if (drag) { drag = null; save(); pane(); } });
stage.addEventListener('contextmenu', ev => { ev.preventDefault(); const [px, py] = pt(ev), hit = [...scene().items].reverse().find(i => i.visible !== false && px >= i.x && px <= i.x + i.w && py >= i.y && py <= i.y + i.h);
  if (hit) { st.sel = hit.id; list(); pane(); } window.SMA_CTX && SMA_CTX.show(ev.clientX, ev.clientY, hit ? [{ label: 'Fit to the picture', fn: () => fitItem(hit, hit.w, hit.h) }, { label: 'Fill the picture', fn: () => fitItem(hit, hit.w, hit.h, true) }, 'sep', { label: 'Remove', danger: true, fn: () => removeItem(hit.id) }] : [{ label: 'Add a source…', fn: addMenu }]); });

// ---------- scenes and sources ----------
function scenesList() {
  const box = $('#lv-scenes'); box.textContent = '';
  st.scenes.forEach((s, i) => {
    const row = el('div', { className: 'lv-row' + (i === st.cur ? ' on' : '') }); const nm = el('span', { className: 'nm', textContent: s.name, title: 'Click to show this scene. Double-click to rename.' });
    nm.onclick = () => { st.cur = i; st.sel = null; save(); render(); }; nm.ondblclick = () => renameInline(nm, s.name, v => { s.name = v; save(); scenesList(); });
    const dup = el('button', { textContent: '⧉', title: 'Copy this scene' }); dup.onclick = () => { const c = JSON.parse(JSON.stringify(s)); c.id = uid(); c.name = s.name + ' copy'; c.items.forEach(it => { it.id = uid(); }); st.scenes.splice(i + 1, 0, c); st.cur = i + 1; save(); render(); };
    const del = el('button', { textContent: '×', title: 'Remove this scene' }); del.onclick = () => { if (st.scenes.length < 2) return; if (!confirm(`Remove "${s.name}"?`)) return; s.items.forEach(it => dropRuntime(it.id)); st.scenes.splice(i, 1); st.cur = Math.max(0, Math.min(st.cur, st.scenes.length - 1)); save(); render(); };
    row.append(nm, dup, del); box.append(row);
  });
}
const KIND = { screen: '🖥', camera: '📷', image: '🖼', media: '🎞', text: 'T', color: '▧' };
function list() {
  const box = $('#lv-items'); box.textContent = ''; const its = scene().items;
  if (!its.length) box.append(el('p', { className: 'hint', textContent: 'No sources yet. Press + Add: a screen, a camera, a picture, a video, text or a color.' }));
  [...its].reverse().forEach(it => {
    const row = el('div', { className: 'lv-row' + (it.id === st.sel ? ' on' : '') }); const eye = el('button', { textContent: it.visible === false ? '◌' : '●', title: it.visible === false ? 'Show' : 'Hide' }); eye.onclick = () => { it.visible = it.visible === false; save(); list(); };
    const nm = el('span', { className: 'nm', textContent: (KIND[it.kind] || '') + ' ' + it.name, title: 'Click to select. Double-click to rename.' }); nm.onclick = () => { st.sel = it.id; list(); pane(); }; nm.ondblclick = () => renameInline(nm, it.name, v => { it.name = v; save(); list(); pane(); });
    const up = el('button', { textContent: '↑', title: 'Bring forward' }), dn = el('button', { textContent: '↓', title: 'Send back' }), x = el('button', { textContent: '×', title: 'Remove' });
    const i = its.indexOf(it); up.onclick = () => { if (i < its.length - 1) { [its[i], its[i + 1]] = [its[i + 1], its[i]]; save(); list(); } }; dn.onclick = () => { if (i > 0) { [its[i], its[i - 1]] = [its[i - 1], its[i]]; save(); list(); } }; x.onclick = () => removeItem(it.id);
    row.append(eye, nm, up, dn, x); box.append(row);
  });
}
function removeItem(id) { dropRuntime(id); scene().items = scene().items.filter(i => i.id !== id); if (st.sel === id) st.sel = null; save(); list(); pane(); }
function addItem(o) { const it = Object.assign({ id: uid(), visible: true, x: 0, y: 0, w: 0, h: 0 }, o); scene().items.push(it); st.sel = it.id; save(); list(); pane(); runtime(it); return it; }
function render() { sizeCanvas(false); scenesList(); list(); pane(); }

// ---------- dialogs for adding sources ----------
function modal(title, build) {
  document.getElementById('lvdlg')?.remove(); const back = el('div', { id: 'lvdlg' }), box = el('div', { className: 'box' }); const close = () => back.remove();
  box.append(el('h3', { textContent: title })); build(box, close); const bar = el('div', { className: 'bar' }); const c = el('button', { textContent: 'Close' }); c.onclick = close; bar.append(c); box.append(bar); back.append(box); back.onclick = ev => { if (ev.target === back) close(); }; document.body.append(back);
}
async function chooseScreen(done) {
  modal('Choose a screen or window', async (box, close) => { const g = el('div', { className: 'lv-grid' }); box.append(g, el('p', { className: 'hint', textContent: 'On Wayland your system may show its own picker. Sound from the screen is not captured: add an audio input (a monitor or loopback device) in the mixer for that.' }));
    try { const src = await api.sources(); if (!src.length) g.textContent = 'Nothing to capture was found.'; src.forEach(s => { const b = el('button', { className: 'lv-tile', title: s.name }); if (s.thumb) b.append(el('img', { src: s.thumb })); b.append(el('small', { textContent: (s.screen ? '🖥 ' : '▭ ') + s.name })); b.onclick = () => { close(); done(s); }; g.append(b); }); }
    catch (e) { g.textContent = 'Could not list screens: ' + clean(e); } });
}
async function chooseCamera(done) {
  modal('Choose a camera', async (box, close) => { const g = el('div', { className: 'lv-col' }); box.append(g);
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); } catch (e) { g.textContent = 'No access to a camera: ' + clean(e); return; }
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); if (!cams.length) g.textContent = 'No camera found.';
    cams.forEach(c => { const b = el('button', { textContent: '📷 ' + (c.label || 'Camera') }); b.onclick = () => { close(); done(c); }; g.append(b); }); });
}
function chooseLibrary(kind, done) {
  modal(kind === 'image' ? 'Choose a picture' : 'Choose a video or sound file', (box, close) => { const g = el('div', { className: 'lv-grid' }); const add = el('button', { textContent: '+ Add a file from this computer…', className: 'pri' });
    const fill = () => { g.textContent = ''; const l = window.SMA.getSources().filter(s => kind === 'image' ? s.kind === 'image' : (s.kind === 'video' || s.kind === 'audio')); if (!l.length) g.textContent = 'Nothing in Sources yet.';
      l.forEach(s => { const b = el('button', { className: 'lv-tile', title: s.name }); if (s.kind === 'image') b.append(el('img', { src: URL.createObjectURL(s.blob) })); else b.append(el('div', { className: 'ico', textContent: s.kind === 'video' ? '🎞' : '♪' })); b.append(el('small', { textContent: s.name })); b.onclick = () => { close(); done(s); }; g.append(b); }); };
    add.onclick = () => { const f = $('#file'); f.accept = kind === 'image' ? 'image/*' : 'video/*,audio/*'; f.multiple = true; f.value = ''; f.onchange = async () => { await window.SMA.addFiles([...f.files]); f.multiple = false; fill(); }; f.click(); };
    box.append(add, g); fill(); });
}
function addMenu() {
  const b = $('#lv-addsrc').getBoundingClientRect();
  window.SMA_CTX.show(b.left, b.bottom + 4, [
    { label: '🖥 Screen or window…', fn: () => chooseScreen(s => addItem({ kind: 'screen', name: s.name.slice(0, 40), sourceId: s.id })) },
    { label: '📷 Camera…', fn: () => chooseCamera(c => addItem({ kind: 'camera', name: c.label || 'Camera', device: c.deviceId })) },
    { label: '🖼 Picture…', fn: () => chooseLibrary('image', s => { const u = URL.createObjectURL(s.blob), im = new Image(); im.onload = () => { const it = addItem({ kind: 'image', name: s.name, src: s.id }); fitItem(it, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(u); }; im.src = u; }) },
    { label: '🎞 Video or sound file…', fn: () => chooseLibrary('media', s => { const it = addItem({ kind: 'media', name: s.name, src: s.id, loop: true, vol: 1 }); const t = setInterval(() => { const r = rt.get(it.id); if (r && r.el && r.el.videoWidth) { fitItem(it, r.el.videoWidth, r.el.videoHeight); clearInterval(t); } else if (r && r.err) clearInterval(t); }, 200); }) },
    { label: 'T  Text', fn: () => addItem({ kind: 'text', name: 'Text', text: 'Your text', size: Math.round(canvas.height / 10), color: '#ffffff', font: 'Arial', bold: true, stroke: true, x: canvas.width * 0.1, y: canvas.height * 0.4 }) },
    { label: '▧ Color', fn: () => addItem({ kind: 'color', name: 'Color', color: '#1b1b2f', x: 0, y: 0, w: canvas.width, h: canvas.height }) },
  ]);
}

// ---------- the right-hand panes ----------
function row(label, ...nodes) { const l = el('label'); l.append(label, ...nodes); return l; }
function numField(o, k, min) { const i = el('input', { type: 'number', value: Math.round(o[k] * 10) / 10, min }); i.id = 'lvf-' + k; i.oninput = () => { o[k] = +i.value || 0; save(); }; return i; }
function pane() {
  const p = $('#lv-pane'); const a = document.activeElement; if (a && p.contains(a) && a.id) return; p.textContent = '';
  document.querySelectorAll('.lv-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (tab === 'chan') return channelsPane(p); if (tab === 'set') return settingsPane(p);
  const it = st.sel && item(st.sel); if (!it) { p.append(el('p', { className: 'hint', textContent: 'Click a source in the picture or in the list to edit it. Drag it to move it; drag the corner to resize (Shift keeps its shape).' })); return; }
  p.append(el('h4', { textContent: it.name }));
  p.append(row('X', numField(it, 'x')), row('Y', numField(it, 'y')), row('Width', numField(it, 'w', 1)), row('Height', numField(it, 'h', 1)));
  const bar = el('div', { className: 'row' }); [['Fit', () => fitItem(it, it.w || 1, it.h || 1)], ['Fill', () => fitItem(it, it.w || 1, it.h || 1, true)], ['Stretch', () => { Object.assign(it, { x: 0, y: 0, w: canvas.width, h: canvas.height }); save(); pane(); }]].forEach(([l, fn]) => { const b = el('button', { textContent: l }); b.onclick = () => { fn(); pane(); }; bar.append(b); }); p.append(bar);
  if (it.kind === 'text') { const t = el('textarea', { value: it.text }); t.id = 'lvf-text'; t.oninput = () => { it.text = t.value; save(); }; p.append(t, row('Size', numField(it, 'size', 8)), row('Color', (() => { const c = el('input', { type: 'color', value: it.color }); c.oninput = () => { it.color = c.value; save(); }; return c; })()), row('Outline', (() => { const c = el('input', { type: 'checkbox', checked: !!it.stroke }); c.onchange = () => { it.stroke = c.checked; save(); }; return c; })()));
    if (window.SMA_FONTS) p.append(row('Font', window.SMA_FONTS.pick(it.font || 'Arial', n => { it.font = n; save(); pane(); }))); }
  if (it.kind === 'color') p.append(row('Color', (() => { const c = el('input', { type: 'color', value: it.color }); c.oninput = () => { it.color = c.value; save(); }; return c; })()));
  if (it.kind === 'media') { p.append(row('Loop', (() => { const c = el('input', { type: 'checkbox', checked: !!it.loop }); c.onchange = () => { it.loop = c.checked; const r = rt.get(it.id); if (r && r.el) r.el.loop = it.loop; save(); }; return c; })()), row('Volume', (() => { const c = el('input', { type: 'range', min: 0, max: 2, step: 0.01, value: it.vol ?? 1 }); c.oninput = () => { it.vol = +c.value; const r = rt.get(it.id); if (r && r.gain) r.gain.gain.value = it.vol; save(); }; return c; })())); }
  if (it.kind === 'screen') { const b = el('button', { textContent: 'Choose another screen or window…' }); b.onclick = () => chooseScreen(s => { dropRuntime(it.id); it.sourceId = s.id; it.name = s.name.slice(0, 40); save(); list(); pane(); }); p.append(b); }
  const r = rt.get(it.id); if (r && r.err) p.append(el('p', { className: 'bad', textContent: r.err }));
}
function persistChannels() { return api.saveChannels(channels).then(c => { channels = c; }).catch(() => {}); }
function chanState(id) { const d = status.dests && status.dests.find(x => x.id === id); return d; }
function channelsPane(p) {
  p.append(el('p', { className: 'hint', textContent: 'Type any server address and stream key. Switch on as many channels as you like: the picture is encoded once and sent to all of them. A channel that fails does not stop the others, and it reconnects by itself. Keys are stored encrypted on this computer.' }));
  channels.forEach(c => {
    const box = el('div', { className: 'lv-chan' }), head = el('div', { className: 'lv-chead' });
    const sw = el('input', { type: 'checkbox', checked: !!c.enabled, title: 'Send to this channel when live' }); sw.onchange = async () => { c.enabled = sw.checked; await persistChannels(); if (status.live) { try { if (c.enabled) await api.destStart(c.id); else await api.destStop(c.id); } catch (e) { note(clean(e)); } } pane(); };
    const d = chanState(c.id); head.append(sw, el('b', { textContent: c.name }), el('span', { className: 'chip ' + (d ? d.state : ''), textContent: d ? ({ live: 'Live', starting: 'Connecting…', retrying: 'Retrying…', failed: 'Failed', stopped: 'Stopped' }[d.state] || d.state) : '' }));
    const edit = el('button', { textContent: '✎', title: 'Edit' }); edit.onclick = () => { c._open = !c._open; pane(); }; head.append(edit); box.append(head);
    if (d && d.error) box.append(el('small', { className: 'bad', textContent: d.error }));
    if (c._open) {
      const nm = el('input', { value: c.name, id: 'lvc-name' }); nm.oninput = () => { c.name = nm.value; };
      const ty = el('select'); [['rtmp', 'RTMP'], ['rtmps', 'RTMPS (secure RTMP)'], ['srt', 'SRT'], ['rist', 'RIST']].forEach(([v, n]) => { const o = new Option(n + (info.protocols.includes(v) ? '' : ' (this FFmpeg lacks it)'), v); ty.add(o); }); ty.value = c.type; ty.onchange = () => { c.type = ty.value; pane(); };
      const url = el('input', { value: c.url, id: 'lvc-url', placeholder: c.type + '://server.example.com/app', spellcheck: false }); url.oninput = () => { c.url = url.value.trim(); };
      const key = el('input', { type: 'password', value: c.key, id: 'lvc-key', placeholder: 'Stream key', autocomplete: 'off', spellcheck: false }); key.oninput = () => { c.key = key.value; };
      const show = el('button', { textContent: '👁', title: 'Show or hide the key' }); show.onclick = () => { key.type = key.type === 'password' ? 'text' : 'password'; };
      box.append(row('Name', nm), row('Type', ty), row('Server', url), row('Key', key, show));
      if (c.type.startsWith('rtmp')) { const u = el('input', { value: c.user, id: 'lvc-user', placeholder: 'optional' }); u.oninput = () => { c.user = u.value; }; const pw = el('input', { type: 'password', value: c.pass, id: 'lvc-pass', placeholder: 'optional' }); pw.oninput = () => { c.pass = pw.value; }; box.append(row('ID', u), row('Password', pw)); }
      const bar = el('div', { className: 'row' }); const ok = el('button', { textContent: 'Save', className: 'pri' }); ok.onclick = async () => { c._open = false; await persistChannels(); pane(); }; const rm = el('button', { textContent: 'Delete' }); rm.onclick = async () => { if (!confirm(`Delete the channel "${c.name}" and its key?`)) return; if (status.live) await api.destStop(c.id).catch(() => {}); channels = channels.filter(x => x !== c); await persistChannels(); pane(); }; bar.append(ok, rm); box.append(bar);
    }
    p.append(box);
  });
  const add = el('button', { textContent: '+ Add a channel', className: 'pri' }); add.onclick = () => { channels.push({ id: uid(), name: 'Channel ' + (channels.length + 1), type: 'rtmp', url: '', key: '', user: '', pass: '', enabled: false, _open: true }); pane(); }; p.append(add);
}
function settingsPane(p) {
  const S = st.set, sel = (k, opts) => { const s = el('select'); opts.forEach(([v, n]) => s.add(new Option(n, v))); s.value = S[k]; s.onchange = () => { S[k] = isNaN(+s.value) ? s.value : +s.value; if (k === 'res') sizeCanvas(true); if (k === 'fps') loop(); save(); }; return s; };
  const nf = (k, min, max) => { const i = el('input', { type: 'number', value: S[k], min, max }); i.id = 'lvs-' + k; i.oninput = () => { S[k] = Math.max(min, Math.min(max, +i.value || min)); save(); }; return i; };
  const dis = status.live ? { disabled: true } : {};
  p.append(el('h4', { textContent: 'Picture' }), row('Size', sel('res', Object.keys(RES).map(k => [k, k.replace('x', ' × ') + (RES[k][1] > RES[k][0] ? ' (vertical)' : '')]))), row('Frame rate', sel('fps', [[24, '24'], [30, '30'], [60, '60']])));
  p.append(el('h4', { textContent: 'Encoding (done once, shared by every channel)' }), row('Video kbps', nf('vbr', 300, 60000)), row('Audio kbps', nf('abr', 32, 512)), row('Encoder', sel('encoder', [['x264', 'x264 (software)'], ...(info.nvenc ? [['nvenc', 'NVIDIA NVENC']] : [])])), row('x264 speed', sel('preset', [['ultrafast', 'Fastest'], ['superfast', 'Very fast'], ['veryfast', 'Fast (default)'], ['faster', 'Balanced'], ['fast', 'Better quality']])));
  const dir = el('button', { textContent: info.recordDir || 'Choose…', title: 'Where recordings are saved' }); dir.onclick = async () => { const d = await api.pickDir(); if (d) { info.recordDir = d; pane(); } };
  p.append(el('h4', { textContent: 'Recording' }), row('Folder', dir), row('Format', sel('recFormat', [['mkv', 'MKV (safe if the app closes)'], ['mp4', 'MP4']])), row('Also record when going live', (() => { const c = el('input', { type: 'checkbox', checked: !!S.alsoRecord }); c.onchange = () => { S.alsoRecord = c.checked; save(); }; return c; })()));
  p.append(el('p', { className: 'hint', textContent: 'Encoder and size changes apply the next time you go live. FFmpeg: ' + (info.ffmpeg || '?') + '. Sending over ' + info.protocols.map(x => x.toUpperCase()).join(', ') + '.' }));
}
document.querySelectorAll('.lv-tabs button').forEach(b => { b.onclick = () => { tab = b.dataset.t; pane(); }; });

// ---------- Go Live and Record ----------
let recorder = null, q = Promise.resolve(), tick = null;
const note = t => { const n = $('#lv-note'); n.textContent = t; n.hidden = !t; };
function startRecorder() {
  const [w, h] = RES[st.set.res]; const stream = canvas.captureStream(st.set.fps); ensureAudio(); mixDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(40e6, st.set.vbr * 1000 * 1.6), audioBitsPerSecond: 192000 });
  recorder.ondataavailable = e => { if (e.data && e.data.size) q = q.then(() => e.data.arrayBuffer()).then(b => api.chunk(b)); }; recorder.start(250);
}
function stopRecorder() { if (recorder && recorder.state !== 'inactive') recorder.stop(); recorder = null; }
async function begin() {
  note(''); await Promise.all(st.audio.map(a => inputs.has(a.id) ? 0 : openInput(a))); ensureAudio();
  await api.start({ ...st.set, w: canvas.width, h: canvas.height }); startRecorder();
}
async function goLive() {
  try {
    if (status.live) { await end(); return; }
    const on = channels.filter(c => c.enabled); if (!on.length && !st.set.alsoRecord) { note('Switch on a channel first (Channels tab), or press Record.'); tab = 'chan'; pane(); return; }
    await begin(); for (const c of on) { try { await api.destStart(c.id); } catch (e) { note(clean(e)); } } if (st.set.alsoRecord) await api.recordStart(st.set.recFormat);
  } catch (e) { note(clean(e)); stopRecorder(); }
}
async function recToggle() {
  try {
    const has = status.dests && status.dests.find(d => d.id === 'record');
    if (has) { await api.recordStop(); if (!status.dests.some(d => d.kind === 'channel')) await end(); return; }
    if (!status.live) await begin(); await api.recordStart(st.set.recFormat);
  } catch (e) { note(clean(e)); }
}
async function end() { stopRecorder(); await new Promise(r => setTimeout(r, 450)); await q.catch(() => {}); await api.stop(); st.audio.forEach(a => closeInput(a.id)); mixer(); }
$('#lv-go').onclick = goLive; $('#lv-rec').onclick = recToggle;
const fmtT = ms => { const s = Math.floor(ms / 1000), p = n => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`; };
api.onStatus(s => {
  const was = status.live; status = s || { live: false };
  if (was && !status.live) { stopRecorder(); if (status.error) note('Stopped: ' + status.error); }
  const rec = status.dests && status.dests.find(d => d.id === 'record'), chs = (status.dests || []).filter(d => d.kind === 'channel');
  $('#lv-go').textContent = status.live ? 'Stop' : 'Go Live'; $('#lv-go').classList.toggle('live', !!status.live); $('#lv-rec').textContent = rec ? '■ Stop recording' : '● Record'; $('#lv-rec').classList.toggle('on', !!rec);
  const bad = chs.filter(d => d.state === 'retrying' || d.state === 'failed');
  $('#lv-state').textContent = !status.live ? 'Not live' : (chs.length ? `Live on ${chs.filter(d => d.state === 'live').length} of ${chs.length} channel${chs.length > 1 ? 's' : ''}` : 'Encoding') + (rec ? ' · recording' : '') + (bad.length ? ` · ${bad.length} reconnecting` : '');
  clearInterval(tick); if (status.live) tick = setInterval(() => { $('#lv-stats').textContent = `${fmtT(Date.now() - status.since)} · ${Math.round(status.stats.fps || 0)} fps` + (status.stats.bitrate && status.stats.bitrate !== 'N/A' ? ' · ' + status.stats.bitrate : '') + (status.stats.drop ? ` · ${status.stats.drop} dropped` : ''); }, 500); else $('#lv-stats').textContent = '';
  if (tab === 'chan') pane();
});
document.addEventListener('sma-mode', ev => {
  if (ev.detail === 'live') { render(); mixer(); loop(); }
  else if (!status.live) { clearInterval(timer); [...rt.keys()].forEach(dropRuntime); } // leaving without streaming: let go of the screen and camera
});
$('#lv-addscene').onclick = () => { st.scenes.push({ id: uid(), name: 'Scene ' + (st.scenes.length + 1), items: [] }); st.cur = st.scenes.length - 1; st.sel = null; save(); render(); };
$('#lv-addsrc').onclick = addMenu;
window.SMA_live = { state: () => st, status: () => status, channels: () => channels, addItem, runtime: () => rt };
render(); mixer();
})();
