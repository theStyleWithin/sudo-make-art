'use strict';
// Turns a finished document into a PDF with real, selectable text. Original code for this project.
// The page is drawn by Electron's own print engine in a hidden window that has no scripts and no network, from a temporary file that is deleted afterwards.
const { ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PAGES = { a4: [210, 297], letter: [215.9, 279.4], a5: [148, 210], legal: [215.9, 355.6] }, MARGINS = { normal: 25.4, narrow: 12.7, wide: 38.1 };
const inch = mm => mm / 25.4;
function register() {
  ipcMain.handle('writepdf:render', async (e, html, o) => {
    if (typeof html !== 'string' || html.length < 20 || html.length > 190e6) throw new Error('Nothing to print.'); o = o || {};
    const [pw, ph] = PAGES[o.page] || PAGES.a4, m = MARGINS[o.margin] || MARGINS.normal;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sma-pdf-')), file = path.join(dir, 'doc.html'); fs.writeFileSync(file, html);
    const win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, partition: 'writepdf-' + Date.now() } });
    try {
      win.webContents.session.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !d.url.startsWith('file:') && !d.url.startsWith('data:') }));
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', ev => ev.preventDefault());
      await win.loadFile(file);
      const pdf = await win.webContents.printToPDF({ pageSize: { width: inch(pw), height: inch(ph) }, margins: { top: inch(m), bottom: inch(m), left: inch(m), right: inch(m) }, printBackground: true, displayHeaderFooter: !!o.numbers, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;font-family:sans-serif"><span class="pageNumber"></span></div>' });
      return new Uint8Array(pdf);
    } finally { try { win.destroy(); } catch (err) {} fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
module.exports = { register };
