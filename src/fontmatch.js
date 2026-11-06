// "Match a font from a picture". Everything happens on this computer: your picture is compared with a shipped index of ~3,000
// open-licensed fonts plus the fonts installed or added here. Nothing is downloaded or sent while matching.
// Getting the real file of a match is a separate, opt-in, checked download (desktop app only).
(() => {
'use strict';
const api = window.sma && window.sma.fontmatch, SMA = window.SMA;
if (!api || !SMA) return;
const $ = s => document.querySelector(s), dlg = $('#fmdlg');
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
let onPick = null, pic = null, crop = null, index = null, stop = false, results = [];

// ---------- the picture ----------
const view = $('#fm-canvas'), vctx = view.getContext('2d');
const full = document.createElement('canvas'), fctx = full.getContext('2d', { willReadFrequently: true });
async function loadPicture(blob) {
  const bmp = await createImageBitmap(blob), k = Math.min(1, 1600 / bmp.width); full.width = Math.max(1, Math.round(bmp.width * k)); full.height = Math.max(1, Math.round(bmp.height * k));
  fctx.fillStyle = '#fff'; fctx.fillRect(0, 0, full.width, full.height); fctx.drawImage(bmp, 0, 0, full.width, full.height); pic = true; crop = null;
  const s = Math.min(1, 470 / full.width, 200 / full.height); view.width = Math.round(full.width * s); view.height = Math.round(full.height * s); view.hidden = false; $('#fm-change').hidden = false; $('#fm-drop-hint').hidden = true; paint();
}
function paint() { vctx.drawImage(full, 0, 0, view.width, view.height); if (crop) { vctx.save(); vctx.strokeStyle = '#8b5cf6'; vctx.lineWidth = 2; vctx.setLineDash([6, 4]); vctx.strokeRect(crop.x, crop.y, crop.w, crop.h); vctx.restore(); } }
let dragFrom = null;
view.addEventListener('pointerdown', ev => { const r = view.getBoundingClientRect(); dragFrom = [ev.clientX - r.left, ev.clientY - r.top]; view.setPointerCapture(ev.pointerId); });
view.addEventListener('pointermove', ev => { if (!dragFrom) return; const r = view.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; crop = { x: Math.min(dragFrom[0], x), y: Math.min(dragFrom[1], y), w: Math.abs(x - dragFrom[0]), h: Math.abs(y - dragFrom[1]) }; paint(); });
view.addEventListener('pointerup', () => { dragFrom = null; if (crop && (crop.w < 6 || crop.h < 6)) { crop = null; paint(); } });
const choose = () => { const f = $('#file'); f.accept = 'image/*'; f.multiple = false; f.value = ''; f.onchange = () => f.files[0] && loadPicture(f.files[0]); f.click(); };
$('#fm-pick').onclick = choose; $('#fm-change').onclick = choose;
const zone = $('#fm-drop');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); }); zone.addEventListener('dragleave', () => zone.classList.remove('over'));
zone.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('over'); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) loadPicture(f); });
dlg.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (f) { e.stopPropagation(); loadPicture(f); } });

// ---------- turning pixels into a shape ----------
function inkBitmap(rgba, w, h) { // black-and-white copy of the text, trimmed to the letters (ink = the minority colour)
  const g = new Uint8Array(w * h), hist = new Float64Array(256);
  for (let i = 0; i < w * h; i++) { const v = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let wB = 0, sB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = w * h - wB; if (!wF) break; sB += t * hist[t]; const d = (sB / wB - (sum - sB) / wF); const v = wB * wF * d * d; if (v > best) { best = v; thr = t; } }
  let dark = 0; for (let i = 0; i < w * h; i++) if (g[i] <= thr) dark++;
  const inkIsDark = dark <= w * h / 2, bits = new Uint8Array(w * h); let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const on = inkIsDark ? g[y * w + x] <= thr : g[y * w + x] > thr; if (on) { bits[y * w + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) return null; const bw = x1 - x0 + 1, bh = y1 - y0 + 1, out = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) out.set(bits.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + bw), y * bw);
  return { w: bw, h: bh, bits: out };
}
function toGrid(b, gw, gh) { // area-average a bitmap onto a gw x gh grid
  const out = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) { const ya = Math.floor(gy * b.h / gh), yb = Math.max(ya + 1, Math.floor((gy + 1) * b.h / gh));
    for (let gx = 0; gx < gw; gx++) { const xa = Math.floor(gx * b.w / gw), xb = Math.max(xa + 1, Math.floor((gx + 1) * b.w / gw)); let s = 0, n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { s += b.bits[y * b.w + x]; n++; } out[gy * gw + gx] = s / n; } }
  return out;
}
function pearson(a, b) { let ma = 0, mb = 0; const n = a.length; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0; }
const GH = 28;
function target(b) { const gw = Math.max(12, Math.min(420, Math.round(GH * b.w / b.h))); return { gw, grid: toGrid(b, gw, GH), aspect: b.w / b.h }; }
function score(T, cand) { // 0..1: same overall proportions, and the same shapes once both are laid on the same grid
  if (!cand) return 0; const asp = Math.exp(-3 * Math.abs(Math.log(T.aspect / (cand.w / cand.h)))), r = Math.max(0, pearson(T.grid, toGrid(cand, T.gw, GH)));
  return 0.35 * asp + 0.65 * r;
}

// ---------- redrawing text from the shipped index ----------
let glyphCache = new Map();
function glyphsOf(rec) { // decode one font's letter pictures
  let g = glyphCache.get(rec); if (g) return g; g = {}; const u = index.bin, dv = new DataView(u.buffer, u.byteOffset + rec.offset, rec.length); let p = 0;
  for (const ch of index.meta.chars) { const adv = dv.getUint16(p, true) / 16, x0 = dv.getInt8(p + 2), y0 = dv.getInt8(p + 3), w = dv.getUint8(p + 4), h = dv.getUint8(p + 5); p += 6; const n = (w * h + 7) >> 3; g[ch] = { adv, x0, y0, w, h, at: rec.offset + p }; p += n; }
  glyphCache.size > 400 && glyphCache.clear(); glyphCache.set(rec, g); return g;
}
function composeIndex(rec, text) {
  const G = glyphsOf(rec), u = index.bin, W = text.length * 40 + 80, H = 100, base = 66, cv = new Uint8Array(W * H); let pen = 20, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const ch of text) { const g = G[ch] || G.n; if (!g) continue;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) { const i = y * g.w + x; if (u[g.at + (i >> 3)] >> (i & 7) & 1) { const X = Math.round(pen + g.x0 + x), Y = base + g.y0 + y; if (X >= 0 && X < W && Y >= 0 && Y < H) { cv[Y * W + X] = 1; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; } } }
    pen += g.adv; }
  if (x1 < 0) return null; const bw = x1 - x0 + 1, bh = y1 - y0 + 1, out = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) out.set(cv.subarray((y0 + y) * W + x0, (y0 + y) * W + x0 + bw), y * bw);
  return { w: bw, h: bh, bits: out };
}
const mc = document.createElement('canvas'), mctx = mc.getContext('2d', { willReadFrequently: true });
function composeInstalled(family, weight, text) { // fonts already on this computer are simply drawn
  mctx.font = `${weight} 32px ${SMA.cssFamily(family)}`; const W = Math.ceil(mctx.measureText(text).width) + 60, H = 100; if (W > 6000) return null; mc.width = W; mc.height = H;
  mctx.fillStyle = '#fff'; mctx.fillRect(0, 0, W, H); mctx.fillStyle = '#000'; mctx.font = `${weight} 32px ${SMA.cssFamily(family)}`; mctx.textBaseline = 'alphabetic'; mctx.fillText(text, 20, 66);
  return inkBitmap(mctx.getImageData(0, 0, W, H).data, W, H);
}

// ---------- running a match ----------
const tick = () => new Promise(r => setTimeout(r));
async function run() {
  const text = $('#fm-text').value.replace(/\s+/g, ' ').trim(), st = $('#fm-status');
  if (!pic) { st.textContent = 'Add a picture of the text first.'; return; } if (!text) { st.textContent = 'Type the words that are in the picture.'; return; }
  const k = crop ? full.width / view.width : 1, cx = crop ? Math.round(crop.x * k) : 0, cy = crop ? Math.round(crop.y * k) : 0, cw = crop ? Math.max(4, Math.round(crop.w * k)) : full.width, ch = crop ? Math.max(4, Math.round(crop.h * k)) : full.height;
  const S = inkBitmap(fctx.getImageData(cx, cy, cw, ch).data, cw, ch); if (!S || S.w < 8 || S.h < 6) { st.textContent = 'I could not find text in that picture. Try cropping closer to one line.'; return; }
  const T = target(S); stop = false; results = []; $('#fm-results').textContent = ''; $('#fm-go').hidden = true; $('#fm-stop').hidden = false; const prog = $('#fm-prog'); prog.hidden = false;
  if (!index) { st.textContent = 'Loading the font index…'; const r = await api.index(); index = { meta: r.meta, bin: new Uint8Array(r.bin) }; }
  const fams = SMA_FONTS.families(), installed = [...new Set([...fams.mine, ...fams.system])], list = index.meta.fonts, total = installed.length * 2 + list.length; let done = 0;
  const add = (c) => { results.push(c); };
  for (const name of installed) { if (stop) break; for (const w of [400, 700]) { const b = composeInstalled(name, w, text); add({ kind: fams.mine.includes(name) ? 'mine' : 'installed', family: name, weight: w, score: score(T, b), bits: b }); } done += 2; if (done % 40 === 0) { prog.value = done / total; await tick(); } }
  const keep = new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?\'-:;& ']);
  const usable = [...text].every(c => keep.has(c)); if (!usable) st.textContent = 'The catalogue index covers letters, digits and basic punctuation, so I will skip it for this text.';
  if (usable) for (let i = 0; i < list.length; i++) { if (stop) break; const rec = list[i]; const b = composeIndex(rec, text); add({ kind: 'catalogue', family: rec.family, id: rec.id, weight: rec.weight, license: rec.license, category: rec.category, score: score(T, b), bits: b }); done++; if (i % 60 === 0) { prog.value = done / total; await tick(); } }
  prog.hidden = true; $('#fm-go').hidden = false; $('#fm-stop').hidden = true; show(S); st.textContent = stop ? 'Stopped. Here is what I had.' : '';
}
function show(S) {
  const best = new Map(); results.forEach(r => { const key = r.kind + ':' + r.family; if (!best.has(key) || r.score > best.get(key).score) best.set(key, r); });
  const top = [...best.values()].sort((a, b) => b.score - a.score).slice(0, 10), box = $('#fm-results'); box.textContent = '';
  if (!top.length) { box.append(el('p', { className: 'hint' }, 'No matches.')); return; }
  if (top[0].score < 0.5) box.append(el('p', { className: 'hint' }, 'Nothing here is a close match. The font may be a paid or custom one, or the picture is too small or blurry. These are the nearest I found.'));
  top.forEach(r => box.append(card(r, S)));
}
function preview(b, h) { const c = el('canvas'); if (!b) return c; const s = h / b.h; c.width = Math.max(1, Math.round(b.w * s)); c.height = h; const x = c.getContext('2d'), img = x.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) { const v = b.bits[Math.min(b.h - 1, Math.floor(y / s)) * b.w + Math.min(b.w - 1, Math.floor(X / s))] ? 20 : 245, o = (y * c.width + X) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255; } x.putImageData(img, 0, 0); c.className = 'fm-pv'; return c; }
function card(r, S) {
  const c = el('div', { className: 'fm-card' }), head = el('div', { className: 'fm-head' }), title = el('b', {}, r.family);
  const where = { installed: 'Installed on this computer', mine: 'One of your added fonts', catalogue: `Open catalogue · ${r.license || 'open licence'}${r.category ? ' · ' + r.category : ''}` }[r.kind];
  head.append(title, el('span', { className: 'fm-score' }, Math.round(r.score * 100) + '% match')); c.append(head, el('small', {}, where + (r.weight >= 600 ? ' · bold' : '')), preview(r.bits, 40));
  const actions = el('div', { className: 'fm-actions' }), rename = el('input', { value: r.family, title: 'The name it will have in your font list', className: 'fm-rename' });
  const decline = el('button', { title: 'Not this one' }, '✕ Decline'); decline.onclick = () => c.remove();
  if (r.kind !== 'catalogue') { const use = el('button', { className: 'pri' }, 'Use this font'); use.onclick = () => { dlg.close(); onPick && onPick(r.family); }; actions.append(use, decline); }
  else {
    const page = el('button', {}, 'Catalogue page ↗'); page.onclick = () => api.open(`https://fontsource.org/fonts/${r.id}`);
    const get = el('button', { className: 'pri' }, 'Get the real file…'); get.onclick = () => safety(c, r, rename, 'woff');
    actions.append(rename, get, page, decline);
  }
  c.append(actions); return c;
}

// ---------- the checked download ----------
async function safety(card, r, renameBox, format) {
  card.querySelector('.fm-safe')?.remove(); const box = el('div', { className: 'fm-safe' }); card.append(box); box.textContent = 'Looking up the file…';
  let plan; try { plan = await api.plan(r.id, r.weight, format); } catch (e) { box.textContent = 'Could not look it up: ' + clean(e); return; }
  box.textContent = '';
  box.append(el('b', {}, 'Before you download anything'), el('p', {}, `${plan.family} (${plan.license}) · version ${plan.version} · ${plan.format === 'woff' ? 'WOFF, for use in Sudo Make Art' : 'TrueType, for other programs'}`),
    el('p', { className: 'fm-url' }, plan.url), el('p', { className: 'hint' }, plan.size ? `Size ${(plan.size / 1024).toFixed(0)} KB. The catalogue publishes this file's SHA-256: ${plan.publishedHashHex.slice(0, 16)}…` : 'This format has no published hash, so use the VirusTotal check and compare the SHA-256 shown after the download.'));
  const vt = el('button', {}, 'Check this file on VirusTotal ↗'); vt.onclick = () => api.open(plan.virusTotal);
  const go = el('button', { className: 'pri' }, 'Download and check it'), cancel = el('button', {}, 'Cancel'); cancel.onclick = () => box.remove();
  const alt = el('button', {}, format === 'woff' ? 'I need a .ttf instead' : 'Use the WOFF instead'); alt.onclick = () => safety(card, r, renameBox, format === 'woff' ? 'ttf' : 'woff');
  box.append(el('div', { className: 'fm-actions' }, ''), el('p', { className: 'hint' }, 'VirusTotal checks the public file at that address. Nothing of yours is sent. The app downloads only after you click the blue button, and only from the open font catalogue.')); box.lastChild.previousSibling.append(vt, go, alt, cancel);
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'Downloading…'; let res;
    try { res = await api.download(r.id, r.weight, format); } catch (e) { box.append(el('p', { className: 'fm-bad' }, '✗ ' + clean(e))); go.textContent = 'Try again'; go.disabled = false; return; }
    const checks = [...res.checks]; const bytes = res.data;
    try { const face = new FontFace('sma-check-' + Math.random().toString(36).slice(2), bytes); await face.load(); checks.push('The browser\'s own font safety filter accepted the file'); }
    catch (e) { box.textContent = ''; box.append(el('p', { className: 'fm-bad' }, '✗ The browser\'s font safety filter rejected this file, so it was discarded and nothing was added.')); return; }
    box.textContent = ''; box.append(el('b', {}, 'Checks passed'), ...checks.map(t => el('div', { className: 'fm-ok' }, '✓ ' + t)), el('p', { className: 'hint' }, 'SHA-256: ' + res.sha256));
    const name = () => (renameBox.value.trim() || res.family).replace(/["'\\;{}<>]/g, ''), blob = new Blob([bytes], { type: res.format === 'woff' ? 'font/woff' : 'font/ttf' });
    const add = el('button', { className: 'pri' }, 'Add to my fonts and use it'), save = el('button', {}, 'Save a copy…');
    save.onclick = () => SMA.download(`${name()}.${res.format}`, blob);
    add.onclick = async () => { add.disabled = true; const fam = name(); SMA.addFiles([new File([blob], `${fam}.${res.format}`, { type: blob.type })], { fontName: fam });
      for (let i = 0; i < 40 && !SMA_FONTS.families().mine.includes(fam); i++) await tick(); await new Promise(r => setTimeout(r, 150)); dlg.close(); onPick && onPick(fam); };
    box.append(el('div', { className: 'fm-actions' }, ''), el('p', { className: 'hint' }, `${res.license} licence. You can rename it above before adding.`)); box.lastChild.previousSibling.append(add, save);
  };
}
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------- opening the dialog ----------
$('#fm-close').onclick = () => dlg.close(); $('#fm-go').onclick = run; $('#fm-stop').onclick = () => { stop = true; };
window.SMA_FONTMATCH = { open(cb) { onPick = cb; dlg.showModal(); } };
})();
