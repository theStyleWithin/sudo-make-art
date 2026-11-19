// Profiles: bring your setup over from HopCast, and keep a Sudo Make Art profile in a file so a new install needs less work.
// A Sudo Make Art profile (.smaprofile) is a zip: profile.json plus, if you choose, your Sources library. Stream keys are only
// included if you set a password, and are then encrypted with it. The reading of HopCast's files happens in electron/profile.js.
(() => {
'use strict';
const api = window.sma && window.sma.profile; if (!api) return;
const $ = s => document.querySelector(s), el = (tag, a = {}, t) => Object.assign(document.createElement(tag), a, t !== undefined ? { textContent: t } : {});
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const UI = () => window.SMA_live.ui, live = () => window.SMA_live;
const fmtBytes = n => n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const toast = t => { const n = el('div', { className: 'toast' }, t); document.body.append(n); setTimeout(() => n.remove(), 9000); };

// ---------- a small zip writer and reader (stored files, so no compression step is needed) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const f of files) { const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data); const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true); central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + f.data.length; }
  const cd = central.reduce((n, a) => n + a.length, 0), end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}
async function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error('That is not a profile file');
  const n = dv.getUint16(e + 10, true), dec = new TextDecoder(), out = new Map(); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) { if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The profile file is damaged'); const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl; const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true), data = u8.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    out.set(name, async () => (method === 0 ? data : new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()))); }
  return out;
}

// ---------- import from HopCast ----------
async function importHopcast() {
  let roots = []; try { roots = await api.hopcastFind(); } catch (e) {}
  const { dlg, para } = UI();
  const pickFolder = async () => { const d = await api.hopcastPick(); if (d) readAndShow(d); };
  if (!roots.length) { dlg({ title: 'Import from HopCast', buttons: [{ label: 'Choose the folder…', primary: true, fn: () => { pickFolder(); } }, { label: 'Cancel' }], body: box => para(box, ['HopCast\'s settings were not found in the usual place (~/.config/PRISMLiveStudio).', 'If you keep them somewhere else, or have a HopCast settings backup, choose that folder.']) }); return; }
  if (roots.length === 1) return readAndShow(roots[0].root);
  dlg({ title: 'Import from HopCast', buttons: [{ label: 'Choose another folder…', fn: () => { pickFolder(); } }, { label: 'Cancel' }], body: box => { para(box, ['Which HopCast settings do you want to bring over?']); roots.forEach(r => { const b = el('button', { className: 'hc-src', textContent: r.label + '  (' + r.root + ')' }); b.onclick = () => { document.getElementById('hcdlg')?.remove(); readAndShow(r.root); }; box.append(b); }); } });
}
async function readAndShow(root) {
  const { dlg, field, check, para } = UI(); let imp;
  try { imp = await api.hopcastRead(root); } catch (e) { dlg({ title: 'Import from HopCast', buttons: [{ label: 'OK', primary: true }], body: box => para(box, [clean(e)]) }); return; }
  const sel = { profile: imp.profiles[0] || null, collections: imp.collections.slice(), channels: imp.channels.slice(), audio: true, global: !!(imp.global.snap || imp.global.tray), recordDir: false, globalData: imp.global };
  if (!imp.profiles.length && !imp.collections.length && !imp.channels.length) { dlg({ title: 'Import from HopCast', buttons: [{ label: 'OK', primary: true }], body: box => para(box, ['Nothing to import was found in ' + imp.root + '.', imp.channelNote].filter(Boolean)) }); return; }
  dlg({ title: 'Import from HopCast', wide: true, buttons: [{ label: 'Import', primary: true, fn: async d => { d.buttons.Import.disabled = true; d.buttons.Import.textContent = 'Importing…'; let r; try { r = await live().importHopcast(sel); } catch (e) { toast('The import failed: ' + clean(e)); return; }
      const t = r.done; toast(`Imported from HopCast: ${t.collections} scene collection${t.collections === 1 ? '' : 's'} (${t.items} sources), ${t.channels} channel${t.channels === 1 ? '' : 's'}${t.settings ? ', output settings' : ''}${t.audio ? ', ' + t.audio + ' audio input' + (t.audio === 1 ? '' : 's') : ''}.` + (r.skipped.length ? ' ' + r.skipped.length + ' thing' + (r.skipped.length === 1 ? ' was' : 's were') + ' left out; see Notifications.' : '')); r.skipped.forEach(s => live().notify(s)); } }, { label: 'Choose another folder…', fn: async () => { const d = await api.hopcastPick(); if (d) setTimeout(() => readAndShow(d), 0); } }, { label: 'Cancel' }],
    body: box => {
      para(box, ['Found in ' + imp.root + '. Pick what to bring over. Nothing is changed in HopCast, and your existing Sudo Make Live setup stays (imported scenes are added as new collections).']);
      if (imp.profiles.length) { const s = el('select'); imp.profiles.forEach((p, i) => s.add(new Option(`${p.name}  (${p.width}×${p.height}, ${p.fps} fps, ${p.vbr} kbps)`, i))); s.onchange = () => { sel.profile = imp.profiles[+s.value]; }; box.append(field('Output settings from', s)); box.append(check('Also use its recording folder (' + (sel.profile.recordDir || 'none') + ')', false, v => { sel.recordDir = v; })); }
      if (imp.collections.length) { box.append(el('h4', { textContent: 'Scene collections' })); imp.collections.forEach(c => box.append(check(`${c.name}: ${c.scenes.length} scene${c.scenes.length === 1 ? '' : 's'}, ${c.scenes.reduce((n, s) => n + s.items.length, 0)} sources`, true, v => { sel.collections = v ? [...sel.collections, c] : sel.collections.filter(x => x !== c); }))); box.append(check('Audio inputs from those collections', true, v => { sel.audio = v; })); }
      if (imp.channels.length) { box.append(el('h4', { textContent: 'Channels (with their stream keys, kept encrypted here)' })); imp.channels.forEach(c => box.append(check(`${c.name}: ${c.url}`, true, v => { sel.channels = v ? [...sel.channels, c] : sel.channels.filter(x => x !== c); }))); }
      if (imp.channelNote) { const note = el('p', { className: 'hc-hint', textContent: imp.channelNote }); box.append(note); if (imp.channelNote.includes('key file')) { const b = el('button', { className: 'hc-mini', textContent: 'Choose HopCast\'s key file…' }); b.onclick = async () => { try { const k = await api.hopcastKey(); if (k) toast('Put that file at ~/.local/share/hopcast/secure-store.key (or next to the folder) and import again.'); } catch (e) { toast(clean(e)); } }; box.append(b); } }
      if (imp.global.snap || imp.global.tray) box.append(check('Snapping and tray options', true, v => { sel.global = v; }));
      if (imp.warnings.length) { box.append(el('h4', { textContent: 'Left out' })); para(box, imp.warnings.slice(0, 8)); }
    } });
}

// ---------- export my Sudo Make Art profile ----------
const LS_KEYS = ['sma-live', 'sma.stripMeta', 'sma-folders', 'sma.signatures', 'sma-app'];
async function exportProfile() {
  const { dlg, check, field, para } = UI(), srcs = window.SMA.getSources(), libSize = srcs.reduce((n, s) => n + (s.blob ? s.blob.size : 0), 0), chans = live().getChannels();
  const o = { prefs: true, live: true, channels: true, keys: false, library: false, pass: '' };
  dlg({ title: 'Export my Sudo Make Art profile', wide: true, buttons: [{ label: 'Export…', primary: true, fn: async d => {
    if (o.keys && (!o.channels || !chans.length)) o.keys = false; if (o.keys && o.pass.length < 4) { toast('Choose a password of at least 4 characters for the stream keys.'); return false; }
    d.buttons['Export…'].disabled = true; d.buttons['Export…'].textContent = 'Working…';
    try {
      const prof = { app: 'sudo-make-art', format: 1, created: new Date().toISOString(), version: (document.querySelector('#appname') || {}).textContent || '', parts: [] }, files = [];
      if (o.prefs || o.live) { prof.storage = {}; for (const k of LS_KEYS) { if (k === 'sma-live' && !o.live) continue; if (k !== 'sma-live' && !o.prefs && k !== 'sma-folders') continue; if (k === 'sma-folders' && !o.library) continue; const v = localStorage.getItem(k); if (v != null) prof.storage[k] = v; } }
      if (o.live) prof.parts.push('live'); if (o.prefs) { prof.parts.push('prefs'); try { prof.tray = await window.sma.tray.prefs(); delete prof.tray.supported; } catch (e) {} }
      if (o.channels && chans.length) { prof.parts.push('channels'); prof.channels = chans.map(c => ({ id: c.id, name: c.name, type: c.type, url: c.url, user: c.user, enabled: !!c.enabled })); if (o.keys) { prof.parts.push('keys'); prof.sealedKeys = await api.seal(JSON.stringify(chans.map(c => ({ id: c.id, key: c.key, pass: c.pass }))), o.pass); } }
      if (o.library) { prof.parts.push('library'); prof.library = []; for (const s of srcs) { if (!s.blob) continue; const path = 'library/' + s.id; files.push({ name: path, data: new Uint8Array(await s.blob.arrayBuffer()) }); prof.library.push({ id: s.id, name: s.name, kind: s.kind, type: s.blob.type, folder: s.folder || null, fontName: s.fontName, file: path }); } }
      files.unshift({ name: 'profile.json', data: new TextEncoder().encode(JSON.stringify(prof)) });
      const blob = makeZip(files), saved = await api.save('my-sudo-make-art-profile.smaprofile', await blob.arrayBuffer());
      if (saved) toast('Profile saved: ' + saved + (o.keys ? '' : ' (no stream keys in it)')); } catch (e) { toast('Could not export: ' + clean(e)); }
  } }, { label: 'Cancel' }], body: box => {
    para(box, ['Saves your settings in one file, so a new install (or another computer) can pick up where you are with one click. Choose what goes in.']);
    box.append(check('App settings: metadata remover, tray options, saved signatures, last app used', true, v => { o.prefs = v; }), check('Sudo Make Live: scenes, sources, audio mixer, output settings, profiles', true, v => { o.live = v; }),
      check(`Channels: names and server addresses (${chans.length})`, true, v => { o.channels = v; }, 'Stream keys are NOT included unless you also tick the next box.'));
    const pw = el('input', { type: 'password', placeholder: 'Password for the stream keys', autocomplete: 'new-password' }); pw.oninput = () => { o.pass = pw.value; };
    box.append(check('Include stream keys, locked with a password you choose', false, v => { o.keys = v; pw.hidden = !v; }), field('Password', pw)); pw.hidden = true; pw.parentNode.parentNode.hidden = true;
    box.querySelector('.hc-chk:last-of-type input')?.addEventListener('change', e => { pw.parentNode.parentNode.hidden = !e.target.checked; });
    box.append(check(`Sources library: pictures, sounds, fonts and folders (${srcs.length} items, ${fmtBytes(libSize)})`, false, v => { o.library = v; }, 'Makes the file bigger; scenes that use library pictures only work after import if these are included.'));
  } });
}

// ---------- import a Sudo Make Art profile ----------
async function importProfile() {
  const { dlg, check, field, para } = UI(); let f;
  try { f = await api.open(); } catch (e) { toast(clean(e)); return; } if (!f) return;
  let zip, prof; try { zip = await readZip(new Uint8Array(f.bytes)); const pj = zip.get('profile.json'); if (!pj) throw new Error('This is not a Sudo Make Art profile'); prof = JSON.parse(new TextDecoder().decode(await pj())); if (prof.app !== 'sudo-make-art') throw new Error('This is not a Sudo Make Art profile'); }
  catch (e) { toast(clean(e)); return; }
  const has = p => (prof.parts || []).includes(p), o = { prefs: has('prefs'), live: has('live'), channels: has('channels'), keys: has('keys'), library: has('library'), pass: '' };
  dlg({ title: 'Import a Sudo Make Art profile', wide: true, buttons: [{ label: 'Import', primary: true, fn: async d => {
    d.buttons.Import.disabled = true; d.buttons.Import.textContent = 'Importing…';
    try {
      let keyMap = null; if (o.keys && o.channels) { try { keyMap = JSON.parse(await api.unseal(prof.sealedKeys, o.pass)); } catch (e) { toast(clean(e) === 'Wrong password' ? 'Wrong password for the stream keys.' : clean(e)); d.buttons.Import.disabled = false; d.buttons.Import.textContent = 'Import'; return false; } }
      const idMap = new Map(); let nLib = 0;
      if (o.library && prof.library) for (const l of prof.library) { const rd = zip.get(l.file); if (!rd) continue; const file = new File([await rd()], l.name, { type: l.type || '' }); const rec = await window.SMA.addSourceRec(file, l.fontName ? { fontName: l.fontName } : undefined, l.folder || null); if (rec) { idMap.set(l.id, rec.id); nLib++; } }
      const stor = prof.storage || {};
      for (const k of LS_KEYS) { if (stor[k] == null) continue; if (k === 'sma-live' && !o.live) continue; if (k !== 'sma-live' && k !== 'sma-folders' && !o.prefs) continue; if (k === 'sma-folders' && !o.library) continue;
        let v = stor[k]; if (k === 'sma-live' && idMap.size) { v = JSON.stringify(JSON.parse(v), (key, val) => (key === 'src' && idMap.has(val) ? idMap.get(val) : val)); const j = JSON.parse(v); if (j.music && j.music.files) j.music.files = j.music.files.map(x => idMap.get(x) || x); v = JSON.stringify(j); }
        try { localStorage.setItem(k, v); } catch (e) {} }
      if (o.prefs && prof.tray && window.sma.tray) { try { await window.sma.tray.set(prof.tray); } catch (e) {} }
      if (o.channels && prof.channels) { const have = live().getChannels(), add = prof.channels.filter(c => !have.some(h => h.url === c.url)).map(c => { const k = keyMap && keyMap.find(x => x.id === c.id); return { ...c, key: k ? k.key : '', pass: k ? k.pass : '' }; }); live().setChannels([...have, ...add]); await live().persistChannels(); }
      toast('Profile imported. Reloading…'); setTimeout(() => location.reload(), 900);
    } catch (e) { toast('Could not import: ' + clean(e)); d.buttons.Import.disabled = false; d.buttons.Import.textContent = 'Import'; return false; }
  } }, { label: 'Cancel' }], body: box => {
    para(box, [`${f.name}, made ${prof.created ? new Date(prof.created).toLocaleString() : ''}. Choose what to bring in. Your current settings in those areas are replaced; channels are added to the ones you have.`]);
    if (has('prefs')) box.append(check('App settings and saved signatures', true, v => { o.prefs = v; }));
    if (has('live')) box.append(check('Sudo Make Live scenes, sources and settings', true, v => { o.live = v; }));
    if (has('channels')) box.append(check(`Channels (${(prof.channels || []).length})`, true, v => { o.channels = v; }));
    if (has('keys')) { const pw = el('input', { type: 'password', placeholder: 'Password for the stream keys' }); pw.oninput = () => { o.pass = pw.value; }; box.append(check('Stream keys (locked with a password)', true, v => { o.keys = v; pw.disabled = !v; }), field('Password', pw)); }
    if (has('library')) box.append(check(`Sources library (${(prof.library || []).length} items)`, true, v => { o.library = v; }));
  } });
}
window.SMA_profile = { importHopcast, importProfile, exportProfile, makeZip, readZip };

// entry points: Live's Tools menu (added in live.js) and the home screen
const home = $('.home-actions'); if (home) { const mk = (id, t, fn, title) => { const b = el('button', { id, textContent: t, title }); b.onclick = fn; home.insertBefore(b, $('#h-folder')); };
  mk('h-prof-import', 'Import a profile…', () => { const { dlg } = UI(); dlg({ title: 'Import a profile', buttons: [{ label: 'Cancel' }], body: box => { const a = el('button', { className: 'hc-src', textContent: 'From HopCast: scenes, channels, output settings' }), b = el('button', { className: 'hc-src', textContent: 'From a Sudo Make Art profile file (.smaprofile)' }); a.onclick = () => { document.getElementById('hcdlg')?.remove(); importHopcast(); }; b.onclick = () => { document.getElementById('hcdlg')?.remove(); importProfile(); }; box.append(a, b); } }); }, 'Bring your setup over from HopCast, or from a profile file');
  mk('h-prof-export', 'Export my profile…', exportProfile, 'Save your settings in one file for a new install'); }
})();
