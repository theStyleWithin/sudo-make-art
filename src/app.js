(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);
const svg = $('#canvas');

const PRESETS = {
  'Social media': [['Instagram Post (4:5)', 1080, 1350], ['Instagram Post (Square)', 1080, 1080], ['Instagram Story / Reel', 1080, 1920],
    ['Facebook Post', 1200, 630], ['Facebook Cover', 820, 312], ['Facebook Story', 1080, 1920], ['LinkedIn Post', 1200, 627],
    ['LinkedIn Cover', 1584, 396], ['Pinterest Pin (2:3)', 1000, 1500], ['TikTok Video / Cover', 1080, 1920], ['X / Twitter Post', 1600, 900],
    ['WhatsApp Status', 1080, 1920], ['YouTube Thumbnail', 1280, 720], ['YouTube Banner', 2560, 1440], ['YouTube Profile Picture', 800, 800],
    ['YouTube Shorts', 1080, 1920]],
  'Presentation': [['Presentation 16:9', 1920, 1080], ['Presentation 4:3', 1600, 1200]],
  'Print': [['A4 (150 dpi)', 1240, 1754], ['A3 Poster (300 dpi)', 3508, 4961], ['Letter (150 dpi)', 1275, 1650], ['Business Card', 1050, 600]],
};
const FLAT = Object.values(PRESETS).flat();
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
  if (type === 'text') Object.assign(base, { text: 'Your text', fontSize: 64, font: 'Arial', bold: false, italic: false, align: 'start', fill: '#111111', h: 80, w: 400, curve: 0 });
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
  if (e.type === 'text') layoutText(e); // text height depends on content/curve; needed before the rotate transform
  const g = el('g', { 'data-id': e.id, transform: `translate(${e.x} ${e.y}) rotate(${e.rot} ${e.w / 2} ${e.h / 2})`, opacity: e.opacity }, parent);
  const paint = { fill: e.fill, stroke: e.sw ? e.stroke : 'none', 'stroke-width': e.sw };
  if (e.type === 'rect') el('rect', { width: e.w, height: e.h, rx: e.radius, ...paint }, g);
  else if (e.type === 'ellipse') el('ellipse', { cx: e.w / 2, cy: e.h / 2, rx: e.w / 2, ry: e.h / 2, ...paint }, g);
  else if (e.type === 'star') el('polygon', { points: star(e.w, e.h), ...paint }, g);
  else if (e.type === 'line') el('line', { x1: 0, y1: 0, x2: e.w, y2: 0, stroke: e.stroke, 'stroke-width': Math.max(e.sw, 1), 'stroke-linecap': 'round' }, g);
  else if (e.type === 'image') {
    const c = e.crop;
    if (c && e.nw) { // cropped: a nested svg clips the full image to the kept region
      const s = el('svg', { width: e.w, height: e.h, viewBox: `${c.x * e.nw} ${c.y * e.nh} ${c.w * e.nw} ${c.h * e.nh}`, preserveAspectRatio: 'none' }, g);
      el('image', { href: e.src, width: e.nw, height: e.nh, preserveAspectRatio: 'none' }, s);
    } else el('image', { href: e.src, width: e.w, height: e.h, preserveAspectRatio: 'none' }, g);
  }
  else if (e.type === 'text') drawText(e, g);
  if (e.type === 'line') { e.h = 0; el('rect', { y: -10, width: e.w, height: 20, fill: 'transparent' }, g); }
}

// ---------- text (flat and curved) ----------
const mctx = document.createElement('canvas').getContext('2d');
function textWidth(e, s) {
  mctx.font = `${e.italic ? 'italic ' : ''}${e.bold ? 700 : 400} ${e.fontSize}px "${e.font}"`;
  return mctx.measureText(s || ' ').width;
}
// curve -100..100: arc angle up to 324°; positive arches up (rainbow), negative sags (smile)
const arcAngle = e => Math.max(0.01, Math.abs(e.curve) / 100 * Math.PI * 1.8);
function sagOf(e) { // vertical drop from the arc apex to its ends, widest line wins
  if (!e.curve) return 0;
  const th = arcAngle(e);
  return Math.max(...e.text.split('\n').map(l => textWidth(e, l) / th * (1 - Math.cos(th / 2))));
}
function layoutText(e) { e.h = e.fontSize * 1.2 * e.text.split('\n').length + sagOf(e); }
function drawText(e, g) {
  const fs = e.fontSize, lh = fs * 1.2, lines = e.text.split('\n');
  const attrs = { 'font-family': e.font, 'font-size': fs, 'font-weight': e.bold ? 700 : 400,
    'font-style': e.italic ? 'italic' : 'normal', fill: e.fill, 'xml:space': 'preserve',
    stroke: e.sw ? e.stroke : 'none', 'stroke-width': e.sw };
  if (!e.curve) {
    const x = e.align === 'middle' ? e.w / 2 : e.align === 'end' ? e.w : 0;
    const t = el('text', { ...attrs, 'text-anchor': e.align, x }, g);
    lines.forEach((ln, i) => { const s = el('tspan', { x, y: fs * (0.85 + i * 1.2) }, t); s.textContent = ln || ' '; });
  } else {
    const th = arcAngle(e), arch = e.curve > 0, sag = sagOf(e), cx = e.w / 2;
    lines.forEach((ln, i) => {
      const r = textWidth(e, ln) / th, y0 = (arch ? 0 : sag) + fs * 0.85 + i * lh, cy = arch ? y0 + r : y0 - r;
      const a0 = arch ? -Math.PI / 2 - th / 2 : Math.PI / 2 + th / 2, a1 = arch ? -Math.PI / 2 + th / 2 : Math.PI / 2 - th / 2;
      const p = a => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
      const id = `tp-${e.id}-${i}`;
      el('path', { id, d: `M ${p(a0)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${th > Math.PI ? 1 : 0} ${arch ? 1 : 0} ${p(a1)}`, fill: 'none' }, g);
      const t = el('text', { ...attrs, 'text-anchor': 'middle' }, g);
      el('textPath', { href: '#' + id, startOffset: '50%' }, t).textContent = ln || ' ';
    });
  }
  el('rect', { width: e.w, height: e.h, fill: 'transparent' }, g); // hit area
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
  document.body.classList.toggle('has-sel', !!sel);
  $('#zoomlbl').textContent = Math.round(zoom * 100) + '%';
  $('#status').textContent = `${doc.w}×${doc.h}px · ${doc.els.length} layers`;
  autosave();
}

// ---------- selection handles ----------
const HANDLES = [['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1]];
function drawHandles() {
  const e = sel && find(sel); if (!e) return;
  const s = (matchMedia('(pointer:coarse)').matches ? 1.9 : 1) / zoom, g = el('g', { id: 'ui', transform: `translate(${e.x} ${e.y}) rotate(${e.rot} ${e.w / 2} ${e.h / 2})` }, svg);
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
  if (opts.max !== undefined) i.max = opts.max;
  if (opts.step !== undefined) i.step = opts.step;
  if (type === 'range') i.id = 'f-' + key;
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
    p.append(row('Font', f), row('Size', field(e, 'fontSize', 'number', { min: 8 })), row('Curve', field(e, 'curve', 'range', { min: -100, max: 100, step: 1 })));
    const r = document.createElement('div'); r.className = 'row';
    [['B', 'bold'], ['I', 'italic']].forEach(([l, k]) => { const b = document.createElement('button'); b.textContent = l; b.style.opacity = e[k] ? 1 : .5; b.onclick = () => { commit(); e[k] = !e[k]; render(); }; r.append(b); });
    [['⇤', 'start'], ['↔', 'middle'], ['⇥', 'end']].forEach(([l, v]) => { const b = document.createElement('button'); b.textContent = l; b.style.opacity = e.align === v ? 1 : .5; b.onclick = () => { commit(); e.align = v; render(); }; r.append(b); });
    p.append(r);
  }
  if (e.type !== 'image') p.append(row(e.type === 'line' ? 'Color' : 'Fill', e.type === 'line' ? field(e, 'stroke', 'color') : field(e, 'fill', 'color')));
  if (e.type !== 'line' && e.type !== 'image') { h('Outline'); p.append(row('Color', field(e, 'stroke', 'color')), row('Width', field(e, 'sw', 'number', { min: 0 }))); }
  if (e.type === 'line') p.append(row('Thickness', field(e, 'sw', 'number', { min: 1 })));
  if (e.type === 'rect') p.append(row('Corner radius', field(e, 'radius', 'number', { min: 0 })));
  if (e.type === 'image' && e.nw) cropPanel(e, h, p);
  if (e.type === 'image' && window.openImageEditor) {
    const b = document.createElement('button'); b.textContent = 'Edit image: cut out, erase, remove marks';
    b.onclick = () => openImageEditor(e.src, e.orig || e.src, url => { commit(); e.orig = e.orig || e.src; e.src = url; render(); });
    p.append(b);
  }
  h('Arrange');
  p.append(row('Opacity', field(e, 'opacity', 'range')), row('Rotation', field(e, 'rot')),
    row('X', field(e, 'x')), row('Y', field(e, 'y')));
  if (e.type !== 'text') p.append(row('Width', field(e, 'w', 'number', { min: 1 })), ...(e.type === 'line' ? [] : [row('Height', field(e, 'h', 'number', { min: 1 }))]));
  const r = document.createElement('div'); r.className = 'row';
  [['Front', () => reorder(1, true)], ['Forward', () => reorder(1)], ['Back', () => reorder(-1)], ['Backmost', () => reorder(-1, true)], ['Duplicate', dup], ['Delete', del]]
    .forEach(([l, fn]) => { const b = document.createElement('button'); b.textContent = l; b.onclick = fn; r.append(b); });
  p.append(r);
}
function cropPanel(e, h, p) {
  h('Crop');
  const c = e.crop || { x: 0, y: 0, w: 1, h: 1 };
  const trim = [['Left', c.x], ['Top', c.y], ['Right', 1 - c.x - c.w], ['Bottom', 1 - c.y - c.h]];
  const v = trim.map(t => t[1]);
  trim.forEach(([label, val], idx) => {
    const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 90; i.step = 1; i.value = Math.round(val * 100); i.id = 'crop-' + idx;
    i.onfocus = () => { i._c = false; };
    i.oninput = () => { if (!i._c) { commit(); i._c = true; } v[idx] = i.value / 100; setCrop(e, v); render(); document.getElementById(i.id)?.focus(); };
    p.append(row(label, i));
  });
  const r = document.createElement('button'); r.textContent = 'Reset crop'; r.onclick = () => { commit(); setCrop(e, [0, 0, 0, 0]); render(); }; p.append(r);
}
// l,t,r,b = fraction trimmed from each side. Keeps pixel scale and the visible content fixed in place.
function setCrop(e, [l, t, r, b]) {
  const old = e.crop || { x: 0, y: 0, w: 1, h: 1 }, k = e.w / (e.nw * old.w);
  const n = { x: l, y: t, w: Math.max(0.05, 1 - l - r), h: Math.max(0.05, 1 - t - b) };
  const a = e.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), rot = (x, y) => [x * c - y * s, x * s + y * c];
  const [ox, oy] = rot((n.x - old.x) * e.nw * k - e.w / 2, (n.y - old.y) * e.nh * k - e.h / 2);
  const wx = e.x + e.w / 2 + ox, wy = e.y + e.h / 2 + oy; // world position of the new top-left corner
  e.crop = n; e.w = e.nw * n.w * k; e.h = e.nh * n.h * k;
  const [hx, hy] = rot(e.w / 2, e.h / 2);
  e.x = wx + hx - e.w / 2; e.y = wy + hy - e.h / 2;
  if (!l && !t && !r && !b) delete e.crop;
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
    commit(); const e = mk('image', { src: r.result, w: im.width * k, h: im.height * k, x: 50, y: 50, nw: im.width, nh: im.height });
    doc.els.push(e); sel = e.id; render(); }; im.src = r.result; };
  r.readAsDataURL(file);
}
// ---------- sources (persistent local library, like OBS sources) ----------
const kindOf = f => f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : null;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sudo-make-art', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sources', { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function dbDo(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const q = fn(db.transaction('sources', mode).objectStore('sources')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
let sources = [], thumbURLs = [];
async function loadSources() { try { sources = (await dbDo('readonly', st => st.getAll())).sort((a, b) => a.added - b.added); } catch (e) { sources = []; } renderSources(); }
async function addSource(file) {
  const kind = kindOf(file); if (!kind) return null;
  const rec = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name, kind, blob: file, added: Date.now() };
  try { await dbDo('readwrite', st => st.put(rec)); } catch (e) { alert('Could not save to the local library: ' + e.message); }
  sources.push(rec); renderSources(); return rec;
}
async function delSource(id) { try { await dbDo('readwrite', st => st.delete(id)); } catch (e) {} sources = sources.filter(s => s.id !== id); renderSources(); }
const smaSubs = [];
window.SMA = { getSources: () => sources, addFiles: fs => ingest(fs, false), subscribe: fn => smaSubs.push(fn), download: (n, b) => download(n, b) };
function renderSources() {
  setTimeout(() => smaSubs.forEach(f => f()), 0);
  thumbURLs.forEach(URL.revokeObjectURL); thumbURLs = [];
  const box = $('#srclist'); box.textContent = '';
  if (!sources.length) box.innerHTML = '<p class="hint">Drop images, videos or audio here, or press Add files. They stay in your library next time you open the app.</p>';
  sources.forEach(sr => {
    const d = document.createElement('div'); d.className = 'src'; d.title = sr.name; d.draggable = true;
    d.ondragstart = ev => ev.dataTransfer.setData('text/sma-source', sr.id);
    if (sr.kind === 'image' || sr.kind === 'video') {
      const u = URL.createObjectURL(sr.blob); thumbURLs.push(u);
      const m = document.createElement(sr.kind === 'image' ? 'img' : 'video'); m.src = u + (sr.kind === 'video' ? '#t=0.1' : ''); m.muted = true; m.preload = 'metadata'; d.append(m);
    } else d.append(Object.assign(document.createElement('div'), { className: 'ico', textContent: '♪' }));
    const n = document.createElement('small'); n.textContent = sr.name; d.append(n);
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove from library';
    x.onclick = ev => { ev.stopPropagation(); delSource(sr.id); }; d.append(x);
    d.onclick = () => useSource(sr);
    box.append(d);
  });
}
function useSource(sr) { if (sr.kind === 'image') readImage(sr.blob); else alert('Video and audio editing is coming in a later release. The file is kept in your library.'); }
async function ingest(files, place) {
  for (const f of files) { if (!kindOf(f)) continue; const rec = await addSource(f); if (place && rec && rec.kind === 'image') useSource(rec); }
}
document.querySelector('[data-panel=sources]').onclick = () => { const p = $('#sources'); p.hidden = !p.hidden; };
$('#srcadd').onclick = () => { const f = $('#file'); f.accept = 'image/*,video/*,audio/*'; f.multiple = true; f.value = ''; f.onchange = () => { ingest([...f.files], false); f.multiple = false; }; f.click(); };
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/sma-source');
  if (id) { const sr = sources.find(s => s.id === id); if (sr && !e.target.closest('#sources')) useSource(sr); return; }
  ingest([...e.dataTransfer.files], !e.target.closest('#sources'));
});
document.addEventListener('paste', e => ingest([...(e.clipboardData?.files || [])], true));

// ---------- create a design ----------
const dlg = $('#newdlg');
function buildDialog() {
  const nav = $('#newcats'), grid = $('#newgrid');
  const show = cat => {
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cat === cat)); grid.textContent = '';
    if (cat === 'Custom size') {
      grid.innerHTML = '<label>Width <input id="cw" type="number" value="1080" min="16"></label><label>Height <input id="ch" type="number" value="1080" min="16"></label><button id="cgo">Create</button>';
      $('#cgo').onclick = () => make(Math.max(16, +$('#cw').value || 1080), Math.max(16, +$('#ch').value || 1080));
      return;
    }
    PRESETS[cat].forEach(([n, w, h]) => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = `<b></b><small>${w} × ${h} px</small>`; b.firstChild.textContent = n; b.onclick = () => make(w, h); grid.append(b); });
  };
  [...Object.keys(PRESETS), 'Custom size'].forEach(c => { const b = document.createElement('button'); b.textContent = c; b.dataset.cat = c; b.onclick = () => show(c); nav.append(b); });
  show('Social media');
}
function make(w, h) { commit(); doc = { w, h, bg: '#ffffff', els: [] }; sel = null; dlg.close(); fit(); }
$('#new').onclick = () => dlg.showModal();
$('#newclose').onclick = () => dlg.close();
buildDialog();

const sizeSel = $('#size');
sizeSel.add(new Option('Custom size', ''));
FLAT.forEach(([n, w, h], i) => sizeSel.add(new Option(`${n} ${w}×${h}`, i)));
sizeSel.onchange = () => { commit(); [, doc.w, doc.h] = FLAT[sizeSel.value]; fit(); };
Object.keys(TEMPLATES).forEach(k => $('#tpl').add(new Option(k, k)));
$('#tpl').onchange = ev => { const t = TEMPLATES[ev.target.value]; if (!t) return; commit(); const d = t(); doc = { w: d.w, h: d.h, bg: d.bg, els: d.els }; sel = null; ev.target.value = ''; fit(); };
$('#undo').onclick = () => { if (!undoS.length) return; redoS.push(JSON.stringify(doc)); restore(undoS.pop()); };
$('#redo').onclick = () => { if (!redoS.length) return; undoS.push(JSON.stringify(doc)); restore(redoS.pop()); };
function setZoom(z) { zoom = Math.max(0.05, Math.min(4, z)); render(); }
$('#zoomin').onclick = () => setZoom(zoom * 1.2); $('#zoomout').onclick = () => setZoom(zoom / 1.2);
function fit() { const s = $('#stage'); const pi = FLAT.findIndex(([, w, h]) => w === doc.w && h === doc.h); sizeSel.value = pi < 0 ? '' : String(pi); const phone = matchMedia('(max-width:820px)').matches, pad = phone ? 24 : 80;
  const room = s.clientHeight - (phone && !sel ? innerHeight * 0.38 : 0); // keep space for the properties sheet
  zoom = Math.max(0.05, Math.min((s.clientWidth - pad) / doc.w, (room - pad) / doc.h, 1)); render(); }
$('#fit').onclick = fit;
$('#stage').addEventListener('wheel', ev => { if (ev.ctrlKey) { ev.preventDefault(); setZoom(zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });

// ---------- save / open / export ----------
async function download(name, blob) {
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Filesystem && cap.Plugins?.Share) { // Android app: save to cache, then open the share sheet
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
      const f = await cap.Plugins.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
      await cap.Plugins.Share.share({ title: name, url: f.uri }); return;
    } catch (e) { alert('Could not save: ' + e.message); return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
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

// ---------- design / video mode ----------
function setMode(m) {
  document.body.classList.toggle('video-mode', m === 'video');
  $('#mode-design').classList.toggle('on', m !== 'video'); $('#mode-video').classList.toggle('on', m === 'video');
  if (m === 'video') window.SMA_video?.show(); else { window.SMA_video?.hide(); fit(); }
  try { localStorage.setItem('sma-mode', m); } catch (e) {}
}
$('#mode-design').onclick = () => setMode('design'); $('#mode-video').onclick = () => setMode('video');

// ---------- boot ----------
try { const s = localStorage.getItem('sma-doc'); if (s) doc = JSON.parse(s); } catch (e) {}
window.addEventListener('resize', () => { });
fit();
loadSources();
try { if (localStorage.getItem('sma-mode') === 'video') setTimeout(() => setMode('video'), 0); } catch (e) {}
})();
