// Profile decorations for Anti-Social: nameplates, profile banners and avatar decorations.
// This file has two jobs. (1) It adds a "Profile decorations" section to the New design window, with correctly sized
// canvases and ready-made starting points. (2) It holds the rules and the writer for the .asdeco pack file, which
// Anti-Social imports. The file format is described in docs/asdeco-format.md. All artwork here is original.
(() => {
'use strict';
const root = typeof window !== 'undefined' ? window : globalThis;
const FORMAT = 'anti-social-decorations', VERSION = 1;
// The shapes Anti-Social draws. w x h is the size it uses on screen; work is the size you design at (four times bigger, so it stays sharp).
// A wreath (avatar decoration) keeps a clear circle in the middle for the picture: hole is in the 144 x 144 box.
const KINDS = {
  plate: { label: 'Nameplate', w: 240, h: 44, tol: 0.15, rtol: 0.35, imgMax: 400000, svgMax: 150000, work: [960, 176] },
  banner: { label: 'Profile banner', w: 1200, h: 200, tol: 0.15, rtol: 0.35, imgMax: 1500000, svgMax: 700000, work: [2400, 400] },
  wreath: { label: 'Avatar decoration', w: 144, h: 144, tol: 0.03, rtol: 0.05, imgMax: 600000, svgMax: 300000, work: [576, 576], hole: { cx: 72, cy: 72, r: 50 } },
};
const LIMITS = { file: 16 * 1024 * 1024, video: 3 * 1024 * 1024, items: 40, name: 40, credit: 60 };
const tidy = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- reading a picture's size and whether it moves, from its own header (nothing is decoded) ----
const IMG_URI = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+\/=\s]+)$/, VID_URI = /^data:video\/(mp4|webm);base64,([A-Za-z0-9+\/=\s]+)$/;
const bytesOf = b64 => { const bin = typeof atob === 'function' ? atob(b64.replace(/\s+/g, '')) : Buffer.from(b64, 'base64').toString('binary'); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const u16 = (b, i) => b[i] | b[i + 1] << 8, u24 = (b, i) => b[i] | b[i + 1] << 8 | b[i + 2] << 16, be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const has4 = (b, tag) => { const t = [...tag].map(c => c.charCodeAt(0)); for (let i = 0; i + 4 <= b.length; i++) if (b[i] === t[0] && b[i + 1] === t[1] && b[i + 2] === t[2] && b[i + 3] === t[3]) return true; return false; };
function imageInfo(uri) {
  const m = IMG_URI.exec(String(uri || '')); if (!m) return null; let b; try { b = bytesOf(m[2]); } catch (e) { return null; }
  let w = 0, h = 0, moves = false;
  if (m[1] === 'png') { if (b.length < 24 || be32(b, 0) !== 0x89504e47) return null; w = be32(b, 16); h = be32(b, 20); moves = has4(b, 'acTL'); }
  else if (m[1] === 'gif') { if (b.length < 10 || b[0] !== 71 || b[1] !== 73 || b[2] !== 70) return null; w = u16(b, 6); h = u16(b, 8); let n = 0; for (let i = 0; i + 3 < b.length; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 4) n++; moves = n > 1; }
  else if (m[1] === 'webp') {
    if (b.length < 30 || be32(b, 0) !== 0x52494646 || be32(b, 8) !== 0x57454250) return null; const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === 'VP8X') { w = 1 + u24(b, 24); h = 1 + u24(b, 27); moves = !!(b[20] & 2); } else if (tag === 'VP8 ') { w = u16(b, 26) & 0x3fff; h = u16(b, 28) & 0x3fff; } else if (tag === 'VP8L') { w = 1 + (((b[22] & 0x3f) << 8) | b[21]); h = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)); } else return null;
  } else { if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null; for (let i = 2; i + 9 < b.length;) { if (b[i] !== 0xff) { i++; continue; } const mk = b[i + 1]; if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) { h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8]; break; } i += 2 + ((b[i + 2] << 8) | b[i + 3]); } }
  return w >= 16 && h >= 16 && w <= 4096 && h <= 4096 ? { type: m[1], w, h, moves, bytes: b.length } : null;
}
const shapeErr = (K, w, h) => `Wrong shape for a ${K.label.toLowerCase()}: it is ${+(+w).toFixed(1)} × ${+(+h).toFixed(1)}, and should be about ${K.w} × ${K.h} in shape (for example ${K.work[0]} × ${K.work[1]}).`;

// ---- checking one thing before it goes in a pack: { svg } | { image: dataURL } | { video: dataURL } ----
function check(kind, src) {
  const K = KINDS[kind]; if (!K) return { ok: false, error: 'Pick what kind of decoration this is.' };
  if (src && typeof src.svg === 'string') {
    const vb = (/viewBox\s*=\s*["']\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(src.svg) || []).slice(3).map(Number);
    if (vb.length !== 2 || !(vb[0] > 0 && vb[1] > 0)) return { ok: false, error: 'The picture has no usable size.' };
    if (Math.abs(vb[0] / vb[1] / (K.w / K.h) - 1) > K.tol) return { ok: false, error: shapeErr(K, vb[0], vb[1]) };
    if (src.svg.length > K.svgMax) return { ok: false, error: `This is too big for a ${K.label.toLowerCase()} (${Math.round(src.svg.length / 1000)} KB; the limit is ${Math.round(K.svgMax / 1000)} KB). Try a smaller embedded picture, or save it as a PNG instead.` };
    const lost = []; if (/<script|<foreignObject/i.test(src.svg)) lost.push('scripts and web content'); if (/\son[a-z]+\s*=/i.test(src.svg)) lost.push('event handlers'); if (/(?:xlink:)?href\s*=\s*["'](?!#|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(src.svg)) lost.push('links to other files');
    return { ok: true, moves: /<(animate|animateTransform|animateMotion|set)\b/.test(src.svg), note: lost.length ? 'Anti-Social leaves out ' + lost.join(', ') + '.' : '' };
  }
  if (src && typeof src.image === 'string') {
    const i = imageInfo(src.image); if (!i) return { ok: false, error: 'This is not a usable PNG, GIF, WebP or JPEG picture (16 to 4096 pixels).' };
    if (i.bytes > K.imgMax) return { ok: false, error: `This picture is too big for a ${K.label.toLowerCase()} (${Math.round(i.bytes / 1000)} KB; the limit is ${Math.round(K.imgMax / 1000)} KB).` };
    if (Math.abs(i.w / i.h / (K.w / K.h) - 1) > K.rtol) return { ok: false, error: shapeErr(K, i.w, i.h) };
    return { ok: true, moves: i.moves, w: i.w, h: i.h, note: i.moves ? '' : '' };
  }
  if (src && typeof src.video === 'string') {
    const m = VID_URI.exec(src.video); if (!m) return { ok: false, error: 'This is not a usable MP4 or WebM video.' };
    const bytes = Math.floor(m[2].replace(/\s+/g, '').length * 3 / 4); if (bytes > LIMITS.video) return { ok: false, error: `This video is too big (${(bytes / 1048576).toFixed(1)} MB; the limit is ${LIMITS.video / 1048576} MB). A few seconds at a small size is plenty.` };
    return { ok: true, moves: true, note: kind === 'wreath' ? 'Video has no see-through parts, so Anti-Social cuts the avatar circle out of the middle of every frame.' : 'Anti-Social crops a video to the shape and plays up to 6 seconds of it.' };
  }
  return { ok: false, error: 'Nothing to save.' };
}
// the kind a picture's shape fits best (or '')
function guessKind(w, h) { const s = w / h; let best = '', gap = 9; for (const k of Object.keys(KINDS)) { const g = Math.abs(s / (KINDS[k].w / KINDS[k].h) - 1); if (g <= KINDS[k].rtol && g < gap) { best = k; gap = g; } } return best; }

// items: [{ kind, name, blurb?, svg | image | video, still? }] -> the file's text
function buildPack(meta, items) {
  const out = items.map(it => ({ kind: it.kind, name: tidy(it.name, LIMITS.name) || KINDS[it.kind].label, blurb: tidy(it.blurb, 100), ...(it.video ? { video: it.video } : it.image ? { image: it.image } : { art: it.svg }), ...(it.still ? { still: it.still } : {}) }));
  const text = JSON.stringify({ format: FORMAT, v: VERSION, name: tidy(meta && meta.name, LIMITS.name) || 'My decorations', author: tidy(meta && meta.author, LIMITS.credit), license: tidy(meta && meta.license, LIMITS.credit), items: out }, null, 1);
  if (text.length > LIMITS.file) throw new Error('This pack is bigger than Anti-Social will read (' + Math.round(LIMITS.file / 1048576) + ' MB). Save fewer items in one pack.');
  return text;
}

// ---- the New design section ----
let n = 0; const uid = () => 'pd' + (++n) + Math.random().toString(36).slice(2, 6);
const base = () => ({ rot: 0, opacity: 1, radius: 0, stroke: '#000000', sw: 0 });
const sh = (shape, o) => ({ id: uid(), type: 'shape', shape, fill: '#ff7eb6', ...base(), ...o });
const tx = (text, o) => ({ id: uid(), type: 'text', text, font: 'Arial', bold: true, italic: false, align: 'middle', fill: '#ffffff', fontSize: 64, curve: 0, w: 600, h: 80, ...base(), ...o });
const GUIDE = '#ff2d87';
// guides help you place things and are never exported (not to PNG, SVG or a pack)
const guide = els => els.map(e => ({ ...e, guide: true }));
const plateGuide = () => guide([sh('rect', { x: 4, y: 4, w: 592, h: 168, fill: GUIDE, opacity: 0.12, stroke: GUIDE, sw: 4 }), tx('picture and name sit here (not exported)', { x: 28, y: 64, w: 548, fontSize: 34, fill: GUIDE, bold: false })]);
const bannerGuide = () => guide([sh('rect', { x: 120, y: 40, w: 2160, h: 320, fill: 'none', stroke: GUIDE, sw: 6, opacity: 0.7 }), tx('keep words and faces inside this box (not exported)', { x: 700, y: 170, w: 1000, fontSize: 52, fill: GUIDE, bold: false })]);
const wreathGuide = () => guide([sh('circle', { x: 88, y: 88, w: 400, h: 400, fill: GUIDE, opacity: 0.16, stroke: GUIDE, sw: 4 }), tx('picture here: keep this circle clear', { x: 138, y: 270, w: 300, fontSize: 28, fill: GUIDE, bold: false })]);
const grad = (c1, c2, angle = 90) => ({ type: 'linear', c1, c2, angle });
const spread = (k, x0, x1, f) => Array.from({ length: k }, (_, i) => f(x0 + (x1 - x0) * (k === 1 ? 0.5 : i / (k - 1)), i));
const T = (name, note, kind, els) => ({ name, note, make: () => { const [w, h] = KINDS[kind].work; return { w, h, bg: 'transparent', deco: kind, els: [...els(), ...(kind === 'plate' ? plateGuide() : kind === 'banner' ? bannerGuide() : wreathGuide())] }; } });
const N = 'Nameplates', B = 'Profile banners', W = 'Avatar decorations';
root.SMA_NEWCATS = root.SMA_NEWCATS || {};
root.SMA_NEWCATS['Profile decorations'] = { groups: [
  { name: N, items: [
    T('Blank nameplate', '960 × 176, transparent', 'plate', () => []),
    T('Candy bar', '960 × 176', 'plate', () => [sh('rounded', { x: 0, y: 0, w: 960, h: 176, radius: 88, fill: '#ff9ad5', grad: grad('#ffb3e0', '#ffd98a', 0) }), ...spread(7, 640, 920, (x, i) => sh('circle', { x: x - 10 - (i % 2) * 6, y: 30 + (i * 37) % 100, w: 20 + (i % 2) * 12, h: 20 + (i % 2) * 12, fill: '#ffffff', opacity: 0.45 })), sh('heart', { x: 842, y: 52, w: 70, h: 64, fill: '#ff4f9a' })]),
    T('Night sky', '960 × 176', 'plate', () => [sh('rounded', { x: 0, y: 0, w: 960, h: 176, radius: 30, fill: '#1b1b4d', grad: grad('#0b1030', '#3a2d7a', 0) }), ...spread(9, 330, 920, (x, i) => sh('star5', { x: x, y: 24 + (i * 53) % 110, w: 22 + (i % 3) * 8, h: 22 + (i % 3) * 8, fill: '#ffe9a8', opacity: 0.9 })), sh('crescent', { x: 806, y: 34, w: 100, h: 110, fill: '#ffe9a8' })]),
    T('Mint leaf', '960 × 176', 'plate', () => [sh('rounded', { x: 0, y: 0, w: 960, h: 176, radius: 60, fill: '#34d399', grad: grad('#a7f3d0', '#10b981', 0) }), ...spread(4, 700, 900, (x, i) => sh('flower5', { x: x - 34, y: 40 + (i % 2) * 40, w: 68, h: 68, fill: '#ffffff', opacity: 0.55 }))]),
  ] },
  { name: B, items: [
    T('Blank banner', '2400 × 400, transparent', 'banner', () => []),
    T('Sunset', '2400 × 400', 'banner', () => [sh('rect', { x: 0, y: 0, w: 2400, h: 400, fill: '#f97316', grad: grad('#7c3aed', '#fb923c', 90) }), sh('circle', { x: 1700, y: 120, w: 340, h: 340, fill: '#fde68a', opacity: 0.95 }), sh('rect', { x: 0, y: 300, w: 2400, h: 100, fill: '#4c1d95', opacity: 0.55 })]),
    T('Polka pastel', '2400 × 400', 'banner', () => [sh('rect', { x: 0, y: 0, w: 2400, h: 400, fill: '#ffe4ef' }), ...spread(18, 60, 2340, (x, i) => sh('circle', { x: x - 30, y: 30 + (i * 97) % 280, w: 60 + (i % 3) * 22, h: 60 + (i % 3) * 22, fill: i % 2 ? '#ffb3d1' : '#c9b6ff', opacity: 0.7 }))]),
  ] },
  { name: W, items: [
    T('Blank avatar decoration', '576 × 576, transparent', 'wreath', () => []),
    T('Gold ring', '576 × 576', 'wreath', () => [sh('circle', { x: 70, y: 70, w: 436, h: 436, fill: 'none', stroke: '#f5b301', sw: 36 }), sh('circle', { x: 52, y: 52, w: 472, h: 472, fill: 'none', stroke: '#fff3b0', sw: 6, opacity: 0.8 })]),
    T('Flower crown', '576 × 576', 'wreath', () => [...spread(7, 0, 6, (_, i) => { const a = (-150 + i * 50) * Math.PI / 180; return sh('flower5', { x: 288 + Math.cos(a) * 214 - 40, y: 288 + Math.sin(a) * 214 - 40, w: 80, h: 80, fill: ['#ff7eb6', '#ffd166', '#a78bfa'][i % 3] }); })]),
    T('Heart frame', '576 × 576', 'wreath', () => [sh('circle', { x: 78, y: 78, w: 420, h: 420, fill: 'none', stroke: '#ff9ad5', sw: 24 }), ...spread(8, 0, 7, (_, i) => { const a = i * 45 * Math.PI / 180; return sh('heart', { x: 288 + Math.cos(a) * 232 - 28, y: 288 + Math.sin(a) * 232 - 26, w: 56, h: 52, fill: '#ff4f9a' }); })]),
    T('Cat ears', '576 × 576', 'wreath', () => [sh('circle', { x: 76, y: 76, w: 424, h: 424, fill: 'none', stroke: '#8b5cf6', sw: 22 }), sh('triangle', { x: 70, y: 18, w: 150, h: 150, fill: '#8b5cf6', rot: -12 }), sh('triangle', { x: 356, y: 18, w: 150, h: 150, fill: '#8b5cf6', rot: 12 }), sh('triangle', { x: 106, y: 66, w: 80, h: 80, fill: '#ffc2dd', rot: -12 }), sh('triangle', { x: 390, y: 66, w: 80, h: 80, fill: '#ffc2dd', rot: 12 })]),
  ] },
] };

root.SMA_ASDECO = { FORMAT, VERSION, KINDS, LIMITS, imageInfo, check, guessKind, buildPack, tidy };
if (typeof module !== 'undefined') module.exports = root.SMA_ASDECO;
})();
