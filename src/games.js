// Sudo Make Games: the editor around the game engine (src/gameengine.js). Original code for this project.
// Tiles come from Sudo Make Tiles, characters from Sudo Make Pixels and music from Sudo Make Music; they are copied into the game,
// so a game stays whole on its own. Games are saved in a plain, versioned 'sudo-make-games' JSON format.
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA, E = window.SMA_game, C = window.SMA_chip;
if (!SMA || !E || !$('#gamesview')) return;
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clampi = (v, lo, hi) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; };
const PALETTES = { green: ['#e0f8d0', '#88c070', '#346856', '#081820'], grey: ['#ffffff', '#aaaaaa', '#555555', '#000000'], sepia: ['#f0e6c8', '#c9a66b', '#7a5230', '#2a1a0a'], ice: ['#f0fbff', '#9fd4ee', '#3f7fb5', '#0c1f3d'] };
const ROLE_NAMES = { player: 'Player start', enemy: 'Enemy', coin: 'Coin', goal: 'Goal flag', npc: 'Character to talk to' };

let game = E.decode(E.newGame()), li = 0, tileSel = 1, tool = 'paint', entSel = null, zoom = 4, pid = null, name = game.name, assets = null;
const lvl = () => game.levels[li];

// ----- saving form <-> editing form -----
function encode(g) { return { app: 'sudo-make-games', kind: 'game', v: 1, name, type: g.type, lives: g.lives, palette: g.palette, titleText: g.titleText, winText: g.winText, tiles: g.tiles.map(E.b64), flags: g.flags.slice(), sprites: g.sprites.map(s => ({ name: s.name, w: s.w, h: s.h, fps: s.fps, frames: s.frames.map(E.b64) })), song: g.song, levels: g.levels.map(l => ({ name: l.name, w: l.w, h: l.h, cells: Array.from(l.cells), ents: l.ents })) }; }
const serialize = () => JSON.stringify(encode(game));
function validate(o) {
  const bad = () => { throw new Error('Damaged game file'); };
  if (!o || o.app !== 'sudo-make-games' || o.v !== 1) throw new Error('Not a Sudo Make Games file');
  if (!Array.isArray(o.palette) || o.palette.length !== 4 || o.palette.some(c => !/^#[0-9a-f]{6}$/i.test(c))) bad();
  if (!Array.isArray(o.tiles) || !o.tiles.length || o.tiles.length > 256) bad(); for (const t of o.tiles) { const a = E.un64(String(t)); if (a.length !== 64 || a.some(v => v > 3)) bad(); }
  if (!Array.isArray(o.flags) || o.flags.some(f => ![0, 1, 2].includes(f))) bad();
  for (const s of o.sprites || []) { if (!(s.w >= 1 && s.w <= 32 && s.h >= 1 && s.h <= 32) || !Array.isArray(s.frames) || !s.frames.length || s.frames.length > 16) bad(); for (const f of s.frames) { const a = E.un64(String(f)); if (a.length !== s.w * s.h || a.some(v => v > 3 && v !== 255)) bad(); } }
  if (!Array.isArray(o.levels) || !o.levels.length || o.levels.length > 32) bad();
  for (const l of o.levels) { if (!(l.w >= 10 && l.w <= 128 && l.h >= 9 && l.h <= 128) || !Array.isArray(l.cells) || l.cells.length !== l.w * l.h || l.cells.some(c => !Number.isInteger(c) || c < -1 || c >= o.tiles.length) || !Array.isArray(l.ents) || l.ents.length > 500) bad();
    for (const e of l.ents) { if (!ROLE_NAMES[e.t] || !Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.y < 0 || e.x >= l.w || e.y >= l.h) bad(); if (e.spr !== undefined && !(Number.isInteger(e.spr) && e.spr >= -1 && e.spr < (o.sprites || []).length)) bad(); if (e.text !== undefined && String(e.text).length > 400) bad(); } }
  if (o.song !== null && o.song !== undefined && (typeof o.song !== 'string' || o.song.length > 4e6)) bad();
  return o;
}

// ----- history -----
const undoS = [], redoS = [];
function remember(before) { undoS.push(before !== undefined ? before : serialize()); if (undoS.length > 100) undoS.shift(); redoS.length = 0; document.dispatchEvent(new Event('sma-edit')); }
function adopt(json) { game = E.decode(JSON.parse(json)); name = JSON.parse(json).name || name; li = Math.min(li, game.levels.length - 1); tileSel = Math.min(tileSel, game.tiles.length - 1); entSel = null; refreshAll(); }
function undo() { const s = undoS.pop(); if (s === undefined) return; redoS.push(serialize()); adopt(s); document.dispatchEvent(new Event('sma-edit')); }
function redo() { const s = redoS.pop(); if (s === undefined) return; undoS.push(serialize()); adopt(s); document.dispatchEvent(new Event('sma-edit')); }
$('#gm-undo').onclick = undo; $('#gm-redo').onclick = redo;
const edit = fn => { const before = serialize(); fn(); remember(before); refreshAll(); };

// ----- drawing the level -----
const cv = $('#gm-cv'), status = $('#gm-status');
function rebuildAssets() { assets = E.buildAssets(game, () => document.createElement('canvas')); }
function entImage(e) { const s = e.spr >= 0 && assets.sprites[e.spr] ? assets.sprites[e.spr] : assets.defaults[e.t]; return s.frames[0]; }
function renderLevel() {
  const l = lvl(), W = l.w * 8, H = l.h * 8; cv.width = W; cv.height = H; cv.style.width = W * zoom + 'px'; cv.style.height = H * zoom + 'px'; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = game.palette[0]; x.fillRect(0, 0, W, H);
  for (let ty = 0; ty < l.h; ty++) for (let tx = 0; tx < l.w; tx++) { const c = l.cells[ty * l.w + tx]; if (c >= 0) { x.drawImage(assets.tiles[c], tx * 8, ty * 8); if (game.flags[c] === 2) { x.fillStyle = 'rgba(255,0,0,.25)'; x.fillRect(tx * 8, ty * 8, 8, 8); } } }
  for (const e of l.ents) { const im = entImage(e), px = e.x * 8, py = e.y * 8 + 8 - im.height; x.drawImage(im, px, py); if (e === entSel) { x.strokeStyle = '#ff3b6b'; x.lineWidth = 1; x.strokeRect(px + .5, py + .5, im.width - 1, im.height - 1); } else if (e.t === 'player') { x.strokeStyle = 'rgba(139,92,246,.9)'; x.lineWidth = 1; x.strokeRect(px + .5, py + .5, im.width - 1, im.height - 1); } }
  x.strokeStyle = 'rgba(128,128,128,.25)'; x.lineWidth = 0.5 / Math.max(1, zoom / 4); x.beginPath(); for (let i = 1; i < l.w; i++) { x.moveTo(i * 8, 0); x.lineTo(i * 8, H); } for (let j = 1; j < l.h; j++) { x.moveTo(0, j * 8); x.lineTo(W, j * 8); } x.stroke();
  $('#gm-zoom').textContent = zoom + '×';
}
const cellAt = e => { const r = cv.getBoundingClientRect(), l = lvl(); return [Math.floor((e.clientX - r.left) / (r.width / l.w)), Math.floor((e.clientY - r.top) / (r.height / l.h))]; };
const inLevel = (x, y) => x >= 0 && y >= 0 && x < lvl().w && y < lvl().h;
const entAt = (x, y) => { const l = lvl(); for (let i = l.ents.length - 1; i >= 0; i--) { const e = l.ents[i], im = entImage(e); if (x >= e.x && x < e.x + Math.max(1, Math.ceil(im.width / 8)) && y <= e.y && y > e.y - Math.max(1, Math.ceil(im.height / 8))) return e; } return null; };
function fillCells(x, y, to) { const l = lvl(), from = l.cells[y * l.w + x]; if (from === to) return; const st = [[x, y]]; while (st.length) { const [px, py] = st.pop(); if (px < 0 || py < 0 || px >= l.w || py >= l.h || l.cells[py * l.w + px] !== from) continue; l.cells[py * l.w + px] = to; st.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]); } }

// ----- tools -----
const TOOLS = [['paint', '▦ Paint'], ['erase', '⌫ Erase'], ['fill', '▤ Fill'], ['select', '☝ Select'], ['player', 'Player'], ['enemy', 'Enemy'], ['coin', 'Coin'], ['goal', 'Goal'], ['npc', 'Character']];
TOOLS.forEach(([id, t]) => { const b = el('button', { type: 'button' }, t); b.dataset.t = id; b.onclick = () => { tool = id; markTools(); }; $('#gm-tools').append(b); });
const markTools = () => document.querySelectorAll('#gm-tools button').forEach(b => b.classList.toggle('on', b.dataset.t === tool));
let stroke = null;
const board = $('#gm-board');
board.addEventListener('contextmenu', e => e.preventDefault());
board.addEventListener('pointerdown', e => {
  if (e.button > 2) return; try { board.setPointerCapture(e.pointerId); } catch (err) {} const [x, y] = cellAt(e); if (!inLevel(x, y)) return; const l = lvl(), before = serialize(); stroke = { before, dirty: false, drag: null };
  const right = e.button === 2;
  if (right) { const hit = entAt(x, y); if (hit) { l.ents.splice(l.ents.indexOf(hit), 1); if (entSel === hit) entSel = null; stroke.dirty = true; showEnt(); } else { if (l.cells[y * l.w + x] !== -1) { l.cells[y * l.w + x] = -1; stroke.dirty = true; } stroke.erase = true; } }
  else if (tool === 'paint') { if (l.cells[y * l.w + x] !== tileSel) { l.cells[y * l.w + x] = tileSel; stroke.dirty = true; } }
  else if (tool === 'erase') { if (l.cells[y * l.w + x] !== -1) { l.cells[y * l.w + x] = -1; stroke.dirty = true; } }
  else if (tool === 'fill') { fillCells(x, y, tileSel); stroke.dirty = true; }
  else if (tool === 'select') { entSel = entAt(x, y); if (entSel) stroke.drag = entSel; showEnt(); }
  else { // placing something
    const same = l.ents.find(en => en.t === tool && en.x === x && en.y === y);
    if (same) { entSel = same; stroke.drag = same; } else { if (tool === 'player') l.ents = l.ents.filter(en => en.t !== 'player'); const en = { t: tool, x, y, spr: -1 }; if (tool === 'enemy') { en.axis = 'h'; en.speed = 0.5; } if (tool === 'npc') en.text = 'HELLO!'; l.ents.push(en); entSel = en; stroke.dirty = true; stroke.drag = en; }
    showEnt();
  }
  renderLevel();
});
board.addEventListener('pointermove', e => {
  const [x, y] = cellAt(e); status.textContent = inLevel(x, y) ? `${x}, ${y}` : ''; if (!stroke || !inLevel(x, y)) return; const l = lvl();
  if (stroke.drag) { if (stroke.drag.x !== x || stroke.drag.y !== y) { stroke.drag.x = x; stroke.drag.y = y; stroke.dirty = true; renderLevel(); } return; }
  if (stroke.erase || tool === 'erase') { if (l.cells[y * l.w + x] !== -1) { l.cells[y * l.w + x] = -1; stroke.dirty = true; renderLevel(); } } else if (tool === 'paint' && l.cells[y * l.w + x] !== tileSel) { l.cells[y * l.w + x] = tileSel; stroke.dirty = true; renderLevel(); }
});
const endStroke = () => { if (stroke && stroke.dirty) { remember(stroke.before); renderLevel(); } stroke = null; };
board.addEventListener('pointerup', endStroke); board.addEventListener('pointercancel', endStroke);
$('#gm-zin').onclick = () => { zoom = clampi(zoom + 1, 1, 12); renderLevel(); }; $('#gm-zout').onclick = () => { zoom = clampi(zoom - 1, 1, 12); renderLevel(); };

// ----- the selected thing -----
function showEnt() {
  const box = $('#gm-ent'); box.textContent = ''; const e = entSel; if (!e) { box.className = 'hint'; box.textContent = 'Click something in the level with the Select tool.'; return; } box.className = '';
  box.append(el('b', {}, ROLE_NAMES[e.t] + `  (${e.x}, ${e.y})`));
  const sl = el('label', {}, 'Looks like '), sel = el('select'); sel.append(el('option', { value: -1 }, 'Built-in picture')); game.sprites.forEach((s, i) => sel.append(el('option', { value: i }, s.name))); sel.value = e.spr === undefined ? -1 : e.spr; sel.onchange = () => edit(() => { e.spr = +sel.value; }); sl.append(sel); box.append(sl);
  if (e.t === 'enemy') { const a = el('label', {}, 'Walks '), as = el('select'); [['h', 'left and right'], ['v', 'up and down']].forEach(([v, t]) => as.append(el('option', { value: v }, t))); as.value = e.axis || 'h'; as.onchange = () => edit(() => { e.axis = as.value; }); a.append(as);
    const sp = el('label', {}, 'Speed '), r = el('input', { type: 'range', min: 2, max: 20, value: Math.round((e.speed || 0.5) * 10) }); r.onchange = () => edit(() => { e.speed = +r.value / 10; }); sp.append(r); box.append(a, sp); }
  if (e.t === 'npc') { const t = el('label', {}, 'They say '), ta = el('textarea', { maxLength: 400, value: e.text || '' }); ta.onchange = () => edit(() => { e.text = ta.value; }); t.append(ta); box.append(t); }
  const del = el('button', { type: 'button' }, 'Delete this'); del.onclick = () => edit(() => { lvl().ents.splice(lvl().ents.indexOf(e), 1); entSel = null; }); box.append(del);
}

// ----- tiles, characters, music panels -----
function renderTiles() {
  const box = $('#gm-tiles'); box.textContent = '';
  game.tiles.forEach((_, i) => { const b = el('button', { type: 'button', className: 'gmt' + (i === tileSel ? ' on' : ''), title: 'Tile ' + i }), c = el('canvas'); c.width = 8; c.height = 8; c.style.width = c.style.height = '24px'; c.getContext('2d').drawImage(assets.tiles[i], 0, 0); b.append(c); b.onclick = () => { tileSel = i; tool = ['paint', 'fill'].includes(tool) ? tool : 'paint'; renderTiles(); markTools(); }; box.append(b); });
  document.querySelectorAll('input[name=gmflag]').forEach(r => { r.checked = +r.value === (game.flags[tileSel] || 0); });
}
document.querySelectorAll('input[name=gmflag]').forEach(r => { r.onchange = () => edit(() => { game.flags[tileSel] = +r.value; }); });
function renderSprites() {
  const box = $('#gm-sprites'); box.textContent = ''; if (!game.sprites.length) box.append(el('div', { className: 'hint' }, 'No imported characters yet: the built-in pictures are used.'));
  game.sprites.forEach((s, i) => { const row = el('div', { className: 'gms' }), c = el('canvas'); const im = assets.sprites[i].frames[0]; c.width = im.width; c.height = im.height; c.style.width = Math.min(48, im.width * 2) + 'px'; c.getContext('2d').drawImage(im, 0, 0); const x = el('button', { type: 'button', title: 'Remove' }, '✕'); x.onclick = () => edit(() => { game.sprites.splice(i, 1); for (const l of game.levels) for (const e of l.ents) { if (e.spr === i) e.spr = -1; else if (e.spr > i) e.spr--; } }); row.append(c, el('span', {}, `${s.name} (${s.w}×${s.h}${s.frames.length > 1 ? ', ' + s.frames.length + ' frames' : ''})`), x); box.append(row); });
}
function renderMusic() { let t = 'No music yet.'; if (game.song) { try { t = 'Music: ' + JSON.parse(game.song).name; } catch (e) { t = 'Music: (unreadable)'; } } $('#gm-music').textContent = t; }

// ----- importing from the other modes -----
const dlg = $('#gm-opendlg');
async function pick(type, title, onPick, opt) {
  $('#gm-picktitle').textContent = title; const box = $('#gm-openlist'); box.textContent = 'Loading…'; $('#gm-pickopt').hidden = !opt; if (opt) { $('#gm-picktxt').textContent = opt; $('#gm-pickchk').checked = true; } dlg.showModal();
  let items = []; try { items = (await SMA.store.list()).filter(i => i.type === type); } catch (e) {} box.textContent = ''; if (!items.length) box.append(el('p', { className: 'hint' }, 'Nothing saved there yet. Make one in the matching mode first.'));
  items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled')); b.onclick = async () => { try { const r = await SMA.store.get(i.id); if (r) await onPick(r, i, $('#gm-pickchk').checked); dlg.close(); } catch (err) { box.textContent = ''; box.append(el('p', { className: 'mh-bad' }, String(err.message || err))); } }; box.append(b); });
}
$('#gm-opencancel').onclick = e => { e.preventDefault(); dlg.close(); };
$('#gm-imptiles').onclick = () => pick('tiles', 'Import a tileset', (r, item, useMap) => {
  const o = JSON.parse(r.data); if (o.app !== 'sudo-make-tiles' || o.v !== 1) throw new Error('That is not a tileset file.'); if (o.mode !== 'gb' || o.tileSize !== 8) throw new Error('Games use Game Boy tilesets with 8×8 tiles. Make a new tileset in Game Boy mode.'); if (o.tiles.length > 256) throw new Error('A Game Boy game can use at most 256 tiles.');
  const tiles = o.tiles.map(t => E.un64(t)); if (tiles.some(t => t.length !== 64 || t.some(v => v > 3))) throw new Error('That tileset file is damaged.');
  edit(() => { game.tiles = tiles; game.flags = tiles.map((t, i) => (i === 0 || t.every(v => v === 0) ? 0 : 1)); if (Array.isArray(o.palette) && o.palette.length === 4) game.palette = o.palette.slice(); for (const l of game.levels) for (let k = 0; k < l.cells.length; k++) if (l.cells[k] >= tiles.length) l.cells[k] = -1;
    if (useMap && o.map && o.map.cells.length === o.map.width * o.map.height && o.map.width >= 10 && o.map.height >= 9 && o.map.width <= 128 && o.map.height <= 128) { const cells = Int16Array.from(o.map.cells).map(c => (c >= tiles.length ? -1 : c)); game.levels.push({ name: 'From ' + (item.name || 'tileset'), w: o.map.width, h: o.map.height, cells, ents: [{ t: 'player', x: 1, y: 1, spr: -1 }] }); li = game.levels.length - 1; }
    tileSel = Math.min(tileSel, tiles.length - 1); }); }, 'Also add its map as a new level');
function compose(o, f) { const w = o.width, h = o.height, out = new Float32Array(w * h * 4); o.layers.forEach((L, k) => { if (!L.visible) return; const bin = atob(o.frames[f].cels[k]), op = L.opacity / 100; for (let p = 0; p < w * h; p++) { const sa = bin.charCodeAt(p * 4 + 3) / 255 * op; if (!sa) continue; const da = out[p * 4 + 3], oa = sa + da * (1 - sa); for (let c = 0; c < 3; c++) out[p * 4 + c] = (bin.charCodeAt(p * 4 + c) * sa + out[p * 4 + c] * da * (1 - sa)) / oa; out[p * 4 + 3] = oa; } }); return out; }
$('#gm-impsprite').onclick = () => pick('pixel', 'Import a character', (r, item) => {
  const o = JSON.parse(r.data); if (o.app !== 'sudo-make-pixels' || o.v !== 1) throw new Error('That is not a Pixels sprite.'); if (o.width > 32 || o.height > 32) throw new Error('Characters can be at most 32×32 pixels.'); if (o.frames.length > 16) throw new Error('Characters can have at most 16 frames.');
  const frames = o.frames.map((_, f) => { const px = compose(o, f), a = new Uint8Array(o.width * o.height); for (let i = 0; i < a.length; i++) { if (px[i * 4 + 3] < 0.5) { a[i] = 255; continue; } const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; a[i] = 3 - Math.min(3, Math.floor(lum / 64)); } return a; });
  edit(() => { game.sprites.push({ name: String(o.name || item.name || 'Character').slice(0, 24), w: o.width, h: o.height, fps: clampi(o.fps, 1, 60), frames }); }); });
$('#gm-impsong').onclick = () => pick('music', 'Import a song', r => { if (SMA.music && false) return; const song = window.SMA_music.parse(r.data); void song; edit(() => { game.song = r.data; }); });
$('#gm-rmsong').onclick = () => edit(() => { game.song = null; });

// ----- levels -----
function renderLevelBar() {
  const s = $('#gm-level'); s.textContent = ''; game.levels.forEach((l, i) => s.append(el('option', { value: i }, `${i + 1}. ${l.name}`))); s.value = li; $('#gm-lname').value = lvl().name; $('#gm-lw').value = lvl().w; $('#gm-lh').value = lvl().h;
}
$('#gm-level').onchange = e => { li = +e.target.value; entSel = null; refreshAll(); };
$('#gm-lname').onchange = e => edit(() => { lvl().name = e.target.value.slice(0, 40) || 'Level'; });
$('#gm-ladd').onclick = () => edit(() => { if (game.levels.length >= 32) return; const w = lvl().w, h = lvl().h, cells = new Int16Array(w * h).fill(-1); game.levels.splice(li + 1, 0, { name: 'Level ' + (game.levels.length + 1), w, h, cells, ents: [{ t: 'player', x: 1, y: 1, spr: -1 }, { t: 'goal', x: w - 2, y: 1, spr: -1 }] }); li++; entSel = null; });
$('#gm-ldup').onclick = () => edit(() => { if (game.levels.length >= 32) return; const l = lvl(); game.levels.splice(li + 1, 0, { name: l.name + ' copy', w: l.w, h: l.h, cells: new Int16Array(l.cells), ents: JSON.parse(JSON.stringify(l.ents)) }); li++; entSel = null; });
$('#gm-ldel').onclick = () => { if (game.levels.length < 2) return; edit(() => { game.levels.splice(li, 1); li = Math.min(li, game.levels.length - 1); entSel = null; }); };
$('#gm-lresize').onclick = () => edit(() => { const l = lvl(), w = clampi($('#gm-lw').value, 10, 128), h = clampi($('#gm-lh').value, 9, 128), cells = new Int16Array(w * h).fill(-1); for (let y = 0; y < Math.min(h, l.h); y++) for (let x = 0; x < Math.min(w, l.w); x++) cells[y * w + x] = l.cells[y * l.w + x]; l.ents = l.ents.filter(e => e.x < w && e.y < h); entSel = null; l.w = w; l.h = h; l.cells = cells; });

// ----- game settings -----
for (let n = 1; n <= 9; n++) $('#gm-lives').append(el('option', { value: n }, String(n)));
$('#gm-type').onchange = e => edit(() => { game.type = e.target.value; }); $('#gm-lives').onchange = e => edit(() => { game.lives = +e.target.value; });
$('#gm-pal').onchange = e => edit(() => { game.palette = PALETTES[e.target.value].slice(); });
$('#gm-title').onchange = e => edit(() => { game.titleText = e.target.value.slice(0, 60); }); $('#gm-win').onchange = e => edit(() => { game.winText = e.target.value.slice(0, 60); });
$('#gm-name').oninput = e => { name = e.target.value || 'Untitled game'; game.name = name; document.dispatchEvent(new Event('sma-edit')); };
function renderSettings() { $('#gm-type').value = game.type; $('#gm-lives').value = game.lives; const k = Object.keys(PALETTES).find(p => PALETTES[p].join() === game.palette.join()); $('#gm-pal').value = k || 'green'; $('#gm-title').value = game.titleText; $('#gm-win').value = game.winText; $('#gm-name').value = name; }
function refreshAll() { rebuildAssets(); renderLevelBar(); renderTiles(); renderSprites(); renderMusic(); renderSettings(); renderLevel(); showEnt(); markTools(); }

// ----- sound effects and music for playing (made with the same sound engine as Sudo Make Music) -----
const SFX = { jump: [[0, 'G-4', 5, '1', 0x30]], coin: [[0, 'B-5', 5], [1, 'E-6', 5]], hurt: [[0, 'C-5', 2, '2', 0x40], [0, 'C-4', 1, null, 0, 3]], talk: [[0, 'A-5', 5]], start: [[0, 'C-5', 5], [1, 'G-5', 5]], goal: [[0, 'E-5', 5], [1, 'G-5', 5], [2, 'C-6', 5]], next: [[0, 'E-5', 5], [1, 'G-5', 5], [2, 'C-6', 5]], win: [[0, 'C-5', 5], [1, 'E-5', 5], [2, 'G-5', 5], [3, 'C-6', 5]], gameover: [[0, 'G-4', 5], [1, 'E-4', 5], [2, 'C-4', 5], [3, 'G-3', 5]] };
function sfxRender(n) {
  const s = C.newSong(), p = C.newPattern(8); s.patterns = [p]; s.order = [0]; s.speed = 3;
  for (const [row, note, inst, fx, fp, chan] of SFX[n]) { const ch = chan === 3 ? 3 : 0, i = C.cellIndex(row, ch, 0); p.data[i] = C.parseNote(note) + 1; p.data[i + 1] = inst + 1; if (fx) { p.data[i + 3] = fx.charCodeAt(0); p.data[i + 4] = fp; } }
  return C.render(s);
}
function savedAudio(saved) { // rendered sounds for this game: {sfx: {name: render}, music: render|null}
  const out = { sfx: {}, music: null }; for (const n of Object.keys(SFX)) out.sfx[n] = sfxRender(n);
  if (saved.song) { try { out.music = C.render(window.SMA_music.parse(saved.song)); } catch (e) {} } return out;
}
function makeAudio(saved) {
  let ac = null, cur = null; const au = savedAudio(saved), bufs = {}; const ctx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; };
  const toBuf = r => { const b = ctx().createBuffer(2, Math.max(1, r.length), r.sampleRate); b.copyToChannel(r.L, 0); b.copyToChannel(r.R, 1); return b; };
  return { sfx(n) { try { if (!au.sfx[n]) return; const s = ctx().createBufferSource(); s.buffer = bufs[n] || (bufs[n] = toBuf(au.sfx[n])); s.connect(ctx().destination); s.start(); } catch (e) {} },
    music(on) { try { if (cur) { try { cur.stop(); } catch (e) {} cur = null; } if (!on || !au.music) return; const s = ctx().createBufferSource(); s.buffer = bufs.__m || (bufs.__m = toBuf(au.music)); s.loop = true; s.loopStart = au.music.loopStart / au.music.sampleRate; s.loopEnd = au.music.length / au.music.sampleRate; s.connect(ctx().destination); s.start(); cur = s; } catch (e) {} } };
}

// ----- playing inside the app -----
let eng = null;
function problems() { const out = []; game.levels.forEach((l, i) => { if (!l.ents.some(e => e.t === 'goal')) out.push(`Level ${i + 1} has no goal flag, so it cannot be finished.`); if (!l.ents.some(e => e.t === 'player')) out.push(`Level ${i + 1} has no player start.`); }); return out; }
function play(fromLevel) {
  const probs = problems(); status.textContent = probs.length ? 'Heads up: ' + probs.join(' ') : '';
  stopPlay(); const saved = JSON.parse(serialize()); $('#gm-playbox').hidden = false; const c = $('#gm-screen'); eng = E.create(c, saved, makeAudio(saved), { level: fromLevel || 0, skipTitle: false }); eng.start();
}
function stopPlay() { if (eng) { eng.stop(); eng = null; } $('#gm-playbox').hidden = true; }
$('#gm-play').onclick = () => play(0); $('#gm-playlevel').onclick = () => play(li); $('#gm-playclose').onclick = stopPlay;
document.querySelectorAll('#gm-pad button').forEach(b => { const k = b.dataset.k; b.onpointerdown = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) {} eng && eng.press(k, true); }; b.onpointerup = b.onpointercancel = () => eng && eng.press(k, false); });

// ----- exporting -----
function wavB64(r) { const u = C.toWav(r); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const safeName = () => (name || 'game').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'game';
function buildHtml() { // one self-contained page: the engine, the game and its sounds
  const saved = JSON.parse(serialize()), au = savedAudio(saved), audio = { sfx: {}, music: au.music ? { wav: wavB64(au.music), loopStart: au.music.loopStart / au.music.sampleRate } : null }; for (const n of Object.keys(au.sfx)) audio.sfx[n] = wavB64(au.sfx[n]);
  const json = v => JSON.stringify(v).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029'), esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const glue = `
const E=SMAGameEngine(),GAME=${json(saved)},AUDIO=${json(audio)},cv=document.getElementById('c');let ac=null,bufs={},music=null,eng;
const ctx=()=>{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();return ac};
const dec=async b=>{const bin=atob(b),u=new Uint8Array(bin.length);for(let i=0;i<u.length;i++)u[i]=bin.charCodeAt(i);return ctx().decodeAudioData(u.buffer)};
async function load(){try{for(const k of Object.keys(AUDIO.sfx))bufs[k]=await dec(AUDIO.sfx[k]);if(AUDIO.music)bufs.__m=await dec(AUDIO.music.wav)}catch(e){}}
const audio={sfx(n){try{if(!bufs[n])return;const s=ctx().createBufferSource();s.buffer=bufs[n];s.connect(ctx().destination);s.start()}catch(e){}},music(on){try{if(music){try{music.stop()}catch(e){}music=null}if(!on||!bufs.__m)return;const s=ctx().createBufferSource();s.buffer=bufs.__m;s.loop=true;s.loopStart=AUDIO.music.loopStart;s.loopEnd=bufs.__m.duration;s.connect(ctx().destination);s.start();music=s}catch(e){}}};
function fit(){const k=Math.max(1,Math.floor(Math.min(innerWidth/160,(innerHeight-(document.getElementById('pad').offsetHeight||0))/144)));cv.style.width=160*k+'px';cv.style.height=144*k+'px'}
addEventListener('resize',fit);
eng=E.create(cv,GAME,audio,{});fit();
document.querySelectorAll('#pad button').forEach(b=>{const k=b.dataset.k;b.onpointerdown=e=>{e.preventDefault();try{b.setPointerCapture(e.pointerId)}catch(err){}ctx();eng.press(k,true)};b.onpointerup=b.onpointercancel=()=>eng.press(k,false)});
addEventListener('keydown',()=>ctx(),{once:true});addEventListener('pointerdown',()=>ctx(),{once:true});
load().then(()=>{eng.start();fit()});
if(matchMedia('(pointer: fine)').matches&&innerWidth>700)document.getElementById('pad').style.display='none';fit();`;
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><title>${esc(saved.name)}</title>\n<style>html,body{margin:0;height:100%;background:#0c0d12;overflow:hidden;touch-action:none;font-family:system-ui,sans-serif}#w{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}canvas{image-rendering:pixelated;background:#000}#pad{display:flex;gap:26px;align-items:center;color:#fff}#pad button{touch-action:none;user-select:none;background:#32343f;color:#fff;border:1px solid #3a3d4a;border-radius:8px;font-size:16px;width:44px;height:44px}.dp{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(3,44px);gap:2px}.dp button:nth-child(1){grid-area:1/2}.dp button:nth-child(2){grid-area:2/1}.dp button:nth-child(3){grid-area:2/3}.dp button:nth-child(4){grid-area:3/2}.ab{display:flex;gap:10px}.ab button{border-radius:50%;width:54px;height:54px;font-weight:700}#pad .st{width:auto;padding:0 12px;height:34px}</style></head>\n<body><div id="w"><canvas id="c"></canvas><div id="pad"><div class="dp"><button data-k="up">▲</button><button data-k="left">◀</button><button data-k="right">▶</button><button data-k="down">▼</button></div><div class="ab"><button data-k="b">B</button><button data-k="a">A</button></div><button class="st" data-k="start">START</button></div></div>\n<script>\n${E_SRC()}\n${glue}\n</script></body></html>\n`;
}
const E_SRC = () => window.SMAGameEngine.toString();
function download(blob, fname) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
$('#gm-export').onchange = e => { const v = e.target.value; e.target.value = ''; try { if (v === 'html') download(new Blob([buildHtml()], { type: 'text/html' }), safeName() + '.html'); } catch (err) { status.textContent = 'Export failed: ' + err.message; } };

// ----- new / open / hooks -----
$('#gm-new').onclick = () => $('#gm-newdlg').showModal(); $('#gm-newcancel').onclick = e => { e.preventDefault(); $('#gm-newdlg').close(); };
$('#gm-newok').onclick = e => { e.preventDefault(); pid = null; game = E.decode(E.newGame()); name = game.name; li = 0; tileSel = 1; entSel = null; undoS.length = redoS.length = 0; refreshAll(); $('#gm-newdlg').close(); };
$('#gm-open').onclick = () => pick('game', 'Open a game', r => { api.load(r.data); pid = r.id; });
function load(json) { const o = validate(JSON.parse(json)); stopPlay(); game = E.decode(o); name = String(o.name || 'Untitled game').slice(0, 120); li = 0; tileSel = Math.min(1, game.tiles.length - 1); entSel = null; undoS.length = redoS.length = 0; refreshAll(); }
function thumb() { const l = game.levels[0], c = document.createElement('canvas'), w = Math.min(l.w, 20) * 8, h = Math.min(l.h, 18) * 8; c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = game.palette[0]; x.fillRect(0, 0, w, h); x.imageSmoothingEnabled = false; for (let ty = 0; ty < Math.min(l.h, 18); ty++) for (let tx = 0; tx < Math.min(l.w, 20); tx++) { const t = l.cells[ty * l.w + tx]; if (t >= 0) x.drawImage(assets.tiles[t], tx * 8, ty * 8); } return Promise.resolve(c.toDataURL('image/png')); }
const api = { serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => name, setName: n => { name = n; game.name = n; $('#gm-name').value = n; }, load, show() { requestAnimationFrame(renderLevel); }, hide() { stopPlay(); },
  reset() { pid = null; game = E.decode(E.newGame()); name = game.name; li = 0; refreshAll(); }, play, stopPlay, engine: () => eng, buildHtml, problems, game: () => game, info: () => ({ levels: game.levels.length, level: li, tiles: game.tiles.length, sprites: game.sprites.length, song: !!game.song, undo: undoS.length, ents: lvl().ents.length }), cell: (x, y) => lvl().cells[y * lvl().w + x], ents: () => lvl().ents.map(e => ({ ...e })) };
window.SMA_games = api;
refreshAll();
})();
