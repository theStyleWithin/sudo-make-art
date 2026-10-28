// Offline video editor: timeline with video/image, audio and text lanes.
// Preview draws to a canvas; export records that canvas plus the mixed audio (WebM). On desktop, WebM can be converted to MP4.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const SMA = window.SMA;
if (!SMA) return;

const SIZES = [['Landscape 1920×1080', 1920, 1080], ['YouTube / TikTok / Reels / Shorts 1080×1920', 1080, 1920], ['Square 1080×1080', 1080, 1080], ['Landscape 1280×720', 1280, 720]];
const FONTS = ['Arial', 'Georgia', 'Impact', 'Verdana', 'Courier New', 'Trebuchet MS'];
const LANE = { video: 'video', image: 'video', audio: 'audio', text: 'text', overlay: 'overlay' };

let project = { w: 1080, h: 1920, clips: [] };
let sel = null, t = 0, playing = false, t0 = 0, w0 = 0, pps = 60, undoS = [], redoS = [];
let replacing = null; // clip id waiting for a new visual source from the media bin
let exporting = false, recorder = null, chunks = [];
const media = new Map();   // clip id -> { el, url, gain }
const meta = new Map();    // source id -> { duration, w, h }
const canvas = $('#v-canvas'), ctx = canvas.getContext('2d');

// ---------- helpers ----------
const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const src = id => SMA.getSources().find(s => s.id === id);
const endTime = () => project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
const find = id => project.clips.find(c => c.id === id);
const hasMedia = c => c.kind === 'video' || c.kind === 'audio';

const spd = c => c.speed || 1;
const fadeAt = (c, x) => { let f = 1; if (c.fadeIn > 0) f = Math.min(f, (x - c.start) / c.fadeIn); if (c.fadeOut > 0) f = Math.min(f, (c.start + c.dur - x) / c.fadeOut); return Math.max(0, Math.min(1, f)); };
const TRANS = [['fade', 'Cross-fade'], ['dip', 'Dip to black'], ['wipe-right', 'Wipe right'], ['wipe-left', 'Wipe left'], ['wipe-down', 'Wipe down'], ['wipe-up', 'Wipe up'],
  ['slide-left', 'Slide from right'], ['slide-right', 'Slide from left'], ['slide-up', 'Slide from bottom'], ['slide-down', 'Slide from top'], ['zoom', 'Zoom in']];
const ease = p => p * p * (3 - 2 * p), clamp01 = x => Math.max(0, Math.min(1, x));
const inTrans = (c, x) => (c.trans && x >= c.start && x < c.start + c.trans.dur) ? (x - c.start) / c.trans.dur : null;       // progress 0..1 while c is coming in
const outTrans = (c, x) => { // progress of a transition that is replacing c (the clip starting on top of it)
  for (const b of project.clips) if (b !== c && b.trans && LANE[b.kind] === 'video' && b.start > c.start && b.start < c.start + c.dur + 1e-6 && x >= b.start && x < b.start + b.trans.dur) return { p: (x - b.start) / b.trans.dur, type: b.trans.type };
  return null;
};
const prevOf = b => project.clips.filter(c => c !== b && LANE[c.kind] === 'video' && c.start < b.start && c.start + c.dur >= b.start - 0.06)
  .sort((a, z) => (z.start + z.dur) - (a.start + a.dur))[0];
function setTransition(b, type, dur) { // keeps the outgoing clip ending exactly when the transition ends
  if (!type) { delete b.trans; return; }
  const d = Math.max(0.1, Math.min(+dur || 1, b.dur)); b.trans = { type, dur: d };
  const a = prevOf(b); if (a) a.dur = Math.max(0.1, b.start + d - a.start);
}
let cancelFlag = false;
function banner(text, cancellable) { $('#v-banner-t').textContent = text || ''; $('#v-banner-x').hidden = !cancellable; $('#v-banner').hidden = !text; }
function save() { try { localStorage.setItem('sma-video', JSON.stringify(project)); } catch (e) {} }
function commit() { undoS.push(JSON.stringify(project)); if (undoS.length > 100) undoS.shift(); redoS = []; document.dispatchEvent(new Event('sma-edit')); }
function restore(j) { project = JSON.parse(j); if (sel && !find(sel)) sel = null; sizeCanvas(); refreshAll(); }

function probe(id) { // read duration/dimensions once per source
  if (meta.has(id)) return Promise.resolve(meta.get(id));
  const s = src(id); if (!s) return Promise.resolve({ duration: 5, w: 0, h: 0 });
  return new Promise(res => {
    const u = URL.createObjectURL(s.blob);
    const done = m => { URL.revokeObjectURL(u); meta.set(id, m); res(m); };
    if (s.kind === 'image') { const i = new Image(); i.onload = () => done({ duration: 5, w: i.width, h: i.height }); i.onerror = () => done({ duration: 5, w: 0, h: 0 }); i.src = u; return; }
    const el = document.createElement(s.kind === 'audio' ? 'audio' : 'video'); el.preload = 'metadata';
    el.onloadedmetadata = () => done({ duration: isFinite(el.duration) ? el.duration : 5, w: el.videoWidth || 0, h: el.videoHeight || 0 });
    el.onerror = () => done({ duration: 5, w: 0, h: 0 }); el.src = u;
  });
}

// ---------- media elements + audio graph ----------
let actx = null, master = null, speaker = null, exportDest = null;
function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); speaker = actx.createGain(); exportDest = actx.createMediaStreamDestination();
  master.connect(speaker); speaker.connect(actx.destination); master.connect(exportDest);
  media.forEach(wire);
}
function wire(m) { // connect an element to the graph once the audio context exists
  if (!actx || m.gain) return;
  try { const node = actx.createMediaElementSource(m.el); m.gain = actx.createGain(); node.connect(m.gain); m.gain.connect(master); } catch (e) {}
}
function mediaFor(c) {
  let m = media.get(c.id); if (m) return m;
  const s = src(c.src); if (!s) return null;
  if (c.kind === 'image' || c.kind === 'overlay') { const el = new Image(); const url = URL.createObjectURL(s.blob); el.onload = () => { if (!playing) draw(); }; el.src = url; m = { el, url }; }
  else { const el = document.createElement(c.kind === 'audio' ? 'audio' : 'video'); const url = URL.createObjectURL(s.blob);
    el.src = url; el.preload = 'auto'; el.playsInline = true; el.onseeked = el.onloadeddata = () => { if (!playing) draw(); };
    m = { el, url }; wire(m); }
  media.set(c.id, m); return m;
}
function transGain(c, x = t) {
  if (c.kind !== 'video') return 1; let g = 1;
  const pin = inTrans(c, x); if (pin !== null) g *= ease(pin);
  const o = outTrans(c, x); if (o) g *= 1 - ease(o.p);
  return g;
}
function applyVolume(c) { const m = media.get(c.id); if (m?.gain) m.gain.gain.value = c.mute ? 0 : (c.vol ?? 1) * fadeAt(c, t) * transGain(c); }

// ---------- rendering ----------
function sizeCanvas() { canvas.width = project.w; canvas.height = project.h; const st = $('#v-stage'); const s = Math.min((st.clientWidth - 20) / project.w, (st.clientHeight - 20) / project.h, 1); canvas.style.width = project.w * s + 'px'; canvas.style.height = project.h * s + 'px'; }
function drawFit(el, w, h, fit, g, c) {
  if (!w || !h) return; const r = fit === 'cover' ? Math.max(project.w / w, project.h / h) : Math.min(project.w / w, project.h / h);
  const ox = (project.w - w * r) / 2, oy = (project.h - h * r) / 2; if (c) c._map = { ox, oy, r, w, h }; // remembered so a marked box can be mapped back to the source frame
  g.drawImage(el, ox, oy, w * r, h * r);
}
// Fill a box by interpolating between the pixels just outside it (the same idea as FFmpeg's delogo). Cheap enough to run every frame.
function delogo(g, c, r) {
  const m = c._map; if (!m) return;
  let x0 = Math.round(m.ox + r.x * m.w * m.r), y0 = Math.round(m.oy + r.y * m.h * m.r), W = Math.round(r.w * m.w * m.r), H = Math.round(r.h * m.h * m.r);
  if (x0 < 1) { W += x0 - 1; x0 = 1; } if (y0 < 1) { H += y0 - 1; y0 = 1; } W = Math.min(W, project.w - 1 - x0); H = Math.min(H, project.h - 1 - y0);
  if (W < 1 || H < 1) return;
  const img = g.getImageData(x0 - 1, y0 - 1, W + 2, H + 2), d = img.data, S = W + 2, at = (x, y) => (y * S + x) * 4;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const dx = Math.min(i + 1, W - i), dy = Math.min(j + 1, H - j), o = at(i + 1, j + 1);
    const L = at(0, j + 1), R = at(W + 1, j + 1), T = at(i + 1, 0), B = at(i + 1, H + 1), fx = (i + 1) / (W + 1), fy = (j + 1) / (H + 1);
    for (let k = 0; k < 3; k++) { const hx = d[L + k] + (d[R + k] - d[L + k]) * fx, vy = d[T + k] + (d[B + k] - d[T + k]) * fy; d[o + k] = (hx * dy + vy * dx) / (dx + dy); }
    d[o + 3] = 255;
  }
  g.putImageData(img, x0 - 1, y0 - 1);
}
const tmp = document.createElement('canvas'), tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
function drawBody(c) {
  const F = window.SMA_FILTERS, filt = c.fl ? F.css(c.fl, project.w / 1000) : 'none';
  if (c.wm && c.wm.length) { // draw to a scratch canvas, remove the marked boxes, then place it with the clip's filter
    if (tmp.width !== project.w || tmp.height !== project.h) { tmp.width = project.w; tmp.height = project.h; }
    tmpCtx.clearRect(0, 0, tmp.width, tmp.height); drawBody2(c, tmpCtx); c.wm.forEach(r => delogo(tmpCtx, c, regionAt(r, c, t)));
    ctx.filter = filt; ctx.drawImage(tmp, 0, 0); ctx.filter = 'none';
  } else { ctx.filter = filt; drawBody2(c, ctx); ctx.filter = 'none'; }
}
let exportFrames = null; // clip id -> decoded frame, only while a fast export is running
function drawBody2(c, g) {
  const fb = exportFrames && exportFrames.get(c.id);
  if (fb) drawFit(fb, fb.width, fb.height, c.fit, g, c);
  else if (c.kind === 'video') { const m = mediaFor(c); if (m && m.el.readyState >= 2) drawFit(m.el, m.el.videoWidth, m.el.videoHeight, c.fit, g, c); }
  else if (c.kind === 'image') { const m = mediaFor(c); if (m && m.el.complete) drawFit(m.el, m.el.naturalWidth, m.el.naturalHeight, c.fit, g, c); }
}
function drawIncoming(c, p) { // the clip that is arriving, shaped by its transition
  const w = project.w, h = project.h, e = ease(p); ctx.save();
  switch (c.trans.type) {
    case 'fade': ctx.globalAlpha *= p; break;
    case 'dip': ctx.globalAlpha *= clamp01((p - 0.5) * 2); break;
    case 'wipe-right': ctx.beginPath(); ctx.rect(0, 0, w * e, h); ctx.clip(); break;
    case 'wipe-left': ctx.beginPath(); ctx.rect(w * (1 - e), 0, w * e, h); ctx.clip(); break;
    case 'wipe-down': ctx.beginPath(); ctx.rect(0, 0, w, h * e); ctx.clip(); break;
    case 'wipe-up': ctx.beginPath(); ctx.rect(0, h * (1 - e), w, h * e); ctx.clip(); break;
    case 'slide-left': ctx.translate(w * (1 - e), 0); break;
    case 'slide-right': ctx.translate(-w * (1 - e), 0); break;
    case 'slide-up': ctx.translate(0, h * (1 - e)); break;
    case 'slide-down': ctx.translate(0, -h * (1 - e)); break;
    case 'zoom': ctx.globalAlpha *= p; ctx.translate(w / 2, h / 2); ctx.scale(1 + 0.4 * (1 - e), 1 + 0.4 * (1 - e)); ctx.translate(-w / 2, -h / 2); break;
  }
  drawBody(c); ctx.restore();
}
function draw() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, project.w, project.h);
  const active = c => t >= c.start - 1e-6 && t < c.start + c.dur;
  const vids = project.clips.filter(c => LANE[c.kind] === 'video' && active(c)).sort((a, b) => a.start - b.start); // later cuts sit on top
  for (const c of vids) {
    let a = fadeAt(c, t); const out = outTrans(c, t); if (out && out.type === 'dip') a *= 1 - clamp01(out.p * 2); // outgoing half of a dip to black
    ctx.globalAlpha = a; const p = inTrans(c, t);
    if (p !== null) drawIncoming(c, p); else drawBody(c);
    ctx.globalAlpha = 1;
  }
  for (const c of project.clips) if (c.kind === 'overlay' && active(c)) drawOverlay(c);
  for (const c of project.clips) if (c.kind === 'text' && active(c)) { ctx.globalAlpha = fadeAt(c, t); drawText(c); ctx.globalAlpha = 1; }
}
function drawOverlay(c) { // an image placed on top of the video: move, resize, rotate, fade (e.g. your own watermark or logo)
  const m = mediaFor(c); if (!m || !m.el.complete || !m.el.naturalWidth) return;
  const w = c.scale * project.w, h = w * m.el.naturalHeight / m.el.naturalWidth, cx = c.x * project.w, cy = c.y * project.h;
  ctx.save(); ctx.globalAlpha = (c.opacity ?? 1) * fadeAt(c, t); ctx.translate(cx, cy); ctx.rotate((c.rot || 0) * Math.PI / 180); ctx.drawImage(m.el, -w / 2, -h / 2, w, h); ctx.restore();
  c._box = [cx - w / 2, cy - h / 2, w, h];
}
function drawText(c) {
  ctx.save(); ctx.font = `${c.italic ? 'italic ' : ''}${c.bold ? 700 : 400} ${c.size}px "${c.font}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = c.text.split('\n'), lh = c.size * 1.2, cx = c.x * project.w, cy = c.y * project.h, top = cy - (lines.length - 1) * lh / 2;
  let wmax = 0; lines.forEach((l, i) => {
    const y = top + i * lh; wmax = Math.max(wmax, ctx.measureText(l).width);
    if (c.sw) { ctx.lineWidth = c.sw * 2; ctx.strokeStyle = c.stroke; ctx.lineJoin = 'round'; ctx.strokeText(l, cx, y); }
    ctx.fillStyle = c.color; ctx.fillText(l, cx, y);
  });
  c._box = [cx - wmax / 2, cy - lines.length * lh / 2, wmax, lines.length * lh]; ctx.restore();
}

// ---------- transport ----------
function sync() {
  for (const c of project.clips) {
    if (!hasMedia(c)) continue;
    const m = mediaFor(c); if (!m) continue;
    const on = playing && t >= c.start && t < c.start + c.dur, want = c.in + (t - c.start) * spd(c);
    if (on) { applyVolume(c); m.el.playbackRate = spd(c); if (m.el.paused) { m.el.currentTime = want; m.el.play().catch(() => {}); } else if (Math.abs(m.el.currentTime - want) > 0.3) m.el.currentTime = want; }
    else if (!m.el.paused) m.el.pause();
  }
}
function tick(now) {
  if (!playing) return;
  t = t0 + (now - w0) / 1000;
  if (t >= endTime()) { t = endTime(); pause(); if (exporting) finishExport(); return; }
  sync(); draw(); updatePlayhead(); requestAnimationFrame(tick);
}
function play() {
  if (!project.clips.length) return; ensureAudio(); project.clips.forEach(c => { if (hasMedia(c)) { const m = mediaFor(c); if (m) wire(m); } });
  if (t >= endTime() - 0.05) t = 0;
  playing = true; t0 = t; w0 = performance.now(); $('#v-play').textContent = '⏸'; requestAnimationFrame(tick);
}
function pause() { playing = false; $('#v-play').textContent = '▶'; sync(); draw(); updatePlayhead(); }
function seek(x) {
  t = Math.max(0, Math.min(x, Math.max(endTime(), 0)));
  if (playing) { t0 = t; w0 = performance.now(); }
  for (const c of project.clips) if (c.kind === 'video' && t >= c.start && t < c.start + c.dur) { const m = mediaFor(c); if (m) m.el.currentTime = c.in + (t - c.start) * spd(c); }
  draw(); updatePlayhead();
}

// ---------- editing ----------
async function addFromSource(id, at) {
  const s = src(id); if (!s) return;
  if (replacing) { // swap the visual of an existing clip, keep its timing (and any detached audio)
    const c = find(replacing); replacing = null; banner('');
    if (c && c.kind === 'overlay' && s.kind === 'image') { commit(); disposeMedia(c.id); c.src = id; refreshAll(); draw(); }
    else if (c && c.kind !== 'overlay' && (s.kind === 'video' || s.kind === 'image')) { commit(); disposeMedia(c.id); c.src = id; c.kind = s.kind; c.in = 0; c.fit ||= 'cover'; refreshAll(); seek(t); }
    return;
  }
  const m = await probe(id); commit();
  const first = !project.clips.length;
  const c = { id: uid(), kind: s.kind, src: id, start: 0, in: 0, dur: m.duration, vol: 1, fit: 'cover' };
  if (s.kind === 'audio') c.start = at ?? t;
  else { c.start = project.clips.filter(k => LANE[k.kind] === 'video').reduce((e, k) => Math.max(e, k.start + k.dur), 0); if (first && m.w) { [project.w, project.h] = m.w >= m.h ? [1920, 1080] : [1080, 1920]; sizeCanvas(); $('#v-size').value = m.w >= m.h ? 0 : 1; } }
  project.clips.push(c); sel = c.id; refreshAll(); seek(c.start);
}
async function addOverlay(id) {
  const s = src(id); if (!s || s.kind !== 'image') return; const m = await probe(id); commit();
  const c = { id: uid(), kind: 'overlay', src: id, start: t, dur: Math.max(3, endTime() - t), x: 0.85, y: 0.12, scale: 0.18, rot: 0, opacity: 1 };
  if (m.w && m.h && m.h > m.w * 2) c.scale = 0.1; project.clips.push(c); sel = c.id; refreshAll(); draw();
}
function addText() { commit(); const c = { id: uid(), kind: 'text', start: t, dur: 3, text: 'Your text', font: 'Arial', size: Math.round(project.h / 14), color: '#ffffff', stroke: '#000000', sw: 4, bold: true, italic: false, x: 0.5, y: 0.5 }; project.clips.push(c); sel = c.id; refreshAll(); seek(t); }
function split() {
  const c = find(sel) || project.clips.find(k => LANE[k.kind] === 'video' && t > k.start && t < k.start + k.dur);
  if (!c || !(t > c.start + 0.05 && t < c.start + c.dur - 0.05)) return;
  commit(); const n = { ...c, id: uid(), start: t, in: c.in + (t - c.start) * spd(c), dur: c.start + c.dur - t, fadeIn: 0 }; c.fadeOut = 0; delete n.trans; // a transition belongs to the cut it was set on c.dur = t - c.start;
  project.clips.push(n); sel = n.id; refreshAll(); draw();
}
function del() { if (!sel) return; commit(); disposeMedia(sel); project.clips = project.clips.filter(c => c.id !== sel); sel = null; refreshAll(); draw(); }
function detachAudio() {
  const c = find(sel); if (!c || c.kind !== 'video' || c.mute) return; commit();
  project.clips.push({ id: uid(), kind: 'audio', src: c.src, start: c.start, in: c.in, dur: c.dur, vol: c.vol ?? 1, speed: c.speed || 1 });
  c.mute = true; applyVolume(c); refreshAll();
}
function disposeMedia(id) { const m = media.get(id); if (!m) return; try { m.el.pause?.(); m.el.removeAttribute?.('src'); } catch (e) {} URL.revokeObjectURL(m.url); media.delete(id); }

// ---------- UI: bin, timeline, inspector ----------
function renderBin() {
  const box = $('#v-binlist'); box.textContent = '';
  const list = SMA.getSources();
  if (!list.length) box.innerHTML = '<p class="hint">Add videos, audio or images. They stay in your library.</p>';
  list.forEach(s => {
    const d = document.createElement('div'); d.className = 'src'; d.title = s.name;
    const ic = { video: '🎞', audio: '♪', image: '🖼' }[s.kind]; d.append(Object.assign(document.createElement('div'), { className: 'ico', textContent: ic }));
    d.append(Object.assign(document.createElement('small'), { textContent: s.name })); d.onclick = () => addFromSource(s.id);
    if (s.kind === 'image') { const ov = Object.assign(document.createElement('button'), { className: 'x', textContent: 'Overlay', title: 'Place this image on top of the video (for a logo or watermark)' }); ov.onclick = ev => { ev.stopPropagation(); addOverlay(s.id); }; d.append(ov); }
    box.append(d);
  });
}
function renderTimeline() {
  const total = Math.max(endTime() + 8, 20), sc = $('#v-scroll'); const wpx = total * pps;
  $('#v-lanes').style.width = $('#v-ruler').style.width = wpx + 'px';
  const ru = $('#v-ruler'); ru.textContent = '';
  const step = pps >= 100 ? 1 : pps >= 40 ? 5 : 10;
  for (let s = 0; s < total; s += step) { const k = document.createElement('span'); k.style.left = s * pps + 'px'; k.textContent = fmt(s).replace(/\.0$/, ''); ru.append(k); }
  document.querySelectorAll('.lane').forEach(l => { l.textContent = ''; });
  for (const c of project.clips) {
    const d = document.createElement('div'); d.className = 'clip k-' + c.kind + (c.id === sel ? ' sel' : ''); d.dataset.id = c.id;
    d.style.left = c.start * pps + 'px'; d.style.width = Math.max(6, c.dur * pps) + 'px';
    if (c.trans) d.append(Object.assign(document.createElement('i'), { className: 'tr', title: 'Transition' })), d.lastChild.style.width = Math.min(c.dur, c.trans.dur) * pps + 'px';
    const label = c.kind === 'text' ? c.text.split('\n')[0] : (src(c.src)?.name || 'missing source') + (c.mute ? ' (audio detached)' : '');
    d.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('i'), { className: 'h l' }), Object.assign(document.createElement('i'), { className: 'h r' }));
    document.querySelector(`.lane[data-lane=${LANE[c.kind]}]`).append(d);
  }
  updatePlayhead();
}
function updatePlayhead() { $('#v-playhead').style.left = t * pps + 'px'; $('#v-time').textContent = fmt(t) + ' / ' + fmt(endTime()); }
function num(label, obj, key, opts = {}) {
  const i = document.createElement('input'); i.type = opts.type || 'number'; if (opts.type === 'checkbox') i.checked = !!obj[key]; else i.value = opts.type ? obj[key] : +(+obj[key]).toFixed(2); if (opts.step) i.step = opts.step; if (opts.min !== undefined) i.min = opts.min; if (opts.max !== undefined) i.max = opts.max;
  i.onfocus = () => { i._c = false; };
  i.oninput = () => { if (!i._c) { commit(); i._c = true; } let v = i.type === 'number' || i.type === 'range' ? +i.value : i.value; if (opts.type === 'checkbox') v = i.checked; obj[key] = v; if (opts.after) opts.after(); renderTimeline(); draw(); applyVolume(obj); };
  const l = document.createElement('label'); l.append(label, i); return l;
}
function renderProps() {
  const p = $('#v-props'); if (document.activeElement && p.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
  p.textContent = ''; const c = sel && find(sel);
  const h = x => { const e = document.createElement('h4'); e.textContent = x; p.append(e); };
  const btn = (x, fn) => { const b = document.createElement('button'); b.textContent = x; b.onclick = fn; p.append(b); };
  if (!c) { h('Project'); p.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Click a clip to edit it. Space plays, S splits at the playhead, Delete removes. Drag clip edges to trim, drag the middle to move.' })); return; }
  h(c.kind + ' clip');
  if (c.kind === 'overlay') {
    p.append(num('Size (% of width)', c, 'scale', { min: 0.02, max: 1.5, step: 0.01 }), num('Rotation (°)', c, 'rot', { min: -360, max: 360, step: 1 }), num('Opacity', c, 'opacity', { type: 'range', min: 0, max: 1, step: 0.05 }),
      num('X (0–1)', c, 'x', { step: 0.01, min: 0, max: 1 }), num('Y (0–1)', c, 'y', { step: 0.01, min: 0, max: 1 }));
    btn('Swap the image…', () => { replacing = c.id; banner('Pick another image in Media to swap it in. Esc to cancel.'); });
    p.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Drag it in the preview to move it. Size is a fraction of the video width.' }));
  }
  if (c.kind === 'text') {
    const ta = document.createElement('textarea'); ta.value = c.text; ta.oninput = () => { commit(); c.text = ta.value; renderTimeline(); draw(); }; p.append(ta);
    const f = document.createElement('select'); FONTS.forEach(n => f.add(new Option(n, n, false, n === c.font))); f.onchange = () => { commit(); c.font = f.value; draw(); };
    const fl = document.createElement('label'); fl.append('Font', f); p.append(fl);
    p.append(num('Size', c, 'size', { min: 8 }), num('Colour', c, 'color', { type: 'color' }), num('Outline colour', c, 'stroke', { type: 'color' }), num('Outline width', c, 'sw', { min: 0 }),
      num('Bold', c, 'bold', { type: 'checkbox' }), num('X (0–1)', c, 'x', { step: 0.01, min: 0, max: 1 }), num('Y (0–1)', c, 'y', { step: 0.01, min: 0, max: 1 }));
  }
  if (c.kind === 'video' || c.kind === 'image') { const f = document.createElement('select'); [['cover', 'Fill frame (crop)'], ['contain', 'Fit inside (bars)']].forEach(([v, n]) => f.add(new Option(n, v, false, v === c.fit))); f.onchange = () => { commit(); c.fit = f.value; draw(); }; const fl = document.createElement('label'); fl.append('Framing', f); p.append(fl); }
  if (c.kind === 'video' || c.kind === 'audio') p.append(num('Volume', c, 'vol', { type: 'range', min: 0, max: 1.5, step: 0.05 }));
  h('Timing (seconds)');
  p.append(num('Start', c, 'start', { min: 0, step: 0.1 }), num('Length', c, 'dur', { min: 0.1, step: 0.1 }));
  c.speed ||= 1; c.fadeIn ||= 0; c.fadeOut ||= 0; c._ps = c.speed;
  if (hasMedia(c)) p.append(num('Source in', c, 'in', { min: 0, step: 0.1 }), num('Speed (x)', c, 'speed', { min: 0.25, max: 4, step: 0.25, after: () => { const ns = Math.min(4, Math.max(0.25, +c.speed || 1)); c.dur = Math.max(0.1, c.dur * (c._ps || 1) / ns); c._ps = c.speed = ns; } }));
  if (c.kind === 'video' || c.kind === 'image') {
    h('Filters'); const F = window.SMA_FILTERS;
    const pre = document.createElement('select'); Object.keys(F.PRESETS).forEach(n => pre.add(new Option(n, n))); pre.onchange = () => { commit(); c.fl = { ...F.PRESETS[pre.value] }; refreshAll(); draw(); };
    const pl = document.createElement('label'); pl.append('Preset', pre); p.append(pl);
    [['Brightness', 'brightness', 0, 2, 0.05], ['Contrast', 'contrast', 0, 2, 0.05], ['Saturation', 'saturate', 0, 3, 0.05], ['Hue', 'hue', -180, 180, 1], ['Blur', 'blur', 0, 20, 0.5], ['Grayscale', 'gray', 0, 1, 0.05], ['Sepia', 'sepia', 0, 1, 0.05]].forEach(([label, key, min, max, step]) => {
      const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = F.full(c.fl)[key]; i.id = 'vfl-' + key; i.onfocus = () => { i._c = false; };
      i.oninput = () => { if (!i._c) { commit(); i._c = true; } c.fl = { ...(c.fl || {}), [key]: +i.value }; if (F.isDefault(c.fl)) delete c.fl; draw(); save(); };
      const l = document.createElement('label'); l.append(label, i); p.append(l); });
    h('Transition into this clip');
    const sel2 = document.createElement('select'); sel2.add(new Option('None', '')); TRANS.forEach(([v, n]) => sel2.add(new Option(n, v, false, c.trans?.type === v)));
    sel2.onchange = () => { commit(); setTransition(c, sel2.value, c.trans?.dur || 1); refreshAll(); draw(); };
    const l2 = document.createElement('label'); l2.append('Type', sel2); p.append(l2);
    if (c.trans) { const dl = document.createElement('label'); const di = document.createElement('input'); di.type = 'number'; di.min = 0.1; di.step = 0.1; di.value = c.trans.dur;
      di.onchange = () => { commit(); setTransition(c, c.trans.type, di.value); refreshAll(); draw(); }; dl.append('Length (s)', di); p.append(dl);
      p.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'The previous clip is extended so the two overlap for this long. If it has no spare footage, its last frame is held.' })); }
    wmPanel(c, p, h);
    h('Timing and fades');
  }
  p.append(num('Fade in (s)', c, 'fadeIn', { min: 0, step: 0.1 }), num('Fade out (s)', c, 'fadeOut', { min: 0, step: 0.1 }));
  if (c.kind === 'video') { btn('Detach audio to its own track', detachAudio); btn('Replace visuals (keep audio)', () => { replacing = c.id; banner('Pick a video or image in Media to replace this clip’s visuals. Esc to cancel.'); }); }
  btn('Split at playhead (S)', split); btn('Delete', del);
}
function refreshAll() { renderBin(); renderTimeline(); renderProps(); $('#v-play').disabled = !project.clips.length; save(); }

// timeline pointer handling: move, trim edges, select, scrub
let drag = null;
$('#v-lanes').addEventListener('pointerdown', ev => {
  const d = ev.target.closest('.clip');
  if (!d) { sel = null; seekFromEvent(ev); renderTimeline(); renderProps(); drag = { scrub: true }; ev.currentTarget.setPointerCapture(ev.pointerId); return; }
  sel = d.dataset.id; const c = find(sel), r = d.getBoundingClientRect(), x = ev.clientX - r.left;
  const zone = ev.target.classList.contains('l') || x < 7 ? 'l' : ev.target.classList.contains('r') || x > r.width - 7 ? 'r' : 'm';
  commit(); drag = { c, zone, x0: ev.clientX, o: { ...c } }; ev.currentTarget.setPointerCapture(ev.pointerId); renderTimeline(); renderProps();
});
$('#v-lanes').addEventListener('pointermove', ev => {
  if (!drag) return; if (drag.scrub) { seekFromEvent(ev); return; }
  const { c, o, zone } = drag, dt = (ev.clientX - drag.x0) / pps, snapT = 8 / pps;
  const pts = [0, t, ...project.clips.filter(k => k !== c).flatMap(k => [k.start, k.start + k.dur])];
  const snap = v => { const n = pts.find(p => Math.abs(p - v) < snapT); return n ?? v; };
  const maxLen = hasMedia(c) ? Math.max(0.1, (meta.get(c.src)?.duration ?? Infinity) / spd(c)) : Infinity;
  if (zone === 'm') c.start = Math.max(0, snap(o.start + dt));
  else if (zone === 'r') c.dur = Math.max(0.1, Math.min(snap(o.start + o.dur + dt) - o.start, maxLen - o.in / spd(c)));
  else { let ns = snap(o.start + dt); ns = Math.max(Math.max(0, o.start - (hasMedia(c) ? o.in / spd(c) : o.start)), Math.min(ns, o.start + o.dur - 0.1)); const dd = ns - o.start; c.start = ns; c.dur = o.dur - dd; if (hasMedia(c)) c.in = o.in + dd * spd(c); }
  renderTimeline(); draw();
});
$('#v-lanes').addEventListener('pointerup', () => { if (drag && !drag.scrub) { renderProps(); save(); } drag = null; });
function seekFromEvent(ev) { const r = $('#v-lanes').getBoundingClientRect(); seek((ev.clientX - r.left) / pps); }
$('#v-ruler').addEventListener('pointerdown', ev => { const mv = e => { const r = $('#v-ruler').getBoundingClientRect(); seek((e.clientX - r.left) / pps); }; mv(ev); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });

// drag text in the preview
let tdrag = null;
canvas.addEventListener('pointerdown', ev => {
  const r = canvas.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * project.w, y = (ev.clientY - r.top) / r.height * project.h;
  const hit = [...project.clips].reverse().find(c => (c.kind === 'text' || c.kind === 'overlay') && t >= c.start && t < c.start + c.dur && c._box && x >= c._box[0] && x <= c._box[0] + c._box[2] && y >= c._box[1] && y <= c._box[1] + c._box[3]);
  if (!hit) return; sel = hit.id; commit(); tdrag = { c: hit, dx: x - hit.x * project.w, dy: y - hit.y * project.h }; canvas.setPointerCapture(ev.pointerId); renderTimeline(); renderProps();
});
canvas.addEventListener('pointermove', ev => { if (!tdrag) return; const r = canvas.getBoundingClientRect(); tdrag.c.x = ((ev.clientX - r.left) / r.width * project.w - tdrag.dx) / project.w; tdrag.c.y = ((ev.clientY - r.top) / r.height * project.h - tdrag.dy) / project.h; draw(); });
canvas.addEventListener('pointerup', () => { if (tdrag) { tdrag = null; renderProps(); save(); } });

// ---------- export ----------
// WebM: records the preview in real time (works everywhere). MP4 (desktop): renders every frame on its own, faster than real time.
async function startExport(kind) {
  if (exporting || !project.clips.length) return;
  if (kind === 'mp4') return fastExport();
  if (typeof MediaRecorder === 'undefined') { alert('This device cannot record video in the app.'); return; }
  ensureAudio(); project.clips.forEach(c => { if (hasMedia(c)) { const m = mediaFor(c); if (m) wire(m); } });
  const stream = canvas.captureStream(30); exportDest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }); chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => { speaker.gain.value = 1; exporting = false; banner(''); SMA.download('video.webm', new Blob(chunks, { type: 'video/webm' })); };
  exporting = true; speaker.gain.value = 0; // record silently
  banner('Exporting in real time. Keep this window open…');
  t = 0; seek(0); await new Promise(r => setTimeout(r, 400)); recorder.start(250); play();
}
function finishExport() { if (recorder && recorder.state !== 'inactive') setTimeout(() => recorder.stop(), 300); }

const wavOf = buf => { // AudioBuffer -> 16-bit PCM WAV
  const ch = buf.numberOfChannels, n = buf.length, out = new DataView(new ArrayBuffer(44 + n * ch * 2)), w = (o, x) => [...x].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch).keys()].map(i => buf.getChannelData(i)); let o = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) { const v = Math.max(-1, Math.min(1, data[k][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return out.buffer;
};
async function mixAudio(dur) { // the whole soundtrack, rendered without playing it
  const rate = 48000, oac = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * rate)), rate), cache = new Map(); let any = false;
  for (const c of project.clips) {
    if (!hasMedia(c) || (c.kind === 'video' && c.mute)) continue; const s = src(c.src); if (!s) continue;
    let buf = cache.get(c.src);
    if (buf === undefined) { try { buf = await oac.decodeAudioData(await s.blob.arrayBuffer()); } catch (e) { buf = null; } cache.set(c.src, buf); } // null: file has no audio
    if (!buf) continue;
    const node = oac.createBufferSource(), gain = oac.createGain(); node.buffer = buf; node.playbackRate.value = spd(c);
    const n = Math.max(2, Math.ceil(c.dur * 50)), curve = new Float32Array(n); for (let i = 0; i < n; i++) { const x = c.start + c.dur * i / (n - 1); curve[i] = (c.vol ?? 1) * fadeAt(c, x) * transGain(c, x); }
    gain.gain.setValueCurveAtTime(curve, c.start, c.dur); node.connect(gain); gain.connect(oac.destination); node.start(c.start, c.in, c.dur * spd(c)); any = true;
  }
  return any ? wavOf(await oac.startRendering()) : null;
}
function seekClips(x) { // put every video on the exact time of this frame and wait until it has arrived
  const waits = [];
  for (const c of project.clips) {
    if (c.kind !== 'video' || !(x >= c.start && x < c.start + c.dur) || (exportFrames && exportFrames.has(c.id))) continue; const m = mediaFor(c); if (!m) continue;
    const want = Math.min(c.in + (x - c.start) * spd(c), (m.el.duration || 1e9) - 0.001);
    if (Math.abs(m.el.currentTime - want) < 0.0005 && m.el.readyState >= 2) continue;
    waits.push(new Promise(res => { const done = () => { m.el.removeEventListener('seeked', done); res(); }; m.el.addEventListener('seeked', done); setTimeout(done, 4000); m.el.currentTime = want; }));
  }
  return Promise.all(waits);
}
async function fastExport() {
  const X = window.sma && window.sma.exportVideo; if (!X) { alert('Fast MP4 export is only in the desktop app. Use WebM here.'); return; }
  if (playing) pause(); exporting = true; cancelFlag = false; const keepT = t; let id = null;
  try {
    const fps = 30, dur = endTime(), total = Math.max(1, Math.ceil(dur * fps));
    banner('Mixing audio…', true); const wav = await mixAudio(dur);
    id = await X.start({ w: project.w, h: project.h, fps, wav });
    // hand each source file to the exporter once, and let FFmpeg decode every video clip's frames in the background
    const extracted = new Set(), sent = new Set(); exportFrames = new Map(); const pending = new Map();
    for (const c of project.clips.filter(k => k.kind === 'video')) {
      const s = src(c.src); if (!s) continue; const key = 's' + c.src.replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
      if (!sent.has(key)) { sent.add(key); for (let off = 0; off < s.blob.size; off += 32 * 1048576) { banner(`Preparing ${s.name}…`, true); await X.srcChunk(id, key, off, await s.blob.slice(off, off + 32 * 1048576).arrayBuffer()); if (cancelFlag) break; } }
      if (cancelFlag) break;
      await X.extract(id, { clipKey: c.id.replace(/[^A-Za-z0-9]/g, ''), srcKey: key, ss: c.in, len: c.dur * spd(c), fps: fps / spd(c), w: project.w, h: project.h }); extracted.add(c.id);
    }
    const grab = (c, k) => { const key = c.id + ':' + k; if (!pending.has(key)) pending.set(key, X.readFrame(id, c.id.replace(/[^A-Za-z0-9]/g, ''), k).then(buf => buf && createImageBitmap(new Blob([buf], { type: 'image/jpeg' })))); return pending.get(key); };
    // pipeline: frames are JPEG-encoded by a few workers in parallel while the page already seeks and draws the next one; results go to FFmpeg in order
    let sendChain = Promise.resolve(), inflight = 0, failed = null;
    const nWorkers = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)), pool = [...Array(nWorkers)].map(() => new Worker('src/encode-worker.js')), waiting = new Map();
    pool.forEach(wk => { wk.onmessage = ev => { const r = waiting.get(ev.data.n); waiting.delete(ev.data.n); r(ev.data.buf); }; wk.onerror = ev => { failed = new Error('Frame encoder failed: ' + ev.message); }; });
    const encodeAsync = (bmp, n) => new Promise(res => { waiting.set(n, res); pool[n % nWorkers].postMessage({ bmp, w: project.w, h: project.h, q: 0.9, n }, [bmp]); });
    try {
      for (let i = 0; i < total && !cancelFlag && !failed; i++) {
        t = i / fps; exportFrames.clear();
        const act = project.clips.filter(c => c.kind === 'video' && extracted.has(c.id) && t >= c.start && t < c.start + c.dur);
        await Promise.all(act.map(async c => {
          const k = Math.round((t - c.start) * fps) + 1, bmp = await grab(c, k); pending.delete(c.id + ':' + (k - 2));
          if (bmp) { exportFrames.set(c.id, bmp); grab(c, k + 1); grab(c, k + 2); } else extracted.delete(c.id); // no frame from FFmpeg: fall back to seeking this clip
        }));
        await seekClips(t); draw(); const bmp = await createImageBitmap(canvas);
        const job = encodeAsync(bmp, i); inflight++; sendChain = sendChain.then(async () => X.frame(id, await job)).catch(e => { failed = e; }).finally(() => { inflight--; });
        while (inflight > 8 && !failed) { await sendChain; } // keep the queue bounded
        if (i % 5 === 0) { banner(`Rendering frame ${i + 1} of ${total} (${Math.round(100 * (i + 1) / total)}%)`, true); updatePlayhead(); await new Promise(r => setTimeout(r)); }
      }
      await sendChain;
    } finally { pool.forEach(wk => wk.terminate()); }
    if (failed) throw failed;
    if (cancelFlag) { await X.cancel(id); id = null; return; }
    banner('Finishing the file…'); const out = await X.finish(id); id = null; SMA.download('video.mp4', new Blob([out], { type: 'video/mp4' }));
  } catch (e) { if (id) X.cancel(id).catch(() => {}); alert('Export failed: ' + String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  finally { exporting = false; exportFrames = null; banner(''); seek(keepT); }
}

// ---------- watermark removal: mark boxes on the preview ----------
function regionAt(r, c, x) { // a box that moves follows its tracked path
  const p = r.path; if (!p || !p.length) return r; const u = x - c.start;
  if (u <= p[0].t) return { ...r, x: p[0].x, y: p[0].y }; const L = p[p.length - 1]; if (u >= L.t) return { ...r, x: L.x, y: L.y };
  let i = 0; while (p[i + 1].t < u) i++; const f = (u - p[i].t) / (p[i + 1].t - p[i].t);
  return { ...r, x: p[i].x + (p[i + 1].x - p[i].x) * f, y: p[i].y + (p[i + 1].y - p[i].y) * f };
}
async function autoTrack(c, ri) { // follow a moving mark: match the first-frame pixels of the box in each following frame
  const r = c.wm[ri], m0 = mediaFor(c); if (!m0 || c.kind !== 'video') return; if (playing) pause();
  const el = m0.el, step = 1 / 6, n = Math.floor(c.dur / step), tc = document.createElement('canvas'); tc.width = project.w; tc.height = project.h;
  const tg = tc.getContext('2d', { willReadFrequently: true }); cancelFlag = false;
  const grab = async k => { const want = Math.min(c.in + k * step * spd(c), (el.duration || 1e9) - 0.001);
    await new Promise(res => { const d = () => { el.removeEventListener('seeked', d); res(); }; el.addEventListener('seeked', d); setTimeout(d, 3000); el.currentTime = want; });
    tg.clearRect(0, 0, tc.width, tc.height); drawFit(el, el.videoWidth, el.videoHeight, c.fit, tg, c); };
  const gray = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  try {
    banner('Tracking the watermark…', true); await grab(0); const mp = c._map; if (!mp) return;
    let px = Math.round(mp.ox + r.x * mp.w * mp.r), py = Math.round(mp.oy + r.y * mp.h * mp.r);
    const W = Math.max(6, Math.round(r.w * mp.w * mp.r)), H = Math.max(6, Math.round(r.h * mp.h * mp.r)), S = Math.round(Math.max(40, project.w * 0.04));
    const tpl = tg.getImageData(px, py, W, H).data, path = [{ t: 0, x: r.x, y: r.y }];
    for (let k = 1; k <= n && !cancelFlag; k++) {
      await grab(k); if (k % 3 === 0) banner(`Tracking the watermark… ${Math.round(100 * k / n)}%`, true);
      const x0 = Math.max(0, px - S), y0 = Math.max(0, py - S), x1 = Math.min(tc.width - W, px + S), y1 = Math.min(tc.height - H, py + S);
      const win = tg.getImageData(x0, y0, x1 - x0 + W, y1 - y0 + H), ww = win.width, d = win.data; let best = Infinity, bx = px, by = py;
      const sad = (cx, cy, st) => { let sum = 0; for (let j = 0; j < H; j += st) for (let i = 0; i < W; i += st) sum += Math.abs(gray(d, ((cy - y0 + j) * ww + (cx - x0 + i)) * 4) - gray(tpl, (j * W + i) * 4)); return sum; };
      for (let cy = y0; cy <= y1; cy += 3) for (let cx = x0; cx <= x1; cx += 3) { const v = sad(cx, cy, 3); if (v < best) { best = v; bx = cx; by = cy; } }
      best = Infinity; px = bx; py = by; // fine search around the best coarse position, comparing every pixel
      for (let cy = Math.max(y0, by - 2); cy <= Math.min(y1, by + 2); cy++) for (let cx = Math.max(x0, bx - 2); cx <= Math.min(x1, bx + 2); cx++) { const v = sad(cx, cy, 1); if (v < best) { best = v; px = cx; py = cy; } }
      path.push({ t: k * step, x: (px - mp.ox) / (mp.w * mp.r), y: (py - mp.oy) / (mp.h * mp.r) });
    }
    if (!cancelFlag) { commit(); r.path = path; }
  } finally { banner(''); refreshAll(); seek(t); }
}
let wmMode = null, wmDrag = null;
function startMarking(c) { wmMode = c.id; banner('Drag a box over the watermark on the preview. Esc to cancel.'); }
function wmPanel(c, p, h) {
  h('Watermark removal');
  p.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Fills the marked box from the pixels around it, on every frame. Works for fixed logos, best on small marks over simple backgrounds.' }));
  (c.wm || []).forEach((r, i) => {
    const b = document.createElement('button'); b.textContent = `Region ${i + 1} ✕`; b.onclick = () => { commit(); c.wm.splice(i, 1); if (!c.wm.length) delete c.wm; refreshAll(); draw(); }; p.append(b);
    if (c.kind === 'video') { const tr = document.createElement('button'); tr.textContent = r.path ? 'Re-track' : 'Track movement'; tr.title = 'Follow a logo that moves around the frame'; tr.onclick = () => autoTrack(c, i); p.append(tr); }
    if (r.path) { const cl = document.createElement('button'); cl.textContent = 'Stop tracking'; cl.onclick = () => { commit(); delete r.path; refreshAll(); draw(); }; p.append(cl); }
  });
  const add = document.createElement('button'); add.textContent = '+ Mark a watermark'; add.onclick = () => startMarking(c); p.append(add);
}
canvas.addEventListener('pointerdown', ev => {
  if (!wmMode) return; const r = canvas.getBoundingClientRect(); wmDrag = { x: (ev.clientX - r.left) / r.width * project.w, y: (ev.clientY - r.top) / r.height * project.h }; wmDrag.x2 = wmDrag.x; wmDrag.y2 = wmDrag.y; canvas.setPointerCapture(ev.pointerId); ev.stopImmediatePropagation();
}, true);
canvas.addEventListener('pointermove', ev => { if (!wmDrag) return; const r = canvas.getBoundingClientRect(); wmDrag.x2 = (ev.clientX - r.left) / r.width * project.w; wmDrag.y2 = (ev.clientY - r.top) / r.height * project.h; draw(); ctx.save(); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = Math.max(2, project.w / 400); ctx.setLineDash([12, 8]); ctx.strokeRect(Math.min(wmDrag.x, wmDrag.x2), Math.min(wmDrag.y, wmDrag.y2), Math.abs(wmDrag.x2 - wmDrag.x), Math.abs(wmDrag.y2 - wmDrag.y)); ctx.restore(); }, true);
canvas.addEventListener('pointerup', () => {
  if (!wmDrag) return; const d = wmDrag; wmDrag = null; const c = find(wmMode), m = c && c._map; wmMode = null; banner('');
  const X0 = Math.min(d.x, d.x2), Y0 = Math.min(d.y, d.y2), X1 = Math.max(d.x, d.x2), Y1 = Math.max(d.y, d.y2);
  if (!m || X1 - X0 < 4 || Y1 - Y0 < 4) { draw(); return; }
  const cl = v => Math.max(0, Math.min(1, v)), fx = x => cl((x - m.ox) / (m.w * m.r)), fy = y => cl((y - m.oy) / (m.h * m.r));
  commit(); (c.wm ||= []).push({ x: fx(X0), y: fy(Y0), w: fx(X1) - fx(X0), h: fy(Y1) - fy(Y0) }); refreshAll(); draw();
}, true);

// ---------- wiring ----------
SIZES.forEach(([n], i) => $('#v-size').add(new Option(n, i)));
$('#v-size').onchange = () => { commit(); [, project.w, project.h] = SIZES[$('#v-size').value]; sizeCanvas(); draw(); save(); };
$('#v-play').onclick = () => (playing ? pause() : play());
$('#v-split').onclick = split; $('#v-del').onclick = del; $('#v-addtext').onclick = addText;
$('#v-add').onclick = () => { const f = $('#file'); f.accept = 'video/*,audio/*,image/*'; f.multiple = true; f.value = ''; f.onchange = () => { SMA.addFiles([...f.files]); f.multiple = false; }; f.click(); };
$('#v-zoom').oninput = e => { pps = +e.target.value; renderTimeline(); };
$('#v-export').onchange = e => { const k = e.target.value; e.target.value = ''; if (k) startExport(k); };
if (window.sma?.exportVideo) { $('#v-export').add(new Option('MP4 (fast, desktop)', 'mp4')); }
$('#v-banner-x').onclick = () => { cancelFlag = true; if (recorder && recorder.state !== 'inactive') { exporting = false; recorder.stop(); } };
SMA.subscribe(() => { renderBin(); project.clips.forEach(c => { if (c.src) probe(c.src); }); if (document.body.classList.contains('video-mode')) draw(); });
document.addEventListener('keydown', ev => {
  if (!document.body.classList.contains('video-mode') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
  if (k === ' ') { ev.preventDefault(); playing ? pause() : play(); }
  else if (k === 's' && !mod) split();
  else if (k === 'delete' || k === 'backspace') del();
  else if (k === 'escape') { replacing = null; wmMode = null; banner(''); }
  else if (k === 'arrowleft') seek(t - (ev.shiftKey ? 1 : 1 / 30)); else if (k === 'arrowright') seek(t + (ev.shiftKey ? 1 : 1 / 30)); else if (k === 'home') seek(0);
  else if (mod && k === 'z') { ev.preventDefault(); if (ev.shiftKey) { if (redoS.length) { undoS.push(JSON.stringify(project)); restore(redoS.pop()); } } else if (undoS.length) { redoS.push(JSON.stringify(project)); restore(undoS.pop()); } }
});
window.addEventListener('resize', () => { if (document.body.classList.contains('video-mode')) { sizeCanvas(); draw(); } });

window.SMA_video = {
  serialize: () => JSON.stringify(project), getPid: () => project.pid, setPid: p => { project.pid = p; }, getName: () => project.name || 'Untitled video', setName: n => { project.name = n; },
  load(json) { pause(); media.forEach((m, id) => disposeMedia(id)); project = JSON.parse(json); sel = null; t = 0; undoS = []; redoS = []; },
  reset() { pause(); media.forEach((m, id) => disposeMedia(id)); project = { w: 1080, h: 1920, clips: [] }; sel = null; t = 0; undoS = []; redoS = []; },
  thumb: async () => { const k = 320 / Math.max(project.w, project.h), c = document.createElement('canvas'); c.width = Math.round(project.w * k); c.height = Math.round(project.h * k); draw(); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); },
  show() { sizeCanvas(); refreshAll(); project.clips.forEach(c => { if (c.src) probe(c.src); }); draw(); }, hide() { if (playing) pause(); } };
try { const s = localStorage.getItem('sma-video'); if (s) project = JSON.parse(s); } catch (e) {}
project.clips.forEach(c => { if (hasMedia(c) || c.kind === 'image') probe(c.src); });
})();
