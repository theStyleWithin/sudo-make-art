'use strict';
// "Send to Desktop College Dorms" (a separate app by the same author) from the character card editor. This looks for the app on this
// computer, saves the card as a PNG in Documents/Sudo Make Art/Character cards, and starts the app with that file:
//     desktop-college-dorms --import-card <file.png>
// The card is a normal character card (the profile is inside the PNG), so the app's Library > Import cards can always read it,
// even if the installed version does not yet open files given on the command line. Nothing is sent over any network.
const { app, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FLATPAK_ID = 'io.github.thestylewithin.DesktopCollegeDorms', NAME_RE = /desktop[-_ ]?college[-_ ]?dorms/i;
const home = () => process.env.HOME || os.homedir();
const exists = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 4000 }, (e, out) => res(e ? null : String(out))));
const onPath = name => (process.env.PATH || '').split(path.delimiter).map(d => path.join(d, name)).find(exists);

function scanDir(dir, test, depth = 1) { // files in a folder (and its sub-folders, a little way down) that pass the test
  const out = []; let names = []; try { names = fs.readdirSync(dir); } catch (e) { return out; }
  for (const n of names) { const p = path.join(dir, n); if (test(n) && exists(p)) out.push(p); else if (depth > 0 && isDir(p) && !n.startsWith('.') && n !== 'node_modules') out.push(...scanDir(p, test, depth - 1)); }
  return out;
}
const newest = list => list.map(p => ({ p, t: fs.statSync(p).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.p;

async function find() {
  const h = home();
  if (process.platform === 'linux') {
    const bin = onPath('desktop-college-dorms') || onPath('DesktopCollegeDorms'); if (bin) return { found: true, how: 'installed', path: bin, kind: 'bin' };
    for (const d of ['/usr/bin', '/usr/local/bin', '/opt/desktop-college-dorms', '/opt/DesktopCollegeDorms']) { const f = path.join(d, 'desktop-college-dorms'); if (exists(f)) return { found: true, how: 'installed', path: f, kind: 'bin' }; }
    const desk = [path.join(h, '.local/share/applications'), '/usr/share/applications', '/var/lib/flatpak/exports/share/applications', path.join(h, '.local/share/flatpak/exports/share/applications')].map(d => path.join(d, FLATPAK_ID + '.desktop')).find(exists);
    if (desk) { const m = /^Exec=(.+)$/m.exec(fs.readFileSync(desk, 'utf8')); if (m && !/^flatpak\b/.test(m[1].trim())) { const exe = m[1].trim().split(/\s+/)[0].replace(/^"|"$/g, ''); if (exists(exe) || onPath(exe)) return { found: true, how: 'installed', path: exists(exe) ? exe : onPath(exe), kind: 'bin' }; } }
    const fp = await run('flatpak', ['info', FLATPAK_ID]); if (fp) return { found: true, how: 'Flatpak', path: FLATPAK_ID, kind: 'flatpak' };
    const imgs = []; for (const d of ['Applications', 'AppImages', 'Apps', 'Downloads', 'Desktop', 'Documents', '.local/bin', 'bin'].map(x => path.join(h, x)).concat(['/opt'])) imgs.push(...scanDir(d, n => NAME_RE.test(n) && /\.appimage$/i.test(n)));
    const ai = newest(imgs); if (ai) return { found: true, how: 'AppImage', path: ai, kind: 'appimage' };
  } else if (process.platform === 'win32') {
    const roots = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(h, 'Downloads'), path.join(h, 'Desktop'), path.join(h, 'Documents')].filter(Boolean);
    const exes = []; for (const d of roots) exes.push(...scanDir(d, n => NAME_RE.test(n) && /\.exe$/i.test(n) && !/setup|uninstall/i.test(n), 2));
    const e = newest(exes); if (e) return { found: true, how: /portable/i.test(e) ? 'portable' : 'installed', path: e, kind: 'exe' };
  } else if (process.platform === 'darwin') {
    for (const d of ['/Applications', path.join(h, 'Applications')]) { const a = path.join(d, 'DesktopCollegeDorms.app'); if (isDir(a)) return { found: true, how: 'installed', path: a, kind: 'mac' }; }
  }
  return { found: false };
}
function cardsDir() { const d = path.join(app.getPath('documents'), 'Sudo Make Art', 'Character cards'); fs.mkdirSync(d, { recursive: true }); return d; }
async function send(bytes, fileName) {
  const buf = Buffer.from(bytes); if (buf.length < 100 || buf.length > 40e6 || buf.slice(1, 4).toString() !== 'PNG') throw new Error('That is not a card picture.');
  const base = String(fileName || 'character.png').replace(/[^\w .-]+/g, '_').replace(/\.png$/i, '').slice(0, 60) || 'character', file = path.join(cardsDir(), base + '.png');
  fs.writeFileSync(file, buf); const f = await find(); if (!f.found) return { found: false, file };
  const detach = (cmd, args) => { const p = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd: path.dirname(file) }); p.on('error', () => {}); p.unref(); };
  if (f.kind === 'flatpak') detach('flatpak', ['run', FLATPAK_ID]); // a Flatpak cannot read arbitrary files, so it is only started; the card file is shown to the user
  else if (f.kind === 'mac') detach('open', ['-a', f.path, '--args', '--import-card', file]);
  else { if (f.kind === 'appimage') { try { fs.accessSync(f.path, fs.constants.X_OK); } catch (e) { fs.chmodSync(f.path, 0o755); } } detach(f.path, ['--import-card', file]); }
  return { found: true, how: f.how, appPath: f.path, file };
}
function register() {
  ipcMain.handle('dorms:find', () => find());
  ipcMain.handle('dorms:send', (e, bytes, name) => send(bytes, name));
}
module.exports = { register, find };
