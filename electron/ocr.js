'use strict';
// Text Grab: reads text out of a picture with tesseract.js (Apache-2.0), fully offline. English is bundled inside the app
// (@tesseract.js-data/eng); no language or model is ever fetched unless the user clicks a download button. The picture
// never leaves this computer.
const path = require('path');
const { ipcMain, clipboard } = require('electron');
let child = null, seq = 0, idle = null, busy = Promise.resolve(); const waiting = new Map();
const unpacked = p => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

function langDir() { return unpacked(path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int')); }
// tesseract.js picks a browser-style path when it sees Electron, so it runs in its own plain-Node process (Electron's own
// binary in "run as node" mode) with a small --require that hides the Electron flag. It is started on first use and
// shut down after two idle minutes so it holds no memory.
function proc() {
  if (child && child.connected) return child;
  const { fork } = require('child_process'), pre = unpacked(path.join(__dirname, 'ocr-pre.js'));
  child = fork(unpacked(path.join(__dirname, 'ocr-child.js')), [], { execPath: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: `--require "${pre}"` }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const me = child;
  me.on('message', m => { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); m.error ? w.rej(new Error(m.error)) : w.res(m); });
  me.on('exit', () => { if (child === me) child = null; for (const [id, w] of waiting) { waiting.delete(id); w.rej(new Error('The text reader stopped. Try again.')); } });
  return me;
}
function ask(png) {
  clearTimeout(idle); const c = proc(), id = ++seq;
  return new Promise((res, rej) => { waiting.set(id, { res, rej }); c.send({ id, png: png.toString('base64'), langPath: langDir() }); })
    .finally(() => { clearTimeout(idle); idle = setTimeout(stop, 120000); if (idle.unref) idle.unref(); });
}
// Tidy what the engine returns: trim each line, drop trailing blanks, keep paragraph breaks.
function tidy(t) { return String(t || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function read(dataUrl) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || ''); if (!m) throw new Error('No picture to read.');
  const png = Buffer.from(m[1], 'base64'); if (png.length > 60e6) throw new Error('That picture is too big to read.');
  const job = busy.then(async () => { const r = await ask(png); return { text: tidy(r.text), confidence: Math.round(r.confidence || 0) }; });
  busy = job.catch(() => {}); return job;
}
function register() {
  ipcMain.handle('ocr:read', (e, dataUrl) => read(dataUrl));
  ipcMain.handle('ocr:copy', (e, text) => { clipboard.writeText(String(text || '')); return true; });
}
function stop() { if (child) { const c = child; child = null; try { c.kill(); } catch (e) {} } }
module.exports = { register, read, stop, tidy };
