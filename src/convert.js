// Convert tab: batch image conversion (desktop app). The work happens in the main process (electron/convert.js).
(() => {
'use strict';
const api = window.sma && window.sma.convert, $ = s => document.querySelector(s);
if (!api) return;
$('#mode-convert').hidden = false; $('#h-convert').hidden = false; $('#h-convert').onclick = () => window.SMA.setMode('convert');

const DEFAULT_Q = { jxl: 80, avif: 65, webp: 80, jpeg: 85, png: 80 };
let items = [], outDir = null, running = false, started = 0, tools = null, seq = 0;
const byId = new Map(), rows = new Map();

const fmt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});

// ---------- remembered settings ----------
const FIELDS = ['format', 'quality', 'effort', 'ds', 'ds1', 'ds2', 'conflict', 'threads'], CHECKS = ['lossless', 'transcode', 'times', 'delete'];
function saveOpts() { try { const o = {}; FIELDS.forEach(k => { o[k] = $('#cv-' + k).value; }); CHECKS.forEach(k => { o[k] = $('#cv-' + k).checked; }); o.delete = false; localStorage.setItem('sma-convert', JSON.stringify(o)); } catch (e) {} } // never remember "delete originals"
function loadOpts() { try { const o = JSON.parse(localStorage.getItem('sma-convert') || '{}'); FIELDS.forEach(k => { if (o[k] !== undefined) $('#cv-' + k).value = o[k]; }); CHECKS.forEach(k => { if (o[k] !== undefined) $('#cv-' + k).checked = o[k]; }); } catch (e) {} }

// ---------- option visibility ----------
function sync() {
  const f = $('#cv-format').value;
  $('#cv-qrow').hidden = f === 'png'; $('#cv-lossrow').hidden = !['jxl', 'webp', 'avif'].includes(f); $('#cv-trrow').hidden = f !== 'jxl';
  $('#cv-effrow').hidden = f === 'jpeg';
  const ds = $('#cv-ds').value; $('#cv-dsrow').hidden = ds === 'none'; $('#cv-ds2').hidden = ds !== 'resolution';
  $('#cv-ds1').title = { percent: 'Percent (1-100)', resolution: 'Width', shortest: 'Pixels', longest: 'Pixels', megapixels: 'Megapixels (for example 2)' }[ds] || '';
  $('#cv-qout').textContent = $('#cv-quality').value; $('#cv-eout').textContent = $('#cv-effort').value;
  $('#cv-quality').disabled = $('#cv-lossless').checked && !$('#cv-lossrow').hidden;
  $('#cv-outbtn').textContent = outDir ? outDir : 'Same folder as the original'; $('#cv-outclear').hidden = !outDir;
  $('#cv-count').textContent = items.length ? `${items.length} file${items.length === 1 ? '' : 's'}, ${fmt(items.reduce((s, i) => s + i.size, 0))}` : '';
  $('#cv-go').disabled = running || !items.length;
}
$('#cv-format').onchange = () => { $('#cv-quality').value = DEFAULT_Q[$('#cv-format').value]; sync(); saveOpts(); };
['cv-quality', 'cv-effort', 'cv-ds', 'cv-ds1', 'cv-ds2', 'cv-lossless', 'cv-transcode', 'cv-conflict', 'cv-times', 'cv-threads'].forEach(id => { $('#' + id).oninput = () => { sync(); saveOpts(); }; });

// ---------- the file list ----------
function addItems(list) {
  const have = new Set(items.map(i => i.path)); let added = 0;
  for (const f of list) { if (have.has(f.path)) continue; const it = { id: 'i' + (++seq), path: f.path, rel: f.rel, size: f.size, status: 'queued' }; items.push(it); byId.set(it.id, it); added++; }
  renderList(); sync(); if (!running) $('#cv-stat').textContent = added ? `Added ${added} file${added === 1 ? '' : 's'}.` : 'Those files are already in the list.';
}
function rowText(it) {
  switch (it.status) {
    case 'working': return ['Converting…', 'wk']; case 'done': return [`${fmt(it.outSize)}  (${it.inSize ? Math.abs(Math.round(100 - 100 * it.outSize / it.inSize)) : 0}% ${it.outSize <= it.inSize ? 'smaller' : 'larger'})`, 'ok'];
    case 'skipped': return ['Skipped: ' + (it.note || ''), 'sk']; case 'failed': return ['Failed: ' + it.error, 'bad']; case 'cancelled': return ['Cancelled', 'sk']; default: return ['Waiting', 'sk'];
  }
}
function paintRow(it) { const r = rows.get(it.id); if (!r) return; const [t, c] = rowText(it); r.st.textContent = t; r.st.className = 'st ' + c; r.st.title = t; }
function renderList() {
  const box = $('#cv-list'); box.textContent = ''; rows.clear();
  if (!items.length) { box.append(el('div', { className: 'empty' }, 'Drop images or folders here\nJPEG, PNG, WebP, AVIF, JPEG XL, GIF, BMP, TIFF')); box.firstChild.style.whiteSpace = 'pre-line'; return; }
  items.slice(0, 1500).forEach(it => {
    const r = el('div', { className: 'cv-row' }), nm = el('div', { className: 'nm2', title: it.path }, it.rel), sz = el('div', { className: 'sz' }, fmt(it.size)), st = el('div', { className: 'st' });
    r.append(nm, sz, st); box.append(r); rows.set(it.id, { st }); paintRow(it);
  });
  if (items.length > 1500) box.append(el('div', { className: 'hint', style: 'padding:8px' }, `…and ${items.length - 1500} more (all of them will be converted).`));
}
$('#cv-addfiles').onclick = async () => addItems(await api.pickFiles());
$('#cv-addfolder').onclick = async () => addItems(await api.pickFolder());
$('#cv-clear').onclick = () => { if (running) return; items = []; byId.clear(); renderList(); sync(); $('#cv-stat').textContent = 'Add some images to begin.'; $('#cv-prog').value = 0; };
const drop = $('#cv-drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const paths = [...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean); if (paths.length) addItems(await api.expand(paths)); });

// ---------- output folder ----------
$('#cv-outbtn').onclick = async () => { const d = await api.pickOutput(); if (d) { outDir = d; sync(); } };
$('#cv-outclear').onclick = () => { outDir = null; sync(); };

// ---------- tools ----------
async function renderTools() {
  tools = await api.tools(); const box = $('#cv-tools'); box.textContent = '';
  const row = (label, path, name, hint) => { const r = el('div', { className: 'tl' }); r.append(el('span', {}, label), el('code', { title: path || hint || '' }, path ? path : 'not found')); if (name) { const b = el('button', {}, 'Choose…'); b.onclick = async () => { tools = await api.setTool(name); renderTools(); }; r.append(b); } box.append(r); };
  row('FFmpeg (WebP, AVIF, PNG, JPEG)', tools.ffmpeg ? 'built in' : null);
  row('cjxl (JPEG XL)', tools.cjxl, 'cjxl', 'Install libjxl'); row('djxl (read JPEG XL)', tools.djxl, 'djxl'); row('cjpegli (better JPEGs)', tools.cjpegli, 'cjpegli');
  if (!tools.cjxl) box.append(el('p', { className: 'hint' }, 'JPEG XL needs libjxl. The downloads from the Releases page include it. Otherwise install it (Arch: libjxl, Debian/Ubuntu: libjxl-tools, Fedora: libjxl-utils) or choose cjxl above.'));
  $('#cv-threads').max = tools.cores; if (!localStorage.getItem('sma-convert')) $('#cv-threads').value = Math.max(1, Math.min(4, tools.cores - 1));
}

// ---------- running ----------
const offs = [];
$('#cv-go').onclick = async () => {
  if (running || !items.length) return;
  if (!tools) await renderTools();
  const f = $('#cv-format').value;
  if (f === 'jxl' && !tools.cjxl) { $('#cv-stat').textContent = 'JPEG XL needs cjxl (libjxl). Open Tools below to set it up.'; $('#cv-toolsbox').open = true; return; }
  if ($('#cv-delete').checked && !confirm('After each file is converted, the ORIGINAL will be moved to your trash. You can still restore it from there. Continue?')) return;
  const todo = items.slice(); // everything in the list, so a second run with other settings works; existing files are handled by the "if a file already exists" choice
  todo.forEach(i => { i.status = 'queued'; delete i.error; delete i.note; paintRow(i); });
  const ds = $('#cv-ds').value;
  const spec = { format: f, quality: +$('#cv-quality').value, effort: +$('#cv-effort').value, lossless: $('#cv-lossless').checked && !$('#cv-lossrow').hidden, transcode: $('#cv-transcode').checked,
    downscale: { mode: ds, value: +$('#cv-ds1').value, value2: +$('#cv-ds2').value }, outDir, conflict: $('#cv-conflict').value, keepTimes: $('#cv-times').checked, deleteOriginal: $('#cv-delete').checked,
    threads: +$('#cv-threads').value, items: todo.map(i => ({ id: i.id, path: i.path, rel: i.rel })) };
  running = true; started = Date.now(); let finished = 0; const total = todo.length; $('#cv-go').hidden = true; $('#cv-cancel').hidden = false; $('#cv-prog').max = total; $('#cv-prog').value = 0; sync();
  offs.forEach(o => o()); offs.length = 0;
  offs.push(api.onProgress(d => {
    const it = byId.get(d.id); if (!it) return; it.status = d.status; it.outSize = d.outSize; it.inSize = d.inSize; it.error = d.error; it.note = d.note; paintRow(it);
    if (d.status !== 'working') { finished++; $('#cv-prog').value = finished; const left = total - finished, el2 = (Date.now() - started) / 1000, eta = finished ? Math.round(el2 / finished * left) : 0;
      $('#cv-stat').textContent = `${finished} of ${total} done` + (left ? `, about ${eta >= 60 ? Math.round(eta / 60) + ' min' : eta + ' s'} left` : ''); }
  }));
  offs.push(api.onFinished(d => {
    running = false; $('#cv-go').hidden = false; $('#cv-cancel').hidden = true; sync();
    const saved = d.inBytes - d.outBytes;
    $('#cv-stat').textContent = (d.cancelled ? 'Cancelled. ' : 'Finished. ') + `${d.done} converted` + (d.skipped ? `, ${d.skipped} skipped` : '') + (d.failed ? `, ${d.failed} failed` : '') + (d.done ? `. ${saved >= 0 ? 'Saved' : 'Grew by'} ${fmt(Math.abs(saved))} (${d.inBytes ? Math.round(100 * Math.abs(saved) / d.inBytes) : 0}%).` : '.');
    items.forEach(i => { if (i.status === 'queued' || i.status === 'working') { i.status = 'cancelled'; paintRow(i); } });
  }));
  $('#cv-stat').textContent = 'Starting…';
  try { await api.start(spec); } catch (e) { running = false; $('#cv-go').hidden = false; $('#cv-cancel').hidden = true; sync(); $('#cv-stat').textContent = String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
};
$('#cv-cancel').onclick = () => api.cancel();

loadOpts(); sync(); renderList(); renderTools();
document.addEventListener('sma-mode', ev => { if (ev.detail === 'convert') renderTools(); });
})();
