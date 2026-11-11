// Sudo Make Visual Novel: the editor. Original code for this project. The story is a plain JSON file ("sudo-make-vn");
// pictures, GIFs, videos and sounds live inside it, so a story is one file. src/vnplayer.js plays it (here and in the exported programs).
(() => {
'use strict';
const $ = s => document.querySelector(s), SMA = window.SMA, PL = window.SMA_vnplayer, C = window.SMA_chip;
const el = (tag, attrs = {}, text) => { const e = Object.assign(document.createElement(tag), attrs); if (text !== undefined) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), numv = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : d; };
const str = (v, max) => String(v == null ? '' : v).slice(0, max), colr = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
const ID = /^[A-Za-z0-9_-]{1,24}$/, B64 = /^[A-Za-z0-9+/=]*$/, newId = p => p + Math.random().toString(36).slice(2, 8);
const status = $('#vn-status'), say = t => { status.textContent = t; };
const SIZES = { '1280x720': [1280, 720, 'Widescreen HD (1280×720)'], '1920x1080': [1920, 1080, 'Widescreen Full HD (1920×1080)'], '1024x576': [1024, 576, 'Widescreen small (1024×576)'], '1024x768': [1024, 768, 'Classic 4:3 (1024×768)'] };
const TYPES = { say: ['Say', '#6c8cff'], bg: ['Background', '#4cb58a'], cg: ['Picture (CG)', '#4c9ab5'], show: ['Show character', '#d68a3c'], hide: ['Hide character', '#b8794a'], music: ['Music', '#a05cd6'], sfx: ['Sound effect', '#8a6cd6'], choice: ['Choice', '#e0508a'], goto: ['Jump to scene', '#9aa0aa'], set: ['Set a variable', '#58a6a6'], if: ['If …', '#58a6a6'], movie: ['Movie', '#c05050'], wait: ['Wait', '#888'], shake: ['Shake', '#a88'], flash: ['Flash', '#a88'], end: ['The End', '#444'] };
const FONTS = [['sans-serif', 'Clean (sans-serif)'], ['serif', 'Book (serif)'], ['monospace', 'Typewriter'], ['cursive', 'Handwriting']];

// ---------- the document ----------
function sample() {
  const a = newId('s'), b = newId('s'), c = newId('s');
  return { name: 'Untitled visual novel', w: 1280, h: 720, theme: { accent: '#7c6cff', box: '#101424', boxAlpha: 0.82, text: '#ffffff', font: 'sans-serif' }, title: { text: '', subtitle: 'A visual novel', bg: '', music: '' }, vars: {}, start: a, images: {}, sounds: {}, chars: {},
    scenes: [{ id: a, name: 'Start', steps: [{ t: 'say', who: '', text: 'Welcome! This is your story. Drop pictures, GIFs or videos in here to make scenes, and click a line to change it.' }, { t: 'say', who: '', text: 'Which way will you go?' }, { t: 'choice', prompt: '', options: [{ text: 'Left', goto: b }, { text: 'Right', goto: c }] }] },
      { id: b, name: 'Left path', steps: [{ t: 'say', who: '', text: 'You went left.' }, { t: 'end', text: 'The End' }] }, { id: c, name: 'Right path', steps: [{ t: 'say', who: '', text: 'You went right.' }, { t: 'end', text: 'The End' }] }] };
}
let doc = sample(), pid = null, sceneIdx = 0, selStep = -1, tab = 'scenes'; const undoS = [], redoS = [];
const snapJSON = () => { const { images, sounds, ...rest } = doc; return JSON.stringify(rest); };
const remember = b => { if (b === undefined || b === snapJSON()) return; undoS.push(b); if (undoS.length > 100) undoS.shift(); redoS.length = 0; };
const touch = () => document.dispatchEvent(new Event('sma-edit'));
const edit = fn => { const b = snapJSON(); fn(); remember(b); refresh(); touch(); };
const scene = () => doc.scenes[sceneIdx] || doc.scenes[0];
const sceneName = id => { const s = doc.scenes.find(x => x.id === id); return s ? s.name : ''; };

function cleanStep(o, k) {
  const t = o && o.t, id = (v, d = '') => (ID.test(v) ? v : d);
  switch (t) {
    case 'say': return { t, who: id(o.who), text: str(o.text, 2000), sprite: str(o.sprite, 40) };
    case 'bg': return { t, img: id(o.img), fx: ['fade', 'cut', 'black', 'flash'].includes(o.fx) ? o.fx : 'fade' };
    case 'cg': return { t, img: id(o.img) };
    case 'show': return { t, ch: id(o.ch), sp: str(o.sp, 40), at: ['far-left', 'left', 'center', 'right', 'far-right'].includes(o.at) ? o.at : 'center' };
    case 'hide': return { t, ch: id(o.ch) };
    case 'music': return { t, snd: id(o.snd), fade: numv(o.fade, 0, 20, 1) };
    case 'sfx': return { t, snd: id(o.snd) };
    case 'movie': return { t, vid: id(o.vid) };
    case 'wait': return { t, s: numv(o.s, 0, 30, 1) };
    case 'shake': case 'flash': return { t };
    case 'end': return { t, text: str(o.text, 80) };
    case 'goto': return { t, scene: id(o.scene) };
    case 'set': return { t, v: str(o.v, 30).replace(/[^\w ]/g, ''), op: ['=', '+', '-'].includes(o.op) ? o.op : '=', val: str(o.val, 60) };
    case 'if': return { t, v: str(o.v, 30).replace(/[^\w ]/g, ''), op: ['==', '!=', '>', '<', '>=', '<='].includes(o.op) ? o.op : '==', val: str(o.val, 60), then: id(o.then), else: id(o.else) };
    case 'choice': { const cc = c => (c && c.v ? { v: str(c.v, 30).replace(/[^\w ]/g, ''), op: ['==', '!=', '>', '<', '>=', '<='].includes(c.op) ? c.op : '==', val: str(c.val, 60) } : undefined); return { t, prompt: str(o.prompt, 200), options: (Array.isArray(o.options) ? o.options : []).slice(0, 12).map(p => { const r = { text: str(p && p.text, 200), goto: id(p && p.goto) }; if (p && p.set && p.set.v) r.set = { v: str(p.set.v, 30).replace(/[^\w ]/g, ''), op: ['=', '+', '-'].includes(p.set.op) ? p.set.op : '=', val: str(p.set.val, 60) }; const f = cc(p && p.if); if (f) r.if = f; return r; }) }; }
  }
  return null;
}
function parse(json) {
  const o = JSON.parse(json), bad = () => { throw new Error('Damaged visual novel file'); }; if (!o || o.app !== 'sudo-make-vn' || o.v !== 1) throw new Error('Not a Sudo Make Visual Novel file');
  const images = {}, sounds = {}, chars = {};
  for (const [k, a] of Object.entries(o.images || {})) { if (!ID.test(k) || !a || typeof a.src !== 'string') bad(); const m = /^data:(image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm));base64,/.exec(a.src); if (!m || !B64.test(a.src.slice(m[0].length))) bad(); images[k] = { name: str(a.name, 80), src: a.src, thumb: typeof a.thumb === 'string' && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]{0,300000}$/.test(a.thumb) ? a.thumb : '', video: m[1].startsWith('video/') }; }
  for (const [k, a] of Object.entries(o.sounds || {})) { if (!ID.test(k) || !a || typeof a.data !== 'string' || !B64.test(a.data)) bad(); sounds[k] = { name: str(a.name, 80), kind: a.kind === 'sfx' ? 'sfx' : 'music', data: a.data, secs: numv(a.secs, 0, 36000, 0), from: str(a.from, 40) }; }
  for (const [k, c] of Object.entries(o.chars || {})) { if (!ID.test(k) || !c) bad(); const sp = {}; for (const [n, im] of Object.entries(c.sprites || {})) if (ID.test(im) && images[im] && !images[im].video) sp[str(n, 40)] = im; chars[k] = { name: str(c.name, 40) || 'Character', color: colr(c.color, '#7c6cff'), scale: numv(c.scale, 0.3, 2, 1), sprites: sp }; }
  if (!Array.isArray(o.scenes) || !o.scenes.length || o.scenes.length > 500) bad(); const seen = new Set();
  const scenes = o.scenes.map(s => { if (!s || !ID.test(s.id) || seen.has(s.id) || !Array.isArray(s.steps) || s.steps.length > 5000) bad(); seen.add(s.id); return { id: s.id, name: str(s.name, 60) || 'Scene', steps: s.steps.map(cleanStep).filter(Boolean) }; });
  const th = o.theme || {}, ti = o.title || {}, vars = {}; for (const [k, v] of Object.entries(o.vars || {})) { const kk = str(k, 30).replace(/[^\w ]/g, ''); if (kk) vars[kk] = typeof v === 'number' ? v : str(v, 60); }
  const sz = SIZES[o.w + 'x' + o.h] ? [o.w, o.h] : [1280, 720];
  return { name: str(o.name, 120) || 'Untitled visual novel', w: sz[0], h: sz[1], theme: { accent: colr(th.accent, '#7c6cff'), box: colr(th.box, '#101424'), boxAlpha: numv(th.boxAlpha, 0.2, 1, 0.82), text: colr(th.text, '#ffffff'), font: FONTS.some(f => f[0] === th.font) ? th.font : 'sans-serif' }, title: { text: str(ti.text, 80), subtitle: str(ti.subtitle, 120), bg: ID.test(ti.bg) ? ti.bg : '', music: ID.test(ti.music) ? ti.music : '' }, vars, start: seen.has(o.start) ? o.start : scenes[0].id, images, sounds, chars, scenes };
}
const serialize = () => JSON.stringify(Object.assign({ app: 'sudo-make-vn', kind: 'vn', v: 1 }, doc));
function load(json) { doc = parse(json); stopPreview(); sceneIdx = 0; selStep = -1; undoS.length = redoS.length = 0; $('#vn-name').value = doc.name; refresh(); previewAt(); }

// ---------- reading pictures, GIFs, videos and sounds ----------
const EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/mp4' };
const typeOf = f => f.type || EXT[(f.name.split('.').pop() || '').toLowerCase()] || '';
const isMedia = f => /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/.test(typeOf(f)), isAudio = f => /^audio\//.test(typeOf(f)) || /\.(wav|ogg|mp3|m4a|flac|opus)$/i.test(f.name);
const readURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read ' + f.name)); r.readAsDataURL(f); });
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be opened.')); i.src = src; });
const totalBytes = () => Object.values(doc.images).reduce((n, a) => n + a.src.length, 0) + Object.values(doc.sounds).reduce((n, a) => n + a.data.length, 0);
function coverThumb(drawable, w, h) { const c = el('canvas', { width: 160, height: 100 }), x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, 160, 100); const k = Math.max(160 / w, 100 / h); x.drawImage(drawable, (160 - w * k) / 2, (100 - h * k) / 2, w * k, h * k); return c.toDataURL('image/jpeg', 0.8); }
async function videoThumb(file) { const url = URL.createObjectURL(file); try { const v = el('video', { muted: true, preload: 'auto', src: url }); await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('That video could not be opened.')); setTimeout(() => rej(new Error('That video took too long to open.')), 15000); }); try { v.currentTime = Math.min(1, (v.duration || 2) / 3); await new Promise(res => { v.onseeked = res; setTimeout(res, 2500); }); } catch (e) {} return { thumb: coverThumb(v, v.videoWidth || 160, v.videoHeight || 100), secs: v.duration || 0 }; } finally { URL.revokeObjectURL(url); } }
async function addImageData(name, src, thumbSrc, video) { const id = newId('i'); let thumb = ''; try { const im = await loadImg(thumbSrc || src); thumb = coverThumb(im, im.naturalWidth || 160, im.naturalHeight || 100); } catch (e) {} doc.images[id] = { name: str(name, 80), src, thumb, video: !!video }; return id; }
async function importMedia(file) {
  const type = typeOf(file); if (!isMedia(file)) throw new Error(file.name + ': pictures (PNG, JPG, WebP, GIF) and videos (MP4, WebM) only.');
  const limit = type.startsWith('video/') ? 150e6 : type === 'image/gif' ? 30e6 : 40e6; if (file.size > limit) throw new Error(`${file.name} is too big (over ${Math.round(limit / 1e6)} MB).`);
  if (totalBytes() + file.size * 1.4 > 190e6) throw new Error('This story already holds about 190 MB, the most a program can carry. Use smaller files.');
  const name = file.name.replace(/\.[^.]+$/, ''); let src = await readURL(file);
  if (type.startsWith('video/')) { const t = await videoThumb(file); const id = newId('i'); doc.images[id] = { name: str(name, 80), src, thumb: t.thumb, video: true }; return id; }
  if (type !== 'image/gif') { const im = await loadImg(src), big = Math.max(im.naturalWidth, im.naturalHeight); if (big > 3000) { const k = 3000 / big, c = el('canvas', { width: Math.round(im.naturalWidth * k), height: Math.round(im.naturalHeight * k) }); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); src = c.toDataURL(type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92); } }
  return addImageData(name, src);
}
let actx = null; const audioCtx = () => (actx || (actx = new (window.AudioContext || window.webkitAudioContext)()));
const bytesToB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function importSound(file) {
  if (file.size > 30e6) throw new Error(file.name + ' is too big (over 30 MB).'); if (totalBytes() + file.size * 1.4 > 190e6) throw new Error('This story already holds about 190 MB, the most a program can carry.');
  const buf = await file.arrayBuffer(); let secs = 0; try { secs = (await audioCtx().decodeAudioData(buf.slice(0))).duration; } catch (e) { throw new Error(file.name + ' is not a sound this app can play.'); }
  const id = newId('a'); doc.sounds[id] = { name: str(file.name.replace(/\.[^.]+$/, ''), 80), kind: secs > 20 ? 'music' : 'sfx', data: bytesToB64(new Uint8Array(buf)), secs, from: '' }; return id;
}
async function importSong(rec) { const song = C.parseSong(rec.data), r = C.render(song, { sampleRate: 22050 }), id = newId('a'); doc.sounds[id] = { name: str(rec.name || 'Song', 80), kind: 'music', data: bytesToB64(C.toWav(r)), secs: r.length / 22050, from: 'Sudo Make Music' }; return id; }
async function addFiles(files, where) { // where: { scene: bool } also makes a scene per picture/video
  const ok = [], bad = []; let made = 0; const startLen = doc.scenes.length;
  for (const f of [...files]) { try { if (isMedia(f)) { const id = await importMedia(f); ok.push(id); if (where && where.scenes) { const v = doc.images[id].video; doc.scenes.push({ id: newId('s'), name: str(doc.images[id].name, 60) || 'Scene', steps: [{ t: 'bg', img: id, fx: 'fade' }, { t: 'say', who: '', text: '' }] }); made++; } } else if (isAudio(f)) { await importSound(f); ok.push('s'); } else bad.push(f.name + ' is not a picture, GIF, video or sound'); } catch (e) { bad.push(String(e.message || e)); } }
  if (made) { sceneIdx = startLen; selStep = -1; } refresh(); touch(); say((ok.length ? `Added ${ok.length} file${ok.length > 1 ? 's' : ''}${made ? ' and ' + made + ' scene' + (made > 1 ? 's' : '') : ''}. ` : '') + bad.join(' '));
  return ok;
}

// ---------- the preview ----------
let player = null, prevTimer = 0;
const stopPreview = () => { clearTimeout(prevTimer); if (player) { player.destroy(); player = null; } };
function startPreview(sceneId, index, title) { stopPreview(); const root = $('#vn-prev'); try { player = PL.create(root, doc, title ? { sound: false } : { sceneId, index, sound: false }); } catch (e) { root.textContent = 'The preview could not start: ' + e.message; } }
function previewAt() { clearTimeout(prevTimer); prevTimer = setTimeout(() => { if (!document.body.classList.contains('vn-mode')) return; const sc = scene(); if (sc) startPreview(sc.id, Math.max(0, selStep)); }, 160); }
$('#vn-prevfrom').onclick = () => { const sc = scene(); if (sc) { stopPreview(); player = PL.create($('#vn-prev'), doc, { sceneId: sc.id, index: Math.max(0, selStep) }); } };
$('#vn-prevscene').onclick = () => { const sc = scene(); if (sc) { stopPreview(); player = PL.create($('#vn-prev'), doc, { sceneId: sc.id, index: 0 }); } };
$('#vn-play').onclick = () => { stopPreview(); const o = el('div', { className: 'vn-fs' }), r = el('div', { className: 'vn-fsr' }), x = el('button', { type: 'button', className: 'vn-fsx', textContent: '✕ Close the player' }); o.append(r, x); document.body.append(o); const p = PL.create(r, doc, {}); x.onclick = () => { p.destroy(); o.remove(); previewAt(); }; };

// ---------- helpers for building the editor ----------
const sel = (opts, value, onchange, cls) => { const s = el('select'); if (cls) s.className = cls; for (const [v, t] of opts) s.append(el('option', { value: v }, t)); s.value = opts.some(o => o[0] === value) ? value : (value ? (s.append(el('option', { value }, '⚠ missing')), value) : opts[0][0]); if (!opts.some(o => o[0] === value) && value) s.classList.add('bad'); s.onchange = () => onchange(s.value); return s; };
function wire(input, obj, key, conv = v => v) { input.oninput = () => { obj[key] = conv(input.value); touch(); }; input.onfocus = () => { input._b = snapJSON(); }; input.onchange = () => { remember(input._b); }; return input; }
const labeled = (t, ctl) => { const l = el('label'); l.append(t + ' ', ctl); return l; };
const imgOpts = (video, none) => [['', none || '(none)'], ...Object.entries(doc.images).filter(([, a]) => video === undefined || !!a.video === video).map(([k, a]) => [k, (a.video ? '🎞 ' : '') + (a.name || k)])];
const sndOpts = (kind, none) => [['', none || '(none)'], ...Object.entries(doc.sounds).filter(([, a]) => !kind || a.kind === kind || true).map(([k, a]) => [k, (a.kind === 'music' ? '♪ ' : '🔊 ') + (a.name || k)])];
const charOpts = (none) => [['', none], ...Object.entries(doc.chars).map(([k, c]) => [k, c.name])];
const spriteOpts = (ch, none) => [['', none], ...Object.keys((doc.chars[ch] || {}).sprites || {}).map(n => [n, n])];
const sceneOpts = none => [['', none], ...doc.scenes.map(s => [s.id, s.name])];
const varNames = () => { const s = new Set(Object.keys(doc.vars)); for (const sc of doc.scenes) for (const st of sc.steps) { if (st.t === 'set') s.add(st.v); if (st.t === 'choice') for (const o of st.options) if (o.set) s.add(o.set.v); } s.delete(''); return [...s]; };
const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');

// ---------- scenes tab ----------
function dndList(row, kind, idx, onMove, onAsset, onFiles) {
  row.addEventListener('dragover', e => { const t = [...e.dataTransfer.types]; if (t.includes('text/sma-vn-' + kind) || (onAsset && t.includes('text/sma-vn-asset')) || (onFiles && t.includes('Files'))) { e.preventDefault(); e.stopPropagation(); row.classList.add('over'); } });
  row.addEventListener('dragleave', () => row.classList.remove('over'));
  row.addEventListener('drop', e => { row.classList.remove('over'); const f = e.dataTransfer.getData('text/sma-vn-' + kind), a = e.dataTransfer.getData('text/sma-vn-asset'); if (f !== '') { e.preventDefault(); e.stopPropagation(); onMove(+f, idx); } else if (a && onAsset) { e.preventDefault(); e.stopPropagation(); onAsset(a, idx); } else if (onFiles && e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); onFiles([...e.dataTransfer.files], idx); } });
}
function tabScenes(b) {
  b.append(el('div', { className: 'hint' }, 'Drag a scene to put it in a new order. Drop pictures, GIFs or videos here to make a scene from each one.'));
  doc.scenes.forEach((s, i) => {
    const row = el('div', { className: 'vnrow' + (i === sceneIdx ? ' on' : ''), draggable: true }); row.title = 'Drag to reorder'; row.ondragstart = e => { e.dataTransfer.setData('text/sma-vn-scene', String(i)); e.dataTransfer.effectAllowed = 'move'; };
    const nm = wire(el('input', { type: 'text', value: s.name, maxLength: 60 }), s, 'name'); nm.onclick = e => e.stopPropagation(); nm.onchange = () => { remember(nm._b); refresh(); };
    const start = el('button', { type: 'button', title: s.id === doc.start ? 'The story starts here' : 'Start the story here', textContent: s.id === doc.start ? '★' : '☆' }); start.onclick = e => { e.stopPropagation(); edit(() => { doc.start = s.id; }); };
    const dup = el('button', { type: 'button', title: 'Copy this scene', textContent: '⧉' }); dup.onclick = e => { e.stopPropagation(); edit(() => { const c = JSON.parse(JSON.stringify(s)); c.id = newId('s'); c.name = s.name + ' copy'; doc.scenes.splice(i + 1, 0, c); sceneIdx = i + 1; selStep = -1; }); };
    const del = el('button', { type: 'button', title: 'Delete this scene', textContent: '✕' }); del.onclick = e => { e.stopPropagation(); if (doc.scenes.length < 2) { say('A story needs at least one scene.'); return; } if (!confirm(`Delete the scene "${s.name}"?`)) return; edit(() => { doc.scenes.splice(i, 1); if (doc.start === s.id) doc.start = doc.scenes[0].id; sceneIdx = clamp(sceneIdx, 0, doc.scenes.length - 1); selStep = -1; }); };
    row.append(el('span', { textContent: '⠿' }), nm, start, dup, del); row.onclick = () => { sceneIdx = i; selStep = -1; refresh(); previewAt(); };
    dndList(row, 'scene', i, (from, to) => edit(() => { const [m] = doc.scenes.splice(from, 1); doc.scenes.splice(to > from ? to - 1 : to, 0, m); sceneIdx = doc.scenes.indexOf(m); }), (aid, to) => edit(() => { const a = doc.images[aid]; if (a) doc.scenes[to].steps.push({ t: 'bg', img: aid, fx: 'fade' }); }), async (files, to) => { await addFiles(files, { scenes: true }); });
    b.append(row);
  });
  const add = el('button', { type: 'button', textContent: '+ New scene' }); add.onclick = () => edit(() => { doc.scenes.push({ id: newId('s'), name: 'Scene ' + (doc.scenes.length + 1), steps: [{ t: 'say', who: '', text: '' }] }); sceneIdx = doc.scenes.length - 1; selStep = 0; }); b.append(add);
  b.ondragover = e => { if (hasFiles(e)) e.preventDefault(); }; b.ondrop = async e => { if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); await addFiles([...e.dataTransfer.files], { scenes: true }); } };
}

// ---------- characters tab ----------
function tabChars(b) {
  const row = el('div', { className: 'px-row' }), nb = el('button', { type: 'button', textContent: '+ New character' }), mb = el('button', { type: 'button', title: 'Use the characters you made or imported in Sudo Make Manga', textContent: 'From a manga…' }); nb.onclick = () => edit(() => { doc.chars[newId('c')] = { name: 'Character ' + (Object.keys(doc.chars).length + 1), color: '#' + [0, 0, 0].map(() => Math.floor(90 + Math.random() * 140).toString(16).padStart(2, '0')).join(''), scale: 1, sprites: {} }; }); mb.onclick = () => openManga('chars'); row.append(nb, mb); b.append(row);
  if (!Object.keys(doc.chars).length) b.append(el('div', { className: 'hint' }, 'Add a character, then give it pictures: one for each expression (Normal, Happy, Sad …). Drop picture files onto a character to add expressions. Use PNG pictures with a see-through background.'));
  for (const [cid, c] of Object.entries(doc.chars)) {
    const box = el('div', { className: 'vnbox' }), top = el('div', { className: 'px-row' }); top.append(wire(el('input', { type: 'text', value: c.name, maxLength: 40 }), c, 'name'), wire(el('input', { type: 'color', value: c.color }), c, 'color')); top.firstChild.onchange = () => { remember(top.firstChild._b); refresh(); };
    const rm = el('button', { type: 'button', textContent: '✕', title: 'Delete this character' }); rm.onclick = () => { if (confirm(`Delete ${c.name}? Lines and steps that use them become narration.`)) edit(() => { delete doc.chars[cid]; for (const sc of doc.scenes) sc.steps = sc.steps.filter(st => !((st.t === 'show' || st.t === 'hide') && st.ch === cid)).map(st => (st.t === 'say' && st.who === cid ? Object.assign(st, { who: '', sprite: '' }) : st)); }); }; top.append(rm); box.append(top);
    box.append(labeled('Size', wire(el('input', { type: 'number', min: 0.3, max: 2, step: 0.05, value: c.scale }), c, 'scale', v => numv(v, 0.3, 2, 1))));
    for (const [n, im] of Object.entries(c.sprites)) { const r = el('div', { className: 'px-row' }), t = doc.images[im], th = el('img', { src: t ? t.thumb || t.src : '', alt: '' }); th.style.cssText = 'width:34px;height:34px;object-fit:contain;background:#222;border-radius:4px'; const nmI = el('input', { type: 'text', value: n, maxLength: 40 }); nmI.style.width = '90px'; nmI.onchange = () => edit(() => { const v = str(nmI.value, 40) || n; if (v !== n && !(v in c.sprites)) { const ent = Object.entries(c.sprites).map(([k, x]) => [k === n ? v : k, x]); c.sprites = Object.fromEntries(ent); for (const sc of doc.scenes) for (const st of sc.steps) { if (st.t === 'say' && st.who === cid && st.sprite === n) st.sprite = v; if (st.t === 'show' && st.ch === cid && st.sp === n) st.sp = v; } } }); const ps = sel(imgOpts(false), im, v => edit(() => { c.sprites[n] = v; })); ps.style.maxWidth = '110px'; const x = el('button', { type: 'button', textContent: '✕' }); x.onclick = () => edit(() => { delete c.sprites[n]; }); r.append(th, nmI, ps, x); box.append(r); }
    const ae = el('button', { type: 'button', textContent: '+ Expression' }); ae.onclick = () => edit(() => { const names = Object.keys(c.sprites), n = ['Normal', 'Happy', 'Sad', 'Angry', 'Surprised', 'Shy'].find(x => !names.includes(x)) || 'Expression ' + (names.length + 1); c.sprites[n] = Object.entries(doc.images).find(([, a]) => !a.video)?.[0] || ''; }); box.append(ae);
    box.addEventListener('dragover', e => { if (hasFiles(e) || [...e.dataTransfer.types].includes('text/sma-vn-asset')) { e.preventDefault(); e.stopPropagation(); box.classList.add('vndrop'); } }); box.addEventListener('dragleave', () => box.classList.remove('vndrop'));
    box.addEventListener('drop', async e => { box.classList.remove('vndrop'); const aid = e.dataTransfer.getData('text/sma-vn-asset'); if (aid && doc.images[aid] && !doc.images[aid].video) { e.preventDefault(); e.stopPropagation(); edit(() => { const names = Object.keys(c.sprites); c.sprites[names.length ? 'Expression ' + (names.length + 1) : 'Normal'] = aid; }); } else if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); const ids = await addFiles([...e.dataTransfer.files].filter(f => isMedia(f) && !typeOf(f).startsWith('video/')), {}); edit(() => { for (const id of ids) { const nm = doc.images[id].name.slice(0, 40) || 'Normal'; c.sprites[nm in c.sprites ? nm + ' 2' : nm] = id; } }); } });
    b.append(box);
  }
}

// ---------- pictures tab ----------
function tabPics(b) {
  const row = el('div', { className: 'px-row' }), ab = el('button', { type: 'button', textContent: 'Add pictures, GIFs, videos…' }), mb = el('button', { type: 'button', textContent: 'From a manga…' }); ab.onclick = () => $('#vn-file').click(); mb.onclick = () => openManga('pics'); row.append(ab, mb); b.append(row);
  b.append(el('div', { className: 'hint' }, `Your own pictures (PNG, JPG, WebP), animated GIFs and videos (MP4, WebM). Videos loop silently as backgrounds, or play with sound in a Movie step. Drag a picture into the script to use it as a background. Total in this story: ${(totalBytes() / 1e6).toFixed(1)} MB (a program can carry about 190 MB).`));
  const g = el('div', { className: 'vngrid' }); for (const [id, a] of Object.entries(doc.images)) { const t = el('div', { className: 'vnth', draggable: true }); t.ondragstart = e => { e.dataTransfer.setData('text/sma-vn-asset', id); e.dataTransfer.effectAllowed = 'copy'; }; const im = el('img', { src: a.thumb || a.src, alt: '' }); const nm = wire(el('input', { type: 'text', value: a.name, maxLength: 80 }), a, 'name'); const x = el('button', { type: 'button', textContent: '✕', title: 'Remove this file from the story' }); x.onclick = () => { const used = doc.scenes.some(s => s.steps.some(st => st.img === id || st.vid === id)) || Object.values(doc.chars).some(c => Object.values(c.sprites).includes(id)) || doc.title.bg === id; if (used && !confirm('This file is used in the story. Remove it anyway? Steps that use it will show nothing.')) return; edit(() => { delete doc.images[id]; for (const c of Object.values(doc.chars)) for (const [n, v] of Object.entries(c.sprites)) if (v === id) delete c.sprites[n]; if (doc.title.bg === id) doc.title.bg = ''; }); }; t.append(im, nm, x); if (a.video) t.append(el('small', {}, '🎞 video')); g.append(t); } b.append(g);
}

// ---------- sounds tab ----------
let prevSrc = null;
async function playSound(id) { try { if (prevSrc) { prevSrc.stop(); prevSrc = null; } const a = doc.sounds[id], c = audioCtx(); if (c.state === 'suspended') await c.resume(); const bin = atob(a.data), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); const buf = await c.decodeAudioData(u.buffer), s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination); s.start(); prevSrc = s; } catch (e) { say('That sound could not be played.'); } }
function tabSounds(b) {
  const row = el('div', { className: 'px-row' }), ab = el('button', { type: 'button', textContent: 'Add sound files…' }), mb = el('button', { type: 'button', textContent: 'From Sudo Make Music…' }); ab.onclick = () => $('#vn-sfile').click(); mb.onclick = openSongs; row.append(ab, mb); b.append(row);
  b.append(el('div', { className: 'hint' }, 'WAV, OGG, MP3 and the like, or a song you made in Sudo Make Music (it is turned into audio inside this story). Use Music steps for songs that loop, and Sound steps for short effects.'));
  for (const [id, a] of Object.entries(doc.sounds)) { const r = el('div', { className: 'vnrow' }), p = el('button', { type: 'button', textContent: '▶', title: 'Listen' }); p.onclick = () => playSound(id); const nm = wire(el('input', { type: 'text', value: a.name, maxLength: 80 }), a, 'name'); const k = sel([['music', 'Music'], ['sfx', 'Effect']], a.kind, v => edit(() => { a.kind = v; })); const x = el('button', { type: 'button', textContent: '✕' }); x.onclick = () => { const used = doc.scenes.some(s => s.steps.some(st => st.snd === id)) || doc.title.music === id; if (used && !confirm('This sound is used in the story. Remove it anyway?')) return; edit(() => { delete doc.sounds[id]; if (doc.title.music === id) doc.title.music = ''; }); }; r.append(p, nm, k, x); b.append(r); b.append(el('small', { className: 'hint' }, `${a.secs.toFixed(1)} s${a.from ? ' · from ' + a.from : ''}`)); }
}
async function openSongs() { const dlg = $('#vn-opendlg'), box = $('#vn-openlist'); $('#vn-opentitle').textContent = 'Add a song from Sudo Make Music'; dlg.showModal(); box.textContent = 'Loading…'; let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'music'); } catch (e) {} box.textContent = ''; if (!items.length) box.append(el('p', { className: 'hint' }, 'No saved songs yet. Make one in Sudo Make Music first.'));
  items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled song')); b.onclick = async () => { b.disabled = true; try { const r = await SMA.store.get(i.id); await importSong(r); refresh(); touch(); say(`Added "${i.name}".`); dlg.close(); } catch (e) { box.prepend(el('p', { className: 'mh-bad' }, String(e.message || e))); b.disabled = false; } }; box.append(b); }); }

// ---------- story tab ----------
function tabStory(b) {
  const t = doc.theme, ti = doc.title, bx = el('div', { className: 'vnbox' }); bx.append(el('h5', {}, 'Title screen'), labeled('Title', wire(el('input', { type: 'text', value: ti.text, maxLength: 80, placeholder: doc.name }), ti, 'text')), labeled('Subtitle', wire(el('input', { type: 'text', value: ti.subtitle, maxLength: 120 }), ti, 'subtitle')), labeled('Background', sel(imgOpts(), ti.bg, v => edit(() => { ti.bg = v; }))), labeled('Music', sel(sndOpts('music', '(none)'), ti.music, v => edit(() => { ti.music = v; })))); b.append(bx);
  const bt = el('div', { className: 'vnbox' }); bt.append(el('h5', {}, 'Look'), labeled('Accent colour', wire(el('input', { type: 'color', value: t.accent }), t, 'accent')), labeled('Text box colour', wire(el('input', { type: 'color', value: t.box }), t, 'box')), labeled('Text box see-through', wire(el('input', { type: 'range', min: 0.2, max: 1, step: 0.02, value: t.boxAlpha }), t, 'boxAlpha', Number)), labeled('Text colour', wire(el('input', { type: 'color', value: t.text }), t, 'text')), labeled('Font', sel(FONTS, t.font, v => edit(() => { t.font = v; }))), labeled('Screen size', sel(Object.entries(SIZES).map(([k, v]) => [k, v[2]]), doc.w + 'x' + doc.h, v => edit(() => { doc.w = SIZES[v][0]; doc.h = SIZES[v][1]; })))); b.append(bt);
  const bs = el('div', { className: 'vnbox' }); bs.append(el('h5', {}, 'Story'), labeled('Starts at', sel(sceneOpts('(first scene)').slice(1), doc.start, v => edit(() => { doc.start = v; })))); b.append(bs);
  const bv = el('div', { className: 'vnbox' }); bv.append(el('h5', {}, 'Variables'), el('div', { className: 'hint' }, 'Numbers or words the story remembers (trust, gold, met_aya …). Use {name} inside a line to show one.')); for (const [k, v] of Object.entries(doc.vars)) { const r = el('div', { className: 'px-row' }), vi = el('input', { type: 'text', value: String(v) }); vi.onchange = () => edit(() => { doc.vars[k] = isFinite(+vi.value) && vi.value !== '' ? +vi.value : vi.value; }); const x = el('button', { type: 'button', textContent: '✕' }); x.onclick = () => edit(() => { delete doc.vars[k]; }); r.append(el('b', {}, k), vi, x); bv.append(r); } const nv = el('input', { type: 'text', placeholder: 'new variable name', maxLength: 30 }), add = el('button', { type: 'button', textContent: 'Add' }); add.onclick = () => { const k = nv.value.replace(/[^\w ]/g, '').trim(); if (k && !(k in doc.vars)) edit(() => { doc.vars[k] = 0; }); }; const ar = el('div', { className: 'px-row' }); ar.append(nv, add); bv.append(ar); b.append(bv);
}

// ---------- manga import ----------
async function openManga(mode) {
  const dlg = $('#vn-mgdlg'), box = $('#vn-mgbody'); dlg.showModal(); box.textContent = 'Loading…'; let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'manga'); } catch (e) {} box.textContent = '';
  const M = window.SMA_manga; if (!items.length) { box.append(el('p', { className: 'hint' }, 'No saved manga yet. Make one in Sudo Make Manga first.')); return; }
  box.append(el('p', { className: 'hint' }, 'Pick a manga:')); for (const i of items) { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled manga')); b.onclick = async () => { try { const r = await SMA.store.get(i.id); await showManga(box, r.data, i.name || 'Manga', mode); } catch (e) { box.prepend(el('p', { className: 'mh-bad' }, String(e.message || e))); } }; box.append(b); }
}
const EXPRS = [['neutral', 'Normal'], ['smile', 'Happy'], ['laugh', 'Laugh'], ['surprise', 'Surprised'], ['angry', 'Angry'], ['sad', 'Sad'], ['shy', 'Shy'], ['wink', 'Wink'], ['smirk', 'Smirk']];
async function showManga(box, json, mname, mode) {
  const M = window.SMA_manga; box.textContent = ''; box.append(el('h4', {}, mname));
  const models = M.listModels(json); box.append(el('h5', {}, 'Characters'));
  if (!models.length) box.append(el('p', { className: 'hint' }, 'This manga has no 3D characters.'));
  for (const m of models) { const b = el('button', { type: 'button', className: 'op' }, `${m.name} (${m.maker ? 'made in Manga: ' + EXPRS.length + ' expressions' : 'VRM model: one pose'})`); b.onclick = async () => { b.disabled = true; try { const cid = newId('c'), sp = {}; const list = m.maker ? EXPRS : [['neutral', 'Normal']]; let k = 0; for (const [ex, label] of list) { b.textContent = `Drawing ${label} (${++k}/${list.length})…`; await new Promise(r => setTimeout(r, 30)); const cv = await M.renderModelSprite(json, m.id, { expr: ex, w: 520, h: 960, style: 'color' }); sp[label] = await addImageData(`${m.name} ${label}`, cv.toDataURL('image/png'), cv.toDataURL('image/png')); } edit(() => { doc.chars[cid] = { name: m.name.slice(0, 40), color: '#' + [0, 0, 0].map(() => Math.floor(90 + Math.random() * 140).toString(16).padStart(2, '0')).join(''), scale: 1, sprites: sp }; }); b.textContent = `Added ${m.name} to Characters.`; } catch (e) { b.textContent = String(e.message || e); } }; box.append(b); }
  const n = M.pageCount(json); box.append(el('h5', {}, 'Pages and panels (added to Pictures)')); const g = el('div', { className: 'vngrid' }); box.append(g);
  const addCv = (cv, name) => { const b = el('div', { className: 'vnth' }); b.append(cv); const a = el('button', { type: 'button', textContent: '+', title: 'Add to Pictures' }); a.onclick = async () => { const big = el('canvas'), full = cv._full(); await addImageData(name, full.toDataURL('image/jpeg', 0.92)); refresh(); touch(); a.textContent = '✓'; }; b.append(a, el('small', {}, name)); g.append(b); };
  for (let p = 0; p < n; p++) { const c = M.renderPageFrom(json, p, 0.14); c.style.aspectRatio = 'auto'; c._full = () => M.renderPageFrom(json, p, 1); addCv(c, `${mname} page ${p + 1}`); }
  for (const pn of M.listPanels(json)) { const c = M.renderPanelFrom(json, pn.page, pn.id, 0.2); c.style.aspectRatio = 'auto'; c._full = () => M.renderPanelFrom(json, pn.page, pn.id, 1); addCv(c, `${mname} p${pn.page + 1} panel`); }
}
$('#vn-mgclose').onclick = e => { e.preventDefault(); $('#vn-mgdlg').close(); };

// ---------- the script ----------
function newStep(t) {
  const first = Object.keys(doc.chars)[0] || '';
  return { say: { t, who: '', text: '' }, bg: { t, img: Object.entries(doc.images)[0]?.[0] || '', fx: 'fade' }, cg: { t, img: '' }, show: { t, ch: first, sp: Object.keys((doc.chars[first] || {}).sprites || {})[0] || '', at: 'center' }, hide: { t, ch: first }, music: { t, snd: Object.keys(doc.sounds).find(k => doc.sounds[k].kind === 'music') || '', fade: 1 }, sfx: { t, snd: Object.keys(doc.sounds).find(k => doc.sounds[k].kind === 'sfx') || '' }, movie: { t, vid: Object.keys(doc.images).find(k => doc.images[k].video) || '' }, wait: { t, s: 1 }, shake: { t }, flash: { t }, end: { t, text: 'The End' }, goto: { t, scene: '' }, set: { t, v: varNames()[0] || 'score', op: '+', val: '1' }, if: { t, v: varNames()[0] || 'score', op: '>=', val: '1', then: '', else: '' }, choice: { t, prompt: '', options: [{ text: 'Option 1', goto: '' }, { text: 'Option 2', goto: '' }] } }[t];
}
function stepFields(st, f) {
  const T = (k, ph, w) => { const i = wire(el('input', { type: 'text', value: st[k] || '', placeholder: ph || '' }), st, k); if (w) i.style.width = w; return i; };
  switch (st.t) {
    case 'say': { f.append(sel(charOpts('Narration'), st.who, v => edit(() => { st.who = v; st.sprite = ''; })), sel(spriteOpts(st.who, '(same face)'), st.sprite, v => edit(() => { st.sprite = v; }))); const ta = wire(el('textarea', { value: st.text, placeholder: 'What is said…', rows: 2 }), st, 'text'); f.append(ta); break; }
    case 'bg': f.append(sel(imgOpts(undefined, '(black)'), st.img, v => edit(() => { st.img = v; })), sel([['fade', 'Fade'], ['cut', 'Cut'], ['black', 'Through black'], ['flash', 'Flash']], st.fx, v => edit(() => { st.fx = v; }))); break;
    case 'cg': f.append(sel(imgOpts(undefined, '(remove the picture)'), st.img, v => edit(() => { st.img = v; }))); break;
    case 'show': f.append(sel(charOpts('(choose)'), st.ch, v => edit(() => { st.ch = v; st.sp = Object.keys((doc.chars[v] || {}).sprites || {})[0] || ''; })), sel(spriteOpts(st.ch, '(first picture)'), st.sp, v => edit(() => { st.sp = v; })), sel([['far-left', 'Far left'], ['left', 'Left'], ['center', 'Middle'], ['right', 'Right'], ['far-right', 'Far right']], st.at, v => edit(() => { st.at = v; }))); break;
    case 'hide': f.append(sel(charOpts('(choose)'), st.ch, v => edit(() => { st.ch = v; }))); break;
    case 'music': f.append(sel(sndOpts('music', '(stop the music)'), st.snd, v => edit(() => { st.snd = v; })), labeled('fade (s)', wire(el('input', { type: 'number', min: 0, max: 20, step: 0.5, value: st.fade }), st, 'fade', v => numv(v, 0, 20, 1)))); break;
    case 'sfx': f.append(sel(sndOpts('', '(choose)'), st.snd, v => edit(() => { st.snd = v; }))); break;
    case 'movie': f.append(sel(imgOpts(true, '(choose a video)'), st.vid, v => edit(() => { st.vid = v; })), el('small', { className: 'hint' }, 'plays full screen with sound; click to skip')); break;
    case 'wait': f.append(labeled('seconds', wire(el('input', { type: 'number', min: 0, max: 30, step: 0.5, value: st.s }), st, 's', v => numv(v, 0, 30, 1)))); break;
    case 'end': f.append(T('text', 'The End', '200px')); break;
    case 'goto': f.append(sel(sceneOpts('(choose a scene)'), st.scene, v => edit(() => { st.scene = v; }))); break;
    case 'set': { const v = T('v', 'variable', '120px'); v.setAttribute('list', 'vn-vars'); f.append(v, sel([['=', 'becomes'], ['+', 'plus'], ['-', 'minus']], st.op, x => edit(() => { st.op = x; })), T('val', 'value', '90px')); break; }
    case 'if': { const v = T('v', 'variable', '120px'); v.setAttribute('list', 'vn-vars'); f.append(el('span', {}, 'if'), v, sel([['==', 'is'], ['!=', 'is not'], ['>', '>'], ['<', '<'], ['>=', '≥'], ['<=', '≤']], st.op, x => edit(() => { st.op = x; })), T('val', 'value', '80px'), el('span', {}, 'go to'), sel(sceneOpts('(carry on)'), st.then, x => edit(() => { st.then = x; })), el('span', {}, 'otherwise'), sel(sceneOpts('(carry on)'), st.else, x => edit(() => { st.else = x; }))); break; }
    case 'choice': { f.append(T('prompt', 'Question (optional)', '260px')); st.options.forEach((o, k) => { const r = el('div', { className: 'opt' }), ti = wire(el('input', { type: 'text', value: o.text, placeholder: 'Choice text' }), o, 'text'); ti.style.width = '200px'; const gs = sel(sceneOpts('(carry on)'), o.goto, x => edit(() => { o.goto = x; })); const needs = el('input', { type: 'checkbox', checked: !!o.if, title: 'Only show this choice when a condition is true' }); needs.onchange = () => edit(() => { if (needs.checked) o.if = { v: varNames()[0] || 'score', op: '>=', val: '1' }; else delete o.if; }); const sets = el('input', { type: 'checkbox', checked: !!o.set, title: 'Change a variable when picked' }); sets.onchange = () => edit(() => { if (sets.checked) o.set = { v: varNames()[0] || 'score', op: '+', val: '1' }; else delete o.set; });
        const x = el('button', { type: 'button', textContent: '✕', title: 'Remove this choice' }); x.onclick = () => edit(() => { st.options.splice(k, 1); }); r.append(el('span', {}, k + 1 + '.'), ti, el('span', {}, '→'), gs, labeled('only if', needs));
        if (o.if) { const v = wire(el('input', { type: 'text', value: o.if.v }), o.if, 'v'); v.style.width = '90px'; v.setAttribute('list', 'vn-vars'); r.append(v, sel([['==', 'is'], ['!=', 'is not'], ['>', '>'], ['<', '<'], ['>=', '≥'], ['<=', '≤']], o.if.op, y => edit(() => { o.if.op = y; })), wire(el('input', { type: 'text', value: o.if.val }), o.if, 'val')); r.lastChild.style.width = '60px'; }
        r.append(labeled('sets', sets)); if (o.set) { const v = wire(el('input', { type: 'text', value: o.set.v }), o.set, 'v'); v.style.width = '90px'; v.setAttribute('list', 'vn-vars'); r.append(v, sel([['=', 'becomes'], ['+', 'plus'], ['-', 'minus']], o.set.op, y => edit(() => { o.set.op = y; })), wire(el('input', { type: 'text', value: o.set.val }), o.set, 'val')); r.lastChild.style.width = '60px'; } r.append(x); f.append(r); });
      const ad = el('button', { type: 'button', textContent: '+ choice' }); ad.onclick = () => edit(() => { if (st.options.length < 12) st.options.push({ text: 'Option ' + (st.options.length + 1), goto: '' }); }); f.append(ad); break; }
  }
}
function renderSteps() {
  const sc = scene(), box = $('#vn-steps'); box.textContent = ''; $('#vn-sh').textContent = `${sc.name} · ${sc.steps.length} step${sc.steps.length === 1 ? '' : 's'}`;
  let dl = $('#vn-vars'); if (!dl) { dl = el('datalist', { id: 'vn-vars' }); document.body.append(dl); } dl.textContent = ''; varNames().forEach(v => dl.append(el('option', { value: v })));
  if (!sc.steps.length) box.append(el('div', { className: 'hint' }, 'This scene is empty. Add a step below, or drag a picture here.'));
  sc.steps.forEach((st, i) => {
    const info = TYPES[st.t] || [st.t, '#666'], row = el('div', { className: 'vns' + (i === selStep ? ' on' : '') }); row.style.setProperty('--c', info[1]);
    const tp = el('div', { className: 'tp', draggable: true, title: 'Drag to move this step', textContent: '⠿ ' + info[0] }); tp.ondragstart = e => { e.dataTransfer.setData('text/sma-vn-step', String(i)); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setDragImage(row, 10, 10); } catch (er) {} };
    const f = el('div', { className: 'fl' }); stepFields(st, f);
    const tl = el('div', { className: 'tl' }), mkb = (t, ti, fn) => { const x = el('button', { type: 'button', textContent: t, title: ti }); x.onclick = e => { e.stopPropagation(); fn(); }; tl.append(x); };
    mkb('↑', 'Move up', () => { if (i > 0) edit(() => { [sc.steps[i - 1], sc.steps[i]] = [sc.steps[i], sc.steps[i - 1]]; selStep = i - 1; }); }); mkb('↓', 'Move down', () => { if (i < sc.steps.length - 1) edit(() => { [sc.steps[i + 1], sc.steps[i]] = [sc.steps[i], sc.steps[i + 1]]; selStep = i + 1; }); }); mkb('⧉', 'Copy this step', () => edit(() => { sc.steps.splice(i + 1, 0, JSON.parse(JSON.stringify(st))); selStep = i + 1; })); mkb('✕', 'Delete this step', () => edit(() => { sc.steps.splice(i, 1); selStep = Math.min(selStep, sc.steps.length - 1); }));
    row.append(tp, f, tl); row.onclick = e => { if (selStep !== i) { selStep = i; box.querySelectorAll('.vns').forEach((r, k) => r.classList.toggle('on', k === i)); previewAt(); } };
    dndList(row, 'step', i, (from, to) => edit(() => { const [m] = sc.steps.splice(from, 1); sc.steps.splice(to > from ? to - 1 : to, 0, m); selStep = sc.steps.indexOf(m); }), (aid, to) => edit(() => { const a = doc.images[aid]; if (a) { sc.steps.splice(to, 0, { t: 'bg', img: aid, fx: 'fade' }); selStep = to; } }), async (files, to) => { const ids = await addFiles(files.filter(isMedia), {}); edit(() => { ids.forEach((id, k) => sc.steps.splice(to + k, 0, { t: 'bg', img: id, fx: 'fade' })); selStep = to; }); });
    box.append(row);
  });
  box.ondragover = e => { if (hasFiles(e) || [...e.dataTransfer.types].includes('text/sma-vn-asset')) e.preventDefault(); };
  box.ondrop = async e => { const aid = e.dataTransfer.getData('text/sma-vn-asset'); if (aid && doc.images[aid]) { e.preventDefault(); edit(() => { sc.steps.push({ t: 'bg', img: aid, fx: 'fade' }); selStep = sc.steps.length - 1; }); } else if (e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); const ids = await addFiles([...e.dataTransfer.files].filter(isMedia), {}); edit(() => { ids.forEach(id => sc.steps.push({ t: 'bg', img: id, fx: 'fade' })); selStep = sc.steps.length - 1; }); await addFiles([...e.dataTransfer.files].filter(f => !isMedia(f) && isAudio(f)), {}); } };
  const ab = $('#vn-add'); if (!ab.childElementCount) for (const t of Object.keys(TYPES)) { const b = el('button', { type: 'button', textContent: '+ ' + TYPES[t][0] }); b.style.borderBottom = '3px solid ' + TYPES[t][1]; b.onclick = () => edit(() => { const s = scene(), at = selStep >= 0 ? selStep + 1 : s.steps.length; s.steps.splice(at, 0, newStep(t)); selStep = at; }); ab.append(b); }
}
function renderLeft() { document.querySelectorAll('#vn-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab)); const b = $('#vn-lbody'), keep = b.scrollTop; b.textContent = ''; b.ondragover = b.ondrop = null; ({ scenes: tabScenes, chars: tabChars, pics: tabPics, sounds: tabSounds, story: tabStory })[tab](b); b.scrollTop = keep; }
document.querySelectorAll('#vn-tabs button').forEach(b => { b.onclick = () => { tab = b.dataset.t; renderLeft(); }; });
function refresh() { sceneIdx = clamp(sceneIdx, 0, doc.scenes.length - 1); if (selStep >= scene().steps.length) selStep = scene().steps.length - 1; renderLeft(); renderSteps(); $('#vn-name').value = doc.name; previewAt(); }

// ---------- checks before export ----------
function problems() {
  const out = [], ids = new Set(doc.scenes.map(s => s.id)); let ends = 0; const targets = new Set([doc.start]);
  for (const sc of doc.scenes) sc.steps.forEach((st, i) => { const w = m => out.push(`${sc.name}, step ${i + 1}: ${m}`);
    if (st.t === 'say' && !st.text.trim()) w('an empty line'); if (st.t === 'say' && st.who && !doc.chars[st.who]) w('the speaker no longer exists');
    if ((st.t === 'bg' || st.t === 'cg') && st.img && !doc.images[st.img]) w('the picture is missing'); if (st.t === 'movie' && (!st.vid || !doc.images[st.vid])) w('no video chosen');
    if (st.t === 'show' && (!st.ch || !doc.chars[st.ch])) w('no character chosen'); else if (st.t === 'show' && !Object.keys(doc.chars[st.ch].sprites).length) w(doc.chars[st.ch].name + ' has no pictures');
    if ((st.t === 'music' || st.t === 'sfx') && st.snd && !doc.sounds[st.snd]) w('the sound is missing'); if (st.t === 'sfx' && !st.snd) w('no sound chosen');
    if (st.t === 'goto') { if (!ids.has(st.scene)) w('jumps to a scene that does not exist'); else targets.add(st.scene); } if (st.t === 'if') { for (const k of ['then', 'else']) if (st[k]) { if (!ids.has(st[k])) w('goes to a scene that does not exist'); else targets.add(st[k]); } }
    if (st.t === 'choice') { if (!st.options.length) w('a choice with no options'); for (const o of st.options) { if (o.goto) { if (!ids.has(o.goto)) w(`"${o.text}" goes to a scene that does not exist`); else targets.add(o.goto); } if (!o.text.trim()) w('an option without text'); } }
    if (st.t === 'end') ends++; });
  if (!ends) out.push('The story never reaches an "The End" step, so players can only leave through the menu.');
  for (const sc of doc.scenes) if (!targets.has(sc.id)) out.push(`The scene "${sc.name}" can never be reached.`);
  if (totalBytes() > 150e6) out.push(`The story holds about ${(totalBytes() / 1e6).toFixed(0)} MB. Programs this big start slowly.`); return out;
}
// ---------- exporting ----------
const pack = window.sma && window.sma.gamepack, vnpack = window.sma && window.sma.vnpack;
if (vnpack && pack) for (const [v, t] of [['linux', 'Linux program (one file)'], ['win', 'Windows program (zip)']]) $('#vn-export').append(el('option', { value: v }, t));
async function exportDesktop(platform) {
  const probs = problems(); if (probs.length && !confirm('Before you export:\n\n' + probs.slice(0, 12).join('\n') + (probs.length > 12 ? '\n… and ' + (probs.length - 12) + ' more' : '') + '\n\nExport anyway?')) return;
  const st = await pack.status(), label = platform === 'linux' ? 'Linux' : 'Windows';
  if (!st[platform] && !confirm(`To make a ${label} program, Sudo Make Visual Novel needs Electron's official ${label} runtime (about 100 MB, version ${st.version}) from github.com/electron/electron.\n\nIt is downloaded once, checked against the SHA-256 checksum Electron publishes, and kept for next time. Your story is never sent anywhere.\n\nDownload it now?`)) return;
  const bar = $('#vn-prog'), cancel = $('#vn-cancelpack'), off = pack.onProgress(d => { bar.hidden = false; cancel.hidden = false; if (d.phase === 'download') { bar.max = d.total || 1; bar.value = d.got; say(`Downloading the ${label} runtime… ${(d.got / 1048576).toFixed(0)} MB`); } else if (d.phase === 'pack') { bar.max = d.total; bar.value = d.got; say('Packing…'); } else if (d.phase === 'hash') say('Checking the runtime…'); });
  cancel.onclick = () => pack.cancel(); say('Working…'); bar.hidden = false; cancel.hidden = false;
  try { const r = await vnpack.build(platform, doc.name, serialize()); say(r.cancelled ? 'Cancelled.' : `Saved ${(r.bytes / 1048576).toFixed(0)} MB: ${r.path}`); } catch (err) { say('Export failed: ' + String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } finally { bar.hidden = true; cancel.hidden = true; if (typeof off === 'function') off(); }
}
$('#vn-export').onchange = e => { const v = e.target.value; e.target.value = ''; if (v) exportDesktop(v); };

// ---------- bar, new/open, files ----------
$('#vn-name').oninput = e => { doc.name = e.target.value || 'Untitled visual novel'; touch(); };
$('#vn-undo').onclick = () => { if (!undoS.length) return; redoS.push(snapJSON()); Object.assign(doc, JSON.parse(undoS.pop())); refresh(); touch(); }; $('#vn-redo').onclick = () => { if (!redoS.length) return; undoS.push(snapJSON()); Object.assign(doc, JSON.parse(redoS.pop())); refresh(); touch(); };
document.addEventListener('keydown', e => { if (!document.body.classList.contains('vn-mode') || document.querySelector('dialog[open]') || document.querySelector('.vn-fs')) return; const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#vn-redo') : $('#vn-undo')).click(); } });
$('#vn-new').onclick = () => $('#vn-newdlg').showModal(); $('#vn-newcancel').onclick = e => { e.preventDefault(); $('#vn-newdlg').close(); };
$('#vn-newok').onclick = e => { e.preventDefault(); pid = null; doc = sample(); sceneIdx = 0; selStep = -1; undoS.length = redoS.length = 0; $('#vn-newdlg').close(); refresh(); };
$('#vn-open').onclick = async () => { const dlg = $('#vn-opendlg'), box = $('#vn-openlist'); $('#vn-opentitle').textContent = 'Open a visual novel'; dlg.showModal(); box.textContent = 'Loading…'; let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'vn'); } catch (e) {} box.textContent = ''; if (!items.length) box.append(el('p', { className: 'hint' }, 'No saved visual novels yet. Everything you make is saved automatically.'));
  items.forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled')); b.onclick = async () => { try { const r = await SMA.store.get(i.id); if (r) { load(r.data); pid = r.id; } dlg.close(); } catch (err) { box.prepend(el('p', { className: 'mh-bad' }, String(err.message || err))); } }; box.append(b); }); };
$('#vn-opencancel').onclick = e => { e.preventDefault(); $('#vn-opendlg').close(); };
$('#vn-file').onchange = async e => { const f = [...e.target.files]; e.target.value = ''; await addFiles(f, {}); }; $('#vn-sfile').onchange = async e => { const f = [...e.target.files]; e.target.value = ''; await addFiles(f, {}); };
// anywhere in the editor: dropped files become pictures, videos and sounds
const view = $('#vnview'); view.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
view.addEventListener('drop', async e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); const fs = [...e.dataTransfer.files]; await addFiles(fs, {}); if (fs.some(isAudio) && !fs.some(isMedia)) tab = 'sounds'; else if (fs.some(isMedia)) tab = 'pics'; renderLeft(); });

function thumb() { const c = el('canvas', { width: 200, height: 120 }), x = c.getContext('2d'); x.fillStyle = doc.theme.box; x.fillRect(0, 0, 200, 120); const id = doc.title.bg || (doc.scenes.flatMap(s => s.steps).find(s => s.t === 'bg' && s.img) || {}).img, a = id && doc.images[id]; const done = () => { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 84, 200, 36); x.fillStyle = '#fff'; x.font = 'bold 16px sans-serif'; x.fillText(doc.name.slice(0, 22), 8, 108); return c.toDataURL('image/jpeg', 0.7); }; if (!a) return Promise.resolve(done()); if (a.thumb) return loadImg(a.thumb).then(im => { x.drawImage(im, 0, 0, 200, 120); return done(); }).catch(() => done()); return Promise.resolve(done()); }
const api = { serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => doc.name, setName: n => { doc.name = n; $('#vn-name').value = n; }, load, parse, problems, exportDesktop, addFiles, importMedia, importSound, importSong, doc: () => doc, scene: () => scene(), info: () => ({ scenes: doc.scenes.length, scene: sceneIdx, steps: scene().steps.length, images: Object.keys(doc.images).length, sounds: Object.keys(doc.sounds).length, chars: Object.keys(doc.chars).length, bytes: totalBytes() }),
  select: (s, st) => { sceneIdx = s; selStep = st === undefined ? -1 : st; refresh(); }, show() { refresh(); }, hide() { stopPreview(); }, reset() { pid = null; doc = sample(); sceneIdx = 0; selStep = -1; refresh(); }, player: () => player };
window.SMA_vn = api; refresh();
})();
