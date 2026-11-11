// The game engine behind Sudo Make Games. Original code for this project.
// It plays a game saved in the 'sudo-make-games' format on a 160x144, four-shade screen: a platformer or a top-down game made of
// 8x8 tiles, with a player, patrolling enemies, coins, a goal, talking characters, lives and a score.
// Everything is inside one function (SMAGameEngine), so exported games can carry a copy of its source and play on their own.
// The simulation (createWorld / step) does not touch the browser, so it can be tested on its own; drawing and input are in create().
function SMAGameEngine() {
  'use strict';
  const SW = 160, SH = 144, T = 8, GRAV = 0.22, JUMP = -3.3, MAXFALL = 4, SPEED = 1.2, HURT_FRAMES = 90;

  // ----- a tiny 3x5 pixel font (letters, digits and a little punctuation); each glyph is five rows of three bits -----
  const FONT = { A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 7, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
    0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0], '-': [0, 0, 7, 0, 0], "'": [2, 2, 0, 0, 0], '*': [5, 7, 7, 2, 0] };
  const textWidth = s => s.length * 4 - 1;
  function wrapText(text, cols) { const out = []; let line = ''; for (const w of String(text || '').toUpperCase().split(/\s+/).filter(Boolean)) { let word = w; while (word.length > cols) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, cols)); word = word.slice(cols); } if (!line) line = word; else if ((line + ' ' + word).length <= cols) line += ' ' + word; else { out.push(line); line = word; } } if (line) out.push(line); return out.length ? out : ['']; }

  // ----- built-in art, so a new game works before you import anything (digits are shades, '.' is see-through) -----
  const art = rows => { const w = rows[0].length, h = rows.length, a = new Uint8Array(w * h); rows.forEach((r, y) => [...r].forEach((c, x) => { a[y * w + x] = c === '.' ? 255 : +c; })); return { w, h, a }; };
  const DEFAULT_TILES = [
    ['00000000', '00000000', '00000000', '00000000', '00000000', '00000000', '00000000', '00000000'],
    ['33333333', '22232222', '22232222', '33333333', '22222322', '22222322', '33333333', '22232222'],
    ['12121212', '22222222', '33233233', '23332332', '33333333', '33233333', '33333323', '33333333'],
    ['00000000', '00000000', '00000000', '03000300', '03000300', '33303330', '33333333', '33333333'],
    ['00000000', '00020000', '00222000', '00020000', '00030000', '00030000', '03333300', '00000000'],
  ];
  const DEFAULT_FLAGS = [0, 1, 1, 2, 0]; // 0 empty (walk through), 1 solid, 2 hurts
  const DEFAULT_SPRITES = {
    player: ['..3333..', '.322223.', '.321123.', '.322223.', '..3333..', '.332233.', '.3.33.3.', '..3..3..'],
    enemy: ['........', '..3333..', '.322223.', '32322323', '32222223', '33222233', '.3.33.3.', '3......3'],
    coin: ['..3333..', '.322223.', '32211223', '32121223', '32121223', '32211223', '.322223.', '..3333..'],
    goal: ['.3333...', '.3223...', '.3333...', '.3......', '.3......', '.3......', '.3......', '33333...'],
    npc: ['..3333..', '.333333.', '.322223.', '.321123.', '..2222..', '.332233.', '.322223.', '..3..3..'],
  };

  // ----- loading a saved game -----
  const un64 = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  function decode(g) {
    const tiles = g.tiles.map(un64), flags = tiles.map((_, i) => ((g.flags || [])[i] | 0));
    return { name: String(g.name || 'My game'), type: g.type === 'topdown' ? 'topdown' : 'platformer', lives: Math.max(1, Math.min(9, g.lives | 0 || 3)), palette: g.palette, titleText: String(g.titleText || g.name || 'MY GAME'), winText: String(g.winText || 'YOU WIN!'), tiles, flags,
      sprites: (g.sprites || []).map(s => ({ name: s.name, w: s.w, h: s.h, fps: s.fps || 6, frames: s.frames.map(un64) })),
      levels: g.levels.map(l => ({ name: l.name, w: l.w, h: l.h, cells: Int16Array.from(l.cells), ents: l.ents.map(e => ({ ...e })) })), song: g.song || null };
  }
  function newGame() { // a small ready-to-play game
    const cells = new Array(20 * 18).fill(-1), set = (x, y, t) => { cells[y * 20 + x] = t; };
    for (let x = 0; x < 20; x++) { set(x, 16, 2); set(x, 17, 1); }
    for (let x = 5; x <= 8; x++) set(x, 12, 2); for (let x = 11; x <= 14; x++) set(x, 9, 2); set(9, 15, 3); set(10, 15, 3); set(16, 14, 4); set(3, 15, 4);
    return { app: 'sudo-make-games', kind: 'game', v: 1, name: 'My first game', type: 'platformer', lives: 3, palette: ['#e0f8d0', '#88c070', '#346856', '#081820'], titleText: 'MY FIRST GAME', winText: 'YOU WIN!',
      tiles: DEFAULT_TILES.map(r => b64(art(r).a)), flags: DEFAULT_FLAGS.slice(), sprites: [], song: null,
      levels: [{ name: 'Level 1', w: 20, h: 18, cells, ents: [{ t: 'player', x: 1, y: 15 }, { t: 'npc', x: 4, y: 15, text: 'HELLO! REACH THE FLAG. COLLECT COINS. WATCH OUT FOR SPIKES!' }, { t: 'coin', x: 6, y: 11 }, { t: 'coin', x: 12, y: 8 }, { t: 'coin', x: 17, y: 15 }, { t: 'enemy', x: 14, y: 15, axis: 'h', speed: 0.5 }, { t: 'goal', x: 18, y: 15 }] }] };
  }

  // ----- the simulation -----
  const sizeOf = (game, e) => { const s = e.spr >= 0 && game.sprites[e.spr] ? game.sprites[e.spr] : null; return s ? { w: s.w, h: s.h } : { w: 8, h: 8 }; };
  function makeBody(game, e, role) { const { w, h } = sizeOf(game, e), hw = Math.max(2, w - 2), hh = Math.max(2, h - 1), cellX = e.x * T, cellY = e.y * T + T - h; return { role, spr: e.spr === undefined ? -1 : e.spr, w: hw, h: hh, ox: Math.floor((w - hw) / 2), oy: h - hh, x: cellX + Math.floor((w - hw) / 2), y: cellY + (h - hh), vx: 0, vy: 0, onGround: false, face: 1, dir: 1, axis: e.axis === 'v' ? 'v' : 'h', speed: Math.max(0.1, Math.min(2, +e.speed || 0.5)), text: e.text || '', alive: true, t: e.t }; }
  function loadLevel(world, li) {
    const game = world.game, lvl = game.levels[li]; world.li = li; world.lvl = lvl; world.ents = []; world.player = null; world.spawn = { x: 8, y: 8 };
    for (const e of lvl.ents) {
      if (e.t === 'player') { if (!world.player) { world.player = makeBody(game, e, 'player'); world.spawn = { x: world.player.x, y: world.player.y }; } }
      else world.ents.push(makeBody(game, e, e.t));
    }
    if (!world.player) world.player = makeBody(game, { x: 1, y: 1, spr: -1 }, 'player');
    world.player.inv = 0; world.camX = 0; world.camY = 0; centerCamera(world);
  }
  function createWorld(game, li = 0, skipTitle = false) { const w = { game, state: skipTitle ? 'play' : 'title', score: 0, lives: game.lives, time: 0, events: [], dialog: null, li: 0 }; loadLevel(w, Math.max(0, Math.min(li, game.levels.length - 1))); return w; }
  function tileFlag(world, tx, ty) {
    const lv = world.lvl; if (tx < 0 || tx >= lv.w) return 1; if (ty < 0 || ty >= lv.h) return world.game.type === 'platformer' ? 0 : 1;
    const c = lv.cells[ty * lv.w + tx]; return c < 0 ? 0 : (world.game.flags[c] || 0);
  }
  function rectHas(world, x, y, w, h, flag) { for (let ty = Math.floor(y / T); ty <= Math.floor((y + h - 0.001) / T); ty++) for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 0.001) / T); tx++) if (tileFlag(world, tx, ty) === flag) return true; return false; }
  function moveX(world, b, dx) { // one pixel at a time, snapping to the tile edge on contact; returns true when something blocked the move
    while (Math.abs(dx) > 1e-9) { const s = Math.sign(dx) * Math.min(1, Math.abs(dx)), nx = b.x + s;
      if (rectHas(world, nx, b.y, b.w, b.h, 1)) { b.x = s > 0 ? Math.floor((nx + b.w - 0.001) / T) * T - b.w : (Math.floor(nx / T) + 1) * T; return true; } b.x = nx; dx -= s; } return false; }
  function moveY(world, b, dy) {
    while (Math.abs(dy) > 1e-9) { const s = Math.sign(dy) * Math.min(1, Math.abs(dy)), ny = b.y + s;
      if (rectHas(world, b.x, ny, b.w, b.h, 1)) { b.y = s > 0 ? Math.floor((ny + b.h - 0.001) / T) * T - b.h : (Math.floor(ny / T) + 1) * T; return true; } b.y = ny; dy -= s; } return false; }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function centerCamera(world) { const p = world.player, lv = world.lvl, maxX = Math.max(0, lv.w * T - SW), maxY = Math.max(0, lv.h * T - SH); world.camX = lv.w * T <= SW ? -Math.floor((SW - lv.w * T) / 2) : Math.max(0, Math.min(maxX, Math.round(p.x + p.w / 2 - SW / 2))); world.camY = lv.h * T <= SH ? -Math.floor((SH - lv.h * T) / 2) : Math.max(0, Math.min(maxY, Math.round(p.y + p.h / 2 - SH / 2))); }
  function respawn(world) { const p = world.player; p.x = world.spawn.x; p.y = world.spawn.y; p.vx = p.vy = 0; p.onGround = false; p.inv = HURT_FRAMES; }
  function hurt(world) { const p = world.player; if (p.inv > 0 || world.state !== 'play') return; world.lives--; world.events.push('hurt'); if (world.lives <= 0) { world.state = 'gameover'; world.events.push('gameover'); } else respawn(world); }
  function restart(world, toTitle) { world.score = 0; world.lives = world.game.lives; world.dialog = null; loadLevel(world, 0); world.state = toTitle ? 'title' : 'play'; }
  function stepEnemy(world, e) {
    const plat = world.game.type === 'platformer';
    if (plat && e.axis === 'h') {
      e.vy = Math.min(MAXFALL, e.vy + GRAV); const hitY = moveY(world, e, e.vy); e.onGround = hitY && e.vy > 0; if (hitY) e.vy = 0;
      const blocked = moveX(world, e, e.dir * e.speed); let reverse = blocked;
      if (e.onGround && !blocked) { const fx = e.dir > 0 ? e.x + e.w + 1 : e.x - 1; if (tileFlag(world, Math.floor(fx / T), Math.floor((e.y + e.h + 1) / T)) === 0 && !rectHas(world, fx, e.y + e.h, 1, 2, 1)) reverse = true; }
      if (reverse) e.dir = -e.dir;
    } else if (e.axis === 'v') { if (moveY(world, e, e.dir * e.speed)) e.dir = -e.dir; } else { if (moveX(world, e, e.dir * e.speed)) e.dir = -e.dir; }
    e.face = e.dir;
  }
  function step(world, input) {
    const ev = world.events; input = input || {}; world.time++;
    if (world.state === 'title') { if (input.aPressed || input.startPressed) { world.state = 'play'; ev.push('start'); } return world; }
    if (world.state === 'gameover') { if (input.aPressed || input.startPressed) { restart(world, false); ev.push('start'); } return world; }
    if (world.state === 'win') { if (input.aPressed || input.startPressed) restart(world, true); return world; }
    if (world.state === 'dialog') { if (input.aPressed) { const d = world.dialog; d.page++; ev.push('talk'); if (d.page * 3 >= d.lines.length) { world.state = 'play'; world.dialog = null; } } return world; }
    const p = world.player, plat = world.game.type === 'platformer', dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (p.inv > 0) p.inv--;
    if (plat) {
      p.vx = dir * SPEED; if (dir) p.face = dir;
      if (input.aPressed && p.onGround) { p.vy = JUMP; p.onGround = false; ev.push('jump'); }
      if (!input.a && p.vy < -1.2) p.vy = -1.2;
      p.vy = Math.min(MAXFALL, p.vy + GRAV); moveX(world, p, p.vx);
      const hitY = moveY(world, p, p.vy); if (hitY) { p.onGround = p.vy > 0; p.vy = 0; } else p.onGround = false;
      if (p.y > world.lvl.h * T + 24) hurt(world);
    } else {
      let dx = dir, dy = (input.down ? 1 : 0) - (input.up ? 1 : 0); if (dx && dy) { dx *= 0.7071; dy *= 0.7071; } if (dx) p.face = dx > 0 ? 1 : -1;
      moveX(world, p, dx * SPEED); moveY(world, p, dy * SPEED); p.vx = dx; p.vy = dy;
    }
    if (rectHas(world, p.x, p.y, p.w, p.h, 2)) hurt(world);
    for (const e of world.ents) {
      if (!e.alive) continue;
      if (e.role === 'enemy') { stepEnemy(world, e); if (overlap(p, e)) hurt(world); }
      else if (e.role === 'coin') { if (overlap(p, e)) { e.alive = false; world.score += 10; ev.push('coin'); } }
      else if (e.role === 'goal') { if (overlap(p, e)) { ev.push('goal'); if (world.li + 1 < world.game.levels.length) { loadLevel(world, world.li + 1); ev.push('next'); } else { world.state = 'win'; ev.push('win'); } return world; } }
      else if (e.role === 'npc') { if (input.aPressed && Math.abs((e.x + e.w / 2) - (p.x + p.w / 2)) < 14 && Math.abs((e.y + e.h / 2) - (p.y + p.h / 2)) < 14 && e.text) { world.dialog = { lines: wrapText(e.text, 18), page: 0 }; world.state = 'dialog'; ev.push('talk'); } }
    }
    centerCamera(world); return world;
  }

  // ----- drawing -----
  function buildAssets(game, makeCanvas) {
    const pal = game.palette.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    const img = (px, w, h) => { const c = makeCanvas(); c.width = w; c.height = h; const x = c.getContext('2d'), d = x.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = px[i]; if (v === 255) continue; const q = pal[Math.min(v, 3)]; d.data[i * 4] = q[0]; d.data[i * 4 + 1] = q[1]; d.data[i * 4 + 2] = q[2]; d.data[i * 4 + 3] = 255; } x.putImageData(d, 0, 0); return c; };
    const defaults = {}; for (const k of Object.keys(DEFAULT_SPRITES)) { const a = art(DEFAULT_SPRITES[k]); defaults[k] = { fps: 6, frames: [img(a.a, a.w, a.h)] }; }
    return { pal, tiles: game.tiles.map(t => img(t, T, T)), sprites: game.sprites.map(s => ({ fps: s.fps, frames: s.frames.map(f => img(f, s.w, s.h)) })), defaults };
  }
  function drawText(ctx, str, x, y, color) { ctx.fillStyle = color; str = String(str).toUpperCase(); for (let i = 0; i < str.length; i++) { const g = FONT[str[i]]; if (!g) continue; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r] & (4 >> c)) ctx.fillRect(x + i * 4 + c, y + r, 1, 1); } }
  const drawCentered = (ctx, str, y, color) => drawText(ctx, str, Math.floor((SW - textWidth(String(str))) / 2), y, color);
  function render(ctx, world, assets) {
    const g = world.game, pal = g.palette, bg = pal[0], fg = pal[3]; ctx.fillStyle = bg; ctx.fillRect(0, 0, SW, SH);
    const lv = world.lvl, cx = world.camX, cy = world.camY;
    for (let ty = Math.max(0, Math.floor(cy / T)); ty <= Math.min(lv.h - 1, Math.floor((cy + SH) / T)); ty++) for (let tx = Math.max(0, Math.floor(cx / T)); tx <= Math.min(lv.w - 1, Math.floor((cx + SW) / T)); tx++) { const c = lv.cells[ty * lv.w + tx]; if (c >= 0 && assets.tiles[c]) ctx.drawImage(assets.tiles[c], tx * T - cx, ty * T - cy); }
    const sprOf = b => (b.spr >= 0 && assets.sprites[b.spr] ? assets.sprites[b.spr] : assets.defaults[b.role]);
    const drawBody = (b, moving) => { const s = sprOf(b); if (!s) return; const fr = s.frames.length > 1 && moving ? Math.floor(world.time * s.fps / 60) % s.frames.length : 0, im = s.frames[fr], x = Math.round(b.x - b.ox - cx), y = Math.round(b.y - b.oy - cy);
      if (b.face < 0 && (b.role === 'player' || b.role === 'enemy')) { ctx.save(); ctx.translate(x + im.width, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0); ctx.restore(); } else ctx.drawImage(im, x, y); };
    for (const e of world.ents) if (e.alive) drawBody(e, e.role === 'enemy');
    const p = world.player; if (world.state !== 'gameover' && !(p.inv > 0 && Math.floor(world.time / 4) % 2)) drawBody(p, Math.abs(p.vx) > 0.01 || Math.abs(p.vy) > 0.5 && !(world.game.type === 'platformer'));
    // HUD
    ctx.fillStyle = bg; ctx.fillRect(0, 0, SW, 8); ctx.fillStyle = fg; ctx.fillRect(0, 8, SW, 1);
    drawText(ctx, '*' + world.lives, 2, 1, fg); const sc = String(world.score).padStart(5, '0'); drawText(ctx, sc, SW - 2 - textWidth(sc), 1, fg);
    const box = (lines) => { ctx.fillStyle = bg; ctx.fillRect(4, SH - 4 - (lines.length * 7 + 6), SW - 8, lines.length * 7 + 6); ctx.fillStyle = fg; ctx.fillRect(4, SH - 4 - (lines.length * 7 + 6), SW - 8, 1); ctx.fillRect(4, SH - 5, SW - 8, 1); ctx.fillRect(4, SH - 4 - (lines.length * 7 + 6), 1, lines.length * 7 + 6); ctx.fillRect(SW - 5, SH - 4 - (lines.length * 7 + 6), 1, lines.length * 7 + 6); lines.forEach((l, i) => drawText(ctx, l, 8, SH - 4 - (lines.length * 7 + 6) + 4 + i * 7, fg)); };
    if (world.state === 'dialog') { const d = world.dialog, page = d.lines.slice(d.page * 3, d.page * 3 + 3); box(page); if (Math.floor(world.time / 20) % 2) drawText(ctx, '>', SW - 12, SH - 11, fg); }
    const screen = (title, sub) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, SW, SH); ctx.fillStyle = fg; ctx.fillRect(8, 8, SW - 16, 1); ctx.fillRect(8, SH - 9, SW - 16, 1); ctx.fillRect(8, 8, 1, SH - 16); ctx.fillRect(SW - 9, 8, 1, SH - 16); wrapText(title, 30).forEach((l, i) => drawCentered(ctx, l, 40 + i * 8, fg)); sub.forEach((l, i) => drawCentered(ctx, l, 80 + i * 8, fg)); };
    if (world.state === 'title') screen(g.titleText, Math.floor(world.time / 30) % 2 ? ['PRESS A'] : ['']);
    if (world.state === 'gameover') screen('GAME OVER', ['SCORE ' + world.score, '', 'PRESS A']);
    if (world.state === 'win') screen(g.winText, ['SCORE ' + world.score, '', 'PRESS A']);
  }

  // ----- running in a page -----
  // audio: optional {sfx(name), music(on)}. opts: {level, skipTitle}. Returns controls.
  function create(canvas, saved, audio, opts) {
    opts = opts || {}; const game = decode(saved), ctx = canvas.getContext('2d'); canvas.width = SW; canvas.height = SH; ctx.imageSmoothingEnabled = false;
    const assets = buildAssets(game, () => document.createElement('canvas')); let world = createWorld(game, opts.level || 0, !!opts.skipTitle), raf = 0, last = 0, acc = 0, running = false;
    const held = { left: false, right: false, up: false, down: false, a: false, b: false }, latch = { a: false, start: false };
    const KEYS = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', z: 'a', ' ': 'a', j: 'a', x: 'b', k: 'b', Enter: 'start' };
    function press(name, down) { if (name === 'start') { if (down) latch.start = true; return; } if (!(name in held)) return; if (name === 'a' && down && !held.a) latch.a = true; held[name] = down; }
    const kd = e => { const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) press(k, true); }, ku = e => { const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!k) return; e.preventDefault(); press(k, false); };
    const tick = () => { const input = { ...held, aPressed: latch.a, startPressed: latch.start }; latch.a = latch.start = false; const before = world.state; step(world, input); const ev = world.events.splice(0); if (audio) { ev.forEach(n => audio.sfx && audio.sfx(n)); if (audio.music && before !== world.state) { if (world.state === 'play' && before === 'title') audio.music(true); if (world.state === 'gameover' || world.state === 'win') audio.music(false); } if (audio.music && world.state === 'play' && before === 'gameover') audio.music(true); } };
    function frame(now) { if (!running) return; acc += Math.min(100, now - last); last = now; while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; } render(ctx, world, assets); raf = requestAnimationFrame(frame); }
    return { start() { if (running) return; running = true; window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); last = performance.now(); acc = 0; if (audio && audio.music && world.state === 'play') audio.music(true); raf = requestAnimationFrame(frame); },
      stop() { running = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); if (audio && audio.music) audio.music(false); }, press, world: () => world, tick, draw: () => render(ctx, world, assets), restart: () => restart(world, true) };
  }
  return { SW, SH, T, decode, newGame, createWorld, step, create, render, buildAssets, wrapText, FONT, DEFAULT_SPRITES, DEFAULT_TILES, DEFAULT_FLAGS, un64, b64, art, loadLevel };
}
if (typeof module !== 'undefined' && module.exports) module.exports = SMAGameEngine(); else { window.SMAGameEngine = SMAGameEngine; window.SMA_game = SMAGameEngine(); }
