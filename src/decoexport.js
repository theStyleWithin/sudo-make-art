// "Save as a profile decoration": turns this design, or a PNG / GIF / WebP / short video file, into a .asdeco pack that
// Anti-Social imports. The rules and the file writer are in asdeco.js; the format is in docs/asdeco-format.md.
(() => {
'use strict';
const A = window.SMA_ASDECO, $ = s => document.querySelector(s);
const dlg = $('#decodlg'), body = $('#decobody');
const META = 'sma-deco-meta', basket = [];
const load = () => { try { return JSON.parse(localStorage.getItem(META) || '{}') || {}; } catch (e) { return {}; } };
const keep = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* not remembered */ } };
const h = (tag, a = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(a)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (v === false || v == null) continue; else e.setAttribute(k, v === true ? '' : v); } e.append(...kids.flat().filter(x => x != null)); return e; };
const readUrl = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('read')); r.readAsDataURL(f); });
const slug = s => (String(s || 'decoration').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'decoration');

let st;   // the thing being made right now (st.say is the last message from Send to Anti-Social)
const fresh = () => {
  const dk = window.SMA.deco(), sz = window.SMA.size(), kind = dk || A.guessKind(sz.w, sz.h) || '';
  st = { kind, source: dk || kind ? 'svg' : 'file', name: window.SMA.docName() || '', svg: '', png: '', file: null, fileUrl: '', fileKind: '', still: '', result: null, busy: false };
};
async function build() {              // work out what would be saved for the chosen source, and check it
  st.result = null; st.src = null; st.busy = true; paint();
  try {
    if (st.source === 'svg' || st.source === 'png') {
      let xml = window.SMA.cleanSVG(); const sz = window.SMA.size();
      if (!/viewBox\s*=/.test(xml)) xml = xml.replace(/<svg\b/, `<svg viewBox="0 0 ${sz.w} ${sz.h}"`);
      if (st.source === 'svg') { st.src = { svg: xml }; st.preview = { img: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml) }; }
      else {
        const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('The design could not be drawn.')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
        const cv = document.createElement('canvas'); cv.width = sz.w; cv.height = sz.h; cv.getContext('2d').drawImage(img, 0, 0, sz.w, sz.h);
        const uri = cv.toDataURL('image/png'); st.src = { image: uri }; st.preview = { img: uri };
      }
    } else if (st.file) {
      const uri = await readUrl(st.file), isVid = /^data:video\//.test(uri);
      st.src = isVid ? { video: uri } : { image: uri }; st.preview = isVid ? { video: st.fileUrl } : { img: uri };
      if (!st.kind && !isVid) { const i = A.imageInfo(uri); st.kind = i ? A.guessKind(i.w, i.h) : ''; }
      if (!st.kind && isVid) st.kind = 'banner';
    } else { st.preview = null; st.result = { ok: false, error: 'Choose a file.', quiet: true }; }
    if (st.src) st.result = A.check(st.kind, st.src);
  } catch (e) { st.result = { ok: false, error: e.message || 'That did not work.' }; }
  st.busy = false; paint();
}
function mock() {                     // what it will look like: a member row, a profile banner or an avatar
  const p = st.preview, K = A.KINDS[st.kind]; if (!p) return h('div', { class: 'dx-empty' }, 'Nothing to show yet.');
  const art = cls => { if (!p.video) return h('img', { class: cls, src: p.img, alt: '' }); const v = h('video', { class: cls, src: p.video, playsinline: true }); v.muted = true; v.loop = true; v.autoplay = true; if (v.play) v.play().catch(() => {}); return v; };
  if (st.kind === 'wreath') return h('div', { class: 'dx-wr' }, h('span', { class: 'dx-av' }, 'A'), art('dx-over'));
  if (st.kind === 'banner') return h('div', { class: 'dx-banner' }, art('dx-fill'), h('span', { class: 'dx-av sm' }, 'A'));
  return h('div', { class: 'dx-plate', style: `aspect-ratio:${K.w}/${K.h}` }, art('dx-fill'), h('span', { class: 'dx-row' }, h('span', { class: 'dx-av sm' }, 'A'), h('b', {}, 'Your name')));
}
function paint() {
  const m = load(), r = st.result, ok = r && r.ok;
  const kindBtn = k => h('button', { type: 'button', class: st.kind === k ? 'on' : '', onclick: () => { st.kind = k; build(); } }, A.KINDS[k].label, h('small', {}, `${A.KINDS[k].work[0]} × ${A.KINDS[k].work[1]}`));
  const src = (id, title, hint) => h('label', { class: 'dx-src' + (st.source === id ? ' on' : '') }, h('input', { type: 'radio', name: 'dxsrc', checked: st.source === id, onchange: () => { st.source = id; build(); } }), h('span', {}, h('b', {}, title), h('small', {}, hint)));
  const pick = h('input', { type: 'file', accept: '.png,.gif,.webp,.jpg,.jpeg,.mp4,.webm,image/*,video/mp4,video/webm', hidden: true, onchange: ev => { const f = ev.target.files[0]; if (!f) return; if (st.fileUrl) URL.revokeObjectURL(st.fileUrl); st.file = f; st.fileUrl = URL.createObjectURL(f); st.source = 'file'; if (!st.name || st.name === window.SMA.docName()) st.name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); st.kind = /^video\//.test(f.type) ? st.kind || 'banner' : ''; build(); } });
  const name = h('input', { type: 'text', maxlength: 40, value: st.name, placeholder: 'Name shown in Anti-Social', oninput: e => { st.name = e.target.value; } });
  const author = h('input', { type: 'text', maxlength: 60, value: m.author || '', placeholder: 'Your name (optional)', oninput: e => keep({ ...load(), author: e.target.value }) });
  const lic = h('input', { type: 'text', maxlength: 60, value: m.license || '', placeholder: 'e.g. All rights reserved, CC BY 4.0', oninput: e => keep({ ...load(), license: e.target.value }) });
  const add = h('button', { type: 'button', disabled: !ok || st.busy, onclick: () => { basket.push(cur()); fresh(); st.source = 'file'; build(); } }, 'Add to pack, then make another');
  const save = h('button', { type: 'button', class: 'pri', disabled: st.busy || (!ok && !basket.length), onclick: saveAll }, basket.length + (ok ? 1 : 0) > 1 ? `Save pack (${basket.length + (ok ? 1 : 0)} items)` : 'Save .asdeco');
  body.replaceChildren(h('div', { class: 'dx-left' },
    h('h4', {}, '1. What is it?'), h('div', { class: 'dx-kinds' }, Object.keys(A.KINDS).map(kindBtn)),
    h('h4', {}, '2. Where does it come from?'),
    src('svg', 'This design, as a drawing', 'SVG: stays sharp at any size, and can move if it has animation.'),
    src('png', 'This design, as a picture', 'PNG at the design size. Best when you use effects.'),
    src('file', 'A file I already have', 'PNG, GIF, WebP, or a short MP4 / WebM video (3 MB at most).'),
    h('div', { class: 'dx-file' }, h('button', { type: 'button', onclick: () => pick.click() }, st.file ? 'Choose a different file…' : 'Choose a file…'), h('span', {}, st.file ? st.file.name : ''), pick),
    h('h4', {}, '3. Name and credit'), h('label', {}, 'Name', name), h('label', {}, 'Made by', author), h('label', {}, 'Licence', lic)),
  h('div', { class: 'dx-right' }, h('h4', {}, 'Preview'), h('div', { class: 'dx-stage' }, st.busy ? h('div', { class: 'dx-empty' }, 'Working…') : mock()),
    r && !r.quiet ? h('p', { class: ok ? 'dx-ok' : 'dx-err', role: 'status' }, ok ? '✓ Ready to save.' + (r.moves ? ' It moves.' : '') + ' ' + (r.note || '') : r.error) : h('p', { class: 'dx-ok' }, ' '),
    basket.length ? h('div', { class: 'dx-basket' }, h('b', {}, 'In this pack'), basket.map((b, i) => h('div', { class: 'dx-brow' }, h('span', {}, `${b.name} · ${A.KINDS[b.kind].label}`), h('button', { type: 'button', onclick: () => { basket.splice(i, 1); paint(); } }, 'Remove')))) : null,
    h('div', { class: 'dx-btns' }, add, save, ...(window.SMA_ANTISOCIAL && window.SMA_ANTISOCIAL.available ? [h('button', { type: 'button', class: 'pri', disabled: st.busy || (!ok && !basket.length), title: 'Open Anti-Social and have it add this to your decorations', onclick: sendAll }, 'Send to Anti-Social')] : []), h('button', { type: 'button', onclick: () => dlg.close() }, 'Cancel')),
    st.say ? h('p', { class: st.say.ok ? 'dx-ok' : 'dx-err', role: 'status' }, st.say.text) : null,
    h('p', { class: 'hint' }, window.SMA_ANTISOCIAL && window.SMA_ANTISOCIAL.available ? 'Send to Anti-Social opens the app and adds it for you. Or save the .asdeco file and add it yourself: Settings → Profile decorations → Add my own decorations.' : 'Open the .asdeco file in Anti-Social: Settings → Profile decorations → Add my own decorations.')));
}
const cur = () => ({ kind: st.kind, name: st.name || A.KINDS[st.kind].label, ...st.src });
function packOf() {
  const items = [...basket]; if (st.result && st.result.ok) items.push(cur());
  const m = load(); const text = A.buildPack({ name: items.length === 1 ? items[0].name : 'My decorations', author: m.author, license: m.license }, items);
  return { text, file: (items.length === 1 ? slug(items[0].name) : 'my-decorations') + '.asdeco' };
}
async function sendAll() {   // open Anti-Social with this pack (desktop app)
  let p; try { p = packOf(); } catch (e) { st.result = { ok: false, error: e.message }; paint(); return; }
  st.busy = true; st.say = { ok: true, text: 'Looking for Anti-Social…' }; paint();
  try { st.say = await window.SMA_ANTISOCIAL.send(p.text, p.file); if (st.say.ok) basket.length = 0; } catch (e) { st.say = { ok: false, text: window.SMA_ANTISOCIAL.clean(e) }; }
  st.busy = false; paint();
}
async function saveAll() {
  const items = [...basket]; if (st.result && st.result.ok) items.push(cur());
  const m = load(); let text; try { text = A.buildPack({ name: items.length === 1 ? items[0].name : 'My decorations', author: m.author, license: m.license }, items); } catch (e) { st.result = { ok: false, error: e.message }; paint(); return; }
  const file = (items.length === 1 ? slug(items[0].name) : 'my-decorations') + '.asdeco';
  await window.SMA.download(file, new Blob([text], { type: 'application/json' }));
  basket.length = 0; dlg.close();
}
window.SMA_DECOEXPORT = { open() { fresh(); dlg.showModal(); build(); }, state: () => st };
$('#decoclose').onclick = () => dlg.close();
dlg.addEventListener('close', () => { if (st && st.fileUrl) { URL.revokeObjectURL(st.fileUrl); st.fileUrl = ''; } });
})();
