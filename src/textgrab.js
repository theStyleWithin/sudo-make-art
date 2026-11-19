// Text Grab: freeze the screen, drag over any text, and it is read right here on this computer (OCR in electron/ocr.js, no
// network). The result opens in a small window where it can be fixed, copied, or sent to Sudo Write Stuff: a new document
// or one you already have (picked from a drop-down). Original code for this project.
(() => {
'use strict';
const sma = window.sma, pin = sma && sma.pinpoint, ocr = sma && sma.ocr, $ = s => document.querySelector(s);
if (!pin || !ocr) return;
const el = (tag, attrs = {}, text) => { const e = Object.assign(document.createElement(tag), attrs); if (text !== undefined) e.textContent = text; return e; };
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
function toast(t) { const n = el('div', { className: 'toast' }, t); document.body.append(n); setTimeout(() => n.remove(), 6000); }
const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' days ago'; };
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

async function sendToWrite(text, id) { // id null = new document
  const W = window.SMA_write, apps = window.SMA_apps; if (!W) throw new Error('Sudo Write Stuff is not ready yet.');
  if (id) { const r = await window.SMA.store.get(id); if (!r) throw new Error('That document could not be found.'); W.load(r.data); W.setPid(r.id); }
  else { W.reset(); W.setName('Text grab ' + stamp()); }
  apps.choose('write'); W.append(text); W.show();
  return W.getName();
}

let dlg = null;
function showResult(res, opts = {}) {
  if (dlg) dlg.remove();
  dlg = el('dialog', { id: 'tg-dlg' });
  const ta = el('textarea', { id: 'tg-text', spellcheck: false, rows: 10, value: res.text, placeholder: 'No text was found in that area. Try again with a tighter box around the text.' });
  const info = el('p', { className: 'hint', id: 'tg-info' }, res.text ? (res.confidence == null ? 'Edit, copy or send it.' : `Read with ${res.confidence}% confidence. Fix anything wrong before you use it.`) : 'No text found.');
  const copy = el('button', { type: 'button' }, 'Copy'), keep = el('button', { type: 'button', title: 'Keep this text in Assets on the home screen for later' }, opts.saved ? 'Update asset' : 'Save to Assets'), again = el('button', { type: 'button' }, 'Grab again'), close = el('button', { type: 'button' }, 'Close');
  const send = el('button', { type: 'button', id: 'tg-send', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'Send to Write Stuff ▾'), menu = el('div', { id: 'tg-menu', role: 'menu', hidden: true });
  const wrap = el('span', { className: 'tg-wrap' }, ''); wrap.append(send, menu);
  const row = el('div', { className: 'tg-row' }); row.append(copy, keep, wrap, el('span', { className: 'sp' }), again, close);
  dlg.append(el('h3', {}, 'Text Grab'), ta, info, row); document.body.append(dlg); dlg.showModal(); ta.focus(); ta.select();
  const text = () => ta.value.trim();
  const done = m => { info.textContent = m; info.className = 'hint'; };
  copy.onclick = async () => { if (!text()) return; await ocr.copy(ta.value); done('Copied to the clipboard.'); };
  keep.onclick = async () => { if (!text()) return; const base = opts.saved ? opts.saved.name : 'Text grab ' + stamp().replace(':', '.') + '.txt';
    try { if (opts.saved) await window.SMA.delSource(opts.saved.id); const f = new File([ta.value], base, { type: 'text/plain' }); const rec = await window.SMA.addFiles([f]); opts.saved = (window.SMA.getSources().find(x => x.name === base && x.kind === 'text')) || opts.saved; keep.textContent = 'Update asset'; done('Saved to Assets as "' + base + '". Find it on the home screen under Assets.'); } catch (e) { info.textContent = clean(e); info.className = 'mh-bad'; } };
  close.onclick = () => dlg.close();
  again.onclick = () => { dlg.close(); grab(); };
  const hide = () => { menu.hidden = true; send.setAttribute('aria-expanded', 'false'); };
  const choose = async (id, label) => {
    hide(); if (!text()) return;
    try { await ocr.copy(ta.value); const name = await sendToWrite(text(), id); dlg.close(); toast(`Added to "${name}" in Sudo Write Stuff. It is also on your clipboard.`); }
    catch (e) { info.textContent = clean(e); info.className = 'mh-bad'; }
  };
  send.onclick = async () => {
    if (!menu.hidden) return hide();
    menu.textContent = ''; menu.hidden = false; send.setAttribute('aria-expanded', 'true');
    const mk = (t, sub, fn, cls) => { const b = el('button', { type: 'button', role: 'menuitem', className: cls || '' }); b.append(el('b', {}, t)); if (sub) b.append(el('small', {}, sub)); b.onclick = fn; menu.append(b); return b; };
    mk('➕ New document', 'Start a fresh page with this text', () => choose(null), 'tg-new');
    menu.append(el('div', { className: 'tg-h' }, 'Add to an existing document'));
    const hold = el('div', { className: 'tg-none' }, 'Loading…'); menu.append(hold);
    let items = []; try { items = (await window.SMA.store.list()).filter(i => i.type === 'write').sort((a, b) => b.updated - a.updated); } catch (e) {}
    hold.remove();
    if (!items.length) menu.append(el('div', { className: 'tg-none' }, 'No documents yet. Pick New document.'));
    items.slice(0, 60).forEach(i => mk(i.name || 'Untitled', ago(i.updated), () => choose(i.id)));
  };
  dlg.addEventListener('click', e => { if (!menu.hidden && !wrap.contains(e.target)) hide(); });
  dlg.addEventListener('close', () => { dlg.remove(); dlg = null; });
}

let busy = false;
async function grab(opts) {
  if (busy) return; busy = true;
  try {
    const r = await pin.start({ mode: 'text' }); if (!r || !r.dataUrl) return;
    toast('Reading the text…');
    const res = await ocr.read(r.dataUrl);
    document.querySelectorAll('.toast').forEach(n => { if (n.textContent === 'Reading the text…') n.remove(); });
    if (opts && opts.target === 'here' && res.text && document.body.classList.contains('write-mode')) { await ocr.copy(res.text); window.SMA_write.append(res.text); toast('Added to this document. It is also on your clipboard.'); }
    else showResult(res);
  } catch (e) { toast(clean(e)); } finally { busy = false; }
}
const home = el('button', { id: 'h-textgrab', title: 'Freeze the screen, drag over some text, and copy it or send it to Sudo Write Stuff' }, 'Text Grab'); $('#h-shot').after(home); home.onclick = () => grab();
const src = el('button', { id: 'srctext', title: 'Text Grab: read text from anywhere on your screen' }, '🔤 Grab text'); $('#srcshot').after(src); src.onclick = () => grab();
async function viewText(sr) { showResult({ text: await sr.blob.text(), confidence: null }, { saved: sr }); $('#tg-info').textContent = 'Saved asset "' + sr.name + '". Edit it, copy it or send it to Write Stuff.'; }
window.SMA_textgrab = { grab, showResult, sendToWrite, viewText };
})();
