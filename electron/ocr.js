'use strict';
// Text Grab: reads text out of a picture with tesseract.js (Apache-2.0), fully offline. English is bundled inside the app
// (@tesseract.js-data/eng); no language or model is ever fetched unless the user clicks a download button. The picture
// never leaves this computer.
const path = require('path');
const { ipcMain, clipboard } = require('electron');
let worker = null, busy = Promise.resolve();

function langDir() {
  const dir = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
  return path.join(dir, '4.0.0_best_int').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}
async function get() {
  if (worker) return worker;
  const { createWorker } = require('tesseract.js');
  // langPath is a local folder, so the library never goes online; cacheMethod 'none' stops it writing a cache file
  worker = await createWorker('eng', 1, { langPath: langDir(), cacheMethod: 'none', gzip: true, logger: () => {} });
  return worker;
}
// Tidy what the engine returns: trim each line, drop trailing blanks, keep paragraph breaks.
function tidy(t) { return String(t || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function read(dataUrl) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || ''); if (!m) throw new Error('No picture to read.');
  const png = Buffer.from(m[1], 'base64'); if (png.length > 60e6) throw new Error('That picture is too big to read.');
  const job = busy.then(async () => { const w = await get(); const r = await w.recognize(png); return { text: tidy(r.data.text), confidence: Math.round(r.data.confidence || 0) }; });
  busy = job.catch(() => {}); return job;
}
function register() {
  ipcMain.handle('ocr:read', (e, dataUrl) => read(dataUrl));
  ipcMain.handle('ocr:copy', (e, text) => { clipboard.writeText(String(text || '')); return true; });
}
function stop() { if (worker) { const w = worker; worker = null; w.terminate().catch(() => {}); } }
module.exports = { register, read, stop, tidy };
