'use strict';
// Sudo Make VTuber: the face-tracking model is the only thing that is ever downloaded, and only when the user presses the
// button for it. It is one fixed file (MediaPipe's Face Landmarker, Apache-2.0) from Google's model storage, checked against
// the size and SHA-256 this app expects before it is kept. Everything else (the tracking code) ships inside the app.
const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL_ = process.env.SMA_VT_MODEL_URL || 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const SHA = process.env.SMA_VT_MODEL_SHA || '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff', SIZE = +process.env.SMA_VT_MODEL_SIZE || 3758596;
const dir = () => { const d = path.join(app.getPath('userData'), 'models'); fs.mkdirSync(d, { recursive: true }); return d; };
const file = () => path.join(dir(), 'face_landmarker.task');
let active = null;

function status() { try { const st = fs.statSync(file()); return { present: st.isFile() && st.size === SIZE, size: st.size, path: file(), url: URL_, expected: SIZE }; } catch (e) { return { present: false, size: 0, path: file(), url: URL_, expected: SIZE }; } }
async function download(sender) {
  if (active) throw new Error('The face model is already downloading.');
  const u = new URL(URL_); if (u.protocol !== 'https:' && !process.env.SMA_VT_MODEL_URL) throw new Error('Blocked: the model must come over https.');
  active = new AbortController(); const part = file() + '.part', send = d => { if (!sender.isDestroyed()) sender.send('vtuber:progress', d); };
  try {
    const res = await fetch(URL_, { redirect: 'error', signal: active.signal }); if (!res.ok) throw new Error('The download failed (' + res.status + ').');
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(part), rd = res.body.getReader(); let got = 0, last = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (got > SIZE * 1.2) throw new Error('The file is bigger than expected, so it was stopped.'); hash.update(value); if (!out.write(value)) await new Promise(r => out.once('drain', r)); if (Date.now() - last > 200) { last = Date.now(); send({ got, total: SIZE }); } }
    await new Promise((r, j) => { out.end(); out.on('finish', r); out.on('error', j); });
    if (got !== SIZE || hash.digest('hex') !== SHA) { fs.rmSync(part, { force: true }); throw new Error('The downloaded file did not match what this app expects, so it was thrown away.'); }
    fs.renameSync(part, file()); send({ got, total: SIZE, done: true }); return status();
  } catch (e) { fs.rmSync(part, { force: true }); throw e; } finally { active = null; }
}
function register() {
  ipcMain.handle('vtuber:model-status', () => status());
  ipcMain.handle('vtuber:model-download', e => download(e.sender));
  ipcMain.handle('vtuber:model-cancel', () => { if (active) active.abort(); return true; });
  ipcMain.handle('vtuber:model-read', () => { const s = status(); if (!s.present) throw new Error('The face tracking model is not downloaded yet.'); return fs.readFileSync(file()); });
  ipcMain.handle('vtuber:model-remove', () => { fs.rmSync(file(), { force: true }); return status(); });
}
module.exports = { register };
