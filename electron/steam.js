'use strict';
// "Add to Steam": puts Sudo Make Art in the Steam library as a non-Steam game, by adding one entry to Steam's own shortcuts
// file (userdata/<account>/config/shortcuts.vdf). Nothing is sent anywhere. The file is backed up first, existing shortcuts
// are kept exactly as they were, and nothing is written while Steam is running (Steam would overwrite it when it closes).
const { app, ipcMain } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- Steam's binary key-values format ----------
function parse(buf) { // -> { name: value } with maps as objects (insertion order kept); throws on anything unexpected
  let p = 0;
  const cstr = () => { const e = buf.indexOf(0, p); if (e < 0) throw new Error('bad string'); const s = buf.toString('utf8', p, e); p = e + 1; return s; };
  const map = () => { const o = []; for (;;) { if (p >= buf.length) throw new Error('truncated'); const t = buf[p++]; if (t === 8) return o; const k = cstr(); let v;
    if (t === 0) v = map(); else if (t === 1) v = cstr(); else if (t === 2) { v = buf.readInt32LE(p); p += 4; } else if (t === 7) { v = buf.readBigUInt64LE(p); p += 8; } else throw new Error('unknown type ' + t);
    o.push([k, t, v]); } };
  const root = map(); if (p !== buf.length && !buf.subarray(p).every(b => b === 0)) throw new Error('trailing data'); return root;
}
function write(entries) {
  const out = [];
  const cstr = s => { out.push(Buffer.from(s, 'utf8'), Buffer.from([0])); };
  const map = list => { for (const [k, t, v] of list) { out.push(Buffer.from([t])); cstr(k); if (t === 0) map(v); else if (t === 1) cstr(v); else if (t === 2) { const b = Buffer.alloc(4); b.writeInt32LE(v | 0); out.push(b); } else if (t === 7) { const b = Buffer.alloc(8); b.writeBigUInt64LE(v); out.push(b); } } out.push(Buffer.from([8])); };
  map(entries); return Buffer.concat(out);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = s => { let c = 0xFFFFFFFF; for (const b of Buffer.from(s, 'utf8')) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function entryFor(index, name, exe, startDir, icon) {
  const quoted = '"' + exe + '"', appid = (crc32(quoted + name) | 0x80000000) | 0;
  return [String(index), 0, [['appid', 2, appid], ['AppName', 1, name], ['Exe', 1, quoted], ['StartDir', 1, '"' + startDir + '"'], ['icon', 1, icon || ''], ['ShortcutPath', 1, ''], ['LaunchOptions', 1, ''],
    ['IsHidden', 2, 0], ['AllowDesktopConfig', 2, 1], ['AllowOverlay', 2, 1], ['OpenVR', 2, 0], ['Devkit', 2, 0], ['DevkitGameID', 1, ''], ['DevkitOverrideAppID', 2, 0], ['LastPlayTime', 2, 0], ['FlatpakAppID', 1, ''], ['tags', 0, []]]];
}

// ---------- where Steam keeps things ----------
function steamRoots() {
  if (process.env.SMA_STEAM_DIR) return [process.env.SMA_STEAM_DIR];
  const h = os.homedir(), c = [];
  if (process.platform === 'win32') { c.push(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam')); }
  else if (process.platform === 'darwin') c.push(path.join(h, 'Library/Application Support/Steam'));
  else c.push(path.join(h, '.local/share/Steam'), path.join(h, '.steam/steam'), path.join(h, '.var/app/com.valvesoftware.Steam/.local/share/Steam'), path.join(h, 'snap/steam/common/.local/share/Steam'));
  return c.filter(d => { try { return fs.statSync(path.join(d, 'userdata')).isDirectory(); } catch (e) { return false; } });
}
function accounts() {
  const seen = new Set(), out = [];
  for (const root of steamRoots()) { let real = root; try { real = fs.realpathSync(root); } catch (e) {} if (seen.has(real)) continue; seen.add(real);
    for (const id of fs.readdirSync(path.join(root, 'userdata'))) { if (!/^\d+$/.test(id) || id === '0') continue; out.push({ id, config: path.join(root, 'userdata', id, 'config'), file: path.join(root, 'userdata', id, 'config', 'shortcuts.vdf') }); } }
  return out;
}
function steamRunning() {
  if (process.env.SMA_STEAM_DIR && process.env.SMA_STEAM_RUNNING !== undefined) return process.env.SMA_STEAM_RUNNING === '1';
  try {
    if (process.platform === 'win32') return /steam\.exe/i.test(spawnSync('tasklist', ['/FI', 'IMAGENAME eq steam.exe'], { encoding: 'utf8', timeout: 5000 }).stdout || '');
    return spawnSync('pgrep', ['-x', 'steam'], { timeout: 5000 }).status === 0 || spawnSync('pgrep', ['-x', 'steamwebhelper'], { timeout: 5000 }).status === 0;
  } catch (e) { return false; }
}
function myExe() { // the file Steam should start
  if (process.env.APPIMAGE) return process.env.APPIMAGE;
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}
function iconPath() { // Steam wants a file on disk; copy the app icon out next to the app's data
  try { const dest = path.join(app.getPath('userData'), 'steam-icon.png'); if (!fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(__dirname, '..', 'build', 'icon.png'), dest); } return dest; } catch (e) { return ''; }
}
const NAME = 'Sudo Make Art';

function status() {
  const list = accounts(), exe = myExe(); let already = 0;
  for (const a of list) { try { const root = fs.existsSync(a.file) ? parse(fs.readFileSync(a.file)) : []; const sc = (root.find(x => x[0].toLowerCase() === 'shortcuts') || [])[2] || []; if (sc.some(e => (e[2].find(f => f[0] === 'Exe') || [])[2] === '"' + exe + '"')) already++; } catch (e) {} }
  return { found: list.length, already, running: steamRunning(), exe, name: NAME };
}
function add() {
  const s = status(); if (!s.found) throw new Error('Steam was not found on this computer (looked for its userdata folder). Start Steam and sign in once, then try again.');
  if (s.running) throw new Error('Steam is running. Close Steam completely (Steam > Exit), then press the button again. Steam would overwrite the change when it closes.');
  const exe = s.exe, startDir = path.dirname(exe), icon = iconPath(); let added = 0, skipped = 0; const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const a of accounts()) {
    fs.mkdirSync(a.config, { recursive: true });
    let root; try { root = fs.existsSync(a.file) ? parse(fs.readFileSync(a.file)) : []; } catch (e) { throw new Error('Could not safely read Steam\'s shortcuts file for account ' + a.id + ' (' + e.message + '). Nothing was changed.'); }
    let sc = root.find(x => x[0].toLowerCase() === 'shortcuts'); if (!sc) { sc = ['shortcuts', 0, []]; root.push(sc); }
    if (sc[2].some(e => (e[2].find(f => f[0] === 'Exe') || [])[2] === '"' + exe + '"')) { skipped++; continue; }
    if (fs.existsSync(a.file)) fs.copyFileSync(a.file, a.file + '.sma-backup-' + stamp);
    const next = sc[2].reduce((m, e) => Math.max(m, (+e[0] || 0) + 1), 0); sc[2].push(entryFor(next, NAME, exe, startDir, icon));
    const tmp = a.file + '.sma-tmp'; fs.writeFileSync(tmp, write(root)); fs.renameSync(tmp, a.file); added++;
  }
  return { added, skipped };
}
function register() {
  ipcMain.handle('steam:status', () => status());
  ipcMain.handle('steam:add', () => add());
}
module.exports = { register, parse, write, crc32, entryFor };
