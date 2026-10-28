'use strict';
const { app, BrowserWindow, Menu, shell } = require('electron');
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

app.setName('Sudo Make Art');
Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
