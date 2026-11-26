// Character card editor: create a profile for an AI chat bot, then export it as a PNG card (the picture carries the profile inside it)
// or a JSON file, or hand it to Desktop College Dorms. The fields follow the common "character card" layout that chat front ends read
// (name, description, first message, scenario, example messages, notes, prompt overrides, tags). Original code for this project;
// everything stays on this computer.
(() => {
'use strict';
const SMA = window.SMA, $ = s => document.querySelector(s);
if (!SMA || !$('#mangaview')) return;
const el = (tag, attrs = {}, text) => { const e = Object.assign(document.createElement(tag), attrs); if (text !== undefined) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sma = window.sma || {};

// ---------- the card ----------
const BLANK = () => ({ name: '', version: '', creator: '', description: '', first: '', alts: [], summary: '', scenario: '', examples: '', note: '', depth: 4, main: '', jailbreak: '', commentary: '', tags: '', talk: 0.5 });
let card = BLANK(), image = null /* data URL of the picture */, crop = true, pid = null, curGreeting = 0;
const touch = () => document.dispatchEvent(new Event('sma-edit'));
const estTokens = t => (t ? Math.ceil(String(t).length / 4) : 0);   // a rough guess: about four characters to a token (the real count depends on the model)

// V2 / V3 "character card" JSON (also with the old top-level fields so older readers still work)
function toV2(c) {
  const tags = c.tags.split(',').map(s => s.trim()).filter(Boolean), talk = String(clamp(+c.talk || 0.5, 0, 1));
  const data = { name: c.name, description: c.description, personality: c.summary, scenario: c.scenario, first_mes: c.first, mes_example: c.examples, creator_notes: c.commentary, system_prompt: c.main, post_history_instructions: c.jailbreak,
    alternate_greetings: c.alts.filter(s => s.trim()), tags, creator: c.creator, character_version: c.version,
    extensions: { talkativeness: talk, fav: false, world: '', depth_prompt: { prompt: c.note, depth: clamp(Math.round(+c.depth) || 4, 0, 100), role: 'system' } } };
  return { spec: 'chara_card_v2', spec_version: '2.0', data, name: c.name, description: c.description, personality: c.summary, scenario: c.scenario, first_mes: c.first, mes_example: c.examples, creatorcomment: c.commentary, avatar: 'none', talkativeness: talk, fav: false, tags };
}
function toV3(c) { const v = toV2(c); return { spec: 'chara_card_v3', spec_version: '3.0', data: Object.assign({}, v.data, { group_only_greetings: [] }) }; }
function fromAny(o) { // V1, V2 or V3 JSON -> our fields
  if (!o || typeof o !== 'object') throw new Error('That file is not a character card.');
  const d = o.data && typeof o.data === 'object' ? o.data : o, x = d.extensions || {}, dp = x.depth_prompt || {}, s = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
  if (!('name' in d) && !('first_mes' in d) && !('description' in d)) throw new Error('That file does not look like a character card.');
  return { name: s(d.name), version: s(d.character_version), creator: s(d.creator), description: s(d.description), first: s(d.first_mes), alts: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(s).slice(0, 50) : [], summary: s(d.personality), scenario: s(d.scenario), examples: s(d.mes_example),
    note: s(dp.prompt), depth: clamp(Math.round(+dp.depth) || 4, 0, 100), main: s(d.system_prompt), jailbreak: s(d.post_history_instructions), commentary: s(d.creator_notes || o.creatorcomment), tags: Array.isArray(d.tags) ? d.tags.map(s).join(', ') : s(d.tags), talk: (t => (Number.isFinite(t) ? clamp(t, 0, 1) : 0.5))(parseFloat(x.talkativeness ?? o.talkativeness ?? 0.5)) };
}

// ---------- PNG text chunks (where the card lives inside a PNG file) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const isPng = u => u.length > 8 && SIG.every((v, i) => u[i] === v);
function* chunks(u) { const dv = new DataView(u.buffer, u.byteOffset, u.byteLength); let p = 8; while (p + 12 <= u.length) { const len = dv.getUint32(p), type = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]); if (p + 12 + len > u.length) return; yield { type, start: p, end: p + 12 + len, data: u.subarray(p + 8, p + 8 + len) }; p += 12 + len; if (type === 'IEND') return; } }
const latin1 = u => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return s; };
async function inflate(u) { const s = new DecompressionStream('deflate'), w = s.writable.getWriter(); w.write(u); w.close(); return new Uint8Array(await new Response(s.readable).arrayBuffer()); }
async function pngText(u) { // keyword -> text, for tEXt, zTXt and iTXt chunks
  const out = {}; for (const c of chunks(u)) { try {
    if (c.type === 'tEXt') { const z = c.data.indexOf(0); if (z > 0) out[latin1(c.data.subarray(0, z))] = latin1(c.data.subarray(z + 1)); }
    else if (c.type === 'zTXt') { const z = c.data.indexOf(0); if (z > 0) out[latin1(c.data.subarray(0, z))] = latin1(await inflate(c.data.subarray(z + 2))); }
    else if (c.type === 'iTXt') { const z = c.data.indexOf(0); if (z > 0) { const comp = c.data[z + 1]; let p = z + 3; while (c.data[p] !== 0 && p < c.data.length) p++; p++; while (c.data[p] !== 0 && p < c.data.length) p++; p++; const body = c.data.subarray(p); out[latin1(c.data.subarray(0, z))] = new TextDecoder().decode(comp ? await inflate(body) : body); } }
  } catch (e) { /* skip a damaged chunk */ } } return out; }
function withText(u, pairs) { // the same PNG with these keyword/text pairs written as tEXt chunks (any old chara / ccv3 ones are dropped)
  const drop = new Set(pairs.map(p => p[0])), parts = [u.subarray(0, 8)]; let wrote = false;
  const mk = (k, v) => { const data = new Uint8Array(k.length + 1 + v.length); for (let i = 0; i < k.length; i++) data[i] = k.charCodeAt(i); for (let i = 0; i < v.length; i++) data[k.length + 1 + i] = v.charCodeAt(i) & 255; const b = new Uint8Array(12 + data.length), dv = new DataView(b.buffer); dv.setUint32(0, data.length); b.set([116, 69, 88, 116], 4); b.set(data, 8); dv.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length))); return b; };
  for (const c of chunks(u)) { if (c.type === 'tEXt') { const z = c.data.indexOf(0); if (z > 0 && drop.has(latin1(c.data.subarray(0, z)))) continue; }
    if (c.type === 'IEND' && !wrote) { for (const [k, v] of pairs) parts.push(mk(k, v)); wrote = true; }
    parts.push(u.subarray(c.start, c.end)); }
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
const b64 = s => { const u = new TextEncoder().encode(s); let r = ''; for (let i = 0; i < u.length; i += 0x8000) r += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(r); };
const unb64 = s => { const r = atob(s.replace(/\s+/g, '')), u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return new TextDecoder().decode(u); };

// ---------- the picture ----------
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that picture.')); i.src = src; });
async function setPicture(file) {
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) throw new Error('Pick a picture (PNG, JPG, WebP or GIF).');
  if (file.size > 40e6) throw new Error('That picture is too big (over 40 MB).');
  const url = URL.createObjectURL(file); try { const im = await loadImg(url), k = Math.min(1, 2048 / Math.max(im.naturalWidth, im.naturalHeight)), c = el('canvas', { width: Math.round(im.naturalWidth * k), height: Math.round(im.naturalHeight * k) }); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); image = c.toDataURL(/png|webp|gif/i.test(file.type) ? 'image/png' : 'image/jpeg', 0.93); } finally { URL.revokeObjectURL(url); }
  paintImage(); touch();
}
async function cardCanvas() { // the picture as it will be exported: a portrait card (2:3) if that option is on, or a placeholder when there is no picture
  if (!image) { const c = el('canvas', { width: 400, height: 600 }), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 400, 600); g.addColorStop(0, '#2d3250'); g.addColorStop(1, '#171a2b'); x.fillStyle = g; x.fillRect(0, 0, 400, 600);
    x.fillStyle = '#ffffff22'; x.beginPath(); x.arc(200, 230, 90, 0, 7); x.fill(); x.beginPath(); x.ellipse(200, 470, 150, 120, 0, 0, 7); x.fill(); x.fillStyle = '#e8e8f0'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText((card.name || 'Character').slice(0, 22), 200, 575); return c; }
  const im = await loadImg(image); let sx = 0, sy = 0, sw = im.naturalWidth, sh = im.naturalHeight;
  if (crop) { const want = 2 / 3, have = sw / sh; if (have > want) { sw = Math.round(sh * want); sx = Math.round((im.naturalWidth - sw) / 2); } else { sh = Math.round(sw / want); sy = Math.round((im.naturalHeight - sh) / 6); } }
  const k = Math.min(1, 1536 / Math.max(sw, sh)), c = el('canvas', { width: Math.round(sw * k), height: Math.round(sh * k) }); c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height); return c;
}
const toBytes = async c => new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
async function pngCard() { const c = await cardCanvas(), u = await toBytes(c); return withText(u, [['chara', b64(JSON.stringify(toV2(card)))], ['ccv3', b64(JSON.stringify(toV3(card)))]]); }
const fileBase = () => (card.name || 'character').trim().replace(/[^\w .-]+/g, '_').replace(/\s+/g, ' ').slice(0, 60) || 'character';

// ---------- the page ----------
const root = el('section', { id: 'charaview' });
root.innerHTML = '<div id="ch-bar"><b id="ch-title">Character card</b><span class="sp"></span><button id="ch-new" type="button">New character</button><button id="ch-import" type="button">Import a card…</button></div><div id="ch-scroll"><div id="ch-page"></div></div><div id="ch-docks"></div><input id="ch-file" type="file" accept=".json,.png,application/json,image/png" hidden><input id="ch-pic" type="file" accept="image/*" hidden>';
$('#mangaview').after(root);
const page = $('#ch-page');
const FIELDS = [
  ['name', 'Name', 'The name the character is called. Use it with {{char}} inside the text.', 'line', 0],
  ['version', 'Version', 'Your own version label for this card (not counted).', 'line', 1],
  ['creator', 'Creator', 'Who made the card (not counted).', 'line', 1],
  ['description', 'Description', 'Who the character is: looks, background, how they act. Sent to the model every time.', 'area', 0],
  ['first', 'First Message', 'What the character says first when a chat starts. You can add more openings and the chat picks one.', 'greet', 0],
  ['summary', 'Summary', 'A short summary of the character\'s personality.', 'area', 0],
  ['scenario', 'Scenario', 'Where the chat takes place and what is going on.', 'area', 0],
  ['examples', 'Example Messages', 'Sample dialogue that shows how the character talks. Start each example with <START>.', 'area', 0],
  ['note', 'Character\'s Note', 'A reminder slipped into the chat a few messages back. Depth is how many messages back.', 'area', 0],
];
const EXTRA = [
  ['main', 'Main Prompt', 'Replaces the chat program\'s main instruction, if it allows that.', 0], ['jailbreak', 'Post-history Instructions', 'Instructions placed after the chat history.', 0], ['commentary', 'Commentary', 'Notes for people who use the card (not sent to the model).', 1],
];
const refs = {}; let lastFocus = null;
function area(key, rows) { const t = el('textarea', { rows: rows || 6, spellcheck: true }); t.value = card[key] || ''; t.oninput = () => { card[key] = t.value; counts(); touch(); }; t.onfocus = () => { lastFocus = t; }; refs[key] = t; return t; }
function line(key) { const t = el('input', { type: 'text', maxLength: 200 }); t.value = card[key] || ''; t.oninput = () => { card[key] = t.value; if (key === 'name') $('#ch-title').textContent = card.name ? 'Character card: ' + card.name : 'Character card'; counts(); touch(); }; t.onfocus = () => { lastFocus = t; }; refs[key] = t; return t; }
function label(text, tip, extra) { const l = el('label', { className: 'ch-l' }); l.append(el('span', {}, text)); const i = el('i', { className: 'ch-i', title: tip }, 'i'); l.append(i); if (extra) l.append(extra); return l; }
const tally = (id, counted) => el('div', { className: 'ch-ct', id: 'ct-' + id }, counted ? '' : 'Doesn\'t count');
function acc(id, title, icon, open) { const sec = el('section', { className: 'ch-acc' + (open ? ' open' : ''), id: 'ch-' + id }), head = el('button', { type: 'button', className: 'ch-head' }), body = el('div', { className: 'ch-body' }); head.append(el('span', { className: 'ic' }, icon), el('span', {}, title), el('span', { className: 'chev' }, '⌄')); head.onclick = () => sec.classList.toggle('open'); sec.append(head, body); return [sec, body]; }

let editBody, avatarBox, statusBox;
function build() {
  page.textContent = ''; for (const k of Object.keys(refs)) delete refs[k];
  page.append(el('h1', {}, 'Character card editor'), el('p', { className: 'ch-sub' }, 'Create a profile for an AI chat bot.'));
  // Load
  const [loadSec, loadBody] = acc('load', 'Load', '📄', false); const tiles = el('div', { className: 'ch-tiles' });
  const tile = (icon, text, btn, fn) => { const t = el('div', { className: 'ch-tile' }); const b = el('button', { type: 'button', className: 'pri' }, btn); b.onclick = fn; t.append(el('div', { className: 'ic' }, icon), el('p', {}, text), b); return t; };
  tiles.append(tile('⬆', 'Drag and drop a card (.json or a card .png) onto the page, or', 'Choose file…', () => $('#ch-file').click()), tile('📝', 'Start from scratch and create a new character', 'New character', () => newCard()), tile('↻', 'Open a character card you made before', 'My cards…', openList));
  loadBody.append(tiles);
  // Edit
  const [editSec, eb] = acc('edit', 'Edit', '✎', true); editBody = eb;
  const intro = el('div', { className: 'ch-intro' }); intro.append(el('h3', {}, 'What goes in a character card'), el('ul', {}, ''));
  [['Write ', '{{char}}', ' for the character\'s name and ', '{{user}}', ' for the person chatting, so the card works with any name.'], ['Put thoughts or actions between asterisks ( * ) and speech between quotation marks ( " ).'], ['To keep long text tidy you can use tags like <tag>text</tag>.']].forEach(p => { const li = el('li'); p.forEach(t => li.append(/^\{\{/.test(t) ? el('b', {}, t) : document.createTextNode(t))); intro.lastChild.append(li); }); eb.append(intro);
  const grid = el('div', { className: 'ch-grid' }); avatarBox = el('div', { className: 'ch-avatar' }); const form = el('div', { className: 'ch-form' }); grid.append(avatarBox, form); eb.append(grid);
  paintAvatar();
  form.append(el('h2', {}, 'Main Info')); const row = el('div', { className: 'ch-row3' });
  for (const k of ['name', 'version', 'creator']) { const f = FIELDS.find(x => x[0] === k), c = el('div'); c.append(label(f[1], f[2]), line(k), tally(k, k === 'name')); row.append(c); } form.append(row);
  for (const [k, t, tip, kind] of FIELDS.slice(3)) { const c = el('div', { className: 'ch-f' });
    if (kind === 'greet') { const head = label(t, tip, el('span', { className: 'ch-dots', id: 'ch-dots' })); c.append(head, greetBox(), tally(k, true)); }
    else if (k === 'note') { c.append(label(t, tip, el('span', { className: 'ch-depth' }, 'Depth: ')), area(k, 5), tally(k, true)); const dep = el('input', { type: 'number', min: 0, max: 100, value: card.depth, title: 'How many messages back the note is placed' }); dep.oninput = () => { card.depth = clamp(Math.round(+dep.value) || 0, 0, 100); touch(); }; c.querySelector('.ch-depth').append(dep); }
    else c.append(label(t, tip), area(k, k === 'examples' ? 8 : 6), tally(k, true));
    form.append(c); }
  form.append(el('hr'), el('h2', {}, 'Additional Info and Prompt Overrides'));
  for (const [k, t, tip, nocount] of EXTRA) { const c = el('div', { className: 'ch-f' }); c.append(label(t, tip), area(k, 5), tally(k, !nocount)); form.append(c); }
  const tg = el('div', { className: 'ch-f' }); tg.append(label('Tags', 'Words people can search for, separated by commas (not counted).'), line('tags'), tally('tags', false)); form.append(tg);
  const tk = el('div', { className: 'ch-f' }), pct = el('span', {}, ''); const rng = el('input', { type: 'range', min: 0, max: 100, value: Math.round(card.talk * 100) }); const upd = () => { pct.textContent = ' Frequency: ' + rng.value + '%'; }; upd(); rng.oninput = () => { card.talk = +rng.value / 100; upd(); touch(); }; tk.append(label('Talkativeness', 'How often the character speaks up in a group chat.', pct), rng); form.append(tk);
  const total = el('div', { className: 'ch-total', id: 'ch-total' }, ''); form.append(total);
  // Export
  const [expSec, xb] = acc('export', 'Export', '⬇', false); statusBox = el('div', { className: 'ch-status', id: 'ch-status' });
  xb.append(el('h3', {}, 'Export'), el('p', { className: 'hint' }, 'The PNG holds the whole profile inside the picture (a "character card"), so one file is both the image and the character. The JSON is the same profile without a picture.'));
  const bar = el('div', { className: 'ch-btns' });
  const bPng = el('button', { type: 'button', className: 'pri' }, '⬇ Download as Character PNG'), bJson = el('button', { type: 'button' }, '⬇ Download as Character JSON'), bDorms = el('button', { type: 'button', id: 'ch-dorms' }, 'Send to Desktop College Dorms');
  bPng.onclick = () => doExport('png'); bJson.onclick = () => doExport('json'); bDorms.onclick = sendToDorms; bar.append(bPng, bJson); if (sma.dorms) bar.append(bDorms);
  xb.append(bar, el('p', { className: 'ch-compat' }, 'Compatible with Pygmalion, Text Generation, TavernAI and SillyTavern.'));
  if (sma.dorms) { xb.append(el('p', { className: 'hint' }, 'Send to Desktop College Dorms looks for the app on this computer and opens it with this card. Use it when the character is for that app and not for an online site.')); }
  xb.append(statusBox);
  const crp = el('label', { className: 'cv-chk' }), cb = el('input', { type: 'checkbox', checked: crop }); cb.onchange = () => { crop = cb.checked; paintAvatar(); touch(); }; crp.append(cb, ' Crop the picture to a portrait card (2:3) when exporting'); xb.append(crp);
  page.append(loadSec, editSec, expSec); counts(); greetDots();
}
function paintAvatar() { if (!avatarBox) return; avatarBox.textContent = '';
  const frame = el('div', { className: 'ch-pic' + (crop ? ' crop' : '') }); if (image) frame.append(Object.assign(el('img'), { src: image, alt: '' })); else frame.append(el('div', { className: 'ph' }, '👤'));
  frame.onclick = () => $('#ch-pic').click(); frame.title = 'Click to choose a picture, or drop one here'; avatarBox.append(frame);
  const row = el('div', { className: 'ch-btns' }), pick = el('button', { type: 'button' }, image ? 'Change picture…' : 'Choose a picture…'); pick.onclick = () => $('#ch-pic').click(); row.append(pick);
  if (image) { const rm = el('button', { type: 'button' }, 'Remove'); rm.onclick = () => { image = null; paintAvatar(); touch(); }; row.append(rm); } avatarBox.append(row, el('p', { className: 'hint' }, 'The picture is optional. Without one, the exported PNG gets a plain placeholder.')); }
const paintImage = paintAvatar;
// the first message and its alternatives
function greetBox() {
  const wrap = el('div', { className: 'ch-greet' }), prev = el('button', { type: 'button', className: 'nav', title: 'Previous opening', textContent: '‹' }), next = el('button', { type: 'button', className: 'nav', title: 'Next opening', textContent: '›' }), t = el('textarea', { rows: 6 });
  const all = () => [card.first, ...card.alts], show = () => { t.value = all()[curGreeting] || ''; greetDots(); };
  t.oninput = () => { if (curGreeting === 0) card.first = t.value; else card.alts[curGreeting - 1] = t.value; counts(); touch(); }; t.onfocus = () => { lastFocus = t; };
  prev.onclick = () => { curGreeting = (curGreeting - 1 + all().length) % all().length; show(); }; next.onclick = () => { curGreeting = (curGreeting + 1) % all().length; show(); };
  const add = el('button', { type: 'button' }, '+ Add another opening'), del = el('button', { type: 'button' }, 'Remove this opening');
  add.onclick = () => { card.alts.push(''); curGreeting = card.alts.length; show(); touch(); }; del.onclick = () => { if (curGreeting === 0) { if (card.alts.length) card.first = card.alts.shift(); else card.first = ''; } else card.alts.splice(curGreeting - 1, 1); curGreeting = clamp(curGreeting, 0, card.alts.length); show(); counts(); touch(); };
  refs.first = t; wrap.greet = show; const bar = el('div', { className: 'ch-btns' }); bar.append(add, del); const mid = el('div', { className: 'ch-gmid' }); mid.append(prev, t, next); wrap.append(mid, bar); show(); return wrap;
}
function greetDots() { const d = $('#ch-dots'); if (!d) return; d.textContent = ''; const n = 1 + card.alts.length; if (n < 2) return; for (let i = 0; i < n; i++) d.append(el('span', { className: 'dot' + (i === curGreeting ? ' on' : '') })); }
// token counters
const COUNT_KEYS = [['name', 'Name'], ['description', 'Description'], ['first', 'First Message'], ['summary', 'Summary'], ['scenario', 'Scenario'], ['examples', 'Examples'], ['note', 'Character\'s Note'], ['main', 'Prompt Overrides']];
function counts() {
  const val = k => (k === 'first' ? [card.first, ...card.alts].filter(Boolean).join('\n') : k === 'main' ? card.main + '\n' + card.jailbreak : card[k]);
  for (const k of ['name', 'description', 'first', 'summary', 'scenario', 'examples', 'note', 'main', 'jailbreak']) { const c = $('#ct-' + k); if (c) c.textContent = `${(k === 'first' ? card.first || '' : card[k] || '').length} characters, about ${estTokens(k === 'first' ? card.first : card[k])} tokens`; }
  let total = 0; const rows = COUNT_KEYS.map(([k, t]) => { const n = estTokens(val(k)); total += n; return [t, n]; });
  const dock = $('#ch-tok'); if (dock) { dock.textContent = ''; rows.forEach(([t, n]) => { const r = el('div', { className: 'r' }); r.append(el('span', {}, t), el('b', {}, String(n))); dock.append(r); }); dock.append(el('div', { className: 'tot' }, `about ${total} tokens in all`)); }
  const tt = $('#ch-total'); if (tt) tt.textContent = `about ${total} tokens in all (a rough estimate)`;
}
// the two small panels at the bottom: token counter and cheatsheet
const docks = $('#ch-docks');
function dock(id, title, body, side) { const d = el('div', { className: 'ch-dock min ' + side, id }); const h = el('div', { className: 'h' }), x = el('button', { type: 'button', title: 'Show or hide' }, '+'); h.append(el('b', {}, title), el('span', { className: 'sp' }), x); const tg = () => { d.classList.toggle('min'); x.textContent = d.classList.contains('min') ? '+' : '–'; }; x.onclick = e => { e.stopPropagation(); tg(); }; h.onclick = tg; h.style.cursor = 'pointer'; d.append(h, body); docks.append(d); return d; }
const tok = el('div', { id: 'ch-tok', className: 'ch-tokbody' }); dock('ch-tokdock', 'Token counter (estimate)', tok, 'l');
const cheat = el('div', { className: 'ch-cheat' });
[['Values', [['{{char}}', 'Main value', '{{user}}'], ['<{{char}}>', 'Open tag', '<{{user}}>'], ['</{{char}}>', 'Close tag', '</{{user}}>']]], ['Blocks', [['[<tag>', 'Global tag', '</tag>]'], ['<tag>', 'Inner tag', '</tag>']]], ['Misc', [['*text*', 'Action or thought', '"text"'], ['{{// note }}', 'Hidden comment', '<START>']]]].forEach(([h, rows]) => { cheat.append(el('h6', {}, h)); rows.forEach(([a, m, b]) => { const r = el('div', { className: 'r' }); for (const [t, k] of [[a, 0], [m, 1], [b, 0]]) { if (k) r.append(el('span', {}, t)); else { const bt = el('button', { type: 'button', title: 'Put this where the cursor is' }, t); bt.onmousedown = e => e.preventDefault(); bt.onclick = () => insert(t); r.append(bt); } } cheat.append(r); }); });
dock('ch-cheatdock', 'Cheatsheet', cheat, 'r');
function insert(text) { const t = lastFocus; if (!t || !document.body.contains(t)) return; const a = t.selectionStart ?? t.value.length, b = t.selectionEnd ?? a; t.setRangeText(text, a, b, 'end'); t.dispatchEvent(new Event('input')); t.focus(); }

// ---------- actions ----------
const say = (t, bad) => { if (statusBox) { statusBox.textContent = t; statusBox.className = 'ch-status' + (bad ? ' bad' : t ? ' ok' : ''); } };
function newCard() { card = BLANK(); image = null; curGreeting = 0; pid = null; build(); root.querySelector('#ch-edit').classList.add('open'); touch(); }
async function loadFile(f) {
  try { if (f.size > 40e6) throw new Error('That file is too big.'); const u = new Uint8Array(await f.arrayBuffer()); let obj, pic = null;
    if (isPng(u)) { const t = await pngText(u); const raw = t.ccv3 || t.chara; if (!raw) throw new Error('This picture has no character card inside it. Use it as the card\'s picture instead?'); let txt; try { txt = unb64(raw); } catch (e) { txt = raw; } obj = JSON.parse(txt); pic = URL.createObjectURL(f); }
    else obj = JSON.parse(new TextDecoder().decode(u).replace(/^﻿/, ''));
    const c = fromAny(obj); card = Object.assign(BLANK(), c); curGreeting = 0;
    if (pic) { const im = await loadImg(pic); const k = Math.min(1, 2048 / Math.max(im.naturalWidth, im.naturalHeight)), cv = el('canvas', { width: Math.round(im.naturalWidth * k), height: Math.round(im.naturalHeight * k) }); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); image = cv.toDataURL('image/png'); URL.revokeObjectURL(pic); }
    pid = null; build(); root.querySelector('#ch-edit').classList.add('open'); touch(); setTimeout(() => say('Loaded "' + (card.name || 'a character') + '".'), 0);
  } catch (e) { if (/no character card inside/.test(e.message) && /^image\//.test(f.type)) { try { await setPicture(f); build(); root.querySelector('#ch-edit').classList.add('open'); } catch (e2) {} } openAcc('load'); const m = String(e.message || e); setTimeout(() => alert(m), 20); }
}
const openAcc = id => { const s = $('#ch-' + id); if (s) s.classList.add('open'); };
async function doExport(kind) {
  try { const base = fileBase();
    if (kind === 'json') { SMA.download(base + '.json', new Blob([JSON.stringify(toV2(card), null, 2)], { type: 'application/json' })); say('Saved ' + base + '.json'); }
    else { const bytes = await pngCard(); SMA.download(base + '.png', new Blob([bytes], { type: 'image/png' })); say('Saved ' + base + '.png. The profile is inside the picture.'); }
  } catch (e) { say(String(e.message || e), true); }
}
async function sendToDorms() {
  const api = sma.dorms; if (!api) return; say('Looking for Desktop College Dorms…');
  try { const bytes = await pngCard(), r = await api.send(bytes.buffer, fileBase() + '.png');
    if (!r.found) { say('Desktop College Dorms was not found on this computer. The card was saved at ' + r.file + ' so you can import it from the app\'s Library when you have it.', true); return; }
    say(`Opened Desktop College Dorms (${r.how}). The card is also saved at ${r.file}; if the app did not open it by itself, use Library > Import cards and pick that file.`);
  } catch (e) { say(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
}
async function openList() { // earlier character cards (they are saved as projects)
  let items = []; try { items = (await SMA.store.list()).filter(i => i.type === 'chara').sort((a, b) => b.updated - a.updated); } catch (e) {}
  const dlg = el('dialog', { id: 'ch-dlg' }), form = el('form', { method: 'dialog' }); form.append(el('h3', {}, 'Your character cards'));
  if (!items.length) form.append(el('p', { className: 'hint' }, 'None yet. Cards you make here are saved automatically.'));
  items.slice(0, 80).forEach(i => { const b = el('button', { type: 'button', className: 'op' }); if (i.thumb) b.append(Object.assign(el('img'), { src: i.thumb, alt: '' })); b.append(el('b', {}, i.name || 'Untitled')); b.onclick = async () => { const r = await SMA.store.get(i.id); if (r) { await load(r.data); pid = r.id; } dlg.close(); }; form.append(b); });
  const c = el('button', { type: 'button' }, 'Close'); c.onclick = () => dlg.close(); form.append(c); dlg.append(form); document.body.append(dlg); dlg.showModal(); dlg.addEventListener('close', () => dlg.remove());
}
$('#ch-new').onclick = newCard; $('#ch-import').onclick = () => $('#ch-file').click();
$('#ch-file').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadFile(f); };
$('#ch-pic').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { await setPicture(f); } catch (er) { alert(er.message); } } };
root.addEventListener('dragover', e => e.preventDefault());
root.addEventListener('drop', async e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return; if (/\.json$/i.test(f.name)) loadFile(f); else if (/\.png$/i.test(f.name)) loadFile(f); else try { await setPicture(f); } catch (er) { alert(er.message); } });

// ---------- saving the project ----------
function serialize() { return JSON.stringify({ app: 'sudo-make-chara', kind: 'chara', v: 1, name: card.name || 'Untitled character', card, image, crop }); }
async function load(json) { const o = JSON.parse(json); if (!o || o.app !== 'sudo-make-chara') throw new Error('Not a character card project'); card = Object.assign(BLANK(), fromAny({ data: { name: o.card.name, description: o.card.description, personality: o.card.summary, scenario: o.card.scenario, first_mes: o.card.first, mes_example: o.card.examples, creator_notes: o.card.commentary, system_prompt: o.card.main, post_history_instructions: o.card.jailbreak, alternate_greetings: o.card.alts, tags: o.card.tags, creator: o.card.creator, character_version: o.card.version, extensions: { talkativeness: o.card.talk, depth_prompt: { prompt: o.card.note, depth: o.card.depth } } } })); image = typeof o.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(o.image) ? o.image : null; crop = o.crop !== false; curGreeting = 0; build(); }
async function thumb() { try { const c = await cardCanvas(), o = el('canvas', { width: 200, height: 120 }), x = o.getContext('2d'); x.fillStyle = '#2b2d3a'; x.fillRect(0, 0, 200, 120); const h = 120, w = Math.round(c.width * h / c.height); x.drawImage(c, (200 - w) / 2, 0, w, h); return o.toDataURL('image/jpeg', 0.7); } catch (e) { return null; } }
function reset() { card = BLANK(); image = null; curGreeting = 0; pid = null; crop = true; build(); }
window.SMA_chara = { serialize, thumb, getPid: () => pid, setPid: p => { pid = p; }, getName: () => card.name || 'Untitled character', setName: n => { card.name = n; if (refs.name) refs.name.value = n; }, load, reset, show() { counts(); }, hide() {},
  // for tests and other modes
  card: () => JSON.parse(JSON.stringify(card)), setCard: c => { card = Object.assign(BLANK(), c); build(); }, toV2: () => toV2(card), pngCard, loadFile, fromAny, pngText };
build();
})();
