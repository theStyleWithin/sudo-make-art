(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const $ = s => document.querySelector(s);
const svg = $('#canvas');

const PRESETS = {
  'Default image size': [['Full HD 1920 × 1080', 1920, 1080], ['HD 1280 × 720', 1280, 720], ['4K UHD 3840 × 2160', 3840, 2160], ['QHD 2560 × 1440', 2560, 1440], ['XGA 1024 × 768', 1024, 768], ['SVGA 800 × 600', 800, 600], ['VGA 640 × 480', 640, 480],
    ['Square 1024 × 1024', 1024, 1024], ['Square 512 × 512', 512, 512], ['Square 256 × 256', 256, 256], ['Icon 128 × 128', 128, 128], ['Icon 64 × 64', 64, 64], ['Icon 32 × 32', 32, 32], ['Portrait 1080 × 1920', 1080, 1920], ['Photo 3:2 (3000 × 2000)', 3000, 2000], ['Photo 4:3 (2048 × 1536)', 2048, 1536]],
  // Channel art. Rumble's banner and Odysee's ratios are from their own help pages; Twitch, YouTube, Discord, X and Facebook are the usual published sizes.
  // Kick, blaze.stream and Kamtape do not publish exact sizes, so those are "typical" sizes that scale down cleanly: check the upload screen.
  'Channel icons & banners': [
    ['Kick · Channel icon (typical)', 800, 800], ['Kick · Channel banner (typical)', 1280, 700], ['Kick · Offline banner (typical)', 1920, 1080],
    ['blaze.stream · Channel icon (typical)', 800, 800], ['blaze.stream · Channel banner (typical)', 1920, 480],
    ['Rumble · Channel icon (typical)', 800, 800], ['Rumble · Channel banner (backsplash)', 3600, 600],
    ['Odysee · Channel icon (1:1)', 600, 600], ['Odysee · Channel cover (6.25:1)', 2500, 400],
    ['Twitch · Channel icon', 256, 256], ['Twitch · Channel banner', 1200, 480], ['Twitch · Offline screen', 1920, 1080],
    ['YouTube · Channel icon', 800, 800], ['YouTube · Channel banner', 2560, 1440],
    ['Kamtape · Channel icon (typical)', 800, 800], ['Kamtape · Channel banner (typical)', 2048, 512],
    ['Discord · Profile picture', 512, 512], ['Discord · Profile banner', 600, 240], ['Discord · Server icon', 512, 512], ['Discord · Server banner', 960, 540],
    ['X / Twitter · Profile picture', 400, 400], ['X / Twitter · Header', 1500, 500],
    ['Facebook · Profile picture', 320, 320], ['Facebook · Cover', 820, 312]],
  'Social media': [['Instagram Post (4:5)', 1080, 1350], ['Instagram Post (Square)', 1080, 1080], ['Instagram Story / Reel', 1080, 1920],
    ['Facebook Post', 1200, 630], ['Facebook Cover', 820, 312], ['Facebook Story', 1080, 1920], ['LinkedIn Post', 1200, 627],
    ['LinkedIn Cover', 1584, 396], ['Pinterest Pin (2:3)', 1000, 1500], ['TikTok Video / Cover', 1080, 1920], ['X / Twitter Post', 1600, 900],
    ['WhatsApp Status', 1080, 1920], ['YouTube Thumbnail', 1280, 720], ['YouTube Banner', 2560, 1440], ['YouTube Profile Picture', 800, 800],
    ['YouTube Shorts', 1080, 1920]],
  'Presentation': [['Presentation 16:9', 1920, 1080], ['Presentation 4:3', 1600, 1200]],
  'Print': [['A4 (150 dpi)', 1240, 1754, 150], ['A3 Poster (300 dpi)', 3508, 4961, 300], ['Letter (150 dpi)', 1275, 1650, 150], ['Business Card', 1050, 600, 300],
    ['Flyer A5 (300 dpi)', 1748, 2480, 300], ['Postcard 6×4 in (300 dpi)', 1800, 1200, 300], ['Invitation 5×7 in (300 dpi)', 1500, 2100, 300], ['Greeting Card 5×7 in (300 dpi)', 1500, 2100, 300],
    ['Certificate (Letter, landscape)', 1650, 1275, 150], ['Menu (A4 portrait)', 1240, 1754, 150], ['Poster 18×24 in (150 dpi)', 2700, 3600, 150]],
  'Logos & cards': [['Logo', 500, 500], ['Name Tag', 1050, 750, 300], ['Sticker', 1000, 1000], ['Album Cover', 1400, 1400], ['Podcast Cover', 3000, 3000], ['Bookmark', 450, 1500, 300], ['Gift Tag', 600, 900, 300]],
  'Web & ads': [['Website Banner', 1920, 600], ['Email Header', 1280, 400], ['Display Ad (Medium Rectangle)', 300, 250], ['Display Ad (Leaderboard)', 728, 90], ['Display Ad (Skyscraper)', 160, 600], ['Open Graph Image', 1200, 630], ['Favicon', 256, 256]],
};
// Docs open the writing app and Videos open the video editor; they are listed in the new-design window next to the sizes
const OTHER_APPS = { 'Docs': { mode: 'write', blurb: 'Documents are written in the writing app (Sudo Write Stuff), with real page layout, tables, and export to DOCX, ODT and PDF.', items: ['Document', 'Letter', 'Resume', 'Report', 'Notes'] },
  'Videos': { mode: 'video', blurb: 'Videos are made in the video editor: a timeline, text, pictures and sound.', items: ['Video 16:9 (1920×1080)', 'Vertical video 9:16 (1080×1920)', 'Square video (1080×1080)'] } };
const FLAT = Object.values(PRESETS).flat();
// a font name as CSS: quoted, except the generic families (sans-serif, serif, monospace, ...) which must stay bare
const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);
const cssFamily = n => (GENERIC.has(n) ? n : `"${String(n).replace(/["\\]/g, '')}", sans-serif`);

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
  const X = window.SMA_EXT && SMA_EXT.types[e.type]; // new element kinds (pens, shapes, tables…) register here
  if (X && X.draw) X.draw(e, g, el);
  else if (e.type === 'rect') el('rect', { width: e.w, height: e.h, rx: e.radius, ...paint }, g);
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
  mctx.font = `${e.italic ? 'italic ' : ''}${e.bold ? 700 : 400} ${e.fontSize}px ${cssFamily(e.font)}`;
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
  const attrs = { 'font-family': cssFamily(e.font), 'font-size': fs, 'font-weight': e.bold ? 700 : 400,
    'font-style': e.italic ? 'italic' : 'normal', fill: e.fill, 'xml:space': 'preserve',
    stroke: e.sw ? e.stroke : 'none', 'stroke-width': e.sw, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }; // outline sits behind the letters, so thick outlines don't eat them
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
const bgCss = () => (doc.bg === 'transparent' ? 'repeating-conic-gradient(#d4d4d4 0% 25%, #ffffff 0% 50%) 0 0 / 28px 28px' : doc.bg); // transparent pages show a checkerboard
const bgFill = () => (doc.bg === 'transparent' ? '#ffffff' : doc.bg); // for formats that cannot be see-through (JPG, PDF)
function render() {
  svg.setAttribute('viewBox', `0 0 ${doc.w} ${doc.h}`);
  svg.setAttribute('width', doc.w * zoom); svg.setAttribute('height', doc.h * zoom);
  svg.style.background = bgCss();
  svg.textContent = '';
  // Anything past the page edge is hidden (like a real page); it is not deleted, so moving or resizing brings it back.
  const defs = el('defs', {}, svg); el('rect', { width: doc.w, height: doc.h }, el('clipPath', { id: 'pageclip' }, defs));
  const ghost = sel && find(sel); if (ghost) { const gg = el('g', { id: 'ghost', opacity: 0.28, 'pointer-events': 'none' }, svg); drawEl(ghost, gg); } // faint preview of the hidden part
  const art = el('g', { id: 'art', 'clip-path': 'url(#pageclip)' }, svg);
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
let guides = [];
function drawHandles() {
  guides.forEach(([x1, y1, x2, y2]) => el('line', { x1, y1, x2, y2, stroke: '#f43f5e', 'stroke-width': 1.5 / zoom, 'pointer-events': 'none' }, svg));
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
  if (ev.button > 0) return; // right-click opens the menu; it must not start a drag or capture the pointer
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
  if (drag.kind === 'move') {
    e.x = o.x + dx; e.y = o.y + dy; guides = [];
    if (!ev.altKey && !e.rot) { // snap to the page edges and centre; hold Alt to move freely
      const T = 10 / zoom, hh = e.type === 'line' ? 0 : e.h;
      for (const [v, dim, key, at] of [[e.x, e.w, 'x', 0], [e.y, hh, 'y', 0]]) {
        const P = key === 'x' ? doc.w : doc.h, spots = [[v, 0], [v + dim / 2, P / 2], [v + dim, P], [v, P], [v + dim, 0]]; let best = null;
        for (const [pos, target] of spots) { const d = target - pos; if (Math.abs(d) <= T && (!best || Math.abs(d) < Math.abs(best[0]))) best = [d, target]; }
        if (best) { e[key] += best[0]; guides.push(key === 'x' ? [best[1], 0, best[1], doc.h] : [0, best[1], doc.w, best[1]]); }
      }
    }
  }
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
svg.addEventListener('pointerup', () => { const had = guides.length, d = drag; drag = null; guides = []; if (d && d.kind === 'move' && window.SMA_EXT && SMA_EXT.onDrop && SMA_EXT.onDrop(d.e)) return; if (had) render(); });

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
  i.value = e[key]; // after min/max so a range keeps its real value
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
    const bg = document.createElement('input'); bg.type = 'color'; bg.value = /^#[0-9a-f]{6}$/i.test(doc.bg) ? doc.bg : '#ffffff';
    bg.oninput = () => { doc.bg = bg.value; svg.style.background = bgCss(); autosave(); };
    bg.onchange = () => { }; bg.onfocus = () => commit();
    p.append(row('Background', bg));
    const tr = document.createElement('input'); tr.type = 'checkbox'; tr.checked = doc.bg === 'transparent'; tr.onchange = () => { commit(); doc.bg = tr.checked ? 'transparent' : (bg.value || '#ffffff'); render(); }; p.append(row('Transparent (PNG, SVG, ICO keep it)', tr));
    const hint = document.createElement('p'); hint.style.opacity = .6;
    hint.textContent = 'Click an element to edit it. Shift while resizing keeps aspect ratio; Shift while rotating snaps to 15°.';
    p.append(hint); return;
  }
  const X = window.SMA_EXT && SMA_EXT.types[e.type], noGen = !!(X && X.generic === false);
  h(X && X.label || e.type);
  if (X && X.props) X.props(e, p, { h, row, field, commit, render });
  if (e.type === 'text') {
    const t = document.createElement('textarea'); t.id = 'p-text'; t.value = e.text;
    t.oninput = () => { if (!t._c) { commit(); t._c = true; } e.text = t.value; redrawKeepFocus(t); };
    t.onblur = () => { t._c = false; render(); };
    p.append(t);
    const f = window.SMA_FONTS.pick(e.font, name => { commit(); e.font = name; render(); });
    p.append(row('Font', f), row('Size', field(e, 'fontSize', 'number', { min: 8 })), row('Curve', field(e, 'curve', 'range', { min: -100, max: 100, step: 1 })));
    const r = document.createElement('div'); r.className = 'row';
    [['B', 'bold'], ['I', 'italic']].forEach(([l, k]) => { const b = document.createElement('button'); b.textContent = l; b.style.opacity = e[k] ? 1 : .5; b.onclick = () => { commit(); e[k] = !e[k]; render(); }; r.append(b); });
    [['⇤', 'start'], ['↔', 'middle'], ['⇥', 'end']].forEach(([l, v]) => { const b = document.createElement('button'); b.textContent = l; b.style.opacity = e.align === v ? 1 : .5; b.onclick = () => { commit(); e.align = v; render(); }; r.append(b); });
    p.append(r);
  }
  if (!noGen) if (e.type !== 'image') p.append(row(e.type === 'line' ? 'Color' : 'Fill', e.type === 'line' ? field(e, 'stroke', 'color') : field(e, 'fill', 'color')));
  if (!noGen) if (e.type !== 'line' && e.type !== 'image') { h('Outline'); p.append(row('Color', field(e, 'stroke', 'color')), row('Width', field(e, 'sw', 'number', { min: 0 }))); }
  if (!noGen) if (e.type === 'line') p.append(row('Thickness', field(e, 'sw', 'number', { min: 1 })));
  if (!noGen) if (e.type === 'rect') p.append(row('Corner radius', field(e, 'radius', 'number', { min: 0 })));
  if (e.type === 'image') { // snap the picture to the page
    h('Snap to page'); const bar = document.createElement('div'); bar.className = 'row';
    const fit = (mode) => { commit();       if (mode === 'fill') { const k = Math.max(doc.w / (e.nw || e.w), doc.h / (e.nh || e.h)); e.w = (e.nw || e.w) * k; e.h = (e.nh || e.h) * k; }
      else if (mode === 'fit') { const k = Math.min(doc.w / (e.nw || e.w), doc.h / (e.nh || e.h)); e.w = (e.nw || e.w) * k; e.h = (e.nh || e.h) * k; }
      else if (mode === 'stretch') { e.w = doc.w; e.h = doc.h; }
      e.rot = 0; e.x = (doc.w - e.w) / 2; e.y = (doc.h - e.h) / 2; render(); };
    for (const [m, label, tip] of [['fit', 'Fit', 'Whole picture inside the page'], ['fill', 'Fill', 'Cover the whole page; the overflow is hidden'], ['stretch', 'Stretch', 'Match the page exactly'], ['center', 'Center', 'Keep the size, centre it']]) {
      const b = document.createElement('button'); b.textContent = label; b.title = tip; b.onclick = () => m === 'center' ? (commit(), e.x = (doc.w - e.w) / 2, e.y = (doc.h - e.h) / 2, render()) : fit(m); bar.append(b);
    }
    p.append(bar);
  }
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
// ---------- copy / paste and the right-click menu ----------
let clip = null; // a copy of an element made with Copy (kept inside the app)
function copyEl() { const e = sel && find(sel); if (e) clip = JSON.parse(JSON.stringify(e)); return !!e; }
function pasteEl(at) { if (!clip) return false; commit(); const c = JSON.parse(JSON.stringify(clip)); c.id = mk('x').id;
  if (at) { c.x = at[0] - c.w / 2; c.y = at[1] - (c.type === 'line' ? 0 : c.h / 2); } else { c.x += 30; c.y += 30; clip.x += 30; clip.y += 30; }
  doc.els.push(c); sel = c.id; render(); return true; }
function addTextAt(at) { commit(); const e = mk('text', { x: at[0] - 200, y: at[1] - 40 }); doc.els.push(e); sel = e.id; render(); setTimeout(() => { const t = $('#p-text'); if (t) { t.focus(); t.select(); } }, 0); }
svg.addEventListener('contextmenu', ev => {
  ev.preventDefault(); const g = ev.target.closest('[data-id]'), at = pt(ev);
  if (g && find(g.dataset.id)) { sel = g.dataset.id; render(); }
  else if (sel) { sel = null; render(); }
  const e = sel && find(sel), items = [];
  if (e) items.push({ label: 'Copy', hint: 'Ctrl+C', fn: copyEl }, { label: 'Paste', hint: 'Ctrl+V', disabled: !clip, fn: () => pasteEl() }, { label: 'Duplicate', hint: 'Ctrl+D', fn: dup }, 'sep',
    { label: 'Bring to front', fn: () => reorder(1, true) }, { label: 'Send to back', fn: () => reorder(-1, true) }, 'sep', { label: 'Add text here', fn: () => addTextAt(at) }, { label: 'Add a signature here…', fn: () => window.SMA_ARTTOOLS2 && SMA_ARTTOOLS2.signature(at) }, 'sep', { label: 'Delete', hint: 'Del', danger: true, fn: del });
  else items.push({ label: 'Paste', hint: 'Ctrl+V', disabled: !clip, fn: () => pasteEl(at) }, { label: 'Add text here', fn: () => addTextAt(at) }, { label: 'Add a signature here…', fn: () => window.SMA_ARTTOOLS2 && SMA_ARTTOOLS2.signature(at) });
  window.SMA_CTX && SMA_CTX.show(ev.clientX, ev.clientY, items);
});

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
const kindOf = f => (f.type.startsWith('text/') || /\.(txt|md)$/i.test(f.name)) && !f.type.startsWith('image/') ? 'text' : f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : /\.(ttf|otf|ttc|woff2?)$/i.test(f.name) ? 'font' : null;
// Some systems hand over font files with no extension or as "application/octet-stream": recognise them by their first bytes instead
const FONT_ACCEPT = '.ttf,.otf,.ttc,.woff,.woff2,font/*,application/font-sfnt,application/font-woff,application/x-font-ttf,application/x-font-otf,application/x-font-truetype,application/x-font-opentype,application/octet-stream';
async function sniffFont(f) { try { const b = new Uint8Array(await f.slice(0, 4).arrayBuffer()), t = String.fromCharCode(...b);
  if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || t === 'true') return '.ttf'; if (t === 'OTTO') return '.otf'; if (t === 'ttcf') return '.ttc'; if (t === 'wOFF') return '.woff'; if (t === 'wOF2') return '.woff2'; } catch (e) {} return null; }
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sudo-make-art', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sources', { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function dbDo(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const q = fn(db.transaction('sources', mode).objectStore('sources')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
let sources = [], thumbURLs = [];
async function loadSources() { try { sources = (await dbDo('readonly', st => st.getAll())).sort((a, b) => a.added - b.added); } catch (e) { sources = []; } renderSources(); }
async function addSource(file, meta, folder = null) {
  const kind = kindOf(file); if (!kind) return null;
  const dup = sources.find(x => x.name === file.name && x.blob.size === file.size); if (dup) return dup; // already in the library
  const rec = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: file.name, kind, blob: file, added: Date.now(), folder, ...(meta && typeof meta.fontName === 'string' ? { fontName: meta.fontName.slice(0, 80) } : {}) };
  try { await dbDo('readwrite', st => st.put(rec)); } catch (e) { alert('Could not save to the local library: ' + e.message); }
  sources.push(rec); renderSources(); return rec;
}
async function delSource(id) { try { await dbDo('readwrite', st => st.delete(id)); } catch (e) {} sources = sources.filter(s => s.id !== id); renderSources(); }
const smaSubs = [];
window.SMA = { addSourceRec: (file, meta, folder) => addSource(file, meta, folder), FONT_ACCEPT, ext: { doc: () => doc, zoom: () => zoom, pt, mk, el, commit, render, find, select: id => { sel = id; render(); }, selected: () => sel && find(sel), add: e => { commit(); doc.els.push(e); sel = e.id; render(); return e; }, remove: id => { doc.els = doc.els.filter(x => x.id !== id); if (sel === id) sel = null; }, svg }, render: () => render(), cssFamily, buildPDF, addImageBlob: b => readImage(b), selectedImage: () => { const e = sel && find(sel); return e && e.type === 'image' ? { src: e.src, w: e.nw || e.w, h: e.nh || e.h } : null; }, getSources: () => sources, useSource: sr => useSource(sr), delSource: id => delSource(id), addFiles: (fs, meta) => ingest(fs, false, meta), subscribe: fn => smaSubs.push(fn), download: (n, b) => download(n, b) };
// ---------- source folders (a tree you make yourself; files and folders can be dragged into any folder) ----------
let folders = []; try { folders = JSON.parse(localStorage.getItem('sma-folders') || '[]'); } catch (e) {}
let curFolder = null, renamingFolder = null;
const picked = new Set(); let lastPick = null, visibleKeys = []; // tiles chosen with Ctrl/Shift-click, so several can be dragged at once
const saveFolders = () => { try { localStorage.setItem('sma-folders', JSON.stringify(folders)); } catch (e) {} };
const folderOf = id => folders.find(f => f.id === id);
const validFolder = id => (id && folderOf(id) ? id : null);
const inside = (id, anc) => { for (let f = folderOf(id), n = 0; f && n < 99; f = folderOf(f.parent), n++) if (f.id === anc) return true; return false; }; // is id anc or inside anc?
async function moveSource(id, folder) { const sr = sources.find(x => x.id === id); if (!sr) return; sr.folder = folder; try { await dbDo('readwrite', st => st.put(sr)); } catch (e) {} renderSources(); }
function moveFolder(id, parent) { const f = folderOf(id); if (!f || (parent && inside(parent, id)) || f.parent === parent) return; f.parent = parent; saveFolders(); renderSources(); }
function newFolder() { const f = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: 'New folder', parent: curFolder }; folders.push(f); saveFolders(); renamingFolder = f.id; renderSources(); }
function deleteFolder(id) { const f = folderOf(id); if (!f) return; const n = sources.filter(s => s.folder === id).length + folders.filter(x => x.parent === id).length;
  if (n && !confirm(`Delete the folder "${f.name}"? Its ${n} item${n > 1 ? 's' : ''} move up one level. Nothing in it is deleted.`)) return;
  folders.filter(x => x.parent === id).forEach(x => { x.parent = f.parent; }); sources.filter(s => s.folder === id).forEach(s => { s.folder = f.parent; dbDo('readwrite', st => st.put(s)).catch(() => {}); });
  folders = folders.filter(x => x.id !== id); if (curFolder === id || inside(curFolder, id)) curFolder = f.parent; saveFolders(); renderSources(); }
function paintPicked() { document.querySelectorAll('#srclist [data-key]').forEach(n => n.classList.toggle('picked', picked.has(n.dataset.key))); const c = $('#srcsel'); if (c) { c.hidden = !picked.size; c.textContent = picked.size ? picked.size + ' selected. Drag any of them into a folder. Esc clears.' : ''; } }
(() => { // hold the left button on empty space in Sources and drag a box over tiles to select them (Ctrl/Shift adds to the selection)
  const list = $('#srclist'); let m = null;
  list.addEventListener('pointerdown', ev => { if (ev.button !== 0 || ev.target.closest('.src') || ev.target.closest('input,button')) return;
    m = { x0: ev.clientX, y0: ev.clientY, add: ev.ctrlKey || ev.metaKey || ev.shiftKey, base: new Set(picked), box: document.createElement('div') }; m.box.className = 'marquee'; document.body.append(m.box);
    list.setPointerCapture(ev.pointerId); if (!m.add) picked.clear(); paintPicked(); ev.preventDefault(); });
  list.addEventListener('pointermove', ev => { if (!m) return; const L = Math.min(m.x0, ev.clientX), T = Math.min(m.y0, ev.clientY), R = Math.max(m.x0, ev.clientX), B = Math.max(m.y0, ev.clientY);
    Object.assign(m.box.style, { left: L + 'px', top: T + 'px', width: R - L + 'px', height: B - T + 'px' });
    list.querySelectorAll('[data-key]').forEach(n => { const b = n.getBoundingClientRect(), k = n.dataset.key; if (b.left < R && b.right > L && b.top < B && b.bottom > T) picked.add(k); else if (!m.base.has(k)) picked.delete(k); });
    paintPicked(); const pr = list.parentElement.getBoundingClientRect(); if (ev.clientY > pr.bottom - 24) list.parentElement.scrollTop += 12; else if (ev.clientY < pr.top + 24) list.parentElement.scrollTop -= 12; });
  const end = () => { if (m) { m.box.remove(); m = null; } }; list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
})();
function pickTile(key, ev) { // true when the click was a selection click (Ctrl/Cmd toggles, Shift selects a range)
  if (ev.ctrlKey || ev.metaKey) { if (picked.has(key)) picked.delete(key); else picked.add(key); lastPick = key; paintPicked(); return true; }
  if (ev.shiftKey && lastPick && visibleKeys.includes(lastPick)) { const a = visibleKeys.indexOf(lastPick), b = visibleKeys.indexOf(key); visibleKeys.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(k => picked.add(k)); paintPicked(); return true; }
  if (picked.size) { picked.clear(); paintPicked(); } lastPick = key; return false; }
function startDrag(ev, key, single, kind) { // dragging a picked tile takes every picked tile along
  if (picked.has(key) && picked.size > 1) ev.dataTransfer.setData('text/sma-multi', JSON.stringify([...picked]));
  else { picked.clear(); paintPicked(); ev.dataTransfer.setData(kind, single); }
  ev.dataTransfer.effectAllowed = 'copyMove'; }
function moveMany(keys, target) { let changed = false;
  for (const k of keys) { const id = k.slice(2);
    if (k[0] === 's') { const sr = sources.find(x => x.id === id); if (sr && (sr.folder || null) !== target) { sr.folder = target; dbDo('readwrite', st => st.put(sr)).catch(() => {}); changed = true; } }
    else if (k[0] === 'f') { const f = folderOf(id); if (f && id !== target && !(target && inside(target, id)) && (f.parent || null) !== target) { f.parent = target; changed = true; } } }
  if (changed) saveFolders(); picked.clear(); renderSources(); }
function dropOnFolder(ev, target) { // target: folder id or null (the top level)
  ev.preventDefault(); ev.stopPropagation(); ev.currentTarget.classList.remove('over');
  const sid = ev.dataTransfer.getData('text/sma-source'), fid = ev.dataTransfer.getData('text/sma-folder'), many = ev.dataTransfer.getData('text/sma-multi');
  if (many) { try { moveMany(JSON.parse(many), target); } catch (e) {} } else if (sid) moveSource(sid, target); else if (fid) moveFolder(fid, target); else if (ev.dataTransfer.files.length) ingest([...ev.dataTransfer.files], false, undefined, target);
}
const dropTarget = (n, target) => { n.addEventListener('dragover', ev => { ev.preventDefault(); ev.stopPropagation(); n.classList.add('over'); }); n.addEventListener('dragleave', () => n.classList.remove('over')); n.addEventListener('drop', ev => dropOnFolder(ev, target)); };
function renderSources() {
  setTimeout(() => smaSubs.forEach(f => f()), 0);
  thumbURLs.forEach(URL.revokeObjectURL); thumbURLs = [];
  curFolder = validFolder(curFolder);
  const crumbs = $('#srccrumbs'); crumbs.textContent = ''; const chain = []; for (let f = folderOf(curFolder), n = 0; f && n < 99; f = folderOf(f.parent), n++) chain.unshift(f);
  [{ id: null, name: 'Library' }, ...chain].forEach((f, i, a) => { const b = document.createElement('button'); b.textContent = f.name; b.className = 'crumb' + (i === a.length - 1 ? ' on' : ''); b.onclick = () => { curFolder = f.id; renderSources(); }; dropTarget(b, f.id); crumbs.append(b); if (i < a.length - 1) crumbs.append(' › '); });
  const box = $('#srclist'); box.textContent = '';
  const subs = folders.filter(f => (validFolder(f.parent) || null) === curFolder).sort((a, b) => a.name.localeCompare(b.name)), files = sources.filter(s => validFolder(s.folder) === curFolder);
  if (!sources.length && !folders.length) box.innerHTML = '<p class="hint">Drop images, videos or audio here, or press Add files. They stay in your library next time you open the app. Use + Folder to organise them; drag anything into a folder.</p>';
  else if (!subs.length && !files.length) box.innerHTML = '<p class="hint">This folder is empty. Drag files or folders here, or drop files from your computer.</p>';
  visibleKeys = [...subs.map(f => 'f:' + f.id), ...files.map(x => 's:' + x.id)]; [...picked].forEach(k => { if (!visibleKeys.includes(k)) picked.delete(k); });
  subs.forEach(f => {
    const d = document.createElement('div'); d.className = 'src fld'; d.draggable = true; d.dataset.folder = f.id; d.dataset.key = 'f:' + f.id; d.title = f.name + ' (click to open, drag to move; Ctrl-click to select several)';
    d.ondragstart = ev => { startDrag(ev, 'f:' + f.id, f.id, 'text/sma-folder'); ev.stopPropagation(); };
    d.append(Object.assign(document.createElement('div'), { className: 'ico', textContent: '📁' }));
    const count = sources.filter(s => s.folder === f.id).length + folders.filter(x => x.parent === f.id).length;
    if (renamingFolder === f.id) { const i = document.createElement('input'); i.value = f.name; i.className = 'rn'; i.maxLength = 60;
      const done = ok => { if (renamingFolder !== f.id) return; renamingFolder = null; if (ok && i.value.trim()) { f.name = i.value.trim(); saveFolders(); } renderSources(); };
      i.onkeydown = ev => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); ev.stopPropagation(); }; i.onblur = () => done(true); i.onclick = ev => ev.stopPropagation(); d.append(i); setTimeout(() => { i.focus(); i.select(); }, 0); }
    else { const n = document.createElement('small'); n.textContent = f.name + ' · ' + count; n.ondblclick = ev => { ev.stopPropagation(); renamingFolder = f.id; renderSources(); }; d.append(n); }
    const r = document.createElement('button'); r.className = 'x r'; r.textContent = '✎'; r.title = 'Rename folder'; r.onclick = ev => { ev.stopPropagation(); renamingFolder = f.id; renderSources(); }; d.append(r);
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Delete folder (its contents move up)'; x.onclick = ev => { ev.stopPropagation(); deleteFolder(f.id); }; d.append(x);
    d.onclick = ev => { if (renamingFolder === f.id || pickTile('f:' + f.id, ev)) return; curFolder = f.id; renderSources(); }; dropTarget(d, f.id); box.append(d);
  });
  files.forEach(sr => {
    const d = document.createElement('div'); d.className = 'src'; d.title = sr.name; d.draggable = true; d.dataset.key = 's:' + sr.id;
    d.ondragstart = ev => startDrag(ev, 's:' + sr.id, sr.id, 'text/sma-source');
    if (sr.kind === 'font') d.append(Object.assign(document.createElement('div'), { className: 'ico', textContent: 'Aa', title: 'A font you added. Pick it in the font list of any text.' }));
    else if (sr.kind === 'image' || sr.kind === 'video') {
      const u = URL.createObjectURL(sr.blob); thumbURLs.push(u);
      const m = document.createElement(sr.kind === 'image' ? 'img' : 'video'); m.src = u + (sr.kind === 'video' ? '#t=0.1' : ''); m.muted = true; m.preload = 'metadata'; m.draggable = false; d.append(m);
    } else d.append(Object.assign(document.createElement('div'), { className: 'ico', textContent: sr.kind === 'text' ? '📝' : '♪' }));
    const n = document.createElement('small'); n.textContent = sr.name; d.append(n);
    const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove from library';
    x.onclick = ev => { ev.stopPropagation(); delSource(sr.id); }; d.append(x);
    d.onclick = ev => { if (!pickTile('s:' + sr.id, ev)) useSource(sr); };
    box.append(d);
  });
  paintPicked();
}
function useSource(sr) { if (sr.kind === 'font') return; if (sr.kind === 'text') { if (window.SMA_textgrab) window.SMA_textgrab.viewText(sr); return; } if (sr.kind === 'image') readImage(sr.blob); else alert('Video and audio editing is coming in a later release. The file is kept in your library.'); }
async function ingest(files, place, meta, folder = curFolder) {
  for (let f of files) { if (!kindOf(f)) { const x = await sniffFont(f); if (!x) continue; f = new File([f], f.name.replace(/\.[^.]*$/, '') + x, { type: f.type }); } const rec = await addSource(f, meta, folder); if (place && rec && rec.kind === 'image') useSource(rec); }
}
document.querySelector('[data-panel=sources]').onclick = () => { const p = $('#sources'); p.hidden = !p.hidden; };
$('#srcnew').onclick = newFolder;
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && picked.size) { picked.clear(); paintPicked(); } });
$('#srcadd').onclick = () => { const f = $('#file'); f.accept = 'image/*,video/*,audio/*,' + FONT_ACCEPT; f.multiple = true; f.value = ''; f.onchange = () => { ingest([...f.files], false); f.multiple = false; }; f.click(); };
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const many = e.dataTransfer.getData('text/sma-multi');
  if (many) { if (!e.target.closest('#sources')) { try { JSON.parse(many).filter(k => k[0] === 's').forEach(k => { const sr = sources.find(x => x.id === k.slice(2)); if (sr) useSource(sr); }); } catch (er) {} } return; }
  const id = e.dataTransfer.getData('text/sma-source');
  if (id) { const sr = sources.find(s => s.id === id); if (sr && !e.target.closest('#sources')) useSource(sr); return; }
  ingest([...e.dataTransfer.files], !e.target.closest('#sources'));
});
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])], typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (files.length) ingest(files, true); else if (!typing && isDesign()) pasteEl(); // Ctrl+V pastes the element you copied
});
const isDesign = () => !/(video|home|convert|vconvert|vtrim|live|pixels|tiles|music|games|manga|vn|tcg|write|avatar)-mode/.test(document.body.className);

// ---------- new design dialog ----------
const dlg = $('#newdlg');
function buildDialog() {
  const nav = $('#newcats'), grid = $('#newgrid');
  const show = cat => {
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cat === cat)); grid.textContent = '';
    if (OTHER_APPS[cat]) { const o = OTHER_APPS[cat], p = document.createElement('p'); p.className = 'hint'; p.textContent = o.blurb; grid.append(p);
      o.items.forEach(n => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = '<b></b><small>Opens ' + (o.mode === 'write' ? 'the writing app' : 'the video editor') + '</small>'; b.firstChild.textContent = n; b.onclick = () => { dlg.close(); setMode(o.mode); }; grid.append(b); }); return; }
    const TC = window.SMA_NEWCATS && window.SMA_NEWCATS[cat];
    if (TC) { // template categories: pick one and it opens as a design you can edit
      TC.groups.forEach(gp => { grid.append(Object.assign(document.createElement('h4'), { className: 'tgroup', textContent: gp.name }));
        gp.items.forEach(t => { const b = document.createElement('button'); b.className = 'card tpl'; const d = t.make(), sv = document.createElementNS(NS, 'svg'); sv.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`); sv.setAttribute('class', 'tplprev');
          if (d.bg !== 'transparent') { const r = document.createElementNS(NS, 'rect'); r.setAttribute('width', d.w); r.setAttribute('height', d.h); r.setAttribute('fill', d.bg); sv.append(r); }
          const g = document.createElementNS(NS, 'g'); sv.append(g); try { d.els.forEach(e => drawEl(e, g)); } catch (er) {} b.append(sv, Object.assign(document.createElement('b'), { textContent: t.name }), Object.assign(document.createElement('small'), { textContent: t.note || '' }));
          b.onclick = () => { const m = t.make(); commit(); adopt({ w: m.w, h: m.h, dpi: m.dpi, name: t.name, pages: [{ bg: m.bg, els: m.els }], cur: 0 }); sel = null; dlg.close(); setMode('design'); fit(); }; grid.append(b); }); });
      return;
    }
    if (cat === 'Custom size') {
      grid.innerHTML = '<div class="cust"><label>Width <input id="cw" type="number" value="1080" min="1" step="any"></label><button id="clock" type="button" title="Keep the shape (aspect ratio) when you change one side" aria-pressed="false">🔓</button><label>Height <input id="ch" type="number" value="1080" min="1" step="any"></label>' +
        '<label>Units <select id="cu"><option value="px">pixels</option><option value="in">inches</option><option value="mm">millimetres</option><option value="cm">centimetres</option></select></label>' +
        '<label id="cdpil" hidden>Resolution <select id="cdpi"><option>72</option><option>150</option><option selected>300</option></select> dpi</label><p id="cinfo" class="hint"></p><button id="cgo" class="pri">Create</button></div>';
      let lock = false, ratio = 1; const W = $('#cw'), H = $('#ch'), U = $('#cu'), D = $('#cdpi'), perUnit = () => ({ px: 1, in: +D.value, mm: +D.value / 25.4, cm: +D.value / 2.54 })[U.value];
      const info = () => { const k = perUnit(); $('#cinfo').textContent = `${Math.round(Math.max(1, +W.value) * k)} × ${Math.round(Math.max(1, +H.value) * k)} px` + (U.value === 'px' ? '' : ' at ' + D.value + ' dpi'); };
      $('#clock').onclick = () => { lock = !lock; ratio = (+W.value || 1) / (+H.value || 1); $('#clock').textContent = lock ? '🔒' : '🔓'; $('#clock').setAttribute('aria-pressed', lock); };
      W.oninput = () => { if (lock) H.value = +(W.value / ratio).toFixed(3); info(); }; H.oninput = () => { if (lock) W.value = +(H.value * ratio).toFixed(3); info(); };
      U.onchange = () => { const old = U.dataset.u || 'px', kOld = { px: 1, in: +D.value, mm: +D.value / 25.4, cm: +D.value / 2.54 }[old], kNew = perUnit(); W.value = +(W.value * kOld / kNew).toFixed(2); H.value = +(H.value * kOld / kNew).toFixed(2); U.dataset.u = U.value; $('#cdpil').hidden = U.value === 'px'; info(); };
      D.onchange = info; info();
      $('#cgo').onclick = () => { const k = perUnit(), w = Math.min(8000, Math.max(16, Math.round(+W.value * k) || 1080)), h = Math.min(8000, Math.max(16, Math.round(+H.value * k) || 1080)); make(w, h, U.value === 'px' ? undefined : +D.value); };
      return;
    }
    PRESETS[cat].forEach(([n, w, h, dpi]) => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = `<b></b><small>${w} × ${h} px</small>`; b.firstChild.textContent = n; b.onclick = () => make(w, h, dpi); grid.append(b); });
  };
  const cats = Object.keys(PRESETS), at = cats.indexOf('Channel icons & banners') + 1; cats.splice(at, 0, ...Object.keys(window.SMA_NEWCATS || {}));
  [...cats, ...Object.keys(OTHER_APPS), 'Custom size'].forEach(c => { const b = document.createElement('button'); b.textContent = c; b.dataset.cat = c; b.onclick = () => show(c); nav.append(b); });
  show('Default image size');
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
  if (doc.bg !== 'transparent') { const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', doc.w); bg.setAttribute('height', doc.h); bg.setAttribute('fill', doc.bg); c.insertBefore(bg, c.firstChild); } c.setAttribute('xmlns', NS);
  const fontCss = window.SMA_FONTS ? window.SMA_FONTS.embedCSS(doc.els.filter(e => e.type === 'text').map(e => e.font)) : ''; // added fonts travel inside the file, so exports look the same
  if (fontCss) { const st = document.createElementNS(NS, 'style'); st.textContent = fontCss; c.insertBefore(st, c.firstChild); }
  if (window.SMA_META && SMA_META.get()) c.querySelectorAll('image').forEach(im => { const h = im.getAttribute('href'); if (h && h.startsWith('data:image/')) im.setAttribute('href', SMA_META.dataUrl(h)); }); // photos keep their pixels, lose their EXIF / GPS
  return new XMLSerializer().serializeToString(c);
}
// ---------- icon exports: a Windows .ico, or a zip of PNG sizes in an icon-theme folder layout (plus the SVG) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) { // stored (no compression), which is fine for PNG
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) { const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true); central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length; }
  const cdSize = central.reduce((n, a) => n + a.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
function makeIco(pngs) { // pngs: [{ size, data }]; PNG-inside-ICO is understood by every modern system
  const n = pngs.length, head = new DataView(new ArrayBuffer(6 + 16 * n)); head.setUint16(2, 1, true); head.setUint16(4, n, true); let off = 6 + 16 * n;
  pngs.forEach((p, i) => { const o = 6 + 16 * i; head.setUint8(o, p.size >= 256 ? 0 : p.size); head.setUint8(o + 1, p.size >= 256 ? 0 : p.size); head.setUint16(o + 4, 1, true); head.setUint16(o + 6, 32, true); head.setUint32(o + 8, p.data.length, true); head.setUint32(o + 12, off, true); off += p.data.length; });
  return new Blob([head, ...pngs.map(p => p.data)], { type: 'image/x-icon' });
}
async function pngAt(img, size) { // the design fitted (not stretched) into a size x size square
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const k = Math.min(size / doc.w, size / doc.h), w = doc.w * k, h = doc.h * k, c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/png'))).arrayBuffer());
}
async function exportIcons(kind, xml) {
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
  const slug = ((doc.name || 'icon').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')) || 'icon';
  if (kind === 'ico') { const sizes = [16, 24, 32, 48, 64, 128, 256], pngs = []; for (const s of sizes) pngs.push({ size: s, data: await pngAt(img, s) }); return download(slug + '.ico', makeIco(pngs)); }
  const files = []; for (const s of [16, 22, 24, 32, 48, 64, 96, 128, 192, 256, 512]) files.push({ name: `icon-theme/${s}x${s}/apps/${slug}.png`, data: await pngAt(img, s) });
  files.push({ name: `icon-theme/scalable/apps/${slug}.svg`, data: new TextEncoder().encode(xml) }); download(slug + '-icons.zip', makeZip(files));
}
$('#export').onchange = ev => {
  const fmt = ev.target.value; ev.target.value = ''; if (!fmt) return;
  if (fmt === 'pdf') return exportPDF();
  if (fmt === 'ico' || fmt === 'icons') return exportIcons(fmt, cleanSVG()).catch(e => alert('Could not export: ' + e.message));
  const xml = cleanSVG();
  if (fmt === 'svg') return download('design.svg', new Blob([xml], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = doc.w; cv.height = doc.h;
    const ctx = cv.getContext('2d'); if (fmt === 'jpg') { ctx.fillStyle = bgFill(); ctx.fillRect(0, 0, doc.w, doc.h); }
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
    const cv = document.createElement('canvas'); cv.width = doc.w; cv.height = doc.h; const cx = cv.getContext('2d'); cx.fillStyle = bgFill(); cx.fillRect(0, 0, doc.w, doc.h); cx.drawImage(img, 0, 0, doc.w, doc.h);
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
  else if (mod && k === 'c' && sel && isDesign()) { copyEl(); }
  else if (k === 'delete' || k === 'backspace') del();
  else if (k.startsWith('arrow') && sel) {
    ev.preventDefault(); const e = find(sel), d = ev.shiftKey ? 10 : 1; commit();
    if (k === 'arrowleft') e.x -= d; if (k === 'arrowright') e.x += d; if (k === 'arrowup') e.y -= d; if (k === 'arrowdown') e.y += d; render();
  } else if (k === 'escape') { sel = null; render(); }
});

// ---------- home / design / video mode ----------
function setMode(m) {
  document.body.classList.toggle('video-mode', m === 'video'); document.body.classList.toggle('home-mode', m === 'home'); document.body.classList.toggle('convert-mode', m === 'convert'); document.body.classList.toggle('vconvert-mode', m === 'vconvert'); document.body.classList.toggle('vtrim-mode', m === 'vtrim'); document.body.classList.toggle('live-mode', m === 'live'); document.body.classList.toggle('pixels-mode', m === 'pixels'); document.body.classList.toggle('tiles-mode', m === 'tiles'); document.body.classList.toggle('music-mode', m === 'music'); document.body.classList.toggle('games-mode', m === 'games'); document.body.classList.toggle('manga-mode', m === 'manga'); document.body.classList.toggle('vn-mode', m === 'vn'); document.body.classList.toggle('tcg-mode', m === 'tcg'); document.body.classList.toggle('write-mode', m === 'write'); document.body.classList.toggle('avatar-mode', m === 'avatar');
  ['home', 'design', 'video', 'convert', 'vconvert', 'vtrim', 'live'].forEach(k => $('#mode-' + k)?.classList.toggle('on', k === m));
  if (m !== 'video') window.SMA_video?.hide();
  if (m !== 'pixels') window.SMA_pixels?.hide(); else window.SMA_pixels?.show();
  if (m === 'tiles') window.SMA_tiles?.show();
  if (m !== 'music') window.SMA_music?.hide(); else window.SMA_music?.show();
  if (m !== 'games') window.SMA_games?.hide(); else window.SMA_games?.show();
  if (m === 'manga') window.SMA_manga?.show();
  if (m === 'avatar') window.SMA_avatar?.show();
  if (m !== 'vn') window.SMA_vn?.hide(); else window.SMA_vn?.show();
  if (m === 'tcg') window.SMA_tcg?.show();
  if (m !== 'write') window.SMA_write?.hide(); else window.SMA_write?.show();
  if (m === 'video') window.SMA_video?.show(); else if (m === 'design') fit();
  document.dispatchEvent(new CustomEvent('sma-mode', { detail: m }));
}
$('#mode-home').onclick = () => setMode('home'); $('#mode-design').onclick = () => setMode('design'); $('#mode-video').onclick = () => setMode('video');
$('#mode-convert').onclick = () => setMode('convert');
$('#mode-vconvert').onclick = () => setMode('vconvert'); $('#mode-vtrim').onclick = () => setMode('vtrim'); $('#mode-live').onclick = () => setMode('live');
async function designThumb() {
  const xml = cleanSVG();
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
  const k = 320 / Math.max(doc.w, doc.h), cv = document.createElement('canvas'); cv.width = Math.round(doc.w * k); cv.height = Math.round(doc.h * k);
  const cx = cv.getContext('2d'); cx.fillStyle = bgFill(); cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', 0.7);
}
window.SMA.design = {
  serialize, thumb: designThumb, getPid: () => doc.pid, setPid: p => { doc.pid = p; }, getName: () => doc.name || 'Untitled design', setName: n => { doc.name = n; },
  load: json => { adopt(JSON.parse(json)); sel = null; undoS = []; redoS = []; fit(); },
};
window.SMA.setMode = setMode;

document.addEventListener('sma-fonts', () => { if (!document.body.classList.contains('home-mode')) render(); }); // a font finished loading: draw again so text uses it

// ---------- boot ----------
try { const s = localStorage.getItem('sma-doc'); if (s) adopt(JSON.parse(s)); } catch (e) {}
window.addEventListener('resize', () => { });
fit();
loadSources();
setTimeout(() => setMode('home'), 0);
})();
