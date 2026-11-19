'use strict';
// Desktop audio for Sudo Make Live: "what the computer is playing". Chromium does not offer this on Linux (it hides the
// "Monitor of …" inputs), so on Linux this records the sound card's monitor with parec (PulseAudio and PipeWire's pulse
// layer) or pw-record (PipeWire), and hands raw 48 kHz stereo to the page. On Windows the page asks for system loopback
// audio from the screen-capture API, answered below. Nothing is saved to disk and nothing leaves the computer.
const { ipcMain, session, desktopCapturer } = require('electron');
const { spawn, execFile } = require('child_process');

const jobs = new Map(); // id -> child process

const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 4000, maxBuffer: 4e6 }, (e, out) => res(e ? null : String(out))));
const fs = require('fs'), path = require('path');
const have = async cmd => (process.env.PATH || '').split(path.delimiter).some(d => { try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return true; } catch (e) { return false; } });

// the outputs you can capture: every "monitor" source, plus the default output
async function list() {
  if (process.platform === 'win32') return { ok: true, mode: 'loopback', sources: [{ name: '', label: 'Everything you hear (system sound)' }] };
  if (process.platform !== 'linux') return { ok: false, mode: 'none', sources: [], why: 'Desktop audio is available on Linux and Windows.' };
  const tool = (await have('parec')) ? 'parec' : (await have('pw-record')) ? 'pw-record' : null;
  if (!tool) return { ok: false, mode: 'cli', sources: [], why: 'Desktop audio needs "parec" (package pulseaudio-utils) or "pw-record" (package pipewire-bin). Install one and open this window again.' };
  const out = await run('pactl', ['list', 'sources']), sources = [{ name: '', label: 'Everything you hear (default output)' }];
  if (out) for (const blk of out.split(/\n(?=Source #)/)) { const n = /^\s*Name:\s*(\S+)/m.exec(blk), d = /^\s*Description:\s*(.+)$/m.exec(blk); if (n && /\.monitor$/.test(n[1])) sources.push({ name: n[1], label: d ? d[1].trim() : n[1] }); }
  return { ok: true, mode: 'cli', tool, sources };
}
async function start(sender, id, source) {
  if (process.platform !== 'linux') throw new Error('Desktop audio capture through this path is for Linux.');
  stop(id); const info = await list(); if (!info.ok) throw new Error(info.why);
  if (source && !/^[A-Za-z0-9_.:@\-]+$/.test(source)) throw new Error('Bad audio source name.');
  const target = source || '@DEFAULT_MONITOR@';
  const args = info.tool === 'parec' ? ['-d', target, '--format=s16le', '--rate=48000', '--channels=2', '--latency-msec=20'] : ['-P', 'stream.capture.sink=true', ...(source ? ['--target', source] : []), '--rate', '48000', '--channels', '2', '--format', 's16', '-'];
  const p = spawn(info.tool, args, { stdio: ['ignore', 'pipe', 'pipe'] }); jobs.set(id, p); let err = '';
  p.stderr.on('data', d => { err = (err + d).slice(-400); });
  p.stdout.on('data', d => { if (!sender.isDestroyed()) { const b = Buffer.from(d); sender.send('deskaudio:data', id, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); } });
  p.on('exit', code => { if (jobs.get(id) === p) { jobs.delete(id); if (!sender.isDestroyed()) sender.send('deskaudio:ended', id, code, err.trim()); } });
  await new Promise(r => setTimeout(r, 250)); if (p.exitCode !== null) throw new Error('Could not capture the desktop audio. ' + (err.trim() || 'The recording tool stopped.'));
  return true;
}
function stop(id) { const p = jobs.get(id); if (p) { jobs.delete(id); try { p.kill(); } catch (e) {} } }
function register() {
  ipcMain.handle('deskaudio:list', () => list());
  ipcMain.handle('deskaudio:start', (e, id, source) => start(e.sender, String(id), source ? String(source) : ''));
  ipcMain.handle('deskaudio:stop', (e, id) => { stop(String(id)); return true; });
  if (process.platform === 'win32') session.defaultSession.setDisplayMediaRequestHandler((req, cb) => { desktopCapturer.getSources({ types: ['screen'] }).then(s => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({})); });
}
const stopAll = () => { for (const id of [...jobs.keys()]) stop(id); };
module.exports = { register, stopAll };
