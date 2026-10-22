(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);
const svg = $('#canvas');

const SIZES = {
  'Instagram Post 1080×1080': [1080, 1080], 'Instagram Story 1080×1920': [1080, 1920],
  'Presentation 1920×1080': [1920, 1080], 'Poster A3 (300dpi) 3508×4961': [3508, 4961],
  'A4 (150dpi) 1240×1754': [1240, 1754], 'YouTube Thumbnail 1280×720': [1280, 720],
  'Facebook Cover 820×312': [820, 312], 'Business Card 1050×600': [1050, 600],
};
const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Trebuchet MS', 'Comic Sans MS'];

const TEMPLATES = {
  'Bold Announcement': () => ({ w: 1080, h: 1080, bg: '#fde68a', els: [
    mk('rect', { x: 60, y: 60, w: 960, h: 960, fill: 'none', stroke: '#111827', sw: 12 }),
    mk('text', { x: 120, y: 300, w: 840, h: 300, text: 'BIG SALE\nTHIS WEEK', fontSize: 150, bold: true, fill: '#111827', font: 'Impact' }),
    mk('ellipse', { x: 700, y: 700, w: 240, h: 240, fill: '#ef4444' }),
    mk('text', { x: 720, y: 790, w: 200, h: 60, text: '-50%', fontSize: 64, bold: true, fill: '#fff', align: 'middle' }),
  ] }),
  'Clean Quote': () => ({ w: 1080, h: 1080, bg: '#0f172a', els: [
    mk('text', { x: 100, y: 380, w: 880, h: 300, text: '“Make it simple,\nbut significant.”', fontSize: 80, fill: '#f8fafc', font: 'Georgia', italic: true, align: 'middle' }),
    mk('line', { x: 440, y: 760, w: 200, h: 0, stroke: '#8b5cf6', sw: 8 }),
    mk('text', { x: 100, y: 830, w: 880, h: 60, text: '— Don Draper', fontSize: 36, fill: '#94a3b8', align: 'middle' }),
  ] }),
};

let uid = 0;
function mk(type, o = {}) {
  const base = { id: 'e' + (++uid) + Date.now().toString(36), type, x: 100, y: 100, w: 300, h: 200, rot: 0,
    fill: '#8b5cf6', stroke: '#000000', sw: 0, opacity: 1, radius: 0 };
  if (type === 'text') Object.assign(base, { text: 'Your text', fontSize: 64, font: 'Arial', bold: false, italic: false, align: 'start', fill: '#111111', h: 80, w: 400 });
  if (type === 'line') Object.assign(base, { stroke: '#111111', sw: 6, fill: 'none', h: 0 });
  return Object.assign(base, o);
}

// ---------- state ----------
let doc = { w: 1080, h: 1080, bg: '#ffffff', els: [] };
let sel = null, zoom = 0.5, undoS = [], redoS = [];
const find = id => doc.els.find(e => e.id === id);

function commit() { // call BEFORE mutating
  undoS.push(JSON.stringify(doc)); if (undoS.length > 100) undoS.shift(); redoS = [];
}
function restore(json) { doc = JSON.parse(json); if (sel && !find(sel)) sel = null; render(); }
function autosave() { try { localStorage.setItem('sma-doc', JSON.stringify(doc)); } catch (e) {} }

// ---------- rendering ----------
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function star(w, h) {
  const pts = []; const cx = w / 2, cy = h / 2;
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.4 : 1, a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push((cx + Math.cos(a) * r * w / 2).toFixed(1) + ',' + (cy + Math.sin(a) * r * h / 2).toFixed(1)); }
  return pts.join(' ');
}
function drawEl(e, parent) {
  const g = el('g', { 'data-id': e.id, transform: `translate(${e.x} ${e.y}) rotate(${e.rot} ${e.w / 2} ${e.h / 2})`, opacity: e.opacity }, parent);
  const paint = { fill: e.fill, stroke: e.sw ? e.stroke : 'none', 'stroke-width': e.sw };
  if (e.type === 'rect') el('rect', { width: e.w, height: e.h, rx: e.radius, ...paint }, g);
  else if (e.type === 'ellipse') el('ellipse', { cx: e.w / 2, cy: e.h / 2, rx: e.w / 2, ry: e.h / 2, ...paint }, g);
  else if (e.type === 'star') el('polygon', { points: star(e.w, e.h), ...paint }, g);
  else if (e.type === 'line') el('line', { x1: 0, y1: 0, x2: e.w, y2: 0, stroke: e.stroke, 'stroke-width': Math.max(e.sw, 1), 'stroke-linecap': 'round' }, g);
  else if (e.type === 'image') el('image', { href: e.src, width: e.w, height: e.h, preserveAspectRatio: 'none' }, g);
  else if (e.type === 'text') {
    const t = el('text', { 'font-family': e.font, 'font-size': e.fontSize, 'font-weight': e.bold ? 700 : 400,
      'font-style': e.italic ? 'italic' : 'normal', fill: e.fill, 'text-anchor': e.align,
      x: e.align === 'middle' ? e.w / 2 : e.align === 'end' ? e.w : 0, 'xml:space': 'preserve',
      stroke: e.sw ? e.stroke : 'none', 'stroke-width': e.sw }, g);
    e.text.split('\n').forEach((ln, i) => { const s = el('tspan', { x: t.getAttribute('x'), y: e.fontSize * (0.85 + i * 1.2) }, t); s.textContent = ln || ' '; });
    e.h = e.fontSize * 1.2 * e.text.split('\n').length; // text box height follows content
    el('rect', { width: e.w, height: e.h, fill: 'transparent' }, g); // hit area
  }
  if (e.type === 'line') { e.h = 0; el('rect', { y: -10, width: e.w, height: 20, fill: 'transparent' }, g); }
}
function render() {
  svg.setAttribute('viewBox', `0 0 ${doc.w} ${doc.h}`);
  svg.setAttribute('width', doc.w * zoom); svg.setAttribute('height', doc.h * zoom);
  svg.style.background = doc.bg;
  svg.textContent = '';
  const art = el('g', { id: 'art' }, svg);
  doc.els.forEach(e => drawEl(e, art));
  drawHandles();
  renderProps();
  $('#zoomlbl').textContent = Math.round(zoom * 100) + '%';
  $('#status').textContent = `${doc.w}×${doc.h}px · ${doc.els.length} layers`;
  autosave();
}

// ---------- selection handles ----------
const HANDLES = [['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1]];
function drawHandles() {
  const e = sel && find(sel); if (!e) return;
  const s = 1 / zoom, g = el('g', { id: 'ui', transform: `translate(${e.x} ${e.y}) rotate(${e.rot} ${e.w / 2} ${e.h / 2})` }, svg);
  el('rect', { width: e.w, height: e.h, fill: 'none', stroke: '#8b5cf6', 'stroke-width': 2 * s, 'pointer-events': 'none' }, g);
  if (e.type !== 'line') HANDLES.forEach(([n, fx, fy]) =>
    el('rect', { 'data-h': n, x: fx * e.w - 6 * s, y: fy * e.h - 6 * s, width: 12 * s, height: 12 * s, fill: '#fff', stroke: '#8b5cf6', 'stroke-width': 2 * s, style: 'cursor:nwse-resize' }, g));
  else el('rect', { 'data-h': 'se', x: e.w - 6 * s, y: -6 * s, width: 12 * s, height: 12 * s, fill: '#fff', stroke: '#8b5cf6', 'stroke-width': 2 * s }, g);
  el('line', { x1: e.w / 2, y1: 0, x2: e.w / 2, y2: -30 * s, stroke: '#8b5cf6', 'stroke-width': 2 * s, 'pointer-events': 'none' }, g);
  el('circle', { 'data-h': 'rot', cx: e.w / 2, cy: -30 * s, r: 7 * s, fill: '#8b5cf6', style: 'cursor:grab' }, g);
}

// ---------- pointer interaction ----------
let drag = null;
const pt = ev => { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) / zoom, (ev.clientY - r.top) / zoom]; };
svg.addEventListener('pointerdown', ev => {
  const h = ev.target.closest('[data-h]'), g = ev.target.closest('[data-id]');
  const [px, py] = pt(ev);
  if (h && sel) {
    const e = find(sel); commit();
    drag = { kind: h.dataset.h, e, px, py, o: { ...e }, cx: e.x + e.w / 2, cy: e.y + e.h / 2 };
  } else if (g) {
    sel = g.dataset.id; const e = find(sel); commit();
    drag = { kind: 'move', e, px, py, o: { ...e } };
    // dblclick on text → focus the text box
    if (ev.detail === 2 && e.type === 'text') setTimeout(() => $('#p-text')?.focus(), 0);
  } else { sel = null; drag = null; render(); return; }
  svg.setPointerCapture(ev.pointerId); render();
});
svg.addEventListener('pointermove', ev => {
  if (!drag) return;
  const [px, py] = pt(ev), { e, o } = drag, dx = px - drag.px, dy = py - drag.py;
  if (drag.kind === 'move') { e.x = o.x + dx; e.y = o.y + dy; }
  else if (drag.kind === 'rot') {
    e.rot = Math.atan2(py - drag.cy, px - drag.cx) * 180 / Math.PI + 90;
    if (ev.shiftKey) e.rot = Math.round(e.rot / 15) * 15;
  } else { // resize: work in the element's local (rotated) axes
    const a = -o.rot * Math.PI / 180, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    const k = drag.kind, west = k.includes('w'), north = k.includes('n');
    let w = o.w + (west ? -lx : lx), h = o.h + (north ? -ly : ly);
    if (ev.shiftKey && o.h && e.type !== 'text') { const r = o.w / o.h; h = w / r; }
    w = Math.max(10, w); h = Math.max(e.type === 'line' || e.type === 'text' ? 0 : 10, h);
    if (e.type === 'text') { e.fontSize = Math.max(8, Math.round(o.fontSize * w / o.w)); }
    // keep the opposite corner fixed in world space
    const fx = west ? o.w : 0, fy = north ? o.h : 0, nfx = west ? w : 0, nfy = north ? h : 0;
    const rot = o.rot * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot);
    const world = (x, y, W, H) => [o.x + W / 2 + (x - W / 2) * c - (y - H / 2) * s, o.y + H / 2 + (x - W / 2) * s + (y - H / 2) * c];
    const [ox, oy] = world(fx, fy, o.w, o.h);
    const nw0 = { x: 0, y: 0 }; const [tx, ty] = (() => { const cxn = nw0.x + w / 2, cyn = nw0.y + h / 2;
      return [cxn + (nfx - w / 2) * c - (nfy - h / 2) * s, cyn + (nfx - w / 2) * s + (nfy - h / 2) * c]; })();
    e.w = w; e.h = h; e.x = ox - tx; e.y = oy - ty;
  }
  render();
});
svg.addEventListener('pointerup', () => { drag = null; });

// ---------- properties panel ----------
function row(label, input) { const l = document.createElement('label'); l.append(label, input); return l; }
function field(e, key, type = 'number', opts = {}) {
  const i = document.createElement('input'); i.type = type; i.value = e[key];
  if (type === 'range') Object.assign(i, { min: 0, max: 1, step: 0.05 });
  if (opts.min !== undefined) i.min = opts.min;
  i.onfocus = () => { i._c = false; };
  i.oninput = () => { if (!i._c) { commit(); i._c = true; } e[key] = type === 'number' || type === 'range' ? +i.value : i.value; redrawKeepFocus(i); };
  return i;
}
function redrawKeepFocus(i) { const id = i.id; render(); if (id) { const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} } } }
function renderProps() {
  const p = $('#props'); const active = document.activeElement;
  if (active && p.contains(active) && active.id) return; // don't rebuild while typing
  p.textContent = '';
  const e = sel && find(sel);
  const h = t => { const x = document.createElement('h4'); x.textContent = t; p.append(x); };
  if (!e) {
    h('Page');
    const bg = document.createElement('input'); bg.type = 'color'; bg.value = doc.bg;
    bg.oninput = () => { doc.bg = bg.value; svg.style.background = doc.bg; autosave(); };
    bg.onchange = () => { }; bg.onfocus = () => commit();
    p.append(row('Background', bg));
    const hint = document.createElement('p'); hint.style.opacity = .6;
    hint.textContent = 'Click an element to edit it. Shift while resizing keeps aspect ratio; Shift while rotating snaps to 15°.';
    p.append(hint); return;
  }
  h(e.type);
  if (e.type === 'text') {
    const t = document.createElement('textarea'); t.id = 'p-text'; t.value = e.text;
    t.oninput = () => { if (!t._c) { commit(); t._c = true; } e.text = t.value; redrawKeepFocus(t); };
    t.onblur = () => { t._c = false; render(); };
    p.append(t);
    const f = document.createElement('select'); FONTS.forEach(n => f.add(new Option(n, n, false, n === e.font)));
    f.onchange = () => { commit(); e.font = f.value; render(); };
    p.append(row('Font', f), row('Size', field(e, 'fontSize', 'number', { min: 8 })));
    const r = document.createElement('div'); r.className = 'row';
    [['B', 'bold'], ['I', 'italic']].forEach(([l, k]) => { const b = document.createElement('button'); b.textContent = l; b.style.opacity = e[k] ? 1 : .5; b.onclick = () => { commit(); e[k] = !e[k]; render(); }; r.append(b); });
    [['⇤', 'start'], ['↔', 'middle'], ['⇥', 'end']].forEach(([l, v]) => { const b = document.createElement('button'); b.textContent = l; b.style.opacity = e.align === v ? 1 : .5; b.onclick = () => { commit(); e.align = v; render(); }; r.append(b); });
    p.append(r);
  }
  if (e.type !== 'image') p.append(row(e.type === 'line' ? 'Color' : 'Fill', e.type === 'line' ? field(e, 'stroke', 'color') : field(e, 'fill', 'color')));
  if (e.type !== 'line' && e.type !== 'image') { h('Outline'); p.append(row('Color', field(e, 'stroke', 'color')), row('Width', field(e, 'sw', 'number', { min: 0 }))); }
  if (e.type === 'line') p.append(row('Thickness', field(e, 'sw', 'number', { min: 1 })));
  if (e.type === 'rect') p.append(row('Corner radius', field(e, 'radius', 'number', { min: 0 })));
  h('Arrange');
  p.append(row('Opacity', field(e, 'opacity', 'range')), row('Rotation', field(e, 'rot')),
    row('X', field(e, 'x')), row('Y', field(e, 'y')));
  if (e.type !== 'text') p.append(row('Width', field(e, 'w', 'number', { min: 1 })), ...(e.type === 'line' ? [] : [row('Height', field(e, 'h', 'number', { min: 1 }))]));
  const r = document.createElement('div'); r.className = 'row';
  [['Front', () => reorder(1, true)], ['Forward', () => reorder(1)], ['Back', () => reorder(-1)], ['Backmost', () => reorder(-1, true)], ['Duplicate', dup], ['Delete', del]]
    .forEach(([l, fn]) => { const b = document.createElement('button'); b.textContent = l; b.onclick = fn; r.append(b); });
  p.append(r);
}
function reorder(dir, edge) {
  const i = doc.els.findIndex(e => e.id === sel); if (i < 0) return; commit();
  const [e] = doc.els.splice(i, 1);
  doc.els.splice(edge ? (dir > 0 ? doc.els.length : 0) : Math.max(0, Math.min(doc.els.length, i + dir)), 0, e); render();
}
function dup() { const e = sel && find(sel); if (!e) return; commit(); const c = { ...e, id: mk('x').id, x: e.x + 30, y: e.y + 30 }; doc.els.push(c); sel = c.id; render(); }
function del() { if (!sel) return; commit(); doc.els = doc.els.filter(e => e.id !== sel); sel = null; render(); }

// ---------- toolbar ----------
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
  const t = b.dataset.add;
  if (t === 'image') { pick(file => readImage(file)); return; }
  commit();
  const e = mk(t, { x: doc.w / 2 - 150, y: doc.h / 2 - 100 });
  if (t === 'text') { e.x = doc.w / 2 - 200; }
  if (t === 'star' || t === 'ellipse') { e.w = e.h = 240; }
  doc.els.push(e); sel = e.id; render();
});
function pick(cb, accept = 'image/*') { const f = $('#file'); f.accept = accept; f.value = ''; f.onchange = () => f.files[0] && cb(f.files[0]); f.click(); }
function readImage(file) {
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, (doc.w * 0.6) / im.width, (doc.h * 0.6) / im.height);
    commit(); const e = mk('image', { src: r.result, w: im.width * k, h: im.height * k, x: 50, y: 50 });
    doc.els.push(e); sel = e.id; render(); }; im.src = r.result; };
  r.readAsDataURL(file);
}
// drag & drop images from disk
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')).forEach(readImage); });
document.addEventListener('paste', e => [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/')).forEach(readImage));

const sizeSel = $('#size');
Object.keys(SIZES).forEach(k => sizeSel.add(new Option(k, k)));
sizeSel.onchange = () => { commit(); [doc.w, doc.h] = SIZES[sizeSel.value]; fit(); };
Object.keys(TEMPLATES).forEach(k => $('#tpl').add(new Option(k, k)));
$('#tpl').onchange = ev => { const t = TEMPLATES[ev.target.value]; if (!t) return; commit(); const d = t(); doc = { w: d.w, h: d.h, bg: d.bg, els: d.els }; sel = null; ev.target.value = ''; fit(); };
$('#undo').onclick = () => { if (!undoS.length) return; redoS.push(JSON.stringify(doc)); restore(undoS.pop()); };
$('#redo').onclick = () => { if (!redoS.length) return; undoS.push(JSON.stringify(doc)); restore(redoS.pop()); };
function setZoom(z) { zoom = Math.max(0.05, Math.min(4, z)); render(); }
$('#zoomin').onclick = () => setZoom(zoom * 1.2); $('#zoomout').onclick = () => setZoom(zoom / 1.2);
function fit() { const s = $('#stage'); zoom = Math.min((s.clientWidth - 80) / doc.w, (s.clientHeight - 80) / doc.h, 1); render(); }
$('#fit').onclick = fit;
$('#stage').addEventListener('wheel', ev => { if (ev.ctrlKey) { ev.preventDefault(); setZoom(zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });

// ---------- save / open / export ----------
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
$('#save').onclick = () => download('design.smart.json', new Blob([JSON.stringify(doc)], { type: 'application/json' }));
$('#open').onclick = () => pick(f => f.text().then(t => { try { commit(); doc = JSON.parse(t); sel = null; fit(); } catch (e) { alert('Not a valid project file'); } }), '.json');
function cleanSVG() {
  const c = svg.cloneNode(true); c.querySelector('#ui')?.remove();
  c.setAttribute('width', doc.w); c.setAttribute('height', doc.h); c.style.background = '';
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', doc.w); bg.setAttribute('height', doc.h); bg.setAttribute('fill', doc.bg);
  c.insertBefore(bg, c.firstChild); c.setAttribute('xmlns', NS);
  return new XMLSerializer().serializeToString(c);
}
$('#export').onchange = ev => {
  const fmt = ev.target.value; ev.target.value = ''; if (!fmt) return;
  const xml = cleanSVG();
  if (fmt === 'svg') return download('design.svg', new Blob([xml], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = doc.w; cv.height = doc.h;
    const ctx = cv.getContext('2d'); if (fmt === 'jpg') { ctx.fillStyle = doc.bg; ctx.fillRect(0, 0, doc.w, doc.h); }
    ctx.drawImage(img, 0, 0, doc.w, doc.h);
    cv.toBlob(b => download('design.' + fmt, b), fmt === 'jpg' ? 'image/jpeg' : 'image/png', 0.95);
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
};

// ---------- keyboard ----------
document.addEventListener('keydown', ev => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
  if (mod && k === 'z') { ev.preventDefault(); $(ev.shiftKey ? '#redo' : '#undo').click(); }
  else if (mod && k === 'y') { ev.preventDefault(); $('#redo').click(); }
  else if (mod && k === 'd') { ev.preventDefault(); dup(); }
  else if (k === 'delete' || k === 'backspace') del();
  else if (k.startsWith('arrow') && sel) {
    ev.preventDefault(); const e = find(sel), d = ev.shiftKey ? 10 : 1; commit();
    if (k === 'arrowleft') e.x -= d; if (k === 'arrowright') e.x += d; if (k === 'arrowup') e.y -= d; if (k === 'arrowdown') e.y += d; render();
  } else if (k === 'escape') { sel = null; render(); }
});

// ---------- boot ----------
try { const s = localStorage.getItem('sma-doc'); if (s) doc = JSON.parse(s); } catch (e) {}
window.addEventListener('resize', () => { });
fit();
})();
