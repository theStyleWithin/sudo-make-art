'use strict';
// Looks at this PC: graphics card(s), video memory, RAM and CPU cores. Read-only; nothing is sent anywhere.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const run = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 5000 }, (e, out) => res(e ? null : String(out))));

async function nvidia() {
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total,memory.free', '--format=csv,noheader,nounits']);
  if (!out) return [];
  return out.trim().split('\n').map(l => { const [name, total, free] = l.split(',').map(s => s.trim()); return { vendor: 'nvidia', name, vramTotal: +total, vramFree: +free }; })
    .filter(g => g.name && g.vramTotal > 0);
}
function amdLinux() { // AMD cards expose their memory in sysfs on Linux
  const out = [], base = '/sys/class/drm';
  let cards; try { cards = fs.readdirSync(base).filter(c => /^card\d+$/.test(c)); } catch (e) { return out; }
  const rd = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return null; } };
  for (const c of cards) {
    const d = path.join(base, c, 'device');
    if (rd(path.join(d, 'vendor')) !== '0x1002') continue;
    const total = Number(rd(path.join(d, 'mem_info_vram_total'))), used = Number(rd(path.join(d, 'mem_info_vram_used'))) || 0;
    if (total > 0) out.push({ vendor: 'amd', name: rd(path.join(d, 'product_name')) || 'AMD graphics card', vramTotal: Math.floor(total / 1048576), vramFree: Math.floor((total - used) / 1048576) });
  }
  return out;
}
async function hardware() {
  const gpus = [...await nvidia(), ...amdLinux()].sort((a, b) => b.vramFree - a.vramFree);
  return { gpu: gpus[0] || null, gpus, ramTotal: Math.floor(os.totalmem() / 1048576), ramFree: Math.floor(os.freemem() / 1048576), cores: os.cpus().length };
}
module.exports = { hardware };
