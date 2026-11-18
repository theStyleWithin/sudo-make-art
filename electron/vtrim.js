'use strict';
// Trim video: cut one piece out of a video, either losslessly (the video and audio are copied, never re-encoded, so it is fast and loses no quality;
// the cut can only start on a keyframe) or exactly (re-encoded, frame accurate). Original code for this project; it works the way GNOME's Video Trimmer does.
// The page plays the chosen file through a private "sma-media" address that only serves files you picked, with seeking.
const { app, ipcMain, dialog, shell, protocol, net, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const metaFlags = require('./metaflags');
const { pathToFileURL } = require('url');
const { ff, probe, ffmpegPath, VIDEO_EXT, fail } = require('./vconvert');

protocol.registerSchemesAsPrivileged([{ scheme: 'sma-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const files = new Map();                     // token -> { path, name, info, keyframes, temp }
let current = null, tempDir = null, job = null, kfProc = null;
const tok = () => crypto.randomBytes(9).toString('hex');
const mediaUrl = t => 'sma-media://v/' + t;
const sec = n => (Math.round(n * 1000) / 1000).toFixed(3);
function cleanTemp() { if (tempDir) { fs.rmSync(tempDir, { recursive: true, force: true }); tempDir = null; } }

// ---------- looking at a video ----------
async function describe(file) {
  const { err } = await ff(['-hide_banner', '-i', file], null, { keepErr: true }), p = await probe(file, null);
  if (!p.vcodec) throw new Error('No video found in this file.'); if (!(p.duration > 0)) throw new Error('This video does not say how long it is, so it cannot be trimmed here.');
  const fps = err.match(/Video:[^\n]*?,\s*(\d+(?:\.\d+)?)\s*fps/), start = err.match(/start:\s*(-?[\d.]+)/), ac = err.match(/Audio:\s*([a-z0-9_]+)/i), tracks = (err.match(/Stream #\d+:\d+[^\n]*Audio:/g) || []).length;
  return { duration: p.duration, width: p.width, height: p.height, vcodec: p.vcodec, acodec: ac ? ac[1].toLowerCase() : null, audioTracks: tracks, fps: fps ? +fps[1] : 25, startTime: start ? +start[1] : 0 };
}
async function open(file) {
  if (typeof file !== 'string' || !VIDEO_EXT.has(path.extname(file).toLowerCase())) throw new Error('That is not a video file this app knows.');
  const st = fs.statSync(file); if (!st.isFile()) throw new Error('That is not a file.');
  if (kfProc) { try { kfProc.kill(); } catch (e) {} kfProc = null; } cleanTemp(); files.clear();
  const info = await describe(file), token = tok(); files.set(token, { path: file, name: path.basename(file), info, keyframes: null }); current = token;
  return { token, url: mediaUrl(token), name: path.basename(file), size: st.size, ...info };
}
// Where can a lossless cut start? Only keyframes are decoded, so this is quick even for long films. Results stream back as they are found.
function findKeyframes(token, send) {
  const f = files.get(token); if (!f) return Promise.resolve([]); if (f.keyframes) return Promise.resolve(f.keyframes);
  return new Promise(resolve => {
    const kf = [], c = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'info', '-skip_frame', 'nokey', '-i', f.path, '-map', '0:v:0', '-an', '-sn', '-vf', 'showinfo', '-fps_mode', 'passthrough', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); kfProc = c; let buf = '', last = 0;
    c.stderr.on('data', d => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) { if (!/iskey:1/.test(l)) continue; const m = /pts_time:\s*(-?[\d.]+)/.exec(l); if (m && kf.length < 60000) kf.push(Math.max(0, +m[1] - f.info.startTime)); } if (send && Date.now() - last > 500) { last = Date.now(); send(kf.length); } });
    const done = () => { if (kfProc === c) kfProc = null; kf.sort((a, b) => a - b); f.keyframes = kf.filter((v, i) => !i || v - kf[i - 1] > 0.0005); resolve(f.keyframes); };
    c.on('error', done); c.on('close', done);
  });
}
function oneThumb(file, t) { // a small picture of the video at time t
  return new Promise(res => { const c = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', sec(t), '-i', file, '-frames:v', '1', '-vf', 'scale=-2:72', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '6', '-'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); const parts = []; c.stdout.on('data', d => parts.push(d)); c.on('error', () => res(null)); c.on('close', () => { const b = Buffer.concat(parts); res(b.length > 200 ? 'data:image/jpeg;base64,' + b.toString('base64') : null); }); setTimeout(() => { try { c.kill(); } catch (e) {} }, 20000); });
}
async function thumbs(token, count) {
  const f = files.get(token); if (!f) return []; const n = Math.round(clamp(count, 2, 40, 12)), out = new Array(n).fill(null), todo = [...out.keys()];
  const worker = async () => { while (todo.length) { const i = todo.shift(); out[i] = await oneThumb(f.path, Math.max(0, Math.min(f.info.duration - 0.2, (i + 0.5) / n * f.info.duration))); } };
  await Promise.all([worker(), worker(), worker()]); return out;
}

// ---------- the cut ----------
const snapBack = (kf, t) => { let r = 0; if (!kf || !kf.length) return t; for (const k of kf) { if (k <= t + 0.0005) r = k; else break; } return r; };
function trimArgs(spec, src, info, dest, seekTo, ext) {
  const a = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  if (spec.mode === 'exact') {
    a.push('-ss', sec(spec.start), '-i', src, '-t', sec(spec.end - spec.start), '-map', '0:v:0'); if (!spec.mute) a.push('-map', '0:a?'); if (ext === '.mkv') a.push('-map', '0:s?'); a.push('-map_metadata', '0');
    a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p'); if (spec.mute) a.push('-an'); else a.push('-c:a', 'aac', '-b:a', '192k'); if (ext === '.mkv') a.push('-c:s', 'copy'); else a.push('-sn'); if (ext === '.mp4') a.push('-movflags', '+faststart');
  } else {
    a.push('-ss', sec(seekTo), '-i', src, '-t', sec(Math.max(0.05, spec.end - seekTo)), '-map', '0:v:0'); if (!spec.mute) a.push('-map', '0:a?'); if (spec.full) { a.push('-map', '0:s?'); a.push('-map_chapters', '0'); } else a.push('-map_chapters', '-1'); a.push('-map_metadata', '0', '-c', 'copy'); if (spec.mute) a.push('-an'); a.push('-avoid_negative_ts', 'make_zero'); if (ext === '.mp4' || ext === '.m4v' || ext === '.mov') a.push('-movflags', '+faststart');
  }
  return [...metaFlags.apply([...a, dest], spec.stripMeta).slice(0, -1), '-progress', 'pipe:1', '-nostats', dest];
}
function runFf(args, onPct, total) {
  return new Promise((resolve, reject) => { const c = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); job.proc = c; let err = '', buf = '';
    c.stderr.on('data', d => { err = (err + d).slice(-1500); }); c.stdout.on('data', d => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) { const m = /^out_time_(?:us|ms)=(\d+)/.exec(l); if (m && total) onPct(Math.max(0, Math.min(99, Math.round(+m[1] / 1e6 / total * 100)))); } });
    c.on('error', reject); c.on('close', code => { if (job && job.cancelled) reject(new Error('Cancelled')); else resolve({ code, err }); }); });
}
async function doTrim(e, raw) {
  if (job) throw new Error('A cut is already running.');
  const f = files.get(raw && raw.token); if (!f || f.temp) throw new Error('Open a video first.');
  const spec = { token: raw.token, mode: raw.mode === 'exact' ? 'exact' : 'lossless', mute: !!raw.mute, stripMeta: !!raw.stripMeta, start: clamp(raw.start, 0, f.info.duration, 0), end: clamp(raw.end, 0, f.info.duration + 0.5, f.info.duration) };
  if (!(spec.end - spec.start >= 0.05)) throw new Error('The end must come after the start.');
  const srcExt = path.extname(f.path).toLowerCase(), exactExt = srcExt === '.mkv' ? '.mkv' : '.mp4', defExt = spec.mode === 'exact' ? exactExt : srcExt;
  const win = BrowserWindow.fromWebContents(e.sender), def = path.join(path.dirname(f.path), path.basename(f.path, srcExt) + ' (trimmed)' + defExt);
  let dest = process.env.SMA_SAVE_AS || (await dialog.showSaveDialog(win, { title: 'Save the trimmed video', defaultPath: def, filters: [{ name: 'Video', extensions: [defExt.slice(1)] }] })).filePath;
  if (!dest) return { cancelled: true };
  let ext = path.extname(dest).toLowerCase(); if (!VIDEO_EXT.has(ext) || (spec.mode === 'exact' && ext !== '.mp4' && ext !== '.mkv')) { dest += defExt; ext = defExt; }
  if (path.resolve(dest) === path.resolve(f.path)) throw new Error('Choose a different file name: the original is never replaced.');
  const kf = f.keyframes || await findKeyframes(raw.token), haveKf = !!(kf && kf.length), kfStart = spec.mode === 'lossless' ? snapBack(kf, spec.start) : spec.start, total = spec.mode === 'exact' ? spec.end - spec.start : spec.end - kfStart;
  // Seeking exactly onto a keyframe can land on the one before it (Matroska does this, and any video with B-frames can), so a lossless cut seeks half a gap past it:
  // never more than 0.2 s, and never more than half the distance to the next keyframe. The result then starts on that keyframe, whatever the container.
  let seekTo = kfStart; if (spec.mode === 'lossless' && haveKf) { const next = kf.find(k => k > kfStart + 0.0005); seekTo = kfStart + Math.min(0.2, next === undefined ? 0.2 : (next - kfStart) / 2); }
  const sender = e.sender, send = d => { if (!sender.isDestroyed()) sender.send('vtrim:progress', d); }, part = path.join(path.dirname(dest), `.sma-trim-${tok()}.part${ext}`);
  job = { cancelled: false, proc: null }; send({ pct: 0 });
  try {
    let r = await runFf(trimArgs({ ...spec, full: true }, f.path, f.info, part, seekTo, ext), pct => send({ pct }), total);
    if (r.code !== 0 && spec.mode === 'lossless') { fs.rmSync(part, { force: true }); r = await runFf(trimArgs({ ...spec, full: false }, f.path, f.info, part, seekTo, ext), pct => send({ pct }), total); } // some containers cannot hold every extra track: try with just the picture and sound
    if (r.code !== 0) throw fail(r);
    if (!fs.existsSync(part) || fs.statSync(part).size === 0) throw new Error('FFmpeg produced no file.');
    fs.renameSync(part, dest); const o = await probe(dest, null); send({ pct: 100 });
    return { path: dest, size: fs.statSync(dest).size, duration: o.duration, startedAt: kfStart, mode: spec.mode };
  } catch (err) { throw new Error(job.cancelled ? 'Cancelled' : String(err.message || err)); } finally { fs.rmSync(part, { force: true }); job = null; }
}

// ---------- a lighter copy to preview, for videos this app's player cannot show ----------
async function makePreview(e, token) {
  const f = files.get(token); if (!f) throw new Error('Open a video first.'); if (!tempDir) tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sma-vtrim-')); const out = path.join(tempDir, 'preview-' + tok() + '.mp4');
  const sender = e.sender, send = d => { if (!sender.isDestroyed()) sender.send('vtrim:progress', d); }; job = { cancelled: false, proc: null }; send({ pct: 0, preview: true });
  try {
    const r = await runFf(['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', f.path, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=-2:min(480\\,ih),format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-g', '30', '-c:a', 'aac', '-b:a', '96k', '-sn', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out], pct => send({ pct, preview: true }), f.info.duration);
    if (r.code !== 0) throw fail(r); const t = tok(); files.set(t, { path: out, name: 'preview', info: f.info, temp: true }); return { url: mediaUrl(t) };
  } catch (err) { throw new Error(job.cancelled ? 'Cancelled' : String(err.message || err)); } finally { job = null; }
}

function register() {
  // The preview player asks for pieces of the file ("bytes=1000-") so it can jump around: answer those properly.
  const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime', '.ogv': 'video/ogg', '.avi': 'video/x-msvideo' };
  app.whenReady().then(() => protocol.handle('sma-media', req => {
    const f = files.get(new URL(req.url).pathname.replace(/^\//, '')); if (!f) return new Response('Not found', { status: 404 }); let size; try { size = fs.statSync(f.path).size; } catch (e) { return new Response('Gone', { status: 404 }); }
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || ''); let a = 0, b = size - 1;
    if (m && (m[1] || m[2])) { if (m[1]) { a = +m[1]; if (m[2]) b = Math.min(+m[2], size - 1); } else { a = Math.max(0, size - +m[2]); } if (a > b || a >= size) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } }); }
    const headers = { 'Content-Type': MIME[path.extname(f.path).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': String(b - a + 1) }; if (m) headers['Content-Range'] = `bytes ${a}-${b}/${size}`;
    return new Response(require('stream').Readable.toWeb(fs.createReadStream(f.path, { start: a, end: b })), { status: m ? 206 : 200, headers });
  }));
  const wnd = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle('vtrim:pick', async e => { const f = process.env.SMA_PICK_VIDEO || (await dialog.showOpenDialog(wnd(e), { title: 'Open a video to trim', properties: ['openFile'], filters: [{ name: 'Videos', extensions: [...VIDEO_EXT].map(x => x.slice(1)) }] })).filePaths[0]; return f ? open(f) : null; });
  ipcMain.handle('vtrim:open', (e, p) => open(p));
  ipcMain.handle('vtrim:keyframes', (e, t) => { const sender = e.sender; return findKeyframes(t, n => { if (!sender.isDestroyed()) sender.send('vtrim:keyframes', { count: n }); }); });
  ipcMain.handle('vtrim:thumbs', (e, t, n) => thumbs(t, n));
  ipcMain.handle('vtrim:preview', (e, t) => makePreview(e, t));
  ipcMain.handle('vtrim:trim', (e, spec) => doTrim(e, spec));
  ipcMain.handle('vtrim:cancel', () => { if (job) { job.cancelled = true; try { job.proc && job.proc.kill(); } catch (e) {} setTimeout(() => { try { job && job.proc && job.proc.kill('SIGKILL'); } catch (e) {} }, 1500); } });
  ipcMain.handle('vtrim:reveal', (e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });
  app.on('before-quit', cleanTemp);
}
module.exports = { register, snapBack };
