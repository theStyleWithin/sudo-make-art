'use strict';
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const ai = require('./ai');
const path = require('path');

const root = path.join(__dirname, '..');
const indexUrl = require('url').pathToFileURL(path.join(root, 'index.html')).href;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'Sudo Make Art', backgroundColor: '#1e1f26', show: false,
    icon: path.join(root, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(indexUrl);

  // The app is fully local: never navigate away from it, and never open new in-app windows.
  win.webContents.on('will-navigate', (e, url) => { if (url !== indexUrl) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return win;
}

// WebM -> MP4 with the bundled FFmpeg. Runs locally; nothing is uploaded.
const ffmpegPath = () => require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
ipcMain.handle('video:to-mp4', async (event, data) => {
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > 4 * 1024 ** 3) throw new Error('Invalid video data');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sma-'));
  const input = path.join(dir, 'in.webm'), output = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(input, Buffer.from(data));
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath(), ['-y', '-i', input, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = ''; p.stderr.on('data', d => { err = (err + d).slice(-600); });
      p.on('error', reject); p.on('close', code => (code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err))));
    });
    const out = fs.readFileSync(output);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

ai.register();
app.setName('Sudo Make Art');
Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
