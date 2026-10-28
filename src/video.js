// Offline video editor: timeline with video/image, audio and text lanes.
// Preview draws to a canvas; export records that canvas plus the mixed audio (WebM). On desktop, WebM can be converted to MP4.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const SMA = window.SMA;
if (!SMA) return;

const SIZES = [['Landscape 1920×1080', 1920, 1080], ['YouTube / TikTok / Reels / Shorts 1080×1920', 1080, 1920], ['Square 1080×1080', 1080, 1080], ['Landscape 1280×720', 1280, 720]];
const FONTS = ['Arial', 'Georgia', 'Impact', 'Verdana', 'Courier New', 'Trebuchet MS'];
const LANE = { video: 'video', image: 'video', audio: 'audio', text: 'text' };

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
  if (c.kind === 'image') { const el = new Image(); const url = URL.createObjectURL(s.blob); el.onload = () => { if (!playing) draw(); }; el.src = url; m = { el, url }; }
  else { const el = document.createElement(c.kind === 'audio' ? 'audio' : 'video'); const url = URL.createObjectURL(s.blob);
    el.src = url; el.preload = 'auto'; el.playsInline = true; el.onseeked = el.onloadeddata = () => { if (!playing) draw(); };
    m = { el, url }; wire(m); }
  media.set(c.id, m); return m;
}
function transGain(c) {
  if (c.kind !== 'video') return 1; let g = 1;
  const pin = inTrans(c, t); if (pin !== null) g *= ease(pin);
  const o = outTrans(c, t); if (o) g *= 1 - ease(o.p);
  return g;
}
function applyVolume(c) { const m = media.get(c.id); if (m?.gain) m.gain.gain.value = c.mute ? 0 : (c.vol ?? 1) * fadeAt(c, t) * transGain(c); }

// ---------- rendering ----------
function sizeCanvas() { canvas.width = project.w; canvas.height = project.h; const st = $('#v-stage'); const s = Math.min((st.clientWidth - 20) / project.w, (st.clientHeight - 20) / project.h, 1); canvas.style.width = project.w * s + 'px'; canvas.style.height = project.h * s + 'px'; }
function drawFit(el, w, h, fit) {
  if (!w || !h) return; const r = fit === 'cover' ? Math.max(project.w / w, project.h / h) : Math.min(project.w / w, project.h / h);
  ctx.drawImage(el, (project.w - w * r) / 2, (project.h - h * r) / 2, w * r, h * r);
}
function drawBody(c) {
  if (c.kind === 'video') { const m = mediaFor(c); if (m && m.el.readyState >= 2) drawFit(m.el, m.el.videoWidth, m.el.videoHeight, c.fit); }
  else if (c.kind === 'image') { const m = mediaFor(c); if (m && m.el.complete) drawFit(m.el, m.el.naturalWidth, m.el.naturalHeight, c.fit); }
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
  for (const c of project.clips) if (c.kind === 'text' && active(c)) { ctx.globalAlpha = fadeAt(c, t); drawText(c); ctx.globalAlpha = 1; }
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
    const c = find(replacing); replacing = null; $('#v-banner').hidden = true;
    if (c && (s.kind === 'video' || s.kind === 'image')) { commit(); disposeMedia(c.id); c.src = id; c.kind = s.kind; c.in = 0; c.fit ||= 'cover'; refreshAll(); seek(t); }
    return;
  }
  const m = await probe(id); commit();
  const first = !project.clips.length;
  const c = { id: uid(), kind: s.kind, src: id, start: 0, in: 0, dur: m.duration, vol: 1, fit: 'cover' };
  if (s.kind === 'audio') c.start = at ?? t;
  else { c.start = project.clips.filter(k => LANE[k.kind] === 'video').reduce((e, k) => Math.max(e, k.start + k.dur), 0); if (first && m.w) { [project.w, project.h] = m.w >= m.h ? [1920, 1080] : [1080, 1920]; sizeCanvas(); $('#v-size').value = m.w >= m.h ? 0 : 1; } }
  project.clips.push(c); sel = c.id; refreshAll(); seek(c.start);
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
    d.append(Object.assign(document.createElement('small'), { textContent: s.name })); d.onclick = () => addFromSource(s.id); box.append(d);
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
    h('Transition into this clip');
    const sel2 = document.createElement('select'); sel2.add(new Option('None', '')); TRANS.forEach(([v, n]) => sel2.add(new Option(n, v, false, c.trans?.type === v)));
    sel2.onchange = () => { commit(); setTransition(c, sel2.value, c.trans?.dur || 1); refreshAll(); draw(); };
    const l2 = document.createElement('label'); l2.append('Type', sel2); p.append(l2);
    if (c.trans) { const dl = document.createElement('label'); const di = document.createElement('input'); di.type = 'number'; di.min = 0.1; di.step = 0.1; di.value = c.trans.dur;
      di.onchange = () => { commit(); setTransition(c, c.trans.type, di.value); refreshAll(); draw(); }; dl.append('Length (s)', di); p.append(dl);
      p.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'The previous clip is extended so the two overlap for this long. If it has no spare footage, its last frame is held.' })); }
    h('Timing and fades');
  }
  p.append(num('Fade in (s)', c, 'fadeIn', { min: 0, step: 0.1 }), num('Fade out (s)', c, 'fadeOut', { min: 0, step: 0.1 }));
  if (c.kind === 'video') { btn('Detach audio to its own track', detachAudio); btn('Replace visuals (keep audio)', () => { replacing = c.id; const b = $('#v-banner'); b.textContent = 'Pick a video or image in Media to replace this clip’s visuals. Esc to cancel.'; b.hidden = false; }); }
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
  const hit = [...project.clips].reverse().find(c => c.kind === 'text' && t >= c.start && t < c.start + c.dur && c._box && x >= c._box[0] && x <= c._box[0] + c._box[2] && y >= c._box[1] && y <= c._box[1] + c._box[3]);
  if (!hit) return; sel = hit.id; commit(); tdrag = { c: hit, dx: x - hit.x * project.w, dy: y - hit.y * project.h }; canvas.setPointerCapture(ev.pointerId); renderTimeline(); renderProps();
});
canvas.addEventListener('pointermove', ev => { if (!tdrag) return; const r = canvas.getBoundingClientRect(); tdrag.c.x = ((ev.clientX - r.left) / r.width * project.w - tdrag.dx) / project.w; tdrag.c.y = ((ev.clientY - r.top) / r.height * project.h - tdrag.dy) / project.h; draw(); });
canvas.addEventListener('pointerup', () => { if (tdrag) { tdrag = null; renderProps(); save(); } });

// ---------- export ----------
async function startExport(kind) {
  if (!project.clips.length || exporting) return;
  if (typeof MediaRecorder === 'undefined') { alert('This device cannot record video in the app.'); return; }
  ensureAudio(); project.clips.forEach(c => { if (hasMedia(c)) { const m = mediaFor(c); if (m) wire(m); } });
  const stream = canvas.captureStream(30); exportDest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }); chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    speaker.gain.value = 1; exporting = false; $('#v-banner').hidden = true;
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (kind === 'mp4' && window.sma?.toMp4) {
      const b = $('#v-banner'); b.textContent = 'Converting to MP4…'; b.hidden = false;
      try { const out = await window.sma.toMp4(await blob.arrayBuffer()); SMA.download('video.mp4', new Blob([out], { type: 'video/mp4' })); } catch (e) { alert('MP4 conversion failed: ' + e.message); SMA.download('video.webm', blob); }
      b.hidden = true;
    } else SMA.download('video.webm', blob);
  };
  exporting = true; speaker.gain.value = 0; // record silently
  const b = $('#v-banner'); b.textContent = 'Exporting in real time. Keep this window open…'; b.hidden = false;
  t = 0; seek(0); await new Promise(r => setTimeout(r, 400)); recorder.start(250); play();
}
function finishExport() { if (recorder && recorder.state !== 'inactive') setTimeout(() => recorder.stop(), 300); }

// ---------- wiring ----------
SIZES.forEach(([n], i) => $('#v-size').add(new Option(n, i)));
$('#v-size').onchange = () => { commit(); [, project.w, project.h] = SIZES[$('#v-size').value]; sizeCanvas(); draw(); save(); };
$('#v-play').onclick = () => (playing ? pause() : play());
$('#v-split').onclick = split; $('#v-del').onclick = del; $('#v-addtext').onclick = addText;
$('#v-add').onclick = () => { const f = $('#file'); f.accept = 'video/*,audio/*,image/*'; f.multiple = true; f.value = ''; f.onchange = () => { SMA.addFiles([...f.files]); f.multiple = false; }; f.click(); };
$('#v-zoom').oninput = e => { pps = +e.target.value; renderTimeline(); };
$('#v-export').onchange = e => { const k = e.target.value; e.target.value = ''; if (k) startExport(k); };
if (window.sma?.toMp4) $('#v-export').add(new Option('MP4 (desktop)', 'mp4'));
SMA.subscribe(() => { renderBin(); project.clips.forEach(c => { if (c.src) probe(c.src); }); if (document.body.classList.contains('video-mode')) draw(); });
document.addEventListener('keydown', ev => {
  if (!document.body.classList.contains('video-mode') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const k = ev.key.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
  if (k === ' ') { ev.preventDefault(); playing ? pause() : play(); }
  else if (k === 's' && !mod) split();
  else if (k === 'delete' || k === 'backspace') del();
  else if (k === 'escape') { replacing = null; $('#v-banner').hidden = true; }
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
