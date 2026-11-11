// Sudo Make Pixels: a pixel-art and sprite editor (layers, frames, palettes, GIF and sprite-sheet export).
// Original code for this project. Sprites are saved in a plain, versioned JSON format (see serialize) so other modes can use them later.
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA;
if (!SMA || !$('#pixview')) return;
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clampi = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
const hex2c = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 255]; };
const c2hex = c => '#' + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, '0')).join('');

// ---------- palettes (all generated here) ----------
function hsl(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return c2hex([f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round)); }
const PALETTES = {
  starter: ['#000000', '#3a3a4a', '#6e6e80', '#a8a8b8', '#d8d8e4', '#ffffff', ...[...Array(12)].flatMap((_, i) => [hsl(i * 30, 65, 36), hsl(i * 30, 65, 62)]), '#8d5524', '#f1c27d'],
  gray16: [...Array(16)].map((_, i) => c2hex([0, 1, 2].map(() => Math.round(i * 17)))),
  handheld4: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  pastel16: [...Array(12)].map((_, i) => hsl(i * 30, 55, 78)).concat(['#2b2b3a', '#6b6b80', '#b9b9c8', '#fffaf0']),
};

// ---------- the document ----------
// layers: [{name, visible, opacity}], frames: [{cels: [Uint8ClampedArray RGBA, one per layer]}]
let doc = blank(32, 32), fi = 0, li = 0, tool = 'pencil', fg = [0, 0, 0, 255], bg = [255, 255, 255, 255], size = 1, fillShapes = false, mirX = false, mirY = false;
let zoom = 12, panX = 0, panY = 0, grid = true, onion = false, playing = null, playIdx = 0, pid = null, name = 'Untitled sprite';
function blank(w, h) { return { w, h, fps: 8, palette: PALETTES.starter.slice(), layers: [{ name: 'Layer 1', visible: true, opacity: 100 }], frames: [{ cels: [new Uint8ClampedArray(w * h * 4)] }] }; }

const cv = $('#px-cv'), ov = $('#px-ov'), gr = $('#px-grid'), board = $('#px-board'), stage = $('#px-stage'), status = $('#px-status');
const off = document.createElement('canvas'), offPrev = document.createElement('canvas');

function compose(f, w = doc.w, h = doc.h) {
  const out = new Uint8ClampedArray(w * h * 4);
  doc.layers.forEach((L, i) => {
    if (!L.visible) return; const src = doc.frames[f].cels[i], k = L.opacity / 100;
    for (let p = 0; p < src.length; p += 4) {
      const sa = src[p + 3] * k / 255; if (!sa) continue; const da = out[p + 3] / 255, oa = sa + da * (1 - sa);
      out[p] = (src[p] * sa + out[p] * da * (1 - sa)) / oa; out[p + 1] = (src[p + 1] * sa + out[p + 1] * da * (1 - sa)) / oa; out[p + 2] = (src[p + 2] * sa + out[p + 2] * da * (1 - sa)) / oa; out[p + 3] = oa * 255;
    }
  });
  return out;
}
function toCanvas(c, f) { c.width = doc.w; c.height = doc.h; c.getContext('2d').putImageData(new ImageData(compose(f), doc.w, doc.h), 0, 0); return c; }

// ---------- drawing the editor ----------
function render() {
  const idx = playing ? playIdx : fi; cv.width = doc.w; cv.height = doc.h; const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, doc.w, doc.h);
  if (onion && !playing && fi > 0) { toCanvas(offPrev, fi - 1); ctx.globalAlpha = 0.3; ctx.drawImage(offPrev, 0, 0); ctx.globalAlpha = 1; }
  toCanvas(off, idx); ctx.drawImage(off, 0, 0);
}
function layoutView() {
  for (const c of [cv, ov]) { c.style.width = doc.w * zoom + 'px'; c.style.height = doc.h * zoom + 'px'; }
  board.style.width = doc.w * zoom + 'px'; board.style.height = doc.h * zoom + 'px'; board.style.transform = `translate(${Math.round(panX)}px,${Math.round(panY)}px)`;
  ov.width = doc.w; ov.height = doc.h; gr.width = doc.w * zoom; gr.height = doc.h * zoom; gr.style.width = gr.width + 'px'; gr.style.height = gr.height + 'px';
  const g = gr.getContext('2d'); g.clearRect(0, 0, gr.width, gr.height);
  if (grid && zoom >= 6) { g.strokeStyle = 'rgba(128,128,128,.45)'; g.lineWidth = 1; g.beginPath(); for (let x = 1; x < doc.w; x++) { g.moveTo(x * zoom + .5, 0); g.lineTo(x * zoom + .5, gr.height); } for (let y = 1; y < doc.h; y++) { g.moveTo(0, y * zoom + .5); g.lineTo(gr.width, y * zoom + .5); } g.stroke(); }
  $('#px-zoom').textContent = zoom + '×';
}
function fit() { const r = stage.getBoundingClientRect(); if (!r.width) return; zoom = clampi(Math.floor(Math.min((r.width - 40) / doc.w, (r.height - 40) / doc.h)), 1, 64); panX = (r.width - doc.w * zoom) / 2; panY = (r.height - doc.h * zoom) / 2; layoutView(); }
function zoomAt(nz, mx, my) { nz = clampi(nz, 1, 64); const px = (mx - panX) / zoom, py = (my - panY) / zoom; zoom = nz; panX = mx - px * zoom; panY = my - py * zoom; layoutView(); }

// ---------- history ----------
const undoS = [], redoS = []; let histBytes = 0;
const snapshot = () => ({ w: doc.w, h: doc.h, layers: doc.layers.map(l => ({ ...l })), frames: doc.frames.map(f => ({ cels: f.cels.map(c => new Uint8ClampedArray(c)) })), fi, li });
const restore = s => { doc.w = s.w; doc.h = s.h; doc.layers = s.layers.map(l => ({ ...l })); doc.frames = s.frames.map(f => ({ cels: f.cels.map(c => new Uint8ClampedArray(c)) })); fi = Math.min(s.fi, doc.frames.length - 1); li = Math.min(s.li, doc.layers.length - 1); };
function pushHist(e) { e.bytes = e.before.byteLength ? e.before.byteLength * 2 : (e.before.frames.length * e.before.layers.length * e.before.w * e.before.h * 8); undoS.push(e); histBytes += e.bytes; while (histBytes > 64e6 && undoS.length > 1) histBytes -= undoS.shift().bytes; redoS.length = 0; edited(); }
function applyEntry(e, which) { if (e.before.byteLength !== undefined) { const c = doc.frames[e.f] && doc.frames[e.f].cels[e.l]; if (c) c.set(which); fi = e.f; li = e.l; } else restore(which === e.after ? e.after : e.before); }
function undo() { if (playing) return; const e = undoS.pop(); if (!e) return; histBytes -= e.bytes; applyEntry(e, e.before); redoS.push(e); refreshAll(); document.dispatchEvent(new Event('sma-edit')); }
function redo() { if (playing) return; const e = redoS.pop(); if (!e) return; applyEntry(e, e.after); undoS.push(e); histBytes += e.bytes; refreshAll(); document.dispatchEvent(new Event('sma-edit')); }
function structure(fn) { const before = snapshot(); fn(); pushHist({ before, after: snapshot() }); refreshAll(); }
function edited() { document.dispatchEvent(new Event('sma-edit')); }

// ---------- pixel operations ----------
const cel = () => doc.frames[fi].cels[li];
function put(c, x, y, col) { if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return; const i = (y * doc.w + x) * 4; c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; c[i + 3] = col[3]; }
function plot(c, x, y, col) { put(c, x, y, col); if (mirX) put(c, doc.w - 1 - x, y, col); if (mirY) put(c, x, doc.h - 1 - y, col); if (mirX && mirY) put(c, doc.w - 1 - x, doc.h - 1 - y, col); }
function stamp(c, x, y, col) { const o = -((size - 1) >> 1); for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) plot(c, x + o + dx, y + o + dy, col); }
function lineCells(x0, y0, x1, y1) { const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, x = x0, y = y0; for (;;) { out.push([x, y]); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } } return out; }
function rectCells(x0, y0, x1, y1, filled) { const out = [], ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1); for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) out.push([x, y]); return out; }
function ellipseCells(x0, y0, x1, y1, filled) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1), rx = (bx - ax + 1) / 2, ry = (by - ay + 1) / 2, cx = ax + rx, cy = ay + ry, inside = new Set();
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry; if (dx * dx + dy * dy <= 1) inside.add(x + ',' + y); }
  const out = []; for (const k of inside) { const [x, y] = k.split(',').map(Number); if (filled || !(inside.has((x - 1) + ',' + y) && inside.has((x + 1) + ',' + y) && inside.has(x + ',' + (y - 1)) && inside.has(x + ',' + (y + 1)))) out.push([x, y]); } return out;
}
function floodFill(c, x, y, col) {
  if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return; const w = doc.w, i0 = (y * w + x) * 4, t = [c[i0], c[i0 + 1], c[i0 + 2], c[i0 + 3]];
  if (t[0] === col[0] && t[1] === col[1] && t[2] === col[2] && t[3] === col[3]) return;
  const same = i => c[i] === t[0] && c[i + 1] === t[1] && c[i + 2] === t[2] && c[i + 3] === t[3], stack = [[x, y]];
  while (stack.length) { let [sx, sy] = stack.pop(); while (sx > 0 && same((sy * w + sx - 1) * 4)) sx--; let up = false, dn = false;
    while (sx < w && same((sy * w + sx) * 4)) { put(c, sx, sy, col); if (sy > 0) { const s = same(((sy - 1) * w + sx) * 4); if (s && !up) stack.push([sx, sy - 1]); up = s; } if (sy < doc.h - 1) { const s = same(((sy + 1) * w + sx) * 4); if (s && !dn) stack.push([sx, sy + 1]); dn = s; } sx++; } }
}
function shiftCel(c, dx, dy) { const w = doc.w, h = doc.h, src = new Uint8ClampedArray(c); c.fill(0); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const a = (y * w + x) * 4, b = (ny * w + nx) * 4; c[b] = src[a]; c[b + 1] = src[a + 1]; c[b + 2] = src[a + 2]; c[b + 3] = src[a + 3]; } }
function flipCel(horizontal) { const c = cel(), before = new Uint8ClampedArray(c), w = doc.w, h = doc.h; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = (y * w + x) * 4, b = ((horizontal ? y : h - 1 - y) * w + (horizontal ? w - 1 - x : x)) * 4; for (let k = 0; k < 4; k++) c[a + k] = before[b + k]; } pushHist({ f: fi, l: li, before, after: new Uint8ClampedArray(c) }); render(); thumbs(); }

// ---------- pointer handling ----------
let drag = null, spaceDown = false;
const cellAt = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / zoom), Math.floor((e.clientY - r.top) / zoom)]; };
const colorFor = e => (e.button === 2 || drag && drag.button === 2 ? bg : fg);
function preview(cells, col) { const c = ov.getContext('2d'); c.clearRect(0, 0, doc.w, doc.h); c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},.75)`; for (const [x, y] of cells) { const o = -((size - 1) >> 1); for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) { const px = x + o + dx, py = y + o + dy, pts = [[px, py]]; if (mirX) pts.push([doc.w - 1 - px, py]); if (mirY) pts.push([px, doc.h - 1 - py]); if (mirX && mirY) pts.push([doc.w - 1 - px, doc.h - 1 - py]); for (const [qx, qy] of pts) c.fillRect(qx, qy, 1, 1); } } }
function hover(e) { if (drag || playing) return; const [x, y] = cellAt(e); status.textContent = x >= 0 && y >= 0 && x < doc.w && y < doc.h ? `${x}, ${y}` : ''; if (['pencil', 'eraser', 'line', 'rect', 'ellipse'].includes(tool) && x >= 0 && y >= 0 && x < doc.w && y < doc.h) preview([[x, y]], tool === 'eraser' ? [200, 200, 200, 255] : fg); else ov.getContext('2d').clearRect(0, 0, doc.w, doc.h); }
stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('pointermove', e => { if (!drag) return hover(e); move(e); });
stage.addEventListener('pointerleave', () => { if (!drag) ov.getContext('2d').clearRect(0, 0, doc.w, doc.h); });
stage.addEventListener('pointerdown', e => {
  if (playing) return; stage.setPointerCapture(e.pointerId);
  if (e.button === 1 || tool === 'hand' || spaceDown) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: panX, py: panY }; return; }
  const [x, y] = cellAt(e), col = e.button === 2 ? bg : fg; if (e.button > 2) return;
  if (!doc.layers[li].visible) { status.textContent = 'This layer is hidden: show it to draw on it.'; return; }
  const c = cel();
  if (tool === 'picker') { const k = compose(fi), i = (y * doc.w + x) * 4; if (x >= 0 && y >= 0 && x < doc.w && y < doc.h && k[i + 3]) { setColor(e.button === 2 ? 'bg' : 'fg', [k[i], k[i + 1], k[i + 2], 255]); } return; }
  if (tool === 'fill') { const before = new Uint8ClampedArray(c); floodFill(c, x, y, col); pushHist({ f: fi, l: li, before, after: new Uint8ClampedArray(c) }); render(); thumbs(); return; }
  drag = { kind: tool, button: e.button, start: [x, y], last: [x, y], before: new Uint8ClampedArray(c), col: tool === 'eraser' ? [0, 0, 0, 0] : col };
  if (tool === 'pencil' || tool === 'eraser') { stamp(c, x, y, drag.col); render(); } else if (tool === 'move') drag.dx = drag.dy = 0; else move(e);
});
function move(e) {
  if (drag.kind === 'pan') { panX = drag.px + e.clientX - drag.sx; panY = drag.py + e.clientY - drag.sy; board.style.transform = `translate(${Math.round(panX)}px,${Math.round(panY)}px)`; return; }
  const [x, y] = cellAt(e), c = cel(); status.textContent = `${x}, ${y}`;
  if (drag.kind === 'pencil' || drag.kind === 'eraser') { for (const [px, py] of lineCells(drag.last[0], drag.last[1], x, y)) stamp(c, px, py, drag.col); drag.last = [x, y]; render(); }
  else if (drag.kind === 'move') { drag.dx = x - drag.start[0]; drag.dy = y - drag.start[1]; c.set(drag.before); shiftCel(c, drag.dx, drag.dy); render(); }
  else { const [sx, sy] = drag.start; preview(drag.kind === 'line' ? lineCells(sx, sy, x, y) : drag.kind === 'rect' ? rectCells(sx, sy, x, y, fillShapes) : ellipseCells(sx, sy, x, y, fillShapes), drag.col); drag.last = [x, y]; }
}
const endDrag = e => {
  if (!drag) return; const d = drag; drag = null; if (d.kind === 'pan') { return; }
  const c = cel();
  if (d.kind === 'line' || d.kind === 'rect' || d.kind === 'ellipse') { const [sx, sy] = d.start, [x, y] = d.last, cells = d.kind === 'line' ? lineCells(sx, sy, x, y) : d.kind === 'rect' ? rectCells(sx, sy, x, y, fillShapes) : ellipseCells(sx, sy, x, y, fillShapes); for (const [px, py] of cells) stamp(c, px, py, d.col); ov.getContext('2d').clearRect(0, 0, doc.w, doc.h); }
  pushHist({ f: fi, l: li, before: d.before, after: new Uint8ClampedArray(c) }); render(); thumbs();
};
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(zoom + (e.deltaY < 0 ? 1 : -1) * Math.max(1, Math.round(zoom / 6)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

// ---------- tools and options ----------
function setTool(t) { tool = t; document.querySelectorAll('#px-tools button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); stage.style.cursor = t === 'hand' ? 'grab' : 'crosshair'; }
document.querySelectorAll('#px-tools button[data-tool]').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
$('#px-size').oninput = e => { size = clampi(e.target.value, 1, 16); $('#px-sizeout').textContent = size; };
$('#px-fill').onchange = e => { fillShapes = e.target.checked; };
$('#px-mx').onchange = e => { mirX = e.target.checked; }; $('#px-my').onchange = e => { mirY = e.target.checked; };
$('#px-grid-on').onchange = e => { grid = e.target.checked; layoutView(); };
$('#px-onion').onchange = e => { onion = e.target.checked; render(); };
$('#px-fliph').onclick = () => flipCel(true); $('#px-flipv').onclick = () => flipCel(false);
$('#px-zin').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(zoom + Math.max(1, Math.round(zoom / 6)), r.width / 2, r.height / 2); };
$('#px-zout').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(zoom - Math.max(1, Math.round(zoom / 6)), r.width / 2, r.height / 2); };
$('#px-fit').onclick = fit;
$('#px-undo').onclick = undo; $('#px-redo').onclick = redo;
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('pixels-mode') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', r: 'rect', o: 'ellipse', i: 'picker', m: 'move', h: 'hand' };
  if (map[k]) setTool(map[k]); else if (k === 'x') { const t = fg; fg = bg; bg = t; paintColors(); } else if (k === ' ') { spaceDown = true; e.preventDefault(); }
  else if (k === '[') { $('#px-size').value = clampi(size - 1, 1, 16); $('#px-size').oninput({ target: $('#px-size') }); } else if (k === ']') { $('#px-size').value = clampi(size + 1, 1, 16); $('#px-size').oninput({ target: $('#px-size') }); }
});
document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

// ---------- colors and palette ----------
function setColor(which, c) { if (which === 'fg') fg = c; else bg = c; paintColors(); }
function paintColors() { $('#px-fg').style.background = c2hex(fg); $('#px-bg').style.background = c2hex(bg); $('#px-color').value = c2hex(fg); document.querySelectorAll('#px-pal .sw').forEach(s => s.classList.toggle('on', s.dataset.c === c2hex(fg))); }
function renderPalette() {
  const box = $('#px-pal'); box.textContent = '';
  doc.palette.forEach((h, i) => { const s = el('button', { type: 'button', className: 'sw', title: h + '  (right-click: second color, Shift+click: remove)' }); s.dataset.c = h; s.style.background = h;
    s.onclick = e => { if (e.shiftKey) { doc.palette.splice(i, 1); renderPalette(); edited(); } else setColor('fg', hex2c(h)); };
    s.oncontextmenu = e => { e.preventDefault(); setColor('bg', hex2c(h)); }; box.append(s); });
  paintColors();
}
$('#px-color').oninput = e => { setColor('fg', hex2c(e.target.value)); };
$('#px-addcolor').onclick = () => { const h = c2hex(fg); if (!doc.palette.includes(h)) { doc.palette.push(h); renderPalette(); edited(); } };
$('#px-swap').onclick = () => { const t = fg; fg = bg; bg = t; paintColors(); };
$('#px-palsel').onchange = e => { if (PALETTES[e.target.value]) { doc.palette = PALETTES[e.target.value].slice(); renderPalette(); edited(); } e.target.value = ''; };

// ---------- layers ----------
function renderLayers() {
  const box = $('#px-layers'); box.textContent = '';
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i], row = el('div', { className: 'ly' + (i === li ? ' on' : '') }), eye = el('input', { type: 'checkbox', checked: L.visible, title: 'Show or hide' }), nm = el('input', { type: 'text', value: L.name, maxLength: 40 });
    eye.onchange = () => { L.visible = eye.checked; render(); thumbs(); edited(); }; nm.onchange = () => { L.name = nm.value || 'Layer'; edited(); }; nm.onfocus = () => { li = i; markLayer(); };
    row.onclick = e => { if (e.target === row) { li = i; refreshLayerUi(); } }; nm.onclick = () => { li = i; markLayer(); }; row.append(eye, nm); box.append(row);
  }
  $('#px-opacity').value = doc.layers[li].opacity; $('#px-opout').textContent = doc.layers[li].opacity;
}
function markLayer() { document.querySelectorAll('#px-layers .ly').forEach((r, k) => r.classList.toggle('on', doc.layers.length - 1 - k === li)); $('#px-opacity').value = doc.layers[li].opacity; $('#px-opout').textContent = doc.layers[li].opacity; }
function refreshLayerUi() { renderLayers(); }
$('#px-opacity').oninput = e => { doc.layers[li].opacity = clampi(e.target.value, 0, 100); $('#px-opout').textContent = doc.layers[li].opacity; render(); thumbs(); };
$('#px-opacity').onchange = edited;
$('#px-ladd').onclick = () => structure(() => { doc.layers.splice(li + 1, 0, { name: 'Layer ' + (doc.layers.length + 1), visible: true, opacity: 100 }); doc.frames.forEach(f => f.cels.splice(li + 1, 0, new Uint8ClampedArray(doc.w * doc.h * 4))); li++; });
$('#px-ldup').onclick = () => structure(() => { const L = doc.layers[li]; doc.layers.splice(li + 1, 0, { ...L, name: L.name + ' copy' }); doc.frames.forEach(f => f.cels.splice(li + 1, 0, new Uint8ClampedArray(f.cels[li]))); li++; });
$('#px-ldel').onclick = () => { if (doc.layers.length < 2) return; structure(() => { doc.layers.splice(li, 1); doc.frames.forEach(f => f.cels.splice(li, 1)); li = Math.max(0, li - 1); }); };
const moveLayer = d => { const j = li + d; if (j < 0 || j >= doc.layers.length) return; structure(() => { [doc.layers[li], doc.layers[j]] = [doc.layers[j], doc.layers[li]]; doc.frames.forEach(f => { [f.cels[li], f.cels[j]] = [f.cels[j], f.cels[li]]; }); li = j; }); };
$('#px-lup').onclick = () => moveLayer(1); $('#px-ldown').onclick = () => moveLayer(-1);
$('#px-lmerge').onclick = () => { if (li < 1) return; structure(() => { const below = li - 1; doc.frames.forEach((f, k) => { const keep = doc.layers.map(L => L.visible); const tmp = { ...doc, layers: [doc.layers[below], doc.layers[li]].map(L => ({ ...L, visible: true })), frames: [{ cels: [f.cels[below], f.cels[li]] }] }; const saveDoc = doc; doc = tmp; const out = compose(0); doc = saveDoc; f.cels[below] = new Uint8ClampedArray(out); f.cels.splice(li, 1); }); doc.layers[below].opacity = 100; doc.layers.splice(li, 1); li = below; }); };

// ---------- frames ----------
function thumbs() {
  const box = $('#px-strip'); if (box.children.length !== doc.frames.length) return renderFrames();
  box.children[fi] && drawThumb(box.children[fi].querySelector('canvas'), fi);
}
function drawThumb(c, f) { const s = Math.max(1, Math.floor(56 / Math.max(doc.w, doc.h))); c.width = doc.w; c.height = doc.h; c.style.width = doc.w * s + 'px'; c.style.height = doc.h * s + 'px'; c.getContext('2d').putImageData(new ImageData(compose(f), doc.w, doc.h), 0, 0); }
function renderFrames() {
  const box = $('#px-strip'); box.textContent = '';
  doc.frames.forEach((f, i) => { const b = el('button', { type: 'button', className: 'fr' + (i === fi ? ' on' : ''), title: 'Frame ' + (i + 1) }), c = el('canvas'); drawThumb(c, i); b.append(c, el('small', {}, String(i + 1))); b.onclick = () => { if (playing) return; fi = i; render(); renderFrames(); }; box.append(b); });
  $('#px-fps').value = doc.fps;
}
$('#px-fadd').onclick = () => structure(() => { doc.frames.splice(fi + 1, 0, { cels: doc.layers.map(() => new Uint8ClampedArray(doc.w * doc.h * 4)) }); fi++; });
$('#px-fdup').onclick = () => structure(() => { doc.frames.splice(fi + 1, 0, { cels: doc.frames[fi].cels.map(c => new Uint8ClampedArray(c)) }); fi++; });
$('#px-fdel').onclick = () => { if (doc.frames.length < 2) return; structure(() => { doc.frames.splice(fi, 1); fi = Math.max(0, fi - 1); }); };
const moveFrame = d => { const j = fi + d; if (j < 0 || j >= doc.frames.length) return; structure(() => { [doc.frames[fi], doc.frames[j]] = [doc.frames[j], doc.frames[fi]]; fi = j; }); };
$('#px-fleft').onclick = () => moveFrame(-1); $('#px-fright').onclick = () => moveFrame(1);
$('#px-fps').onchange = e => { doc.fps = clampi(e.target.value, 1, 60); e.target.value = doc.fps; edited(); };
$('#px-play').onclick = () => { if (playing) return stop(); playIdx = fi; $('#px-play').textContent = '■ Stop'; render(); playing = setInterval(() => { playIdx = (playIdx + 1) % doc.frames.length; render(); document.querySelectorAll('#px-strip .fr').forEach((b, k) => b.classList.toggle('on', k === playIdx)); }, 1000 / doc.fps); };
function stop() { if (!playing) return; clearInterval(playing); playing = null; $('#px-play').textContent = '▶ Play'; render(); renderFrames(); }

// ---------- everything at once ----------
function refreshAll() { layoutView(); render(); renderLayers(); renderFrames(); renderPalette(); $('#px-info').textContent = `${doc.w}×${doc.h} px · ${doc.frames.length} frame${doc.frames.length === 1 ? '' : 's'} · ${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'}`; }
function loadDoc(d, nm) { stop(); doc = d; fi = 0; li = 0; undoS.length = redoS.length = 0; histBytes = 0; name = nm || 'Untitled sprite'; $('#px-name').value = name; refreshAll(); fit(); }
function newDoc(w, h) { pid = null; loadDoc(blank(w, h)); }
$('#px-name').oninput = e => { name = e.target.value || 'Untitled sprite'; edited(); };

// ---------- new / open ----------
const newDlg = $('#px-newdlg'), openDlg = $('#px-opendlg');
$('#px-new').onclick = () => { stop(); newDlg.showModal(); };
document.querySelectorAll('#px-newdlg [data-size]').forEach(b => { b.onclick = () => { $('#px-nw').value = b.dataset.size; $('#px-nh').value = b.dataset.size; }; });
$('#px-newok').onclick = e => { e.preventDefault(); newDoc(clampi($('#px-nw').value, 1, 512), clampi($('#px-nh').value, 1, 512)); newDlg.close(); };
$('#px-newcancel').onclick = e => { e.preventDefault(); newDlg.close(); };
$('#px-open').onclick = async () => {
  stop(); const list = $('#px-openlist'); list.textContent = 'Loading…'; openDlg.showModal();
  let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'pixel'); } catch (e) {}
  list.textContent = ''; if (!items.length) list.append(el('p', { className: 'hint' }, 'No saved sprites yet. Everything you draw is saved automatically.'));
  items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled sprite')); b.onclick = async () => { const r = await SMA.store.get(i.id); if (r) { api.load(r.data); pid = r.id; } openDlg.close(); }; list.append(b); });
};
$('#px-opencancel').onclick = e => { e.preventDefault(); openDlg.close(); };

// ---------- saving: a plain versioned format other modes can read ----------
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8ClampedArray.from(atob(s), c => c.charCodeAt(0));
function serialize() {
  return JSON.stringify({ app: 'sudo-make-pixels', kind: 'sprite', v: 1, name, width: doc.w, height: doc.h, fps: doc.fps, palette: doc.palette, layers: doc.layers,
    frames: doc.frames.map(f => ({ cels: f.cels.map(c => b64(new Uint8Array(c.buffer, c.byteOffset, c.byteLength))) })) }); // each cel is raw RGBA, row by row
}
function load(json) {
  const o = JSON.parse(json); if (o.app !== 'sudo-make-pixels' || o.v !== 1) throw new Error('Not a Sudo Make Pixels file');
  const w = clampi(o.width, 1, 512), h = clampi(o.height, 1, 512), n = w * h * 4;
  const layers = o.layers.map(l => ({ name: String(l.name || 'Layer').slice(0, 40), visible: !!l.visible, opacity: clampi(l.opacity, 0, 100) }));
  const frames = o.frames.map(f => ({ cels: f.cels.map(c => { const a = unb64(c); if (a.length !== n) throw new Error('Damaged sprite file'); return a; }) }));
  if (!layers.length || !frames.length || frames.some(f => f.cels.length !== layers.length)) throw new Error('Damaged sprite file');
  loadDoc({ w, h, fps: clampi(o.fps, 1, 60), palette: (o.palette || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 256), layers, frames }, String(o.name || 'Untitled sprite').slice(0, 120));
}
function thumb() { const c = document.createElement('canvas'), s = toCanvas(document.createElement('canvas'), 0), k = Math.max(1, Math.floor(128 / Math.max(doc.w, doc.h))); c.width = doc.w * k; c.height = doc.h * k; const x = c.getContext('2d'); x.fillStyle = '#2b2d38'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, c.width, c.height); return Promise.resolve(c.toDataURL('image/png')); }

// ---------- export ----------
function download(blob, fname) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const safeName = () => (name || 'sprite').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'sprite';
const scaleSel = () => clampi($('#px-scale').value, 1, 64);
function scaled(f, s) { const c = document.createElement('canvas'); c.width = doc.w * s; c.height = doc.h * s; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(toCanvas(document.createElement('canvas'), f), 0, 0, c.width, c.height); return c; }
const blobOf = c => new Promise(res => c.toBlob(res, 'image/png'));
async function exportPng() { download(await blobOf(scaled(fi, scaleSel())), safeName() + '.png'); }
async function exportSheet() {
  const s = scaleSel(), n = doc.frames.length, cols = clampi($('#px-cols').value || n, 1, n), rows = Math.ceil(n / cols), c = document.createElement('canvas'); c.width = doc.w * s * cols; c.height = doc.h * s * rows; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i++) x.drawImage(scaled(i, s), (i % cols) * doc.w * s, Math.floor(i / cols) * doc.h * s);
  download(await blobOf(c), safeName() + '-sheet.png');
}
function exportGif() { const s = scaleSel(), frames = doc.frames.map((_, i) => compose(i)); download(new Blob([gifEncode(frames, doc.w, doc.h, s, doc.fps)], { type: 'image/gif' }), safeName() + '.gif'); }
$('#px-export').onchange = async e => { const v = e.target.value; e.target.value = ''; stop(); try { if (v === 'png') await exportPng(); else if (v === 'sheet') await exportSheet(); else if (v === 'gif') exportGif(); } catch (err) { status.textContent = 'Export failed: ' + err.message; } };

// An original GIF encoder: exact palette (up to 255 colours + transparency), most-used colours when there are more, LZW compression.
function gifEncode(frames, w, h, scale, fps) {
  const counts = new Map(); let hasT = false;
  for (const f of frames) for (let p = 0; p < f.length; p += 4) { if (f[p + 3] < 128) { hasT = true; continue; } const k = f[p] << 16 | f[p + 1] << 8 | f[p + 2]; counts.set(k, (counts.get(k) || 0) + 1); }
  let colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); const maxC = hasT ? 255 : 256; if (colors.length > maxC) colors = colors.slice(0, maxC);
  const pal = hasT ? [0, ...colors] : colors.length ? colors : [0], base = hasT ? 1 : 0, index = new Map(colors.map((k, i) => [k, i + base])), cache = new Map();
  const nearest = k => { let v = cache.get(k); if (v !== undefined) return v; const r = k >> 16, g = k >> 8 & 255, b = k & 255; let best = 1e9; v = base; for (let i = base; i < pal.length; i++) { const q = pal[i], d = (r - (q >> 16)) ** 2 + (g - (q >> 8 & 255)) ** 2 + (b - (q & 255)) ** 2; if (d < best) { best = d; v = i; } } cache.set(k, v); return v; };
  const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, pal.length)))), tableSize = 1 << bits, W = w * scale, H = h * scale, out = [];
  const u16 = n => out.push(n & 255, n >> 8 & 255), str = s => { for (const ch of s) out.push(ch.charCodeAt(0)); };
  str('GIF89a'); u16(W); u16(H); out.push(0x80 | (bits - 1) << 4 | (bits - 1), 0, 0);
  for (let i = 0; i < tableSize; i++) { const k = pal[i] || 0; out.push(k >> 16 & 255, k >> 8 & 255, k & 255); }
  out.push(0x21, 0xff, 11); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0); // loop forever
  const delay = Math.max(2, Math.round(100 / fps));
  for (const f of frames) {
    const idx = new Uint8Array(w * h); for (let i = 0, p = 0; i < idx.length; i++, p += 4) idx[i] = f[p + 3] < 128 ? 0 : (index.get(f[p] << 16 | f[p + 1] << 8 | f[p + 2]) ?? nearest(f[p] << 16 | f[p + 1] << 8 | f[p + 2]));
    let px = idx; if (scale > 1) { px = new Uint8Array(W * H); for (let y = 0; y < H; y++) { const sy = Math.floor(y / scale) * w; for (let x = 0; x < W; x++) px[y * W + x] = idx[sy + Math.floor(x / scale)]; } }
    out.push(0x21, 0xf9, 4, (2 << 2) | (hasT ? 1 : 0)); u16(delay); out.push(0, 0);
    out.push(0x2c); u16(0); u16(0); u16(W); u16(H); out.push(0);
    const minBits = Math.max(2, bits); out.push(minBits); const data = lzw(px, minBits);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(data[i + j]); } out.push(0);
  }
  out.push(0x3b); return new Uint8Array(out);
}
function lzw(px, minBits) {
  const clear = 1 << minBits, eoi = clear + 1, out = []; let codeSize = minBits + 1, next = eoi + 1, cur = 0, nb = 0, dict = new Map();
  const emit = c => { cur |= c << nb; nb += codeSize; while (nb >= 8) { out.push(cur & 255); cur >>>= 8; nb -= 8; } };
  emit(clear); let prefix = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i], key = prefix * 256 + k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << codeSize) && codeSize < 12) codeSize++; } else { emit(clear); dict.clear(); codeSize = minBits + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix); emit(eoi); if (nb) out.push(cur & 255); return out;
}

// ---------- hooks for the rest of the app ----------
const api = {
  serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => name, setName: n => { name = n; $('#px-name').value = n; }, load,
  show() { requestAnimationFrame(() => { if (!stage.getBoundingClientRect().width) return; if (!api._shown) { api._shown = true; fit(); } else layoutView(); }); }, hide() { stop(); },
  reset() { newDoc(32, 32); },
  gifBytes: (scale = 1) => gifEncode(doc.frames.map((_, i) => compose(i)), doc.w, doc.h, scale, doc.fps),
  // for tests and for other modes: read a pixel of the composited frame
  getPixel: (x, y, f = fi) => { const k = compose(f), i = (y * doc.w + x) * 4; return [k[i], k[i + 1], k[i + 2], k[i + 3]]; },
  info: () => ({ w: doc.w, h: doc.h, frames: doc.frames.length, layers: doc.layers.length, fi, li, undo: undoS.length }),
};
window.SMA_pixels = api;
window.addEventListener('resize', () => { if (document.body.classList.contains('pixels-mode')) fit(); });
setTool('pencil'); refreshAll();
})();
