'use strict';
// Font matcher support (desktop).
// Matching itself is offline: the page compares your picture with a shipped index of ~3,000 open-licensed fonts (data/fontindex.*),
// and nothing is downloaded or sent anywhere while matching. This module only (1) hands that index to the page, and (2) when you
// click "Download the real file", fetches ONE font file from the open Fontsource catalogue, with checks, only from allowlisted hosts.
const { app, ipcMain, net, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const API = process.env.SMA_FONTMATCH_API || 'https://api.fontsource.org';       // overridable by environment variable only (tests)
const CDN = process.env.SMA_FONTMATCH_CDN || 'https://cdn.jsdelivr.net';
const DATA = process.env.SMA_FONTMATCH_DATA || 'https://data.jsdelivr.com';
const HOSTS = new Set([API, CDN, DATA].map(u => new URL(u).host));               // nothing else is ever contacted for fonts
const OPEN_HOSTS = new Set(['www.virustotal.com', 'fontsource.org']);             // pages the app may open in your browser
const okId = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,80}$/.test(s);
const okWeight = w => [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(w);
const MAX_BYTES = 4 * 1024 * 1024;
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

async function fetchBytes(url, limit = MAX_BYTES) {
  const u = new URL(url); if (u.protocol !== 'https:' && !(process.env.SMA_FONTMATCH_API && u.protocol === 'http:')) throw new Error('Blocked: not https');
  if (!HOSTS.has(u.host)) throw new Error('Blocked: ' + u.host);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await net.fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + u.host);
    const len = Number(r.headers.get('content-length') || 0); if (len > limit) throw new Error('File too large');
    const b = Buffer.from(await r.arrayBuffer()); if (b.length > limit) throw new Error('File too large'); return b;
  } finally { clearTimeout(t); }
}

let indexCache = null;
function loadIndex() {
  if (indexCache) return indexCache;
  const dir = path.join(__dirname, '..', 'data');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'fontindex.json'), 'utf8')), bin = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'fontindex.bin.gz')));
  return (indexCache = { meta, bin: ab(bin) });
}

// What would be downloaded: the exact address, size, licence and the hash the catalogue publishes for it.
async function plan(id, weight, format) {
  if (!okId(id) || !okWeight(weight) || !['woff', 'ttf'].includes(format)) throw new Error('Bad request');
  const info = JSON.parse((await fetchBytes(`${API}/v1/fonts/${id}`, 1e6)).toString('utf8')), ver = info.npmVersion;
  if (!/^[0-9][0-9a-z.\-+]{0,30}$/.test(String(ver))) throw new Error('Unexpected version');
  const name = `${id}-latin-${weight}-normal`, out = { id, weight, format, family: info.family, license: info.license, version: ver, page: `https://fontsource.org/fonts/${id}` };
  if (format === 'woff') {
    const flat = JSON.parse((await fetchBytes(`${DATA}/v1/packages/npm/@fontsource/${id}@${ver}?structure=flat`, 4e6)).toString('utf8')), f = (flat.files || []).find(x => x.name === `/files/${name}.woff`);
    if (!f) throw new Error('The catalogue does not list this file');
    Object.assign(out, { url: `${CDN}/npm/@fontsource/${id}@${ver}/files/${name}.woff`, size: f.size, publishedHashB64: f.hash, publishedHashHex: Buffer.from(f.hash, 'base64').toString('hex') });
  } else Object.assign(out, { url: `${CDN}/fontsource/fonts/${id}@${ver}/latin-${weight}-normal.ttf`, size: null, publishedHashB64: null }); // the TTF has no published hash
  out.virusTotal = `https://www.virustotal.com/gui/search/${encodeURIComponent(out.url)}`;
  return out;
}

function register() {
  ipcMain.handle('fontmatch:index', () => loadIndex());
  ipcMain.handle('fontmatch:plan', (e, id, weight, format) => plan(id, weight, format || 'woff'));
  ipcMain.handle('fontmatch:download', async (e, id, weight, format) => {
    const p = await plan(id, weight, format || 'woff'), data = await fetchBytes(p.url), checks = [];
    const magic = data.subarray(0, 4).toString('latin1'), isWoff = magic === 'wOFF', isSfnt = magic === '\0\x01\0\0' || magic === 'OTTO' || magic === 'true';
    if (!(p.format === 'woff' ? isWoff : isSfnt)) throw new Error('This is not a font file (wrong file signature). Nothing was kept.'); checks.push('The file starts like a real ' + (isWoff ? 'WOFF' : 'TrueType/OpenType') + ' font');
    if (p.size && data.length !== p.size) throw new Error(`The size (${data.length}) does not match the catalogue (${p.size}). Nothing was kept.`); checks.push(`Size ${(data.length / 1024).toFixed(0)} KB${p.size ? ' matches the catalogue' : ''}`);
    const hex = crypto.createHash('sha256').update(data).digest('hex');
    if (p.publishedHashB64) { if (crypto.createHash('sha256').update(data).digest('base64') !== p.publishedHashB64) throw new Error('The file does NOT match the hash the catalogue publishes. It was thrown away.'); checks.push('SHA-256 matches the hash the catalogue publishes'); }
    else checks.push('No published hash exists for this format, so compare the SHA-256 below on VirusTotal');
    return { data: ab(data), sha256: hex, checks, family: p.family, license: p.license, version: p.version, weight: p.weight, format: p.format, page: p.page, url: p.url };
  });
  ipcMain.handle('fontmatch:open', (e, url) => { let u; try { u = new URL(url); } catch (err) { return false; } if (u.protocol !== 'https:' || !OPEN_HOSTS.has(u.host)) return false; shell.openExternal(u.href); return true; });
}
module.exports = { register };
