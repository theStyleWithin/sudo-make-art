// Custom PC icons: ready-made templates for people who theme their desktops. Folders, discs, memory cards, app-icon tiles,
// and icon-pack sheets, plus the usual icon sizes. Every template is made of ordinary editable shapes and text (shapes,
// gradients, text), so recolor, resize and swap the letters or symbols however you like. Export as PNG, SVG, ICO, or an
// icon-theme zip. All original artwork.
(() => {
'use strict';
let n = 0; const uid = () => 'pi' + (++n) + Math.random().toString(36).slice(2, 6);
const base = () => ({ rot: 0, opacity: 1, radius: 0, stroke: '#000000', sw: 0 });
const sh = (shape, o) => ({ id: uid(), type: 'shape', shape, fill: '#8b5cf6', ...base(), ...o });
const tx = (text, o) => ({ id: uid(), type: 'text', text, font: 'Arial', bold: true, italic: false, align: 'middle', fill: '#ffffff', fontSize: 120, curve: 0, w: 400, h: 120, ...base(), ...o });
const ctr = (text, cx, cy, size, o = {}) => { const w = size * 8; return tx(text, { x: cx - w / 2, y: cy - size * 0.6, w, fontSize: Math.round(size), ...o }); };
const mix = (hex, to, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), a = p(hex), b = p(to), c = a.map((v, i) => Math.round(v + (b[i] - v) * k)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
const lighter = (h, k = 0.25) => mix(h, '#ffffff', k), darker = (h, k = 0.3) => mix(h, '#000000', k);

// ---- folders ----
function folder(x, y, s, front, back, glyph, o = {}) {
  const w = 448 * s, h = 384 * s, els = [sh('folderback', { x, y, w, h, fill: back || darker(front, 0.3) }), sh('folderfront', { x, y, w, h, fill: front, grad: o.flat ? null : { type: 'linear', c1: lighter(front, 0.18), c2: front, angle: 90 } })];
  if (glyph) els.push(ctr(glyph, x + w / 2, y + h * 0.66, 150 * s, { fill: o.glyphColor || '#ffffff' })); return els;
}
const FOLDER_COLORS = ['#ff9a1f', '#2e2e32', '#5b2f9e', '#e84c4c', '#d4572b', '#e29f00', '#0b62b3', '#464a52', '#16a34a', '#1a9aa6'];
const FOLDER_GLYPHS = ['★', '♪', '▶', '✉', '⚙', '♥', '☁', '⌂', '✎', '☺'];
const FOLDER_NAMES = ['favorites', 'music', 'videos', 'mail', 'settings', 'personal', 'cloud', 'home', 'notes', 'friends'];
const sheet = (title, sub) => [sh('rect', { x: 0, y: 0, w: 1920, h: 1080, fill: '#161616' }), ctr(title, 960, 96, 78, { fill: '#4be0a0' }), ctr(sub, 960, 170, 34, { fill: '#9a9a9a', bold: false }), sh('rect', { x: 80, y: 230, w: 1760, h: 790, fill: '#222222' })];

// ---- discs ----
function disc(cx, cy, R, accent, letters, o = {}) {
  const els = [sh('disc', { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: o.c1 || '#2c3c52', grad: { type: 'radial', c1: o.c1 || '#2c3c52', c2: o.c2 || '#06080d' } }),
    sh('circle', { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: 'none', stroke: accent, sw: Math.max(2, R * 0.03) }),
    sh('circle', { x: cx - 0.38 * R, y: cy - 0.38 * R, w: 0.76 * R, h: 0.76 * R, fill: 'none', stroke: o.ring || '#ffffff', sw: Math.max(1, R * 0.012), opacity: 0.28 })];
  if (letters) els.push(ctr(letters, cx - 0.52 * R, cy - 0.02 * R, R * 0.5, { fill: accent }));
  if (o.plate !== false) els.push(sh('rect', { x: cx - 0.075 * R, y: cy + 0.56 * R, w: 0.15 * R, h: 0.22 * R, fill: o.plateColor || '#d4202a' }), ctr('◆', cx, cy + 0.67 * R, R * 0.1, { fill: '#ffffff' }));
  return els;
}
const DISC_ACCENTS = [['#2fa8ff', 'Ps'], ['#ff8a1f', 'Ai'], ['#c067e6', 'Pr'], ['#31d6c0', 'Au'], ['#ffd23f', 'Br'], ['#ff5470', 'Id']];

// ---- memory cards ----
function sd(x, y, w, h, body, cap, o = {}) {
  const dark = darker(body, 0.35), els = [sh('sdcard', { x, y, w, h, fill: body, grad: { type: 'linear', c1: lighter(body, 0.2), c2: dark, angle: 90 } }),
    sh('plaque', { x: x + 0.12 * w, y: y + 0.2 * h, w: 0.76 * w, h: 0.34 * h, fill: o.plate || '#f1f1f1' }), ctr(cap, x + w / 2, y + 0.39 * h, h * 0.13, { fill: o.ink || darker(body, 0.5) }), ctr(o.brand || 'SD', x + w * 0.5, y + 0.64 * h, h * 0.075, { fill: '#ffffff' })];
  for (let i = 0; i < 8; i++) els.push(sh('rect', { x: x + w * (0.13 + i * 0.1), y: y + 0.78 * h, w: w * 0.065, h: 0.18 * h, fill: '#d6b04a' }));
  els.push(sh('rect', { x: x - 0.01 * w, y: y + 0.14 * h, w: 0.035 * w, h: 0.08 * h, fill: dark })); return els;
}
const SD_COLORS = [['#2354b8', '8 GB'], ['#d9d9de', '2.0 GB'], ['#ff7f1a', '16 GB'], ['#a3205c', '1 GB']];

// ---- app icons ----
function tile(x, y, s, c1, c2, glyph, o = {}) { const w = 448 * s; return [sh(o.round ? 'circle' : 'rounded', { x, y, w, h: w, fill: c1, grad: { type: 'linear', c1, c2, angle: o.angle ?? 135 } }), ctr(glyph, x + w / 2, y + w / 2, 220 * s * (glyph.length > 1 ? 0.8 : 1), { fill: '#ffffff' })]; }
const TILES = [['#ff7a59', '#ff3d81', 'A'], ['#36c5f0', '#2563eb', 'B'], ['#34d399', '#059669', 'C'], ['#fbbf24', '#f97316', 'D'], ['#a78bfa', '#7c3aed', 'E'], ['#f472b6', '#be185d', 'F'], ['#60a5fa', '#1e40af', 'G'], ['#4ade80', '#15803d', 'H'], ['#fb7185', '#be123c', 'I'], ['#22d3ee', '#0e7490', 'J'], ['#facc15', '#a16207', 'K'], ['#94a3b8', '#334155', 'L']];

const T = (name, note, make) => ({ name, note, make });
// ---- game covers and game icons: a frame to drop the game's art onto, with a title on top ----
const fr = (frame, o) => ({ id: uid(), type: 'frame', frame, fill: '#3a3f4b', zoom: 1, ox: 0, oy: 0, ...base(), ...o });
const fade = (x, y, w, h, c1, c2, angle = 90) => sh('rect', { x, y, w, h, fill: c1, grad: { type: 'linear', c1, c2, angle } });
const withShadow = (e, o = { x: 8, y: 10, blur: 10, color: '#000000', opacity: 0.55 }) => ({ ...e, shadow: o });
function coverIcon() { // a boxed cover, like a game case seen straight on, with a thin dark bevel and a shadow
  return [withShadow(sh('rect', { x: 62, y: 28, w: 388, h: 456, fill: '#15171c', grad: { type: 'linear', c1: '#3a3f4b', c2: '#0e0f12', angle: 135 } })), fr('square', { x: 70, y: 36, w: 372, h: 440 }), fade(70, 330, 372, 146, '#000000cc', '#00000000', 270), ctr('GAME TITLE', 256, 430, 52, { fill: '#ffffff' })];
}
function roundIcon(ringA, ringB, title) { // round art in a metal ring; the title may spill over the ring, like on many icon packs
  return [withShadow(sh('circle', { x: 24, y: 20, w: 464, h: 464, fill: ringA, grad: { type: 'linear', c1: ringA, c2: ringB, angle: 135 } })), sh('circle', { x: 50, y: 46, w: 412, h: 412, fill: '#101216', grad: { type: 'linear', c1: '#ffffff', c2: '#7a828c', angle: 315 } }), fr('circle', { x: 58, y: 54, w: 396, h: 396 }), ctr(title, 256, 452, 62, { fill: '#ffffff', stroke: '#000000', sw: 10 })];
}
function squircleIcon() { return [withShadow(sh('rounded', { x: 40, y: 36, w: 432, h: 432, fill: '#1c1f26', grad: { type: 'linear', c1: '#4a5160', c2: '#12141a', angle: 135 } })), fr('rounded', { x: 52, y: 48, w: 408, h: 408 }), fade(52, 330, 408, 126, '#000000cc', '#00000000', 270), ctr('TITLE', 256, 410, 60, { fill: '#ffffff' })]; }
const gameCard = (name, w, h, note, build, bg = 'transparent') => T(name, note || `${w} × ${h}`, () => ({ w, h, bg, els: build(w, h) }));
const GAME = [
  { name: 'Game icons', items: [
    T('Cover icon (boxed)', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: coverIcon() })),
    T('Round icon (silver ring)', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: roundIcon('#f3f5f7', '#8b939c', 'TITLE') })),
    T('Round icon (colored ring)', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: roundIcon('#ff5c6c', '#8e1330', 'TITLE') })),
    T('Squircle icon', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: squircleIcon() })) ] },
  { name: 'Game covers', items: [
    gameCard('Cover (2:3 portrait)', 600, 900, '600 × 900', (w, h) => [fr('square', { x: 0, y: 0, w, h }), fade(0, h * 0.55, w, h * 0.45, '#000000dd', '#00000000', 270), ctr('GAME TITLE', w / 2, h * 0.82, 84, { fill: '#ffffff' }), ctr('A subtitle goes here', w / 2, h * 0.9, 34, { fill: '#d0d0d0', bold: false })], '#101010'),
    gameCard('Wide capsule (460 × 215)', 460, 215, '460 × 215', (w, h) => [fr('square', { x: 0, y: 0, w, h }), fade(0, 0, w * 0.7, h, '#000000cc', '#00000000', 0), tx('GAME TITLE', { x: 24, y: h / 2 - 34, w: w * 0.6, fontSize: 52, align: 'start' })], '#101010'),
    gameCard('Banner (16:9)', 1920, 1080, '1920 × 1080', (w, h) => [fr('square', { x: 0, y: 0, w, h }), fade(0, h * 0.5, w, h * 0.5, '#000000cc', '#00000000', 270), ctr('GAME TITLE', w / 2, h * 0.84, 150, { fill: '#ffffff' })], '#101010'),
    gameCard('Hero banner (3:1)', 1920, 620, '1920 × 620', (w, h) => [fr('square', { x: 0, y: 0, w, h }), fade(0, 0, w * 0.5, h, '#000000bb', '#00000000', 0)], '#101010'),
    gameCard('Logo (transparent)', 1280, 720, '1280 × 720, transparent', (w, h) => [withShadow(ctr('GAME TITLE', w / 2, h / 2, 190, { fill: '#ffffff', stroke: '#000000', sw: 14 }), { x: 0, y: 8, blur: 12, color: '#000000', opacity: 0.7 })]),
    gameCard('Poster (2:3)', 1200, 1800, '1200 × 1800', (w, h) => [fr('square', { x: 0, y: 0, w, h }), fade(0, h * 0.6, w, h * 0.4, '#000000e6', '#00000000', 270), ctr('GAME TITLE', w / 2, h * 0.86, 170, { fill: '#ffffff' })], '#101010') ] },
];
const icon = (s, label) => ({ name: label || `Icon ${s} × ${s}`, note: s + ' × ' + s + ' px, transparent', make: () => ({ w: s, h: s, bg: 'transparent', els: [] }) });
const FOL = (name, front, back, glyph, o) => T(name, '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: folder(32, 64, 1, front, back, glyph, o) }));
window.SMA_NEWCATS = {
  'Custom PC icons': { groups: [
    { name: 'Folders', items: [
      FOL('Classic folder', '#ff9a1f', null, '★'), FOL('Dark folder', '#2e2e32', '#202024', '♪'), FOL('Flat folder (one color)', '#3b82f6', '#2563eb', '▶', { flat: true }),
      T('Folder icon sheet (10)', '1920 × 1080 pack preview', () => { const els = sheet('My Folder Icons', 'v1.0 · made with Sudo Make Art');
        FOLDER_COLORS.forEach((c, i) => { const col = i % 5, row = (i / 5) | 0, s = 0.55, x = 80 + col * 352 + (352 - 448 * s) / 2, y = 270 + row * 380; els.push(...folder(x, y, s, c, null, FOLDER_GLYPHS[i]), ctr(FOLDER_NAMES[i] + '.png', 80 + col * 352 + 176, y + 384 * s + 38, 28, { fill: '#aaaaaa', bold: false })); }); return { w: 1920, h: 1080, bg: '#161616', els }; }) ] },
    { name: 'Discs', items: [
      T('CD / DVD (dark)', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: disc(256, 256, 244, '#2fa8ff', 'Ps') })),
      T('CD (silver)', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: disc(256, 256, 244, '#6b7280', 'CD', { c1: '#f6f6f6', c2: '#9aa3ad', ring: '#555555', plate: false }) })),
      T('Disc icon sheet (6)', '1920 × 1080 pack preview', () => { const els = sheet('My Disc Icons', 'v1.0 · made with Sudo Make Art');
        DISC_ACCENTS.forEach(([c, l], i) => { const col = i % 3, row = (i / 3) | 0; els.push(...disc(80 + col * 587 + 293, 260 + row * 385 + 170, 150, c, l), ctr(l.toLowerCase() + '.png', 80 + col * 587 + 293, 260 + row * 385 + 352, 28, { fill: '#aaaaaa', bold: false })); }); return { w: 1920, h: 1080, bg: '#161616', els }; }) ] },
    { name: 'Memory cards', items: [
      T('SD card', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: sd(86, 36, 340, 440, '#2354b8', '8 GB') })),
      T('microSD card', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: sd(136, 96, 240, 330, '#1d4ed8', '32 GB', { brand: 'micro' }) })),
      T('SD card sheet (4)', '1920 × 1080 pack preview', () => { const els = sheet('My Card Icons', 'v1.0 · made with Sudo Make Art'); SD_COLORS.forEach(([c, cap], i) => { els.push(...sd(160 + i * 420, 360, 300, 400, c, cap)); }); return { w: 1920, h: 1080, bg: '#161616', els }; }) ] },
    { name: 'App icons', items: [
      T('Rounded app icon', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: tile(32, 32, 1, '#ff7a59', '#ff3d81', 'A') })),
      T('Round app icon', '512 × 512, transparent', () => ({ w: 512, h: 512, bg: 'transparent', els: tile(32, 32, 1, '#36c5f0', '#2563eb', 'B', { round: true }) })),
      T('App icon sheet (12)', '1920 × 1080 pack preview', () => { const els = sheet('My Icon Pack', 'v1.0 · made with Sudo Make Art'); TILES.forEach(([a, b, g], i) => { const col = i % 6, row = (i / 6) | 0, s = 0.5, x = 80 + col * 293 + (293 - 448 * s) / 2, y = 290 + row * 360; els.push(...tile(x, y, s, a, b, g), ctr(g.toLowerCase() + '.png', 80 + col * 293 + 146, y + 448 * s + 40, 26, { fill: '#aaaaaa', bold: false })); }); return { w: 1920, h: 1080, bg: '#161616', els }; }) ] },
    { name: 'Icon sizes', items: [1024, 512, 256, 128, 64, 48, 32, 16].map(s => icon(s)) },
  ] },
};
window.SMA_NEWCATS['Game covers & icons'] = { groups: GAME };
})();
