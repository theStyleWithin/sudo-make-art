'use strict';
// Packs a finished game into a desktop app you can hand to someone: a single-file Linux program and a Windows folder (zip).
// Original code for this project. The game is wrapped with Electron's official runtime, the same runtime this app is built on.
// The runtime is downloaded only after you say yes, from Electron's own releases, and checked against the SHA-256 Electron
// publishes for that file before it is kept. Nothing about your game is ever sent anywhere.
const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { fetchChecked } = require('./modelhub');

const VERSION = process.versions.electron;
const BASE = `https://github.com/electron/electron/releases/download/v${VERSION}/`;
const TARGETS = { linux: `electron-v${VERSION}-linux-x64.zip`, win: `electron-v${VERSION}-win32-x64.zip` };
const hostOk = h => h === 'github.com' || h.endsWith('.githubusercontent.com');
const cacheDir = () => { const d = process.env.SMA_RUNTIME_DIR || path.join(app.getPath('userData'), 'runtimes'); fs.mkdirSync(d, { recursive: true }); return d; };
const cached = p => { const f = path.join(cacheDir(), TARGETS[p]); try { return fs.statSync(f).size > 1e6 ? f : null; } catch (e) { return null; } };
const slugOf = n => String(n || 'game').normalize('NFKD').replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40).toLowerCase() || 'game';
const prettyOf = n => String(n || 'Game').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim().slice(0, 60) || 'Game';

// ---------- fetching the runtime, checked ----------
async function getBuffer(url, signal) { const r = await fetchChecked(url, signal, [], hostOk); if (r.statusCode !== 200) throw new Error('The download server answered ' + r.statusCode); const parts = []; for await (const c of r) parts.push(c); return Buffer.concat(parts); }
async function ensureRuntime(platform, send, signal) {
  const have = cached(platform); if (have) return have;
  const file = TARGETS[platform]; send({ phase: 'hash' });
  const sums = (await getBuffer(BASE + 'SHASUMS256.txt', signal)).toString('utf8'), m = sums.split('\n').map(l => l.trim().split(/\s+\*?/)).find(x => x[1] === file); if (!m || !/^[0-9a-f]{64}$/.test(m[0])) throw new Error('Electron does not publish a checksum for ' + file);
  const part = path.join(cacheDir(), file + '.part'), out = fs.createWriteStream(part), hash = crypto.createHash('sha256');
  try {
    const r = await fetchChecked(BASE + file, signal, [], hostOk); if (r.statusCode !== 200) throw new Error('The download server answered ' + r.statusCode);
    const total = +r.headers['content-length'] || 0; let got = 0, last = 0;
    for await (const c of r) { got += c.length; hash.update(c); if (!out.write(c)) await new Promise(res => out.once('drain', res)); if (Date.now() - last > 300) { last = Date.now(); send({ phase: 'download', got, total }); } }
    await new Promise((res, rej) => out.end(e => (e ? rej(e) : res())));
    if (hash.digest('hex') !== m[0]) throw new Error('The download does NOT match the SHA-256 Electron publishes, so it was thrown away.');
    const final = path.join(cacheDir(), file); fs.renameSync(part, final); return final;
  } finally { out.destroy(); fs.rmSync(part, { force: true }); }
}

// ---------- reading a zip (just what Electron's release zips use) ----------
function readZip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--; if (e < 0) throw new Error('Not a zip file');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip file');
    const madeBy = buf.readUInt16LE(p + 4), flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), time = buf.readUInt16LE(p + 12), date = buf.readUInt16LE(p + 14), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), attr = buf.readUInt32LE(p + 38), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl); p += 46 + nl + xl + cl;
    const lh = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), mode = madeBy >> 8 === 3 ? attr >>> 16 : 0;
    out.push({ name, method, flags, time, date, crc, csize, usize, mode, dir: name.endsWith('/'), link: (mode & 0o170000) === 0o120000, raw: () => buf.subarray(lh, lh + csize), data: () => (method === 0 ? buf.subarray(lh, lh + csize) : zlib.inflateRawSync(buf.subarray(lh, lh + csize))) });
  }
  return out;
}
const safeEntry = n => n && !n.startsWith('/') && !n.split('/').includes('..') && !n.includes('\\');

// ---------- the little program that plays the game ----------
const GAME = { product: 'Sudo Make Games', cache: 'sudo-make-games', noun: 'game', w: 800, h: 720, minW: 320, minH: 288, bg: '#0c0d12' };
const VN = { product: 'Sudo Make Visual Novel', cache: 'sudo-make-visual-novel', noun: 'visual novel', w: 1280, h: 720, minW: 640, minH: 360, bg: '#000000' };
const playerMain = (name, o = GAME) => `'use strict';
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(false));
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !d.url.startsWith('file:') && !d.url.startsWith('devtools:') })); // a game has no business using the network
  const w = new BrowserWindow({ width: ${o.w}, height: ${o.h}, minWidth: ${o.minW}, minHeight: ${o.minH}, title: ${JSON.stringify(name)}, backgroundColor: ${JSON.stringify(o.bg)}, autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' } });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); w.webContents.on('will-navigate', e => e.preventDefault());
  w.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { w.setFullScreen(!w.isFullScreen()); e.preventDefault(); } });
  w.loadFile(path.join(__dirname, 'game.html'));
});
app.on('window-all-closed', () => app.quit());
`;
const appFiles = (name, html, o = GAME) => [['resources/app/package.json', Buffer.from(JSON.stringify({ name: slugOf(name), productName: prettyOf(name), version: '1.0.0', main: 'main.js' }, null, 2))], ['resources/app/main.js', Buffer.from(playerMain(prettyOf(name), o))], ['resources/app/game.html', Buffer.from(html, 'utf8')]];

// ---------- Linux: one self-unpacking file ----------
function tarHeader(name, size, mode, type, link) {
  let prefix = '', nm = name; if (Buffer.byteLength(nm) > 100) { const cut = nm.lastIndexOf('/', 155); if (cut < 1 || Buffer.byteLength(nm) - cut - 1 > 100) throw new Error('A file name in the runtime is too long to pack: ' + name); prefix = nm.slice(0, cut); nm = nm.slice(cut + 1); }
  const h = Buffer.alloc(512), put = (s, o, l) => h.write(s, o, l, 'utf8');
  put(nm, 0, 100); put((mode & 0o7777).toString(8).padStart(7, '0'), 100, 8); put('0000000', 108, 8); put('0000000', 116, 8); put(size.toString(8).padStart(11, '0'), 124, 12); put('00000000000', 136, 12); h.fill(0x20, 148, 156); put(type, 156, 1); if (link) put(link, 157, 100); put('ustar', 257, 6); put('00', 263, 2); put(prefix, 345, 155);
  let sum = 0; for (let i = 0; i < 512; i++) sum += h[i]; put(sum.toString(8).padStart(6, '0'), 148, 7); h[154] = 0; h[155] = 0x20; return h;
}
async function writeLinux(zipBuf, name, html, outPath, send, o = GAME) {
  const slug = slugOf(name), files = readZip(zipBuf), hash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
  const header = `#!/bin/sh\n# ${prettyOf(name).replace(/\n/g, ' ')}: made with ${o.product}. This one file is the whole game.\n# It unpacks once into your cache folder (${'$'}HOME/.cache/${o.cache}) and then starts. Delete that folder to free the space.\nset -e\nD="${'$'}{XDG_CACHE_HOME:-${'$'}HOME/.cache}/${o.cache}/${slug}-${hash}"\nif [ ! -f "${'$'}D/.ready" ]; then\n  rm -rf "${'$'}D.tmp"; mkdir -p "${'$'}D.tmp"\n  tail -c +@@@@@@@ "${'$'}0" | tar xz -C "${'$'}D.tmp"\n  rm -rf "${'$'}D"; mv "${'$'}D.tmp" "${'$'}D"; touch "${'$'}D/.ready"\nfi\nexec "${'$'}D/${slug}" --no-sandbox "${'$'}@"\nexit 1\n`;
  const headerBytes = Buffer.from(header.replace('@@@@@@@', String(Buffer.byteLength(header) + 1).padStart(7, '0')));
  const out = fs.createWriteStream(outPath, { mode: 0o755 }), gz = zlib.createGzip({ level: 6 }); out.write(headerBytes); gz.pipe(out); const done = new Promise((res, rej) => { out.on('finish', res); out.on('error', rej); gz.on('error', rej); });
  const write = async b => { if (!gz.write(b)) await new Promise(r => gz.once('drain', r)); };
  let i = 0; const total = files.length + 3;
  const addFile = async (nm, data, mode) => { await write(tarHeader(nm, data.length, mode, '0')); await write(data); const pad = (512 - (data.length % 512)) % 512; if (pad) await write(Buffer.alloc(pad)); };
  for (const f of files) {
    i++; if (i % 25 === 0) send({ phase: 'pack', got: i, total }); if (!safeEntry(f.name) || f.name.startsWith('resources/default_app')) continue;
    if (f.dir) { await write(tarHeader(f.name.replace(/\/$/, '') + '/', 0, 0o755, '5')); continue; }
    if (f.link) { await write(tarHeader(f.name, 0, 0o777, '2', f.data().toString('utf8'))); continue; }
    const nm = f.name === 'electron' ? slug : f.name; let mode = f.mode ? f.mode & 0o777 : 0o644; if (f.name === 'electron' || f.name === 'chrome_crashpad_handler') mode |= 0o755; if (f.name === 'chrome-sandbox') mode = 0o755; await addFile(nm, f.data(), mode);
  }
  for (const [nm, data] of appFiles(name, html, o)) await addFile(nm, data, 0o644);
  await write(Buffer.alloc(1024)); gz.end(); await done; return fs.statSync(outPath).size;
}

// ---------- Windows: a zip with the runtime and the game ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function writeWindows(zipBuf, name, html, outPath, send, o = GAME) {
  const pretty = prettyOf(name), top = pretty.replace(/ /g, '-') + '/', files = readZip(zipBuf), out = fs.createWriteStream(outPath), central = []; let pos = 0;
  const write = async b => { pos += b.length; if (!out.write(b)) await new Promise(r => out.once('drain', r)); };
  const entry = async (nm, e) => { // e: {method, crc, csize, usize, raw, time, date, dir, mode}
    const nameB = Buffer.from(top + nm, 'utf8'), lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(e.method, 8); lh.writeUInt16LE(e.time, 10); lh.writeUInt16LE(e.date, 12); lh.writeUInt32LE(e.crc, 14); lh.writeUInt32LE(e.csize, 18); lh.writeUInt32LE(e.usize, 22); lh.writeUInt16LE(nameB.length, 26);
    central.push({ nameB, e, off: pos }); await write(lh); await write(nameB); if (e.csize) await write(e.raw);
  };
  let i = 0; const now = new Date(), dtime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), ddate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    i++; if (i % 25 === 0) send({ phase: 'pack', got: i, total: files.length }); if (!safeEntry(f.name) || f.name.startsWith('resources/default_app')) continue; if (f.link) continue;
    const nm = f.name === 'electron.exe' ? pretty.replace(/ /g, '-') + '.exe' : f.name;
    await entry(nm, { method: f.method, crc: f.crc, csize: f.csize, usize: f.usize, raw: f.raw(), time: f.time, date: f.date, dir: f.dir });   // already compressed: copied as it is
  }
  for (const [nm, data] of appFiles(name, html, o)) { const raw = zlib.deflateRawSync(data, { level: 9 }); await entry(nm, { method: 8, crc: crc32(data), csize: raw.length, usize: data.length, raw, time: dtime, date: ddate, dir: false }); }
  const start = pos; for (const c of central) { const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(c.e.method, 10); ch.writeUInt16LE(c.e.time, 12); ch.writeUInt16LE(c.e.date, 14); ch.writeUInt32LE(c.e.crc, 16); ch.writeUInt32LE(c.e.csize, 20); ch.writeUInt32LE(c.e.usize, 24); ch.writeUInt16LE(c.nameB.length, 28); ch.writeUInt32LE(c.e.dir ? 0x10 : 0, 38); ch.writeUInt32LE(c.off, 42); await write(ch); await write(c.nameB); }
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(central.length, 8); eocd.writeUInt16LE(central.length, 10); eocd.writeUInt32LE(pos - start, 12); eocd.writeUInt32LE(start, 16); await write(eocd);
  await new Promise((res, rej) => out.end(e => (e ? rej(e) : res()))); return fs.statSync(outPath).size;
}

// ---------- the doors into this file ----------
let job = null;
async function buildPackage(e, platform, name, html, o = GAME) {
if (!TARGETS[platform]) throw new Error('Unknown platform'); if (typeof html !== 'string' || html.length < 1000 || html.length > 200e6) throw new Error('Nothing to pack'); if (job) throw new Error('Another export is already running');
const sender = e.sender, send = d => { if (!sender.isDestroyed()) sender.send('gamepack:progress', { platform, ...d }); }, win = BrowserWindow.fromWebContents(sender);
const def = platform === 'linux' ? slugOf(name) + '-linux.run' : prettyOf(name).replace(/ /g, '-') + '-windows.zip';
const target = process.env.SMA_SAVE_AS || (await dialog.showSaveDialog(win, { title: platform === 'linux' ? `Save the Linux ${o.noun}` : `Save the Windows ${o.noun}`, defaultPath: def, filters: platform === 'linux' ? [{ name: 'Linux program', extensions: ['run'] }] : [{ name: 'Zip file', extensions: ['zip'] }] })).filePath;
if (!target) return { cancelled: true };
const ctl = new AbortController(); job = ctl;
try {
  const rt = await ensureRuntime(platform, send, ctl.signal); send({ phase: 'read' }); const zipBuf = fs.readFileSync(rt);
  const tmp = target + '.part'; const bytes = platform === 'linux' ? await writeLinux(zipBuf, name, html, tmp, send, o) : await writeWindows(zipBuf, name, html, tmp, send, o);
  fs.renameSync(tmp, target); if (platform === 'linux') fs.chmodSync(target, 0o755); send({ phase: 'done' }); return { path: target, bytes };
} catch (err) { fs.rmSync(target + '.part', { force: true }); throw new Error(ctl.signal.aborted ? 'Cancelled' : err.message); } finally { job = null; }
}
function register() {
  ipcMain.handle('gamepack:status', () => ({ version: VERSION, linux: !!cached('linux'), win: !!cached('win') }));
  ipcMain.handle('gamepack:cancel', () => { if (job) job.abort(); });
  ipcMain.handle('gamepack:build', (e, platform, name, html) => buildPackage(e, platform, name, html, GAME));
}
module.exports = { register, readZip, crc32, buildPackage, VN, GAME, slugOf, prettyOf };
