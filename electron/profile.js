'use strict';
// Profiles: bring your setup from HopCast, and keep your own Sudo Make Art profile in a file.
// Reading HopCast: its settings live in plain files (OBS-style: basic/profiles/<name>/basic.ini, basic/scenes/<name>.json,
// global.ini) and its channels in an encrypted file (AES-256-GCM, key in a separate owner-only key file). Nothing is sent
// anywhere; the files are only read after you choose to import, and only the files the profile itself points at are opened.
const { app, ipcMain, dialog, BrowserWindow } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- HopCast: where it keeps things ----------
const home = os.homedir();
const defaultRoots = () => [path.join(home, '.config', 'PRISMLiveStudio'), path.join(home, '.var', 'app', 'com.hopcast.HopCast', 'config', 'PRISMLiveStudio')];
const backupRoot = () => path.join(home, '.local', 'share', 'hopcast', 'settings-backups');
const keyCandidates = root => [path.join(root, 'secure-store.key'), path.join(path.dirname(root), 'secure-store.key'), path.join(home, '.local', 'share', 'hopcast', 'secure-store.key')];
const isRoot = d => { try { return fs.statSync(path.join(d, 'basic')).isDirectory() || fs.statSync(path.join(d, 'user')).isDirectory(); } catch (e) { return false; } };
function findRoots() {
  const out = [];
  for (const d of defaultRoots()) if (isRoot(d)) out.push({ root: d, label: 'HopCast on this computer' });
  try { for (const n of fs.readdirSync(backupRoot()).sort().reverse().slice(0, 5)) { const d = path.join(backupRoot(), n); if (isRoot(d) || isRoot(path.join(d, 'PRISMLiveStudio'))) out.push({ root: isRoot(d) ? d : path.join(d, 'PRISMLiveStudio'), label: 'HopCast settings backup ' + n }); } } catch (e) {}
  return out;
}

// ---------- readers ----------
function ini(text) { // [Section] key=value
  const o = {}; let cur = null;
  for (const line of String(text).split(/\r?\n/)) { const s = line.trim(); if (!s || s[0] === ';' || s[0] === '#') continue; const m = /^\[(.+)\]$/.exec(s); if (m) { cur = o[m[1]] = o[m[1]] || {}; continue; } const i = s.indexOf('='); if (i > 0 && cur) cur[s.slice(0, i).trim()] = s.slice(i + 1).trim(); }
  return o;
}
const readText = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const readJson = f => { const t = readText(f); if (t == null) return null; try { return JSON.parse(t); } catch (e) { return null; } };
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v === undefined ? d : /^(true|1)$/i.test(String(v)));

function readProfiles(root) {
  const dir = path.join(root, 'basic', 'profiles'), out = [];
  let names = []; try { names = fs.readdirSync(dir); } catch (e) {}
  for (const n of names) {
    const b = ini(readText(path.join(dir, n, 'basic.ini')) || ''), enc = readJson(path.join(dir, n, 'streamEncoder.json')) || {}, v = b.Video || {}, so = b.SimpleOutput || {}, ao = b.AdvOut || {}, o = b.Output || {};
    const adv = /adv/i.test(o.Mode || ''), outW = num(v.OutputCX, num(v.BaseCX, 1280)), outH = num(v.OutputCY, num(v.BaseCY, 720));
    const enc1 = String(adv ? (ao.Encoder || enc.encoder || '') : (so.StreamEncoder || '')).toLowerCase();
    out.push({ name: n, width: outW, height: outH, baseW: num(v.BaseCX, outW), baseH: num(v.BaseCY, outH), fps: v.FPSType === '1' ? num(v.FPSInt, 30) : num(v.FPSCommon, 30),
      vbr: adv ? num(enc.bitrate, num(ao.Bitrate, 4500)) : num(so.VBitrate, 4500), abr: num(adv ? ao.Track1Bitrate : so.ABitrate, 160), nvenc: /nvenc|nvidia/.test(enc1), preset: String(so.Preset || enc.preset || '').toLowerCase(),
      recFormat: /mp4/i.test(String(so.RecFormat2 || so.RecFormat || ao.RecFormat2 || ao.RecFormat || '')) ? 'mp4' : 'mkv', recordDir: so.FilePath || ao.RecFilePath || '' });
  }
  return out;
}
const SKIP_AUDIO = new Set(['pulse_input_capture', 'pulse_output_capture', 'alsa_input_capture', 'wasapi_input_capture', 'wasapi_output_capture', 'coreaudio_input_capture', 'coreaudio_output_capture', 'jack_output_capture']);
const abgr = c => { c = (num(c, 0xffffffff) >>> 0); return '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255].map(v => v.toString(16).padStart(2, '0')).join(''); }; // OBS stores colors as ABGR
let allowed = new Set(); // files named by the profile being imported: the only ones the page can ask to read
function readCollections(root) {
  const dir = path.join(root, 'basic', 'scenes'), out = [], warnings = [];
  let names = []; try { names = fs.readdirSync(dir).filter(n => n.endsWith('.json') && !/\.bak$/.test(n)); } catch (e) {}
  for (const n of names) {
    const j = readJson(path.join(dir, n)); if (!j || !Array.isArray(j.sources)) continue;
    const byName = new Map(j.sources.map(s => [s.name, s])), scenes = [], audio = [], order = (j.scene_order || []).map(x => x.name), sceneSrc = j.sources.filter(s => s.id === 'scene');
    sceneSrc.sort((a, b) => (order.indexOf(a.name) + 1 || 999) - (order.indexOf(b.name) + 1 || 999));
    for (const sc of sceneSrc) {
      const items = [];
      for (const it of (sc.settings && sc.settings.items) || []) {
        const src = byName.get(it.name); if (!src) continue; const s = src.settings || {}, id = String(src.id || '');
        const base = { name: it.name, x: num(it.pos && it.pos.x, 0), y: num(it.pos && it.pos.y, 0), sx: num(it.scale && it.scale.x, 1), sy: num(it.scale && it.scale.y, 1), bw: it.bounds_type ? num(it.bounds && it.bounds.x, 0) : 0, bh: it.bounds_type ? num(it.bounds && it.bounds.y, 0) : 0, visible: it.visible !== false, lock: !!it.locked };
        if (id === 'image_source') { if (s.file) { allowed.add(s.file); items.push({ ...base, kind: 'image', file: s.file }); } }
        else if (id === 'ffmpeg_source') { if (s.is_local_file !== false && s.local_file) { allowed.add(s.local_file); items.push({ ...base, kind: 'media', file: s.local_file, loop: !!s.looping }); } else warnings.push(`"${it.name}" plays a web address, which Sudo Make Live does not do.`); }
        else if (/^color_source/.test(id)) items.push({ ...base, kind: 'color', color: abgr(s.color), w0: num(s.width, 0), h0: num(s.height, 0) });
        else if (/^text_(ft2|gdiplus)/.test(id)) items.push({ ...base, kind: 'text', text: String(s.text || ''), size: num(s.font && s.font.size, 36), color: abgr(s.color1 ?? s.color), face: s.font && s.font.face || 'Arial', bold: !!(s.font && (s.font.flags & 1)) });
        else if (/^(v4l2_input|dshow_input|av_capture_input|av_capture_input_v2)/.test(id)) items.push({ ...base, kind: 'camera' });
        else if (/^(xshm_input|xcomposite_input|pipewire-screen-capture-source|pipewire-window-capture-source|monitor_capture|window_capture|display_capture|screen_capture|game_capture)/.test(id)) items.push({ ...base, kind: 'screen' });
        else if (id === 'browser_source') warnings.push(`"${it.name}" is a browser source, which Sudo Make Live does not have.`);
        else if (id === 'scene') warnings.push(`"${it.name}" is a scene inside a scene; it was left out.`);
        else if (SKIP_AUDIO.has(id)) {} else warnings.push(`"${it.name}" (${id}) has no match and was left out.`);
      }
      scenes.push({ name: sc.name, items });
    }
    for (const s of j.sources) if (SKIP_AUDIO.has(s.id) && !audio.some(a => a.name === s.name)) audio.push({ name: s.name, output: /output/.test(s.id), mute: !!s.muted, vol: Math.max(0, Math.min(2, num(s.volume, 1))) });
    const t = (j.transitions || [])[0] || {}, tname = String(j.current_transition || t.name || '').toLowerCase();
    out.push({ name: j.name || n.replace(/\.json$/, ''), baseW: num(j.resolution && j.resolution.x, 0), baseH: num(j.resolution && j.resolution.y, 0), scenes, audio, transition: /fade/.test(tname) ? 'fade' : 'cut', transitionMs: num(j.transition_duration, 300) });
  }
  return { collections: out, warnings };
}
function readGlobal(root) {
  const g = ini(readText(path.join(root, 'global.ini')) || ''), b = g.BasicWindow || {};
  return { snap: b.SnappingEnabled !== undefined || b.SnapDistance !== undefined ? { on: bool(b.SnappingEnabled, true), sens: num(b.SnapDistance, 10), edge: bool(b.ScreenSnapping, true), other: bool(b.SourceSnapping, true), center: bool(b.CenterSnapping, false) } : null,
    tray: b.SysTrayEnabled !== undefined || b.SysTrayWhenStarted !== undefined || b.SysTrayMinimizeToTray !== undefined ? { enabled: bool(b.SysTrayEnabled, true), startInTray: bool(b.SysTrayWhenStarted, false), minToTray: bool(b.SysTrayMinimizeToTray, false) } : null };
}
function readChannels(root) { // the channel file is encrypted: format "HCSTORE1" + key-source byte + 12-byte nonce + ciphertext + 16-byte tag; the key is a hex string in a key file
  const file = path.join(root, 'user', 'hopcast-rtmp-channels.enc'); let buf; try { buf = fs.readFileSync(file); } catch (e) { return { channels: [], note: '' }; }
  let key = null; for (const k of keyCandidates(root)) { const t = readText(k); if (t && /^[0-9a-f]{64}\s*$/i.test(t.trim())) { key = Buffer.from(t.trim(), 'hex'); break; } }
  if (!key) return { channels: [], note: 'The channels file is locked and its key file (secure-store.key) was not found, so the channels were not imported. Add them again, or put the key file next to the folder and try again.', needKey: true };
  try {
    if (buf.length < 38 || buf.toString('latin1', 0, 8) !== 'HCSTORE1') throw new Error('not a HopCast channel file');
    const aad = Buffer.concat([buf.subarray(0, 9), Buffer.from([0]), Buffer.from(path.basename(file))]), d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(9, 21)); d.setAAD(aad); d.setAuthTag(buf.subarray(buf.length - 16));
    const json = JSON.parse(Buffer.concat([d.update(buf.subarray(21, buf.length - 16)), d.final()]).toString('utf8')), out = [];
    for (const rec of Array.isArray(json) ? json : []) { const c = rec.customData || rec, url = String(c.rtmp_url || c.url || '').trim(); if (!url) continue;
      const type = /^rtmps:/i.test(url) ? 'rtmps' : /^srt:/i.test(url) ? 'srt' : /^rist:/i.test(url) ? 'rist' : /^rtmp:/i.test(url) ? 'rtmp' : null; if (!type) continue;
      out.push({ name: String(c.display_name || c.name || c.channelName || 'Imported channel').slice(0, 60), type, url, key: String(c.stream_key || c.key || ''), user: String(c.user_id || ''), pass: String(c.password || ''), enabled: false }); }
    return { channels: out, note: '' };
  } catch (e) { return { channels: [], note: 'The channels file could not be unlocked (' + e.message + '). It may have been changed, or the key file is a different one.' }; }
}
function readHopcast(root) {
  if (!isRoot(root)) { const sub = path.join(root, 'PRISMLiveStudio'); if (isRoot(sub)) root = sub; else throw new Error('That folder does not look like a HopCast settings folder (it should contain "basic" or "user").'); }
  allowed = new Set(); const profiles = readProfiles(root), { collections, warnings } = readCollections(root), ch = readChannels(root), g = readGlobal(root);
  return { root, profiles, collections, channels: ch.channels, channelNote: ch.note, global: g, warnings };
}
const fileSize = f => { try { return fs.statSync(f).size; } catch (e) { return -1; } };

// ---------- passphrase sealing (for stream keys in an exported profile) ----------
function seal(text, pass) { const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(String(pass), salt, 32), c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(text, 'utf8'), c.final()]); return Buffer.concat([Buffer.from('SMAKEYS1'), salt, iv, c.getAuthTag(), ct]).toString('base64'); }
function unseal(b64, pass) { const b = Buffer.from(String(b64), 'base64'); if (b.length < 52 || b.toString('latin1', 0, 8) !== 'SMAKEYS1') throw new Error('Not a sealed key block'); const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(String(pass), b.subarray(8, 24), 32), b.subarray(24, 36)); d.setAuthTag(b.subarray(36, 52)); try { return Buffer.concat([d.update(b.subarray(52)), d.final()]).toString('utf8'); } catch (e) { throw new Error('Wrong password'); } }

function register() {
  const win = e => BrowserWindow.fromWebContents(e.sender);
  ipcMain.handle('profile:hopcast-find', () => findRoots());
  ipcMain.handle('profile:hopcast-pick', async e => { const r = await dialog.showOpenDialog(win(e), { title: 'Choose your HopCast settings folder (or a HopCast backup)', properties: ['openDirectory'], defaultPath: fs.existsSync(path.join(home, '.config')) ? path.join(home, '.config') : home }); return r.canceled ? null : r.filePaths[0]; });
  ipcMain.handle('profile:hopcast-read', (e, root) => readHopcast(String(root)));
  ipcMain.handle('profile:hopcast-key', async e => { const r = await dialog.showOpenDialog(win(e), { title: 'Choose HopCast\'s secure-store.key', properties: ['openFile'] }); if (r.canceled) return null; const t = readText(r.filePaths[0]); if (!t || !/^[0-9a-f]{64}\s*$/i.test(t.trim())) throw new Error('That is not a HopCast key file.'); return r.filePaths[0]; });
  ipcMain.handle('profile:read-file', (e, f) => { f = String(f); if (!allowed.has(f)) throw new Error('That file is not part of the profile'); const n = fileSize(f); if (n < 0) throw new Error('missing'); if (n > 400e6) throw new Error('too big'); const b = fs.readFileSync(f); return { name: path.basename(f), bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; });
  ipcMain.handle('profile:file-size', (e, f) => (allowed.has(String(f)) ? fileSize(String(f)) : -1));
  ipcMain.handle('profile:seal', (e, text, pass) => { if (!pass || String(pass).length < 4) throw new Error('Choose a password of at least 4 characters'); return seal(String(text), pass); });
  ipcMain.handle('profile:unseal', (e, b64, pass) => unseal(b64, pass));
  ipcMain.handle('profile:save', async (e, name, data) => { const r = await dialog.showSaveDialog(win(e), { title: 'Save your Sudo Make Art profile', defaultPath: path.join(app.getPath('documents'), String(name || 'my-profile.smaprofile')), filters: [{ name: 'Sudo Make Art profile', extensions: ['smaprofile'] }] }); if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, Buffer.from(data), { mode: 0o600 }); return r.filePath; });
  ipcMain.handle('profile:open', async e => { const r = await dialog.showOpenDialog(win(e), { title: 'Open a Sudo Make Art profile', properties: ['openFile'], filters: [{ name: 'Sudo Make Art profile', extensions: ['smaprofile', 'zip'] }] }); if (r.canceled) return null; const n = fileSize(r.filePaths[0]); if (n > 2e9) throw new Error('That file is too big'); const b = fs.readFileSync(r.filePaths[0]); return { name: path.basename(r.filePaths[0]), bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; });
}
module.exports = { register, readHopcast, seal, unseal, ini };
