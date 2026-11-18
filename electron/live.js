'use strict';
// Sudo Make Live (main process): the encoder and the outputs.
// The page draws the scene and sends it here as a WebM stream. One FFmpeg process encodes it ONCE (x264 or NVENC), then
// the result is copied to every switched-on destination and to the recording. Each destination is its own small FFmpeg
// process, so one that fails never stops the others and each one reconnects by itself (retrying over IPv4 if it needs to).
// Nothing here contacts any service: it only talks to the servers the user typed in. Stream keys are encrypted at rest
// (AES-256-GCM, key file kept apart, owner-only) and are masked out of everything that is shown or logged.
const { app, ipcMain, dialog, desktopCapturer, BrowserWindow } = require('electron');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const dns = require('dns');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vconvert = require('./vconvert');

const ff = () => vconvert.ffmpegPath();
const dataDir = () => app.getPath('userData');

// ---------- encrypted channel store ----------
function keyBytes() {
  const f = path.join(dataDir(), 'secure-store.key');
  try { const k = fs.readFileSync(f); if (k.length === 32) return k; } catch (e) {}
  const k = crypto.randomBytes(32); fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(f, k, { mode: 0o600 }); return k;
}
const chFile = () => path.join(dataDir(), 'live-channels.enc');
function seal(obj) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv), enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), enc]); }
function unseal(buf) { const d = crypto.createDecipheriv('aes-256-gcm', keyBytes(), buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')); }
const TYPES = { rtmp: /^rtmp:\/\/\S+$/i, rtmps: /^rtmps:\/\/\S+$/i, srt: /^srt:\/\/\S+$/i, rist: /^rist:\/\/\S+$/i };
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
function cleanChannel(c) {
  const type = TYPES[c && c.type] ? c.type : 'rtmp', url = str(c.url, 600).trim();
  return { id: str(c.id, 40).replace(/[^\w-]/g, '') || crypto.randomUUID(), name: str(c.name, 60) || 'My channel', type, url, key: str(c.key, 600), user: str(c.user, 100), pass: str(c.pass, 200), enabled: !!c.enabled };
}
const loadChannels = () => { try { return unseal(fs.readFileSync(chFile())).map(cleanChannel); } catch (e) { return []; } };
function saveChannels(list) {
  const clean = (Array.isArray(list) ? list : []).slice(0, 40).map(cleanChannel), tmp = chFile() + '.tmp';
  fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(tmp, seal(clean), { mode: 0o600 }); fs.renameSync(tmp, chFile()); return clean;
}

// ---------- preferences (where recordings go; only folders picked in the dialog are accepted) ----------
const prefFile = () => path.join(dataDir(), 'live-prefs.json');
const readPrefs = () => { try { return JSON.parse(fs.readFileSync(prefFile(), 'utf8')); } catch (e) { return {}; } };
const recDir = () => { const p = readPrefs().recordDir; return p && fs.existsSync(p) ? p : app.getPath('videos'); };

// ---------- the destination URL (key and login are added here, and masked everywhere else) ----------
function fullUrl(c, hostOverride) {
  let u = c.url.trim();
  if (hostOverride) { try { const x = new URL(u); x.hostname = hostOverride; u = x.toString(); } catch (e) {} }
  if ((c.type === 'rtmp' || c.type === 'rtmps') && c.user) { try { const x = new URL(u); x.username = c.user; x.password = c.pass || ''; u = x.toString(); } catch (e) {} }
  if (c.type === 'rtmp' || c.type === 'rtmps') return c.key ? u.replace(/\/+$/, '') + '/' + c.key : u;
  if (c.key && !/[?&]streamid=/.test(u)) u += (u.includes('?') ? '&' : '?') + 'streamid=' + encodeURIComponent(c.key);
  if (c.type === 'srt' && !/[?&]pkt_size=/.test(u)) u += (u.includes('?') ? '&' : '?') + 'pkt_size=1316';
  return u;
}
const secretsOf = c => [c.key, c.pass, c.key && encodeURIComponent(c.key)].filter(s => s && s.length > 2);
const mask = (text, c) => { let t = String(text); for (const s of secretsOf(c)) t = t.split(s).join('•••'); return t.replace(/\/\/[^\s/@]+:[^\s/@]*@/g, '//•••@'); };

// ---------- the live session ----------
let S = null;
const num = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
let nvencOk = null;
const hasNvenc = () => { if (nvencOk === null) nvencOk = spawnSync(ff(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-'], { timeout: 15000 }).status === 0; return nvencOk; };
let protoCache = null;
const protocols = () => { if (!protoCache) { const r = spawnSync(ff(), ['-hide_banner', '-protocols'], { encoding: 'utf8', timeout: 8000 }), out = (r.stdout || '').split(/Output:/)[1] || ''; protoCache = out.split(/\s+/).filter(Boolean); } return protoCache; };

function encoderArgs(s) {
  const fps = s.fps, a = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-fflags', '+nobuffer+genpts', '-analyzeduration', '500000', '-probesize', '500000', '-f', 'matroska,webm', '-i', 'pipe:0',
    '-vf', `fps=${fps},format=yuv420p`, '-af', 'aresample=async=1:first_pts=0'];
  const kb = s.vbr, g = String(fps * 2);
  if (s.encoder === 'nvenc') a.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-rc', 'cbr', '-b:v', kb + 'k', '-maxrate', kb + 'k', '-bufsize', kb * 2 + 'k', '-g', g, '-bf', '0');
  else a.push('-c:v', 'libx264', '-preset', s.preset, '-tune', 'zerolatency', '-b:v', kb + 'k', '-maxrate', kb + 'k', '-bufsize', kb * 2 + 'k', '-g', g, '-keyint_min', g, '-sc_threshold', '0');
  a.push('-c:a', 'aac', '-b:a', s.abr + 'k', '-ar', '48000', '-ac', '2', '-f', 'flv', '-flvflags', 'no_duration_filesize', '-flush_packets', '1', '-progress', 'pipe:2', '-stats_period', '1', 'pipe:1');
  return a;
}

class Dest {
  constructor(id, kind, label, build, secretsFor) { Object.assign(this, { id, kind, label, build, secretsFor, state: 'starting', error: '', tries: 0, stopping: false, proc: null, timer: null, dropped: 0, since: 0 }); }
  note(state, error) { this.state = state; if (error !== undefined) this.error = error; push(); }
  async launch() {
    if (this.stopping || !S) return;
    this.tries++; this.synced = false; this.note(this.tries > 1 ? 'retrying' : 'starting'); let host = null;
    if (this.kind === 'channel' && this.tries > 2 && this.tries % 2 === 1 && this.ch.type !== 'rtmps') { try { host = (await dns.promises.lookup(new URL(this.ch.url).hostname, { family: 4 })).address; } catch (e) {} } // second chance: over IPv4
    const args = this.build(host);
    const p = spawn(ff(), args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); this.proc = p; let err = '', up = false;
    p.stdin.on('error', () => {}); p.stdout.on('data', d => { if (!up && /total_size=[1-9]|out_time_us=[1-9]|out_time_ms=[1-9]/.test(String(d))) { up = true; this.since = Date.now(); this.tries = 0; this.note('live', ''); } });
    p.stderr.on('data', d => { err = (err + d).slice(-800); });
    p.on('error', e => { this.note('failed', 'Could not start FFmpeg: ' + e.message); });
    p.on('close', code => {
      if (this.proc === p) this.proc = null; if (this.stopping || !S) return;
      const msg = mask(err.trim().split('\n').filter(Boolean).slice(-2).join(' ') || ('Stopped (code ' + code + ')'), this.ch || {});
      if (this.kind === 'record') { this.note('failed', msg); return; }
      this.note('retrying', msg); const wait = Math.min(30000, 1500 * 2 ** Math.min(this.tries, 5)); this.timer = setTimeout(() => this.launch(), wait);
    });
  }
  write(buf) { const p = this.proc; if (!p || !p.stdin.writable) return; if (p.stdin.writableLength > 24e6) { this.dropped++; return; } p.stdin.write(buf); } // a slow destination loses data instead of slowing everyone else
  stop() { this.stopping = true; clearTimeout(this.timer); const p = this.proc; if (p) { try { p.stdin.end(); } catch (e) {} setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 2500); } this.state = 'stopped'; }
}
const base = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-fflags', '+genpts', '-f', 'flv', '-i', 'pipe:0', '-c', 'copy', '-progress', 'pipe:1', '-stats_period', '1'];
function channelDest(c) {
  const d = new Dest(c.id, 'channel', c.name, host => [...base, ...(c.type.startsWith('rtmp') ? ['-flvflags', 'no_duration_filesize', '-f', 'flv'] : ['-f', 'mpegts']), fullUrl(c, host)]);
  d.ch = c; return d;
}
function recordDest(file, format) {
  const d = new Dest('record', 'record', path.basename(file), () => [...base, ...(format === 'mp4' ? ['-movflags', '+frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4'] : ['-f', 'matroska']), '-y', file]);
  d.file = file; return d;
}

let lastPush = 0;
function snapshot() {
  return S && { live: true, since: S.since, stats: S.stats, dests: [...S.dests.values()].map(d => ({ id: d.id, kind: d.kind, name: d.label, state: d.state, error: d.error, since: d.since, dropped: d.dropped, file: d.file })) };
}
function push(force) { const now = Date.now(); if (!force && now - lastPush < 250) return; lastPush = now; for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('live:status', snapshot() || { live: false }); }

function startSession(settings) {
  if (S) throw new Error('Already running');
  const s = { w: num(settings.w, 160, 7680, 1280), h: num(settings.h, 90, 4320, 720), fps: num(settings.fps, 10, 120, 30), vbr: num(settings.vbr, 300, 60000, 4500), abr: num(settings.abr, 32, 512, 160),
    encoder: settings.encoder === 'nvenc' && hasNvenc() ? 'nvenc' : 'x264', preset: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'].includes(settings.preset) ? settings.preset : 'veryfast' };
  const enc = spawn(ff(), encoderArgs(s), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  S = { enc, dests: new Map(), since: Date.now(), stats: { fps: 0, bitrate: '', drop: 0 }, stopping: false, settings: s };
  let err = '';
  enc.stdin.on('error', () => {});
  // The encoder's output is FLV. Every destination must start on a keyframe, with the stream's header and codec set-up tags in
  // front, or the copy step meets a half-finished picture. (FLV rather than MPEG-TS because the bundled FFmpeg crashes reading
  // MPEG-TS from a pipe.) Whole tags only.
  let rem = Buffer.alloc(0), gotHdr = false; S.meta = { hdr: null, script: null, v: null, a: null };
  enc.stdout.on('data', buf => {
    const cur = S; if (!cur || cur.enc !== enc || cur.stopping) return; // data still arriving after Stop is dropped
    rem = rem.length ? Buffer.concat([rem, buf]) : buf;
    if (!gotHdr) { if (rem.length < 13) return; cur.meta.hdr = Buffer.from(rem.subarray(0, 13)); rem = rem.subarray(13); gotHdr = true; }
    const tags = []; let off = 0, kf = -1;
    while (rem.length - off >= 15) {
      const size = rem.readUIntBE(off + 1, 3), total = 11 + size + 4; if (rem.length - off < total) break;
      const tag = rem.subarray(off, off + total), type = tag[0], d0 = tag[11], d1 = tag[12];
      if (type === 18) cur.meta.script = Buffer.from(tag);
      else if (type === 9 && (d0 & 15) === 7 && d1 === 0) cur.meta.v = Buffer.from(tag);
      else if (type === 8 && (d0 >> 4) === 10 && d1 === 0) cur.meta.a = Buffer.from(tag);
      else if (kf < 0 && type === 9 && (d0 >> 4) === 1 && d1 === 1) kf = tags.length;
      tags.push(tag); off += total;
    }
    rem = Buffer.from(rem.subarray(off)); if (!tags.length) return;
    let all = null; const m = cur.meta;
    for (const d of cur.dests.values()) {
      if (d.synced) { all = all || Buffer.concat(tags); d.write(all); }
      else if (kf >= 0 && m.v && (m.a || true)) { d.synced = true; d.write(Buffer.concat([m.hdr, m.script || Buffer.alloc(0), m.v, m.a || Buffer.alloc(0), ...tags.slice(kf)])); }
    }
  });
  enc.stderr.on('data', d => { const t = String(d); err = (err + t).slice(-1200);
    for (const l of t.split('\n')) { const m = /^(fps|bitrate|drop_frames)=(.+)$/.exec(l.trim()); if (!m || !S) continue; if (m[1] === 'fps') S.stats.fps = +m[2] || 0; else if (m[1] === 'bitrate') S.stats.bitrate = m[2]; else S.stats.drop = +m[2] || 0; } push(); });
  enc.on('error', e => { err = 'Could not start FFmpeg: ' + e.message; });
  enc.on('close', code => { const cur = S; if (!cur || cur.enc !== enc) return; if (!cur.stopping) { finish(code === 0 ? '' : (err.trim().split('\n').filter(Boolean).slice(-2).join(' ') || 'The encoder stopped')); } });
  return s;
}
function finish(error) {
  const cur = S; if (!cur) return; cur.stopping = true; for (const d of cur.dests.values()) d.stop();
  try { cur.enc.stdin.end(); } catch (e) {} setTimeout(() => { try { cur.enc.kill('SIGKILL'); } catch (e) {} }, 2500);
  S = null; for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('live:status', { live: false, error: error || '' });
}

function register() {
  ipcMain.handle('live:info', () => ({ nvenc: hasNvenc(), protocols: protocols().filter(p => ['rtmp', 'rtmps', 'srt', 'rist'].includes(p)), ffmpeg: path.basename(ff()), recordDir: recDir() }));
  ipcMain.handle('live:sources', async () => {
    const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 256, height: 144 }, fetchWindowIcons: false });
    return list.map(x => ({ id: x.id, name: x.name, screen: x.id.startsWith('screen:'), thumb: x.thumbnail.isEmpty() ? '' : x.thumbnail.toDataURL() }));
  });
  ipcMain.handle('live:channels', () => loadChannels());
  ipcMain.handle('live:channels:save', (e, list) => saveChannels(list));
  ipcMain.handle('live:pick-dir', async e => { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Where should recordings go?', properties: ['openDirectory', 'createDirectory'], defaultPath: recDir() });
    if (r.canceled || !r.filePaths[0]) return null; fs.writeFileSync(prefFile(), JSON.stringify({ ...readPrefs(), recordDir: r.filePaths[0] }), { mode: 0o600 }); return r.filePaths[0]; });
  ipcMain.handle('live:start', (e, settings) => { startSession(settings || {}); push(true); return true; });
  ipcMain.on('live:chunk', (e, data) => { if (S && !S.stopping && S.enc.stdin.writable && data) S.enc.stdin.write(Buffer.from(data)); });
  ipcMain.handle('live:dest-start', (e, id) => { if (!S) throw new Error('Not running'); const c = loadChannels().find(x => x.id === id); if (!c) throw new Error('No such channel'); if (!c.url) throw new Error('Enter the server address first');
    if (!TYPES[c.type].test(c.url)) throw new Error('The address must start with ' + c.type + '://'); if (!protocols().includes(c.type)) throw new Error('This FFmpeg cannot send ' + c.type.toUpperCase() + '. Use your own FFmpeg that includes it (Convert videos > Use my own FFmpeg).');
    S.dests.get(id)?.stop(); const d = channelDest(c); S.dests.set(id, d); d.launch(); push(true); return true; });
  ipcMain.handle('live:dest-stop', (e, id) => { const d = S && S.dests.get(id); if (d) { d.stop(); S.dests.delete(id); push(true); } return true; });
  ipcMain.handle('live:record-start', (e, format) => { if (!S) throw new Error('Not running'); const fmt = format === 'mp4' ? 'mp4' : 'mkv', t = new Date(), p2 = n => String(n).padStart(2, '0');
    const file = path.join(recDir(), `SudoMakeLive-${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}-${p2(t.getHours())}${p2(t.getMinutes())}${p2(t.getSeconds())}.${fmt}`);
    fs.mkdirSync(recDir(), { recursive: true }); S.dests.get('record')?.stop(); const d = recordDest(file, fmt); S.dests.set('record', d); d.launch(); push(true); return file; });
  ipcMain.handle('live:record-stop', () => { const d = S && S.dests.get('record'); if (d) { d.stop(); S.dests.delete('record'); push(true); } return true; });
  ipcMain.handle('live:stop', () => { finish(''); return true; });
  app.on('before-quit', () => { if (S) finish(''); });
}
module.exports = { register };
