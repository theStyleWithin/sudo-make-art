// Home screen and project storage. Projects autosave while you edit; desktop keeps them as files in ~/sudo-make-art/projects.
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA;
if (!SMA) return;

// ----- storage: files on desktop, IndexedDB on Android -----
const ipc = window.sma && window.sma.projects;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('sudo-make-art-projects', 1); r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const q = fn(db.transaction('p', mode).objectStore('p')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
const Store = ipc ? { list: () => ipc.list(), get: id => ipc.get(id), put: r => ipc.put(r), del: id => ipc.del(id), folder: () => ipc.folder() } : {
  list: async () => (await tx('readonly', s => s.getAll())).map(({ data, ...m }) => m).sort((a, b) => b.updated - a.updated),
  get: id => tx('readonly', s => s.get(id)),
  put: async r => { const m = { ...r, updated: Date.now() }; await tx('readwrite', s => s.put(m)); return m; },
  del: id => tx('readwrite', s => s.delete(id)),
  folder: null,
};

const mode = () => document.body.classList.contains('video-mode') ? 'video' : 'design';
const api = t => (t === 'video' ? window.SMA_video : SMA.design);
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ----- autosave (only after the user actually edits something) -----
let timer = null, saving = Promise.resolve();
async function saveNow() {
  clearTimeout(timer); timer = null;
  const type = mode(), a = api(type); if (!a) return;
  if (!a.getPid()) a.setPid(newId());
  const rec = { id: a.getPid(), type, name: a.getName(), data: a.serialize(), thumb: await a.thumb().catch(() => null) };
  saving = saving.then(() => Store.put(rec)).catch(e => console.error('save failed', e)); return saving;
}
document.addEventListener('sma-edit', () => { if (document.body.classList.contains('home-mode')) return; clearTimeout(timer); timer = setTimeout(saveNow, 1200); });
window.addEventListener('beforeunload', () => { if (timer) saveNow(); });

// ----- name box in the header -----
const nameBox = $('#docname');
nameBox.oninput = () => { api(mode()).setName(nameBox.value || 'Untitled'); document.dispatchEvent(new Event('sma-edit')); };
document.addEventListener('sma-mode', async ev => {
  if (ev.detail === 'home') { if (timer) await saveNow(); await render(); return; }
  nameBox.value = api(ev.detail).getName();
});

// ----- home screen -----
let items = [];
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' days ago'; };
async function render() {
  try { items = await Store.list(); } catch (e) { items = []; }
  const q = $('#h-search').value.trim().toLowerCase(), ty = $('#h-type').value, grid = $('#h-grid');
  const list = items.filter(i => (!ty || i.type === ty) && (!q || (i.name || '').toLowerCase().includes(q)));
  grid.textContent = '';
  if (!list.length) grid.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: items.length ? 'No projects match.' : 'Nothing here yet. Start a new design or video and it will appear here.' }));
  list.forEach(i => {
    const c = document.createElement('div'); c.className = 'card2';
    const t = document.createElement('div'); t.className = 'thumb'; if (i.thumb) { const im = document.createElement('img'); im.src = i.thumb; im.alt = ''; t.append(im); } else t.textContent = i.type === 'video' ? '🎞' : '🖼';
    const n = Object.assign(document.createElement('b'), { textContent: i.name || 'Untitled' });
    const m = Object.assign(document.createElement('small'), { textContent: (i.type === 'video' ? 'Video' : 'Design') + ' · ' + ago(i.updated) });
    const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '🗑', title: 'Delete' });
    x.onclick = async ev => { ev.stopPropagation(); if (confirm(`Delete "${i.name || 'Untitled'}"? This cannot be undone.`)) { await Store.del(i.id); render(); } };
    c.onclick = () => open(i.id); c.append(t, n, m, x); grid.append(c);
  });
}
async function open(id) {
  const r = await Store.get(id); if (!r) return;
  api(r.type).load(r.data); api(r.type).setPid(r.id); SMA.setMode(r.type);
}
$('#h-search').oninput = $('#h-type').onchange = render;
$('#h-new').onclick = () => $('#new').click();
$('#h-newvideo').onclick = () => { window.SMA_video.reset(); SMA.setMode('video'); };
$('#h-open').onclick = () => { SMA.setMode('design'); $('#open').click(); };
SMA.setMode('home'); // scripts load in order, so (re)announce the starting mode now that this file is ready
if (Store.folder) $('#h-folder').onclick = () => Store.folder(); else $('#h-folder').hidden = true;
})();
