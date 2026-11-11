'use strict';
// Batch video converter, local only. Original implementation for this project (no code from any other converter).
// Drop files or whole folders in: every video inside is found, converted with the bundled FFmpeg, and written to a folder you
// choose with the SAME folder layout as the source (the dropped folder itself comes along, empty sub-folders too). Other files in
// those folders (subtitles, posters, .nfo) can be copied across as well, so a tidy library stays tidy.
const { app, ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mpg', '.mpeg', '.ts', '.m2ts', '.mts', '.3gp', '.ogv', '.vob', '.divx']);
const MAX_ITEMS = 50000;
const PRESETS = { // what each choice does; crf = [default, min, max]
  'mp4-h264': { ext: '.mp4', v: 'h264', crf: [23, 14, 35] },
  'mp4-h265': { ext: '.mp4', v: 'hevc', crf: [28, 18, 40] },
  'webm-vp9': { ext: '.webm', v: 'vp9', crf: [32, 20, 45] },
  'webm-av1': { ext: '.webm', v: 'av1', crf: [34, 22, 50] },
  'mkv-h265': { ext: '.mkv', v: 'hevc', crf: [28, 18, 40] },
  'mkv-remux': { ext: '.mkv', v: 'copy' },
  'mp4-remux': { ext: '.mp4', v: 'copy' },
  'audio-mp3': { ext: '.mp3', v: 'none' },
};
const approvedIn = new Set(), approvedOut = new Set();
const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const ffmpegPath = () => process.env.SMA_FFMPEG || require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const winKey = p => (process.platform === 'win32' ? p.toLowerCase() : p);
const badRel = r => typeof r !== 'string' || !r || path.isAbsolute(r) || r.split(/[\\/]/).includes('..');

// ---------- finding files ----------
// For a dropped folder X every result's "rel" starts with X's own name, so the folder follows into the output.
function scan(paths) {
  const videos = [], others = [], dirs = []; let n = 0;
  const addFile = (file, rel) => {
    if (n >= MAX_ITEMS) return; let st; try { st = fs.statSync(file); } catch (e) { return; } if (!st.isFile()) return;
    n++; approvedIn.add(file); (VIDEO_EXT.has(path.extname(file).toLowerCase()) ? videos : others).push({ path: file, rel, size: st.size });
  };
  const walk = (dir, root) => {
    dirs.push(path.relative(path.dirname(root), dir));
    let names; try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of names) { if (d.isSymbolicLink()) continue; const p = path.join(dir, d.name); if (d.isDirectory()) walk(p, root); else addFile(p, path.relative(path.dirname(root), p)); }
  };
  for (const p of paths) {
    if (typeof p !== 'string') continue; let st; try { st = fs.lstatSync(p); } catch (e) { continue; } if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, p); else if (VIDEO_EXT.has(path.extname(p).toLowerCase())) addFile(p, path.basename(p));
  }
  const key = (a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true });
  return { videos: videos.sort(key), others: others.sort(key), dirs };
}

// ---------- running ffmpeg ----------
function ff(args, job, { onLine, keepErr } = {}) {
  return new Promise((resolve, reject) => {
    if (job && job.cancelled) return reject(new Error('Cancelled'));
    const c = spawn(ffmpegPath(), args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); if (job) job.children.add(c);
    let err = '', buf = '';
    c.stderr.on('data', d => { err = (err + d).slice(keepErr ? -200000 : -1500); });
    c.stdout.on('data', d => { if (!onLine) return; buf += d; const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(onLine); });
    c.on('error', e => { if (job) job.children.delete(c); reject(e); });
    c.on('close', code => { if (job) job.children.delete(c); if (job && job.cancelled) reject(new Error('Cancelled')); else resolve({ code, err }); });
  });
}
const fail = r => new Error(((r.err || '').trim().split('\n').filter(l => !/^\s*$/.test(l)).pop() || 'ffmpeg exit code ' + r.code).slice(0, 300));

// What is in this file? Parsed from ffmpeg's own description of it (ffmpeg-static ships no ffprobe).
async function probe(file, job) {
  const { err } = await ff(['-hide_banner', '-i', file], job, { keepErr: true });
  const dur = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/), vid = err.match(/Stream #\d+:\d+[^\n]*?Video:\s*([a-z0-9_]+)[^\n]*?,\s*(\d{2,5})x(\d{2,5})/i);
  return { duration: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + parseFloat(dur[3]) : 0, vcodec: vid ? vid[1].toLowerCase() : null, width: vid ? +vid[2] : 0, height: vid ? +vid[3] : 0, hasAudio: /Stream #\d+:\d+[^\n]*Audio:/.test(err) };
}

// Is a graphics-card encoder really usable here? (The bundled FFmpeg has none; a user-supplied one via SMA_FFMPEG may.)
let hwCache = null;
async function hwInfo() {
  if (hwCache) return hwCache;
  const test = async enc => { try { const r = await ff(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.2', '-c:v', enc, '-f', 'null', '-'], null); return r.code === 0; } catch (e) { return false; } };
  hwCache = { nvenc: { h264: await test('h264_nvenc'), hevc: await test('hevc_nvenc') } }; return hwCache;
}
const toolInfo = async () => ({ ffmpeg: fs.existsSync(ffmpegPath()), cores: os.cpus().length, hw: await hwInfo() });

// ---------- building the command ----------
function buildArgs(spec, src, info, out, perJob) {
  const P = PRESETS[spec.preset], a = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', src.path, '-progress', 'pipe:1', '-nostats'];
  if (P.v === 'none') { // audio only
    const k = clamp(spec.audioKbps, 64, 320, 192);
    return [...a, '-vn', '-map', '0:a:0', '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', k + 'k', out];
  }
  a.push('-map', '0:v:0', '-map', '0:a?');
  if (P.ext === '.mkv') a.push('-map', '0:s?'); // MKV can hold any subtitles unchanged
  a.push('-map_metadata', '0', '-map_chapters', '0');
  const cap = clamp(spec.maxHeight, 0, 8640, 0), vf = [];
  if (P.v !== 'copy') {
    if (cap && info.height > cap) vf.push(`scale=-2:${cap}:flags=lanczos`);
    vf.push('format=yuv420p');
    const crf = Math.round(clamp(spec.crf, P.crf[1], P.crf[2], P.crf[0])), slow = clamp(spec.effort, 0, 2, 1); // 0 fast, 1 balanced, 2 smallest
    const th = ['-threads', String(perJob)];
    const hw = spec.hw && (P.v === 'h264' || P.v === 'hevc') && hwCache && hwCache.nvenc[P.v];
    if (hw) a.push('-c:v', P.v === 'h264' ? 'h264_nvenc' : 'hevc_nvenc', '-preset', ['p2', 'p5', 'p7'][slow], '-rc', 'vbr', '-cq', String(crf), '-b:v', '0', ...(P.v === 'hevc' && P.ext === '.mp4' ? ['-tag:v', 'hvc1'] : []));
    else if (P.v === 'h264') a.push('-c:v', 'libx264', '-preset', ['veryfast', 'medium', 'slower'][slow], '-crf', String(crf), ...th);
    else if (P.v === 'hevc') a.push('-c:v', 'libx265', '-preset', ['veryfast', 'medium', 'slower'][slow], '-crf', String(crf), ...(P.ext === '.mp4' ? ['-tag:v', 'hvc1'] : []), '-x265-params', 'log-level=error', ...th);
    else if (P.v === 'vp9') a.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-cpu-used', ['5', '3', '1'][slow], ...th);
    else if (P.v === 'av1') a.push('-c:v', 'libaom-av1', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-cpu-used', ['7', '5', '3'][slow], ...th);
    a.push('-vf', vf.join(','));
  } else a.push('-c:v', 'copy');
  // audio
  if (P.ext === '.webm') a.push('-c:a', 'libopus', '-b:a', clamp(spec.audioKbps, 64, 320, 160) + 'k');
  else if (spec.audio === 'copy' || P.v === 'copy') a.push('-c:a', 'copy');
  else a.push('-c:a', 'aac', '-b:a', clamp(spec.audioKbps, 64, 320, 160) + 'k');
  if (P.ext === '.mkv') a.push('-c:s', 'copy'); else a.push('-sn');
  if (P.ext === '.mp4') a.push('-movflags', '+faststart');
  return [...a, out];
}

const targetCodecName = { h264: 'h264', hevc: 'hevc', vp9: 'vp9', av1: 'av1' };

// Converts one file. Returns {status, outPath, outSize, note}.
async function convertOne(it, spec, job, report) {
  if (badRel(it.rel)) throw new Error('Bad path');
  const P = PRESETS[spec.preset], inExt = path.extname(it.path).toLowerCase(), stem = path.basename(it.path, path.extname(it.path)), rel = path.dirname(it.rel);
  const destDir = spec.outDir ? path.join(spec.outDir, rel === '.' ? '' : rel) : path.dirname(it.path);
  let dest = path.join(destDir, stem + P.ext), conflict = spec.conflict;
  if (path.resolve(dest) === path.resolve(it.path) && conflict !== 'skip') conflict = 'rename'; // never replace the original by accident
  const mine = job.claimed.has(winKey(dest));
  if (mine || fs.existsSync(dest)) {
    if (!mine && conflict === 'skip') return { status: 'skipped', note: 'already exists' };
    if (mine || conflict === 'rename') { let k = 1, cand; do { cand = path.join(destDir, `${stem} (${k++})${P.ext}`); } while (fs.existsSync(cand) || job.claimed.has(winKey(cand))); dest = cand; }
  }
  job.claimed.add(winKey(dest));
  const info = await probe(it.path, job);
  if (P.v !== 'none' && !info.vcodec) throw new Error('No video found in this file');
  if (P.v === 'none' && !info.hasAudio) throw new Error('No audio found in this file');
  fs.mkdirSync(destDir, { recursive: true });
  const part = path.join(destDir, `.sma-${job.id}-${job.seq++}.part${P.ext}`), st = fs.statSync(it.path);
  try {
    // Already what you asked for (same codec and container, not too tall)? Then there is nothing to gain from re-encoding: copy it as it is.
    const cap = clamp(spec.maxHeight, 0, 8640, 0);
    if (spec.smart && P.v in targetCodecName && info.vcodec === targetCodecName[P.v] && inExt === P.ext && (!cap || info.height <= cap)) {
      fs.copyFileSync(it.path, part); fs.renameSync(part, dest); if (spec.keepTimes) fs.utimesSync(dest, st.atime, st.mtime);
      return { status: 'done', copied: true, note: 'already ' + P.v + ', copied as it is', outPath: dest, outSize: fs.statSync(dest).size, inDur: info.duration };
    }
    const perJob = Math.max(1, Math.floor(os.cpus().length / Math.max(1, spec.threads)));
    let last = 0;
    const r = await ff(buildArgs(spec, { path: it.path }, info, part, perJob), job, { onLine: l => {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(l); if (!m || !info.duration) return; const now = Date.now(); if (now - last < 300) return; last = now;
      report(Math.max(0, Math.min(99, Math.round(+m[1] / 1e6 / info.duration * 100))));
    } });
    if (r.code !== 0) throw fail(r);
    if (!fs.existsSync(part) || fs.statSync(part).size === 0) throw new Error('FFmpeg produced no file');
    let note = '';
    const o = await probe(part, job);
    const shorter = info.duration && o.duration && o.duration < info.duration - Math.max(2, info.duration * 0.01);
    if (shorter) note = 'output is shorter than the original';
    fs.renameSync(part, dest); if (spec.keepTimes) fs.utimesSync(dest, st.atime, st.mtime);
    if (spec.deleteOriginal && !shorter && path.resolve(dest) !== path.resolve(it.path)) await shell.trashItem(it.path); // only when the result looks complete; to the trash, not erased
    else if (spec.deleteOriginal && shorter) note += ' (original kept)';
    return { status: 'done', note, outPath: dest, outSize: fs.statSync(dest).size, inDur: info.duration };
  } finally { fs.rmSync(part, { force: true }); }
}

// Copies a non-video file (subtitle, poster, .nfo…) to the matching place in the output folder.
function copyOther(it, spec) {
  if (badRel(it.rel) || !spec.outDir) throw new Error('Bad path');
  const dest = path.join(spec.outDir, it.rel);
  if (fs.existsSync(dest) && spec.conflict !== 'overwrite') return { status: 'skipped', note: 'already exists' };
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(it.path, dest);
  if (spec.keepTimes) { const st = fs.statSync(it.path); fs.utimesSync(dest, st.atime, st.mtime); }
  return { status: 'done', copied: true, outPath: dest, outSize: fs.statSync(dest).size };
}

// ---------- the batch ----------
const jobs = new Map();
function validate(raw) {
  if (!raw || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > MAX_ITEMS) throw new Error('Nothing to convert');
  const spec = { ...raw };
  if (!PRESETS[spec.preset]) throw new Error('Unknown format');
  for (const it of spec.items) if (typeof it.id !== 'string' || !approvedIn.has(it.path) || badRel(it.rel)) throw new Error('A file was not chosen through the app');
  spec.others = Array.isArray(spec.others) ? spec.others : [];
  for (const it of spec.others) if (typeof it.id !== 'string' || !approvedIn.has(it.path) || badRel(it.rel)) throw new Error('A file was not chosen through the app');
  spec.dirs = Array.isArray(spec.dirs) ? spec.dirs.slice(0, MAX_ITEMS) : [];
  for (const d of spec.dirs) if (badRel(d)) throw new Error('Bad folder name');
  if (spec.outDir && !approvedOut.has(spec.outDir)) throw new Error('The output folder was not chosen through the app');
  if (!spec.outDir) { spec.others = []; spec.dirs = []; } // nothing to mirror when saving next to the originals
  if (!['skip', 'rename', 'overwrite'].includes(spec.conflict)) spec.conflict = 'rename';
  spec.threads = Math.round(clamp(spec.threads, 1, 8, 1));
  return spec;
}

function register() {
  const wnd = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle('vconvert:tools', () => toolInfo());
  ipcMain.handle('vconvert:pick-files', async e => { const r = await dialog.showOpenDialog(wnd(e), { title: 'Add videos', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Videos', extensions: [...VIDEO_EXT].map(x => x.slice(1)) }] }); return r.canceled ? scan([]) : scan(r.filePaths); });
  ipcMain.handle('vconvert:pick-folder', async e => { const r = await dialog.showOpenDialog(wnd(e), { title: 'Add a folder of videos', properties: ['openDirectory', 'multiSelections'] }); return r.canceled ? scan([]) : scan(r.filePaths); });
  ipcMain.handle('vconvert:expand', (e, paths) => scan(Array.isArray(paths) ? paths.slice(0, 5000) : []));
  ipcMain.handle('vconvert:pick-output', async e => { const r = await dialog.showOpenDialog(wnd(e), { title: 'Choose where to put the converted videos', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; approvedOut.add(r.filePaths[0]); return r.filePaths[0]; });
  ipcMain.handle('vconvert:reveal', (e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });

  ipcMain.handle('vconvert:start', async (e, raw) => {
    const spec = validate(raw), sender = e.sender, id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    const job = { id, seq: 0, cancelled: false, children: new Set(), claimed: new Set() }; jobs.set(id, job);
    const send = (ch, d) => { if (!sender.isDestroyed()) sender.send(ch, { jobId: id, ...d }); };
    await hwInfo();
    const sum = { done: 0, copied: 0, skipped: 0, failed: 0, inBytes: 0, outBytes: 0, others: 0 }; let next = 0;
    if (spec.outDir) for (const d of spec.dirs) { try { fs.mkdirSync(path.join(spec.outDir, d), { recursive: true }); } catch (err) {} } // the whole folder tree, empty folders included
    const worker = async () => {
      while (!job.cancelled) {
        const it = spec.items[next++]; if (!it) return;
        send('vconvert:progress', { id: it.id, status: 'working', pct: 0 });
        try {
          const inSize = fs.statSync(it.path).size, r = await convertOne(it, spec, job, pct => send('vconvert:progress', { id: it.id, status: 'working', pct }));
          if (r.status === 'done') { sum.done++; if (r.copied) sum.copied++; else { sum.inBytes += inSize; sum.outBytes += r.outSize; } } else sum.skipped++;
          send('vconvert:progress', { id: it.id, ...r, inSize });
        } catch (err) { if (job.cancelled) return; sum.failed++; send('vconvert:progress', { id: it.id, status: 'failed', error: String(err.message || err).slice(0, 300) }); }
      }
    };
    await Promise.all([...Array(Math.min(spec.threads, spec.items.length))].map(worker));
    if (!job.cancelled) for (const it of spec.others) { // sidecar files go last, so a cancelled run leaves no half-copied library
      try { const r = copyOther(it, spec); if (r.status === 'done') sum.others++; send('vconvert:progress', { id: it.id, ...r }); } catch (err) { sum.failed++; send('vconvert:progress', { id: it.id, status: 'failed', error: String(err.message || err).slice(0, 300) }); }
    }
    const cancelled = job.cancelled; jobs.delete(id); send('vconvert:finished', { ...sum, cancelled, outDir: spec.outDir || null }); return { jobId: id };
  });
  ipcMain.handle('vconvert:cancel', () => { for (const job of jobs.values()) { job.cancelled = true; for (const c of job.children) { try { c.kill(); } catch (e) {} setTimeout(() => { try { c.kill('SIGKILL'); } catch (e) {} }, 1500); } } }); // slow encoders can ignore a polite stop for minutes
}
module.exports = { register, PRESETS, buildArgs, scan };
