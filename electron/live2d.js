'use strict';
// Live2D support for Sudo Make VTuber. Live2D's "Cubism Core" is proprietary and is not part of this app. It is only fetched
// when the user reads Live2D's licence terms, ticks the box that accepts them, and presses the download button. It comes from
// Live2D's own address, is checked to be Live2D's file, and is saved in the app's data folder. It is served to the page through
// a private "sma-rt" address that serves only that one file. Nothing about the user or their models is sent anywhere.
const { app, ipcMain, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const URL_ = process.env.SMA_L2D_URL || 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
const LICENSE = 'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html';
const dir = () => { const d = path.join(process.env.SMA_RUNTIME_DIR || app.getPath('userData'), 'runtimes'); fs.mkdirSync(d, { recursive: true }); return d; };
const file = () => path.join(dir(), 'live2dcubismcore.min.js'), okFile = () => path.join(dir(), 'live2d-accepted.json');
protocol.registerSchemesAsPrivileged([{ scheme: 'sma-rt', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function status() { let installed = false, size = 0, accepted = null; try { const st = fs.statSync(file()); size = st.size; installed = st.isFile() && size > 100000; } catch (e) {} try { accepted = JSON.parse(fs.readFileSync(okFile(), 'utf8')).at; } catch (e) {} return { installed, size, accepted, license: LICENSE, url: URL_ }; }
async function download(accepted) {
  if (accepted !== true) throw new Error('Please accept Live2D’s licence first.');
  const u = new URL(URL_); if (u.protocol !== 'https:' && !process.env.SMA_L2D_URL) throw new Error('Blocked: it must come over https.');
  const res = await fetch(URL_, { redirect: 'error' }); if (!res.ok) throw new Error('The download failed (' + res.status + ').');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100000 || buf.length > 5e6 || !buf.slice(0, 400).toString('utf8').includes('Live2D Cubism Core')) throw new Error('That is not the file this app expected from Live2D, so it was not kept.');
  const part = file() + '.part'; fs.writeFileSync(part, buf); fs.renameSync(part, file()); fs.writeFileSync(okFile(), JSON.stringify({ at: new Date().toISOString(), url: URL_, size: buf.length }));
  return status();
}
function register() {
  ipcMain.handle('l2d:status', () => status());
  ipcMain.handle('l2d:download', (e, accepted) => download(accepted));
  ipcMain.handle('l2d:remove', () => { fs.rmSync(file(), { force: true }); fs.rmSync(okFile(), { force: true }); return status(); });
  ipcMain.handle('l2d:license', () => { shell.openExternal(LICENSE); return true; });
  app.whenReady().then(() => protocol.handle('sma-rt', req => { // only the one core file
    const u = new URL(req.url); if (u.pathname !== '/live2dcubismcore.min.js') return new Response('Not found', { status: 404 });
    try { return new Response(fs.readFileSync(file()), { headers: { 'content-type': 'text/javascript' } }); } catch (e) { return new Response('Not installed', { status: 404 }); } }));
}
module.exports = { register };
