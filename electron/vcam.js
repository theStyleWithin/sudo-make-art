'use strict';
// Virtual webcam for Sudo Make VTuber (Linux): sends the avatar's picture to a "v4l2loopback" camera device, so Zoom, Discord,
// OBS, a browser and so on can pick it as a webcam. The device is created by the system, not by this app: installing the
// v4l2loopback package and loading its module needs administrator rights, so the app only shows the command and then uses the
// device. The picture goes to the bundled FFmpeg, which writes it to the device. Nothing leaves this computer.
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const vconvert = require('./vconvert');

let job = null;
const changed = () => { try { require('./tray').refreshMenu(); } catch (e) {} };
const SYS = '/sys/class/video4linux';

// every camera device that is a loopback (a device other programs can read and this app can write)
function devices() {
  if (process.platform !== 'linux') return { ok: false, why: 'The virtual webcam is available on Linux. On Windows and macOS use Sudo Make Live or record to a file for now.', list: [], module: false };
  const module_ = fs.existsSync('/sys/module/v4l2loopback'); const list = [];
  try { for (const n of fs.readdirSync(SYS)) { if (!/^video\d+$/.test(n)) continue; let name = ''; try { name = fs.readFileSync(path.join(SYS, n, 'name'), 'utf8').trim(); } catch (e) {} if (module_ && (/loopback|dummy|virtual|sudo make/i.test(name))) { let w = false; try { fs.accessSync('/dev/' + n, fs.constants.W_OK); w = true; } catch (e) {} list.push({ path: '/dev/' + n, name: name || n, writable: w }); } } } catch (e) {}
  return { ok: true, module: module_, list, command: 'sudo apt install v4l2loopback-dkms   # (Debian, Ubuntu; other systems: your package manager)\nsudo modprobe v4l2loopback devices=1 video_nr=10 card_label="Sudo Make VTuber" exclusive_caps=1' };
}
function start(sender, o) {
  if (job) throw new Error('The virtual webcam is already running.');
  const w = Math.max(160, Math.min(3840, o.w | 0)), h = Math.max(120, Math.min(2160, o.h | 0)), fps = Math.max(5, Math.min(60, o.fps | 0 || 30));
  let out = String(o.device || '');
  const test = process.env.SMA_VCAM_TEST_OUT; // tests write to a file instead of a camera device
  if (!test) { if (!/^\/dev\/video\d+$/.test(out) || !devices().list.some(d => d.path === out)) throw new Error('Pick one of the virtual camera devices from the list.'); }
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0', '-vf', 'format=yuv420p', ...(test ? ['-t', '30', '-f', 'matroska', '-y', test] : ['-f', 'v4l2', out])];
  const p = spawn(vconvert.ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true }); let err = '';
  p.stderr.on('data', d => { err = (err + d).slice(-500); }); p.stdin.on('error', () => {});
  job = { p, w, h, frames: 0, err: () => err }; p.on('exit', code => { if (job && job.p === p) { job = null; changed(); if (!sender.isDestroyed()) sender.send('vcam:ended', code, err.trim()); } });
  changed(); return { w, h, fps };
}
function frame(buf) { if (!job) return false; const need = job.w * job.h * 4; if (!buf || buf.byteLength !== need) return false; if (job.p.stdin.writableLength > need * 4) return false; /* drop frames if FFmpeg falls behind */ job.p.stdin.write(Buffer.from(buf)); job.frames++; return true; }
function stop() { if (job) { const p = job.p; job = null; changed(); try { p.stdin.end(); } catch (e) {} setTimeout(() => { try { p.kill(); } catch (e) {} }, 800); } return true; }
function register() {
  ipcMain.handle('vcam:devices', () => devices());
  ipcMain.handle('vcam:start', (e, o) => start(e.sender, o || {}));
  ipcMain.on('vcam:frame', (e, buf) => frame(buf));
  ipcMain.handle('vcam:stop', () => stop());
  ipcMain.handle('vcam:state', () => ({ running: !!job, frames: job ? job.frames : 0, err: job ? job.err() : '' }));
}
module.exports = { register, stop, running: () => !!job };
