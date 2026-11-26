'use strict';
// "Send to Anti-Social" (a separate app by the same author) from the profile decoration export and from the home screen. This looks for
// the app on this computer, saves the decoration pack in Documents/Sudo Make Art/Profile decorations, and starts the app with that file:
//     anti-social --import-decorations <pack.asdeco>
// Anti-Social adds the decorations to its My decorations list (it remembers them), or, if it is already open, its running window does.
// The file is an ordinary .asdeco pack, so Settings > Profile decorations > Add my own decorations in the app can always read it, even
// if the installed version does not yet open files given on the command line. Nothing is sent over any network.
const { app, ipcMain } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NAME_RE = /anti[-_ ]?social/i;
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
    const bin = onPath('anti-social') || onPath('Anti-Social'); if (bin) return { found: true, how: 'installed', path: bin, kind: 'bin' };
    for (const d of ['/opt/Anti-Social', '/opt/anti-social', '/usr/bin', '/usr/local/bin']) { const f = path.join(d, 'anti-social'); if (exists(f)) return { found: true, how: 'installed', path: f, kind: 'bin' }; }
    const desk = [path.join(h, '.local/share/applications'), '/usr/share/applications'].map(d => path.join(d, 'anti-social.desktop')).find(exists);
    if (desk) { const m = /^Exec=(.+)$/m.exec(fs.readFileSync(desk, 'utf8')); if (m) { const exe = m[1].trim().split(/\s+/)[0].replace(/^"|"$/g, ''); if (exists(exe) || onPath(exe)) return { found: true, how: 'installed', path: exists(exe) ? exe : onPath(exe), kind: 'bin' }; } }
    const imgs = []; for (const d of ['Applications', 'AppImages', 'Apps', 'Downloads', 'Desktop', 'Documents', '.local/bin', 'bin'].map(x => path.join(h, x)).concat(['/opt'])) imgs.push(...scanDir(d, n => NAME_RE.test(n) && /\.appimage$/i.test(n)));
    const ai = newest(imgs); if (ai) return { found: true, how: 'AppImage', path: ai, kind: 'appimage' };
  } else if (process.platform === 'win32') {
    const roots = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(h, 'Downloads'), path.join(h, 'Desktop'), path.join(h, 'Documents')].filter(Boolean);
    const exes = []; for (const d of roots) exes.push(...scanDir(d, n => NAME_RE.test(n) && /\.exe$/i.test(n) && !/setup|uninstall|installer/i.test(n), 2));
    const e = newest(exes); if (e) return { found: true, how: /portable/i.test(e) ? 'portable' : 'installed', path: e, kind: 'exe' };
  } else if (process.platform === 'darwin') {
    for (const d of ['/Applications', path.join(h, 'Applications')]) { const a = path.join(d, 'Anti-Social.app'); if (isDir(a)) return { found: true, how: 'installed', path: a, kind: 'mac' }; }
  }
  return { found: false };
}
const DIR = () => { const d = path.join(app.getPath('documents'), 'Sudo Make Art', 'Profile decorations'); fs.mkdirSync(d, { recursive: true }); return d; };
async function send(text, fileName) {
  text = String(text || ''); let d; try { d = JSON.parse(text); } catch (e) { d = null; }
  if (!d || d.format !== 'anti-social-decorations' || !Array.isArray(d.items) || !d.items.length) throw new Error('That is not a decoration pack (.asdeco).');
  if (text.length > 16 * 1024 * 1024) throw new Error('That pack is too big for Anti-Social (16 MB at most).');
  const base = String(fileName || 'my-decorations').replace(/[^\w .-]+/g, '_').replace(/\.asdeco$/i, '').slice(0, 60) || 'my-decorations', file = path.join(DIR(), base + '.asdeco');
  fs.writeFileSync(file, text); const f = await find(); if (!f.found) return { found: false, file };
  const detach = (cmd, args) => { const p = spawn(cmd, args, { detached: true, stdio: 'ignore', cwd: path.dirname(file) }); p.on('error', () => {}); p.unref(); };
  if (f.kind === 'mac') detach('open', ['-a', f.path, '--args', '--import-decorations', file]);
  else { if (f.kind === 'appimage') { try { fs.accessSync(f.path, fs.constants.X_OK); } catch (e) { fs.chmodSync(f.path, 0o755); } } detach(f.path, ['--import-decorations', file]); }
  return { found: true, how: f.how, appPath: f.path, file, items: d.items.length };
}
function register() {
  ipcMain.handle('antisocial:find', () => find());
  ipcMain.handle('antisocial:send', (e, text, name) => send(text, name));
}
module.exports = { register, find, send };
