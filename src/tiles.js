// Sudo Make Tiles: a tileset and tilemap editor (indexed palette, seamless preview, auto-tile generator, Game Boy export).
// Original code for this project. Saved in a plain, versioned JSON format ('sudo-make-tiles') so other modes can use it later.
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA;
if (!SMA || !$('#tilesview')) return;
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clampi = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));
const hex2c = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const T = 255; // the "transparent" colour index (colour mode only)
const PALS = {
  gb: ['#e0f8d0', '#88c070', '#346856', '#081820'], // lightest to darkest: index 0 is Game Boy colour 0
  grey4: ['#ffffff', '#aaaaaa', '#555555', '#000000'],
  color16: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
};

// ---------- the document ----------
// tiles: [Uint8Array n*n of palette indices (or T)], cells: Int16Array (-1 = empty), auto: Int8Array (-1 = painted by hand, else group index)
let doc = blank(8, true, 20, 18), sel = 0, color = 1, tab = 'tile', tool = 'pencil', mtool = 'paint', mzoom = 3, showGrid = true, curGroup = -1, pid = null, name = 'Untitled tileset';
function blank(n, gb, mw, mh) { const pal = (gb ? PALS.gb : PALS.color16).slice(); return { n, gb, palette: pal, tiles: [new Uint8Array(n * n).fill(gb ? 0 : T)], mw, mh, cells: new Int16Array(mw * mh).fill(-1), auto: new Int8Array(mw * mh).fill(-1), groups: [] }; }
const edCv = $('#tl-ed'), seamCv = $('#tl-seam'), mapCv = $('#tl-map'), status = $('#tl-status');
let tileCv = []; // one small canvas per tile, rebuilt when tiles or the palette change

function rgba(i) { return i === T ? [0, 0, 0, 0] : [...hex2c(doc.palette[Math.min(i, doc.palette.length - 1)]), 255]; }
function drawTileTo(cv, t) { const n = doc.n, ctx = cv.getContext('2d'), img = ctx.createImageData(n, n), tile = doc.tiles[t], lut = {}; for (let p = 0; p < n * n; p++) { const v = tile[p], c = lut[v] || (lut[v] = rgba(v)); img.data.set(c, p * 4); } cv.width = n; cv.height = n; ctx.putImageData(img, 0, 0); }
function rebuildTiles() { tileCv = doc.tiles.map((_, i) => { const c = document.createElement('canvas'); drawTileTo(c, i); return c; }); }

// ---------- history (snapshots of the whole document) ----------
const snap = () => ({ n: doc.n, gb: doc.gb, palette: doc.palette.slice(), tiles: doc.tiles.map(t => new Uint8Array(t)), mw: doc.mw, mh: doc.mh, cells: new Int16Array(doc.cells), auto: new Int8Array(doc.auto), groups: JSON.parse(JSON.stringify(doc.groups)), sel, curGroup });
const restore = s => { doc = { n: s.n, gb: s.gb, palette: s.palette.slice(), tiles: s.tiles.map(t => new Uint8Array(t)), mw: s.mw, mh: s.mh, cells: new Int16Array(s.cells), auto: new Int8Array(s.auto), groups: JSON.parse(JSON.stringify(s.groups)) }; sel = Math.min(s.sel, doc.tiles.length - 1); curGroup = Math.min(s.curGroup, doc.groups.length - 1); };
const undoS = [], redoS = [], bytesOf = s => s.tiles.length * s.n * s.n + s.cells.length * 3 + 1024;
function remember(before) { undoS.push(before); let tot = undoS.reduce((a, s) => a + bytesOf(s), 0); while (tot > 48e6 && undoS.length > 1) tot -= bytesOf(undoS.shift()); redoS.length = 0; document.dispatchEvent(new Event('sma-edit')); }
function op(fn) { const before = snap(); fn(); remember(before); refreshAll(); }
function undo() { const s = undoS.pop(); if (!s) return; redoS.push(snap()); restore(s); refreshAll(); document.dispatchEvent(new Event('sma-edit')); }
function redo() { const s = redoS.pop(); if (!s) return; undoS.push(snap()); restore(s); refreshAll(); document.dispatchEvent(new Event('sma-edit')); }
$('#tl-undo').onclick = undo; $('#tl-redo').onclick = redo;

const lineBetween = (x0, y0, x1, y1) => { const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy, x = x0, y = y0; for (;;) { out.push([x, y]); if (x === x1 && y === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } } return out; };

// ---------- the tile editor ----------
let stroke = null;
const edZoom = () => Math.max(4, Math.floor(440 / doc.n));
function renderEditor() {
  const n = doc.n, z = edZoom(); drawTileTo(edCv, sel); edCv.style.width = edCv.style.height = n * z + 'px';
  const g = $('#tl-edgrid'); g.width = g.height = n * z; g.style.width = g.style.height = n * z + 'px'; const c = g.getContext('2d'); c.clearRect(0, 0, g.width, g.height);
  if (showGrid && z >= 6) { c.strokeStyle = 'rgba(128,128,128,.5)'; c.beginPath(); for (let i = 1; i < n; i++) { c.moveTo(i * z + .5, 0); c.lineTo(i * z + .5, n * z); c.moveTo(0, i * z + .5); c.lineTo(n * z, i * z + .5); } c.stroke(); }
  // seamless preview: the tile repeated 3 x 3
  const s = Math.max(1, Math.floor(210 / (n * 3))); seamCv.width = seamCv.height = n * 3; seamCv.style.width = seamCv.style.height = n * 3 * s + 'px'; const sc = seamCv.getContext('2d'); sc.imageSmoothingEnabled = false; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) sc.drawImage(tileCv[sel], x * n, y * n);
}
const pixAt = e => { const r = edCv.getBoundingClientRect(), z = r.width / doc.n; return [Math.floor((e.clientX - r.left) / z), Math.floor((e.clientY - r.top) / z)]; };
function fillTile(t, x, y, v) { const n = doc.n, from = t[y * n + x]; if (from === v) return; const st = [[x, y]]; while (st.length) { const [px, py] = st.pop(); if (px < 0 || py < 0 || px >= n || py >= n || t[py * n + px] !== from) continue; t[py * n + px] = v; st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]); } }
const eraseVal = () => (doc.gb ? 0 : T);
function paintAt(e) {
  const [x, y] = pixAt(e), n = doc.n; status.textContent = x >= 0 && y >= 0 && x < n && y < n ? `${x}, ${y}` : '';
  const t = doc.tiles[sel], v = stroke.erase || tool === 'eraser' ? eraseVal() : color; let changed = false;
  if (tool === 'picker') { if (x >= 0 && y >= 0 && x < n && y < n) { const c = t[y * n + x]; if (c !== T) { color = c; renderPalette(); } } return false; }
  if (tool === 'fill') { if (x < 0 || y < 0 || x >= n || y >= n) return false; fillTile(t, x, y, v); return true; }
  const from = stroke.last || [x, y]; stroke.last = [x, y];
  for (const [px, py] of lineBetween(from[0], from[1], x, y)) if (px >= 0 && py >= 0 && px < n && py < n && t[py * n + px] !== v) { t[py * n + px] = v; changed = true; }
  return changed;
}
edCv.parentElement.addEventListener('contextmenu', e => e.preventDefault());
edCv.parentElement.addEventListener('pointerdown', e => { if (e.button > 2) return; e.currentTarget.setPointerCapture(e.pointerId); stroke = { before: snap(), erase: e.button === 2, dirty: false }; if (paintAt(e)) { stroke.dirty = true; tileChanged(); } if (tool === 'fill' || tool === 'picker') endStroke(); });
edCv.parentElement.addEventListener('pointermove', e => { if (!stroke) { const [x, y] = pixAt(e); status.textContent = x >= 0 && y >= 0 && x < doc.n && y < doc.n ? `${x}, ${y}` : ''; return; } if (paintAt(e)) { stroke.dirty = true; tileChanged(); } });
const endStroke = () => { if (!stroke) return; if (stroke.dirty) { remember(stroke.before); refreshThumb(sel); } stroke = null; };
edCv.parentElement.addEventListener('pointerup', endStroke); edCv.parentElement.addEventListener('pointercancel', endStroke);
function tileChanged() { drawTileTo(tileCv[sel], sel); renderEditor(); if (tab === 'map') renderMap(); }

function transformTile(fn) { op(() => { const n = doc.n, t = doc.tiles[sel], src = new Uint8Array(t); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const [sx, sy] = fn(x, y, n); t[y * n + x] = src[sy * n + sx]; } }); }
$('#tl-fliph').onclick = () => transformTile((x, y, n) => [n - 1 - x, y]); $('#tl-flipv').onclick = () => transformTile((x, y, n) => [x, n - 1 - y]); $('#tl-rot').onclick = () => transformTile((x, y, n) => [y, n - 1 - x]);
$('#tl-shl').onclick = () => transformTile((x, y, n) => [(x + 1) % n, y]); $('#tl-shr').onclick = () => transformTile((x, y, n) => [(x + n - 1) % n, y]); $('#tl-shu').onclick = () => transformTile((x, y, n) => [x, (y + 1) % n]); $('#tl-shd').onclick = () => transformTile((x, y, n) => [x, (y + n - 1) % n]);
$('#tl-clear').onclick = () => op(() => doc.tiles[sel].fill(eraseVal()));

// ---------- the tile list ----------
function refreshThumb(i) { const b = $('#tl-grid').children[i]; if (b) drawThumb(b.querySelector('canvas'), i); }
function drawThumb(c, i) { const s = Math.max(1, Math.floor(40 / doc.n)); drawTileTo(c, i); c.style.width = c.style.height = doc.n * s + 'px'; }
function renderTileList() {
  const box = $('#tl-grid'); box.textContent = '';
  doc.tiles.forEach((_, i) => { const b = el('button', { type: 'button', className: 'tlb' + (i === sel ? ' on' : ''), title: 'Tile ' + i }), c = el('canvas'); drawThumb(c, i); b.append(c, el('small', {}, String(i))); b.onclick = () => { sel = i; renderTileList(); renderEditor(); }; box.append(b); });
  const over = doc.gb && doc.tiles.length > 256; $('#tl-count').textContent = `${doc.tiles.length} tile${doc.tiles.length === 1 ? '' : 's'}` + (over ? ' (Game Boy maps can address 256)' : ''); $('#tl-count').style.color = over ? '#ff8787' : '';
}
function remap(mapping) { // old tile index -> new index (or -1 when the tile is gone)
  for (let i = 0; i < doc.cells.length; i++) { const c = doc.cells[i]; if (c >= 0) { doc.cells[i] = mapping[c]; if (mapping[c] < 0) doc.auto[i] = -1; } }
  doc.groups = doc.groups.map(g => ({ ...g, tiles: g.tiles.map(t => mapping[t]) })).filter(g => g.tiles.every(t => t >= 0)); for (let i = 0; i < doc.auto.length; i++) if (doc.auto[i] >= doc.groups.length) doc.auto[i] = -1; curGroup = Math.min(curGroup, doc.groups.length - 1);
}
$('#tl-add').onclick = () => op(() => { const old = doc.tiles.length; doc.tiles.splice(sel + 1, 0, new Uint8Array(doc.n * doc.n).fill(eraseVal())); remap([...Array(old)].map((_, i) => (i <= sel ? i : i + 1))); sel++; });
$('#tl-dup').onclick = () => op(() => { const old = doc.tiles.length; doc.tiles.splice(sel + 1, 0, new Uint8Array(doc.tiles[sel])); remap([...Array(old)].map((_, i) => (i <= sel ? i : i + 1))); sel++; });
$('#tl-del').onclick = () => { if (doc.tiles.length < 2) return; op(() => { const old = doc.tiles.length, map = [...Array(old)].map((_, i) => (i === sel ? -1 : i > sel ? i - 1 : i)); doc.tiles.splice(sel, 1); remap(map); sel = Math.max(0, sel - 1); }); };
const moveTile = d => { const j = sel + d; if (j < 0 || j >= doc.tiles.length) return; op(() => { [doc.tiles[sel], doc.tiles[j]] = [doc.tiles[j], doc.tiles[sel]]; const map = [...Array(doc.tiles.length)].map((_, i) => i); map[sel] = j; map[j] = sel; remap(map); sel = j; }); };
$('#tl-left').onclick = () => moveTile(-1); $('#tl-right').onclick = () => moveTile(1);

// ---------- palette ----------
function renderPalette() {
  const box = $('#tl-pal'); box.textContent = '';
  if (!doc.gb) { const s = el('button', { type: 'button', className: 'sw tr' + (color === T ? ' on' : ''), title: 'Transparent' }); s.onclick = () => { color = T; renderPalette(); }; box.append(s); }
  doc.palette.forEach((h, i) => { const s = el('button', { type: 'button', className: 'sw' + (i === color ? ' on' : ''), title: 'Colour ' + i + ' ' + h }); s.style.background = h; s.onclick = () => { color = i; renderPalette(); }; box.append(s); });
  const cur = color === T ? '#000000' : doc.palette[color]; $('#tl-color').value = cur; $('#tl-color').disabled = color === T; $('#tl-addcolor').hidden = doc.gb;
  $('#tl-palsel').innerHTML = ''; (doc.gb ? [['', 'Load shades…'], ['gb', 'Handheld green'], ['grey4', 'Greys']] : [['', 'Load palette…'], ['color16', 'Colour 16']]).forEach(([v, t]) => $('#tl-palsel').append(el('option', { value: v }, t)));
}
let palBefore = null;
$('#tl-color').oninput = e => { if (color === T) return; if (!palBefore) palBefore = snap(); doc.palette[color] = e.target.value; rebuildTiles(); renderPalette(); renderEditor(); renderTileList(); if (tab === 'map') renderMap(); };
$('#tl-color').onchange = () => { if (palBefore) { remember(palBefore); palBefore = null; } };
$('#tl-addcolor').onclick = () => { if (doc.palette.length >= 32) return; op(() => { doc.palette.push('#ffffff'); color = doc.palette.length - 1; }); };
$('#tl-palsel').onchange = e => { const v = e.target.value; if (!PALS[v]) return; op(() => { PALS[v].forEach((h, i) => { if (i < doc.palette.length) doc.palette[i] = h; }); }); };

// ---------- the map ----------
function renderMap() {
  const n = doc.n, W = doc.mw * n, H = doc.mh * n; mapCv.width = W; mapCv.height = H; const ctx = mapCv.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, W, H);
  for (let y = 0; y < doc.mh; y++) for (let x = 0; x < doc.mw; x++) { const c = doc.cells[y * doc.mw + x]; if (c >= 0 && tileCv[c]) ctx.drawImage(tileCv[c], x * n, y * n); }
  mapCv.style.width = W * mzoom + 'px'; mapCv.style.height = H * mzoom + 'px';
  const g = $('#tl-mapgrid'); g.width = W * mzoom; g.height = H * mzoom; g.style.width = g.width + 'px'; g.style.height = g.height + 'px'; const c = g.getContext('2d'); c.clearRect(0, 0, g.width, g.height);
  if (showGrid && n * mzoom >= 6) { c.strokeStyle = 'rgba(128,128,128,.45)'; c.beginPath(); for (let x = 1; x < doc.mw; x++) { c.moveTo(x * n * mzoom + .5, 0); c.lineTo(x * n * mzoom + .5, g.height); } for (let y = 1; y < doc.mh; y++) { c.moveTo(0, y * n * mzoom + .5); c.lineTo(g.width, y * n * mzoom + .5); } c.stroke(); }
  $('#tl-mzoom').textContent = mzoom + '×'; $('#tl-mw').value = doc.mw; $('#tl-mh').value = doc.mh;
}
const cellAt = e => { const r = mapCv.getBoundingClientRect(), z = r.width / doc.mw; return [Math.floor((e.clientX - r.left) / z), Math.floor((e.clientY - r.top) / (r.height / doc.mh))]; };
const inMap = (x, y) => x >= 0 && y >= 0 && x < doc.mw && y < doc.mh;
function sameGroup(x, y, g) { return inMap(x, y) && doc.auto[y * doc.mw + x] === g; }
function autoTileAt(x, y) { if (!inMap(x, y)) return; const i = y * doc.mw + x, g = doc.auto[i]; if (g < 0 || !doc.groups[g]) return; const m = (sameGroup(x, y - 1, g) ? 1 : 0) | (sameGroup(x + 1, y, g) ? 2 : 0) | (sameGroup(x, y + 1, g) ? 4 : 0) | (sameGroup(x - 1, y, g) ? 8 : 0); doc.cells[i] = doc.groups[g].tiles[m]; }
function setCell(x, y, tile, group) { if (!inMap(x, y)) return false; const i = y * doc.mw + x; if (doc.cells[i] === tile && doc.auto[i] === group) return false; doc.cells[i] = tile; doc.auto[i] = group; autoTileAt(x, y); for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) autoTileAt(x + dx, y + dy); return true; }
function mapFill(x, y, tile) { if (!inMap(x, y)) return; const from = doc.cells[y * doc.mw + x], fromA = doc.auto[y * doc.mw + x]; if (from === tile && fromA < 0) return; const st = [[x, y]]; while (st.length) { const [px, py] = st.pop(); if (!inMap(px, py)) continue; const i = py * doc.mw + px; if (doc.cells[i] !== from || doc.auto[i] !== fromA) continue; doc.cells[i] = tile; doc.auto[i] = -1; st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]); } }
let mstroke = null;
function mapPaint(e) {
  const [x, y] = cellAt(e); status.textContent = inMap(x, y) ? `cell ${x}, ${y}` + (doc.cells[y * doc.mw + x] >= 0 ? `  ·  tile ${doc.cells[y * doc.mw + x]}` : '') : ''; if (!inMap(x, y)) return false;
  const erase = mstroke.erase || mtool === 'erase';
  if (mtool === 'pick') { const c = doc.cells[y * doc.mw + x]; if (c >= 0) { sel = c; renderTileList(); renderEditor(); } return false; }
  if (mtool === 'fill') { mapFill(x, y, erase ? -1 : sel); return true; }
  if (mtool === 'auto' && !erase && curGroup < 0) { status.textContent = 'Make an auto-tile set first (side panel).'; return false; }
  const from = mstroke.last || [x, y]; mstroke.last = [x, y]; let changed = false;
  for (const [px, py] of lineBetween(from[0], from[1], x, y)) changed = (mtool === 'auto' && !erase ? setCell(px, py, doc.groups[curGroup].tiles[0], curGroup) : setCell(px, py, erase ? -1 : sel, -1)) || changed;
  return changed;
}
const mapWrap = $('#tl-mapscroll');
mapWrap.addEventListener('contextmenu', e => e.preventDefault());
mapWrap.addEventListener('pointerdown', e => { if (e.button > 2) return; mapWrap.setPointerCapture(e.pointerId); mstroke = { before: snap(), erase: e.button === 2, dirty: false }; if (mapPaint(e)) { mstroke.dirty = true; renderMap(); } if (['fill', 'pick'].includes(mtool)) endMap(); });
mapWrap.addEventListener('pointermove', e => { if (!mstroke) { const [x, y] = cellAt(e); status.textContent = inMap(x, y) ? `cell ${x}, ${y}` : ''; return; } if (mapPaint(e)) { mstroke.dirty = true; renderMap(); } });
const endMap = () => { if (!mstroke) return; if (mstroke.dirty) remember(mstroke.before); mstroke = null; };
mapWrap.addEventListener('pointerup', endMap); mapWrap.addEventListener('pointercancel', endMap);
mapWrap.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); mzoom = clampi(mzoom + (e.deltaY < 0 ? 1 : -1), 1, 16); renderMap(); }, { passive: false });
$('#tl-mzin').onclick = () => { mzoom = clampi(mzoom + 1, 1, 16); renderMap(); }; $('#tl-mzout').onclick = () => { mzoom = clampi(mzoom - 1, 1, 16); renderMap(); };
$('#tl-mapresize').onclick = () => op(() => { const w = clampi($('#tl-mw').value, 1, 256), h = clampi($('#tl-mh').value, 1, 256), cells = new Int16Array(w * h).fill(-1), auto = new Int8Array(w * h).fill(-1); for (let y = 0; y < Math.min(h, doc.mh); y++) for (let x = 0; x < Math.min(w, doc.mw); x++) { cells[y * w + x] = doc.cells[y * doc.mw + x]; auto[y * w + x] = doc.auto[y * doc.mw + x]; } doc.mw = w; doc.mh = h; doc.cells = cells; doc.auto = auto; });
$('#tl-mapclear').onclick = () => op(() => { doc.cells.fill(-1); doc.auto.fill(-1); });
$('#tl-gridon').onchange = e => { showGrid = e.target.checked; renderEditor(); renderMap(); };

// ---------- auto-tile sets ----------
function groupSelect() { const s = $('#tl-group'); s.textContent = ''; doc.groups.forEach((g, i) => s.append(el('option', { value: i }, g.name))); if (!doc.groups.length) s.append(el('option', { value: -1 }, 'none yet')); s.value = curGroup; }
$('#tl-group').onchange = e => { curGroup = +e.target.value; };
$('#tl-gen').onclick = () => {
  if (color === T) { status.textContent = 'Pick an edge colour first (not transparent).'; return; }
  op(() => { const n = doc.n, base = doc.tiles[sel], t = Math.max(1, Math.round(n / 8)), first = doc.tiles.length, tiles = [];
    for (let m = 0; m < 16; m++) { const a = new Uint8Array(base); for (let k = 0; k < t; k++) for (let i = 0; i < n; i++) { if (!(m & 1)) a[k * n + i] = color; if (!(m & 4)) a[(n - 1 - k) * n + i] = color; if (!(m & 8)) a[i * n + k] = color; if (!(m & 2)) a[i * n + n - 1 - k] = color; } tiles.push(a); }
    doc.tiles.push(...tiles); doc.groups.push({ name: 'Terrain ' + (doc.groups.length + 1), tiles: [...Array(16)].map((_, i) => first + i) }); curGroup = doc.groups.length - 1; mtool = 'auto'; });
  setTab('map');
};
$('#tl-delgroup').onclick = () => { if (curGroup < 0) return; op(() => { const g = curGroup; for (let i = 0; i < doc.auto.length; i++) { if (doc.auto[i] === g) doc.auto[i] = -1; else if (doc.auto[i] > g) doc.auto[i]--; } doc.groups.splice(g, 1); curGroup = Math.min(curGroup, doc.groups.length - 1); }); };

// ---------- tabs and tools ----------
function setTab(t) { tab = t; $('#tl-tab-tile').classList.toggle('on', t === 'tile'); $('#tl-tab-map').classList.toggle('on', t === 'map'); $('#tl-tileview').hidden = t !== 'tile'; $('#tl-mapview').hidden = t !== 'map'; $('#tl-tools-tile').hidden = t !== 'tile'; $('#tl-tools-map').hidden = t !== 'map'; $('#tl-mapopts').hidden = t !== 'map'; $('#tl-tileopts').hidden = t !== 'tile'; if (t === 'map') renderMap(); else renderEditor(); markTools(); }
function markTools() { document.querySelectorAll('#tl-tools-tile button').forEach(b => b.classList.toggle('on', b.dataset.t === tool)); document.querySelectorAll('#tl-tools-map button').forEach(b => b.classList.toggle('on', b.dataset.t === mtool)); }
document.querySelectorAll('#tl-tools-tile button').forEach(b => { b.onclick = () => { tool = b.dataset.t; markTools(); }; });
document.querySelectorAll('#tl-tools-map button').forEach(b => { b.onclick = () => { mtool = b.dataset.t; markTools(); }; });
$('#tl-tab-tile').onclick = () => setTab('tile'); $('#tl-tab-map').onclick = () => setTab('map');
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('tiles-mode') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; } if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'tab') { e.preventDefault(); setTab(tab === 'tile' ? 'map' : 'tile'); return; }
  const tm = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' }, mm = { b: 'paint', e: 'erase', g: 'fill', i: 'pick', a: 'auto' };
  if (tab === 'tile' && tm[k]) { tool = tm[k]; markTools(); } else if (tab === 'map' && mm[k]) { mtool = mm[k]; markTools(); }
});

// ---------- new / open / import ----------
const newDlg = $('#tl-newdlg'), openDlg = $('#tl-opendlg'), impDlg = $('#tl-impdlg');
function refreshAll() { rebuildTiles(); renderTileList(); renderEditor(); renderPalette(); groupSelect(); renderMap(); $('#tl-info').textContent = `${doc.n}×${doc.n} tiles · ${doc.gb ? 'Game Boy (4 shades)' : 'colour'} · map ${doc.mw}×${doc.mh}`; }
function loadDoc(d, nm) { doc = d; mzoom = clampi(Math.floor(720 / (doc.mw * doc.n)), 1, 16); sel = 0; color = doc.gb ? 1 : 1; curGroup = doc.groups.length - 1; undoS.length = redoS.length = 0; name = nm || 'Untitled tileset'; $('#tl-name').value = name; refreshAll(); }
$('#tl-name').oninput = e => { name = e.target.value || 'Untitled tileset'; document.dispatchEvent(new Event('sma-edit')); };
$('#tl-new').onclick = () => newDlg.showModal();
$('#tl-newgb').onchange = () => { if ($('#tl-newgb').checked) { $('#tl-nsz').value = 8; $('#tl-nmw').value = 20; $('#tl-nmh').value = 18; } };
$('#tl-newok').onclick = e => { e.preventDefault(); const gb = $('#tl-newgb').checked; pid = null; loadDoc(blank(clampi($('#tl-nsz').value, 4, 64), gb, clampi($('#tl-nmw').value, 1, 256), clampi($('#tl-nmh').value, 1, 256))); newDlg.close(); };
$('#tl-newcancel').onclick = e => { e.preventDefault(); newDlg.close(); };
async function listOf(type, box, onPick) { box.textContent = 'Loading…'; let items = []; try { items = (await SMA.store.list()).filter(i => i.type === type); } catch (e) {} box.textContent = ''; if (!items.length) box.append(el('p', { className: 'hint' }, type === 'tiles' ? 'No saved tilesets yet. Everything you make is saved automatically.' : 'No Pixels sprites saved yet. Make one in Sudo Make Pixels first.')); items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled')); b.onclick = () => onPick(i); box.append(b); }); }
$('#tl-open').onclick = () => { openDlg.showModal(); listOf('tiles', $('#tl-openlist'), async i => { const r = await SMA.store.get(i.id); if (r) { api.load(r.data); pid = r.id; } openDlg.close(); }); };
$('#tl-opencancel').onclick = e => { e.preventDefault(); openDlg.close(); };

// Import a Pixels sprite: slice its first frame into tiles that use this tileset's palette.
let impSprite = null;
function spriteFrame(o) { // composite frame 0 of a sudo-make-pixels file to RGBA
  const w = o.width, h = o.height, out = new Float32Array(w * h * 4);
  o.layers.forEach((L, li) => { if (!L.visible) return; const bin = atob(o.frames[0].cels[li]), k = L.opacity / 100; for (let p = 0; p < w * h; p++) { const sa = bin.charCodeAt(p * 4 + 3) / 255 * k; if (!sa) continue; const da = out[p * 4 + 3], oa = sa + da * (1 - sa); for (let c = 0; c < 3; c++) out[p * 4 + c] = (bin.charCodeAt(p * 4 + c) * sa + out[p * 4 + c] * da * (1 - sa)) / oa; out[p * 4 + 3] = oa; } });
  return { w, h, px: out };
}
function nearestIndex(r, g, b, a) {
  if (a < .5) return doc.gb ? 0 : T;
  if (doc.gb) { const lum = 0.299 * r + 0.587 * g + 0.114 * b; return 3 - Math.min(3, Math.floor(lum / 64)); }
  let best = 1e9, bi = 0; doc.palette.forEach((h, i) => { const q = hex2c(h), d = (r - q[0]) ** 2 + (g - q[1]) ** 2 + (b - q[2]) ** 2; if (d < best) { best = d; bi = i; } }); return bi;
}
function importSprite(o, dedupe, placeMap) {
  const f = spriteFrame(o), n = doc.n, cols = Math.ceil(f.w / n), rows = Math.ceil(f.h / n), seen = new Map(), cells = [];
  doc.tiles.forEach((t, i) => { if (!seen.has(t.join())) seen.set(t.join(), i); });
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const t = new Uint8Array(n * n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const sx = tx * n + x, sy = ty * n + y; if (sx >= f.w || sy >= f.h) { t[y * n + x] = doc.gb ? 0 : T; continue; } const p = (sy * f.w + sx) * 4; t[y * n + x] = nearestIndex(f.px[p], f.px[p + 1], f.px[p + 2], f.px[p + 3]); }
    const key = t.join(); let idx = dedupe ? seen.get(key) : undefined; if (idx === undefined) { doc.tiles.push(t); idx = doc.tiles.length - 1; seen.set(key, idx); } cells.push(idx);
  }
  if (placeMap) { doc.mw = Math.min(256, cols); doc.mh = Math.min(256, rows); doc.cells = new Int16Array(doc.mw * doc.mh).fill(-1); doc.auto = new Int8Array(doc.mw * doc.mh).fill(-1); for (let y = 0; y < doc.mh; y++) for (let x = 0; x < doc.mw; x++) doc.cells[y * doc.mw + x] = cells[y * cols + x]; }
  return { tiles: doc.tiles.length, cols, rows };
}
$('#tl-import').onclick = () => { impSprite = null; $('#tl-impgo').disabled = true; impDlg.showModal(); listOf('pixel', $('#tl-implist'), async i => { const r = await SMA.store.get(i.id); try { const o = JSON.parse(r.data); if (o.app !== 'sudo-make-pixels' || o.v !== 1) throw 0; impSprite = o; $('#tl-impgo').disabled = false; $('#tl-impname').textContent = `Selected: ${i.name || 'Untitled'} (${o.width}×${o.height})`; } catch (e) { $('#tl-impname').textContent = 'That file could not be read.'; } }); };
$('#tl-impgo').onclick = e => { e.preventDefault(); if (!impSprite) return; const dd = $('#tl-impdedupe').checked, pm = $('#tl-impmap').checked, o = impSprite; op(() => { const first = doc.tiles.length; const r = importSprite(o, dd, pm); sel = Math.min(first, doc.tiles.length - 1); status.textContent = `Imported: ${r.cols}×${r.rows} tiles cut from the sprite.`; }); impDlg.close(); };
$('#tl-impcancel').onclick = e => { e.preventDefault(); impDlg.close(); };

// ---------- saving: a plain versioned format ----------
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function serialize() { return JSON.stringify({ app: 'sudo-make-tiles', kind: 'tileset', v: 1, name, tileSize: doc.n, mode: doc.gb ? 'gb' : 'color', palette: doc.palette, tiles: doc.tiles.map(b64), map: { width: doc.mw, height: doc.mh, cells: Array.from(doc.cells), auto: Array.from(doc.auto) }, groups: doc.groups }); }
function load(json) {
  const o = JSON.parse(json); if (o.app !== 'sudo-make-tiles' || o.v !== 1) throw new Error('Not a Sudo Make Tiles file');
  const n = clampi(o.tileSize, 4, 64), gb = o.mode === 'gb', palette = (o.palette || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 32); if (!palette.length || (gb && palette.length !== 4)) throw new Error('Damaged tileset file');
  const tiles = o.tiles.map(t => { const a = unb64(t); if (a.length !== n * n || a.some(v => v !== T && v >= palette.length)) throw new Error('Damaged tileset file'); return a; }); if (!tiles.length) throw new Error('Damaged tileset file');
  const mw = clampi(o.map.width, 1, 256), mh = clampi(o.map.height, 1, 256); if (o.map.cells.length !== mw * mh) throw new Error('Damaged tileset file');
  const cells = Int16Array.from(o.map.cells), auto = Int8Array.from(o.map.auto && o.map.auto.length === mw * mh ? o.map.auto : new Array(mw * mh).fill(-1)); if (cells.some(c => c < -1 || c >= tiles.length)) throw new Error('Damaged tileset file');
  const groups = (o.groups || []).filter(g => Array.isArray(g.tiles) && g.tiles.length === 16 && g.tiles.every(t => t >= 0 && t < tiles.length)).map(g => ({ name: String(g.name || 'Terrain').slice(0, 40), tiles: g.tiles.map(Number) })); for (let i = 0; i < auto.length; i++) if (auto[i] >= groups.length) auto[i] = -1;
  loadDoc({ n, gb, palette, tiles, mw, mh, cells, auto, groups }, String(o.name || 'Untitled tileset').slice(0, 120));
}

// ---------- export ----------
function download(blob, fname) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const safeName = () => (name || 'tiles').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'tiles';
const cName = () => safeName().replace(/-/g, '_').replace(/^(\d)/, '_$1').toLowerCase();
const scaleSel = () => clampi($('#tl-scale').value, 1, 32);
const blobOf = c => new Promise(res => c.toBlob(res, 'image/png'));
function sheetCanvas(cols, s) { const n = doc.n, c = document.createElement('canvas'), rows = Math.ceil(doc.tiles.length / cols); c.width = cols * n * s; c.height = rows * n * s; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; tileCv.forEach((t, i) => x.drawImage(t, (i % cols) * n * s, Math.floor(i / cols) * n * s, n * s, n * s)); return c; }
function mapCanvas(s) { const c = document.createElement('canvas'), n = doc.n; c.width = doc.mw * n * s; c.height = doc.mh * n * s; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; for (let y = 0; y < doc.mh; y++) for (let xx = 0; xx < doc.mw; xx++) { const t = doc.cells[y * doc.mw + xx]; if (t >= 0) x.drawImage(tileCv[t], xx * n * s, y * n * s, n * s, n * s); } return c; }
// Game Boy export: each 8x8 tile is 16 bytes, two bits per pixel, a row at a time (low bits byte, then high bits byte, leftmost pixel in bit 7).
function gbSource() {
  if (!doc.gb || doc.n !== 8) throw new Error('Game Boy export needs a Game Boy sprite set with 8×8 tiles.'); if (doc.tiles.length > 256) throw new Error('A Game Boy map can use at most 256 tiles; this set has ' + doc.tiles.length + '.');
  const id = cName(), hex = v => '0x' + v.toString(16).padStart(2, '0'), bytes = [];
  for (const t of doc.tiles) for (let y = 0; y < 8; y++) { let lo = 0, hi = 0; for (let x = 0; x < 8; x++) { const v = t[y * 8 + x] & 3; lo |= (v & 1) << (7 - x); hi |= (v >> 1) << (7 - x); } bytes.push(lo, hi); }
  const lines = a => { const out = []; for (let i = 0; i < a.length; i += 16) out.push('  ' + a.slice(i, i + 16).map(hex).join(', ')); return out.join(',\n'); };
  const map = Array.from(doc.cells, c => (c < 0 ? 0 : c));
  return `// Made with Sudo Make Tiles. Tile data is 2 bits per pixel (Game Boy format), 16 bytes per 8x8 tile.\n// Colour 0 is the lightest shade. Load it with set_bkg_data(0, ${id.toUpperCase()}_TILE_COUNT, ${id}_tiles) and set_bkg_tiles().\n\n#define ${id.toUpperCase()}_TILE_COUNT ${doc.tiles.length}\n#define ${id.toUpperCase()}_MAP_WIDTH ${doc.mw}\n#define ${id.toUpperCase()}_MAP_HEIGHT ${doc.mh}\n\nconst unsigned char ${id}_tiles[] = {\n${lines(bytes)}\n};\n\nconst unsigned char ${id}_map[] = {\n${lines(map)}\n};\n`;
}
$('#tl-export').onchange = async e => { const v = e.target.value; e.target.value = ''; try {
  if (v === 'sheet') download(await blobOf(sheetCanvas(clampi($('#tl-cols').value || 16, 1, 64), scaleSel())), safeName() + '-tileset.png');
  else if (v === 'map') download(await blobOf(mapCanvas(scaleSel())), safeName() + '-map.png');
  else if (v === 'gb') download(new Blob([gbSource()], { type: 'text/plain' }), cName() + '.c');
} catch (err) { status.textContent = 'Export failed: ' + err.message; } };

function thumb() { const used = doc.cells.some(c => c >= 0), src = used ? mapCanvas(1) : sheetCanvas(Math.min(8, doc.tiles.length), 1), k = Math.max(1, Math.min(8, Math.floor(160 / Math.max(src.width, src.height)))), c = document.createElement('canvas'); c.width = src.width * k; c.height = src.height * k; const x = c.getContext('2d'); x.fillStyle = '#2b2d38'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); return Promise.resolve(c.toDataURL('image/png')); }

// ---------- hooks for the rest of the app ----------
const api = {
  serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => name, setName: n => { name = n; $('#tl-name').value = n; }, load,
  show() { requestAnimationFrame(() => { renderEditor(); if (tab === 'map') renderMap(); }); }, hide() {},
  reset() { pid = null; loadDoc(blank(8, true, 20, 18)); },
  gbSource, info: () => ({ n: doc.n, gb: doc.gb, tiles: doc.tiles.length, mw: doc.mw, mh: doc.mh, groups: doc.groups.length, sel, undo: undoS.length }),
  tilePixel: (t, x, y) => doc.tiles[t][y * doc.n + x], cell: (x, y) => doc.cells[y * doc.mw + x], auto: (x, y) => doc.auto[y * doc.mw + x], group: g => doc.groups[g].tiles.slice(),
};
window.SMA_tiles = api;
refreshAll(); setTab('tile');
})();
