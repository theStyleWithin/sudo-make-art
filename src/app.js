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
  'Print': [['A4 (150 dpi)', 1240, 1754, 150], ['A3 Poster (300 dpi)', 3508, 4961, 300], ['Letter (150 dpi)', 1275, 1650, 150], ['Business Card', 1050, 600, 300]],
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
let doc = { w: 1080, h: 1080, bg: '#ffffff', els: [], pages: [{ bg: '#ffffff', els: [] }], cur: 0 };
// doc.els / doc.bg are the working copy of the current page; pages[] holds all pages (synced before saving or switching).
function syncPage() { doc.pages[doc.cur] = { bg: doc.bg, els: doc.els }; }
function serialize() { syncPage(); const { els, bg, ...rest } = doc; return JSON.stringify(rest); }
function adopt(d) { // accepts the old single-page format too
  if (!d.pages) d = { w: d.w, h: d.h, pages: [{ bg: d.bg || '#ffffff', els: d.els || [] }], cur: 0 };
  d.cur = Math.max(0, Math.min(d.cur || 0, d.pages.length - 1)); d.bg = d.pages[d.cur].bg; d.els = d.pages[d.cur].els; doc = d;
}
function newDoc(w, h, dpi) { adopt({ w, h, dpi, pages: [{ bg: '#ffffff', els: [] }], cur: 0 }); sel = null; }
function goPage(i) { syncPage(); doc.cur = i; doc.bg = doc.pages[i].bg; doc.els = doc.pages[i].els; sel = null; render(); }
let sel = null, zoom = 0.5, undoS = [], redoS = [];
const find = id => doc.els.find(e => e.id === id);

function commit() { // call BEFORE mutating
  undoS.push(serialize()); if (undoS.length > 100) undoS.shift(); redoS = [];
  document.dispatchEvent(new Event('sma-edit'));
}
function restore(json) { adopt(JSON.parse(json)); if (sel && !find(sel)) sel = null; render(); }
function autosave() { try { localStorage.setItem('sma-doc', serialize()); } catch (e) {} }

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
  const F = window.SMA_FILTERS, hasFl = e.fl && !F.isDefault(e.fl), hasSh = !!e.shadow;
  const g = el('g', { 'data-id': e.id, transform: `translate(${e.x} ${e.y}) rotate(${e.rot} ${e.w / 2} ${e.h / 2})`, opacity: e.opacity }, parent);
  if (hasFl || hasSh) g.setAttribute('filter', `url(#${addFilter(e, g, hasFl, hasSh)})`);
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

// ---------- filters and shadow (SVG, so they export with the design) ----------
function addFilter(e, g, hasFl, hasSh) {
  const id = 'flt-' + e.id, f = el('filter', { id, x: '-40%', y: '-40%', width: '180%', height: '180%', 'color-interpolation-filters': 'sRGB' }, g);
  if (hasFl) {
    const v = window.SMA_FILTERS.full(e.fl), fn = (tag, attrs) => el(tag, attrs, f);
    const transfer = (type, attrs) => { const t = fn('feComponentTransfer', {}); ['feFuncR', 'feFuncG', 'feFuncB'].forEach(n => el(n, { type, ...attrs }, t)); };
    if (v.brightness !== 1) transfer('linear', { slope: v.brightness });
    if (v.contrast !== 1) transfer('linear', { slope: v.contrast, intercept: 0.5 - 0.5 * v.contrast });
    if (v.saturate !== 1) fn('feColorMatrix', { type: 'saturate', values: v.saturate });
    if (v.gray > 0) fn('feColorMatrix', { type: 'saturate', values: 1 - v.gray });
    if (v.sepia > 0) { const k = v.sepia, S = [[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]], I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      fn('feColorMatrix', { type: 'matrix', values: S.map((r, i) => r.map((x, j) => I[i][j] * (1 - k) + x * k).concat([0, 0]).join(' ')).concat(['0 0 0 1 0']).join(' ') }); }
    if (v.hue) fn('feColorMatrix', { type: 'hueRotate', values: v.hue });
    if (v.invert > 0) transfer('table', { tableValues: `${v.invert} ${1 - v.invert}` });
    if (v.blur > 0) fn('feGaussianBlur', { stdDeviation: v.blur });
  }
  if (hasSh) el('feDropShadow', { dx: e.shadow.x, dy: e.shadow.y, stdDeviation: e.shadow.blur, 'flood-color': e.shadow.color, 'flood-opacity': e.shadow.opacity ?? 0.6 }, f);
  return id;
}
function filterPanel(e, p, h) { // sliders + presets
  const F = window.SMA_FILTERS; h('Filters');
  const pre = document.createElement('select'); Object.keys(F.PRESETS).forEach(n => pre.add(new Option(n, n)));
  pre.onchange = () => { commit(); e.fl = { ...F.PRESETS[pre.value] }; render(); }; p.append(row('Preset', pre));
  [['Brightness', 'brightness', 0, 2, 0.05], ['Contrast', 'contrast', 0, 2, 0.05], ['Saturation', 'saturate', 0, 3, 0.05], ['Hue', 'hue', -180, 180, 1], ['Blur', 'blur', 0, 20, 0.5], ['Grayscale', 'gray', 0, 1, 0.05], ['Sepia', 'sepia', 0, 1, 0.05]]
    .forEach(([label, key, min, max, step]) => {
      const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = F.full(e.fl)[key]; i.id = 'fl-' + key;
      i.onfocus = () => { i._c = false; };
      i.oninput = () => { if (!i._c) { commit(); i._c = true; } e.fl = { ...(e.fl || {}), [key]: +i.value }; if (F.isDefault(e.fl)) delete e.fl; render(); document.getElementById(i.id)?.focus(); };
      p.append(row(label, i));
    });
  const r = document.createElement('button'); r.textContent = 'Reset filters'; r.onclick = () => { commit(); delete e.fl; render(); }; p.append(r);
}
function shadowPanel(e, p, h) {
  h('Shadow');
  const on = document.createElement('input'); on.type = 'checkbox'; on.checked = !!e.shadow;
  on.onchange = () => { commit(); if (on.checked) e.shadow = { x: 6, y: 6, blur: 6, color: '#000000', opacity: 0.6 }; else delete e.shadow; render(); };
  p.append(row('Drop shadow', on));
  if (e.shadow) p.append(row('Offset X', field(e.shadow, 'x')), row('Offset Y', field(e.shadow, 'y')), row('Blur', field(e.shadow, 'blur', 'number', { min: 0 })), row('Colour', field(e.shadow, 'color', 'color')), row('Strength', field(e.shadow, 'opacity', 'range')));
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
  renderPages();
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

// two-finger pinch zooms the canvas (touch screens)
const fingers = new Map(); let pinch = null;
const gap = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
svg.addEventListener('pointerdown', ev => {
  if (ev.pointerType !== 'touch') return; fingers.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if (fingers.size === 2) { drag = null; pinch = { d: gap(), z: zoom }; ev.stopImmediatePropagation(); }
}, true);
svg.addEventListener('pointermove', ev => {
  if (!fingers.has(ev.pointerId)) return; fingers.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if (pinch && fingers.size === 2) { ev.stopImmediatePropagation(); setZoom(pinch.z * gap() / pinch.d); }
}, true);
const lift = ev => { fingers.delete(ev.pointerId); if (fingers.size < 2) pinch = null; };
svg.addEventListener('pointerup', lift, true); svg.addEventListener('pointercancel', lift, true);

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
  if (e.type === 'image') filterPanel(e, p, h);
  if (e.type !== 'line') shadowPanel(e, p, h);
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
window.SMA = { addImageBlob: b => readImage(b), selectedImage: () => { const e = sel && find(sel); return e && e.type === 'image' ? { src: e.src, w: e.nw || e.w, h: e.nh || e.h } : null; }, getSources: () => sources, addFiles: fs => ingest(fs, false), subscribe: fn => smaSubs.push(fn), download: (n, b) => download(n, b) };
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
    PRESETS[cat].forEach(([n, w, h, dpi]) => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = `<b></b><small>${w} × ${h} px</small>`; b.firstChild.textContent = n; b.onclick = () => make(w, h, dpi); grid.append(b); });
  };
  [...Object.keys(PRESETS), 'Custom size'].forEach(c => { const b = document.createElement('button'); b.textContent = c; b.dataset.cat = c; b.onclick = () => show(c); nav.append(b); });
  show('Social media');
}
function make(w, h, dpi) { commit(); newDoc(w, h, dpi); dlg.close(); setMode('design'); fit(); }
$('#new').onclick = () => dlg.showModal();
$('#newclose').onclick = () => dlg.close();
buildDialog();

const sizeSel = $('#size');
sizeSel.add(new Option('Custom size', ''));
FLAT.forEach(([n, w, h], i) => sizeSel.add(new Option(`${n} ${w}×${h}`, i)));
sizeSel.onchange = () => { if (sizeSel.value === '') return; commit(); [, doc.w, doc.h, doc.dpi] = FLAT[sizeSel.value]; fit(); };
Object.keys(TEMPLATES).forEach(k => $('#tpl').add(new Option(k, k)));
$('#tpl').onchange = ev => { const t = TEMPLATES[ev.target.value]; if (!t) return; commit(); const d = t(); adopt({ w: d.w, h: d.h, bg: d.bg, els: d.els });  sel = null; ev.target.value = ''; fit(); };
$('#undo').onclick = () => { if (!undoS.length) return; redoS.push(serialize()); restore(undoS.pop()); };
$('#redo').onclick = () => { if (!redoS.length) return; undoS.push(serialize()); restore(redoS.pop()); };
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
$('#save').onclick = () => download('design.smart.json', new Blob([serialize()], { type: 'application/json' }));
$('#open').onclick = () => pick(f => f.text().then(t => { try { const d = JSON.parse(t); commit(); adopt(d); sel = null; fit(); } catch (e) { alert('Not a valid project file'); } }), '.json');
function cleanSVG() {
  const c = svg.cloneNode(true); c.querySelector('#ui')?.remove();
  c.setAttribute('width', doc.w); c.setAttribute('height', doc.h); c.style.background = '';
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', doc.w); bg.setAttribute('height', doc.h); bg.setAttribute('fill', doc.bg);
  c.insertBefore(bg, c.firstChild); c.setAttribute('xmlns', NS);
  return new XMLSerializer().serializeToString(c);
}
$('#export').onchange = ev => {
  const fmt = ev.target.value; ev.target.value = ''; if (!fmt) return;
  if (fmt === 'pdf') return exportPDF();
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

// ---------- pages ----------
function renderPages() {
  const box = $('#pages'); if (!box) return; box.textContent = '';
  doc.pages.forEach((_, i) => { const b = document.createElement('button'); b.textContent = i + 1; b.className = i === doc.cur ? 'on' : ''; b.title = 'Page ' + (i + 1); b.onclick = () => goPage(i); box.append(b); });
  const mk2 = (t, title, fn) => { const b = document.createElement('button'); b.textContent = t; b.title = title; b.onclick = fn; box.append(b); };
  mk2('+', 'Add a blank page', () => { commit(); syncPage(); doc.pages.splice(doc.cur + 1, 0, { bg: '#ffffff', els: [] }); goPage(doc.cur + 1); });
  mk2('⧉', 'Duplicate this page', () => { commit(); syncPage(); const c = JSON.parse(JSON.stringify(doc.pages[doc.cur])); c.els.forEach(e => { e.id = mk('x').id; }); doc.pages.splice(doc.cur + 1, 0, c); goPage(doc.cur + 1); });
  mk2('🗑', 'Delete this page', () => { if (doc.pages.length < 2) return; commit(); doc.pages.splice(doc.cur, 1); goPage(Math.min(doc.cur, doc.pages.length - 1)); });
}

// ---------- PDF (all pages, one JPEG per page) ----------
function buildPDF(pages) {
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const put = x => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); put(body); put('\nendobj\n'); };
  put('%PDF-1.4\n'); const kids = pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((pg, i) => {
    const n = 3 + 3 * i, content = `q ${pg.pw} 0 0 ${pg.ph} 0 0 cm /Im0 Do Q`;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pg.pw} ${pg.ph}] /Contents ${n + 1} 0 R /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> >>`);
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offs[n + 2] = len; put(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    put(pg.jpeg); put('\nendstream\nendobj\n');
  });
  const total = 3 + 3 * pages.length, xref = len;
  put(`xref\n0 ${total}\n0000000000 65535 f \n`); for (let n = 1; n < total; n++) put(String(offs[n]).padStart(10, '0') + ' 00000 n \n');
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function exportPDF() {
  const keep = doc.cur, out = [], dpi = doc.dpi || 96;
  for (let i = 0; i < doc.pages.length; i++) {
    goPage(i); const xml = cleanSVG();
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
    const cv = document.createElement('canvas'); cv.width = doc.w; cv.height = doc.h; const cx = cv.getContext('2d'); cx.fillStyle = doc.bg; cx.fillRect(0, 0, doc.w, doc.h); cx.drawImage(img, 0, 0, doc.w, doc.h);
    const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
    out.push({ w: doc.w, h: doc.h, pw: +(doc.w * 72 / dpi).toFixed(2), ph: +(doc.h * 72 / dpi).toFixed(2), jpeg: new Uint8Array(await b.arrayBuffer()) });
  }
  goPage(keep); download('design.pdf', buildPDF(out));
}

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

// ---------- home / design / video mode ----------
function setMode(m) {
  document.body.classList.toggle('video-mode', m === 'video'); document.body.classList.toggle('home-mode', m === 'home');
  ['home', 'design', 'video'].forEach(k => $('#mode-' + k).classList.toggle('on', k === m));
  if (m !== 'video') window.SMA_video?.hide();
  if (m === 'video') window.SMA_video?.show(); else if (m === 'design') fit();
  document.dispatchEvent(new CustomEvent('sma-mode', { detail: m }));
}
$('#mode-home').onclick = () => setMode('home'); $('#mode-design').onclick = () => setMode('design'); $('#mode-video').onclick = () => setMode('video');
async function designThumb() {
  const xml = cleanSVG();
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
  const k = 320 / Math.max(doc.w, doc.h), cv = document.createElement('canvas'); cv.width = Math.round(doc.w * k); cv.height = Math.round(doc.h * k);
  const cx = cv.getContext('2d'); cx.fillStyle = doc.bg; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.7);
}
window.SMA.design = {
  serialize, thumb: designThumb, getPid: () => doc.pid, setPid: p => { doc.pid = p; }, getName: () => doc.name || 'Untitled design', setName: n => { doc.name = n; },
  load: json => { adopt(JSON.parse(json)); sel = null; undoS = []; redoS = []; fit(); },
};
window.SMA.setMode = setMode;

// ---------- boot ----------
try { const s = localStorage.getItem('sma-doc'); if (s) adopt(JSON.parse(s)); } catch (e) {}
window.addEventListener('resize', () => { });
fit();
loadSources();
setTimeout(() => setMode('home'), 0);
})();
