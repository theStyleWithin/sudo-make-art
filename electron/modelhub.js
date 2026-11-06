'use strict';
// Model library (desktop): search Hugging Face for GGUF image/video models and download one into the models folder, with checks.
// Nothing here runs a model file. A downloaded model is only stored, so you still choose when and with what to use it.
//
// Safety, in order: only GGUF files (a plain data format; never pickle-style .ckpt/.pt/.bin files, which can run code), only from
// Hugging Face's own hosts, the size and SHA-256 must match what Hugging Face publishes, the file must be a well-formed GGUF,
// and ClamAV scans it too if it is installed. The file stays in a temporary name until every check has passed.
const { app, ipcMain, net, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { inspectGguf } = require('./gguf');
const { hardware } = require('./hardware');
const { recommend } = require('./plan');

const HF = (process.env.SMA_HF_BASE || 'https://huggingface.co').replace(/\/$/, '');   // overridable by environment variable only (tests)
const TEST = !!process.env.SMA_HF_BASE;
const hostOk = h => TEST ? h === new URL(HF).host : (h === 'huggingface.co' || h.endsWith('.huggingface.co') || h === 'hf.co' || h.endsWith('.hf.co')); // file downloads are redirected to Hugging Face's CDN hosts
const OPEN_HOSTS = new Set(['www.virustotal.com', 'huggingface.co']);
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const FILE = /^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,60}\/)?[A-Za-z0-9][A-Za-z0-9._()+ -]{0,200}\.gguf$/i; // one optional folder, no '..', only .gguf
const KINDS = { image: 'text-to-image', video: 'text-to-video' };
const MAX_BYTES = 80 * 1024 ** 3;
const modelsDir = () => { const d = path.join(app.getPath('userData'), 'models'); fs.mkdirSync(d, { recursive: true }); return d; };

async function getJson(url) {
  const u = new URL(url); if (!hostOk(u.host) || (u.protocol !== 'https:' && !TEST)) throw new Error('Blocked: ' + u.host);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  try { const r = await net.fetch(url, { signal: ctl.signal }); if (r.status === 429) throw new Error('Hugging Face is asking us to slow down. Try again in a minute.'); if (!r.ok) throw new Error('Hugging Face answered ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const license = tags => ((tags || []).find(t => t.startsWith('license:')) || '').slice(8) || 'not stated';

// ---------- search and file lists ----------
async function search(query, kind) {
  const q = String(query || '').trim().slice(0, 80), pipe = KINDS[kind] || KINDS.image;
  const url = `${HF}/api/models?search=${encodeURIComponent(q)}&filter=gguf&pipeline_tag=${pipe}&sort=downloads&direction=-1&limit=30` + ['downloads', 'likes', 'lastModified', 'gated', 'tags'].map(f => `&expand[]=${f}`).join('');
  const list = await getJson(url);
  return list.filter(m => REPO.test(m.id) && !m.private).map(m => ({ id: m.id, downloads: m.downloads || 0, likes: m.likes || 0, updated: m.lastModified || '', gated: !!m.gated, license: license(m.tags) }));
}
async function files(repo, kind) {
  if (!REPO.test(repo)) throw new Error('Bad repository name');
  const d = await getJson(`${HF}/api/models/${repo}?blobs=true`);
  const out = (d.siblings || []).filter(s => FILE.test(s.rfilename || '') && s.size > 0 && s.lfs && /^[0-9a-f]{64}$/.test(s.lfs.sha256 || ''))
    .map(s => ({ name: s.rfilename, size: s.size, sha256: s.lfs.sha256 })).sort((a, b) => a.size - b.size);
  const hw = await hardware(), rec = recommend(hw, out, kind === 'video' ? 'video' : 'image');
  out.forEach(f => { f.fit = rec.fits[f.name]; });
  return { id: d.id, gated: !!d.gated, license: license(d.tags), files: out, hardware: { gpu: hw.gpu ? { name: hw.gpu.name, vramMB: hw.gpu.vramTotal, freeMB: hw.gpu.vramFree } : null, ramMB: hw.ramTotal, ramFreeMB: hw.ramFree, cores: hw.cores }, best: rec.best, ignored: (d.siblings || []).filter(s => /\.(ckpt|pt|pth|bin|pkl|pickle)$/i.test(s.rfilename || '')).length };
}
async function plan(repo, file) { // exactly what would be downloaded, with the size and hash Hugging Face publishes
  if (!FILE.test(file)) throw new Error('Bad file name');
  const info = await files(repo), f = info.files.find(x => x.name === file); if (!f) throw new Error('Hugging Face does not list this file as a GGUF model');
  if (info.gated) throw new Error('This model is gated: you have to accept its licence on its page and sign in, which this app cannot do. Open its page to request access.');
  if (f.size > MAX_BYTES) throw new Error('That file is larger than this app will download.');
  return { repo, file, size: f.size, sha256: f.sha256, license: info.license, url: `${HF}/${repo}/resolve/main/${encodeURIComponent(file).replace(/%2F/g, '/')}`, page: `https://huggingface.co/${repo}`, virusTotal: `https://www.virustotal.com/gui/file/${f.sha256}` };
}

// ---------- optional antivirus ----------
function onPath(name) { const exe = process.platform === 'win32' ? name + '.exe' : name; for (const d of (process.env.PATH || '').split(path.delimiter)) { if (!d) continue; const p = path.join(d, exe); if (fs.existsSync(p)) return p; } return null; }
function clam(file) { // ClamAV, if the user has it. Exit code 0 = clean, 1 = something found, 2 = it could not scan.
  const exe = onPath('clamscan'); if (!exe) return Promise.resolve({ available: false });
  return new Promise(res => { const c = spawn(exe, ['--no-summary', '--stdout', file], { stdio: ['ignore', 'pipe', 'ignore'] }); let out = ''; c.stdout.on('data', d => { out = (out + d).slice(-400); });
    const t = setTimeout(() => c.kill(), 30 * 60 * 1000); c.on('error', () => { clearTimeout(t); res({ available: true, ok: false, note: 'ClamAV could not be started' }); });
    c.on('close', code => { clearTimeout(t); res(code === 0 ? { available: true, ok: true } : code === 1 ? { available: true, ok: false, found: out.trim() } : { available: true, ok: false, note: 'ClamAV could not scan the file' }); }); });
}

// Request with redirects followed one at a time: each hop's host is checked BEFORE any request is sent to it.
function fetchChecked(url, signal, hops) {
  return new Promise((resolve, reject) => {
    const bad = h => new Error('The download was redirected to an unexpected host (' + h + '), so it was stopped.');
    let u; try { u = new URL(url); } catch (e) { return reject(e); }
    if (!hostOk(u.host) || (u.protocol !== 'https:' && !TEST)) return reject(bad(u.host));
    hops.push(u.host);
    const req = net.request({ url, redirect: 'manual' });
    signal.addEventListener('abort', () => { req.abort(); reject(new Error('Cancelled')); }, { once: true });
    req.on('redirect', (status, method, loc) => {
      let n; try { n = new URL(loc, url); } catch (e) { req.abort(); return reject(new Error('Bad redirect')); }
      if (hops.length > 6 || !hostOk(n.host) || (n.protocol !== 'https:' && !TEST)) { req.abort(); return reject(bad(n.host)); }
      hops.push(n.host); req.followRedirect();
    });
    req.on('response', res => resolve(res)); req.on('error', reject); req.end();
  });
}

// ---------- the download ----------
const active = new Map();
async function download(sender, repo, file) {
  const p = await plan(repo, file), dir = modelsDir(), id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
  const free = fs.statfsSync(dir); if (Number(free.bavail) * Number(free.bsize) < p.size * 1.05) throw new Error('Not enough free disk space for this file.');
  const part = path.join(dir, `.download-${id}.part`), job = { ctl: new AbortController(), part }; active.set(id, job);
  const send = d => { if (!sender.isDestroyed()) sender.send('modelhub:progress', { id, repo, file, ...d }); };
  send({ phase: 'start', total: p.size }); const checks = [];
  try {
    const hops = [], r = await fetchChecked(p.url, job.ctl.signal, hops); if (r.statusCode < 200 || r.statusCode >= 300) throw new Error('Hugging Face answered ' + r.statusCode + (r.statusCode === 401 || r.statusCode === 403 ? ' (this model may need you to accept its licence on its page)' : ''));
    checks.push('Every server the download passed through is Hugging Face’s own (' + [...new Set(hops)].join(' → ') + ')');
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(part, { flags: 'wx' }); let got = 0, last = 0;
    for await (const value of r) { got += value.length; if (got > p.size) throw new Error('The server sent more data than the published size.'); hash.update(value);
      if (!out.write(value)) await new Promise(res => out.once('drain', res)); if (Date.now() - last > 250) { last = Date.now(); send({ phase: 'download', got, total: p.size }); } }
    await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
    if (got !== p.size) throw new Error(`The size (${got}) does not match what Hugging Face publishes (${p.size}).`); checks.push('Size matches what Hugging Face publishes');
    if (hash.digest('hex') !== p.sha256) throw new Error('The SHA-256 does NOT match the one Hugging Face publishes. The file was thrown away.'); checks.push('SHA-256 matches what Hugging Face publishes');
    send({ phase: 'inspect' }); const g = inspectGguf(part); checks.push(`Well-formed GGUF (version ${g.version}, ${g.tensors} tensors${g.arch ? ', ' + g.arch : ''})`);
    send({ phase: 'scan' }); const c = await clam(part);
    if (!c.available) checks.push('ClamAV is not installed, so no antivirus scan was run (optional: install ClamAV to add one)');
    else if (c.ok) checks.push('ClamAV found nothing'); else throw new Error(c.found ? 'ClamAV reported: ' + c.found : (c.note || 'ClamAV could not scan the file'));
    let final = path.join(dir, path.basename(file)), k = 1; while (fs.existsSync(final)) final = path.join(dir, `${path.basename(file, '.gguf')} (${k++}).gguf`);
    fs.renameSync(part, final); send({ phase: 'done' }); return { name: path.basename(final), size: p.size, sha256: p.sha256, checks, license: p.license, virusTotal: p.virusTotal };
  } catch (e) { send({ phase: 'failed' }); throw new Error(job.ctl.signal.aborted ? 'Cancelled' : e.message); }
  finally { active.delete(id); fs.rmSync(part, { force: true }); }
}

function register() {
  ipcMain.handle('modelhub:search', (e, q, kind) => search(q, kind));
  ipcMain.handle('modelhub:files', (e, repo, kind) => files(repo, kind));
  ipcMain.handle('modelhub:plan', (e, repo, file) => plan(repo, file));
  ipcMain.handle('modelhub:download', (e, repo, file) => download(e.sender, repo, file));
  ipcMain.handle('modelhub:cancel', () => { for (const j of active.values()) j.ctl.abort(); });
  ipcMain.handle('modelhub:clam', () => !!onPath('clamscan'));
  ipcMain.handle('modelhub:open', (e, url) => { let u; try { u = new URL(url); } catch (err) { return false; } if (u.protocol !== 'https:' || !OPEN_HOSTS.has(u.host)) return false; shell.openExternal(u.href); return true; });
}
module.exports = { register, inspectGguf };
