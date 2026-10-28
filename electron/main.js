'use strict';
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const ai = require('./ai');
const projects = require('./projects');
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

// Fast video export: the page renders every frame and streams JPEG frames here; FFmpeg (bundled, local) builds the MP4.
const ffmpegPath = () => process.env.SMA_FFMPEG || require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); // SMA_FFMPEG: use your own FFmpeg build (for example one with NVENC)
const vexports = new Map();
let nvenc = null; // use the NVIDIA hardware encoder when this FFmpeg build has it and the GPU accepts it; otherwise x264 on the CPU
function videoEncoder() {
  if (nvenc === null) {
    const r = require('child_process').spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x128:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'], { timeout: 8000 });
    nvenc = r.status === 0;
  }
  return nvenc ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '21', '-b:v', '0'] : ['-c:v', 'libx264', '-preset', 'superfast', '-crf', '20'];
}
const int = (v, lo, hi) => { v = Math.round(Number(v)); if (!Number.isFinite(v) || v < lo || v > hi) throw new Error('Invalid video settings'); return v; };
ipcMain.handle('vexport:start', (e, p) => {
  const w = int(p.w, 16, 7680), h = int(p.h, 16, 7680), fps = int(p.fps, 1, 120);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sma-vx-')), out = path.join(dir, 'out.mp4'), audio = path.join(dir, 'audio.wav');
  const hasAudio = p.wav instanceof ArrayBuffer && p.wav.byteLength > 44; if (hasAudio) fs.writeFileSync(audio, Buffer.from(p.wav));
  const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...(hasAudio ? ['-i', audio] : []),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', ...videoEncoder(), '-pix_fmt', 'yuv420p',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), '-movflags', '+faststart', out];
  const child = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  const job = { child, dir, out, err: '', closed: new Promise(res => child.on('close', code => res(code))) };
  child.stderr.on('data', d => { job.err = (job.err + d).slice(-600); }); child.stdin.on('error', () => {});
  const id = String(Date.now()) + Math.random().toString(36).slice(2, 6); vexports.set(id, job); return id;
});
ipcMain.handle('vexport:frame', async (e, id, data) => {
  const job = vexports.get(id); if (!job || !(data instanceof ArrayBuffer)) throw new Error('No such export');
  if (!job.child.stdin.write(Buffer.from(data))) await new Promise(res => job.child.stdin.once('drain', res));
});
ipcMain.handle('vexport:finish', async (e, id) => {
  const job = vexports.get(id); if (!job) throw new Error('No such export'); vexports.delete(id);
  try { job.child.stdin.end(); const code = await job.closed; if (code !== 0) throw new Error('ffmpeg failed: ' + job.err.trim().split('\n').slice(-2).join(' ')); const b = fs.readFileSync(job.out); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  finally { cleanupJob(job); }
});
const cleanupJob = job => { for (const x of job.extractors || []) { try { x.kill(); } catch (e) {} } fs.rmSync(job.dir, { recursive: true, force: true }); };
ipcMain.handle('vexport:cancel', (e, id) => { const job = vexports.get(id); if (!job) return; vexports.delete(id); job.child.kill(); cleanupJob(job); });

// FFmpeg decodes each video clip into a numbered image sequence (much faster than seeking a <video> frame by frame).
const okKey = k => typeof k === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(k);
ipcMain.handle('vexport:src-chunk', (e, id, key, offset, data) => {
  const job = vexports.get(id); if (!job || !okKey(key) || !(data instanceof ArrayBuffer)) throw new Error('No such export');
  const f = path.join(job.dir, 'src-' + key); if (offset === 0) fs.writeFileSync(f, Buffer.from(data)); else fs.appendFileSync(f, Buffer.from(data));
});
ipcMain.handle('vexport:extract', (e, id, p) => {
  const job = vexports.get(id); if (!job || !okKey(p.clipKey) || !okKey(p.srcKey)) throw new Error('No such export');
  const dir = path.join(job.dir, 'frames-' + p.clipKey); fs.mkdirSync(dir, { recursive: true });
  const W = int(p.w, 16, 7680), H = int(p.h, 16, 7680), fps = Number(p.fps), ss = Math.max(0, Number(p.ss) || 0), len = Math.max(0.05, Number(p.len) || 1);
  if (!(fps > 0.1 && fps <= 240)) throw new Error('Invalid frame rate');
  const x = spawn(ffmpegPath(), ['-y', '-ss', String(ss), '-t', String(len), '-i', path.join(job.dir, 'src-' + p.srcKey), '-an', '-vf', `fps=${fps},scale='min(iw,${W})':'min(ih,${H})':force_original_aspect_ratio=decrease:force_divisible_by=2`, '-q:v', '3', path.join(dir, '%06d.jpg')], { stdio: ['ignore', 'ignore', 'ignore'] });
  const rec = { dir, closed: false, code: null }; x.on('close', code => { rec.closed = true; rec.code = code; }); x.on('error', () => { rec.closed = true; rec.code = -1; });
  (job.extractors ||= []).push(x); (job.clips ||= new Map()).set(p.clipKey, rec);
});
ipcMain.handle('vexport:read-frame', async (e, id, clipKey, k) => {
  const job = vexports.get(id), rec = job && job.clips && job.clips.get(clipKey); if (!rec) return null;
  const file = n => path.join(rec.dir, String(n).padStart(6, '0') + '.jpg'); k = Math.max(1, Math.floor(k));
  for (let tries = 0; tries < 6000; tries++) { // up to ~60 s
    if (fs.existsSync(file(k + 1)) || (rec.closed && fs.existsSync(file(k)))) { const b = fs.readFileSync(file(k)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } // a frame is complete once the next one exists
    if (rec.closed) { // the clip ran out of frames: hold its last one
      for (let n = k - 1; n >= 1; n--) if (fs.existsSync(file(n))) { const b = fs.readFileSync(file(n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
      return null;
    }
    await new Promise(r => setTimeout(r, 10));
  }
  return null;
});

ai.register();
projects.register();
app.setName('Sudo Make Art');
Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
