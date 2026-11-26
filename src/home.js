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

const mode = () => document.body.classList.contains('chara-mode') ? 'chara' : document.body.classList.contains('avatar-mode') ? 'avatar' : document.body.classList.contains('write-mode') ? 'write' : document.body.classList.contains('tcg-mode') ? 'tcg' : document.body.classList.contains('vn-mode') ? 'vn' : document.body.classList.contains('manga-mode') ? 'manga' : document.body.classList.contains('games-mode') ? 'game' : document.body.classList.contains('music-mode') ? 'music' : document.body.classList.contains('tiles-mode') ? 'tiles' : document.body.classList.contains('pixels-mode') ? 'pixel' : document.body.classList.contains('video-mode') ? 'video' : 'design';
const api = t => (t === 'video' ? window.SMA_video : t === 'pixel' ? window.SMA_pixels : t === 'tiles' ? window.SMA_tiles : t === 'music' ? window.SMA_music : t === 'game' ? window.SMA_games : t === 'manga' ? window.SMA_manga : t === 'vn' ? window.SMA_vn : t === 'tcg' ? window.SMA_tcg : t === 'chara' ? window.SMA_chara : t === 'avatar' ? window.SMA_avatar : t === 'write' ? window.SMA_write : SMA.design);
SMA.store = Store;
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
  if (ev.detail === 'convert' || ev.detail === 'vconvert' || ev.detail === 'vtrim' || ev.detail === 'live' || ev.detail === 'pixels' || ev.detail === 'tiles' || ev.detail === 'music' || ev.detail === 'games' || ev.detail === 'manga' || ev.detail === 'vn' || ev.detail === 'tcg' || ev.detail === 'write' || ev.detail === 'avatar' || ev.detail === 'vtuber' || ev.detail === 'chara') return;
  nameBox.value = api(ev.detail).getName();
});

// ----- home screen -----
let items = [];
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' days ago'; };
async function render() {
  try { items = await Store.list(); } catch (e) { items = []; }
  const q = $('#h-search').value.trim().toLowerCase(), ty = $('#h-type').value, grid = $('#h-grid');
  const list = items.filter(i => (!ty || i.type === ty) && (!q || (i.name || '').toLowerCase().includes(q)));
  grid.textContent = ''; renderAssets();
  if (!list.length) grid.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: items.length ? 'No projects match.' : 'Nothing here yet. Start a new design or video and it will appear here.' }));
  list.forEach(i => {
    const c = document.createElement('div'); c.className = 'card2';
    const t = document.createElement('div'); t.className = 'thumb'; if (i.thumb) { const im = document.createElement('img'); im.src = i.thumb; im.alt = ''; t.append(im); } else t.textContent = i.type === 'video' ? '🎞' : i.type === 'pixel' ? '👾' : i.type === 'tiles' ? '🧱' : i.type === 'music' ? '🎵' : i.type === 'game' ? '🎮' : i.type === 'manga' ? '📖' : i.type === 'vn' ? '💬' : i.type === 'tcg' ? '🃏' : i.type === 'write' ? '📝' : i.type === 'chara' ? '🗨' : i.type === 'avatar' ? '🧍' : '🖼';
    const n = Object.assign(document.createElement('b'), { textContent: i.name || 'Untitled' });
    const m = Object.assign(document.createElement('small'), { textContent: (i.type === 'video' ? 'Video' : i.type === 'pixel' ? 'Pixel art' : i.type === 'tiles' ? 'Tileset' : i.type === 'music' ? 'Song' : i.type === 'game' ? 'Game' : i.type === 'manga' ? 'Manga' : i.type === 'vn' ? 'Visual novel' : i.type === 'tcg' ? 'Card deck' : i.type === 'write' ? 'Document' : i.type === 'chara' ? 'Character card' : i.type === 'avatar' ? 'Avatar' : 'Design') + ' · ' + ago(i.updated) });
    const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '🗑', title: 'Delete' });
    x.onclick = async ev => { ev.stopPropagation(); if (confirm(`Delete "${i.name || 'Untitled'}"? This cannot be undone.`)) { await Store.del(i.id); render(); } };
    c.onclick = () => open(i.id); c.append(t, n, m, x); grid.append(c);
  });
}
async function open(id) {
  const r = await Store.get(id); if (!r) return;
  api(r.type).load(r.data); api(r.type).setPid(r.id); if (r.type === 'pixel') window.SMA_apps.choose('pixels'); else if (r.type === 'tiles') window.SMA_apps.choose('tiles'); else if (r.type === 'music') window.SMA_apps.choose('music'); else if (r.type === 'game') window.SMA_apps.choose('games'); else if (r.type === 'manga') window.SMA_apps.choose('manga'); else if (r.type === 'vn') window.SMA_apps.choose('vn'); else if (r.type === 'tcg') window.SMA_apps.choose('tcg'); else if (r.type === 'write') window.SMA_apps.choose('write'); else if (r.type === 'avatar') window.SMA_apps.choose('avatar'); else if (r.type === 'chara') window.SMA_apps.choose('chara'); else SMA.setMode(r.type);
}
// ----- assets: everything kept in Sources for later (pictures, video, sound, fonts, text grabbed from the screen) -----
const abar = document.createElement('div'); abar.className = 'home-bar'; abar.id = 'h-abar';
abar.innerHTML = '<h2>Assets</h2><span class="h-aright"><button id="h-anew" type="button" title="Make a folder here to keep assets tidy (the same folders as in Sources)">+ Folder</button> <select id="h-atype"><option value="">All</option><option value="image">Pictures</option><option value="video">Video</option><option value="audio">Sound</option><option value="font">Fonts</option><option value="text">Text</option></select></span>';
const acrumbs = document.createElement('div'); acrumbs.id = 'h-acrumbs';
const agrid = document.createElement('div'); agrid.id = 'h-assets'; $('#h-grid').after(abar, acrumbs, agrid);
const akind = { image: 'Picture', video: 'Video', audio: 'Sound', font: 'Font', text: 'Text' };
let aurls = [], acur = null, arenaming = null; // the folder being looked at (null = top level), and the folder being renamed
// folders are the same ones Sources has (SMA.folders), so organising in either place shows in both
const F = () => SMA.folders;
function adrop(n, target) {
  n.addEventListener('dragover', ev => { if (![...ev.dataTransfer.types].some(t => t === 'text/sma-source' || t === 'text/sma-folder')) return; ev.preventDefault(); n.classList.add('over'); });
  n.addEventListener('dragleave', () => n.classList.remove('over'));
  n.addEventListener('drop', ev => {
    n.classList.remove('over'); const sid = ev.dataTransfer.getData('text/sma-source'), fid = ev.dataTransfer.getData('text/sma-folder');
    if (!sid && !fid) return; ev.preventDefault(); ev.stopPropagation();
    if (sid) F().moveSource(sid, target); else F().moveFolder(fid, target);
  });
}
function renderAssets() {
  aurls.forEach(u => URL.revokeObjectURL(u)); aurls = []; agrid.textContent = ''; acrumbs.textContent = '';
  const q = $('#h-search').value.trim().toLowerCase(), ty = $('#h-atype').value, searching = !!(q || ty);
  acur = F().valid(acur);
  const all = SMA.getSources(), allF = F().all();
  // while searching or filtering, look through every folder; otherwise show one folder at a time
  const list = all.filter(a => (!ty || a.kind === ty) && (!q || (a.name || '').toLowerCase().includes(q)) && (searching || F().valid(a.folder) === acur)).sort((a, b) => b.added - a.added);
  const subs = searching ? [] : allF.filter(f => (F().valid(f.parent) || null) === acur).sort((a, b) => a.name.localeCompare(b.name));
  abar.querySelector('#h-anew').hidden = searching;
  if (!searching && (acur || allF.length)) { // the path back up, only once there are folders
    const chain = []; for (let f = F().of(acur), n = 0; f && n < 99; f = F().of(f.parent), n++) chain.unshift(f);
    [{ id: null, name: 'Assets' }, ...chain].forEach((f, i, arr) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = f.name; b.className = 'crumb' + (i === arr.length - 1 ? ' on' : ''); b.onclick = () => { acur = f.id; renderAssets(); }; adrop(b, f.id); acrumbs.append(b); if (i < arr.length - 1) acrumbs.append(' › '); });
  }
  if (!list.length && !subs.length) { agrid.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: searching ? 'No assets match.' : acur ? 'This folder is empty. Drag assets or folders here.' : all.length ? 'No assets here.' : 'Nothing saved yet. Pictures, video, sound and fonts you add to Sources, and text you save with Text Grab, show up here for later.' })); return; }
  subs.forEach(f => {
    const c = document.createElement('div'); c.className = 'card2 fld'; c.draggable = true; c.title = f.name + ' (click to open, drag to move)';
    c.ondragstart = ev => { ev.dataTransfer.setData('text/sma-folder', f.id); ev.dataTransfer.effectAllowed = 'move'; };
    const t = document.createElement('div'); t.className = 'thumb'; t.textContent = '📁';
    const count = all.filter(x => x.folder === f.id).length + allF.filter(x => x.parent === f.id).length;
    let n;
    if (arenaming === f.id) { n = document.createElement('input'); n.value = f.name; n.className = 'rn'; n.maxLength = 60;
      const done = ok => { if (arenaming !== f.id) return; arenaming = null; if (ok) F().rename(f.id, n.value); else renderAssets(); };
      n.onkeydown = ev => { if (ev.key === 'Enter') done(true); else if (ev.key === 'Escape') done(false); ev.stopPropagation(); }; n.onblur = () => done(true); n.onclick = ev => ev.stopPropagation(); setTimeout(() => { n.focus(); n.select(); }, 0); }
    else { n = Object.assign(document.createElement('b'), { textContent: f.name }); n.ondblclick = ev => { ev.stopPropagation(); arenaming = f.id; renderAssets(); }; }
    const m = Object.assign(document.createElement('small'), { textContent: 'Folder · ' + count + (count === 1 ? ' item' : ' items') });
    const r = Object.assign(document.createElement('button'), { className: 'x r', textContent: '✎', title: 'Rename folder' }); r.onclick = ev => { ev.stopPropagation(); arenaming = f.id; renderAssets(); };
    const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '🗑', title: 'Delete folder (its contents move up; nothing in it is deleted)' }); x.onclick = ev => { ev.stopPropagation(); F().remove(f.id); };
    c.onclick = () => { if (arenaming !== f.id) { acur = f.id; renderAssets(); } }; adrop(c, f.id); c.append(t, n, m, r, x); agrid.append(c);
  });
  list.forEach(a => {
    const c = document.createElement('div'); c.className = 'card2'; c.draggable = true; const t = document.createElement('div'); t.className = 'thumb';
    c.ondragstart = ev => { ev.dataTransfer.setData('text/sma-source', a.id); ev.dataTransfer.effectAllowed = 'move'; };
    if (a.kind === 'image' || a.kind === 'video') { const u = URL.createObjectURL(a.blob); aurls.push(u); const m = document.createElement(a.kind === 'image' ? 'img' : 'video'); m.src = u + (a.kind === 'video' ? '#t=0.1' : ''); m.muted = true; m.preload = 'metadata'; m.draggable = false; t.append(m); }
    else if (a.kind === 'text') { t.className += ' txt'; t.textContent = '📝'; a.blob.slice(0, 400).text().then(x => { const p = document.createElement('div'); p.className = 'atxt'; p.textContent = x.trim().slice(0, 160); t.textContent = ''; t.append(p); }).catch(() => {}); }
    else t.textContent = a.kind === 'font' ? 'Aa' : '♪';
    const n = Object.assign(document.createElement('b'), { textContent: a.name || 'Untitled' });
    const m = Object.assign(document.createElement('small'), { textContent: (akind[a.kind] || 'File') + ' · ' + ago(a.added) });
    const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '🗑', title: 'Remove from assets' });
    x.onclick = async ev => { ev.stopPropagation(); if (confirm(`Remove "${a.name}" from your assets?`)) SMA.delSource(a.id); };
    c.onclick = () => { if (a.kind === 'image') SMA.setMode('design'); SMA.useSource(a); }; c.append(t, n, m, x); agrid.append(c);
  });
}
abar.querySelector('#h-anew').onclick = () => { const f = F().make(acur); arenaming = f.id; renderAssets(); };
SMA.subscribe(() => { if (document.body.classList.contains('home-mode')) renderAssets(); });
$('#h-atype').onchange = renderAssets; $('#h-search').addEventListener('input', renderAssets);
$('#h-search').oninput = $('#h-type').onchange = render;
$('#h-new').onclick = () => $('#new').click();
$('#h-newvideo').onclick = () => { window.SMA_video.reset(); SMA.setMode('video'); };
$('#h-open').onclick = () => { SMA.setMode('design'); $('#open').click(); };
SMA.setMode('home'); // scripts load in order, so (re)announce the starting mode now that this file is ready
if (Store.folder) $('#h-folder').onclick = () => Store.folder(); else $('#h-folder').hidden = true;
})();
