// Sudo Make Manga: a page editor for manga and comics. Original code for this project.
// Panels (four-cornered, so slanted cuts work), speech bubbles with tails, sound effects, screentones, speed lines and ink strokes.
// Pages are saved in a plain 'sudo-make-manga' JSON format. The drawing code is shared (renderPageOf / renderPanelOf), so other
// modes (the visual novel) can use pages and single panels without opening this editor.
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA;
if (!SMA || !$('#mangaview')) return;
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const str = (v, max) => String(v == null ? '' : v).slice(0, max), col = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
const SIZES = { b5: [1050, 1500, 'Manga page (B5)'], a4: [1240, 1754, 'A4'], us: [1050, 1600, 'US comic'], web: [800, 2400, 'Webtoon strip (tall)'], sq: [1200, 1200, 'Square'] };
const FONTS = ['sans-serif', 'serif', 'cursive', 'monospace', 'Impact', 'Comic Sans MS'];
const cssFamily = n => (SMA.cssFamily ? SMA.cssFamily(n) : n);
let nextId = 1; const newId = () => 'o' + (nextId++).toString(36) + Math.random().toString(36).slice(2, 5);

// ---------- the document ----------
// doc = { pageW, pageH, rtl, pages: [{ objs: [...] }], images: { id: dataURL } }
let doc = blank('b5'), pg = 0, sel = null, tool = 'select', zoom = 0.4, pid = null, name = 'Untitled manga';
function blank(size) { const [w, h] = SIZES[size]; return { pageW: w, pageH: h, rtl: true, pages: [{ objs: [] }], images: {}, models: {} }; }
const page = () => doc.pages[pg];
const imgCache = new Map(); // id -> HTMLImageElement
function getImage(id) { if (imgCache.has(id)) return imgCache.get(id); const src = doc.images[id]; if (!src) return null; const im = new Image(); im.onload = () => { imgCache.set(id, im); render(); }; im.src = src; imgCache.set(id, im); return im; }
const ready = im => im && im.complete && im.naturalWidth > 0;

// ---------- making things ----------
const quad = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const mkPanel = pts => ({ t: 'panel', id: newId(), pts, bw: 6, bc: '#000000', bg: '#ffffff', img: null, scale: 1, ox: 0, oy: 0 });
const mkBubble = (x, y, shape) => ({ t: 'bubble', id: newId(), x, y, w: shape === 'box' ? 300 : 280, h: shape === 'box' ? 90 : 190, shape, text: 'Text', font: 'sans-serif', size: 30, bold: false, fill: '#ffffff', stroke: '#000000', sw: 4, tail: shape === 'box' || shape === 'none' ? null : [x + 70, y + 270] });
const mkSfx = (x, y) => ({ t: 'sfx', id: newId(), x, y, text: 'BOOM', font: 'Impact', size: 130, rot: -8, fill: '#000000', stroke: '#ffffff', sw: 14 });
const mkTone = (x, y, w, h, clip) => ({ t: 'tone', id: newId(), x, y, w, h, kind: 'dots', level: 35, angle: 45, size: 9, shape: 'rect', clip: clip || '' });
const mkSpeed = (x, y, w, h, clip) => ({ t: 'speed', id: newId(), x, y, w, h, kind: 'focus', lines: 90, thick: 5, inner: 30, angle: 0, seed: Math.floor(Math.random() * 1e6), clip: clip || '' });

// ---------- panels: cutting a four-cornered panel with a line ----------
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function edgeParam(A, B, p0, p1) { const d = [p1[0] - p0[0], p1[1] - p0[1]], e = [B[0] - A[0], B[1] - A[1]], den = e[0] * d[1] - e[1] * d[0]; if (Math.abs(den) < 1e-9) return null; return ((p0[0] - A[0]) * d[1] - (p0[1] - A[1]) * d[0]) / den; }
// Cuts quad [TL,TR,BR,BL] along the line p0->p1, leaving a gap (gutter) between the two pieces. Returns [pieceA, pieceB] or null.
function cutQuad(q, p0, p1, gutter) {
  const [TL, TR, BR, BL] = q, horizontal = Math.abs(p1[0] - p0[0]) >= Math.abs(p1[1] - p0[1]);
  const [a0, a1, b0, b1] = horizontal ? [TL, BL, TR, BR] : [TL, TR, BL, BR];      // the two edges the line crosses
  let s = edgeParam(a0, a1, p0, p1), t = edgeParam(b0, b1, p0, p1); if (s === null || t === null) return null;
  s = Math.max(0.04, Math.min(0.96, s)); t = Math.max(0.04, Math.min(0.96, t));
  const gs = gutter / 2 / Math.max(1, dist(a0, a1)), gt = gutter / 2 / Math.max(1, dist(b0, b1));
  const s1 = lerp(a0, a1, Math.max(0, s - gs)), s2 = lerp(a0, a1, Math.min(1, s + gs)), t1 = lerp(b0, b1, Math.max(0, t - gt)), t2 = lerp(b0, b1, Math.min(1, t + gt));
  return horizontal ? [[TL, TR, t1, s1], [s2, t2, BR, BL]] : [[TL, s1, t1, BL], [s2, TR, BR, t2]];
}
const quadArea = q => { let a = 0; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; } return Math.abs(a) / 2; };
function inQuad(q, x, y) { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const a = q[i], b = q[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const quadBox = q => { const xs = q.map(p => p[0]), ys = q.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

// ---------- layouts ----------
const M = 50, G = 26;
function buildLayout(key, W, H) {
  const area = quad(M, M, W - 2 * M, H - 2 * M), P = [];
  const split = (q, p0, p1) => cutQuad(q, p0, p1, G), mid = (q, dir, t, slant = 0) => { const [TL, TR, BR, BL] = q; if (dir === 'h') { const a = lerp(TL, BL, t - slant), b = lerp(TR, BR, t + slant); return split(q, a, b); } const a = lerp(TL, TR, t - slant), b = lerp(BL, BR, t + slant); return split(q, a, b); };
  const L = {
    full: () => [area],
    stack2: () => mid(area, 'h', 0.5), side2: () => mid(area, 'v', 0.5),
    stack3: () => { const [a, r] = mid(area, 'h', 1 / 3), [b, c] = mid(r, 'h', 0.5); return [a, b, c]; },
    grid4: () => { const [t, b] = mid(area, 'h', 0.5), [a, c] = mid(t, 'v', 0.5), [d, e] = mid(b, 'v', 0.5); return [a, c, d, e]; },
    hero: () => { const [t, b] = mid(area, 'h', 0.55), [c, d] = mid(b, 'v', 0.5); return [t, c, d]; },
    stagger: () => { const [t, r] = mid(area, 'h', 0.3, 0.04), [m, b] = mid(r, 'h', 0.45, -0.04), [m1, m2] = mid(m, 'v', 0.6, 0.05), [b1, b2] = mid(b, 'v', 0.4, -0.05); return [t, m1, m2, b1, b2]; },
    strip4: () => { const [a, r] = mid(area, 'h', 0.25), [b, r2] = mid(r, 'h', 1 / 3), [c, d] = mid(r2, 'h', 0.5); return [a, b, c, d]; },
  };
  for (const q of (L[key] || L.full)()) P.push(mkPanel(q.map(p => [Math.round(p[0]), Math.round(p[1])]))); return P;
}
const LAYOUTS = [['full', 'One big panel'], ['stack2', 'Two stacked'], ['side2', 'Two side by side'], ['stack3', 'Three stacked'], ['grid4', 'Four in a grid'], ['hero', 'One big, two small'], ['stagger', 'Manga: five, slanted cuts'], ['strip4', 'Four tall strips']];

// ---------- drawing ----------
const quadPath = (c, q) => { c.beginPath(); c.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) c.lineTo(q[i][0], q[i][1]); c.closePath(); };
const rnd = (i, seed) => { const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return v - Math.floor(v); };
function wrapLines(c, text, maxW) { const out = []; for (const para of String(text).split('\n')) { let line = ''; for (const w of para.split(/(\s+)/)) { if (!w) continue; const test = line + w; if (c.measureText(test).width > maxW && line.trim()) { out.push(line.trim()); line = w.trimStart(); } else line = test; } out.push(line.trim()); } return out; }
function bubblePath(c, o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = o.w / 2, ry = o.h / 2; c.beginPath();
  if (o.shape === 'oval') c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  else if (o.shape === 'round') { const r = Math.min(40, rx, ry); c.moveTo(o.x + r, o.y); c.arcTo(o.x + o.w, o.y, o.x + o.w, o.y + o.h, r); c.arcTo(o.x + o.w, o.y + o.h, o.x, o.y + o.h, r); c.arcTo(o.x, o.y + o.h, o.x, o.y, r); c.arcTo(o.x, o.y, o.x + o.w, o.y, r); c.closePath(); }
  else if (o.shape === 'cloud') { const n = Math.max(8, Math.round((rx + ry) / 14)); const pt = (a, k = 1) => [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; const s = pt(0); c.moveTo(s[0], s[1]); for (let i = 1; i <= n; i++) { const a1 = (i / n) * Math.PI * 2, am = ((i - 0.5) / n) * Math.PI * 2, p = pt(a1), m = pt(am, 1.2); c.quadraticCurveTo(m[0], m[1], p[0], p[1]); } c.closePath(); }
  else if (o.shape === 'shout') { const n = 22; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, k = i % 2 ? 0.8 : 1.08 + 0.08 * Math.sin(i * 12.9); const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); }
  else c.rect(o.x, o.y, o.w, o.h);
}
function tailPath(c, o) {
  if (!o.tail) return false; const cx = o.x + o.w / 2, cy = o.y + o.h / 2, dx = o.tail[0] - cx, dy = o.tail[1] - cy, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, base = Math.min(o.w, o.h) * 0.13;
  const rx = o.w / 2, ry = o.h / 2, k = 1 / Math.hypot(ux / rx, uy / ry), ex = cx + ux * k * 0.86, ey = cy + uy * k * 0.86, px = -uy * base, py = ux * base;
  c.beginPath(); c.moveTo(ex + px, ey + py); c.lineTo(o.tail[0], o.tail[1]); c.lineTo(ex - px, ey - py); c.closePath(); return true;
}
function toneRegion(c, o, pageObj) { c.beginPath(); if (o.shape === 'ellipse') c.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2); else c.rect(o.x, o.y, o.w, o.h); c.clip(); const p = o.clip && pageObj.objs.find(q => q.id === o.clip && q.t === 'panel'); if (p) { quadPath(c, p.pts); c.clip(); } }
function drawTone(c, o, pageObj) {
  c.save(); toneRegion(c, o, pageObj); const s = Math.max(3, o.size), L = num(o.level, 0, 100, 30) / 100; c.fillStyle = '#000'; c.strokeStyle = '#000';
  const bx = Math.min(o.x, o.x + o.w), by = Math.min(o.y, o.y + o.h), bw = Math.abs(o.w), bh = Math.abs(o.h), cx = bx + bw / 2, cy = by + bh / 2, R = Math.hypot(bw, bh) / 2 + s;
  c.translate(cx, cy); c.rotate(o.angle * Math.PI / 180);
  if (o.kind === 'dots' || o.kind === 'gradient') {
    const grad = o.kind === 'gradient'; for (let y = -R; y < R; y += s) for (let x = -R; x < R; x += s) {
      const lv = grad ? L * (1 - (y + R) / (2 * R)) : L, r = lv <= 0.78 ? s * Math.sqrt(lv / Math.PI) : null; if (lv <= 0.005) continue;
      const px = x + s / 2 + ((Math.round(y / s) % 2) ? s / 2 : 0) * 0, py = y + s / 2; c.beginPath(); if (r !== null) { c.arc(px, py, r, 0, Math.PI * 2); c.fill(); } else { c.rect(x, y, s, s); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, s * Math.sqrt((1 - lv) / Math.PI), 0, Math.PI * 2); c.fill(); c.fillStyle = '#000'; }
    }
  } else { const t = Math.max(1, s * L); for (let y = -R; y < R; y += s) c.fillRect(-R, y + (s - t) / 2, 2 * R, t); if (o.kind === 'hatch') for (let x = -R; x < R; x += s) c.fillRect(x + (s - t) / 2, -R, t, 2 * R); }
  c.restore();
}
function drawSpeed(c, o, pageObj) {
  c.save(); c.beginPath(); c.rect(Math.min(o.x, o.x + o.w), Math.min(o.y, o.y + o.h), Math.abs(o.w), Math.abs(o.h)); c.clip(); const p = o.clip && pageObj.objs.find(q => q.id === o.clip && q.t === 'panel'); if (p) { quadPath(c, p.pts); c.clip(); }
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, R = Math.hypot(o.w, o.h) / 2 + 10, r0 = Math.min(Math.abs(o.w), Math.abs(o.h)) / 2 * num(o.inner, 0, 95, 30) / 100; c.fillStyle = '#000';
  if (o.kind === 'focus') { for (let i = 0; i < o.lines; i++) { const a = (i + rnd(i, o.seed) * 0.8) / o.lines * Math.PI * 2, w = o.thick * (0.4 + rnd(i + 99, o.seed)) * 0.012, ri = r0 * (0.9 + rnd(i + 7, o.seed) * 0.4); c.beginPath(); c.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri); c.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R); c.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R); c.closePath(); c.fill(); } }
  else { c.translate(cx, cy); c.rotate(o.angle * Math.PI / 180); const span = Math.hypot(o.w, o.h); for (let i = 0; i < o.lines; i++) { const y = -span / 2 + (i + rnd(i, o.seed)) / o.lines * span, len = span * (0.35 + rnd(i + 5, o.seed) * 0.65), x = -span / 2 + rnd(i + 11, o.seed) * (span - len); c.fillRect(x, y, len, o.thick * (0.3 + rnd(i + 3, o.seed))); } }
  c.restore();
}
function drawObj(c, o, pageObj) {
  switch (o.t) {
    case 'panel': {
      quadPath(c, o.pts); c.fillStyle = o.bg; c.fill(); const im = o.img && getImage(o.img);
      if (ready(im)) { c.save(); quadPath(c, o.pts); c.clip(); const [x0, y0, x1, y1] = quadBox(o.pts), bw = x1 - x0, bh = y1 - y0, s = Math.max(bw / im.naturalWidth, bh / im.naturalHeight) * o.scale, w = im.naturalWidth * s, h = im.naturalHeight * s; c.drawImage(im, (x0 + x1) / 2 - w / 2 + o.ox * bw / 100, (y0 + y1) / 2 - h / 2 + o.oy * bh / 100, w, h); c.restore(); }
      if (o.bw > 0) { quadPath(c, o.pts); c.lineWidth = o.bw; c.strokeStyle = o.bc; c.lineJoin = 'miter'; c.stroke(); } break;
    }
    case 'bubble': {
      c.lineWidth = o.sw; c.strokeStyle = o.stroke; c.lineJoin = 'round'; c.fillStyle = o.fill;
      if (o.shape !== 'none') { bubblePath(c, o); c.stroke(); const hasT = tailPath(c, o); if (hasT) c.stroke(); bubblePath(c, o); c.fill(); if (tailPath(c, o)) c.fill(); }
      c.fillStyle = '#000'; c.font = `${o.bold ? 'bold ' : ''}${o.size}px ${cssFamily(o.font)}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const inner = o.shape === 'oval' || o.shape === 'cloud' || o.shape === 'shout' ? 0.72 : 0.9, lines = wrapLines(c, o.text, o.w * inner - 8), lh = o.size * 1.18, y0 = o.y + o.h / 2 - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => c.fillText(l, o.x + o.w / 2, y0 + i * lh)); break;
    }
    case 'sfx': { c.save(); c.translate(o.x, o.y); c.rotate(o.rot * Math.PI / 180); c.font = `bold ${o.size}px ${cssFamily(o.font)}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; const w = c.measureText(o.text).width; o._bb = [o.x - w / 2, o.y - o.size * 0.6, w, o.size * 1.2]; if (o.sw > 0) { c.lineWidth = o.sw; c.strokeStyle = o.stroke; c.strokeText(o.text, 0, 0); } c.fillStyle = o.fill; c.fillText(o.text, 0, 0); c.restore(); break; }
    case 'tone': drawTone(c, o, pageObj); break;
    case 'speed': drawSpeed(c, o, pageObj); break;
    case 'char': drawChar(c, o, pageObj); break;
    case 'image': { const im = getImage(o.img); if (ready(im)) c.drawImage(im, o.x, o.y, o.w, o.h); break; }
    case 'ink': { c.strokeStyle = o.color; c.lineWidth = o.size; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(o.pts[0], o.pts[1]); if (o.pts.length === 2) c.lineTo(o.pts[0] + 0.01, o.pts[1]); for (let i = 2; i < o.pts.length; i += 2) c.lineTo(o.pts[i], o.pts[i + 1]); c.stroke(); break; }
  }
}
function renderPageOf(d, pageObj, c) { c.fillStyle = '#fff'; c.fillRect(0, 0, d.pageW, d.pageH); for (const o of pageObj.objs) drawObj(c, o, pageObj); }

// ---------- the editor view ----------
const cv = $('#mg-cv'), status = $('#mg-status');
function render() {
  const d = doc; cv.width = d.pageW; cv.height = d.pageH; cv.style.width = d.pageW * zoom + 'px'; cv.style.height = d.pageH * zoom + 'px'; const c = cv.getContext('2d'); renderPageOf(d, page(), c);
  if (sel && page().objs.includes(sel)) drawSelection(c); if (preview) drawPreview(c); $('#mg-zoom').textContent = Math.round(zoom * 100) + '%'; $('#mg-info').textContent = `${d.pageW}×${d.pageH} px · page ${pg + 1} of ${d.pages.length}`;
}
let preview = null;
function drawPreview(c) { c.save(); c.lineWidth = 2 / zoom; c.strokeStyle = '#ff3b6b'; c.setLineDash([8 / zoom, 6 / zoom]); if (preview.line) { c.beginPath(); c.moveTo(...preview.line[0]); c.lineTo(...preview.line[1]); c.stroke(); } if (preview.rect) { const r = preview.rect; c.strokeRect(r[0], r[1], r[2], r[3]); } c.restore(); }
function handlesOf(o) {
  if (o.t === 'panel') return o.pts.map((p, i) => ({ x: p[0], y: p[1], k: 'pt', i }));
  if (o.t === 'bubble') { const h = [{ x: o.x, y: o.y, k: 'tl' }, { x: o.x + o.w, y: o.y, k: 'tr' }, { x: o.x + o.w, y: o.y + o.h, k: 'br' }, { x: o.x, y: o.y + o.h, k: 'bl' }]; if (o.tail) h.push({ x: o.tail[0], y: o.tail[1], k: 'tail' }); return h; }
  if (o.t === 'tone' || o.t === 'speed' || o.t === 'image' || o.t === 'char') return [{ x: o.x + o.w, y: o.y + o.h, k: 'br' }];
  return [];
}
function drawSelection(c) {
  c.save(); const o = sel, hs = 7 / zoom; c.lineWidth = 2 / zoom; c.strokeStyle = '#8b5cf6';
  if (o.t === 'panel') quadPath(c, o.pts); else { const b = bboxOf(o); c.beginPath(); c.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); } c.stroke();
  for (const h of handlesOf(o)) { c.fillStyle = h.k === 'tail' ? '#ff3b6b' : '#fff'; c.fillRect(h.x - hs, h.y - hs, hs * 2, hs * 2); c.strokeRect(h.x - hs, h.y - hs, hs * 2, hs * 2); } c.restore();
}
function bboxOf(o) { if (o.t === 'panel') return quadBox(o.pts); if (o.t === 'sfx') { if (!o._bb) drawObj(cv.getContext('2d'), o, page()); const b = o._bb || [o.x - 50, o.y - 30, 100, 60]; return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; } if (o.t === 'ink') { const xs = o.pts.filter((_, i) => !(i % 2)), ys = o.pts.filter((_, i) => i % 2); return [Math.min(...xs) - o.size, Math.min(...ys) - o.size, Math.max(...xs) + o.size, Math.max(...ys) + o.size]; } return [Math.min(o.x, o.x + o.w), Math.min(o.y, o.y + o.h), Math.max(o.x, o.x + o.w), Math.max(o.y, o.y + o.h)]; }
function hit(o, x, y) { if (o.t === 'panel') return inQuad(o.pts, x, y); if (o.t === 'ink') return inkDist(o, x, y) <= Math.max(o.size, 8); const b = bboxOf(o); if (o.t === 'bubble' && o.tail && Math.hypot(x - o.tail[0], y - o.tail[1]) < 30) return true; return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }
function inkDist(o, x, y) { let best = 1e9; for (let i = 0; i < o.pts.length; i += 2) { const ax = o.pts[i], ay = o.pts[i + 1], bx = o.pts[i + 2] === undefined ? ax : o.pts[i + 2], by = o.pts[i + 3] === undefined ? ay : o.pts[i + 3], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t))); } return best; }
const topAt = (x, y) => { const objs = page().objs; for (let i = objs.length - 1; i >= 0; i--) if (hit(objs[i], x, y)) return objs[i]; return null; };
const panelAt = (x, y) => { const objs = page().objs; for (let i = objs.length - 1; i >= 0; i--) if (objs[i].t === 'panel' && inQuad(objs[i].pts, x, y)) return objs[i]; return null; };

// ---------- history ----------
const snapJSON = () => JSON.stringify({ pageW: doc.pageW, pageH: doc.pageH, rtl: doc.rtl, pages: doc.pages }, (k, v) => (k[0] === '_' ? undefined : v));
const undoS = [], redoS = [];
function remember(before) { undoS.push(before !== undefined ? before : snapJSON()); if (undoS.length > 100) undoS.shift(); redoS.length = 0; document.dispatchEvent(new Event('sma-edit')); }
function adopt(json) { const o = JSON.parse(json); doc.pageW = o.pageW; doc.pageH = o.pageH; doc.rtl = o.rtl; doc.pages = o.pages; pg = Math.min(pg, doc.pages.length - 1); sel = null; refreshAll(); }
function undo() { const s = undoS.pop(); if (s === undefined) return; redoS.push(snapJSON()); adopt(s); document.dispatchEvent(new Event('sma-edit')); }
function redo() { const s = redoS.pop(); if (s === undefined) return; undoS.push(snapJSON()); adopt(s); document.dispatchEvent(new Event('sma-edit')); }
$('#mg-undo').onclick = undo; $('#mg-redo').onclick = redo;
const edit = fn => { const before = snapJSON(); fn(); remember(before); refreshAll(); };

// ---------- tools ----------
const TOOLS = [['select', '☝ Select'], ['split', '✂ Split panel'], ['bubble', '💬 Bubble'], ['caption', '▭ Caption'], ['sfx', '💥 Sound effect'], ['tone', '▦ Tone'], ['speed', '✦ Speed lines'], ['pen', '✎ Pen'], ['eraser', '⌫ Erase ink']];
TOOLS.forEach(([id, t]) => { const b = el('button', { type: 'button' }, t); b.dataset.t = id; b.onclick = () => setTool(id); $('#mg-tools').append(b); });
const picBtn = el('button', { type: 'button', title: 'Put a picture in the selected panel, or add a loose picture' }, '🖼 Picture…'); picBtn.onclick = () => $('#mg-file').click(); $('#mg-tools').append(picBtn);
function setTool(t) { tool = t; document.querySelectorAll('#mg-tools button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $('#mg-penopts').hidden = t !== 'pen'; cv.style.cursor = t === 'select' ? 'default' : 'crosshair'; status.textContent = { split: 'Drag a line across a panel to cut it in two (slanted lines make slanted panels).', tone: 'Drag a rectangle to lay a screentone (inside a panel it stays inside).', speed: 'Drag a rectangle for speed lines.', pen: 'Draw ink.', eraser: 'Drag over ink strokes to erase them.', bubble: 'Click where the bubble should go.', caption: 'Click where the caption box should go.', sfx: 'Click where the sound effect should go.', select: '' }[t] || ''; }
const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom]; };
let drag = null;
const board = $('#mg-stage');
cv.addEventListener('pointerdown', e => {
  if (e.button > 0) return; try { cv.setPointerCapture(e.pointerId); } catch (err) {} const [x, y] = pt(e), before = snapJSON(); drag = { before, x0: x, y0: y, dirty: false };
  if (tool === 'select') {
    if (sel && page().objs.includes(sel)) { const hs = 12 / zoom, h = handlesOf(sel).find(h => Math.abs(h.x - x) < hs && Math.abs(h.y - y) < hs); if (h) { drag.handle = h; return; } }
    const o = topAt(x, y); sel = o; drag.move = o ? { px: x, py: y } : null; showProps(); render(); return;
  }
  if (['bubble', 'caption', 'sfx'].includes(tool)) { const o = tool === 'sfx' ? mkSfx(x, y) : tool === 'caption' ? { ...mkBubble(x - 150, y - 45, 'box') } : mkBubble(x - 140, y - 95, 'oval'); page().objs.push(o); sel = o; remember(before); setTool('select'); refreshAll(); drag = null; return; }
  if (tool === 'pen') { const o = { t: 'ink', id: newId(), pts: [x, y], size: +$('#mg-pensize').value, color: $('#mg-pencolor').value }; page().objs.push(o); drag.ink = o; return; }
  if (tool === 'eraser') { eraseAt(x, y); return; }
});
cv.addEventListener('pointermove', e => {
  const [x, y] = pt(e); if (!drag) { status.textContent = tool === 'select' || !status.textContent ? `${Math.round(x)}, ${Math.round(y)}` : status.textContent; return; }
  if (drag.handle) { moveHandle(sel, drag.handle, x, y); drag.dirty = true; render(); return; }
  if (drag.move && sel) { const dx = x - drag.move.px, dy = y - drag.move.py; translate(sel, dx, dy); drag.move.px = x; drag.move.py = y; drag.dirty = true; render(); return; }
  if (tool === 'split') { preview = { line: [[drag.x0, drag.y0], [x, y]] }; render(); }
  else if (tool === 'tone' || tool === 'speed') { preview = { rect: [Math.min(drag.x0, x), Math.min(drag.y0, y), Math.abs(x - drag.x0), Math.abs(y - drag.y0)] }; render(); }
  else if (tool === 'pen' && drag.ink) { const p = drag.ink.pts; if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) > 1.5 / zoom) { p.push(x, y); drag.dirty = true; render(); } }
  else if (tool === 'eraser') eraseAt(x, y);
});
function finish(e) {
  if (!drag) return; const d = drag; drag = null; const [x, y] = e && e.clientX !== undefined ? pt(e) : [d.x0, d.y0]; let changed = d.dirty;
  if (tool === 'split') { preview = null; const p0 = [d.x0, d.y0], p1 = [x, y]; if (dist(p0, p1) > 20) { const target = panelAt((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2) || panelAt(p0[0], p0[1]); if (target) { const parts = cutQuad(target.pts, p0, p1, 26); if (parts) { const i = page().objs.indexOf(target); const a = { ...target, pts: parts[0].map(p => p.map(Math.round)) }, b = { ...target, id: newId(), pts: parts[1].map(p => p.map(Math.round)) }; page().objs.splice(i, 1, a, b); sel = a; changed = true; } } } }
  if (tool === 'tone' || tool === 'speed') { preview = null; const w = Math.abs(x - d.x0), h = Math.abs(y - d.y0); if (w > 20 && h > 20) { const p = panelAt(d.x0 + (x - d.x0) / 2, d.y0 + (y - d.y0) / 2), o = (tool === 'tone' ? mkTone : mkSpeed)(Math.min(x, d.x0), Math.min(y, d.y0), w, h, p && p.id); page().objs.push(o); sel = o; changed = true; setTool('select'); } }
  if (tool === 'pen' && d.ink) changed = true;
  if (changed) remember(d.before); refreshAll();
}
cv.addEventListener('pointerup', finish); cv.addEventListener('pointercancel', () => finish());
function eraseAt(x, y) { const objs = page().objs, n = objs.length; page().objs = objs.filter(o => !(o.t === 'ink' && inkDist(o, x, y) < 14 / zoom + o.size / 2)); if (page().objs.length !== n) { drag.dirty = true; render(); } }
function translate(o, dx, dy) { if (o.t === 'panel') o.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]); else if (o.t === 'ink') o.pts = o.pts.map((v, i) => v + (i % 2 ? dy : dx)); else { o.x += dx; o.y += dy; if (o.tail) o.tail = [o.tail[0] + dx, o.tail[1] + dy]; } }
function moveHandle(o, h, x, y) {
  if (h.k === 'pt') { o.pts[h.i] = [x, y]; return; } if (h.k === 'tail') { o.tail = [x, y]; return; }
  if (o.t === 'bubble') { let { x: ox, y: oy, w, h: hh } = o; const r = ox + w, b = oy + hh; if (h.k === 'tl') { ox = Math.min(x, r - 40); oy = Math.min(y, b - 30); } if (h.k === 'tr') { oy = Math.min(y, b - 30); w = Math.max(40, x - ox); } if (h.k === 'br') { w = Math.max(40, x - ox); hh = Math.max(30, y - oy); } if (h.k === 'bl') { ox = Math.min(x, r - 40); hh = Math.max(30, y - oy); } o.x = ox; o.y = oy; o.w = h.k === 'tl' || h.k === 'bl' ? r - ox : w; o.h = h.k === 'tl' || h.k === 'tr' ? b - oy : hh; return; }
  o.w = Math.max(20, x - o.x); o.h = Math.max(20, y - o.y);
}
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('manga-mode') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); edit(() => { page().objs = page().objs.filter(o => o !== sel); sel = null; }); }
});
$('#mg-zin').onclick = () => { zoom = Math.min(2, zoom * 1.25); render(); }; $('#mg-zout').onclick = () => { zoom = Math.max(0.1, zoom / 1.25); render(); };
function fit() { const st = $('#mg-stage').getBoundingClientRect(); if (st.width) { zoom = Math.max(0.1, Math.min(1.5, (st.height - 40) / doc.pageH, (st.width - 40) / doc.pageW)); } render(); }
$('#mg-fit').onclick = fit;
$('#mg-stage').addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoom = Math.max(0.1, Math.min(2, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); render(); }, { passive: false });

// ---------- pictures ----------
function readImageFile(file) {
  return new Promise((res, rej) => { if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return rej(new Error('That is not a picture this app can use.')); if (file.size > 25e6) return rej(new Error('That picture is too big (over 25 MB).'));
    const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight)); if (k === 1 && file.size < 3e6) return res(r.result); const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9)); }; im.onerror = () => rej(new Error('That picture could not be read.')); im.src = r.result; }; r.onerror = () => rej(new Error('That picture could not be read.')); r.readAsDataURL(file); });
}
function addImage(src) { const id = newId(); doc.images[id] = src; return id; }
$('#mg-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const src = await readImageFile(f), id = addImage(src); edit(() => { if (sel && sel.t === 'panel') { sel.img = id; sel.scale = 1; sel.ox = 0; sel.oy = 0; } else { const im = new Image(); const o = { t: 'image', id: newId(), x: 100, y: 100, w: 400, h: 400, img: id }; page().objs.push(o); sel = o; } }); status.textContent = 'Picture added.'; } catch (err) { status.textContent = String(err.message); } };
cv.addEventListener('dragover', e => { e.preventDefault(); });
cv.addEventListener('drop', async e => { e.preventDefault(); const mid = e.dataTransfer.getData('text/sma-model'); if (mid && doc.models[mid]) { const [px, py] = pt(e); placeModel(mid, px, py); return; } const f = e.dataTransfer.files[0]; if (!f) return; const [x, y] = pt(e); try { const id = addImage(await readImageFile(f)); const p = panelAt(x, y); edit(() => { if (p) { p.img = id; p.scale = 1; p.ox = 0; p.oy = 0; sel = p; } else { const o = { t: 'image', id: newId(), x: x - 200, y: y - 200, w: 400, h: 400, img: id }; page().objs.push(o); sel = o; } }); } catch (err) { status.textContent = String(err.message); } });

// ---------- the side panel for what is selected ----------
function field(label, ctl) { const l = el('label', {}, label); l.append(ctl); return l; }
function sliderField(label, o, key, lo, hi, step = 1, fmt = v => v) { const out = el('output', {}, String(fmt(o[key]))), r = el('input', { type: 'range', min: lo, max: hi, step, value: o[key] }); r.onpointerdown = () => { r._b = snapJSON(); }; r.oninput = () => { o[key] = +r.value; out.textContent = fmt(+r.value); render(); }; r.onchange = () => { remember(r._b); }; const l = el('label', {}, label + ' '); l.append(r, out); return l; }
function selectField(label, o, key, opts, onchange) { const s = el('select'); opts.forEach(([v, t]) => s.append(el('option', { value: v }, t))); s.value = o[key]; s.onchange = () => edit(() => { o[key] = s.value; onchange && onchange(); }); return field(label, s); }
function colorField(label, o, key) { const c = el('input', { type: 'color', value: o[key] }); c.onpointerdown = () => { c._b = snapJSON(); }; c.oninput = () => { o[key] = c.value; render(); }; c.onchange = () => remember(c._b); return field(label, c); }
function checkField(label, o, key, onchange) { const c = el('input', { type: 'checkbox', checked: !!o[key] }); c.onchange = () => edit(() => { o[key] = c.checked; onchange && onchange(); }); const l = el('label', { className: 'cv-chk' }); l.style.flexDirection = 'row'; l.append(c, ' ' + label); return l; }
function showProps() {
  const box = $('#mg-props'); box.textContent = ''; const o = sel; if (!o || !page().objs.includes(o)) { box.className = 'hint'; box.textContent = 'Click something on the page with the Select tool. Draw panels with the layouts or the Split tool, then add speech bubbles, tones and sound effects.'; return; } box.className = '';
  const NAMES = { char: 'Character (3D)', panel: 'Panel', bubble: 'Speech bubble', sfx: 'Sound effect', tone: 'Screentone', speed: 'Speed lines', image: 'Picture', ink: 'Ink stroke' }; box.append(el('b', {}, NAMES[o.t]));
  if (o.t === 'panel') {
    box.append(sliderField('Border width', o, 'bw', 0, 20), colorField('Border colour', o, 'bc'), colorField('Fill colour', o, 'bg'));
    const row = el('div', { className: 'px-row' }), set = el('button', { type: 'button' }, o.img ? 'Change picture…' : 'Set picture…'); set.onclick = () => $('#mg-file').click(); row.append(set); if (o.img) { const rm = el('button', { type: 'button' }, 'Remove picture'); rm.onclick = () => edit(() => { o.img = null; }); row.append(rm); } box.append(row);
    if (o.img) box.append(sliderField('Picture size', o, 'scale', 0.3, 4, 0.05, v => Math.round(v * 100) + '%'), sliderField('Picture left–right', o, 'ox', -100, 100), sliderField('Picture up–down', o, 'oy', -100, 100));
  } else if (o.t === 'bubble') {
    const ta = el('textarea', { maxLength: 600, value: o.text }); ta.oninput = () => { o.text = ta.value; render(); }; ta.onfocus = () => { ta._b = snapJSON(); }; ta.onchange = () => remember(ta._b); box.append(field('What it says', ta));
    box.append(selectField('Shape', o, 'shape', [['oval', 'Speech (oval)'], ['round', 'Rounded box'], ['cloud', 'Thought (cloud)'], ['shout', 'Shout (spiky)'], ['box', 'Caption box'], ['none', 'Text only']], () => { if (o.shape === 'box' || o.shape === 'none') o.tail = null; else if (!o.tail) o.tail = [o.x + o.w * 0.3, o.y + o.h + 80]; }));
    box.append(selectField('Font', o, 'font', FONTS.map(f => [f, f])), sliderField('Text size', o, 'size', 12, 90), checkField('Bold', o, 'bold'), colorField('Fill', o, 'fill'), colorField('Outline', o, 'stroke'), sliderField('Outline width', o, 'sw', 0, 14));
    if (o.shape !== 'box' && o.shape !== 'none') box.append(checkField('Has a tail', { get tail() { return !!o.tail; }, set tail(v) { o.tail = v ? [o.x + o.w * 0.3, o.y + o.h + 80] : null; } }, 'tail'));
  } else if (o.t === 'sfx') {
    const ti = el('input', { type: 'text', maxLength: 40, value: o.text }); ti.oninput = () => { o.text = ti.value; o._bb = null; render(); }; ti.onfocus = () => { ti._b = snapJSON(); }; ti.onchange = () => remember(ti._b); box.append(field('Text', ti), selectField('Font', o, 'font', FONTS.map(f => [f, f])), sliderField('Size', o, 'size', 20, 400), sliderField('Tilt', o, 'rot', -90, 90), colorField('Colour', o, 'fill'), colorField('Outline', o, 'stroke'), sliderField('Outline width', o, 'sw', 0, 40));
  } else if (o.t === 'tone') {
    box.append(selectField('Kind', o, 'kind', [['dots', 'Dots'], ['gradient', 'Dots fading out'], ['lines', 'Lines'], ['hatch', 'Cross-hatch']]), sliderField('Darkness', o, 'level', 5, 95, 1, v => v + '%'), sliderField('Angle', o, 'angle', 0, 90), sliderField('Dot / line spacing', o, 'size', 4, 30), selectField('Shape', o, 'shape', [['rect', 'Rectangle'], ['ellipse', 'Oval']]));
    box.append(checkField('Stay inside its panel', { get clip() { return !!o.clip; }, set clip(v) { const p = panelAt(o.x + o.w / 2, o.y + o.h / 2); o.clip = v && p ? p.id : ''; } }, 'clip'));
  } else if (o.t === 'speed') {
    box.append(selectField('Kind', o, 'kind', [['focus', 'Focus (around a point)'], ['parallel', 'Parallel (motion)']]), sliderField('Number of lines', o, 'lines', 10, 300), sliderField('Thickness', o, 'thick', 1, 20));
    if (o.kind === 'focus') box.append(sliderField('Empty centre', o, 'inner', 0, 90, 1, v => v + '%')); else box.append(sliderField('Direction', o, 'angle', 0, 180));
    box.append(checkField('Stay inside its panel', { get clip() { return !!o.clip; }, set clip(v) { const p = panelAt(o.x + o.w / 2, o.y + o.h / 2); o.clip = v && p ? p.id : ''; } }, 'clip'));
  } else if (o.t === 'char') {
    const mm = doc.models[o.model]; box.append(el('div', { className: 'hint' }, mm ? mm.name : 'Missing character'));
    const pb = el('button', { type: 'button', className: 'pri' }, 'Pose and look…'); pb.onclick = () => openStudio({ modelId: o.model, obj: o }); box.append(pb);
    box.append(sliderField('Turn around', o, 'yaw', -180, 180), sliderField('Look from above / below', o, 'pitch', -60, 60), sliderField('Zoom', o, 'zoom', 0.4, 4, 0.05), selectField('Drawing style', o, 'style', [['ink', 'Ink and tones'], ['gray', 'Grey'], ['color', 'Colour']]), sliderField('Outline', o, 'outline', 0, 2.5, 0.05), checkField('Mirror left / right', o, 'flip'));
    box.append(checkField('Stay inside its panel', { get clip() { return !!o.clip; }, set clip(v) { const p = panelAt(o.x + o.w / 2, o.y + o.h / 2); o.clip = v && p ? p.id : ''; } }, 'clip'));
  } else if (o.t === 'ink') { box.append(sliderField('Thickness', o, 'size', 1, 40), colorField('Colour', o, 'color')); }
  const row = el('div', { className: 'px-row' }); const mk = (t, f, title) => { const b = el('button', { type: 'button', title }, t); b.onclick = f; row.append(b); };
  mk('Bring to front', () => edit(() => { const a = page().objs; a.push(a.splice(a.indexOf(o), 1)[0]); })); mk('Send to back', () => edit(() => { const a = page().objs; a.unshift(a.splice(a.indexOf(o), 1)[0]); }));
  mk('Duplicate', () => edit(() => { const c = JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v))); c.id = newId(); translate(c, 30, 30); if (c.clip) c.clip = o.clip; page().objs.push(c); sel = c; })); mk('Delete', () => edit(() => { page().objs = page().objs.filter(q => q !== o); sel = null; })); box.append(row);
}

// ---------- 3D characters: made here or imported as VRM; always still, drawn with ink outlines ----------
const S3 = window.SMA3D, CH = window.SMA_char;
const cacheOf = d => d._mc || (d._mc = new Map()), bmCache = new Map();
function modelEntry(id, d = doc, expr) {
  const m = d.models && d.models[id]; if (!m || !S3 || !CH) return null; const mc = cacheOf(d), prm = m.kind === 'maker' ? (expr ? Object.assign({}, m.params, { expr }) : m.params) : null, sig = m.kind === 'maker' ? JSON.stringify(prm) : 'vrm', key = prm ? id + '|' + prm.expr : id; let e = mc.get(key); if (e && e.sig === sig) return e;
  if (e && e.model) S3.disposeModel(e.model); e = { sig, state: 'loading', model: null, rev: (e ? e.rev + 1 : 1), err: '' }; mc.set(key, e);
  if (m.kind === 'maker') { try { e.model = CH.buildCharacter(prm); e.state = 'ready'; } catch (err) { e.state = 'error'; e.err = err.message; } }
  else { try { const bin = atob(m.data), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); e.promise = S3.loadVRM(u.buffer).then(mod => { e.model = mod; e.state = 'ready'; }).catch(err => { e.state = 'error'; e.err = String(err.message || err); }).then(() => { render(); renderLibrary(); }); } catch (err) { e.state = 'error'; e.err = 'This model could not be read.'; } }
  return e;
}
function charBitmap(o) {
  const e = modelEntry(o.model, doc, o.expr); if (!e || e.state !== 'ready') return null; const w = Math.max(8, Math.round(o.w)), h = Math.max(8, Math.round(o.h)), key = [o.model, o.expr, e.rev, JSON.stringify(o.pose), o.yaw, o.pitch, o.zoom, o.fov, o.ox, o.oy, o.style, o.outline, w, h].join('|'); let c = bmCache.get(key);
  if (!c) { try { c = S3.render(e.model, { pose: o.pose, yaw: o.yaw, pitch: o.pitch, zoom: o.zoom, fov: o.fov, ox: o.ox, oy: o.oy, style: o.style, outline: o.outline }, w, h); } catch (err) { e.state = 'error'; e.err = err.message; return null; } bmCache.set(key, c); if (bmCache.size > 60) bmCache.delete(bmCache.keys().next().value); } return c;
}
function drawChar(c, o, pageObj) {
  c.save(); const p = o.clip && pageObj.objs.find(q => q.id === o.clip && q.t === 'panel'); if (p) { quadPath(c, p.pts); c.clip(); } const bm = charBitmap(o);
  if (bm) { if (o.flip) { c.translate(o.x + o.w, o.y); c.scale(-1, 1); c.drawImage(bm, 0, 0, o.w, o.h); } else c.drawImage(bm, o.x, o.y, o.w, o.h); }
  else { const e = modelEntry(o.model); c.fillStyle = 'rgba(130,130,170,.22)'; c.fillRect(o.x, o.y, o.w, o.h); c.fillStyle = '#556'; c.font = '28px sans-serif'; c.textAlign = 'center'; c.fillText(!e ? 'Missing character' : e.state === 'error' ? 'Cannot draw: ' + e.err : 'Loading…', o.x + o.w / 2, o.y + o.h / 2); }
  c.restore();
}
const mkChar = (model, x, y, clip) => ({ t: 'char', id: newId(), model, x, y, w: 300, h: 450, expr: (doc.models[model] && doc.models[model].params && doc.models[model].params.expr) || 'smile', pose: CH.PRESETS['Stand (relaxed)'](), yaw: 0, pitch: 0, zoom: 1, fov: 22, ox: 0, oy: 0, style: 'ink', outline: 1, flip: false, clip: clip || '' });
const dropModel = id => { const mc = cacheOf(doc); for (const [k, en] of [...mc]) if (k === id || k.startsWith(id + '|')) { if (en.model) S3.disposeModel(en.model); mc.delete(k); } };
const newModelId = () => 'm' + Math.random().toString(36).slice(2, 8);
function placeModel(id, x, y) { const p = x === undefined ? null : panelAt(x, y), o = mkChar(id, x === undefined ? 100 : x - 150, y === undefined ? 100 : y - 225, p && p.id); edit(() => { page().objs.push(o); sel = o; }); setTool('select'); }

// the library of characters in this manga
function renderLibrary() {
  const box = $('#mg-lib'); if (!box) return; box.textContent = ''; const row = el('div', { className: 'px-row' }), nb = el('button', { type: 'button' }, '+ New character…'), ib = el('button', { type: 'button', title: 'Use a VRM model (made in VRoid Studio or downloaded)' }, 'Import VRM…'); nb.onclick = () => newCharacter(); ib.onclick = () => $('#mg-vrmfile').click(); row.append(nb, ib); box.append(row);
  const ids = Object.keys(doc.models); if (!ids.length) box.append(el('div', { className: 'hint' }, 'Make a character, or import a VRM model, then drag it onto a panel. Characters are still figures you can pose and turn.'));
  for (const id of ids) { const m = doc.models[id], e = modelEntry(id), r = el('div', { className: 'mgl' }), c = el('canvas'); c.width = 92; c.height = 124; c.draggable = true; c.title = 'Drag onto a panel'; c.ondragstart = ev => { ev.dataTransfer.setData('text/sma-model', id); ev.dataTransfer.effectAllowed = 'copy'; };
    const g = c.getContext('2d'); if (e && e.state === 'ready') { try { g.drawImage(thumbOf(id, e), 0, 0); } catch (err) {} } else { g.fillStyle = '#ddd'; g.fillRect(0, 0, 92, 124); g.fillStyle = '#556'; g.font = '11px sans-serif'; g.fillText(e && e.state === 'error' ? 'error' : '…', 30, 64); }
    const nm = el('div', { className: 'nm' }, m.name || 'Character'); if (m.kind === 'vrm' && m.meta) nm.append(el('small', {}, [m.meta.author, m.meta.licenseName].filter(Boolean).join(' · ') || 'VRM model')); else nm.append(el('small', {}, m.params.gender === 'male' ? 'Made here (male)' : 'Made here (female)'));
    const add = el('button', { type: 'button', title: 'Put this character on the page' }, 'Add'), edit2 = el('button', { type: 'button', title: m.kind === 'maker' ? 'Change how the character looks' : 'See the model' }, m.kind === 'maker' ? 'Edit' : 'View'), del = el('button', { type: 'button', title: 'Remove from this manga' }, '✕');
    add.onclick = () => placeModel(id); edit2.onclick = () => openStudio({ modelId: id }); del.onclick = () => { if (!Object.values(doc.pages).some(p => p.objs.some(o => o.model === id)) || confirm('This character is used on a page. Remove it and everything that uses it?')) edit(() => { doc.pages.forEach(p => { p.objs = p.objs.filter(o => o.model !== id); }); dropModel(id); delete doc.models[id]; sel = null; }); };
    r.append(c, nm, el('div', { className: 'px-row' }, ''), add, edit2, del); r.lastChild.remove(); box.append(r); }
}
const thumbs = new Map(); function thumbOf(id, e) { const k = id + '|' + e.rev; if (!thumbs.has(k)) thumbs.set(k, S3.render(e.model, { pose: CH.PRESETS['Stand (relaxed)'](), yaw: 0, pitch: 0, zoom: 1, fov: 22, style: 'color', outline: 1 }, 92, 124)); return thumbs.get(k); }
$('#mg-vrmfile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; try {
    if (f.size > 90e6) throw new Error('That model file is too big (over 90 MB).'); const buf = await f.arrayBuffer(), model = await S3.loadVRM(buf), meta = model.meta || {}; S3.disposeModel(model);
    const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); const id = newModelId();
    doc.models[id] = { kind: 'vrm', name: String(meta.title || meta.name || f.name.replace(/\.(vrm|glb)$/i, '')).slice(0, 60), data: btoa(s), meta: { title: str(meta.title || meta.name, 80), author: str(meta.author, 80), licenseName: str(meta.licenseName || meta.license, 80), otherLicenseUrl: str(meta.otherLicenseUrl || meta.licenseUrl, 300) } };
    document.dispatchEvent(new Event('sma-edit')); renderLibrary(); const mt = doc.models[id].meta; status.textContent = `Imported "${doc.models[id].name}"${mt.author ? ' by ' + mt.author : ''}. Models carry their own licence${mt.licenseName ? ' (' + mt.licenseName + ')' : ''}: check the terms before you publish pages that use it.`;
  } catch (err) { status.textContent = String(err.message || err); }
};
function newCharacter() { const id = newModelId(); doc.models[id] = { kind: 'maker', name: 'Character ' + (Object.keys(doc.models).length + 1), params: CH.cleanParams({}) }; openStudio({ modelId: id, isNew: true }); }

// ----- the character and pose studio (a window with a 3D view) -----
const studio = { open: false };
const BONE_LABEL = b => b.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function openStudio({ modelId, obj }) {
  const m = doc.models[modelId], e = modelEntry(modelId); if (!m) return; const isNew = arguments[0].isNew;
  Object.assign(studio, { open: true, modelId, obj: obj || null, isNew, params: m.kind === 'maker' ? JSON.parse(JSON.stringify(m.params)) : null, st: obj ? { pose: JSON.parse(JSON.stringify(obj.pose)), yaw: obj.yaw, pitch: obj.pitch, zoom: obj.zoom, fov: obj.fov, ox: obj.ox, oy: obj.oy, style: obj.style, outline: obj.outline, expr: obj.expr || 'smile' } : { pose: CH.PRESETS['Stand (relaxed)'](), yaw: 0, pitch: 0, zoom: 1, fov: 22, ox: 0, oy: 0, style: 'color', outline: 1, expr: 'smile' }, bone: 'head', tab: m.kind === 'maker' && isNew ? 'char' : 'pose', model: e && e.model });
  $('#mg3-t-char').hidden = $('#mg3-t-face').hidden = m.kind !== 'maker'; $('#mg-3d').showModal(); studioTab(studio.tab); studioRender();
}
function studioModel() { if (studio.params) { const pp = Object.assign({}, studio.params, { expr: studio.st.expr }), sg = JSON.stringify(pp); if (!studio.pm || studio.pmSig !== sg) { if (studio.pm) S3.disposeModel(studio.pm); studio.pm = CH.buildCharacter(pp); studio.pmSig = sg; } return studio.pm; } const e = modelEntry(studio.modelId); return e && e.state === 'ready' ? e.model : null; }
let studioTimer = 0, studioBusy = false;
function studioRender() { if (studioBusy) { clearTimeout(studioTimer); studioTimer = setTimeout(studioRender, 60); return; } studioBusy = true; requestAnimationFrame(() => { try { const m = studioModel(), cv3 = $('#mg3-cv'), x = cv3.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv3.width, cv3.height); if (m) x.drawImage(S3.render(m, studio.st, cv3.width, cv3.height), 0, 0); else { x.fillStyle = '#667'; x.font = '18px sans-serif'; x.textAlign = 'center'; const e = modelEntry(studio.modelId); x.fillText(e && e.state === 'error' ? 'Cannot draw this model: ' + e.err : 'Loading the model…', cv3.width / 2, cv3.height / 2); if (e && e.promise) e.promise.then(() => studioRender()); } } catch (err) { $('#mg3-hint').textContent = 'Could not draw: ' + err.message; } studioBusy = false; }); }
function studioTab(t) { studio.tab = t; for (const k of ['char', 'face', 'pose', 'look']) $('#mg3-t-' + k).classList.toggle('on', k === t); const b = $('#mg3-body'); b.textContent = ''; ({ char: studioChar, face: studioFace, pose: studioPose, look: studioLook })[t](b); }
$('#mg3-t-char').onclick = () => studioTab('char'); $('#mg3-t-face').onclick = () => studioTab('face'); $('#mg3-t-pose').onclick = () => studioTab('pose'); $('#mg3-t-look').onclick = () => studioTab('look');
function sl(box, label, get, set, lo, hi, step = 1) { const out = el('output', {}, String(+get().toFixed(2))), r = el('input', { type: 'range', min: lo, max: hi, step, value: get() }); r.oninput = () => { set(+r.value); out.textContent = String(+(+r.value).toFixed(2)); studioRender(); }; const l = el('label', {}, label + ' '); l.append(r, out); box.append(l); return r; }
function sel3(box, label, get, set, opts) { const s = el('select'); opts.forEach(([v, t]) => s.append(el('option', { value: v }, t))); s.value = get(); s.onchange = () => { set(s.value); studioRender(); }; const l = el('label', {}, label); l.append(s); box.append(l); }
function colr(box, label, key) { const c = el('input', { type: 'color', value: studio.params[key] }); c.oninput = () => { studio.params[key] = c.value; studioRender(); }; const l = el('label', {}, label); l.append(c); box.append(l); }
// ----- thumbnail pickers: every choice shows what it will look like -----
const tcache = new Map(), tq = []; let tqBusy = false;
function thumbJob(cnv, key, make) { const hit = tcache.get(key); if (hit) { cnv.getContext('2d').drawImage(hit, 0, 0); return; } tq.push({ cnv, key, make }); if (tqBusy) return; tqBusy = true; const run = () => { const j = tq.shift(); if (!j) { tqBusy = false; return; } try { if (j.cnv.isConnected) { let src = tcache.get(j.key); if (!src) { src = j.make(); const copy = document.createElement('canvas'); copy.width = src.width; copy.height = src.height; copy.getContext('2d').drawImage(src, 0, 0); tcache.set(j.key, copy); if (tcache.size > 400) tcache.delete(tcache.keys().next().value); src = copy; } j.cnv.getContext('2d').drawImage(src, 0, 0); } } catch (err) {} setTimeout(run, 0); }; setTimeout(run, 0); }
function tiles(box, label, opts, get, set, mkThumb, size = [64, 64]) {
  box.append(el('div', { className: 'tilelab' }, label)); const g = el('div', { className: 'tiles' });
  for (const [v, t, key] of opts) { const b = el('button', { type: 'button', className: 'tile' + (String(get()) === String(v) ? ' on' : ''), title: t }), c = el('canvas'); c.width = size[0]; c.height = size[1]; b.append(c, t); b.onclick = () => { set(v); g.querySelectorAll('.tile').forEach(x => x.classList.remove('on')); b.classList.add('on'); studioRender(); if (g.dataset.reload) studioTab(studio.tab); }; g.append(b); if (mkThumb) thumbJob(c, key, () => mkThumb(v)); }
  box.append(g); return g;
}
const HEADVIEW = { pose: {}, yaw: 0, pitch: 0, zoom: 3.3, oy: 0.42, fov: 16, style: 'color', outline: 1 };
function headThumb(variant) { const P = Object.assign({}, studio.params, variant), m = CH.buildCharacter(P, { faceSize: 512 }); try { return S3.render(m, Object.assign({}, HEADVIEW, { zoom: variant.hairStyle ? 2.4 : 3.3, oy: variant.hairStyle ? 0.36 : 0.42 }), 72, 72); } finally { S3.disposeModel(m); } }
function bodyThumb(variant) { const P = Object.assign({}, studio.params, variant), m = CH.buildCharacter(P, { faceSize: 512 }); try { return S3.render(m, { pose: CH.PRESETS['Stand (relaxed)'](), yaw: 0, pitch: 0, zoom: 1.05, fov: 22, style: 'color', outline: 1 }, 60, 96); } finally { S3.disposeModel(m); } }
const pk = () => JSON.stringify(studio.params);
function studioChar(b) {
  const P = studio.params, set = k => v => { P[k] = v; };
  tiles(b, 'Body', [['female', 'Female', 'g|f|' + pk()], ['male', 'Male', 'g|m|' + pk()]], () => P.gender, v => { P.gender = v; studioTab('char'); }, v => bodyThumb({ gender: v }), [60, 96]);
  b.append(el('h5', {}, 'Shape'));
  [['Height', 'height'], ['Build (slim to sturdy)', 'build'], ['Shoulder width', 'shoulders'], ['Hip width', 'hips'], ['Head size (chibi at the top)', 'head'], ['Leg length', 'legs']].forEach(([t, k]) => sl(b, t, () => P[k], set(k), 0, 1, 0.01)); if (P.gender === 'female') sl(b, 'Bust', () => P.bust, set('bust'), 0, 1, 0.01);
  b.append(el('h5', {}, 'Hair')); tiles(b, 'Style', CH.HAIR.map(h => [h, h[0].toUpperCase() + h.slice(1), 'h|' + h + '|' + JSON.stringify([P.gender, P.hair, P.skin, P.head])]), () => P.hairStyle, set('hairStyle'), v => headThumb({ hairStyle: v })); colr(b, 'Hair colour', 'hair');
  b.append(el('h5', {}, 'Eyes')); tiles(b, 'Shape', [['0', 'Big round'], ['1', 'Sharp'], ['2', 'Sleepy'], ['3', 'Dots']].map(([v, t]) => [v, t, 'e|' + v + '|' + JSON.stringify([P.gender, P.hair, P.hairStyle, P.skin, P.eyes])]), () => String(P.eyeStyle), v => { P.eyeStyle = +v; }, v => headThumb({ eyeStyle: +v })); colr(b, 'Eye colour', 'eyes'); colr(b, 'Skin', 'skin');
  b.append(el('h5', {}, 'Clothes')); tiles(b, 'Outfit', [['uniform', 'School'], ['blazer', 'Blazer'], ['casual', 'T-shirt'], ['dress', 'Dress'], ['sport', 'Sports']].map(([v, t]) => [v, t, 'o|' + v + '|' + JSON.stringify([P.gender, P.top, P.bottom, P.accent, P.skin, P.hairStyle, P.hair, P.height, P.build])]), () => P.outfit, set('outfit'), v => bodyThumb({ outfit: v }), [60, 96]);
  colr(b, 'Top', 'top'); colr(b, 'Skirt / trousers', 'bottom'); colr(b, 'Shoes', 'shoes'); colr(b, 'Accent (ribbons, tie, trim)', 'accent');
  b.append(el('h5', {}, 'Extras')); tiles(b, 'Accessory', CH.ACC.map(a => [a, a[0].toUpperCase() + a.slice(1), 'a|' + a + '|' + JSON.stringify([P.gender, P.hair, P.hairStyle, P.skin, P.accent])]), () => P.accessory, set('accessory'), v => headThumb({ accessory: v, hairStyle: P.hairStyle }));
  const rnd = el('button', { type: 'button' }, 'Surprise me'); rnd.onclick = () => { const q = a => a[Math.floor(Math.random() * a.length)], rc = () => '#' + [0, 0, 0].map(() => Math.floor(40 + Math.random() * 200).toString(16).padStart(2, '0')).join(''); Object.assign(P, { gender: q(['female', 'male']), height: Math.random(), build: Math.random(), shoulders: Math.random(), hips: Math.random(), bust: Math.random(), head: 0.3 + Math.random() * 0.5, legs: Math.random(), hairStyle: q(CH.HAIR.filter(h => h !== 'none')), hair: q(['#2a1f2d', '#6a3a1a', '#e0709a', '#d0902a', '#222222', '#c0c0d8', '#3a2a7a']), eyes: rc(), eyeStyle: Math.floor(Math.random() * 4), outfit: q(CH.OUTFIT), top: rc(), bottom: rc(), accent: rc(), accessory: q(CH.ACC) }); studioTab('char'); studioRender(); }; b.append(rnd);
}
const EXPR_NAMES = { smile: 'Smile', neutral: 'Calm', laugh: 'Laugh', surprise: 'Surprised', angry: 'Angry', sad: 'Sad', shy: 'Shy', wink: 'Wink', smirk: 'Smirk' };
function studioFace(b) {
  const P = studio.params, st = studio.st; b.append(el('div', { className: 'hint' }, 'The expression is chosen for each character you place, so the same character can smile in one panel and glare in the next.'));
  tiles(b, 'Expression', CH.EXPR.map(x => [x, EXPR_NAMES[x], 'x|' + x + '|' + JSON.stringify([P.gender, P.hair, P.hairStyle, P.skin, P.eyes, P.eyeStyle])]), () => st.expr, v => { st.expr = v; }, v => headThumb({ expr: v }));
}
const POSE_NAMES = Object.keys(CH.PRESETS);
function studioPose(b) {
  const m = studioModel() || {}, human = m.human || {}, bones = S3.HUMAN_BONES.filter(x => human[x] !== undefined), st = studio.st, sig = studio.pmSig || studio.modelId;
  if (m.nodes) tiles(b, 'Ready-made poses', POSE_NAMES.map(k => [k, k, 'p|' + k + '|' + sig]), () => '', v => { const p = CH.PRESETS[v](); st.pose = {}; for (const k of Object.keys(p)) if (human[k] !== undefined) st.pose[k] = p[k]; setTimeout(() => studioTab('pose'), 0); }, v => { const p = CH.PRESETS[v](), pose = {}; for (const k of Object.keys(p)) if (human[k] !== undefined) pose[k] = p[k]; return S3.render(m, { pose, yaw: 0, pitch: 0, zoom: 1.05, fov: 22, style: 'color', outline: 1 }, 60, 96); }, [60, 96]);
  b.append(el('h5', {}, 'Move one part'));
  if (!bones.includes(studio.bone)) studio.bone = bones.includes('head') ? 'head' : bones[0]; const bs = el('select'); bones.forEach(k => bs.append(el('option', { value: k }, BONE_LABEL(k)))); bs.value = studio.bone; bs.onchange = () => { studio.bone = bs.value; studioTab('pose'); }; const bl = el('label', {}, 'Body part'); bl.append(bs); b.append(bl);
  const cur = () => st.pose[studio.bone] || (st.pose[studio.bone] = [0, 0, 0]);
  [['Tilt forward / back', 0], ['Turn', 1], ['Lean sideways', 2]].forEach(([t, i]) => sl(b, t, () => cur()[i], v => { cur()[i] = v; }, -180, 180, 1));
  const row = el('div', { className: 'px-row' }); const mk = (t, f, title) => { const x = el('button', { type: 'button', title }, t); x.onclick = f; row.append(x); };
  mk('Copy to other side', () => { const bn = studio.bone, other = bn.startsWith('left') ? 'right' + bn.slice(4) : bn.startsWith('right') ? 'left' + bn.slice(5) : null; if (other && human[other] !== undefined) { st.pose[other] = CH.mirror(cur()); studioRender(); } }, 'Gives the matching part on the other side the mirrored pose');
  mk('Reset this part', () => { delete st.pose[studio.bone]; studioTab('pose'); studioRender(); }); mk('Reset everything', () => { st.pose = {}; studioTab('pose'); studioRender(); });
  mk('Swap left and right', () => { const np = {}; for (const [k, v] of Object.entries(st.pose)) { const o = k.startsWith('left') ? 'right' + k.slice(4) : k.startsWith('right') ? 'left' + k.slice(5) : null; if (o) np[o] = CH.mirror(v); else np[k] = [v[0], -v[1], -v[2]]; } st.pose = np; studioRender(); }); b.append(row);
  b.append(el('div', { className: 'hint' }, 'Tip: start from a ready-made pose, then adjust. Arms and legs bend from the part you pick, and everything below follows.'));
}
const ANGLES = [['Front', { yaw: 0, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Three-quarter L', { yaw: 35, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Three-quarter R', { yaw: -35, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Side', { yaw: 90, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Back', { yaw: 180, pitch: 0, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['From above', { yaw: 0, pitch: 32, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['From below', { yaw: 0, pitch: -26, zoom: 1, oy: 0, ox: 0, fov: 22 }], ['Dramatic low', { yaw: 20, pitch: -22, zoom: 1.1, oy: 0, ox: 0, fov: 45 }], ['Waist up', { yaw: 0, pitch: 0, zoom: 1.7, oy: 0.2, ox: 0, fov: 22 }], ['Bust', { yaw: 0, pitch: 0, zoom: 2.4, oy: 0.3, ox: 0, fov: 20 }], ['Face', { yaw: 0, pitch: 0, zoom: 3.6, oy: 0.42, ox: 0, fov: 16 }], ['Face, turned', { yaw: 28, pitch: 4, zoom: 3.4, oy: 0.42, ox: 0, fov: 16 }]];
function studioLook(b) {
  const st = studio.st, m = studioModel(), sig = studio.pmSig || studio.modelId;
  if (m) tiles(b, 'Camera angle', ANGLES.map(([n]) => [n, n, 'c|' + n + '|' + sig + '|' + st.expr]), () => '', v => { Object.assign(st, ANGLES.find(a => a[0] === v)[1]); setTimeout(() => studioTab('look'), 0); }, v => S3.render(m, Object.assign({ pose: st.pose, style: 'color', outline: 1 }, ANGLES.find(a => a[0] === v)[1]), 60, 76), [60, 76]);
  b.append(el('h5', {}, 'Drawing')); sel3(b, 'Drawing style', () => st.style, v => { st.style = v; }, [['ink', 'Ink and tones (manga)'], ['gray', 'Grey'], ['color', 'Colour']]); sl(b, 'Outline thickness', () => st.outline, v => { st.outline = v; }, 0, 2.5, 0.05);
  b.append(el('h5', {}, 'Fine camera')); sl(b, 'Turn around', () => st.yaw, v => { st.yaw = v; }, -180, 180, 1); sl(b, 'Look from above / below', () => st.pitch, v => { st.pitch = v; }, -60, 60, 1); sl(b, 'Zoom', () => st.zoom, v => { st.zoom = v; }, 0.4, 4, 0.05); sl(b, 'Lens (low = flat, high = dramatic)', () => st.fov, v => { st.fov = v; }, 8, 60, 1); sl(b, 'Move up / down', () => st.oy, v => { st.oy = v; }, -0.8, 0.8, 0.01); sl(b, 'Move left / right', () => st.ox, v => { st.ox = v; }, -0.8, 0.8, 0.01);
  const mm = doc.models[studio.modelId]; if (mm && mm.kind === 'vrm' && mm.meta) { const mt = mm.meta; b.append(el('h5', {}, 'About this model'), el('div', { className: 'hint' }, [mt.title, mt.author && 'by ' + mt.author, mt.licenseName && 'Licence: ' + mt.licenseName].filter(Boolean).join(' · ') || 'No licence details in the file.'), el('div', { className: 'hint' }, 'Check what the licence allows (credit, commercial use, violent or adult content) before you publish.')); }
}
(function () { const cv3 = $('#mg3-cv'); let d = null; cv3.addEventListener('pointerdown', e => { d = { x: e.clientX, y: e.clientY, yaw: studio.st.yaw, pitch: studio.st.pitch }; try { cv3.setPointerCapture(e.pointerId); } catch (err) {} cv3.style.cursor = 'grabbing'; }); cv3.addEventListener('pointermove', e => { if (!d) return; studio.st.yaw = Math.max(-180, Math.min(180, d.yaw - (e.clientX - d.x) * 0.5)); studio.st.pitch = Math.max(-60, Math.min(60, d.pitch + (e.clientY - d.y) * 0.3)); studioRender(); }); const up = () => { d = null; cv3.style.cursor = 'grab'; if (studio.tab === 'look') studioTab('look'); }; cv3.addEventListener('pointerup', up); cv3.addEventListener('pointercancel', up); cv3.addEventListener('wheel', e => { e.preventDefault(); studio.st.zoom = Math.max(0.4, Math.min(4, studio.st.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); studioRender(); if (studio.tab === 'look') studioTab('look'); }, { passive: false }); })();
function closeStudio() { studio.open = false; if (studio.pm) { S3.disposeModel(studio.pm); studio.pm = null; } $('#mg-3d').close(); }
$('#mg3-ok').onclick = () => {
  const m = doc.models[studio.modelId]; if (studio.params && (!studio.obj || JSON.stringify(studio.params) !== JSON.stringify(m.params))) { m.params = CH.cleanParams(Object.assign({}, studio.params, { expr: studio.st.expr })); thumbs.clear(); }
  if (studio.obj) edit(() => Object.assign(studio.obj, JSON.parse(JSON.stringify(studio.st)))); else { document.dispatchEvent(new Event('sma-edit')); }
  const wasNew = studio.isNew; closeStudio(); refreshAll(); if (wasNew) status.textContent = 'Character saved. Drag it from the list onto a panel, or press Add.';
};
$('#mg3-cancel').onclick = () => { if (studio.isNew) { dropModel(studio.modelId); delete doc.models[studio.modelId]; } closeStudio(); refreshAll(); };
$('#mg-3d').addEventListener('cancel', e => { e.preventDefault(); $('#mg3-cancel').click(); });

// ---------- pages ----------
function renderPages() {
  const box = $('#mg-plist'); box.textContent = '';
  doc.pages.forEach((p, i) => { const b = el('button', { type: 'button', className: 'mgp' + (i === pg ? ' on' : '') }), c = el('canvas'), k = 0.14; c.width = Math.round(doc.pageW * k); c.height = Math.round(doc.pageH * k); const x = c.getContext('2d'); x.scale(k, k); renderPageOf(doc, p, x); b.append(c, el('small', {}, String(i + 1))); b.onclick = () => { pg = i; sel = null; refreshAll(); }; box.append(b); });
}
$('#mg-padd').onclick = () => edit(() => { doc.pages.splice(pg + 1, 0, { objs: [] }); pg++; sel = null; });
$('#mg-pdup').onclick = () => edit(() => { const c = JSON.parse(JSON.stringify(page(), (k, v) => (k[0] === '_' ? undefined : v))); c.objs.forEach(o => { const old = o.id; o.id = newId(); c.objs.forEach(q => { if (q.clip === old) q.clip = o.id; }); }); doc.pages.splice(pg + 1, 0, c); pg++; sel = null; });
$('#mg-pdel').onclick = () => { if (doc.pages.length < 2) return; edit(() => { doc.pages.splice(pg, 1); pg = Math.min(pg, doc.pages.length - 1); sel = null; }); };
const movePage = d => { const j = pg + d; if (j < 0 || j >= doc.pages.length) return; edit(() => { [doc.pages[pg], doc.pages[j]] = [doc.pages[j], doc.pages[pg]]; pg = j; }); };
$('#mg-pleft').onclick = () => movePage(-1); $('#mg-pright').onclick = () => movePage(1);
Object.entries(SIZES).forEach(([k, v]) => $('#mg-size').append(el('option', { value: k }, `${v[2]} (${v[0]}×${v[1]})`)));
$('#mg-size').onchange = e => { const [w, h] = SIZES[e.target.value]; if (doc.pageW === w && doc.pageH === h) return; edit(() => { doc.pageW = w; doc.pageH = h; }); fit(); };
LAYOUTS.forEach(([k, t]) => $('#mg-layout').append(el('option', { value: k }, t)));
$('#mg-layout').onchange = e => { const k = e.target.value; e.target.value = ''; if (!k) return; if (page().objs.some(o => o.t === 'panel') && !confirm('Replace the panels on this page with this layout? (Bubbles and other things stay.)')) return; edit(() => { page().objs = [...buildLayout(k, doc.pageW, doc.pageH), ...page().objs.filter(o => o.t !== 'panel')]; sel = null; }); };
$('#mg-name').oninput = e => { name = e.target.value || 'Untitled manga'; document.dispatchEvent(new Event('sma-edit')); };

// ---------- new / open ----------
function refreshAll() { renderPages(); showProps(); renderLibrary(); render(); const k = Object.keys(SIZES).find(k => SIZES[k][0] === doc.pageW && SIZES[k][1] === doc.pageH); $('#mg-size').value = k || 'b5'; $('#mg-name').value = name; setToolHint(); }
const setToolHint = () => {};
function loadDoc(d, nm) { if (doc && doc._mc) for (const e of doc._mc.values()) if (e.model) S3.disposeModel(e.model); thumbs.clear(); bmCache.clear(); doc = d; name = nm || 'Untitled manga'; pg = 0; sel = null; imgCache.clear(); undoS.length = redoS.length = 0; refreshAll(); fit(); }
$('#mg-new').onclick = () => $('#mg-newdlg').showModal(); $('#mg-newcancel').onclick = e => { e.preventDefault(); $('#mg-newdlg').close(); };
$('#mg-newok').onclick = e => { e.preventDefault(); pid = null; loadDoc(blank('b5'), 'Untitled manga'); $('#mg-newdlg').close(); };
$('#mg-open').onclick = async () => { const dlg = $('#mg-opendlg'), box = $('#mg-openlist'); dlg.showModal(); box.textContent = 'Loading…'; let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'manga'); } catch (e) {} box.textContent = ''; if (!items.length) box.append(el('p', { className: 'hint' }, 'No saved manga yet. Everything you make is saved automatically.'));
  items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled manga')); b.onclick = async () => { const r = await SMA.store.get(i.id); if (r) { api.load(r.data); pid = r.id; } dlg.close(); }; box.append(b); }); };
$('#mg-opencancel').onclick = e => { e.preventDefault(); $('#mg-opendlg').close(); };

// ---------- saving: a plain versioned format, with every field checked when it is read back ----------
function serialize() {
  const used = new Set(); doc.pages.forEach(p => p.objs.forEach(o => { if (o.img) used.add(o.img); })); const images = {}; for (const id of used) if (doc.images[id]) images[id] = doc.images[id]; const models = {}; for (const [id, m] of Object.entries(doc.models)) models[id] = m;
  return JSON.stringify({ app: 'sudo-make-manga', kind: 'manga', v: 1, name, pageW: doc.pageW, pageH: doc.pageH, rtl: doc.rtl, pages: doc.pages, images, models }, (k, v) => (k[0] === '_' ? undefined : v));
}
function cleanObj(o, imgs) {
  const id = str(o.id, 20) || newId(), p = (v, lo = -20000, hi = 20000, d = 0) => num(v, lo, hi, d);
  switch (o.t) {
    case 'panel': { if (!Array.isArray(o.pts) || o.pts.length !== 4) throw new Error('Damaged manga file'); return { t: 'panel', id, pts: o.pts.map(q => [p(q && q[0]), p(q && q[1])]), bw: p(o.bw, 0, 40, 6), bc: col(o.bc, '#000000'), bg: col(o.bg, '#ffffff'), img: o.img && imgs[o.img] ? String(o.img) : null, scale: p(o.scale, 0.1, 10, 1), ox: p(o.ox, -300, 300), oy: p(o.oy, -300, 300) }; }
    case 'bubble': return { t: 'bubble', id, x: p(o.x), y: p(o.y), w: p(o.w, 10, 5000, 280), h: p(o.h, 10, 5000, 190), shape: ['oval', 'round', 'cloud', 'shout', 'box', 'none'].includes(o.shape) ? o.shape : 'oval', text: str(o.text, 600), font: FONTS.includes(o.font) ? o.font : 'sans-serif', size: p(o.size, 8, 200, 30), bold: !!o.bold, fill: col(o.fill, '#ffffff'), stroke: col(o.stroke, '#000000'), sw: p(o.sw, 0, 30, 4), tail: Array.isArray(o.tail) ? [p(o.tail[0]), p(o.tail[1])] : null };
    case 'sfx': return { t: 'sfx', id, x: p(o.x), y: p(o.y), text: str(o.text, 40), font: FONTS.includes(o.font) ? o.font : 'Impact', size: p(o.size, 8, 600, 130), rot: p(o.rot, -180, 180), fill: col(o.fill, '#000000'), stroke: col(o.stroke, '#ffffff'), sw: p(o.sw, 0, 80, 14) };
    case 'tone': return { t: 'tone', id, x: p(o.x), y: p(o.y), w: p(o.w, -20000, 20000, 100), h: p(o.h, -20000, 20000, 100), kind: ['dots', 'gradient', 'lines', 'hatch'].includes(o.kind) ? o.kind : 'dots', level: p(o.level, 0, 100, 35), angle: p(o.angle, 0, 180, 45), size: p(o.size, 3, 60, 9), shape: o.shape === 'ellipse' ? 'ellipse' : 'rect', clip: str(o.clip, 20) };
    case 'speed': return { t: 'speed', id, x: p(o.x), y: p(o.y), w: p(o.w, -20000, 20000, 100), h: p(o.h, -20000, 20000, 100), kind: o.kind === 'parallel' ? 'parallel' : 'focus', lines: p(o.lines, 1, 400, 90), thick: p(o.thick, 0.5, 40, 5), inner: p(o.inner, 0, 95, 30), angle: p(o.angle, 0, 180), seed: p(o.seed, 0, 1e9, 1), clip: str(o.clip, 20) };
    case 'image': if (!imgs[o.img]) throw new Error('Damaged manga file'); return { t: 'image', id, x: p(o.x), y: p(o.y), w: p(o.w, 1, 20000, 400), h: p(o.h, 1, 20000, 400), img: String(o.img) };
    case 'char': { const pose = {}; if (o.pose && typeof o.pose === 'object') for (const [k, v] of Object.entries(o.pose)) { if (/^[a-zA-Z]{3,24}$/.test(k) && Array.isArray(v) && v.length === 3) pose[k] = v.map(q => p(q, -360, 360)); } return { t: 'char', id, model: str(o.model, 20), x: p(o.x), y: p(o.y), w: p(o.w, 20, 8000, 300), h: p(o.h, 20, 8000, 450), pose, yaw: p(o.yaw, -360, 360), pitch: p(o.pitch, -89, 89), zoom: p(o.zoom, 0.2, 8, 1), fov: p(o.fov, 5, 70, 22), ox: p(o.ox, -2, 2), oy: p(o.oy, -2, 2), style: ['ink', 'gray', 'color'].includes(o.style) ? o.style : 'ink', outline: p(o.outline, 0, 4, 1), flip: !!o.flip, expr: CH.EXPR.includes(o.expr) ? o.expr : 'smile', clip: str(o.clip, 20) }; }
    case 'ink': { if (!Array.isArray(o.pts) || o.pts.length < 2 || o.pts.length > 20000) throw new Error('Damaged manga file'); return { t: 'ink', id, pts: o.pts.map(v => p(v)), size: p(o.size, 0.5, 80, 4), color: col(o.color, '#000000') }; }
    default: throw new Error('Damaged manga file');
  }
}
function parse(json) {
  const o = JSON.parse(json); if (!o || o.app !== 'sudo-make-manga' || o.v !== 1) throw new Error('Not a Sudo Make Manga file');
  if (!Array.isArray(o.pages) || !o.pages.length || o.pages.length > 300) throw new Error('Damaged manga file');
  const images = {}; for (const [k, v] of Object.entries(o.images || {})) { if (typeof v !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 40e6) throw new Error('Damaged manga file'); images[str(k, 20)] = v; }
  const models = {}; for (const [k, m] of Object.entries(o.models || {})) { if (!m || typeof m !== 'object') throw new Error('Damaged manga file'); const mid = str(k, 20);
    if (m.kind === 'maker') models[mid] = { kind: 'maker', name: str(m.name || 'Character', 60), params: CH.cleanParams(m.params) };
    else if (m.kind === 'vrm') { if (typeof m.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(m.data) || m.data.length > 130e6) throw new Error('Damaged manga file'); const mt = m.meta || {}; models[mid] = { kind: 'vrm', name: str(m.name || 'Model', 60), data: m.data, meta: { title: str(mt.title, 80), author: str(mt.author, 80), licenseName: str(mt.licenseName, 80), otherLicenseUrl: str(mt.otherLicenseUrl, 300) } }; }
    else throw new Error('Damaged manga file'); }
  const pages = o.pages.map(pgo => { if (!pgo || !Array.isArray(pgo.objs) || pgo.objs.length > 3000) throw new Error('Damaged manga file'); return { objs: pgo.objs.map(q => cleanObj(q, images)) }; });
  return { name: str(o.name || 'Untitled manga', 120), doc: { pageW: num(o.pageW, 200, 6000, 1050), pageH: num(o.pageH, 200, 12000, 1500), rtl: o.rtl !== false, pages, images, models } };
}
function load(json) { const r = parse(json); loadDoc(r.doc, r.name); }
function thumb() { const c = document.createElement('canvas'), k = 160 / doc.pageW; c.width = 160; c.height = Math.round(doc.pageH * k); const x = c.getContext('2d'); x.scale(k, k); renderPageOf(doc, doc.pages[0], x); return Promise.resolve(c.toDataURL('image/png')); }

// ---------- export ----------
function download(blob, fname) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const safeName = () => (name || 'manga').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'manga';
async function whenImagesReady() { const ids = new Set(); doc.pages.forEach(p => p.objs.forEach(o => { if (o.img) ids.add(o.img); })); await Promise.all([...ids].map(id => new Promise(res => { const im = getImage(id); if (!im || ready(im)) return res(); im.addEventListener('load', res); im.addEventListener('error', res); }))); }
function pageCanvas(i, k) { const c = document.createElement('canvas'); c.width = Math.round(doc.pageW * k); c.height = Math.round(doc.pageH * k); const x = c.getContext('2d'); x.scale(k, k); renderPageOf(doc, doc.pages[i], x); return c; }
$('#mg-export').onchange = async e => { const v = e.target.value; e.target.value = ''; if (!v) return; try { await whenImagesReady();
  if (v === 'png' || v === 'png2') { const c = pageCanvas(pg, v === 'png2' ? 2 : 1); download(await new Promise(r => c.toBlob(r, 'image/png')), `${safeName()}-page-${pg + 1}.png`); }
  else if (v === 'pdf') { const out = []; for (let i = 0; i < doc.pages.length; i++) { const c = pageCanvas(i, 1), b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); out.push({ w: c.width, h: c.height, pw: +(c.width * 72 / 150).toFixed(2), ph: +(c.height * 72 / 150).toFixed(2), jpeg: new Uint8Array(await b.arrayBuffer()) }); } download(SMA.buildPDF(out), safeName() + '.pdf'); }
} catch (err) { status.textContent = 'Export failed: ' + err.message; } };

// ---------- for other modes: pages and single panels, drawn from a saved manga file ----------
function projectDoc(json) { const r = parse(json); return r.doc; }
function renderPageFrom(json, pageIndex, scale = 1) { const d = projectDoc(json), pgo = d.pages[pageIndex]; if (!pgo) throw new Error('No such page'); const saveDoc = doc; doc = d; try { const c = document.createElement('canvas'); c.width = Math.round(d.pageW * scale); c.height = Math.round(d.pageH * scale); const x = c.getContext('2d'); x.scale(scale, scale); renderPageOf(d, pgo, x); return c; } finally { doc = saveDoc; } }
function listPanels(json) { const d = projectDoc(json), out = []; d.pages.forEach((p, i) => p.objs.forEach(o => { if (o.t === 'panel') { const b = quadBox(o.pts); out.push({ page: i, id: o.id, box: b }); } })); return out; }
// the picture inside one panel (transparent outside its corners), without its border or the things drawn on top
function renderPanelFrom(json, pageIndex, panelId, scale = 1) { const d = projectDoc(json), pgo = d.pages[pageIndex], p = pgo && pgo.objs.find(o => o.t === 'panel' && o.id === panelId); if (!p) throw new Error('No such panel'); const b = quadBox(p.pts), w = b[2] - b[0], h = b[3] - b[1], saveDoc = doc; doc = d; try { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale)); const x = c.getContext('2d'); x.scale(scale, scale); x.translate(-b[0], -b[1]); const solo = { ...p, bw: 0 }; drawObj(x, solo, { objs: [solo] });
    const inside = pgo.objs.slice(pgo.objs.indexOf(p) + 1).filter(o => o.t !== 'panel' && (o.t === 'bubble' || o.t === 'sfx' || o.t === 'tone' || o.t === 'speed' || o.t === 'ink') && (o.clip === p.id || o.t === 'ink' || o.t === 'bubble' || o.t === 'sfx')); void inside; return c; } finally { doc = saveDoc; } }

// ---------- hooks for the rest of the app ----------
const api = { serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => name, setName: n => { name = n; $('#mg-name').value = n; }, load, parse,
  show() { requestAnimationFrame(() => { if (!api._shown && $('#mg-stage').getBoundingClientRect().width) { api._shown = true; fit(); } else render(); }); }, hide() {},
  reset() { pid = null; loadDoc(blank('b5'), 'Untitled manga'); },
  renderPageFrom, renderPanelFrom, listPanels,
  info: () => ({ pages: doc.pages.length, page: pg, objs: page().objs.length, types: page().objs.map(o => o.t), undo: undoS.length, w: doc.pageW, h: doc.pageH }), objs: () => page().objs.map(o => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)))), selected: () => sel && JSON.parse(JSON.stringify(sel, (k, v) => (k[0] === '_' ? undefined : v))), zoom: () => zoom, tool: () => tool, models: () => doc.models };
window.SMA_manga = api;
LAYOUTS.length; setTool('select'); refreshAll();
})();
