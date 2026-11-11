// Sudo Make Music: a tracker for hand-making retro handheld-style music. Original code for this project.
// The sound itself comes from src/chip.js; this file is the editor around it. Songs are saved as plain 'sudo-make-music' JSON.
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA, C = window.SMA_chip;
if (!SMA || !C || !$('#musicview')) return;
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clampi = (v, lo, hi) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; };
const hex = (n, w = 1) => n.toString(16).toUpperCase().padStart(w, '0');
const F = C.FIELDS;

let song = C.newSong(), orderPos = 0, cur = { row: 0, ch: 0, field: 0 }, octave = 4, step = 1, curInst = { pulse: 0, wave: 0, noise: 0 }, pid = null, name = 'Untitled song';
const engine = () => C.ENGINES[song.engine];
const chType = c => engine().channels[c].type;
const pat = () => song.patterns[song.order[orderPos]];
const NCH = () => engine().channels.length;
const cellI = (r, c, f = 0) => C.cellIndex(r, c, f, NCH());

// ---------- history ----------
const clone = s => ({ engine: s.engine, name: s.name, speed: s.speed, loopStart: s.loopStart, order: s.order.slice(), patterns: s.patterns.map(p => ({ rows: p.rows, data: new Uint8Array(p.data) })), inst: JSON.parse(JSON.stringify(s.inst)), ch: JSON.parse(JSON.stringify(s.ch)) });
const undoS = [], redoS = [];
const snap = () => ({ s: clone(song), orderPos, cur: { ...cur } });
function remember() { undoS.push(snap()); if (undoS.length > 200) undoS.shift(); redoS.length = 0; document.dispatchEvent(new Event('sma-edit')); }
const restore = h => { song = clone(h.s); orderPos = Math.min(h.orderPos, song.order.length - 1); cur = { ...h.cur }; refreshAll(); };
function undo() { const h = undoS.pop(); if (!h) return; redoS.push(snap()); restore(h); document.dispatchEvent(new Event('sma-edit')); }
function redo() { const h = redoS.pop(); if (!h) return; undoS.push(snap()); restore(h); document.dispatchEvent(new Event('sma-edit')); }
$('#mu-undo').onclick = undo; $('#mu-redo').onclick = redo;

// ---------- audio ----------
let actx = null, play = null, previewNode = null;
const ctx = () => { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; };
function toBuffer(r) { const ab = ctx().createBuffer(2, Math.max(1, r.length), r.sampleRate); ab.copyToChannel(r.L, 0); ab.copyToChannel(r.R, 1); return ab; }
function stop() { if (play) { try { play.src.onended = null; play.src.stop(); } catch (e) {} play = null; } $('#mu-play').textContent = '▶ Song'; $('#mu-playpat').textContent = '▶ Pattern'; document.querySelectorAll('#mu-trk .tr.now').forEach(r => r.classList.remove('now')); }
function start(r, loop, label) {
  stop(); if (!r.length) return; const c = ctx(), src = c.createBufferSource(); src.buffer = toBuffer(r); src.connect(c.destination);
  if (loop) { src.loop = true; src.loopStart = r.loopStart / r.sampleRate; src.loopEnd = r.length / r.sampleRate; }
  play = { src, r, t0: c.currentTime, loop, label }; src.onended = () => { if (play && play.src === src) stop(); }; src.start(); $(label === 'pat' ? '#mu-playpat' : '#mu-play').textContent = '■ Stop'; requestAnimationFrame(follow);
}
function follow() {
  if (!play) return; const p = play, c = actx; let t = (c.currentTime - p.t0) * p.r.sampleRate; const len = p.r.length;
  if (p.loop && t >= len) t = p.r.loopStart + ((t - p.r.loopStart) % Math.max(1, len - p.r.loopStart)); if (t < 0) t = 0;
  let lo = 0, hi = p.r.rows.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (p.r.rows[m].sample <= t) lo = m; else hi = m - 1; }
  const row = p.r.rows[lo]; if (row) { if (p.label === 'song' && row.order !== orderPos && row.order >= 0) { orderPos = row.order; renderOrder(); renderGrid(); } document.querySelectorAll('#mu-trk .tr.now').forEach(x => x.classList.remove('now')); const e = $('#mu-trk').querySelector(`.tr[data-r="${row.row}"]`); if (e) { e.classList.add('now'); const box = $('#mu-trk'); if (e.offsetTop < box.scrollTop + 40 || e.offsetTop > box.scrollTop + box.clientHeight - 40) box.scrollTop = e.offsetTop - box.clientHeight / 2; } }
  requestAnimationFrame(follow);
}
function playSong() { if (play) return stop(); start(C.render(song), $('#mu-loop').checked, 'song'); }
function playPattern() { if (play) return stop(); start(C.render(song, { pattern: song.order[orderPos] }), true, 'pat'); }
$('#mu-play').onclick = playSong; $('#mu-playpat').onclick = playPattern; $('#mu-stop').onclick = stop;
function preview(ch, note, inst) { // hear one note straight away
  try { const s = { ...song, order: [0], speed: 5, loopStart: 0, ch: song.ch.map((c, i) => ({ ...c, mute: false, solo: i === ch, pan: 'C' })) }, p = C.newPattern(8, NCH()), i = cellI(0, ch); p.data[i] = note + 1; p.data[i + 1] = inst + 1; s.patterns = [p];
    const r = C.render(s), c = ctx(); if (previewNode) try { previewNode.stop(); } catch (e) {} const n = c.createBufferSource(); n.buffer = toBuffer(r); n.connect(c.destination); n.start(); previewNode = n; } catch (e) {}
}

// ---------- the pattern grid ----------
const grid = $('#mu-trk');
const noteText = v => (v === 0 ? '···' : v === C.NOTE_CUT ? 'OFF' : C.noteName(v - 1));
function cellParts(r, c) { const d = pat().data, i = cellI(r, c); return [noteText(d[i]), d[i + 1] ? hex(d[i + 1] - 1) : '·', d[i + 2] ? hex(d[i + 2] - 1) : '·', d[i + 3] ? String.fromCharCode(d[i + 3]) : '·', d[i + 3] ? hex(d[i + 4] >> 4) : '·', d[i + 3] ? hex(d[i + 4] & 15) : '·']; }
function paintCell(r, c) { const row = grid.querySelector(`.tr[data-r="${r}"]`); if (!row) return; const cell = row.querySelectorAll('.cell')[c], parts = cellParts(r, c); cell.querySelectorAll('span').forEach((s, k) => { s.textContent = parts[k]; }); }
function renderGrid() {
  grid.textContent = ''; const head = el('div', { className: 'tr th' }); head.append(el('span', { className: 'rn' }, '')); engine().channels.forEach(c => head.append(el('span', { className: 'cell h' }, c.name))); grid.append(head);
  for (let r = 0; r < pat().rows; r++) {
    const row = el('div', { className: 'tr' + (r % 4 === 0 ? ' beat' : '') }); row.dataset.r = r; row.append(el('span', { className: 'rn' }, hex(r, 2)));
    for (let c = 0; c < NCH(); c++) { const cell = el('span', { className: 'cell' }); cellParts(r, c).forEach((t, k) => { const s = el('span', { className: 'f f' + k }, t); s.dataset.f = k; s.dataset.c = c; cell.append(s); }); row.append(cell); }
    grid.append(row);
  }
  markCursor();
}
grid.addEventListener('pointerdown', e => { const s = e.target.closest('.f'); if (!s) return; cur = { row: +s.closest('.tr').dataset.r, ch: +s.dataset.c, field: +s.dataset.f }; markCursor(); renderInstrument(); grid.focus(); });
function markCursor() { grid.querySelectorAll('.cur,.curc,.curr').forEach(x => x.classList.remove('cur', 'curc', 'curr')); const row = grid.querySelector(`.tr[data-r="${cur.row}"]`); if (!row) return; row.classList.add('curr'); const cell = row.querySelectorAll('.cell')[cur.ch]; cell.classList.add('curc'); const f = cell.querySelector('.f' + cur.field); if (f) f.classList.add('cur'); if (row.offsetTop < grid.scrollTop + 30 || row.offsetTop > grid.scrollTop + grid.clientHeight - 30) grid.scrollTop = row.offsetTop - grid.clientHeight / 2; }
function moveCur(dr, dc, df) { const rows = pat().rows; cur.row = (cur.row + dr + rows) % rows; if (dc) { cur.ch = (cur.ch + dc + NCH()) % NCH(); } if (df) { cur.field += df; if (cur.field > 5) { cur.field = 0; cur.ch = (cur.ch + 1) % NCH(); } if (cur.field < 0) { cur.field = 5; cur.ch = (cur.ch + NCH() - 1) % NCH(); } } markCursor(); if (dc || df) renderInstrument(); }

// ---------- editing cells ----------
const LOWER = 'zsxdcvgbhnjm,l.;/', UPPER = 'q2w3er5t6y7ui9o0p';
function noteFromKey(k) { let n = LOWER.indexOf(k); if (n >= 0) return octave * 12 + n; n = UPPER.indexOf(k); if (n >= 0) return (octave + 1) * 12 + n; return -1; }
function setCell(r, c, field, value) { pat().data[cellI(r, c, field)] = value; paintCell(r, c); }
function enterNote(n) { // n: note number, or C.NOTE_CUT
  remember(); const r = cur.row, c = cur.ch, t = chType(c);
  if (n === C.NOTE_CUT) setCell(r, c, 0, C.NOTE_CUT); else { n = clampi(n, 0, 95); setCell(r, c, 0, n + 1); if (!pat().data[cellI(r, c, 1)]) setCell(r, c, 1, curInst[t] + 1); preview(c, n, (pat().data[cellI(r, c, 1)] || 1) - 1); }
  moveCur(step, 0, 0);
}
function hexDigit(k) { return /^[0-9a-f]$/i.test(k) ? parseInt(k, 16) : -1; }
function typeField(k) {
  const c = cur.ch, r = cur.row, d = pat().data, f = cur.field;
  if (f === 0) { if (k === '`') { enterNote(C.NOTE_CUT); return true; } const n = noteFromKey(k.toLowerCase()); if (n >= 0) { enterNote(n); return true; } return false; }
  if (f === 1) { const h = hexDigit(k); if (h < 0) return false; remember(); setCell(r, c, 1, h + 1); curInst[chType(c)] = h; renderInstrument(); moveCur(step, 0, 0); return true; }
  if (f === 2) { const h = hexDigit(k); if (h < 0) return false; remember(); setCell(r, c, 2, h + 1); moveCur(step, 0, 0); return true; }
  if (f === 3) { const ch = k.toUpperCase(); if (!C.EFFECTS.includes(ch) || ch.length !== 1) return false; remember(); setCell(r, c, 3, ch.charCodeAt(0)); cur.field = 4; markCursor(); return true; }
  const h = hexDigit(k); if (h < 0 || !d[cellI(r, c, 3)]) return false; remember(); const i = cellI(r, c, 4), v = d[i];
  if (f === 4) { setCell(r, c, 4, (h << 4) | (v & 15)); cur.field = 5; markCursor(); } else { setCell(r, c, 4, (v & 0xf0) | h); cur.field = 3; moveCur(step, 0, 0); } return true;
}
function clearField() { remember(); const r = cur.row, c = cur.ch; if (cur.field === 0) setCell(r, c, 0, 0); else if (cur.field === 1) setCell(r, c, 1, 0); else if (cur.field === 2) setCell(r, c, 2, 0); else { setCell(r, c, 3, 0); setCell(r, c, 4, 0); } moveCur(step, 0, 0); }
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('music-mode') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === ' ') { e.preventDefault(); playSong(); return; }
  if (k === 'ArrowUp') { e.preventDefault(); moveCur(-1, 0, 0); } else if (k === 'ArrowDown') { e.preventDefault(); moveCur(1, 0, 0); } else if (k === 'ArrowLeft') { e.preventDefault(); moveCur(0, 0, -1); } else if (k === 'ArrowRight') { e.preventDefault(); moveCur(0, 0, 1); }
  else if (k === 'Tab') { e.preventDefault(); moveCur(0, e.shiftKey ? -1 : 1, 0); cur.field = 0; markCursor(); } else if (k === 'PageUp') { e.preventDefault(); moveCur(-16, 0, 0); } else if (k === 'PageDown') { e.preventDefault(); moveCur(16, 0, 0); }
  else if (k === 'Home') { e.preventDefault(); cur.row = 0; markCursor(); } else if (k === 'End') { e.preventDefault(); cur.row = pat().rows - 1; markCursor(); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); clearField(); }
  else if (k.length === 1 && typeField(k)) e.preventDefault();
});

// ---------- the song order and patterns ----------
function renderOrder() {
  const box = $('#mu-order'); box.textContent = '';
  song.order.forEach((p, i) => { const b = el('button', { type: 'button', className: 'oe' + (i === orderPos ? ' on' : '') }, `${hex(i, 2)}  pattern ${hex(p, 2)}${i === song.loopStart ? '  ↻' : ''}`); b.onclick = () => { orderPos = i; cur.row = Math.min(cur.row, pat().rows - 1); renderOrder(); renderGrid(); $('#mu-rows').value = pat().rows; }; box.append(b); });
  $('#mu-rows').value = pat().rows;
}
const orderOp = fn => { remember(); fn(); renderOrder(); renderGrid(); renderPatSelect(); };
const renderPatSelect = () => { $('#mu-rows').value = pat().rows; };
$('#mu-onew').onclick = () => orderOp(() => { song.patterns.push(C.newPattern(pat().rows, NCH())); song.order.splice(orderPos + 1, 0, song.patterns.length - 1); orderPos++; });
$('#mu-oclone').onclick = () => orderOp(() => { const p = pat(); song.patterns.push({ rows: p.rows, data: new Uint8Array(p.data) }); song.order.splice(orderPos + 1, 0, song.patterns.length - 1); orderPos++; });
$('#mu-oup').onclick = () => { if (orderPos < 1) return; orderOp(() => { [song.order[orderPos - 1], song.order[orderPos]] = [song.order[orderPos], song.order[orderPos - 1]]; if (song.loopStart === orderPos) song.loopStart--; else if (song.loopStart === orderPos - 1) song.loopStart++; orderPos--; }); };
$('#mu-odown').onclick = () => { if (orderPos >= song.order.length - 1) return; orderOp(() => { [song.order[orderPos + 1], song.order[orderPos]] = [song.order[orderPos], song.order[orderPos + 1]]; if (song.loopStart === orderPos) song.loopStart++; else if (song.loopStart === orderPos + 1) song.loopStart--; orderPos++; }); };
$('#mu-odel').onclick = () => { if (song.order.length < 2) return; orderOp(() => { song.order.splice(orderPos, 1); if (song.loopStart > orderPos) song.loopStart--; song.loopStart = Math.min(song.loopStart, song.order.length - 1); orderPos = Math.min(orderPos, song.order.length - 1); }); };
const stepPat = d => orderOp(() => { song.order[orderPos] = (song.order[orderPos] + d + song.patterns.length) % song.patterns.length; });
$('#mu-opm').onclick = () => stepPat(-1); $('#mu-opp').onclick = () => stepPat(1);
$('#mu-oloop').onclick = () => orderOp(() => { song.loopStart = orderPos; });
$('#mu-rows').onchange = e => { const n = +e.target.value, p = pat(); if (n === p.rows) return; remember(); const d = new Uint8Array(n * NCH() * F); d.set(p.data.subarray(0, Math.min(p.data.length, d.length))); p.rows = n; p.data = d; cur.row = Math.min(cur.row, n - 1); renderGrid(); };
function transposeChannel(delta) { remember(); const p = pat(), c = cur.ch; for (let r = 0; r < p.rows; r++) { const i = cellI(r, c); const n = p.data[i]; if (n > 0 && n !== C.NOTE_CUT) p.data[i] = clampi(n + delta, 1, 96); } renderGrid(); }
$('#mu-up1').onclick = () => transposeChannel(1); $('#mu-dn1').onclick = () => transposeChannel(-1); $('#mu-upo').onclick = () => transposeChannel(12); $('#mu-dno').onclick = () => transposeChannel(-12);
$('#mu-clrch').onclick = () => { remember(); const p = pat(); for (let r = 0; r < p.rows; r++) for (let f = 0; f < F; f++) p.data[cellI(r, cur.ch, f)] = 0; renderGrid(); };

// ---------- top bar ----------
for (let o = 0; o <= 7; o++) $('#mu-oct').append(el('option', { value: o }, String(o))); $('#mu-oct').value = octave; $('#mu-oct').onchange = e => { octave = +e.target.value; };
for (let s = 0; s <= 8; s++) $('#mu-step').append(el('option', { value: s }, String(s))); $('#mu-step').value = step; $('#mu-step').onchange = e => { step = +e.target.value; };
function showSpeed() { $('#mu-speed').value = song.speed; $('#mu-bpm').textContent = '≈ ' + Math.round(900 / song.speed) + ' BPM'; }
$('#mu-speed').onchange = e => { remember(); song.speed = clampi(e.target.value, 1, 31); showSpeed(); };
$('#mu-name').oninput = e => { name = e.target.value || 'Untitled song'; song.name = name; document.dispatchEvent(new Event('sma-edit')); };

// ---------- channels and instruments ----------
function renderChannels() {
  const box = $('#mu-chs'); box.textContent = '';
  engine().channels.forEach((chn, i) => { const cfg = song.ch[i], row = el('div', { className: 'mc' + (i === cur.ch ? ' on' : '') });
    const nm = el('b', {}, chn.name), m = el('button', { type: 'button', className: cfg.mute ? 'on' : '', title: 'Mute' }, 'M'), s = el('button', { type: 'button', className: cfg.solo ? 'on' : '', title: 'Solo' }, 'S');
    const pan = el('select', { title: 'Left, centre or right speaker' }); [['L', 'Left'], ['C', 'Both'], ['R', 'Right']].forEach(([v, t]) => pan.append(el('option', { value: v }, t))); pan.value = cfg.pan;
    const vol = el('input', { type: 'range', min: 0, max: 100, value: cfg.vol, title: 'Volume' });
    nm.onclick = () => { cur.ch = i; markCursor(); renderChannels(); renderInstrument(); }; m.onclick = () => { remember(); cfg.mute = !cfg.mute; renderChannels(); }; s.onclick = () => { remember(); cfg.solo = !cfg.solo; renderChannels(); };
    pan.onchange = () => { remember(); cfg.pan = pan.value; }; vol.oninput = () => { cfg.vol = +vol.value; }; vol.onchange = () => { document.dispatchEvent(new Event('sma-edit')); };
    row.append(nm, m, s, pan, vol); box.append(row); });
}
const SPEC = {
  pulse: [{ k: 'duty', t: 'Duty (tone)', sel: [['0', '12.5% thin'], ['1', '25%'], ['2', '50% full'], ['3', '75%']] }, { k: 'vol', t: 'Start volume', min: 0, max: 15 }, { k: 'dir', t: 'Fade', sel: [['0', 'None'], ['-1', 'Fade out'], ['1', 'Fade in']] }, { k: 'period', t: 'Fade speed (1 fast, 7 slow)', min: 0, max: 7 }],
  noise: [{ k: 'width7', t: 'Noise type', sel: [['false', 'Smooth (15-bit)'], ['true', 'Metallic (7-bit)']] }, { k: 'vol', t: 'Start volume', min: 0, max: 15 }, { k: 'dir', t: 'Fade', sel: [['0', 'None'], ['-1', 'Fade out'], ['1', 'Fade in']] }, { k: 'period', t: 'Fade speed (1 fast, 7 slow)', min: 0, max: 7 }],
  wave: [{ k: 'vol', t: 'Level', sel: [['1', '100%'], ['2', '50%'], ['3', '25%'], ['0', 'Mute']] }],
};
let slot = 0;
const bank = () => song.inst[chType(cur.ch)], inst = () => bank()[slot];
function renderInstrument() {
  const t = chType(cur.ch); slot = curInst[t]; $('#mu-insttype').textContent = '(' + t + ')';
  const sel = $('#mu-slot'); sel.textContent = ''; bank().forEach((b, i) => sel.append(el('option', { value: i }, `${hex(i)} ${b.name}`))); sel.value = slot; $('#mu-iname').value = inst().name;
  const box = $('#mu-inst'); box.textContent = '';
  SPEC[t].forEach(f => { const lab = el('label', {}, f.t + ' '), v = inst()[f.k]; let ctl;
    if (f.sel) { ctl = el('select'); f.sel.forEach(([val, txt]) => ctl.append(el('option', { value: val }, txt))); ctl.value = String(v); ctl.onchange = () => { remember(); const raw = ctl.value; inst()[f.k] = raw === 'true' ? true : raw === 'false' ? false : +raw; }; }
    else { const out = el('output', {}, String(v)); ctl = el('input', { type: 'range', min: f.min, max: f.max, value: v }); ctl.onpointerdown = () => remember(); ctl.oninput = () => { inst()[f.k] = +ctl.value; out.textContent = ctl.value; }; lab.append(ctl, out); box.append(lab); return; }
    lab.append(ctl); box.append(lab); });
  if (t === 'wave') waveEditor(box);
  renderChannels();
}
function waveEditor(box) {
  const cv = el('canvas', { width: 256, height: 128, id: 'mu-wave', title: 'Draw the wave shape: 32 steps, 16 heights' }), w = inst().wave, g = cv.getContext('2d');
  const draw = () => { g.fillStyle = '#15161c'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#8b5cf6'; for (let i = 0; i < 32; i++) g.fillRect(i * 8 + 1, 128 - (w[i] + 1) * 8, 6, (w[i] + 1) * 8); };
  const set = e => { const r = cv.getBoundingClientRect(), x = clampi(Math.floor((e.clientX - r.left) / r.width * 32), 0, 31), y = clampi(15 - Math.floor((e.clientY - r.top) / r.height * 16), 0, 15); w[x] = y; draw(); };
  let down = false; cv.onpointerdown = e => { remember(); down = true; cv.setPointerCapture(e.pointerId); set(e); }; cv.onpointermove = e => { if (down) set(e); }; cv.onpointerup = () => { down = false; preview(cur.ch, 45, slot); };
  const pre = el('div', { className: 'px-row' }); Object.keys(C.WAVES).forEach(k => { const b = el('button', { type: 'button' }, k); b.onclick = () => { remember(); C.WAVES[k].forEach((v, i) => { w[i] = v; }); draw(); preview(cur.ch, 45, slot); }; pre.append(b); });
  box.append(cv, pre); draw();
}
$('#mu-slot').onchange = e => { slot = +e.target.value; curInst[chType(cur.ch)] = slot; renderInstrument(); };
$('#mu-iname').oninput = e => { inst().name = e.target.value.slice(0, 24) || 'Instrument'; const o = $('#mu-slot').options[slot]; if (o) o.textContent = `${hex(slot)} ${inst().name}`; };
$('#mu-iname').onchange = () => document.dispatchEvent(new Event('sma-edit'));
$('#mu-try').onclick = () => preview(cur.ch, chType(cur.ch) === 'noise' ? 48 : 57, slot);

// ---------- the on-screen keyboard ----------
(function keyboard() {
  const kb = $('#mu-kb'), white = [0, 2, 4, 5, 7, 9, 11], black = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }; const W = 34; kb.style.width = (14 * W + 2) + 'px';
  const press = n => { grid.focus(); if (cur.field !== 0) { cur.field = 0; markCursor(); } enterNote(octave * 12 + n); };
  for (let o = 0; o < 2; o++) white.forEach((n, i) => { const k = el('button', { type: 'button', className: 'wk', title: C.noteName(octave * 12 + n + o * 12) }); k.style.left = (o * 7 + i) * W + 'px'; k.style.width = W + 'px'; k.onpointerdown = e => { e.preventDefault(); press(n + o * 12); }; kb.append(k); });
  for (let o = 0; o < 2; o++) Object.keys(black).forEach(n => { const k = el('button', { type: 'button', className: 'bk' }); k.style.left = (o * 7 + black[n]) * W + W - 11 + 'px'; k.onpointerdown = e => { e.preventDefault(); press(+n + o * 12); }; kb.append(k); });
})();

// ---------- new / open / example ----------
function refreshAll() { renderOrder(); renderGrid(); renderChannels(); renderInstrument(); showSpeed(); $('#mu-name').value = name = song.name; }
function loadSong(s, nm) { stop(); song = s; song.name = nm || song.name; orderPos = 0; cur = { row: 0, ch: 0, field: 0 }; undoS.length = redoS.length = 0; refreshAll(); }
$('#mu-new').onclick = () => $('#mu-newdlg').showModal(); $('#mu-newcancel').onclick = e => { e.preventDefault(); $('#mu-newdlg').close(); };
$('#mu-newok').onclick = e => { e.preventDefault(); pid = null; loadSong(C.newSong(), 'Untitled song'); $('#mu-newdlg').close(); };
$('#mu-open').onclick = async () => { const dlg = $('#mu-opendlg'), box = $('#mu-openlist'); dlg.showModal(); box.textContent = 'Loading…'; let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'music'); } catch (e) {} box.textContent = ''; if (!items.length) box.append(el('p', { className: 'hint' }, 'No saved songs yet. Everything you make is saved automatically.'));
  items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled song')); b.onclick = async () => { const r = await SMA.store.get(i.id); if (r) { api.load(r.data); pid = r.id; } dlg.close(); }; box.append(b); }); };
$('#mu-opencancel').onclick = e => { e.preventDefault(); $('#mu-opendlg').close(); };
function exampleSong() { // a short original loop in C minor
  const s = C.newSong(); s.name = 'Example: Pocket Quest'; s.speed = 6; s.patterns = [C.newPattern(32), C.newPattern(32)]; s.order = [0, 1];
  const put = (p, r, ch, note, o = {}) => { const d = s.patterns[p].data, i = C.cellIndex(r, ch, 0); d[i] = note === 'off' ? 255 : C.parseNote(note) + 1; if (o.inst !== undefined) d[i + 1] = o.inst + 1; if (o.vol !== undefined) d[i + 2] = o.vol + 1; if (o.fx) { d[i + 3] = o.fx.charCodeAt(0); d[i + 4] = o.fp || 0; } };
  for (let p = 0; p < 2; p++) {
    [[0, 'C-3'], [3, 'C-3'], [6, 'C-3'], [8, 'G#2'], [11, 'G#2'], [14, 'G#2'], [16, 'D#3'], [19, 'D#3'], [22, 'D#3'], [24, 'A#2'], [27, 'A#2'], [30, 'A#2']].forEach(([r, n]) => put(p, r, 2, n, { inst: 0 }));
    const lead = [[0, 'G-5'], [3, 'G-5'], [4, 'A#5'], [6, 'C-6'], [8, 'G#5'], [11, 'G-5'], [12, 'F-5'], [14, 'G-5'], [16, 'D#5'], [19, 'G-5'], [20, 'A#5'], [22, 'G-5'], [24, 'F-5'], [27, 'D#5'], [28, 'D-5'], [30, 'F-5']];
    lead.forEach(([r, n], k) => { const nn = p === 1 ? C.noteName(C.parseNote(n) + 12) : n; put(p, r, 0, nn, { inst: p === 1 ? 5 : 1, vol: 12, fx: k % 4 === 0 ? 'S' : undefined, fp: 1 }); });
    put(p, 15, 0, 'off'); put(p, 31, 0, 'off');
    [[0, 'C-4', '3'], [8, 'G#3', '4'], [16, 'D#4', '4'], [24, 'A#3', '4']].forEach(([r, n, m]) => put(p, r, 1, n, { inst: 3, vol: 6, fx: '0', fp: m === '3' ? 0x37 : 0x47 }));
    [0, 16].forEach(r => put(p, r, 3, 'E-3', { inst: 2 })); [8, 24].forEach(r => put(p, r, 3, 'G-4', { inst: 1 })); for (let r = 2; r < 32; r += 4) put(p, r, 3, 'C-7', { inst: 0 });
    if (p === 1) [30, 31].forEach(r => put(p, r, 3, 'C-6', { inst: 5 }));
  }
  return s;
}
$('#mu-example').onclick = () => { remember(); const keep = song.name; song = exampleSong(); song.name = keep === 'Untitled song' ? song.name : keep; orderPos = 0; cur = { row: 0, ch: 0, field: 0 }; refreshAll(); };

// ---------- saving ----------
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function serialize() { return JSON.stringify({ app: 'sudo-make-music', kind: 'song', v: 1, name: song.name, engine: song.engine, speed: song.speed, loopStart: song.loopStart, order: song.order, patterns: song.patterns.map(p => ({ rows: p.rows, data: b64(p.data) })), instruments: song.inst, channels: song.ch }); }
function load(json) {
  const o = JSON.parse(json); if (o.app !== 'sudo-make-music' || o.v !== 1) throw new Error('Not a Sudo Make Music file');
  const eng = C.ENGINES[o.engine]; if (!eng) throw new Error('This song needs a sound engine this version does not have'); const nch = eng.channels.length, bad = () => { throw new Error('Damaged song file'); };
  const patterns = o.patterns.map(p => { const rows = clampi(p.rows, 1, 128), data = unb64(p.data); if (data.length !== rows * nch * F) bad(); for (let i = 0; i < data.length; i += F) { if (data[i] > 96 && data[i] !== 255 || data[i + 1] > 16 || data[i + 2] > 16 || (data[i + 3] && !C.EFFECTS.includes(String.fromCharCode(data[i + 3])))) bad(); } return { rows, data }; });
  if (!patterns.length || !o.order.length || o.order.some(p => !Number.isInteger(p) || p < 0 || p >= patterns.length)) bad();
  const def = C.defaultInstruments(), inst = { pulse: def.pulse, wave: def.wave, noise: def.noise }, take = (kind, fn) => { (o.instruments && o.instruments[kind] || []).slice(0, 16).forEach((x, i) => { inst[kind][i] = fn(x, def[kind][i]); }); };
  const n = (v, lo, hi, d) => (Number.isFinite(+v) ? clampi(v, lo, hi) : d), nm = (x, d) => String(x && x.name || d.name).slice(0, 24);
  take('pulse', (x, d) => ({ name: nm(x, d), duty: n(x.duty, 0, 3, 2), vol: n(x.vol, 0, 15, 15), dir: n(x.dir, -1, 1, 0), period: n(x.period, 0, 7, 0) }));
  take('noise', (x, d) => ({ name: nm(x, d), width7: !!x.width7, vol: n(x.vol, 0, 15, 12), dir: n(x.dir, -1, 1, 0), period: n(x.period, 0, 7, 0) }));
  take('wave', (x, d) => ({ name: nm(x, d), wave: Array.isArray(x.wave) && x.wave.length === 32 ? x.wave.map(v => n(v, 0, 15, 0)) : d.wave, vol: n(x.vol, 0, 3, 1) }));
  const ch = eng.channels.map((_, i) => { const c = (o.channels || [])[i] || {}; return { mute: !!c.mute, solo: !!c.solo, pan: ['L', 'C', 'R'].includes(c.pan) ? c.pan : 'C', vol: n(c.vol, 0, 100, 100) }; });
  loadSong({ engine: o.engine, name: String(o.name || 'Untitled song').slice(0, 120), speed: n(o.speed, 1, 31, 6), loopStart: n(o.loopStart, 0, o.order.length - 1, 0), order: o.order.slice(), patterns, inst, ch });
}
function thumb() { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#2b2d38'; g.fillRect(0, 0, 128, 64); const p = song.patterns[song.order[0]], cols = ['#8b5cf6', '#41a6f6', '#73eff7', '#ef7d57']; for (let r = 0; r < Math.min(p.rows, 64); r++) for (let ch = 0; ch < NCH(); ch++) { const v = p.data[C.cellIndex(r, ch, 0, NCH())]; if (v && v !== 255) { g.fillStyle = cols[ch % 4]; g.fillRect(r * 2, 60 - ch * 14 - ((v - 1) % 12), 2, 3); } } return Promise.resolve(c.toDataURL('image/png')); }

// ---------- export ----------
const safeName = () => (song.name || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'song';
function download(blob, fname) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function wavBytes(times = 1) { const r = C.render(song); if (times === 1) return C.toWav(r); const n = r.length, tail = n - r.loopStart, total = n + tail * (times - 1), L = new Float32Array(total), R = new Float32Array(total); L.set(r.L); R.set(r.R); for (let k = 1; k < times; k++) { L.set(r.L.subarray(r.loopStart), n + tail * (k - 1)); R.set(r.R.subarray(r.loopStart), n + tail * (k - 1)); } return C.toWav({ L, R, length: total, sampleRate: r.sampleRate }); }
$('#mu-export').onchange = e => { const v = e.target.value; e.target.value = ''; if (v === 'wav' || v === 'wav2') download(new Blob([wavBytes(v === 'wav' ? 1 : 2)], { type: 'audio/wav' }), safeName() + '.wav'); };

// ---------- hooks for the rest of the app ----------
const api = {
  serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => name, setName: n => { name = n; song.name = n; $('#mu-name').value = n; }, load,
  show() { requestAnimationFrame(() => { markCursor(); }); }, hide() { stop(); },
  reset() { pid = null; loadSong(C.newSong(), 'Untitled song'); },
  wavBytes, info: () => ({ orderPos, orders: song.order.length, patterns: song.patterns.length, rows: pat().rows, cur: { ...cur }, speed: song.speed, undo: undoS.length, playing: !!play }),
  cell: (r, c) => Array.from(pat().data.subarray(cellI(r, c), cellI(r, c) + F)), song: () => song,
};
window.SMA_music = api;
refreshAll();
})();
