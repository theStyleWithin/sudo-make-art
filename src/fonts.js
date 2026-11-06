// Fonts: every font installed on this computer, plus font files you add yourself (.ttf .otf .woff .woff2).
// Added fonts are kept in the Sources library, so they are still there next time, and they are embedded into exports.
(() => {
'use strict';
const SMA = window.SMA; if (!SMA) return;
const css = SMA.cssFamily;
const BASIC = ['sans-serif', 'serif', 'monospace', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS'];
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const mine = new Map();   // library id -> { family, weight, style, face, css }
let system = [];          // families installed on the computer

// ---------- reading a font file's real name ----------
async function inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); }
const tagOf = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
async function readNames(buf) { // returns { family, sub } from the font's 'name' table, or null (e.g. WOFF2)
  try {
    const dv = new DataView(buf); let base = 0, tag = tagOf(dv, 0), name = null;
    if (tag === 'ttcf') { base = dv.getUint32(12); tag = tagOf(dv, base); }
    if (tag === 'wOFF') {
      for (let i = 0, n = dv.getUint16(12); i < n; i++) { const o = 44 + i * 20; if (tagOf(dv, o) !== 'name') continue;
        const off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8), orig = dv.getUint32(o + 12), raw = new Uint8Array(buf, off, comp); name = comp < orig ? await inflate(raw) : raw.slice(); }
    } else if (tag === '\0\x01\0\0' || tag === 'OTTO' || tag === 'true') {
      for (let i = 0, n = dv.getUint16(base + 4); i < n; i++) { const o = base + 12 + i * 16; if (tagOf(dv, o) !== 'name') continue; name = new Uint8Array(buf, dv.getUint32(o + 8), dv.getUint32(o + 12)); }
    }
    if (!name) return null;
    const nv = new DataView(name.buffer, name.byteOffset, name.byteLength), count = nv.getUint16(2), strOff = nv.getUint16(4), found = {};
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 12, plat = nv.getUint16(o), id = nv.getUint16(o + 6), len = nv.getUint16(o + 8), off = strOff + nv.getUint16(o + 10);
      if (![1, 2, 16, 17].includes(id) || off + len > name.length) continue; let s = '';
      if (plat === 3 || plat === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(nv.getUint16(off + k)); else for (let k = 0; k < len; k++) s += String.fromCharCode(nv.getUint8(off + k));
      if (s && (!found[id] || plat === 3)) found[id] = s; // prefer the Windows (UTF-16) record
    }
    return { family: found[16] || found[1], sub: found[17] || found[2] || 'Regular' };
  } catch (e) { return null; }
}
function styleOf(sub) {
  const s = (sub || '').toLowerCase().replace(/[\s_-]/g, ''); let weight = 400;
  if (/thin|hairline/.test(s)) weight = 100; else if (/extralight|ultralight/.test(s)) weight = 200; else if (/light/.test(s)) weight = 300; else if (/medium/.test(s)) weight = 500;
  else if (/semibold|demibold/.test(s)) weight = 600; else if (/extrabold|ultrabold/.test(s)) weight = 800; else if (/black|heavy/.test(s)) weight = 900; else if (/bold/.test(s)) weight = 700;
  return { weight, style: /italic|oblique/.test(s) ? 'italic' : 'normal' };
}
const clean = s => String(s).replace(/["'\\;{}<>\u0000-\u001f]/g, '').trim();
function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const MIME = { ttf: ['font/ttf', 'truetype'], otf: ['font/otf', 'opentype'], woff: ['font/woff', 'woff'], woff2: ['font/woff2', 'woff2'] };

async function register(rec) {
  if (mine.has(rec.id)) return; mine.set(rec.id, null); // reserve, so it is not registered twice
  try {
    const buf = await rec.blob.arrayBuffer(), names = await readNames(buf), ext = rec.name.split('.').pop().toLowerCase();
    const stem = rec.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), family = clean(rec.fontName || (names && names.family) || stem.replace(/\s*(regular|bold|italic|light|medium|black)\s*$/i, '')) || 'My font';
    const st = styleOf(names ? names.sub : stem), face = new FontFace(family, buf, { weight: String(st.weight), style: st.style });
    await face.load(); document.fonts.add(face);
    const [mime, fmt] = MIME[ext] || MIME.ttf;
    mine.set(rec.id, { family, weight: st.weight, style: st.style, face, face_css: `@font-face{font-family:"${family}";font-weight:${st.weight};font-style:${st.style};src:url(data:${mime};base64,${b64(buf)}) format("${fmt}")}` });
  } catch (e) { mine.delete(rec.id); console.warn('Could not load font', rec.name, e); }
}
async function sync() { // keep the registered fonts in step with the library
  const fonts = SMA.getSources().filter(s => s.kind === 'font'), ids = new Set(fonts.map(f => f.id));
  for (const [id, f] of [...mine]) if (!ids.has(id)) { if (f) document.fonts.delete(f.face); mine.delete(id); }
  let changed = false; for (const f of fonts) if (!mine.has(f.id)) { await register(f); changed = true; }
  if (changed || fonts.length !== mine.size) document.dispatchEvent(new Event('sma-fonts'));
}
SMA.subscribe(sync);

// ---------- installed fonts ----------
(async () => {
  try { if (window.queryLocalFonts) system = [...new Set((await window.queryLocalFonts()).map(f => f.family))].sort((a, b) => a.localeCompare(b)); } catch (e) {}
  if (!system.length && window.sma && window.sma.fonts) { try { system = await window.sma.fonts(); } catch (e) {} }
  document.dispatchEvent(new Event('sma-fonts-list'));
})();

// ---------- used by exports: only the added fonts that a design actually uses, as @font-face rules ----------
function embedCSS(families) {
  const want = new Set(families); return [...mine.values()].filter(f => f && want.has(f.family)).map(f => f.face_css).join('\n');
}

// ---------- the picker ----------
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
function pick(current, onChange) {
  const btn = el('button', { className: 'fp-btn', type: 'button', title: 'Change the font' }, current); btn.style.fontFamily = css(current);
  let pop = null; const close = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); } };
  const away = ev => { if (pop && !pop.contains(ev.target) && ev.target !== btn) close(); }, esc = ev => { if (ev.key === 'Escape') close(); };
  btn.onclick = () => {
    if (pop) return close(); const r = btn.getBoundingClientRect();
    pop = el('div', { className: 'fp-pop' }); pop.style.cssText = `left:${Math.max(8, Math.min(r.left, innerWidth - 300))}px;top:${Math.min(r.bottom + 4, innerHeight - 360)}px;width:290px`;
    const search = el('input', { className: 'fp-search', placeholder: 'Search fonts…', spellcheck: false }), add = el('button', { type: 'button', className: 'fp-add' }, '+ Add a font file…'), list = el('div', { className: 'fp-list' });
    const match = el('button', { type: 'button', className: 'fp-add' }, '🔎 Match a font from a picture…'); match.onclick = () => { close(); window.SMA_FONTMATCH.open(onChange); };
    add.onclick = () => { const f = document.querySelector('#file'); f.accept = '.ttf,.otf,.woff,.woff2'; f.multiple = true; f.value = ''; f.onchange = () => { SMA.addFiles([...f.files]); f.multiple = false; close(); }; f.click(); };
    const ownFamilies = [...new Set([...mine.values()].filter(Boolean).map(f => f.family))].sort((a, b) => a.localeCompare(b));
    const render = () => {
      const q = search.value.trim().toLowerCase(), match = n => !q || n.toLowerCase().includes(q); list.textContent = '';
      const section = (title, names, removable) => { const m = names.filter(match); if (!m.length) return; list.append(el('div', { className: 'fp-head' }, title));
        m.slice(0, 300).forEach(n => { const it = el('div', { className: 'fp-item' + (n === current ? ' on' : '') }, n); it.style.fontFamily = css(n); it.onclick = () => { close(); onChange(n); }; list.append(it); });
        if (m.length > 300) list.append(el('div', { className: 'fp-more' }, `…and ${m.length - 300} more. Type to narrow it down.`)); };
      section('Your fonts', ownFamilies); section('Installed on this computer', system.filter(n => !ownFamilies.includes(n))); section('Basic', BASIC.filter(n => !system.includes(n) && !ownFamilies.includes(n)));
      if (!list.children.length) list.append(el('div', { className: 'fp-more' }, 'No match. You can add a font file above.'));
    };
    search.oninput = render; render(); pop.append(search, add, ...(window.SMA_FONTMATCH ? [match] : []), list); document.body.append(pop); search.focus();
    setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); });
  };
  return btn;
}

window.SMA_FONTS = { pick, embedCSS, families: () => ({ mine: [...new Set([...mine.values()].filter(Boolean).map(f => f.family))], system }) };
sync();
})();
