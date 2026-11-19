'use strict';
// Desktop audio for Sudo Make Live: "what the computer is playing". Chromium does not offer this on Linux (it hides the
// "Monitor of …" inputs), so on Linux this records the sound card's monitor with parec (PulseAudio and PipeWire's pulse
// layer) or pw-record (PipeWire), and hands raw 48 kHz stereo to the page. On Windows the page asks for system loopback
// audio from the screen-capture API, answered below. Nothing is saved to disk and nothing leaves the computer.
const { ipcMain, session, desktopCapturer } = require('electron');
const { spawn, execFile } = require('child_process');

const jobs = new Map(); // id -> { source, p (the recording process), sink, retries, poll }

const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 4000, maxBuffer: 4e6 }, (e, out) => res(e ? null : String(out))));
const fs = require('fs'), path = require('path');
const have = async cmd => (process.env.PATH || '').split(path.delimiter).some(d => { try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return true; } catch (e) { return false; } });

// The outputs you can capture are the sound card's *sinks* (speakers, headphones, HDMI); each one has a "monitor" source that
// carries what is being played to it. The default choice follows the system's default output, like a normal desktop audio
// capture does: if you plug in headphones and the default output changes, the capture moves with it.
async function list() {
  if (process.platform === 'win32') return { ok: true, mode: 'loopback', sources: [{ name: '', label: 'Everything you hear (system sound)' }] };
  if (process.platform !== 'linux') return { ok: false, mode: 'none', sources: [], why: 'Desktop audio is available on Linux and Windows.' };
  const tool = (await have('parec')) ? 'parec' : (await have('pw-record')) ? 'pw-record' : null;
  if (!tool) return { ok: false, mode: 'cli', sources: [], why: 'Desktop audio needs "parec" (package pulseaudio-utils) or "pw-record" (package pipewire-bin). Install one and open this window again.' };
  const out = await run('pactl', ['list', 'sinks']), sources = [{ name: '', label: 'Everything you hear (default output)' }];
  if (out) for (const blk of out.split(/\n(?=Sink #)/)) { const d = /^\s*Description:\s*(.+)$/m.exec(blk), m = /^\s*Monitor Source:\s*(\S+)/m.exec(blk); if (m) sources.push({ name: m[1], label: d ? d[1].trim() : m[1] }); }
  return { ok: true, mode: 'cli', tool, sources };
}
const defaultSink = async () => { const o = await run('pactl', ['get-default-sink']); if (o) return o.trim(); const i = await run('pactl', ['info']); const m = i && /Default Sink:\s*(\S+)/.exec(i); return m ? m[1] : ''; };
function spawnCapture(info, source) {
  const target = source || '@DEFAULT_MONITOR@';
  const args = info.tool === 'parec' ? ['-d', target, '--format=s16le', '--rate=48000', '--channels=2', '--latency-msec=25'] : ['-P', 'stream.capture.sink=true', ...(source ? ['--target', source] : []), '--rate', '48000', '--channels', '2', '--format', 's16', '-'];
  return spawn(info.tool, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}
async function start(sender, id, source) {
  if (process.platform !== 'linux') throw new Error('Desktop audio capture through this path is for Linux.');
  stop(id); const info = await list(); if (!info.ok) throw new Error(info.why);
  if (source && !/^[A-Za-z0-9_.:@\-]+$/.test(source)) throw new Error('Bad audio source name.');
  const job = { source, stopped: false, p: null, sink: source ? '' : await defaultSink(), retries: 0, err: '', poll: null }; jobs.set(id, job);
  const launch = () => { const p = spawnCapture(info, source); job.p = p; job.err = '';
    p.stderr.on('data', d => { job.err = (job.err + d).slice(-400); });
    p.stdout.on('data', d => { job.retries = 0; if (!sender.isDestroyed()) { const b = Buffer.from(d); sender.send('deskaudio:data', id, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); } });
    p.on('exit', code => { if (job.p !== p || job.stopped) return; // it stopped by itself (the sound server restarted, the device went away): try again a few times
      if (job.retries < 20) { job.retries++; setTimeout(() => { if (!job.stopped && jobs.get(id) === job) launch(); }, 1500); } else { jobs.delete(id); clearInterval(job.poll); if (!sender.isDestroyed()) sender.send('deskaudio:ended', id, code, job.err.trim()); } }); };
  launch();
  if (!source) job.poll = setInterval(async () => { if (job.stopped) return; const now = await defaultSink(); if (now && job.sink && now !== job.sink) { job.sink = now; const old = job.p; job.p = null; try { old.kill(); } catch (e) {} launch(); } else if (now) job.sink = now; }, 2000);
  await new Promise(r => setTimeout(r, 300)); if (job.p && job.p.exitCode !== null && job.retries === 0) { job.stopped = true; clearInterval(job.poll); jobs.delete(id); throw new Error('Could not capture the desktop audio. ' + (job.err.trim() || 'The recording tool stopped.')); }
  return true;
}
function stop(id) { const j = jobs.get(id); if (j) { j.stopped = true; clearInterval(j.poll); jobs.delete(id); try { j.p && j.p.kill(); } catch (e) {} } }
function register() {
  ipcMain.handle('deskaudio:list', () => list());
  ipcMain.handle('deskaudio:start', (e, id, source) => start(e.sender, String(id), source ? String(source) : ''));
  ipcMain.handle('deskaudio:stop', (e, id) => { stop(String(id)); return true; });
  if (process.platform === 'win32') session.defaultSession.setDisplayMediaRequestHandler((req, cb) => { desktopCapturer.getSources({ types: ['screen'] }).then(s => cb({ video: s[0], audio: 'loopback' })).catch(() => cb({})); });
}
const stopAll = () => { for (const id of [...jobs.keys()]) stop(id); };
module.exports = { register, stopAll };
