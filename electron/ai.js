'use strict';
// Runs a local image-generation engine (stable-diffusion.cpp style CLI) as a child process. No network is used here:
// the engine binary and the model files are supplied by the user and live on this machine.
const { app, ipcMain, dialog, shell, BrowserWindow } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { planRun } = require('./plan');

const MODEL_EXT = ['.safetensors', '.ckpt', '.gguf'];
const settingsFile = () => path.join(app.getPath('userData'), 'ai-settings.json');
const modelsDir = () => { const d = path.join(app.getPath('userData'), 'models'); fs.mkdirSync(d, { recursive: true }); return d; };

function loadSettings() {
  try { return { engines: {}, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (e) { return { engines: {} }; }
}
const saveSettings = s => fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));

const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 5000 }, (e, out) => res(e ? null : String(out))));
async function hardware() {
  let gpu = null;
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits']);
  if (out) { const [name, total, free] = out.trim().split('\n')[0].split(',').map(s => s.trim()); if (name && +total) gpu = { vendor: 'nvidia', name, vramTotal: +total, vramFree: +free }; }
  return { gpu, ramTotal: Math.floor(os.totalmem() / 1048576), ramFree: Math.floor(os.freemem() / 1048576), cores: os.cpus().length };
}
function listModels() {
  const dir = modelsDir();
  return fs.readdirSync(dir).filter(f => MODEL_EXT.includes(path.extname(f).toLowerCase()))
    .map(f => ({ name: f, bytes: fs.statSync(path.join(dir, f)).size }));
}
const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const jobs = new Map();

function register() {
  ipcMain.handle('ai:hardware', hardware);
  ipcMain.handle('ai:settings', () => loadSettings());
  ipcMain.handle('ai:models', () => ({ dir: modelsDir(), models: listModels() }));
  ipcMain.handle('ai:open-models', () => shell.openPath(modelsDir()));
  ipcMain.handle('ai:choose-engine', async (e, kind) => {
    if (!['cuda', 'vulkan', 'cpu'].includes(kind)) throw new Error('Unknown engine kind');
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: `Choose the ${kind.toUpperCase()} engine executable`, properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return loadSettings();
    const s = loadSettings(); s.engines[kind] = r.filePaths[0]; saveSettings(s); return s;
  });
  ipcMain.handle('ai:clear-engine', (e, kind) => { const s = loadSettings(); delete s.engines[kind]; saveSettings(s); return s; });
  ipcMain.handle('ai:plan', async (e, p) => {
    const m = listModels().find(x => x.name === p.model); if (!m) throw new Error('Model not found in the models folder');
    return planRun(await hardware(), { modelBytes: m.bytes, width: clamp(p.width, 64, 2048, 512), height: clamp(p.height, 64, 2048, 512), engines: loadSettings().engines });
  });

  ipcMain.handle('ai:generate', async (e, p) => {
    const sender = e.sender;
    const m = listModels().find(x => x.name === p.model); if (!m) throw new Error('Model not found in the models folder');
    const modelPath = path.join(modelsDir(), m.name);
    const width = Math.round(clamp(p.width, 64, 2048, 512) / 8) * 8, height = Math.round(clamp(p.height, 64, 2048, 512) / 8) * 8;
    const plan = planRun(await hardware(), { modelBytes: m.bytes, width, height, engines: loadSettings().engines });
    if (!plan.engine) throw new Error(plan.notes[plan.notes.length - 1]);
    if (!fs.existsSync(plan.engine)) throw new Error('Engine not found: ' + plan.engine);

    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sma-ai-')), out = path.join(dir, 'out.png');
    const extra = String(p.extraArgs || '').split(/\s+/).filter(Boolean);
    const args = [...extra, '-m', modelPath, '-p', String(p.prompt || '').slice(0, 4000), '-n', String(p.negative || '').slice(0, 4000),
      '-W', String(width), '-H', String(height), '--steps', String(Math.round(clamp(p.steps, 1, 150, 20))), '--cfg-scale', String(clamp(p.cfg, 0, 30, 7)),
      '-s', String(Math.round(clamp(p.seed, -1, 2 ** 31 - 1, -1))), '-t', String(plan.threads), ...plan.flags, '-o', out];
    if (p.init instanceof ArrayBuffer && p.init.byteLength) {
      const initPath = path.join(dir, 'init.png'); fs.writeFileSync(initPath, Buffer.from(p.init));
      args.push('-i', initPath, '--strength', String(clamp(p.strength, 0, 1, 0.75)));
    }
    if (p.mask instanceof ArrayBuffer && p.mask.byteLength) { const mp = path.join(dir, 'mask.png'); fs.writeFileSync(mp, Buffer.from(p.mask)); args.push('--mask', mp); }

    return new Promise((resolve, reject) => {
      const child = spawn(plan.engine, args, { stdio: ['ignore', 'ignore', 'pipe'], cwd: dir });
      jobs.set(id, child); let tail = '';
      sender.send('ai:started', { id, plan });
      child.stderr.on('data', d => {
        const s = String(d); tail = (tail + s).slice(-800);
        const mt = [...s.matchAll(/(\d+)\s*\/\s*(\d+)/g)].pop();
        if (mt && !sender.isDestroyed()) sender.send('ai:progress', { id, step: +mt[1], total: +mt[2] });
      });
      child.on('error', err => { jobs.delete(id); fs.rmSync(dir, { recursive: true, force: true }); reject(err); });
      child.on('close', code => {
        const cancelled = !jobs.has(id); jobs.delete(id);
        try {
          if (cancelled) throw new Error('Cancelled');
          if (code !== 0 || !fs.existsSync(out)) throw new Error('Engine failed: ' + tail.trim().split('\n').slice(-3).join(' '));
          const b = fs.readFileSync(out); resolve({ id, image: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), plan });
        } catch (err) { reject(err); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      });
    });
  });
  ipcMain.handle('ai:cancel', (e, id) => { const c = jobs.get(id); if (c) { jobs.delete(id); c.kill(); } });
}
module.exports = { register };
