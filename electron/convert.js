'use strict';
// Batch image converter (JPEG XL, AVIF, WebP, JPEG, PNG), local only. Original implementation for this project.
// Encoders: the bundled FFmpeg (WebP, AVIF, PNG, JPEG) and libjxl's command-line tools (cjxl/djxl/cjpegli) for JPEG XL and
// better JPEGs. libjxl is bundled by the release build, or taken from the system PATH, or chosen by the user.
const { app, ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IN_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp', '.gif', '.tif', '.tiff', '.jxl', '.exr', '.psd']);
const OUT_EXT = { jxl: '.jxl', avif: '.avif', webp: '.webp', jpeg: '.jpg', png: '.png' };
const DIRECT_FOR_CJXL = new Set(['.png', '.jpg', '.jpeg', '.gif']); // formats cjxl/cjpegli read themselves
const HAS_ALPHA = new Set(['.png', '.webp', '.gif', '.tif', '.tiff', '.avif', '.exr', '.psd', '.jxl']);
const MAX_ITEMS = 50000;

// Only paths the user picked (dialog or drag-and-drop) can be read, and only a folder the user picked can be written to.
const approvedIn = new Set(), approvedOut = new Set();

const settingsFile = () => path.join(app.getPath('userData'), 'convert-settings.json');
const loadSettings = () => { try { return { tools: {}, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (e) { return { tools: {} }; } };
const saveSettings = s => fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));

const exe = n => (process.platform === 'win32' ? n + '.exe' : n);
const ffmpegPath = () => process.env.SMA_FFMPEG || require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
function findTool(name) {
  const own = loadSettings().tools[name]; if (own && fs.existsSync(own)) return own;
  const dev = path.join(__dirname, '..', 'vendor', 'libjxl', process.platform === 'win32' ? 'win' : 'linux', exe(name));
  for (const c of [path.join(process.resourcesPath || '', 'bin', exe(name)), dev]) if (fs.existsSync(c)) return c;
  for (const d of (process.env.PATH || '').split(path.delimiter)) { if (!d) continue; const p = path.join(d, exe(name)); if (fs.existsSync(p)) return p; }
  return null;
}
const toolInfo = () => ({ cores: os.cpus().length, ffmpeg: fs.existsSync(ffmpegPath()), cjxl: findTool('cjxl'), djxl: findTool('djxl'), cjpegli: findTool('cjpegli') });

// ---- finding files ----
function scan(paths) {
  const items = []; let n = 0;
  const add = (file, rel) => {
    if (n >= MAX_ITEMS || !IN_EXT.has(path.extname(file).toLowerCase())) return;
    let st; try { st = fs.statSync(file); } catch (e) { return; } if (!st.isFile()) return;
    approvedIn.add(file); n++; items.push({ path: file, rel, size: st.size });
  };
  const walk = (dir, root) => {
    let names; try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of names) { if (d.isSymbolicLink()) continue; const p = path.join(dir, d.name); if (d.isDirectory()) walk(p, root); else add(p, path.relative(path.dirname(root), p)); }
  };
  for (const p of paths) { if (typeof p !== 'string') continue; let st; try { st = fs.lstatSync(p); } catch (e) { continue; } if (st.isSymbolicLink()) continue; if (st.isDirectory()) walk(p, p); else add(p, path.basename(p)); }
  return items;
}

// ---- running tools ----
function run(cmd, args, job) {
  return new Promise((resolve, reject) => {
    if (job.cancelled) return reject(new Error('Cancelled'));
    const c = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); job.children.add(c); let err = '';
    c.stderr.on('data', d => { err = (err + d).slice(-500); });
    const timer = setTimeout(() => c.kill(), 20 * 60 * 1000);
    c.on('error', e => { clearTimeout(timer); job.children.delete(c); reject(e); });
    c.on('close', code => { clearTimeout(timer); job.children.delete(c); if (job.cancelled) reject(new Error('Cancelled')); else if (code === 0) resolve(); else reject(new Error((err.trim().split('\n').pop() || 'exit code ' + code).slice(0, 300))); });
  });
}
const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

// ffmpeg scale filter for the chosen downscaling mode. Never enlarges an image.
function scaleFilter(ds) {
  if (!ds || ds.mode === 'none') return null;
  const mp = ds.mode === 'megapixels', v = mp ? clamp(ds.value, 0.01, 1000, 1) : Math.round(clamp(ds.value, 1, 100000, 100)), v2 = Math.round(clamp(ds.value2, 1, 100000, v)); // megapixels may be a fraction
  switch (ds.mode) {
    case 'percent': return `scale='max(1,trunc(iw*${Math.min(v, 100)}/100))':'max(1,trunc(ih*${Math.min(v, 100)}/100))':flags=lanczos`;
    case 'resolution': return `scale='min(${v},iw)':'min(${v2},ih)':force_original_aspect_ratio=decrease:flags=lanczos`;
    case 'shortest': return `scale='if(lt(iw,ih),min(${v},iw),-1)':'if(lt(iw,ih),-1,min(${v},ih))':flags=lanczos`;
    case 'longest': return `scale='if(gt(iw,ih),min(${v},iw),-1)':'if(gt(iw,ih),-1,min(${v},ih))':flags=lanczos`;
    case 'megapixels': return `scale='max(1,trunc(iw*min(1,sqrt(${v}*1000000/(iw*ih)))))':-1:flags=lanczos`;
  }
  return null;
}

// Does one file. Returns {status, outPath, outSize}.
async function convertOne(it, spec, job) {
  const inExt = path.extname(it.path).toLowerCase(), outExt = OUT_EXT[spec.format], stem = path.basename(it.path, path.extname(it.path));
  const rel = path.dirname(it.rel); if (path.isAbsolute(it.rel) || it.rel.split(/[\\/]/).includes('..')) throw new Error('Bad path');
  const destDir = spec.outDir ? path.join(spec.outDir, rel === '.' ? '' : rel) : path.dirname(it.path);
  let dest = path.join(destDir, stem + outExt);
  if (path.resolve(dest) === path.resolve(it.path) && spec.conflict !== 'overwrite') spec = { ...spec, conflict: 'rename' }; // never replace the original unless asked
  const key = process.platform === 'win32' ? dest.toLowerCase() : dest, mine = job.claimed.has(key); // another file in this same batch already took this name
  if (mine || fs.existsSync(dest)) {
    if (!mine && spec.conflict === 'skip') return { status: 'skipped', note: 'already exists' };
    if (mine || spec.conflict === 'rename') { let k = 1, cand; do { cand = path.join(destDir, `${stem} (${k++})${outExt}`); } while (fs.existsSync(cand) || job.claimed.has(process.platform === 'win32' ? cand.toLowerCase() : cand)); dest = cand; }
  }
  job.claimed.add(process.platform === 'win32' ? dest.toLowerCase() : dest);
  if (inExt === '.jxl' && spec.format === 'jxl' && (!spec.downscale || spec.downscale.mode === 'none')) return { status: 'skipped', note: 'already JPEG XL' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sma-cv-')), out = path.join(tmp, 'out' + outExt), st = fs.statSync(it.path);
  try {
    await encode(it.path, inExt, spec, job, tmp, out);
    if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error('The encoder produced no file');
    fs.mkdirSync(destDir, { recursive: true }); fs.copyFileSync(out, dest);
    if (spec.keepTimes) fs.utimesSync(dest, st.atime, st.mtime);
    if (spec.deleteOriginal && path.resolve(dest) !== path.resolve(it.path)) await shell.trashItem(it.path); // to the recycle bin, not gone for good
    return { status: 'done', outPath: dest, outSize: fs.statSync(dest).size };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function encode(file, inExt, spec, job, tmp, out) {
  const ff = ffmpegPath(), vf = scaleFilter(spec.downscale), q = Math.round(clamp(spec.quality, 1, 100, 80)), effort = Math.round(clamp(spec.effort, 1, 9, 6));
  const perJob = Math.max(1, Math.floor(os.cpus().length / Math.max(1, spec.threads)));
  const png = async () => { const p = path.join(tmp, 'src.png'); await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-an', '-sn', '-frames:v', '1', ...(vf ? ['-vf', vf] : []), p], job); return p; };
  const decodeJxl = async () => { const d = findTool('djxl'); if (!d) throw new Error('Reading JPEG XL files needs djxl (libjxl). Set it under Tools.'); const p = path.join(tmp, 'dec.png'); await run(d, [file, p], job); return p; };
  // a source file the libjxl tools can read directly (no re-encode of pixels), or a PNG made by ffmpeg / djxl
  const readable = async () => {
    if (inExt === '.jxl') { const p = await decodeJxl(); if (!vf) return p; const p2 = path.join(tmp, 'scaled.png'); await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', p, '-vf', vf, '-frames:v', '1', p2], job); return p2; }
    return DIRECT_FOR_CJXL.has(inExt) && !vf ? file : png();
  };
  const src0 = () => (inExt === '.jxl' ? decodeJxl().then(async p => { if (!vf) return p; const p2 = path.join(tmp, 'scaled.png'); await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', p, '-vf', vf, '-frames:v', '1', p2], job); return p2; }) : null);
  const ffFrom = async (extra, filters) => { // run ffmpeg on the original (or the decoded JXL) with codec options
    const input = inExt === '.jxl' ? await src0() : file; const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-an', '-sn', '-frames:v', '1'];
    const f = [...(inExt === '.jxl' ? [] : vf ? [vf] : []), ...filters].join(','); if (f) args.push('-vf', f); await run(ff, [...args, ...extra, out], job);
  };

  switch (spec.format) {
    case 'jxl': {
      const cj = findTool('cjxl'); if (!cj) throw new Error('JPEG XL needs cjxl (libjxl). Install libjxl, or set it under Tools.');
      const isJpeg = inExt === '.jpg' || inExt === '.jpeg';
      if (isJpeg && spec.transcode && !vf) { await run(cj, [file, out, '--lossless_jpeg=1', '-e', String(effort), `--num_threads=${perJob}`], job); return; } // reversible JPEG recompression
      const src = await readable();
      await run(cj, [src, out, ...(spec.lossless ? ['-d', '0'] : ['-q', String(q)]), '-e', String(effort), ...(isJpeg && src === file ? ['--lossless_jpeg=0'] : []), `--num_threads=${perJob}`], job); return;
    }
    case 'jpeg': {
      const cj = findTool('cjpegli');
      if (cj) { const src = await readable(); await run(cj, [src, out, '-q', String(q), '-p', '2'], job); return; } // jpegli: smaller, better-looking JPEGs
      const qv = Math.round(2 + (100 - q) * 0.29); // ffmpeg's mjpeg scale: 2 (best) .. 31 (worst)
      await ffFrom(['-c:v', 'mjpeg', '-q:v', String(qv), '-huffman', 'optimal', '-strict', 'unofficial'], ['format=yuvj420p']); return;
    }
    case 'webp': await ffFrom(['-c:v', 'libwebp', '-quality', String(spec.lossless ? 100 : q), '-compression_level', String(Math.round((effort - 1) * 6 / 8)), ...(spec.lossless ? ['-lossless', '1'] : [])], []); return;
    case 'png': await ffFrom(['-c:v', 'png', '-compression_level', String(effort), '-pred', 'mixed'], []); return;
    case 'avif': {
      const crf = Math.round((100 - q) * 0.63), cpu = String(Math.max(0, Math.min(8, 9 - effort)));
      const enc = ['-c:v', 'libaom-av1', '-b:v', '0', '-crf', String(spec.lossless ? 0 : crf), '-cpu-used', cpu, '-still-picture', '1', ...(spec.lossless ? ['-aom-params', 'lossless=1'] : []), '-f', 'avif'];
      if (!HAS_ALPHA.has(inExt)) { await ffFrom([...enc, '-pix_fmt', spec.lossless ? 'yuv444p' : 'yuv420p'], []); return; }
      // images that can be transparent keep their transparency as a second (alpha) stream
      const input = inExt === '.jxl' ? await src0() : file, pre = inExt === '.jxl' ? '' : vf ? vf + ',' : '';
      const graph = `[0:v]${pre}format=rgba,split[a][b];[a]alphaextract[al];[b]format=${spec.lossless ? 'yuv444p' : 'yuv420p'}[col]`;
      await run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-an', '-sn', '-frames:v', '1', '-filter_complex', graph, '-map', '[col]', '-map', '[al]', ...enc, '-pix_fmt:v:0', spec.lossless ? 'yuv444p' : 'yuv420p', '-pix_fmt:v:1', 'gray', out], job); return;
    }
  }
  throw new Error('Unknown format');
}

// ---- the batch ----
const jobs = new Map();
function validate(spec) {
  if (!spec || !Array.isArray(spec.items) || !spec.items.length || spec.items.length > MAX_ITEMS) throw new Error('Nothing to convert');
  if (!OUT_EXT[spec.format]) throw new Error('Unknown format');
  for (const it of spec.items) if (typeof it.id !== 'string' || !approvedIn.has(it.path) || typeof it.rel !== 'string') throw new Error('A file was not chosen through the app');
  if (spec.outDir && !approvedOut.has(spec.outDir)) throw new Error('The output folder was not chosen through the app');
  if (!['skip', 'rename', 'overwrite'].includes(spec.conflict)) spec.conflict = 'rename';
  spec.threads = Math.round(clamp(spec.threads, 1, 32, 2));
  return spec;
}

function register() {
  const wnd = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle('convert:tools', () => toolInfo());
  ipcMain.handle('convert:set-tool', async (e, name) => {
    if (!['cjxl', 'djxl', 'cjpegli'].includes(name)) throw new Error('Unknown tool');
    const r = await dialog.showOpenDialog(wnd(e), { title: `Choose ${name}`, properties: ['openFile'] }); if (r.canceled || !r.filePaths[0]) return toolInfo();
    const s = loadSettings(); s.tools[name] = r.filePaths[0]; saveSettings(s); return toolInfo();
  });
  ipcMain.handle('convert:pick-files', async e => { const r = await dialog.showOpenDialog(wnd(e), { title: 'Add images', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: [...IN_EXT].map(x => x.slice(1)) }] }); return r.canceled ? [] : scan(r.filePaths); });
  ipcMain.handle('convert:pick-folder', async e => { const r = await dialog.showOpenDialog(wnd(e), { title: 'Add a folder of images', properties: ['openDirectory', 'multiSelections'] }); return r.canceled ? [] : scan(r.filePaths); });
  ipcMain.handle('convert:expand', (e, paths) => (Array.isArray(paths) ? scan(paths.slice(0, 5000)) : []));
  ipcMain.handle('convert:pick-output', async e => { const r = await dialog.showOpenDialog(wnd(e), { title: 'Choose where to save the converted images', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return null; approvedOut.add(r.filePaths[0]); return r.filePaths[0]; });
  ipcMain.handle('convert:reveal', (e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); });

  ipcMain.handle('convert:start', async (e, raw) => {
    const spec = validate(raw), sender = e.sender, id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    const job = { cancelled: false, children: new Set(), claimed: new Set() }; jobs.set(id, job);
    const send = (ch, d) => { if (!sender.isDestroyed()) sender.send(ch, { jobId: id, ...d }); };
    const sum = { done: 0, skipped: 0, failed: 0, inBytes: 0, outBytes: 0 }; let next = 0;
    const size = new Map(spec.items.map(i => [i.id, 0]));
    const worker = async () => {
      while (!job.cancelled) {
        const it = spec.items[next++]; if (!it) return;
        send('convert:progress', { id: it.id, status: 'working' });
        try {
          const inSize = fs.statSync(it.path).size, r = await convertOne(it, spec, job);
          if (r.status === 'done') { sum.done++; sum.inBytes += inSize; sum.outBytes += r.outSize; } else sum.skipped++;
          send('convert:progress', { id: it.id, ...r, inSize });
        } catch (err) { if (job.cancelled) return; sum.failed++; send('convert:progress', { id: it.id, status: 'failed', error: String(err.message || err).slice(0, 300) }); }
      }
    };
    await Promise.all([...Array(Math.min(spec.threads, spec.items.length))].map(worker));
    const cancelled = job.cancelled; jobs.delete(id); send('convert:finished', { ...sum, cancelled }); return { jobId: id };
  });
  ipcMain.handle('convert:cancel', () => { for (const job of jobs.values()) { job.cancelled = true; for (const c of job.children) try { c.kill(); } catch (e) {} } });
}
module.exports = { register };
