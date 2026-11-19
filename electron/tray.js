'use strict';
// System tray (modelled on HopCast's tray): an icon with a menu to show or hide the app, go live, record, take a screenshot,
// jump to a mode, and quit; options to minimize to the tray, start in the tray, and keep running in the tray when you close
// the window while live or recording; and desktop notifications when a channel drops and reconnects.
// Everything is local. On some Linux desktops (GNOME) a tray icon needs the AppIndicator extension; KDE and most others
// show it as is.
const { app, Tray, Menu, nativeImage, Notification, ipcMain, BrowserWindow } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULTS = { enabled: true, minToTray: false, startInTray: false, keepRunning: true, closeToTray: false, notify: true };
// Linux: a tray icon only shows if the desktop runs a tray host (KDE and most do; GNOME needs the AppIndicator extension).
// If none is running, hiding the window would leave nobody able to bring it back, so the window is never hidden in that case.
let hostOk = true;
// Wayland (KDE Plasma, GNOME): a hidden window cannot reliably be mapped again by the app, but a minimized one can always be restored, so there "hiding to the tray" means minimizing it without a task bar entry.
const wayland = process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);
const checkHost = () => new Promise(res => { if (process.platform !== 'linux') return res(true); execFile('dbus-send', ['--session', '--print-reply', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.NameHasOwner', 'string:org.kde.StatusNotifierWatcher'], { timeout: 2000 }, (e, out) => res(e ? true : /boolean true/.test(String(out)))); });
let prefs = { ...DEFAULTS }, tray = null, win = null, quitting = false, liveState = { live: false, dests: [] }, prev = new Map(), lastTip = '';
const prefFile = () => path.join(app.getPath('userData'), 'tray-prefs.json');
const loadPrefs = () => { try { const j = JSON.parse(fs.readFileSync(prefFile(), 'utf8')); prefs = { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).filter(k => typeof j[k] === 'boolean').map(k => [k, j[k]])) }; } catch (e) { prefs = { ...DEFAULTS }; } };
const savePrefs = () => { try { fs.mkdirSync(path.dirname(prefFile()), { recursive: true }); fs.writeFileSync(prefFile(), JSON.stringify(prefs), { mode: 0o600 }); } catch (e) {} };
const alive = () => win && !win.isDestroyed();
const recording = () => liveState.dests.some(d => d.id === 'record' && d.state !== 'stopped');
const busy = () => !!liveState.live; // streaming or recording both run through the live session

// Bring the window back from the tray. Some Linux window managers keep a hidden window "minimized", so it is shown first and
// restored after, and it is raised and focused (a desktop's focus-stealing protection can otherwise leave it behind other windows).
function showWindow() {
  if (!alive()) return; win.setSkipTaskbar(false); if (!win.isVisible()) win.show(); if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(true); win.moveTop(); win.focus(); win.setAlwaysOnTop(false);
  setTimeout(() => { if (alive() && win.isMinimized()) win.restore(); if (alive() && !win.isVisible()) win.show(); }, 200);
  verifyShown();
}
// If the window still has not come back, try the other way once; if that fails too, switch hiding to the tray off, so nobody is ever locked out.
let verifying = false;
function verifyShown() {
  if (verifying) return; verifying = true;
  setTimeout(() => { if (alive() && (!win.isVisible() || win.isMinimized())) { try { win.setSkipTaskbar(false); win.minimize(); } catch (e) {} setTimeout(() => { if (alive()) { win.restore(); win.show(); win.focus(); } }, 250); }
    setTimeout(() => { verifying = false; if (alive() && (!win.isVisible() || win.isMinimized())) { prefs.minToTray = false; prefs.startInTray = false; prefs.closeToTray = false; prefs.keepRunning = false; savePrefs(); refresh(); toast('Sudo Make Art', 'The window could not be brought back from the tray, so hiding to the tray was switched off. Start the app again to see it.'); } }, 1500); }, 800);
}
function tuck() { if (!alive()) return; if (wayland) { win.setSkipTaskbar(true); if (!win.isMinimized()) win.minimize(); } else win.hide(); refresh(); }
function hideWindow() { tuck(); }
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
    { label: 'Text Grab (copy text from the screen)', click: () => send('textgrab') },
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
  win = window; loadPrefs(); if (process.argv.includes('--reset-tray')) { prefs = { ...DEFAULTS }; savePrefs(); } ensureTray();
  win.on('minimize', () => { if (prefs.enabled && prefs.minToTray && tray && hostOk) setImmediate(() => { if (!alive()) return; if (wayland) { win.setSkipTaskbar(true); refresh(); } else { win.restore(); win.hide(); refresh(); } }); }); // restored first, so it is hidden in a clean state
  win.on('close', e => {
    if (quitting || !prefs.enabled || !tray || !hostOk) return;
    if (prefs.closeToTray || (prefs.keepRunning && busy())) { e.preventDefault(); tuck(); if (busy()) toast('Sudo Make Art', 'Still running in the tray. Use the tray icon to stop or quit.'); }
  });
  win.on('show', refresh); win.on('hide', refresh);
  checkHost().then(ok => { hostOk = ok; refresh(); });
  if (prefs.enabled && prefs.startInTray && tray && !process.argv.includes('--show')) win.once('ready-to-show', () => checkHost().then(ok => { hostOk = ok; setImmediate(() => { if (alive() && hostOk) tuck(); refresh(); }); }));
}
function register() {
  ipcMain.handle('tray:prefs', () => ({ ...prefs, supported: hostOk }));
  ipcMain.handle('tray:set', (e, p) => { for (const k of Object.keys(DEFAULTS)) if (p && typeof p[k] === 'boolean') prefs[k] = p[k]; savePrefs(); ensureTray(); refresh(); return { ...prefs }; });
  ipcMain.handle('tray:show', () => { showWindow(); return true; });
  ipcMain.handle('tray:reset', () => { prefs = { ...DEFAULTS }; savePrefs(); ensureTray(); refresh(); return { ...prefs }; });
  app.on('before-quit', () => { quitting = true; });
}
module.exports = { register, attach, onLive, toast, showWindow, isHidden: () => !alive() || !win.isVisible() };
if (process.env.SMA_TEST) global.__smaTray = { state: () => ({ hasTray: !!tray, prefs: { ...prefs }, visible: alive() && win.isVisible(), destroyed: !alive() }), cmd: send, onLive, menuLabels: () => (tray ? menu().items.map(i => i.label) : []), click: label => { const it = menu().items.find(i => i.label === label); if (it && it.click) { it.click(); return true; } return false; }, toggle: () => toggleWindow(), show: () => showWindow(), winState: () => (alive() ? { visible: win.isVisible(), minimized: win.isMinimized(), focused: win.isFocused(), fullscreen: win.isFullScreen() } : null) }; // for the automated tests only
