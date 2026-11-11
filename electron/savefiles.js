'use strict';
// Saves a batch of files (every card of a deck, picture sheets) into a folder you choose. Original code for this project.
// The file names are cleaned, existing files are never overwritten (a number is added instead), and nothing leaves your computer.
const { ipcMain, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const clean = n => String(n || 'file').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/^\.+/, '').trim().slice(0, 100) || 'file';
function unique(dir, name) { const ext = path.extname(name), base = path.basename(name, ext); let n = name, i = 1; while (fs.existsSync(path.join(dir, n))) n = `${base} (${++i})${ext}`; return n; }
function register() {
  ipcMain.handle('savefiles:save', async (e, files, title) => {
    if (!Array.isArray(files) || !files.length || files.length > 2000) throw new Error('Nothing to save');
    let total = 0; for (const f of files) { if (!f || !(f.data instanceof Uint8Array)) throw new Error('Bad file data'); total += f.data.length; } if (total > 1.5e9) throw new Error('That is too much to save at once.');
    const win = BrowserWindow.fromWebContents(e.sender);
    const dir = process.env.SMA_SAVE_DIR || (await dialog.showOpenDialog(win, { title: String(title || 'Choose where to save the files').slice(0, 80), properties: ['openDirectory', 'createDirectory'] })).filePaths[0];
    if (!dir) return { cancelled: true };
    const out = []; for (const f of files) { const name = unique(dir, clean(f.name)); fs.writeFileSync(path.join(dir, name), Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength)); out.push(name); }
    return { dir, count: out.length, names: out };
  });
}
module.exports = { register };
