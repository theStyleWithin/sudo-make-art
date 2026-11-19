'use strict';
// System tray (modelled on HopCast's tray): an icon with a menu to show or hide the app, go live, record, take a screenshot,
// jump to a mode, and quit; options to minimize to the tray, start in the tray, and keep running in the tray when you close
// the window while live or recording; and desktop notifications when a channel drops and reconnects.
// Everything is local. On some Linux desktops (GNOME) a tray icon needs the AppIndicator extension; KDE and most others
// show it as is.
const { app, Tray, Menu, nativeImage, Notification, ipcMain, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = { enabled: true, minToTray: false, startInTray: false, keepRunning: true, closeToTray: false, notify: true };
let prefs = { ...DEFAULTS }, tray = null, win = null, quitting = false, liveState = { live: false, dests: [] }, prev = new Map(), lastTip = '';
const prefFile = () => path.join(app.getPath('userData'), 'tray-prefs.json');
const loadPrefs = () => { try { const j = JSON.parse(fs.readFileSync(prefFile(), 'utf8')); prefs = { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).filter(k => typeof j[k] === 'boolean').map(k => [k, j[k]])) }; } catch (e) { prefs = { ...DEFAULTS }; } };
const savePrefs = () => { try { fs.mkdirSync(path.dirname(prefFile()), { recursive: true }); fs.writeFileSync(prefFile(), JSON.stringify(prefs), { mode: 0o600 }); } catch (e) {} };
const alive = () => win && !win.isDestroyed();
const recording = () => liveState.dests.some(d => d.id === 'record' && d.state !== 'stopped');
const busy = () => !!liveState.live; // streaming or recording both run through the live session

function showWindow() { if (!alive()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function hideWindow() { if (alive()) win.hide(); }
function toggleWindow() { if (!alive()) return; if (win.isVisible() && !win.isMinimized() && win.isFocused()) hideWindow(); else showWindow(); }
function send(cmd, extra) { if (alive()) win.webContents.send('tray:cmd', { cmd, ...extra }); }

function icon() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  return img.isEmpty() ? img : img.resize({ width: process.platform === 'win32' ? 16 : 22, height: process.platform === 'win32' ? 16 : 22 });
}
function menu() {
  const visible = alive() && win.isVisible() && !win.isMinimized(), live = busy(), rec = recording(), streaming = liveState.dests.some(d => d.kind === 'channel');
  const modes = [['home', 'Home'], ['design', 'Design'], ['video', 'Video'], ['live', 'Live'], ['vtrim', 'Trim video'], ['vconvert', 'Convert videos'], ['convert', 'Convert images']];
  return Menu.buildFromTemplate([
    { label: live ? (streaming ? '● Live' : '● Running') + (rec ? ' · recording' : '') : 'Sudo Make Art', enabled: false },
    { type: 'separator' },
    { label: visible ? 'Hide' : 'Show', click: toggleWindow },
    { type: 'separator' },
    { label: streaming ? 'Stop streaming' : 'Go Live', click: () => send('golive') },
    { label: rec ? 'Stop recording' : 'Start recording', click: () => send('record') },
    { label: 'Sudo Take Screenshot', click: () => send('screenshot') },
    { type: 'separator' },
    { label: 'Open', submenu: modes.map(([m, l]) => ({ label: l, click: () => { showWindow(); send('mode', { mode: m }); } })) },
    { label: 'New design…', click: () => { showWindow(); send('newdesign'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}
function refresh() {
  if (!tray) return; tray.setContextMenu(menu());
  const tip = busy() ? 'Sudo Make Art: live' + (recording() ? ' and recording' : '') : 'Sudo Make Art'; if (tip !== lastTip) { tray.setToolTip(tip); lastTip = tip; }
}
function ensureTray() {
  if (prefs.enabled && !tray) { try { tray = new Tray(icon()); tray.on('click', toggleWindow); tray.on('double-click', showWindow); refresh(); } catch (e) { tray = null; } }
  else if (!prefs.enabled && tray) { tray.destroy(); tray = null; }
}
function toast(title, body) { if (!prefs.notify || !Notification.isSupported()) return; try { new Notification({ title, body, silent: false }).show(); } catch (e) {} }

// live session changes: refresh the menu and tell the user (like HopCast's tray messages) when a channel drops or comes back
function onLive(s) {
  liveState = s && s.live ? s : { live: false, dests: [] };
  for (const d of liveState.dests) { if (d.kind !== 'channel') continue; const was = prev.get(d.id);
    if (was && was !== d.state) { if (d.state === 'retrying' || d.state === 'failed') toast(d.name, 'Disconnected. Reconnecting…'); else if (d.state === 'live' && (was === 'retrying' || was === 'failed')) toast(d.name, 'Back online.'); }
    prev.set(d.id, d.state); }
  if (!liveState.live) prev.clear(); refresh();
}

function attach(window) {
  win = window; loadPrefs(); ensureTray();
  win.on('minimize', () => { if (prefs.enabled && prefs.minToTray && tray) setImmediate(() => { if (alive()) { win.hide(); refresh(); } }); });
  win.on('close', e => {
    if (quitting || !prefs.enabled || !tray) return;
    if (prefs.closeToTray || (prefs.keepRunning && busy())) { e.preventDefault(); win.hide(); refresh(); if (busy()) toast('Sudo Make Art', 'Still running in the tray. Use the tray icon to stop or quit.'); }
  });
  win.on('show', refresh); win.on('hide', refresh);
  if (prefs.enabled && prefs.startInTray && tray) win.once('ready-to-show', () => setImmediate(() => { if (alive()) win.hide(); refresh(); }));
}
function register() {
  ipcMain.handle('tray:prefs', () => ({ ...prefs, supported: true }));
  ipcMain.handle('tray:set', (e, p) => { for (const k of Object.keys(DEFAULTS)) if (p && typeof p[k] === 'boolean') prefs[k] = p[k]; savePrefs(); ensureTray(); refresh(); return { ...prefs }; });
  ipcMain.handle('tray:show', () => { showWindow(); return true; });
  app.on('before-quit', () => { quitting = true; });
}
module.exports = { register, attach, onLive, toast, isHidden: () => !alive() || !win.isVisible() };
if (process.env.SMA_TEST) global.__smaTray = { state: () => ({ hasTray: !!tray, prefs: { ...prefs }, visible: alive() && win.isVisible(), destroyed: !alive() }), cmd: send, onLive, menuLabels: () => (tray ? menu().items.map(i => i.label) : []) }; // for the automated tests only
