'use strict';
// Sudo Take Screenshot: take a picture of the screen, freeze it, and let the user
// point at one picture or block on it; the overlay page outlines it pixel exact. Click to save a PNG to
// <Pictures>/Sudo Make Art (it also goes on the clipboard and into the Sources library). Scroll picks a bigger or smaller
// box, dragging draws your own, Esc cancels. Only screen pixels are used; nothing is sent anywhere.
const { app, ipcMain, BrowserWindow, desktopCapturer, screen, clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

let active = null;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(sender, opts) {
  const textMode = !!(opts && opts.mode === 'text'); // Text Grab: hand back the picked region, save nothing
  if (active) throw new Error('A screenshot is already open. Press Esc in it first.');
  const parent = BrowserWindow.fromWebContents(sender), disp = parent ? screen.getDisplayMatching(parent.getBounds()) : screen.getPrimaryDisplay();
  active = true; const wasVisible = !!(parent && parent.isVisible());
  try {
    if (parent && wasVisible) { parent.hide(); await wait(450); } // out of the way, so the picture shows what is behind the app
    let img;
    if (process.env.SMA_PINPOINT_IMAGE) img = nativeImage.createFromPath(process.env.SMA_PINPOINT_IMAGE); // for tests
    else {
      const w = Math.round(disp.size.width * disp.scaleFactor), h = Math.round(disp.size.height * disp.scaleFactor);
      const list = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
      const src = list.find(s => s.display_id === String(disp.id)) || list[0]; img = src && src.thumbnail;
    }
    if (!img || img.isEmpty()) throw new Error('Could not take a picture of the screen. On Wayland your system may need to allow it.');
    const out = await overlay(disp, img, textMode);
    if (!out) return null;
    if (textMode) return { dataUrl: out };
    const dir = path.join(app.getPath('pictures'), 'Sudo Make Art'), t = new Date(), p2 = n => String(n).padStart(2, '0');
    const name = `Screenshot-${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}-${p2(t.getHours())}${p2(t.getMinutes())}${p2(t.getSeconds())}.png`;
    fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, name), png = Buffer.from(out.split(',')[1], 'base64'); fs.writeFileSync(file, png);
    try { clipboard.writeImage(nativeImage.createFromBuffer(png)); } catch (e) {}
    if (!wasVisible) { try { require('./tray').toast('Screenshot saved', file); } catch (e) {} }
    return { path: file, name, dataUrl: out };
  } finally { active = null; if (parent && !parent.isDestroyed() && wasVisible) { parent.show(); parent.focus(); } }
}

function overlay(disp, img, textMode) {
  return new Promise(resolve => {
    const b = disp.bounds;
    const win = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false, minimizable: false, skipTaskbar: true, fullscreenable: false, show: false, backgroundColor: '#000000', hasShadow: false,
      webPreferences: { preload: path.join(__dirname, 'pinpoint-preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.setAlwaysOnTop(true, 'screen-saver'); win.setMenuBarVisibility(false); let done = false;
    const finish = v => { if (done) return; done = true; ipcMain.removeHandler('pinpoint:image'); ipcMain.removeListener('pinpoint:done', onDone); resolve(v); if (!win.isDestroyed()) win.close(); };
    const onDone = (e, data) => { if (e.sender !== win.webContents) return; finish(typeof data === 'string' && /^data:image\/png;base64,/.test(data) && data.length < 80e6 ? data : null); };
    ipcMain.handle('pinpoint:image', e => { if (e.sender !== win.webContents) throw new Error('Not allowed'); return { dataUrl: img.toDataURL(), text: !!textMode }; });
    ipcMain.on('pinpoint:done', onDone); win.on('closed', () => finish(null));
    win.webContents.on('will-navigate', e => e.preventDefault()); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.once('ready-to-show', () => { win.show(); win.focus(); }); win.loadFile(path.join(__dirname, '..', 'src', 'pinpoint.html'));
  });
}
function register() { ipcMain.handle('pinpoint:start', (e, opts) => start(e.sender, opts)); }
module.exports = { register };
