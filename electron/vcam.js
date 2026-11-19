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

const jobs = new Map(); // output kind -> { p (process), w, h, frames, err }
const changed = () => { try { require('./tray').refreshMenu(); } catch (e) {} };
const SYS = '/sys/class/video4linux';

// every camera device that is a loopback (a device other programs can read and this app can write)
function devices() {
  if (process.platform !== 'linux') return { ok: false, why: 'The virtual webcam is available on Linux. On Windows and macOS use Sudo Make Live or record to a file for now.', list: [], module: false };
  const module_ = fs.existsSync('/sys/module/v4l2loopback'); const list = [];
  try { for (const n of fs.readdirSync(SYS)) { if (!/^video\d+$/.test(n)) continue; let name = ''; try { name = fs.readFileSync(path.join(SYS, n, 'name'), 'utf8').trim(); } catch (e) {} if (module_ && (/loopback|dummy|virtual|sudo make/i.test(name))) { let w = false; try { fs.accessSync('/dev/' + n, fs.constants.W_OK); w = true; } catch (e) {} list.push({ path: '/dev/' + n, name: name || n, writable: w }); } } } catch (e) {}
  return { ok: true, module: module_, list, command: 'sudo apt install v4l2loopback-dkms   # (Debian, Ubuntu; other systems: your package manager)\nsudo modprobe v4l2loopback devices=1 video_nr=10 card_label="Sudo Make VTuber" exclusive_caps=1' };
}
// Three ways to send the picture out. They can run together, each one is its own small process.
//   v4l2  a virtual webcam on Linux (v4l2loopback device, written by the bundled FFmpeg)
//   ndi   an NDI source on the network, through an FFmpeg that was built with NDI support (the bundled one is not, because NDI's
//         software cannot be shipped with it; choose an NDI-enabled FFmpeg in the converter settings)
//   spout a Spout sender on Windows, through the small sma-spout helper (native/spout) that is built with the app
const { execFile } = require('child_process');
const spoutExe = () => process.env.SMA_SPOUT_EXE || [path.join(process.resourcesPath || '', 'bin', 'sma-spout.exe'), path.join(__dirname, '..', 'vendor', 'spout', 'win', 'sma-spout.exe')].find(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
let ndiOk = null;
const ndiCheck = () => new Promise(res => { if (ndiOk !== null && !process.env.SMA_TEST) return res(ndiOk); execFile(vconvert.ffmpegPath(), ['-hide_banner', '-formats'], { timeout: 8000, maxBuffer: 4e6 }, (e, out) => { ndiOk = !e && /libndi_newtek/.test(String(out)); res(ndiOk); }); });
async function outputs() {
  const ndi = await ndiCheck();
  return { v4l2: devices(), ndi: { ok: ndi, why: ndi ? '' : 'This needs an FFmpeg built with NDI support (libndi_newtek). NDI’s software cannot be bundled with the app, so install the NDI runtime and an NDI-enabled FFmpeg yourself and choose it in the converter settings.' }, spout: process.platform === 'win32' ? (spoutExe() ? { ok: true, why: '' } : { ok: false, why: 'The Spout helper is not part of this copy of the app.' }) : { ok: false, why: 'Spout is Windows-only.' } };
}
function start(sender, o) {
  const kind = ['v4l2', 'ndi', 'spout'].includes(o.kind) ? o.kind : 'v4l2'; if (jobs.has(kind)) throw new Error('This output is already running.');
  const w = Math.max(160, Math.min(kind === 'spout' ? 8192 : 3840, o.w | 0)), h = Math.max(120, Math.min(kind === 'spout' ? 8192 : 2160, o.h | 0)), fps = Math.max(5, Math.min(60, o.fps | 0 || 30));
  const test = process.env.SMA_VCAM_TEST_OUT, name = String(o.name || 'Sudo Make Art').replace(/[^\w .-]/g, '').slice(0, 60) || 'Sudo Make Art'; let cmd, args;
  if (kind === 'v4l2') { const out = String(o.device || ''); if (!test) { if (!/^\/dev\/video\d+$/.test(out) || !devices().list.some(d => d.path === out)) throw new Error('Pick one of the virtual camera devices from the list.'); }
    cmd = vconvert.ffmpegPath(); args = ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0', '-vf', 'format=yuv420p', ...(test ? ['-t', '30', '-f', 'matroska', '-y', test] : ['-f', 'v4l2', out])]; }
  else if (kind === 'ndi') { cmd = vconvert.ffmpegPath(); args = ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0', '-pix_fmt', 'bgra', '-f', 'libndi_newtek', name]; }
  else { if (process.platform !== 'win32' && !process.env.SMA_SPOUT_EXE) throw new Error('Spout is Windows-only.'); cmd = spoutExe(); if (!cmd) throw new Error('The Spout helper is not part of this copy of the app.'); args = [name, String(w), String(h)]; }
  const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true }); let err = '';
  p.stderr.on('data', d => { err = (err + d).slice(-500); }); p.stdin.on('error', () => {});
  const job = { p, w, h, frames: 0, err: () => err }; jobs.set(kind, job); p.on('exit', code => { if (jobs.get(kind) === job) { jobs.delete(kind); changed(); if (!sender.isDestroyed()) sender.send('vcam:ended', code, err.trim(), kind); } });
  p.on('error', e => { err = String(e.message); });
  changed(); return { w, h, fps, kind };
}
function frame(buf, kind) { const job = jobs.get(kind || 'v4l2'); if (!job) return false; const need = job.w * job.h * 4; if (!buf || buf.byteLength !== need) return false; if (job.p.stdin.writableLength > need * 4) return false; /* drop frames if the encoder falls behind */ job.p.stdin.write(Buffer.from(buf)); job.frames++; return true; }
function stopOne(kind) { const job = jobs.get(kind); if (job) { const p = job.p; jobs.delete(kind); changed(); try { p.stdin.end(); } catch (e) {} setTimeout(() => { try { p.kill(); } catch (e) {} }, 800); } }
function stop(kind) { if (kind) stopOne(kind); else for (const k of [...jobs.keys()]) stopOne(k); return true; }
function register() {
  ipcMain.handle('vcam:devices', () => devices());
  ipcMain.handle('vcam:outputs', () => outputs());
  ipcMain.handle('vcam:start', (e, o) => start(e.sender, o || {}));
  ipcMain.on('vcam:frame', (e, buf, kind) => frame(buf, kind));
  ipcMain.handle('vcam:stop', (e, kind) => stop(kind ? String(kind) : undefined));
  ipcMain.handle('vcam:state', (e, kind) => { const j = jobs.get(kind || 'v4l2'); return { running: !!j, frames: j ? j.frames : 0, err: j ? j.err() : '' }; });
}
module.exports = { register, stop, running: () => jobs.has('v4l2'), outputs };
