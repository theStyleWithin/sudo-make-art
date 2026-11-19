// Builds sma-spout.exe, the small Windows helper that publishes Sudo Make VTuber's picture as a Spout sender (native/spout).
// It fetches the Spout2 SDK (BSD 2-Clause) at one pinned commit, checks that it got exactly that commit, and compiles the helper
// with MinGW g++ into vendor/spout/win/. It never fails the build: if anything is missing the app simply ships without the
// helper and says so on the Output page. On other systems it only makes the empty folder the packager expects.
// SMA_SPOUT_CC overrides the compiler (used to cross-build from Linux with x86_64-w64-mingw32-g++).
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const COMMIT = '6b68a5b4fdeca6130b851e5f9366467a844860e5'; // Spout2 2.007.018
const root = path.join(__dirname, '..'), out = path.join(root, 'vendor', 'spout', 'win'), work = path.join(root, 'vendor', 'spout', '_src');
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(path.join(root, 'vendor', 'spout', 'linux'), { recursive: true });
const cc = process.env.SMA_SPOUT_CC || (process.platform === 'win32' ? 'g++' : null);
const skip = why => { console.log('[spout] skipped: ' + why); process.exit(0); };
if (!cc) skip('not a Windows build');
if (spawnSync(cc, ['--version'], { stdio: 'ignore' }).status !== 0) skip('no ' + cc + ' compiler found');
try {
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: work, stdio: 'pipe' });
  git('init', '-q'); git('remote', 'add', 'origin', 'https://github.com/leadedge/Spout2'); git('fetch', '-q', '--depth', '1', 'origin', COMMIT); git('checkout', '-q', 'FETCH_HEAD');
  if (String(git('rev-parse', 'HEAD')).trim() !== COMMIT) throw new Error('got a different Spout2 commit than the pinned one');
  const S = path.join(work, 'SPOUTSDK'), gl = f => path.join(S, 'SpoutGL', f);
  const srcs = [path.join(root, 'native', 'spout', 'sma-spout.cpp'), path.join(S, 'SpoutDirectX', 'SpoutDX', 'SpoutDX.cpp'), ...['SpoutCopy', 'SpoutDirectX', 'SpoutFrameCount', 'SpoutSenderNames', 'SpoutSharedMemory', 'SpoutUtils'].map(n => gl(n + '.cpp'))];
  const exe = path.join(out, 'sma-spout.exe');
  execFileSync(cc, ['-O2', '-std=c++17', '-mssse3', '-msse4.1', '-static', '-o', exe, ...srcs, '-I' + path.join(S, 'SpoutDirectX', 'SpoutDX'), '-I' + path.join(S, 'SpoutGL'), '-ld3d11', '-ldxgi', '-lole32', '-lversion', '-lshell32', '-ladvapi32', '-luuid', '-lwinmm', '-lshlwapi', '-luser32', '-lgdi32', '-lpsapi', '-lcomdlg32', '-lcomctl32'], { stdio: 'inherit' });
  fs.copyFileSync(path.join(S, '..', 'LICENSE'), path.join(out, 'Spout2-LICENSE.txt'));
  console.log('[spout] built ' + exe + ' (' + fs.statSync(exe).size + ' bytes)');
} catch (e) { console.log('[spout] could not build the helper: ' + (e.message || e).toString().slice(0, 300)); }
finally { fs.rmSync(work, { recursive: true, force: true }); }
