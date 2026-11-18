// Sudo Make Live (the page side). The look and the way of working follow HopCast, the author's own streaming studio:
// a channel bar on top, a menu bar, one big preview, a Properties / Filters strip, three docks (Scenes, Sources, Audio
// Mixer), a bottom bar with Go Live and Rec, and a tool column on the right. No account, any server you type in, several
// servers from one encode, keys kept encrypted on this computer, and no viewer numbers or platform nudges.
// The scene is drawn on a canvas here, sent to the main process as a WebM stream, encoded once and copied to every
// switched-on channel and to the recording (electron/live.js).
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

// ---------- icons (drawn here, simple outlines) ----------
const I = (d, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  plus: I('<path d="M12 5v14M5 12h14"/>'), speaker: I('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>'), speakerOff: I('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'), gear: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
  trans: I('<path d="M4 5l6 7-6 7zM20 5l-6 7 6 7z"/>'), studio: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M3 12h18"/>'), music: I('<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>'),
  pen: I('<path d="M4 17c3-1 4-8 7-9s2 6 5 5 3-5 4-5"/>'), camera: I('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-2h3L15 7"/>'), bell: I('<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>'),
  cam: I('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'), mic: I('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'), img: I('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 18l5-5 4 4 3-3 4 4"/>'),
  screen: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'), media: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>'), text: I('<path d="M5 6h14M12 6v13M9 19h6"/>'), color: I('<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/>'),
  chev: I('<path d="M6 9l6 6 6-6"/>', 14),
};
function icons() {
  [['#hc-addscene', 'plus'], ['#hc-trans', 'trans'], ['#hc-addsrc', 'plus'], ['#hc-muteall', 'speaker'], ['#hc-mixset', 'gear'], ['#hc-resgear', 'gear']].forEach(([s, k]) => { $(s).innerHTML = ICON[k]; });
  $('#hc-coll i').innerHTML = ICON.chev;
}

// ---------- saved state ----------
let st; try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
st = st || {};
if (st.scenes && !st.cols) st.cols = [{ id: uid(), name: 'Untitled', scenes: st.scenes, cur: st.cur || 0, sel: st.sel || null }]; delete st.scenes;
st = Object.assign({ cols: [{ id: uid(), name: 'Untitled', scenes: [{ id: uid(), name: 'Scene 1', items: [] }], cur: 0, sel: null }], col: 0, set: {}, audio: [{ id: uid(), name: 'Mic/Aux', device: '', vol: 1, mute: false }], profiles: {}, trans: { type: 'cut', ms: 300 }, chbar: true, docks: { scenes: true, sources: true, mixer: true }, snap: { on: true, sens: 10, edge: true, other: true, center: false }, studio: false, music: { files: [], vol: 1, i: 0 } }, st);
st.set = Object.assign({ res: '1280x720', fps: 30, vbr: 4500, abr: 160, encoder: 'x264', preset: 'veryfast', recFormat: 'mkv', alsoRecord: false }, st.set);
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st, (k, v) => (k[0] === '_' || k === 'err' ? undefined : v))); } catch (e) {} };
const colo = () => st.cols[Math.min(st.col, st.cols.length - 1)];
const scene = () => colo().scenes[Math.min(colo().cur, colo().scenes.length - 1)];
let progId = null; // the scene being sent out (differs from the selected one in studio mode)
const progScene = () => (st.studio && progId && colo().scenes.find(s => s.id === progId)) || scene();
const item = id => scene().items.find(i => i.id === id);
let info = { nvenc: false, protocols: ['rtmp', 'rtmps', 'srt'], recordDir: '' }, channels = [], status = { live: false }, notices = [], unread = 0;
const flash = t => { const n = $('#hc-note'); n.textContent = t; n.hidden = !t; clearTimeout(flash.t); if (t) flash.t = setTimeout(() => { n.hidden = true; }, 9000); };
const notify = t => { notices.unshift({ t, at: Date.now() }); notices.length = Math.min(notices.length, 40); unread++; sidebar(); flash(t); };
api.info().then(i => { info = i; });
api.channels().then(c => { channels = c; chbar(); });
const canvas = $('#lv-canvas'), ctx = canvas.getContext('2d'), pvc = el('canvas', { width: 1280, height: 720 }), pctx = pvc.getContext('2d');
$('#hc-stage-e').append(pvc);
const editCanvas = () => (st.studio ? pvc : canvas);
function sizeCanvas(scale) {
  const [w, h] = RES[st.set.res] || RES['1280x720']; if (canvas.width === w && canvas.height === h) return;
  if (scale) { const kx = w / canvas.width, ky = h / canvas.height; st.cols.forEach(c => c.scenes.forEach(s => s.items.forEach(i => { i.x *= kx; i.y *= ky; i.w *= kx; i.h *= ky; }))); }
  canvas.width = w; canvas.height = h; pvc.width = w; pvc.height = h;
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
async function audioDevices(kind = 'audioinput') { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } catch (e) {} return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === kind); }
let allMuted = false;
function mixer() {
  const box = $('#lv-mixer'); box.textContent = '';
  const rows = [...st.audio.map(a => ({ a, name: a.name })), ...(music.el ? [{ name: 'Music' }] : [])];
  if (!rows.length) box.append(el('p', { className: 'hc-empty', textContent: 'No audio inputs. Use the + Source menu to add one.' }));
  rows.forEach(r => {
    const row = el('div', { className: 'hc-ch' }), a = r.a, name = el('span', { className: 'hc-nm', textContent: r.name, title: a ? 'Double-click to rename' : '' });
    const meter = el('div', { className: 'hc-meter' }); const bar = el('i'); meter.append(bar); (a || music)._bar = bar;
    const vol = el('input', { type: 'range', min: 0, max: 2, step: 0.01, value: a ? a.vol : st.music.vol, title: 'Volume' });
    const mute = el('button', { innerHTML: (a ? a.mute : music.mute) ? ICON.speakerOff : ICON.speaker, title: 'Mute', className: 'hc-ib' });
    if (a) {
      name.ondblclick = () => renameInline(name, a.name, v => { a.name = v; save(); mixer(); });
      vol.oninput = () => { a.vol = +vol.value; const i = inputs.get(a.id); if (i && !a.mute) i.gain.gain.value = a.vol; save(); };
      mute.onclick = () => { a.mute = !a.mute; const i = inputs.get(a.id); if (i) i.gain.gain.value = a.mute ? 0 : a.vol; save(); mixer(); };
    } else { vol.oninput = () => { st.music.vol = +vol.value; if (music.gain && !music.mute) music.gain.gain.value = st.music.vol; save(); }; mute.onclick = () => { music.mute = !music.mute; if (music.gain) music.gain.gain.value = music.mute ? 0 : st.music.vol; mixer(); }; }
    row.append(name, meter, vol, mute); if (a && a.err) row.append(el('small', { className: 'hc-bad', textContent: a.err })); box.append(row);
  });
}
function renameInline(node, value, done) {
  const i = el('input', { value, className: 'hc-rn' }); node.replaceWith(i); i.focus(); i.select(); let fin = false;
  const end = ok => { if (fin) return; fin = true; if (ok && i.value.trim()) done(i.value.trim()); else done(value); };
  i.onkeydown = ev => { if (ev.key === 'Enter') end(true); else if (ev.key === 'Escape') end(false); ev.stopPropagation(); }; i.onblur = () => end(true);
}

// ---------- music (the note icon): files from Sources, played into the mix ----------
const music = { el: null, gain: null, mute: false, _bar: null, an: null };
function playMusic(i) {
  const lib = st.music.files.map(libSrc).filter(Boolean); if (!lib.length) return stopMusic();
  st.music.i = (i + lib.length) % lib.length; const s = lib[st.music.i]; ensureAudio();
  if (!music.el) { music.el = el('audio', {}); music.el.onended = () => playMusic(st.music.i + 1); const sn = actx.createMediaElementSource(music.el); music.gain = actx.createGain(); music.an = actx.createAnalyser(); music.an.fftSize = 512; music.gain.gain.value = st.music.vol; sn.connect(music.gain); music.gain.connect(music.an); music.gain.connect(mixDest); music.gain.connect(actx.destination); }
  music.el.src = URL.createObjectURL(s.blob); music.el.play().catch(() => {}); mixer(); sidebar();
}
function stopMusic() { if (music.el) { music.el.pause(); music.el.removeAttribute('src'); } mixer(); sidebar(); }

// ---------- the scene (drawn on the canvases) ----------
const rt = new Map(); // item id -> { el, stream, err }
function libSrc(id) { return window.SMA.getSources().find(s => s.id === id); }
async function runtime(it) {
  if (rt.has(it.id)) return rt.get(it.id); const r = { el: null, stream: null, err: '' }; rt.set(it.id, r);
  try {
    if (it.kind === 'image') { const s = libSrc(it.src); if (!s) throw new Error('This picture is no longer in Sources'); const im = new Image(); im.src = URL.createObjectURL(s.blob); await im.decode(); r.el = im; }
    else if (it.kind === 'media') { const s = libSrc(it.src); if (!s) throw new Error('This file is no longer in Sources'); const v = el('video', { loop: !!it.loop, playsInline: true, src: URL.createObjectURL(s.blob) }); await v.play().catch(() => {}); r.el = v;
      ensureAudio(); const sn = actx.createMediaElementSource(v), g = actx.createGain(); g.gain.value = it.vol ?? 1; sn.connect(g); g.connect(mixDest); r.gain = g; }
    else if (it.kind === 'screen' || it.kind === 'camera') {
      if (it.kind === 'screen' && !it.sourceId) throw new Error('Choose a screen or window');
      const c = it.kind === 'screen' ? { audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: it.sourceId, maxFrameRate: 60 } } } : { audio: false, video: { deviceId: it.device ? { exact: it.device } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } };
      const stream = await navigator.mediaDevices.getUserMedia(c), v = el('video', { srcObject: stream, muted: true, playsInline: true }); await v.play(); r.stream = stream; r.el = v;
      if (!it.w) fitItem(it, v.videoWidth, v.videoHeight);
    }
  } catch (e) { r.err = clean(e); }
  list(); return r;
}
function fitItem(it, w, h, fill) { const k = (fill ? Math.max : Math.min)(canvas.width / w, canvas.height / h); it.w = w * k; it.h = h * k; it.x = (canvas.width - it.w) / 2; it.y = (canvas.height - it.h) / 2; save(); }
function dropRuntime(id) { const r = rt.get(id); if (!r) return; if (r.stream) r.stream.getTracks().forEach(t => t.stop()); if (r.el && r.el.pause) r.el.pause(); if (r.gain) try { r.gain.disconnect(); } catch (e) {} rt.delete(id); }
const fxCss = fx => (fx ? `brightness(${fx.brightness ?? 1}) contrast(${fx.contrast ?? 1}) saturate(${fx.saturate ?? 1}) blur(${fx.blur ?? 0}px) grayscale(${fx.gray ?? 0})` : 'none');
function drawItem(c, it) {
  if (it.visible === false) return;
  c.save(); const fx = it.fx; if (fx) { c.globalAlpha = fx.opacity ?? 1; c.filter = fxCss(fx); }
  if (fx && fx.mirror) { c.translate(it.x + it.w / 2, 0); c.scale(-1, 1); c.translate(-(it.x + it.w / 2), 0); }
  if (it.kind === 'color') { c.fillStyle = it.color || '#000'; c.fillRect(it.x, it.y, it.w, it.h); }
  else if (it.kind === 'text') {
    c.font = `${it.bold ? '700 ' : ''}${it.size}px ${window.SMA.cssFamily(it.font || 'Arial')}`; c.fillStyle = it.color; c.textBaseline = 'top'; const lines = String(it.text).split('\n'), lh = it.size * 1.2; let w = 0;
    lines.forEach((l, k) => { w = Math.max(w, c.measureText(l).width); if (it.stroke) { c.lineWidth = it.size / 8; c.strokeStyle = '#000'; c.lineJoin = 'round'; c.strokeText(l, it.x, it.y + k * lh); } c.fillText(l, it.x, it.y + k * lh); }); it.w = w; it.h = lines.length * lh;
  } else {
    const r = rt.get(it.id); if (!r) { runtime(it); }
    else if (r.el && (r.el.videoWidth || r.el.naturalWidth)) { try { c.drawImage(r.el, it.x, it.y, it.w, it.h); } catch (e) {} }
    else { c.fillStyle = '#222'; c.fillRect(it.x, it.y, it.w || 320, it.h || 180); c.fillStyle = '#aaa'; c.font = '20px sans-serif'; c.textBaseline = 'middle'; c.fillText(r.err || 'Waiting for the source…', it.x + 12, it.y + (it.h || 180) / 2); }
  }
  c.restore();
}
// scene changes: Cut or Fade
let snapCv = null, fadeAt = 0;
function switchProgram(to) { if (st.trans.type === 'fade') { snapCv = snapCv || document.createElement('canvas'); snapCv.width = canvas.width; snapCv.height = canvas.height; snapCv.getContext('2d').drawImage(canvas, 0, 0); fadeAt = performance.now(); } progId = to; }
// the pen (sidebar): drawn on top of everything, so it is in the stream too
const pen = { on: false, strokes: [], color: '#ffe600', w: 6 };
function drawPen(c) { c.save(); c.lineCap = c.lineJoin = 'round'; pen.strokes.forEach(s => { c.strokeStyle = s.color; c.lineWidth = s.w; c.beginPath(); s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); c.stroke(); }); c.restore(); }
function paint(c, s) { c.fillStyle = '#000'; c.fillRect(0, 0, canvas.width, canvas.height); s.items.forEach(it => drawItem(c, it)); }
let timer = null;
function loop() {
  clearInterval(timer); timer = setInterval(() => {
    paint(ctx, progScene());
    if (fadeAt) { const k = (performance.now() - fadeAt) / st.trans.ms; if (k >= 1) fadeAt = 0; else { ctx.globalAlpha = 1 - k; ctx.drawImage(snapCv, 0, 0); ctx.globalAlpha = 1; } }
    drawPen(ctx); if (st.studio) paint(pctx, scene());
    meters(); overlay();
  }, 1000 / st.set.fps);
}
function meters() { st.audio.forEach(a => { const i = inputs.get(a.id); if (a._bar) a._bar.style.width = (i && !a.mute ? Math.min(100, levelOf(i.an) * 160) : 0) + '%'; }); if (music._bar && music.an) music._bar.style.width = (music.el && !music.el.paused && !music.mute ? Math.min(100, levelOf(music.an) * 160) : 0) + '%'; }

// ---------- selecting and moving on the preview (with snapping) ----------
const stageEl = $('#lv-stage'), selBox = $('#lv-sel');
function overlay() {
  const it = colo().sel && item(colo().sel), host = st.studio ? $('#hc-stage-e') : stageEl; if (selBox.parentNode !== host) host.append(selBox);
  if (!it || it.visible === false || pen.on) { selBox.hidden = true; return; } selBox.hidden = false;
  const ec = editCanvas(), cr = ec.getBoundingClientRect(), hr = host.getBoundingClientRect(), k = cr.width / ec.width; Object.assign(selBox.style, { left: cr.left - hr.left + it.x * k + 'px', top: cr.top - hr.top + it.y * k + 'px', width: it.w * k + 'px', height: it.h * k + 'px' }); // the picture is centred inside its box, so measure from the canvas itself
}
const pt = (ev, c = editCanvas()) => { const r = c.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * c.width, (ev.clientY - r.top) / r.height * c.height]; };
let drag = null;
function snapMove(it) {
  const S = st.snap; if (!S.on) return; const T = S.sens * canvas.width / Math.max(1, editCanvas().getBoundingClientRect().width), W = canvas.width, H = canvas.height;
  const xs = [], ys = []; if (S.edge) { xs.push(0, W); ys.push(0, H); } if (S.center) { xs.push(W / 2); ys.push(H / 2); }
  if (S.other) scene().items.forEach(o => { if (o === it || o.visible === false) return; xs.push(o.x, o.x + o.w); ys.push(o.y, o.y + o.h); });
  const best = (edges, targets) => { let b = null; for (const e of edges) for (const t of targets) { const d = t - e; if (Math.abs(d) <= T && (b === null || Math.abs(d) < Math.abs(b))) b = d; } return b; };
  const dx = best([it.x, it.x + it.w], xs), dy = best([it.y, it.y + it.h], ys); if (dx !== null) it.x += dx; if (dy !== null) it.y += dy;
}
function down(ev, c, host) {
  if (ev.button !== 0) return; const [px, py] = pt(ev, c);
  if (pen.on) { pen.strokes.push({ color: pen.color, w: pen.w, pts: [[px, py]] }); drag = { kind: 'pen' }; host.setPointerCapture(ev.pointerId); return; }
  if (ev.target.classList.contains('lv-h')) { const it = item(colo().sel); drag = { kind: 'size', it, px, py, o: { ...it } }; }
  else { const hit = [...scene().items].reverse().find(i => i.visible !== false && px >= i.x && px <= i.x + i.w && py >= i.y && py <= i.y + i.h); if (!hit) { colo().sel = null; list(); return; } colo().sel = hit.id; list(); if (hit.lock) return; drag = { kind: 'move', it: hit, px, py, o: { ...hit } }; }
  host.setPointerCapture(ev.pointerId); ev.preventDefault();
}
function move(ev, c) { if (!drag) return; const [px, py] = pt(ev, c); if (drag.kind === 'pen') { pen.strokes[pen.strokes.length - 1].pts.push([px, py]); return; } const dx = px - drag.px, dy = py - drag.py, it = drag.it;
  if (drag.kind === 'move') { it.x = drag.o.x + dx; it.y = drag.o.y + dy; if (!ev.altKey) snapMove(it); } else { const r = drag.o.w / (drag.o.h || 1); it.w = Math.max(20, drag.o.w + dx); it.h = ev.shiftKey || it.kind === 'text' ? it.w / r : Math.max(20, drag.o.h + dy); if (it.kind === 'text') it.size = Math.max(8, Math.round(drag.o.size * it.w / drag.o.w)); } }
function up() { if (drag) { drag = null; save(); } }
[[canvas, stageEl], [pvc, $('#hc-stage-e')]].forEach(([c, host]) => {
  host.addEventListener('pointerdown', ev => { if ((host === stageEl) === !!st.studio) return; down(ev, c, host); }); // in studio mode only the Preview side is edited
  host.addEventListener('pointermove', ev => move(ev, c)); host.addEventListener('pointerup', up);
  host.addEventListener('dblclick', ev => { if ((host === stageEl) === !!st.studio) return; const it = colo().sel && item(colo().sel); if (it && !pen.on) propsDialog(it); });
  host.addEventListener('contextmenu', ev => { ev.preventDefault(); if (pen.on) { pen.strokes = []; return; } if ((host === stageEl) === !!st.studio) return; const [px, py] = pt(ev, c), hit = [...scene().items].reverse().find(i => i.visible !== false && px >= i.x && px <= i.x + i.w && py >= i.y && py <= i.y + i.h);
    if (hit) { colo().sel = hit.id; list(); } window.SMA_CTX && SMA_CTX.show(ev.clientX, ev.clientY, hit ? itemMenu(hit) : [{ label: 'Add a source…', fn: addDialog }]); });
});

// ---------- channel bar ----------
const kindName = { rtmp: 'Custom RTMP', rtmps: 'Custom RTMPS', srt: 'Custom SRT', rist: 'Custom RIST' };
function chbar() {
  $('#hc-chbar').classList.toggle('off', !st.chbar); $('#hc-chtoggle').textContent = st.chbar ? '⌃' : '⌄';
  const box = $('#hc-chlist'); box.textContent = ''; if (!st.chbar) return;
  channels.forEach(c => {
    const d = status.dests && status.dests.find(x => x.id === c.id), chip = el('div', { className: 'hc-chip' + (c.enabled ? ' on' : '') });
    const av = el('span', { className: 'hc-av', textContent: (c.name.trim()[0] || '?').toUpperCase() }); const nm = el('span', { className: 'hc-chn', textContent: c.name, title: kindName[c.type] + ' · ' + (c.enabled ? 'goes live with Go Live (click to switch off)' : 'switched off (click to switch on)') });
    chip.append(av, nm); if (d && d.state !== 'stopped') chip.append(el('span', { className: 'hc-pill ' + d.state, textContent: ({ live: 'Online', starting: 'Connecting', retrying: 'Retrying', failed: 'Failed' })[d.state] || '' }));
    chip.onclick = async () => { c.enabled = !c.enabled; await persistChannels(); if (status.live) { try { if (c.enabled) await api.destStart(c.id); else await api.destStop(c.id); } catch (e) { notify(clean(e)); } } chbar(); };
    const mo = el('button', { textContent: '⋮', className: 'hc-ib', title: 'Edit or remove this channel' }); mo.onclick = ev => { ev.stopPropagation(); const r = mo.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom, [{ label: 'Edit', fn: () => channelDialog(c) }, { label: 'Remove', danger: true, fn: async () => { if (!confirm(`Remove the channel "${c.name}" and its stream key?`)) return; if (status.live) await api.destStop(c.id).catch(() => {}); channels = channels.filter(x => x !== c); await persistChannels(); chbar(); } }]); };
    chip.append(mo); box.append(chip);
  });
  const add = el('button', { className: 'hc-addch', textContent: channels.length ? '+ Channel' : 'Custom RTMP', title: 'Add a channel: any RTMP, SRT or RIST server you type in' }); add.onclick = () => channelDialog(); box.append(add);
}
function persistChannels() { return api.saveChannels(channels).then(c => { channels = c; }).catch(() => {}); }
$('#hc-chmenu').onclick = ev => { const r = ev.target.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom + 2, [{ label: 'Add channels', fn: () => channelDialog() }, { label: 'Reset live info', fn: () => { if (!status.live) status = { live: false }; chbar(); } }]); };
$('#hc-chtoggle').onclick = () => { st.chbar = !st.chbar; save(); chbar(); };

// ---------- dialogs (HopCast style: dark, title strip, buttons at the bottom) ----------
function dlg({ title, body, buttons, wide }) {
  document.getElementById('hcdlg')?.remove(); const back = el('div', { id: 'hcdlg' }), box = el('div', { className: 'hc-box' + (wide ? ' wide' : '') }); const close = () => back.remove();
  const x = el('button', { className: 'hc-x', textContent: '✕', title: 'Close' }); x.onclick = close; box.append(el('div', { className: 'hc-strip2' }), x);
  const inner = el('div', { className: 'hc-inner' }); if (title) inner.append(el('h2', { textContent: title })); const content = el('div', { className: 'hc-content' }); inner.append(content); box.append(inner);
  const bar = el('div', { className: 'hc-btns' }); box.append(bar); back.append(box); document.body.append(back); const d = { close, content, bar, buttons: {} };
  (buttons || []).forEach(b => { const bt = el('button', { textContent: b.label, className: b.primary ? 'hc-pri' : '' }); bt.disabled = !!b.disabled; bt.onclick = async () => { if (b.fn) { const r = await b.fn(d); if (r === false) return; } close(); }; bar.append(bt); d.buttons[b.label] = bt; });
  back.onclick = ev => { if (ev.target === back) close(); }; body(content, d); return d;
}
const field = (label, node, req, hint) => { const r = el('div', { className: 'hc-row' }); const l = el('label', { textContent: label }); if (req) l.append(el('b', { className: 'req', textContent: ' *' })); const c = el('div', { className: 'hc-cell' }); c.append(node); if (hint) c.append(el('small', { textContent: hint })); r.append(l, c); return r; };
const check = (label, on, set, hint) => { const w = el('label', { className: 'hc-chk' }); const i = el('input', { type: 'checkbox', checked: !!on }); i.onchange = () => set(i.checked); w.append(i, label); if (hint) w.append(el('small', { textContent: hint })); return w; };
function channelDialog(existing) {
  const c = existing ? { ...existing } : { id: uid(), name: '', type: 'rtmp', url: '', key: '', user: '', pass: '', enabled: true }, tp = el('select');
  [['rtmp', 'User Input (RTMP)'], ['rtmps', 'User Input (RTMPS)'], ['srt', 'User Input (SRT)'], ['rist', 'User Input (RIST)']].forEach(([v, n]) => tp.add(new Option(n + (info.protocols.includes(v) ? '' : ' (this FFmpeg lacks it)'), v))); tp.value = c.type;
  dlg({ title: 'Custom Channel', buttons: [{ label: 'Save', primary: true, disabled: true, fn: async () => { c.url = c.url.trim(); if (!new RegExp('^' + c.type + '://\\S+$', 'i').test(c.url)) { alert('The server address must start with ' + c.type + '://'); return false; } const i = channels.findIndex(x => x.id === c.id); if (i >= 0) channels[i] = c; else channels.push(c); await persistChannels(); chbar(); } }, { label: 'Cancel' }],
    body: (box, d) => {
      const url = el('input', { value: c.url, placeholder: c.type + '://server.example.com/app', spellcheck: false, id: 'hcc-url' }), key = el('input', { type: 'password', value: c.key, autocomplete: 'off', spellcheck: false, id: 'hcc-key' }), name = el('input', { value: c.name, id: 'hcc-name' });
      const ok = () => { d.buttons.Save.disabled = !(url.value.trim() && name.value.trim() && (c.type.startsWith('rtmp') ? key.value.trim() : true)); };
      let autopaste = true; url.oninput = () => { c.url = url.value; ok(); }; name.oninput = () => { c.name = name.value; ok(); }; key.oninput = () => { c.key = key.value; ok(); };
      key.onpaste = ev => { if (!autopaste) return; const t = (ev.clipboardData.getData('text') || '').trim(); if (/\//.test(t)) { ev.preventDefault(); key.value = t.split('/').pop().split('?')[0]; c.key = key.value; ok(); } };
      const eye = el('button', { textContent: 'Show', className: 'hc-mini' }); eye.onclick = () => { key.type = key.type === 'password' ? 'text' : 'password'; eye.textContent = key.type === 'password' ? 'Show' : 'Hide'; };
      const build = () => { box.textContent = ''; box.append(field('URL', tp, true), field('', url)); const w = el('div', { className: 'hc-inl' }); w.append(key, eye); box.append(field('Stream Key', w, c.type.startsWith('rtmp'), c.type === 'srt' ? 'Sent as the SRT stream id (optional).' : ''));
        const ap = el('div', { className: 'hc-row' }), apc = el('div', { className: 'hc-cell' }); apc.append(check('Auto-paste stream key only', autopaste, v => { autopaste = v; }, 'Even if you copy along with the URL, only the stream key will be entered automatically.')); ap.append(el('label'), apc); box.append(ap);
        if (c.type.startsWith('rtmp')) { const u = el('input', { value: c.user, placeholder: 'optional' }), p = el('input', { type: 'password', value: c.pass, placeholder: 'optional' }); u.oninput = () => { c.user = u.value; }; p.oninput = () => { c.pass = p.value; }; box.append(field('ID', u), field('Password', p)); }
        box.append(field('Stream Name', name, true)); ok(); };
      tp.onchange = () => { c.type = tp.value; build(); }; build();
    } });
}
function propsDialog(it) {
  dlg({ title: it.name + ' · Properties', buttons: [{ label: 'OK', primary: true }], body: box => {
    const num = (k, min) => { const i = el('input', { type: 'number', value: Math.round(it[k] * 10) / 10, min }); i.oninput = () => { it[k] = +i.value || 0; save(); }; return i; };
    const colorIn = k => { const c = el('input', { type: 'color', value: it[k] }); c.oninput = () => { it[k] = c.value; save(); }; return c; };
    box.append(field('X', num('x')), field('Y', num('y')), field('Width', num('w', 1)), field('Height', num('h', 1)));
    const bar = el('div', { className: 'hc-inl' }); [['Fit', () => fitItem(it, it.w || 1, it.h || 1)], ['Fill', () => fitItem(it, it.w || 1, it.h || 1, true)], ['Stretch', () => { Object.assign(it, { x: 0, y: 0, w: canvas.width, h: canvas.height }); save(); }]].forEach(([l, fn]) => { const b = el('button', { textContent: l, className: 'hc-mini' }); b.onclick = () => { fn(); propsDialog(it); }; bar.append(b); }); box.append(field('Size', bar));
    box.append(check('Lock this source in place', it.lock, v => { it.lock = v; save(); }));
    if (it.kind === 'text') { const t = el('textarea', { value: it.text }); t.oninput = () => { it.text = t.value; save(); }; box.append(field('Text', t), field('Size', num('size', 8)), field('Color', colorIn('color')), check('Outline', it.stroke, v => { it.stroke = v; save(); }));
      if (window.SMA_FONTS) box.append(field('Font', window.SMA_FONTS.pick(it.font || 'Arial', n => { it.font = n; save(); }))); }
    if (it.kind === 'color') box.append(field('Color', colorIn('color')));
    if (it.kind === 'media') { box.append(check('Loop', it.loop, v => { it.loop = v; const r = rt.get(it.id); if (r && r.el) r.el.loop = v; save(); }), field('Volume', (() => { const c = el('input', { type: 'range', min: 0, max: 2, step: 0.01, value: it.vol ?? 1 }); c.oninput = () => { it.vol = +c.value; const r = rt.get(it.id); if (r && r.gain) r.gain.gain.value = it.vol; save(); }; return c; })())); }
    if (it.kind === 'screen') { const b = el('button', { textContent: 'Choose another screen or window…', className: 'hc-mini' }); b.onclick = () => screenPicker(s => { dropRuntime(it.id); it.sourceId = s.id; it.name = s.name.slice(0, 40); save(); list(); propsDialog(it); }); box.append(field('Capture', b)); }
    const r = rt.get(it.id); if (r && r.err) box.append(el('p', { className: 'hc-bad', textContent: r.err }));
  } });
}
function filtersDialog(it) {
  dlg({ title: it.name + ' · Filters', buttons: [{ label: 'OK', primary: true }], body: box => {
    it.fx = it.fx || {}; const sl = (k, label, min, max, step, def) => { const i = el('input', { type: 'range', min, max, step, value: it.fx[k] ?? def }); i.oninput = () => { it.fx[k] = +i.value; save(); }; return field(label, i); };
    box.append(sl('opacity', 'Opacity', 0, 1, 0.01, 1), sl('brightness', 'Brightness', 0, 2, 0.01, 1), sl('contrast', 'Contrast', 0, 2, 0.01, 1), sl('saturate', 'Saturation', 0, 3, 0.01, 1), sl('gray', 'Grayscale', 0, 1, 0.01, 0), sl('blur', 'Blur', 0, 20, 0.5, 0), check('Mirror (flip left to right)', it.fx.mirror, v => { it.fx.mirror = v; save(); }));
    const reset = el('button', { textContent: 'Reset filters', className: 'hc-mini' }); reset.onclick = () => { delete it.fx; save(); filtersDialog(it); }; box.append(reset);
  } });
}
function screenPicker(done) {
  dlg({ title: 'Choose a screen or window', buttons: [{ label: 'Cancel' }], wide: true, body: async box => { const g = el('div', { className: 'hc-grid' }); box.append(g, el('p', { className: 'hc-hint', textContent: 'On Wayland your system may show its own picker. Sound from the screen is not captured: add an audio input (a monitor or loopback device) in the mixer for that. Tip: capture a different window, or a screen this app is not on, to avoid an endless mirror; the stream keeps going when you switch to another mode.' }));
    try { const src = await api.sources(); if (!src.length) g.textContent = 'Nothing to capture was found.'; src.forEach(s => { const b = el('button', { className: 'hc-tile', title: s.name }); if (s.thumb) b.append(el('img', { src: s.thumb })); b.append(el('small', { textContent: (s.screen ? 'Screen · ' : 'Window · ') + s.name + (!s.screen && /sudo make/i.test(s.name) ? '  (this app: shows an endless mirror while Live is on screen)' : '') })); b.onclick = () => { document.getElementById('hcdlg')?.remove(); done(s); }; g.append(b); }); } catch (e) { g.textContent = 'Could not list screens: ' + clean(e); } } });
}
// "Add a source": a list on the left, what it does on the right
const SRC_TYPES = [
  { cat: 'Camera · Video', id: 'camera', name: 'Video Capture Device', sub: 'Camera', icon: 'cam', blurb: 'Shows a camera or capture card.' },
  { cat: 'Camera · Video', id: 'screen', name: 'Screen or Window Capture', sub: 'Screen', icon: 'screen', blurb: 'Shows your whole screen, or one window.' },
  { cat: 'Audio · Music', id: 'mic', name: 'Audio Input Capture', sub: 'Mic · Audio', icon: 'mic', blurb: 'A microphone or any audio input, added to the Audio Mixer.' },
  { cat: 'Audio · Music', id: 'sys', name: 'Audio Output Capture', sub: 'System Sound', icon: 'speaker', blurb: 'What the computer plays. Pick a "monitor" or loopback input (on Linux, "Monitor of …"). It is added to the Audio Mixer.' },
  { cat: 'Image · Video Playback', id: 'image', name: 'Image', sub: 'Picture', icon: 'img', blurb: 'A picture from your Sources library.' },
  { cat: 'Image · Video Playback', id: 'media', name: 'Media Source', sub: 'Video, sound', icon: 'media', blurb: 'A video or sound file from your Sources library. Its sound goes to the mix.' },
  { cat: 'Text · Color', id: 'text', name: 'Text', sub: 'Words', icon: 'text', blurb: 'Words on the picture.' },
  { cat: 'Text · Color', id: 'color', name: 'Color Source', sub: 'Solid color', icon: 'color', blurb: 'A flat color, handy as a background.' },
];
function addDialog() {
  let pick = null, extra = null;
  dlg({ wide: true, buttons: [{ label: 'OK', primary: true, disabled: true, fn: () => { if (!pick) return false; commitAdd(pick, extra); } }, { label: 'Cancel' }], body: (box, d) => {
    box.classList.add('hc-add'); const left = el('div', { className: 'hc-addl' }), right = el('div', { className: 'hc-addr' }); box.append(left, right);
    const q = el('input', { type: 'search', placeholder: 'Search Sources' }), lst = el('div'); left.append(q, lst);
    const showRight = () => { right.textContent = ''; if (!pick) { right.append(el('h3', { textContent: 'Add a source' }), el('p', { className: 'hc-hint', textContent: 'Choose a source on the left to see what it does.' })); return; }
      right.append(el('h3', { textContent: pick.name }), el('p', { className: 'hc-hint', textContent: pick.blurb })); extra = {}; const nm = el('input', { value: pick.name.replace(' Capture Device', '').replace(' Capture', '') }); extra.name = () => nm.value.trim() || pick.name; right.append(field('Name', nm));
      if (pick.id === 'camera') { const s = el('select'); s.add(new Option('Loading cameras…', '')); right.append(field('Device', s)); navigator.mediaDevices.getUserMedia({ video: true }).then(t => { t.getTracks().forEach(x => x.stop()); return navigator.mediaDevices.enumerateDevices(); }).then(ds => { s.textContent = ''; const cams = ds.filter(x => x.kind === 'videoinput'); if (!cams.length) s.add(new Option('No camera found', '')); cams.forEach(c => s.add(new Option(c.label || 'Camera', c.deviceId))); }).catch(() => { s.textContent = ''; s.add(new Option('No access to a camera', '')); }); extra.device = () => s.value; }
      if (pick.id === 'mic' || pick.id === 'sys') { const s = el('select'); s.add(new Option('Default', '')); right.append(field('Device', s)); audioDevices().then(ds => { s.textContent = ''; s.add(new Option('Default', '')); ds.forEach(x => s.add(new Option(x.label || 'Input', x.deviceId))); if (pick.id === 'sys') { const m = [...s.options].find(o => /monitor|loopback|stereo mix/i.test(o.text)); if (m) s.value = m.value; } }); extra.device = () => s.value; }
      if (pick.id === 'screen') { const bt = el('button', { textContent: 'Choose a screen or window…', className: 'hc-mini' }); bt.onclick = () => screenPicker(s => { extra.src = s; bt.textContent = s.name.slice(0, 40); nm.value = s.name.slice(0, 40); d.buttons.OK.disabled = false; }); right.append(field('Capture', bt)); d.buttons.OK.disabled = true; }
      if (pick.id === 'image' || pick.id === 'media') { const bt = el('button', { textContent: 'Choose from Sources…', className: 'hc-mini' }); bt.onclick = () => libraryPicker(pick.id, s => { extra.src = s; bt.textContent = s.name; d.buttons.OK.disabled = false; }); right.append(field('File', bt)); d.buttons.OK.disabled = true; }
      if (pick.id === 'text') { const t = el('textarea', { value: 'Your text' }); extra.text = () => t.value; right.append(field('Text', t)); }
      if (pick.id === 'color') { const c = el('input', { type: 'color', value: '#1b1b2f' }); extra.color = () => c.value; right.append(field('Color', c)); }
      if (!['screen', 'image', 'media'].includes(pick.id)) d.buttons.OK.disabled = false; };
    const paintList = () => { lst.textContent = ''; const term = q.value.trim().toLowerCase(); let cat = ''; SRC_TYPES.filter(t => !term || (t.name + t.sub + t.cat).toLowerCase().includes(term)).forEach(t => { if (t.cat !== cat) { cat = t.cat; lst.append(el('div', { className: 'hc-cat', textContent: cat })); }
      const b = el('button', { className: 'hc-src' + (pick === t ? ' on' : '') }); b.innerHTML = `<span class="hc-sic">${ICON[t.icon]}</span>`; const tx = el('span'); tx.append(el('b', { textContent: t.name }), el('small', { textContent: t.sub })); b.append(tx); b.onclick = () => { pick = t; paintList(); showRight(); }; lst.append(b); }); };
    q.oninput = paintList; paintList(); showRight();
  } });
}
function libraryPicker(kind, done) {
  dlg({ title: kind === 'image' ? 'Choose a picture' : 'Choose a video or sound file', buttons: [{ label: 'Cancel' }], wide: true, body: box => { const g = el('div', { className: 'hc-grid' }), add = el('button', { textContent: '+ Add a file from this computer…', className: 'hc-mini' });
    const fill = () => { g.textContent = ''; const l = window.SMA.getSources().filter(s => kind === 'image' ? s.kind === 'image' : (s.kind === 'video' || s.kind === 'audio')); if (!l.length) g.textContent = 'Nothing in Sources yet.';
      l.forEach(s => { const b = el('button', { className: 'hc-tile', title: s.name }); if (s.kind === 'image') b.append(el('img', { src: URL.createObjectURL(s.blob) })); else b.append(el('div', { className: 'hc-ico', textContent: s.kind === 'video' ? '▶' : '♪' })); b.append(el('small', { textContent: s.name })); b.onclick = () => { document.getElementById('hcdlg')?.remove(); done(s); }; g.append(b); }); };
    add.onclick = () => { const f = $('#file'); f.accept = kind === 'image' ? 'image/*' : 'video/*,audio/*'; f.multiple = true; f.value = ''; f.onchange = async () => { await window.SMA.addFiles([...f.files]); f.multiple = false; fill(); }; f.click(); };
    box.append(add, g); fill(); } });
}
function commitAdd(t, x) {
  const name = x.name();
  if (t.id === 'camera') addItem({ kind: 'camera', name, device: x.device() });
  else if (t.id === 'screen') addItem({ kind: 'screen', name, sourceId: x.src.id });
  else if (t.id === 'mic' || t.id === 'sys') { const a = { id: uid(), name, device: x.device(), vol: 1, mute: false }; st.audio.push(a); save(); mixer(); if (status.live) openInput(a); }
  else if (t.id === 'image') { const s = x.src, u = URL.createObjectURL(s.blob), im = new Image(); im.onload = () => { const it = addItem({ kind: 'image', name, src: s.id }); fitItem(it, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(u); }; im.src = u; }
  else if (t.id === 'media') { const it = addItem({ kind: 'media', name, src: x.src.id, loop: true, vol: 1 }); const tm = setInterval(() => { const r = rt.get(it.id); if (r && r.el && r.el.videoWidth) { fitItem(it, r.el.videoWidth, r.el.videoHeight); clearInterval(tm); } else if (r && r.err) clearInterval(tm); }, 200); }
  else if (t.id === 'text') addItem({ kind: 'text', name, text: x.text(), size: Math.round(canvas.height / 10), color: '#ffffff', font: 'Arial', bold: true, stroke: true, x: canvas.width * 0.1, y: canvas.height * 0.4 });
  else if (t.id === 'color') addItem({ kind: 'color', name, color: x.color(), x: 0, y: 0, w: canvas.width, h: canvas.height });
}

// ---------- scenes, sources, mixer docks ----------
function scenesList() {
  const box = $('#lv-scenes'); box.textContent = ''; $('#hc-coll').firstChild.textContent = colo().name + ' ';
  colo().scenes.forEach((s, i) => {
    const row = el('div', { className: 'hc-scene' + (i === colo().cur ? ' on' : '') }); const nm = el('span', { className: 'hc-nm', textContent: s.name, title: 'Click to show. Double-click to rename.' });
    if ((status.live || st.studio) && progScene() === s) row.append(el('span', { className: 'hc-badge', textContent: 'LIVE' }));
    row.onclick = () => { if (colo().cur === i) { if (st.studio && progId !== s.id) switchProgram(s.id); return; } colo().cur = i; colo().sel = null; if (!st.studio) switchProgram(s.id); save(); render(); };
    nm.ondblclick = ev => { ev.stopPropagation(); if (st.studio) { switchProgram(s.id); save(); scenesList(); return; } renameInline(nm, s.name, v => { s.name = v; save(); scenesList(); }); };
    row.oncontextmenu = ev => { ev.preventDefault(); colo().cur = i; scenesList(); SMA_CTX.show(ev.clientX, ev.clientY, sceneMenu()); }; row.append(nm); box.append(row);
  });
}
function sceneMenu() {
  const c = colo(), i = c.cur, s = scene();
  return [...(st.studio ? [{ label: 'Send to the program (go live with this scene)', fn: () => { switchProgram(s.id); save(); scenesList(); } }, 'sep'] : []), { label: 'Rename', fn: () => { const n = [...$('#lv-scenes').children][i]; if (n) renameInline(n.querySelector('.hc-nm'), s.name, v => { s.name = v; save(); scenesList(); }); } },
    { label: 'Duplicate', fn: () => { const d = JSON.parse(JSON.stringify(s)); d.id = uid(); d.name = s.name + ' copy'; d.items.forEach(it => { it.id = uid(); }); c.scenes.splice(i + 1, 0, d); c.cur = i + 1; save(); render(); } },
    { label: 'Move up', disabled: i === 0, fn: () => { [c.scenes[i - 1], c.scenes[i]] = [c.scenes[i], c.scenes[i - 1]]; c.cur = i - 1; save(); scenesList(); } },
    { label: 'Move down', disabled: i === c.scenes.length - 1, fn: () => { [c.scenes[i + 1], c.scenes[i]] = [c.scenes[i], c.scenes[i + 1]]; c.cur = i + 1; save(); scenesList(); } }, 'sep',
    { label: 'Remove', danger: true, disabled: c.scenes.length < 2, fn: () => { if (!confirm(`Remove "${s.name}"?`)) return; s.items.forEach(it => dropRuntime(it.id)); c.scenes.splice(i, 1); c.cur = Math.max(0, Math.min(c.cur, c.scenes.length - 1)); progId = st.studio ? progId : null; switchProgram(st.studio && colo().scenes.some(x => x.id === progId) ? progId : scene().id); save(); render(); } }];
}
const KINDICON = { screen: 'screen', camera: 'cam', image: 'img', media: 'media', text: 'text', color: 'color' };
function itemMenu(it) {
  const its = scene().items, i = its.indexOf(it);
  return [{ label: 'Properties', fn: () => propsDialog(it) }, { label: 'Filters', fn: () => filtersDialog(it) }, 'sep', { label: 'Rename', fn: () => { const n = [...$('#lv-items').children].find(x => x.dataset.id === it.id); if (n) renameInline(n.querySelector('.hc-nm'), it.name, v => { it.name = v; save(); list(); }); } },
    { label: it.visible === false ? 'Show' : 'Hide', fn: () => { it.visible = it.visible === false; save(); list(); } }, { label: it.lock ? 'Unlock' : 'Lock in place', fn: () => { it.lock = !it.lock; save(); list(); } }, 'sep',
    { label: 'Fit to the picture', fn: () => fitItem(it, it.w || 1, it.h || 1) }, { label: 'Fill the picture', fn: () => fitItem(it, it.w || 1, it.h || 1, true) }, { label: 'Stretch', fn: () => { Object.assign(it, { x: 0, y: 0, w: canvas.width, h: canvas.height }); save(); } }, 'sep',
    { label: 'Move up', disabled: i === its.length - 1, fn: () => { [its[i], its[i + 1]] = [its[i + 1], its[i]]; save(); list(); } }, { label: 'Move down', disabled: i === 0, fn: () => { [its[i], its[i - 1]] = [its[i - 1], its[i]]; save(); list(); } }, 'sep', { label: 'Remove', danger: true, fn: () => removeItem(it.id) }];
}
function list() {
  const box = $('#lv-items'); box.textContent = ''; const its = scene().items, sel = colo().sel && item(colo().sel);
  $('#hc-srclabel').textContent = sel ? sel.name : 'No source selected'; $('#hc-props').disabled = $('#hc-filters').disabled = !sel;
  if (!its.length) box.append(el('p', { className: 'hc-empty', textContent: 'No sources have been applied for this scene.\nPlease click on the add sources button above.' }));
  [...its].reverse().forEach(it => {
    const row = el('div', { className: 'hc-src2' + (it.id === colo().sel ? ' on' : '') + (it.visible === false ? ' hid' : '') }); row.dataset.id = it.id;
    const ic = el('span', { className: 'hc-sic', innerHTML: ICON[KINDICON[it.kind]] || '' }); const nm = el('span', { className: 'hc-nm', textContent: it.name }); nm.ondblclick = ev => { ev.stopPropagation(); renameInline(nm, it.name, v => { it.name = v; save(); list(); }); };
    const eye = el('button', { className: 'hc-ib', textContent: it.visible === false ? '◌' : '●', title: it.visible === false ? 'Show' : 'Hide' }); eye.onclick = ev => { ev.stopPropagation(); it.visible = it.visible === false; save(); list(); };
    row.append(ic, nm, ...(it.lock ? [el('span', { className: 'hc-lock', textContent: '🔒' })] : []), eye); row.onclick = () => { colo().sel = it.id; list(); };
    row.oncontextmenu = ev => { ev.preventDefault(); colo().sel = it.id; list(); SMA_CTX.show(ev.clientX, ev.clientY, itemMenu(it)); }; box.append(row);
  });
}
function removeItem(id) { dropRuntime(id); scene().items = scene().items.filter(i => i.id !== id); if (colo().sel === id) colo().sel = null; save(); list(); }
function addItem(o) { const it = Object.assign({ id: uid(), visible: true, x: 0, y: 0, w: 0, h: 0 }, o); scene().items.push(it); colo().sel = it.id; save(); list(); runtime(it); return it; }
function render() { sizeCanvas(false); if (!progId) progId = scene().id; scenesList(); list(); mixer(); layout(); chbar(); sidebar(); bottom(); }
function layout() {
  document.querySelectorAll('.hc-dock').forEach(d => { const k = d.id.replace('hc-', ''); d.hidden = st.docks[k] === false; }); $('#hc-docks').classList.toggle('none', !Object.values(st.docks).some(Boolean));
  $('#hc-pvbox').classList.toggle('on', !!st.studio); $('#hc-pvbox .hc-lbl').hidden = $('#hc-pgbox .hc-lbl').hidden = !st.studio; $('#hc-preview').classList.toggle('studio', !!st.studio);
}
$('#hc-addscene').onclick = () => { const c = colo(); c.scenes.push({ id: uid(), name: 'Scene ' + (c.scenes.length + 1), items: [] }); c.cur = c.scenes.length - 1; c.sel = null; if (!st.studio) switchProgram(scene().id); save(); render(); };
$('#hc-scmore').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom + 2, sceneMenu()); };
$('#hc-trans').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom + 2, [{ label: (st.trans.type === 'cut' ? '✓ ' : '') + 'Cut', fn: () => { st.trans.type = 'cut'; save(); } }, { label: (st.trans.type === 'fade' ? '✓ ' : '') + 'Fade', fn: () => { st.trans.type = 'fade'; save(); } }, 'sep', ...[200, 300, 500, 1000].map(ms => ({ label: (st.trans.ms === ms ? '✓ ' : '') + ms + ' ms', fn: () => { st.trans.ms = ms; save(); } }))]); };
$('#hc-coll').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom + 2, [...st.cols.map((c, i) => ({ label: (i === st.col ? '✓ ' : '') + c.name, fn: () => { st.col = i; progId = null; save(); render(); } })), 'sep', { label: 'New collection…', fn: newCollection }]); };
function newCollection() { const c = { id: uid(), name: 'Collection ' + (st.cols.length + 1), scenes: [{ id: uid(), name: 'Scene 1', items: [] }], cur: 0, sel: null }; st.cols.push(c); st.col = st.cols.length - 1; progId = null; save(); render(); }
$('#hc-addsrc').onclick = addDialog;
$('#hc-srcmore').onclick = ev => { const it = colo().sel && item(colo().sel), r = ev.currentTarget.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom + 2, it ? itemMenu(it) : [{ label: 'Add a source…', fn: addDialog }]); };
$('#hc-props').onclick = () => { const it = colo().sel && item(colo().sel); if (it) propsDialog(it); };
$('#hc-filters').onclick = () => { const it = colo().sel && item(colo().sel); if (it) filtersDialog(it); };
$('#hc-muteall').onclick = () => { allMuted = !allMuted; st.audio.forEach(a => { a.mute = allMuted; const i = inputs.get(a.id); if (i) i.gain.gain.value = allMuted ? 0 : a.vol; }); $('#hc-muteall').innerHTML = allMuted ? ICON.speakerOff : ICON.speaker; save(); mixer(); };
$('#hc-mixset').onclick = () => settingsDialog('Audio');
$('#hc-mixmore').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom + 2, [{ label: 'Add an audio input…', fn: addDialog }, { label: 'Remove the last audio input', disabled: st.audio.length < 1, fn: () => { const a = st.audio.pop(); if (a) closeInput(a.id); save(); mixer(); } }]); };

// ---------- menu bar ----------
const MENUS = ['Settings', 'Scene Collection', 'Edit Source', 'View', 'Docks', 'Profile', 'Tools', 'Help'];
function menus(name) {
  const it = colo().sel && item(colo().sel), c = colo();
  if (name === 'Settings') return [{ label: 'Open settings…', fn: () => settingsDialog('General') }];
  if (name === 'Scene Collection') return [...st.cols.map((x, i) => ({ label: (i === st.col ? '✓ ' : '') + x.name, fn: () => { st.col = i; progId = null; save(); render(); } })), 'sep', { label: 'New…', fn: newCollection },
    { label: 'Rename…', fn: () => { const n = $('#hc-coll'), inp = el('input', { value: c.name, className: 'hc-rn' }); n.replaceWith(inp); inp.focus(); inp.select(); let done = false; const fin = ok => { if (done) return; done = true; if (ok && inp.value.trim()) c.name = inp.value.trim(); save(); inp.replaceWith(n); scenesList(); }; inp.onkeydown = e => { if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); e.stopPropagation(); }; inp.onblur = () => fin(true); } },
    { label: 'Duplicate', fn: () => { const d = JSON.parse(JSON.stringify(c)); d.id = uid(); d.name = c.name + ' copy'; d.scenes.forEach(s => { s.id = uid(); s.items.forEach(i => { i.id = uid(); }); }); st.cols.push(d); st.col = st.cols.length - 1; progId = null; save(); render(); } },
    { label: 'Remove', danger: true, disabled: st.cols.length < 2, fn: () => { if (!confirm(`Remove the collection "${c.name}"?`)) return; c.scenes.forEach(s => s.items.forEach(i => dropRuntime(i.id))); st.cols.splice(st.col, 1); st.col = 0; progId = null; save(); render(); } }];
  if (name === 'Edit Source') return it ? itemMenu(it) : [{ label: 'No source selected', disabled: true, fn: () => {} }, { label: 'Add a source…', fn: addDialog }];
  if (name === 'View') return [{ label: (st.chbar ? '✓ ' : '') + 'Channel bar', fn: () => { st.chbar = !st.chbar; save(); chbar(); } }, { label: (st.studio ? '✓ ' : '') + 'Studio mode', fn: toggleStudio }];
  if (name === 'Docks') return ['scenes', 'sources', 'mixer'].map(k => ({ label: (st.docks[k] !== false ? '✓ ' : '') + ({ scenes: 'Scenes', sources: 'Sources', mixer: 'Audio Mixer' })[k], fn: () => { st.docks[k] = st.docks[k] === false; save(); layout(); } }));
  if (name === 'Profile') return [...Object.keys(st.profiles).map(n => ({ label: 'Load: ' + n, fn: () => { Object.assign(st.set, st.profiles[n]); sizeCanvas(true); loop(); save(); render(); notify('Loaded the profile "' + n + '".'); } })), ...(Object.keys(st.profiles).length ? ['sep'] : []),
    { label: 'Save the current output settings as…', fn: profileSave }, ...Object.keys(st.profiles).map(n => ({ label: 'Delete: ' + n, danger: true, fn: () => { delete st.profiles[n]; save(); } }))];
  if (name === 'Tools') return [{ label: 'Back up settings now', fn: backupNow }, { label: 'Restore settings from a backup…', fn: restoreDialog }, 'sep', { label: 'Stream key storage…', fn: keyInfo }];
  if (name === 'Help') return [{ label: 'How Sudo Make Live works', fn: helpDialog }, { label: 'Mouse and keyboard tips', fn: tipsDialog }];
  return [];
}
function profileSave() { dlg({ title: 'Save profile', buttons: [{ label: 'Save', primary: true, fn: d => { const n = d.content.querySelector('input').value.trim().slice(0, 40); if (!n) return false; st.profiles[n] = { ...st.set }; save(); notify('Saved the profile "' + n + '".'); } }, { label: 'Cancel' }], body: box => box.append(field('Profile name', el('input', { value: 'My profile' }))) }); }
function menubar() { const bar = $('#hc-menubar'); bar.textContent = ''; MENUS.forEach(n => { const b = el('button', { role: 'menuitem' }); b.innerHTML = `<u>${n[0]}</u>${n.slice(1)}`; b.onclick = () => { const r = b.getBoundingClientRect(); SMA_CTX.show(r.left, r.bottom, menus(n)); }; bar.append(b); }); }
const para = (box, list) => list.forEach(t => box.append(el('p', { className: 'hc-hint big', textContent: t })));
function keyInfo() { dlg({ title: 'Stream key storage', buttons: [{ label: 'OK', primary: true }], body: box => para(box, ['Your stream keys are kept inside this app\'s own storage on this computer, encrypted with AES-256-GCM. The key that unlocks them is a separate file that only your user account can read. They are never sent anywhere except to the server you typed in, and they are masked in everything the app shows. Anyone who can read your whole home folder as you can read both files.']) }); }
function helpDialog() { dlg({ title: 'How Sudo Make Live works', buttons: [{ label: 'OK', primary: true }], body: box => para(box, ['Build a scene from sources: screens, cameras, pictures, videos, text and colors. Scenes sit in the Scenes box; Scene Collections keep whole sets apart.', 'Add one or more channels in the bar at the top (any RTMP, SRT or RIST server and your own key). Click a channel to switch it on or off.', 'Go Live encodes the picture once and sends it to every channel that is on, and to a recording if you want one. A channel that fails does not stop the others, and it reconnects by itself.', 'Rec records to a file without streaming. Studio mode lets you set up the next scene before it goes out.', 'There are no accounts, no viewer counts and no suggestions of where to stream. Everything stays on this computer except what you send to your own servers.']) }); }
function tipsDialog() { dlg({ title: 'Mouse and keyboard tips', buttons: [{ label: 'OK', primary: true }], body: box => para(box, ['Click a source in the picture to select it, drag to move it, drag the corner to resize (Shift keeps its shape). Hold Alt to ignore snapping.', 'Double-click a source for its Properties, or a name to rename it. Right-click anything for its menu.', 'The pen in the right column draws on the picture, and the drawing goes out with the stream. Right-click the picture clears it; Esc stops drawing.', 'Escape closes menus and dialogs.']) }); }

// ---------- settings (HopCast's tabbed window) ----------
function settingsDialog(startTab) {
  const S = st.set, tabs = ['General', 'Output', 'Audio', 'Video', 'Recording']; let cur = tabs.includes(startTab) ? startTab : 'General';
  dlg({ wide: true, buttons: [{ label: 'OK', primary: true }], body: box => {
    box.classList.add('hc-set'); const nav = el('div', { className: 'hc-snav' }), page = el('div', { className: 'hc-spage' }); box.append(nav, page);
    const sel = (k, opts) => { const s = el('select'); opts.forEach(([v, n]) => s.add(new Option(n, v))); s.value = S[k]; s.onchange = () => { S[k] = isNaN(+s.value) ? s.value : +s.value; if (k === 'res') sizeCanvas(true); if (k === 'fps') loop(); save(); bottom(); }; return s; };
    const nf = (k, min, max) => { const i = el('input', { type: 'number', value: S[k], min, max }); i.oninput = () => { S[k] = Math.max(min, Math.min(max, +i.value || min)); save(); }; return i; };
    const draw = () => { nav.textContent = ''; tabs.forEach(t => { const b = el('button', { textContent: t, className: t === cur ? 'on' : '' }); b.onclick = () => { cur = t; draw(); }; nav.append(b); }); page.textContent = '';
      if (cur === 'General') { page.append(el('h2', { textContent: 'Source Alignment Snapping' }), check('Enable', st.snap.on, v => { st.snap.on = v; save(); }), field('Snap Sensitivity', (() => { const i = el('input', { type: 'number', value: st.snap.sens, min: 1, max: 50 }); i.oninput = () => { st.snap.sens = +i.value || 10; save(); }; return i; })()), check('Snap Sources to edge of screen', st.snap.edge, v => { st.snap.edge = v; save(); }), check('Snap Sources to other sources', st.snap.other, v => { st.snap.other = v; save(); }), check('Snap Sources to horizontal and vertical center', st.snap.center, v => { st.snap.center = v; save(); }));
        page.append(el('h2', { textContent: 'Output' }), check('Automatically record when streaming', S.alsoRecord, v => { S.alsoRecord = v; save(); })); }
      if (cur === 'Output') page.append(el('h2', { textContent: 'Streaming' }), field('Video Bitrate (kbps)', nf('vbr', 300, 60000)), field('Audio Bitrate (kbps)', nf('abr', 32, 512)), field('Encoder', sel('encoder', [['x264', 'x264 (software)'], ...(info.nvenc ? [['nvenc', 'NVIDIA NVENC']] : [])])), field('x264 speed', sel('preset', [['ultrafast', 'Fastest'], ['superfast', 'Very fast'], ['veryfast', 'Fast (default)'], ['faster', 'Balanced'], ['fast', 'Better quality']])),
        el('p', { className: 'hc-hint', textContent: 'The picture is encoded once and shared by every channel, so more channels do not add CPU load, only upload. Sending over ' + info.protocols.map(x => x.toUpperCase()).join(', ') + ' (FFmpeg: ' + (info.ffmpeg || '?') + ').' }));
      if (cur === 'Audio') { page.append(el('h2', { textContent: 'Audio inputs' })); st.audio.forEach(a => { const s = el('select'); s.add(new Option(a.device ? 'Chosen input' : 'Default', a.device || '')); s.value = a.device || ''; s.onfocus = async () => { const ds = await audioDevices(); s.textContent = ''; s.add(new Option('Default', '')); ds.forEach(x => s.add(new Option(x.label || 'Input', x.deviceId))); s.value = a.device || ''; }; s.onchange = () => { a.device = s.value; save(); if (status.live) openInput(a); }; page.append(field(a.name, s)); }); page.append(el('p', { className: 'hc-hint', textContent: 'Inputs are opened when you go live or record, not before. Add more with + in Sources (Audio Input Capture or Audio Output Capture).' })); }
      if (cur === 'Video') page.append(el('h2', { textContent: 'Video' }), field('Base (Canvas) Resolution', sel('res', Object.keys(RES).map(k => [k, k.replace('x', ' × ') + (RES[k][1] > RES[k][0] ? ' (vertical)' : '')]))), field('Common FPS Values', sel('fps', [[24, '24'], [30, '30'], [60, '60']])), el('p', { className: 'hc-hint', textContent: 'Changes apply the next time you go live. Sources are scaled to the new size.' }));
      if (cur === 'Recording') { const dir = el('button', { textContent: info.recordDir || 'Choose…', className: 'hc-mini' }); dir.onclick = async () => { const p = await api.pickDir(); if (p) { info.recordDir = p; dir.textContent = p; } }; page.append(el('h2', { textContent: 'Recording' }), field('Recording Path', dir), field('Recording Format', sel('recFormat', [['mkv', 'MKV (safe if the app closes)'], ['mp4', 'MP4']])), check('Automatically record when streaming', S.alsoRecord, v => { S.alsoRecord = v; save(); })); } };
    draw(); } });
}
// ---------- backups of settings (HopCast keeps snapshots too) ----------
async function backupNow() { try { const r = await api.backup(JSON.stringify(st, (k, v) => (k[0] === '_' ? undefined : v))); notify('Settings backed up (' + r.name + ').'); } catch (e) { notify(clean(e)); } }
async function restoreDialog() {
  let list; try { list = await api.backups(); } catch (e) { notify(clean(e)); return; }
  dlg({ title: 'Restore settings from a backup', buttons: [{ label: 'Cancel' }], body: box => { if (!list.length) para(box, ['No backups yet. Use Tools > Back up settings now.']);
    list.forEach(b => { const r = el('button', { className: 'hc-src', textContent: b.name }); r.onclick = async () => { if (!confirm('Replace your scenes, settings and channels with this backup?')) return; const j = await api.restore(b.name); if (j) { try { st = Object.assign(st, JSON.parse(j)); } catch (e) {} api.channels().then(c => { channels = c; chbar(); }); save(); document.getElementById('hcdlg')?.remove(); sizeCanvas(false); progId = null; render(); notify('Settings restored.'); } }; box.append(r); }); } });
}

// ---------- right-hand tool column ----------
function toggleStudio() { st.studio = !st.studio; if (st.studio) progId = scene().id; else switchProgram(scene().id); save(); render(); }
function sidebar() {
  const bar = $('#hc-side'); bar.textContent = '';
  const btn = (icon, title, on, fn, badge) => { const b = el('button', { innerHTML: ICON[icon], title, className: 'hc-tool' + (on ? ' on' : '') }); b.setAttribute('aria-label', title); if (badge) b.append(el('i', { className: 'hc-badge2', textContent: String(badge) })); b.onclick = fn; bar.append(b); return b; };
  btn('studio', 'Studio mode: set up the next scene before it goes out', st.studio, toggleStudio);
  btn('music', 'Music: play files from Sources into the mix', music.el && !music.el.paused, () => musicDialog());
  btn('pen', 'Draw on the picture (Esc stops, right-click clears)', pen.on, () => { pen.on = !pen.on; if (pen.on) colo().sel = null; sidebar(); list(); if (pen.on) flash('Drawing is on. Drag on the picture. Esc stops; right-click clears.'); });
  if (window.sma.pinpoint) btn('camera', 'Sudo Take Screenshot: freeze the screen and point at a picture', false, pinpointShot);
  bar.append(el('span', { className: 'hc-sp' })); btn('gear', 'Settings', false, () => settingsDialog('General')); bar.append(el('span', { className: 'hc-grow' }));
  btn('bell', 'Notifications', false, notifDialog, unread);
}
function notifDialog() { unread = 0; sidebar(); dlg({ title: 'Notifications', buttons: [{ label: 'OK', primary: true }], body: box => { if (!notices.length) para(box, ['Nothing new.']); notices.forEach(n => box.append(el('p', { className: 'hc-hint big', textContent: new Date(n.at).toLocaleTimeString() + '   ' + n.t }))); } }); }
function musicDialog() {
  dlg({ title: 'Music', buttons: [{ label: 'Close', primary: true }], wide: true, body: box => { const lib = window.SMA.getSources().filter(s => s.kind === 'audio'), g = el('div', { className: 'hc-col' });
    box.append(el('p', { className: 'hc-hint', textContent: 'Pick sound files from your Sources library. They play one after another into the Audio Mixer (so into the stream and the recording).' }));
    if (!lib.length) g.append(el('p', { className: 'hc-hint', textContent: 'No sound files in Sources yet.' })); lib.forEach(s => { g.append(check(s.name, st.music.files.includes(s.id), v => { st.music.files = v ? [...st.music.files, s.id] : st.music.files.filter(x => x !== s.id); save(); })); });
    const bar = el('div', { className: 'hc-inl' }); const play = el('button', { textContent: music.el && !music.el.paused ? 'Stop' : 'Play', className: 'hc-mini' }); play.onclick = () => { if (music.el && !music.el.paused) stopMusic(); else playMusic(0); document.getElementById('hcdlg')?.remove(); }; const next = el('button', { textContent: 'Next', className: 'hc-mini' }); next.onclick = () => playMusic(st.music.i + 1); bar.append(play, next);
    const add = el('button', { textContent: '+ Add sound files…', className: 'hc-mini' }); add.onclick = () => { const f = $('#file'); f.accept = 'audio/*'; f.multiple = true; f.value = ''; f.onchange = async () => { await window.SMA.addFiles([...f.files]); f.multiple = false; musicDialog(); }; f.click(); };
    box.append(add, g, bar); } });
}
async function pinpointShot() {
  try { const r = await window.sma.pinpoint.start(); if (!r || !r.dataUrl) return; const blob = await (await fetch(r.dataUrl)).blob(), f = new File([blob], r.name || 'Screenshot.png', { type: 'image/png' }); await window.SMA.addFiles([f]);
    const s = window.SMA.getSources().find(x => x.name === f.name && x.blob && x.blob.size === blob.size) || window.SMA.getSources().slice(-1)[0]; if (s) { const im = new Image(); im.onload = () => { const it = addItem({ kind: 'image', name: 'Screenshot', src: s.id }); fitItem(it, im.naturalWidth, im.naturalHeight); }; im.src = r.dataUrl; } notify('Screenshot saved' + (r.path ? ': ' + r.path : '') + ' and added as a source.'); } catch (e) { notify(clean(e)); }
}

// ---------- bottom bar: output info, CPU, LIVE timer, Go Live, Rec ----------
function bottom() { $('#hc-res').innerHTML = `<b>${st.set.res}</b> · <b>${st.set.fps}fps</b>`; }
$('#hc-resgear').onclick = () => settingsDialog('Video');
let cpu = 0; setInterval(async () => { if (!document.body.classList.contains('live-mode') && !status.live) return; try { cpu = await api.cpu(); $('#hc-cpu').innerHTML = `CPU ${cpu.toFixed(1)}% <i>${ICON.chev}</i>`; } catch (e) {} }, 2000);
$('#hc-cpu').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(), s = status.stats || {}; SMA_CTX.show(r.left, r.top - 130, [{ label: 'CPU: ' + cpu.toFixed(1) + '%', disabled: true, fn: () => {} }, { label: 'Frame rate: ' + (status.live ? Math.round(s.fps || 0) : st.set.fps) + ' fps', disabled: true, fn: () => {} }, { label: 'Bitrate: ' + (status.live && s.bitrate ? s.bitrate : '—'), disabled: true, fn: () => {} }, { label: 'Dropped frames: ' + (s.drop || 0), disabled: true, fn: () => {} }]); };
let recorder = null, q = Promise.resolve(), tick = null;
function startRecorder() {
  const stream = canvas.captureStream(st.set.fps); ensureAudio(); mixDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus'].find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(40e6, st.set.vbr * 1000 * 1.6), audioBitsPerSecond: 192000 });
  recorder.ondataavailable = e => { if (e.data && e.data.size) q = q.then(() => e.data.arrayBuffer()).then(b => api.chunk(b)); }; recorder.start(250);
}
function stopRecorder() { if (recorder && recorder.state !== 'inactive') recorder.stop(); recorder = null; }
async function begin() { flash(''); await Promise.all(st.audio.map(a => inputs.has(a.id) ? 0 : openInput(a))); ensureAudio(); await api.start({ ...st.set, w: canvas.width, h: canvas.height }); startRecorder(); }
function yesNo(text, yes) { dlg({ buttons: [{ label: 'Yes', fn: yes }, { label: 'No' }], body: box => box.append(el('p', { className: 'hc-hint big center', textContent: text })) }); }
async function goLive(force) {
  try {
    if (status.live) { await end(); return; }
    const on = channels.filter(c => c.enabled); if (!on.length && !st.set.alsoRecord) { flash('Switch on a channel first (click it in the bar at the top, or add one), or press Rec.'); if (!channels.length) channelDialog(); return; }
    if (force !== true && !progScene().items.some(i => ['screen', 'camera', 'image', 'media', 'color'].includes(i.kind) && i.visible !== false)) { yesNo('It looks like you haven\'t added any video sources yet, so you will only be outputting a blank screen.\nAre you sure you want to do this?\n\nYou can add sources by clicking the + icon in the Sources box at any time.', () => goLive(true)); return; }
    await begin(); for (const c of on) { try { await api.destStart(c.id); } catch (e) { notify(clean(e)); } } if (st.set.alsoRecord) await api.recordStart(st.set.recFormat);
  } catch (e) { notify(clean(e)); stopRecorder(); }
}
async function recToggle() {
  try {
    const has = status.dests && status.dests.find(d => d.id === 'record');
    if (has) { await api.recordStop(); if (!status.dests.some(d => d.kind === 'channel')) await end(); return; }
    if (!status.live) await begin(); await api.recordStart(st.set.recFormat);
  } catch (e) { notify(clean(e)); }
}
async function end() { stopRecorder(); await new Promise(r => setTimeout(r, 450)); await q.catch(() => {}); await api.stop(); st.audio.forEach(a => closeInput(a.id)); mixer(); }
$('#lv-go').onclick = () => goLive(); $('#lv-rec').onclick = recToggle;
const fmtT = ms => { const s = Math.floor(ms / 1000), p = n => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`; };
const told = new Set();
api.onStatus(s => {
  const was = status.live; status = s || { live: false };
  if (was && !status.live) { stopRecorder(); if (status.error) notify('Stopped: ' + status.error); }
  (status.dests || []).forEach(d => { const k = d.id + d.state + d.error; if ((d.state === 'failed' || (d.state === 'retrying' && d.error)) && d.error && !told.has(k)) { told.add(k); notify((d.kind === 'record' ? 'Recording' : d.name) + ': ' + d.error); } });
  const rec = status.dests && status.dests.find(d => d.id === 'record');
  $('#lv-go').textContent = status.live ? 'Stop' : 'Go Live'; $('#lv-go').classList.toggle('live', !!status.live); $('#lv-rec').textContent = rec ? 'Stop Rec' : 'Rec'; $('#lv-rec').classList.toggle('on', !!rec); $('#hc-live').classList.toggle('on', !!status.live);
  clearInterval(tick); if (status.live) tick = setInterval(() => { $('#hc-time').textContent = fmtT(Date.now() - status.since); }, 500); else $('#hc-time').textContent = '00:00:00';
  chbar(); scenesList();
});
document.addEventListener('keydown', ev => { if (!document.body.classList.contains('live-mode')) return; if (ev.key === 'Escape' && pen.on) { pen.on = false; sidebar(); } });
document.addEventListener('sma-mode', ev => {
  if (ev.detail === 'live') { render(); loop(); dailyBackup(); }
  else if (!status.live) { clearInterval(timer); [...rt.keys()].forEach(dropRuntime); } // leaving without streaming: let go of the screen and camera
});
async function dailyBackup() { try { const last = +localStorage.getItem('sma-live-backup') || 0; if (Date.now() - last > 864e5) { await api.backup(JSON.stringify(st, (k, v) => (k[0] === '_' ? undefined : v))); localStorage.setItem('sma-live-backup', String(Date.now())); } } catch (e) {} }
window.SMA_live = { state: () => st, status: () => status, channels: () => channels, addItem, runtime: () => rt };
icons(); menubar(); bottom(); render();
})();
