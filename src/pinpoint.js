// Sudo Take Screenshot, the overlay page. Finds the picture or block under the pointer on a frozen picture of the screen.
// Method (original): a pixel is "busy" where its colour differs from its right or lower neighbour (a picture's pixels, its
// edge against the page, text) and "quiet" on flat background. Busy pixels are grouped into blocks; busy blocks that sit
// close together form one region. Four closeness settings give a small box (one picture) up to a big one (the picture with
// its caption, a whole card). The box edges come from the exact pixel where the colour changes, so no cropping is needed.
(async () => {
'use strict';
const cv = document.getElementById('c'), ctx = cv.getContext('2d'), tip = document.getElementById('tip');
const { dataUrl, text: TEXT } = await window.pin.image(); const im = new Image(); im.src = dataUrl; await im.decode();
const W = im.naturalWidth, H = im.naturalHeight; cv.width = W; cv.height = H;
const base = document.createElement('canvas'); base.width = W; base.height = H; const bctx = base.getContext('2d', { willReadFrequently: true }); bctx.drawImage(im, 0, 0);
const px = bctx.getImageData(0, 0, W, H).data;

// ---- analysis ----
const B = 4, bw = Math.ceil(W / B), bh = Math.ceil(H / B), THRESH = 40;
const hx = new Uint8Array(W * H), hy = new Uint8Array(W * H); // colour changes between this pixel and the one to its right / below
const cnt = new Uint16Array(bw * bh);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4; let c = 0;
  if (x < W - 1) { const d = Math.abs(px[i] - px[i + 4]) + Math.abs(px[i + 1] - px[i + 5]) + Math.abs(px[i + 2] - px[i + 6]); if (d > THRESH) { hx[y * W + x] = 1; c++; } }
  if (y < H - 1) { const j = i + W * 4, d = Math.abs(px[i] - px[j]) + Math.abs(px[i + 1] - px[j + 1]) + Math.abs(px[i + 2] - px[j + 2]); if (d > THRESH) { hy[y * W + x] = 1; c++; } }
  if (c) cnt[((y / B) | 0) * bw + ((x / B) | 0)]++;
}
const busyBlocks = new Uint8Array(bw * bh); for (let k = 0; k < busyBlocks.length; k++) busyBlocks[k] = cnt[k] >= 3 ? 1 : 0;
function dilate(m, r) { // grow every busy block by r in each direction (a square), with running sums
  const a = new Uint8Array(m.length), out = new Uint8Array(m.length), pre = new Int32Array(Math.max(bw, bh) + 1);
  for (let y = 0; y < bh; y++) { pre[0] = 0; for (let x = 0; x < bw; x++) pre[x + 1] = pre[x] + m[y * bw + x]; for (let x = 0; x < bw; x++) a[y * bw + x] = pre[Math.min(bw, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0; }
  for (let x = 0; x < bw; x++) { pre[0] = 0; for (let y = 0; y < bh; y++) pre[y + 1] = pre[y] + a[y * bw + x]; for (let y = 0; y < bh; y++) out[y * bw + x] = pre[Math.min(bh, y + r + 1)] - pre[Math.max(0, y - r)] > 0 ? 1 : 0; }
  return out;
}
function label(m) { // connected regions (4 neighbours); returns the label of every block and the pixel box of each region
  const lab = new Int32Array(m.length), q = new Int32Array(m.length); let n = 0;
  for (let s = 0; s < m.length; s++) { if (!m[s] || lab[s]) continue; n++; let h = 0, t = 0; q[t++] = s; lab[s] = n;
    while (h < t) { const k = q[h++], x = k % bw, y = (k / bw) | 0; if (x > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = n; q[t++] = k - 1; } if (x < bw - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = n; q[t++] = k + 1; } if (y > 0 && m[k - bw] && !lab[k - bw]) { lab[k - bw] = n; q[t++] = k - bw; } if (y < bh - 1 && m[k + bw] && !lab[k + bw]) { lab[k + bw] = n; q[t++] = k + bw; } } }
  const x0 = new Int32Array(n + 1).fill(1e9), y0 = new Int32Array(n + 1).fill(1e9), x1 = new Int32Array(n + 1).fill(-1), y1 = new Int32Array(n + 1).fill(-1), pc = new Int32Array(n + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x, L = lab[((y / B) | 0) * bw + ((x / B) | 0)]; if (!L) continue;
    if (hx[k]) { if (x + 1 < x0[L]) x0[L] = x + 1; if (x > x1[L]) x1[L] = x; pc[L]++; }   // an edge between x and x+1: the box starts at x+1 on its left, ends at x on its right
    if (hy[k]) { if (y + 1 < y0[L]) y0[L] = y + 1; if (y > y1[L]) y1[L] = y; pc[L]++; } }
  return { lab, x0, y0, x1, y1, pc };
}
const levels = [1, 3, 6, 12].map(r => label(dilate(busyBlocks, r)));

function candidates(mx, my) {
  const bx = Math.max(0, Math.min(bw - 1, (mx / B) | 0)), by = Math.max(0, Math.min(bh - 1, (my / B) | 0)), out = [];
  for (const lv of levels) {
    let L = lv.lab[by * bw + bx];
    if (!L) { for (let r = 1; r <= 3 && !L; r++) for (let dy = -r; dy <= r && !L; dy++) for (let dx = -r; dx <= r && !L; dx++) { const x = bx + dx, y = by + dy; if (x >= 0 && y >= 0 && x < bw && y < bh && lv.lab[y * bw + x]) L = lv.lab[y * bw + x]; } }
    if (!L || lv.x1[L] < lv.x0[L] || lv.y1[L] < lv.y0[L] || lv.pc[L] < 20) continue;
    const b = { x: lv.x0[L], y: lv.y0[L], w: lv.x1[L] - lv.x0[L] + 1, h: lv.y1[L] - lv.y0[L] + 1 };
    if (b.w < 8 || b.h < 8 || (b.w >= W * 0.98 && b.h >= H * 0.98)) continue;
    if (!out.some(o => o.x === b.x && o.y === b.y && o.w === b.w && o.h === b.h)) out.push(b);
  }
  return out.sort((a, b) => a.w * a.h - b.w * b.h);
}

// ---- interaction ----
let mx = W / 2, my = H / 2, cands = [], lvl = 0, drag = null, manual = null, cur = null;
const k = () => W / innerWidth;
function paint() {
  ctx.drawImage(base, 0, 0); cur = manual || cands[Math.min(lvl, cands.length - 1)] || null;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; if (!cur) { ctx.fillRect(0, 0, W, H); return; }
  ctx.fillRect(0, 0, W, cur.y); ctx.fillRect(0, cur.y + cur.h, W, H - cur.y - cur.h); ctx.fillRect(0, cur.y, cur.x, cur.h); ctx.fillRect(cur.x + cur.w, cur.y, W - cur.x - cur.w, cur.h);
  const s = k(); ctx.lineWidth = 2 * s; ctx.strokeStyle = '#f4ff2b'; ctx.strokeRect(cur.x - s, cur.y - s, cur.w + 2 * s, cur.h + 2 * s);
  const label = `${cur.w} × ${cur.h}`; ctx.font = `bold ${13 * s}px system-ui, sans-serif`; const tw = ctx.measureText(label).width + 12 * s, ty = cur.y > 26 * s ? cur.y - 24 * s : cur.y + 4 * s;
  ctx.fillStyle = '#161616'; ctx.fillRect(cur.x, ty, tw, 20 * s); ctx.fillStyle = '#f4ff2b'; ctx.textBaseline = 'middle'; ctx.fillText(label, cur.x + 6 * s, ty + 10 * s);
}
function point(ev) { mx = ev.clientX * k(); my = ev.clientY * k(); }
function save(b) { if (!b) return; const c = document.createElement('canvas'); c.width = b.w; c.height = b.h; c.getContext('2d').drawImage(base, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); window.pin.done((TEXT ? prep(c) : c).toDataURL('image/png')); }
// Text Grab: reading works best on dark text on a light page and at a decent size, so small grabs are doubled in size and
// light-on-dark text (dark mode, terminals) is flipped to dark-on-light. Only the copy sent to the reader changes.
function prep(c) {
  const k2 = c.height < 90 || c.width < 200 ? 2 : 1, o = document.createElement('canvas'); o.width = Math.min(8000, c.width * k2); o.height = Math.min(8000, c.height * k2);
  const x = o.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height);
  const d = x.getImageData(0, 0, o.width, o.height), a = d.data; let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 16) { sum += a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; n++; }
  if (sum / n < 110) { for (let i = 0; i < a.length; i += 4) { a[i] = 255 - a[i]; a[i + 1] = 255 - a[i + 1]; a[i + 2] = 255 - a[i + 2]; } x.putImageData(d, 0, 0); }
  return o;
}
if (TEXT) document.getElementById('tip').innerHTML = '<b>Drag</b> over the text you want. Or point at a block and <b>click</b>; <b>scroll</b> for a bigger or smaller box. <b>Space</b> reads the whole screen. <b>Esc</b> cancels.';
addEventListener('pointermove', ev => { point(ev); if (drag) { const x = Math.min(drag.x, mx), y = Math.min(drag.y, my), w = Math.abs(mx - drag.x), h = Math.abs(my - drag.y); if (w > 5 * k() || h > 5 * k()) { drag.moved = true; manual = { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) }; } } else { const before = cands.length ? cands[Math.min(lvl, cands.length - 1)] : null; cands = candidates(mx, my); const idx = before ? cands.findIndex(c => c.x === before.x && c.y === before.y && c.w === before.w && c.h === before.h) : -1; if (idx >= 0) lvl = idx; else if (lvl >= cands.length) lvl = Math.max(0, cands.length - 1); } paint(); });
addEventListener('pointerdown', ev => { if (ev.button === 2) { window.pin.done(null); return; } point(ev); drag = { x: mx, y: my, moved: false }; manual = null; });
addEventListener('pointerup', ev => { if (ev.button !== 0 || !drag) return; point(ev); const d = drag; drag = null; if (d.moved && manual) save(manual); else save(cands[Math.min(lvl, cands.length - 1)] || null); });
addEventListener('wheel', ev => { ev.preventDefault(); if (manual) return; cands = candidates(mx, my); lvl = Math.max(0, Math.min(cands.length - 1, lvl + (ev.deltaY < 0 ? 1 : -1))); paint(); }, { passive: false });
addEventListener('keydown', ev => { if (ev.key === 'Escape') window.pin.done(null); else if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); save({ x: 0, y: 0, w: W, h: H }); } else if (ev.key === '+' || ev.key === '=') { lvl = Math.min(cands.length - 1, lvl + 1); paint(); } else if (ev.key === '-') { lvl = Math.max(0, lvl - 1); paint(); } });
addEventListener('contextmenu', ev => ev.preventDefault());
window.__pin = { W, H, state: () => ({ cands, lvl, box: cur }) };
setTimeout(() => { tip.style.opacity = '0.9'; }, 0); setTimeout(() => { tip.style.transition = 'opacity 1s'; tip.style.opacity = '0.35'; }, 6000);
paint();
})();
