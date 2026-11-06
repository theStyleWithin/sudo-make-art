// Downloads the official libjxl command-line tools (BSD-3-Clause) for the build platform, checks their SHA-256 against the
// pinned values below, and unpacks cjxl, djxl, cjpegli, djpegli and the licence files into vendor/libjxl/<linux|win>/.
// The release build bundles them so JPEG XL works out of the box. Nothing is executed here.
'use strict';
const https = require('https'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');

const V = 'v0.11.1', BASE = `https://github.com/libjxl/libjxl/releases/download/${V}/`;
const PLATFORMS = {
  linux: { file: `jxl-linux-x86_64-static-${V}.tar.gz`, sha256: '7ba87d09f220568a7e84c2a62e9fa8be608443930dec10b2799271d4cf032293', dir: 'tools', ext: '', tarArgs: ['-xzf'] },
  win: { file: 'jxl-x64-windows-static.zip', sha256: '8f53ebce91820c30c9fc9294f06380213c1e2e66b361718880580246b2be008e', dir: '', ext: '.exe', tarArgs: ['-xf'] },
};
const TOOLS = ['cjxl', 'djxl', 'cjpegli', 'djpegli'];
// On Windows use the system's own tar.exe (it opens .zip); a Git Bash 'tar' earlier on PATH would not.
const WIN_TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), TAR = process.platform === 'win32' && fs.existsSync(WIN_TAR) ? WIN_TAR : 'tar';

const key = process.argv[2] || (process.platform === 'win32' ? 'win' : 'linux'), P = PLATFORMS[key];
if (!P) { console.error('Unknown platform ' + key + ' (use linux or win)'); process.exit(1); }
const out = path.join(__dirname, '..', 'vendor', 'libjxl', key);
if (TOOLS.every(t => fs.existsSync(path.join(out, t + P.ext))) && !process.argv.includes('--force')) { console.log('libjxl tools already in', out); process.exit(0); }

function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'sudo-make-art-build' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) { res.resume(); return resolve(download(res.headers.location, dest, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Download failed: HTTP ${res.statusCode}`)); }
      const f = fs.createWriteStream(dest); res.pipe(f); f.on('finish', () => f.close(resolve)); f.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jxl-')), archive = path.join(tmp, P.file), unpacked = path.join(tmp, 'x');
  try {
    console.log('Downloading', BASE + P.file); await download(BASE + P.file, archive);
    const sum = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (sum !== P.sha256) throw new Error(`Checksum mismatch for ${P.file}: expected ${P.sha256}, got ${sum}`);
    fs.mkdirSync(unpacked); // Windows' tar (bsdtar) opens .zip; elsewhere use unzip for them
    const r = P.file.endsWith('.zip') && process.platform !== 'win32' ? spawnSync('unzip', ['-q', archive, '-d', unpacked]) : spawnSync(TAR, [...P.tarArgs, archive, '-C', unpacked]); if (r.status !== 0 && !(r.status === 1 && P.file.endsWith('.zip'))) throw new Error('Could not unpack: ' + String(r.stderr));
    fs.mkdirSync(out, { recursive: true });
    for (const t of TOOLS) { const from = path.join(unpacked, P.dir, t + P.ext); if (!fs.existsSync(from)) throw new Error('Missing in archive: ' + t); const to = path.join(out, t + P.ext); fs.copyFileSync(from, to); fs.chmodSync(to, 0o755); }
    for (const f of fs.readdirSync(unpacked)) if (f.startsWith('LICENSE')) fs.copyFileSync(path.join(unpacked, f), path.join(out, f));
    console.log('libjxl', V, 'tools ready in', out);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e.message); process.exit(1); });
