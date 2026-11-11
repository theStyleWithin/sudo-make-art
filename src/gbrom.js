// Builds a Game Boy ROM (.gb) from a game made in Sudo Make Games. Original code for this project.
// It cuts the game into Game Boy data (2-bit tiles, sprites, levels, text pages), adds the program from src/gbrt.js, assembles it
// with src/sm83asm.js, and fills in the cartridge header and checksums. The result is a plain 32 KB cartridge that needs no mapper.
(() => {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const E = isNode ? require('./gameengine.js') : window.SMA_game, ASM = isNode ? require('./sm83asm.js') : window.SMA_asm, RT = isNode ? require('./gbrt.js') : window.SMA_gbrt;
const AUD = () => (isNode ? require('./gbaudio.js') : window.SMA_gbaudio);
const MAX_ROM = 0x8000;

const toGb = v => (v === 255 ? 0 : [1, 1, 2, 3][v]);          // sprites: colour 0 is see-through on the real chip, so the two lightest shades share colour 1
const enc2bpp = px => { const out = []; for (let y = 0; y < 8; y++) { let lo = 0, hi = 0; for (let x = 0; x < 8; x++) { const c = px[y * 8 + x] & 3; lo |= (c & 1) << (7 - x); hi |= (c >> 1) << (7 - x); } out.push(lo, hi); } return out; };
const ROWMAP = [0, 1, 2, 2, 3, 4];   // the 5-row font is stretched to 6 rows and sits one pixel down, so lines of text never touch
function glyph(rows) { const px = new Uint8Array(64); for (let y = 0; y < 6; y++) { const bits = rows[ROWMAP[y]]; for (let c = 0; c < 3; c++) if (bits & (4 >> c)) { px[(y + 1) * 8 + 1 + c * 2] = 3; px[(y + 1) * 8 + 2 + c * 2] = 3; } } return px; }
const FONT_ORDER = [' ', ...'0123456789', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'!?.,:-\'*'];
const FONT_TILES = FONT_ORDER.length + 4;
const lines16 = (arr, per = 16) => { const out = []; for (let i = 0; i < arr.length; i += per) out.push(' db ' + arr.slice(i, i + per).map(v => v & 255).join(',')); return out.join('\n'); };

function buildRom(saved, opts = {}) {
  const g = E.decode(saved), problems = [];
  if (g.levels.length > 16) throw new Error('A Game Boy game can have at most 16 levels (this one has ' + g.levels.length + ').');
  g.levels.forEach((l, i) => { if (l.w > 32 || l.h > 32) throw new Error(`Level ${i + 1} is ${l.w}×${l.h}. For a Game Boy the levels can be at most 32×32 tiles.`); if (l.ents.filter(e => e.t !== 'player').length > 24) throw new Error(`Level ${i + 1} has more than 24 things in it (the Game Boy version can move 24).`); });

  // ----- sprites: only the ones used, built-in pictures included -----
  const sprList = [], sprKey = new Map(), DEFAULT_ROLES = ['player', 'enemy', 'coin', 'goal', 'npc'];
  const spriteFor = e => { const key = e.spr >= 0 && g.sprites[e.spr] ? 'g' + e.spr : 'd' + e.t; if (!sprKey.has(key)) { let s; if (key[0] === 'g') s = g.sprites[+key.slice(1)]; else { const a = E.art(E.DEFAULT_SPRITES[e.t]); s = { w: a.w, h: a.h, fps: 6, frames: [a.a] }; } sprKey.set(key, sprList.length); sprList.push(s); } return sprKey.get(key); };
  g.levels.forEach(l => { let hasP = false; for (const e of l.ents) { if (e.t === 'player') { if (hasP) continue; hasP = true; } spriteFor(e); } if (!hasP) spriteFor({ t: 'player', spr: -1 }); });
  // ----- the tile block: level tiles, sprite tiles, then the font -----
  const bgCount = g.tiles.length; let nextTile = bgCount; const tileBytes = [];
  g.tiles.forEach(t => tileBytes.push(...enc2bpp(t)));
  const sprTable = [];
  sprList.forEach(s => {
    const wt = Math.ceil(s.w / 8), ht = Math.ceil(s.h / 8), base = nextTile; if (wt * ht * s.frames.length > 255) throw new Error('A character is too big for the Game Boy.');
    s.frames.forEach(f => { for (let r = 0; r < ht; r++) for (let c = 0; c < wt; c++) { const px = new Uint8Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const sx = c * 8 + x, sy = r * 8 + y; px[y * 8 + x] = sx < s.w && sy < s.h ? toGb(f[sy * s.w + sx]) : 0; } tileBytes.push(...enc2bpp(px)); } });
    nextTile += wt * ht * s.frames.length; const period = 60 / Math.max(1, s.fps), shift = Math.max(0, Math.min(7, Math.round(Math.log2(period)))); sprTable.push([wt, ht, s.frames.length, shift, base, 0, 0, 0]);
  });
  const F0 = nextTile; if (F0 + FONT_TILES > 256) throw new Error(`Too many pictures for the Game Boy: ${F0 + FONT_TILES} tiles are needed and the limit is 256 (level tiles ${bgCount}, character pictures ${F0 - bgCount}, text ${FONT_TILES}).`);
  const charTile = ch => { const i = FONT_ORDER.indexOf(ch.toUpperCase()); return F0 + (i < 0 ? 0 : i); };
  FONT_ORDER.forEach(ch => { tileBytes.push(...enc2bpp(ch === ' ' ? new Uint8Array(64) : glyph(E.FONT[ch]))); });
  const box = f => { const px = new Uint8Array(64); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (f(x, y)) px[y * 8 + x] = 3; return enc2bpp(px); };
  tileBytes.push(...box((x, y) => y >= 6), ...box((x, y) => y <= 1), ...box(x => x >= 6), ...box(x => x <= 1));
  const T_BOX = F0 + FONT_ORDER.length;

  // ----- text: dialogue pages and the three full screens -----
  const texts = [], textIdx = new Map(), pageData = [];
  const line18 = s => { const out = []; for (let i = 0; i < 18; i++) out.push(i < s.length ? charTile(s[i]) : F0); return out; };
  function textFor(str) { str = String(str || '').trim(); if (!str) return 0xff; if (textIdx.has(str)) return textIdx.get(str); const lines = E.wrapText(str, 18), pages = []; for (let i = 0; i < lines.length; i += 3) { const p = []; for (let k = 0; k < 3; k++) p.push(...line18(lines[i + k] || '')); pages.push(p); } if (pages.length > 12) throw new Error('A character says too much (more than 12 pages).'); const idx = texts.length; texts.push(pages); textIdx.set(str, idx); return idx; }
  const screen = (rows) => { const m = new Array(360).fill(F0); for (const [row, str, col] of rows) { const c = col === undefined ? Math.floor((20 - str.length) / 2) : col; for (let i = 0; i < str.length; i++) if (row >= 0 && row < 18 && c + i >= 0 && c + i < 20) m[row * 20 + c + i] = charTile(str[i]); } return m; };
  const wrapRows = (str, row, max) => E.wrapText(str, 18).slice(0, max).map((l, i) => [row + i, l]);
  const titleMap = screen([...wrapRows(g.titleText, 5, 4), [12, 'PRESS A']]), overMap = screen([[6, 'GAME OVER'], [9, 'SCORE', 4], [13, 'PRESS A']]), winMap = screen([...wrapRows(g.winText, 4, 3), [9, 'SCORE', 4], [13, 'PRESS A']]);
  const dialogFrame = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 20; c++) dialogFrame.push(r === 0 ? T_BOX : r === 4 ? T_BOX + 1 : c === 0 ? T_BOX + 2 : c === 19 ? T_BOX + 3 : F0);

  // ----- levels -----
  const body = (sprIdx, e, role) => { const s = sprList[sprIdx], w = s.w, h = s.h, hw = Math.max(2, w - 2), hh = Math.max(2, h - 1), ox = Math.floor((w - hw) / 2), oy = h - hh, x = e.x * 8 + ox, y = e.y * 8 + 8 - hh;
    const fl = role === 1 && e.axis === 'v' ? 4 : 0, aux = role === 1 ? Math.max(6, Math.min(128, Math.round((+e.speed || 0.5) * 64))) : role === 4 ? textFor(e.text) : 0;
    return [role, sprIdx, 0, x & 255, (x >> 8) & 255, 0, y & 255, (y >> 8) & 255, 0, 0, hw, hh, ox, oy, fl, aux]; };
  const ROLE = { enemy: 1, coin: 2, goal: 3, npc: 4 };
  const levelAsm = g.levels.map((l, i) => {
    const pl = l.ents.find(e => e.t === 'player') || { t: 'player', x: 1, y: 1, spr: -1 }, others = l.ents.filter(e => e.t !== 'player');
    const bytes = [l.w, l.h, others.length, ...body(spriteFor(pl), pl, 5)]; others.forEach(e => bytes.push(...body(spriteFor(e), e, ROLE[e.t])));
    for (let k = 0; k < l.cells.length; k++) bytes.push(l.cells[k] < 0 ? 0xff : l.cells[k]);
    return `Level${i}:\n${lines16(bytes)}`;
  });
  const textAsm = texts.map((pages, i) => `Text${i}:\n db ${pages.length}\n${lines16(pages.flat(), 18)}`);
  const flags = new Array(256).fill(0); g.flags.forEach((f, i) => { flags[i] = f; });
  const C = isNode ? require('./chip.js') : window.SMA_chip;
  let songObj = null; if (g.song && opts.music !== false) { try { songObj = C.parseSong(g.song); } catch (e) { problems.push('The music could not be read: ' + e.message); } }
  const audio = AUD().build(songObj), audioSrc = audio.code + '\n' + audio.data;

  let src = RT.runtimeAsm().replace('${AUDIO}', audioSrc) + `
GameType: db ${g.type === 'topdown' ? 1 : 0}
LivesInit: db ${g.lives}
NLevels: db ${g.levels.length}
LevelTable: dw ${g.levels.map((_, i) => 'Level' + i).join(',')}
TextTable: dw ${texts.length ? texts.map((_, i) => 'Text' + i).join(',') : '0'}
SpriteTable:
${lines16(sprTable.flat(), 8)}
DialogFrame:
${lines16(dialogFrame, 20)}
ScreenTitle:
${lines16(titleMap, 20)}
ScreenOver:
${lines16(overMap, 20)}
ScreenWin:
${lines16(winMap, 20)}
${levelAsm.join('\n')}
${textAsm.join('\n')}
 align 256
TileFlags:
${lines16(flags)}
TileBlock:
${lines16(tileBytes)}
RomEnd:
`;
  const defines = { T_BLANK: F0, T_DIGIT0: F0 + 1, T_HEART: charTile('*'), TILEBLOCK_LEN: tileBytes.length, ...audio.defines };
  const r = ASM.assemble(src, { size: 0x20000, fill: 0xff, defines });
  if (r.end > MAX_ROM) throw new Error(`This game is ${r.end - MAX_ROM} bytes too big for a plain 32 KB Game Boy cartridge (it needs ${r.end} bytes). Try fewer levels, smaller levels, fewer pictures or a shorter song.`);
  const rom = r.bytes.slice(0, MAX_ROM);
  // ----- cartridge header -----
  const title = (opts.title || g.name || 'GAME').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 15) || 'GAME'; for (let i = 0; i < 16; i++) rom[0x134 + i] = i < title.length ? title.charCodeAt(i) : 0;
  rom[0x143] = 0; rom[0x144] = 0; rom[0x145] = 0; rom[0x146] = 0; rom[0x147] = 0; rom[0x148] = 0; rom[0x149] = 0; rom[0x14a] = 1; rom[0x14b] = 0; rom[0x14c] = 0;
  let x = 0; for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 255; rom[0x14d] = x;
  let sum = 0; for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) sum = (sum + rom[i]) & 0xffff; rom[0x14e] = sum >> 8; rom[0x14f] = sum & 255;
  return { rom, symbols: r.symbols, report: { bytes: r.end, free: MAX_ROM - r.end, tiles: F0 + FONT_TILES, levels: g.levels.length, sprites: sprList.length, title, hasMusic: !!songObj, F0 } };
}
const api = { buildRom };
if (isNode) module.exports = api; else window.SMA_gbrom = api;
})();
