'use strict';
// Saved projects live as plain files you can see and back up: ~/sudo-make-art/projects/<id>.json (+ <id>.meta.json for the home screen).
const { ipcMain, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = () => { const d = path.join(os.homedir(), 'sudo-make-art', 'projects'); fs.mkdirSync(d, { recursive: true }); return d; };
const okId = id => typeof id === 'string' && /^[A-Za-z0-9]{4,40}$/.test(id);
const file = (id, ext) => { if (!okId(id)) throw new Error('Bad project id'); return path.join(dir(), id + ext); };

function register() {
  ipcMain.handle('projects:list', () => fs.readdirSync(dir()).filter(f => f.endsWith('.meta.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')); } catch (e) { return null; } })
    .filter(Boolean).sort((a, b) => b.updated - a.updated));
  ipcMain.handle('projects:get', (e, id) => { const meta = JSON.parse(fs.readFileSync(file(id, '.meta.json'), 'utf8')); return { ...meta, data: fs.readFileSync(file(id, '.json'), 'utf8') }; });
  ipcMain.handle('projects:put', (e, r) => {
    if (!r || !['design', 'video'].includes(r.type) || typeof r.data !== 'string' || r.data.length > 2 ** 30) throw new Error('Invalid project');
    const meta = { id: r.id, type: r.type, name: String(r.name || 'Untitled').slice(0, 120), updated: Date.now(), thumb: typeof r.thumb === 'string' && r.thumb.length < 400000 ? r.thumb : null };
    fs.writeFileSync(file(r.id, '.json') + '.tmp', r.data); fs.renameSync(file(r.id, '.json') + '.tmp', file(r.id, '.json')); // never leave a half-written project
    fs.writeFileSync(file(r.id, '.meta.json'), JSON.stringify(meta)); return meta;
  });
  ipcMain.handle('projects:del', (e, id) => { for (const x of ['.json', '.meta.json']) fs.rmSync(file(id, x), { force: true }); });
  ipcMain.handle('projects:folder', () => shell.openPath(dir()));
}
module.exports = { register };
