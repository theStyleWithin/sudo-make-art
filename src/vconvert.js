// Convert videos: batch video conversion (desktop app). The work happens in the main process (electron/vconvert.js).
(() => {
'use strict';
const api = window.sma && window.sma.vconvert, $ = s => document.querySelector(s);
if (!api) return;
$('#mode-vconvert').hidden = false; $('#h-vconvert').hidden = false; $('#h-vconvert').onclick = () => window.SMA.setMode('vconvert');

// quality range per format: [default, min, max] (lower = better picture)
const CRF = { 'mp4-h264': [23, 14, 35], 'mp4-h265': [28, 18, 40], 'mkv-h265': [28, 18, 40], 'webm-vp9': [32, 20, 45], 'webm-av1': [34, 22, 50] };
let items = [], others = [], dirs = [], outDir = null, running = false, started = 0, seq = 0, tools = null;
const byId = new Map(), rows = new Map();
const fmt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const FIELDS = ['preset', 'effort', 'height', 'audio', 'conflict', 'threads'], CHECKS = ['smart', 'inplace', 'others', 'times', 'hw'];
function saveOpts() { try { const o = {}; FIELDS.forEach(k => { o[k] = $('#vc-' + k).value; }); CHECKS.forEach(k => { o[k] = $('#vc-' + k).checked; }); o.crf = $('#vc-crf').value; localStorage.setItem('sma-vconvert', JSON.stringify(o)); } catch (e) {} }
function loadOpts() { try { const o = JSON.parse(localStorage.getItem('sma-vconvert') || '{}'); FIELDS.forEach(k => { if (o[k] !== undefined) $('#vc-' + k).value = o[k]; }); CHECKS.forEach(k => { if (o[k] !== undefined) $('#vc-' + k).checked = o[k]; }); setCrfRange(); if (o.crf) $('#vc-crf').value = o.crf; } catch (e) {} }
function setCrfRange(reset) { const r = CRF[$('#vc-preset').value]; if (!r) return; const q = $('#vc-crf'); q.min = r[1]; q.max = r[2]; if (reset) q.value = r[0]; }

function sync() {
  const p = $('#vc-preset').value, remux = p.endsWith('remux'), audioOnly = p === 'audio-mp3', enc = !remux && !audioOnly;
  $('#vc-qrow').hidden = !enc; $('#vc-erow').hidden = !enc; $('#vc-hrow').hidden = !enc; $('#vc-arow').hidden = remux || p.startsWith('webm') || audioOnly;
  $('#vc-hwrow').hidden = !(enc && tools && (p.includes('h264') || p.includes('h265')) && tools.hw.nvenc[p.includes('h264') ? 'h264' : 'hevc']);
  $('#vc-qout').textContent = $('#vc-crf').value;
  $('#vc-outbtn').textContent = outDir ? outDir : ($('#vc-inplace').checked ? 'Next to the originals' : 'Ask me when I start'); $('#vc-outclear').hidden = !outDir; $('#vc-outbtn').disabled = $('#vc-inplace').checked;
  $('#vc-others').disabled = $('#vc-inplace').checked;
  const oc = others.length;
  $('#vc-count').textContent = items.length ? `${items.length} video${items.length === 1 ? '' : 's'}, ${fmt(items.reduce((s, i) => s + i.size, 0))}` + (oc && $('#vc-others').checked && !$('#vc-inplace').checked ? ` + ${oc} other file${oc === 1 ? '' : 's'}` : '') : '';
  $('#vc-hint').textContent = p.startsWith('mp4') && !remux ? 'MP4 keeps the video and audio but leaves out embedded subtitles. Use MKV to keep them (or tick “Copy subtitles…” for .srt files that sit next to the video).' : p === 'webm-av1' ? 'AV1 gives the smallest files but is very slow on a processor.' : '';
  $('#vc-go').disabled = running || !items.length;
}
['vc-preset'].forEach(id => { $('#' + id).onchange = () => { setCrfRange(true); sync(); saveOpts(); }; });
['vc-crf', 'vc-effort', 'vc-height', 'vc-audio', 'vc-smart', 'vc-inplace', 'vc-others', 'vc-conflict', 'vc-times', 'vc-threads', 'vc-hw'].forEach(id => { $('#' + id).oninput = () => { sync(); saveOpts(); }; });

// ---------- the list ----------
function add(r) {
  const have = new Set(items.map(i => i.path)); let added = 0;
  for (const f of r.videos) { if (have.has(f.path)) continue; const it = { id: 'v' + (++seq), path: f.path, rel: f.rel, size: f.size, status: 'queued' }; items.push(it); byId.set(it.id, it); added++; }
  const haveO = new Set(others.map(i => i.path)); for (const f of r.others) if (!haveO.has(f.path)) others.push({ id: 'o' + (++seq), path: f.path, rel: f.rel, size: f.size, status: 'queued' });
  const haveD = new Set(dirs); for (const d of r.dirs) if (!haveD.has(d)) dirs.push(d);
  renderList(); sync(); if (!running) $('#vc-stat').textContent = added ? `Added ${added} video${added === 1 ? '' : 's'}.` : 'No new videos found there.';
}
function rowText(it) {
  switch (it.status) {
    case 'working': return [`Converting… ${it.pct || 0}%`, 'wk'];
    case 'done': return it.copied ? ['Copied: ' + (it.note || 'as it is'), 'ok'] : [`${fmt(it.outSize)}  (${it.inSize ? Math.abs(Math.round(100 - 100 * it.outSize / it.inSize)) : 0}% ${it.outSize <= it.inSize ? 'smaller' : 'larger'})${it.note ? ' · ' + it.note : ''}`, 'ok'];
    case 'skipped': return ['Skipped: ' + (it.note || ''), 'sk']; case 'failed': return ['Failed: ' + it.error, 'bad']; case 'cancelled': return ['Cancelled', 'sk']; default: return ['Waiting', 'sk'];
  }
}
function paintRow(it) { const r = rows.get(it.id); if (!r) return; const [t, c] = rowText(it); r.st.textContent = t; r.st.className = 'st ' + c; r.st.title = t; }
function renderList() {
  const box = $('#vc-list'); box.textContent = ''; rows.clear();
  if (!items.length) { box.append(el('div', { className: 'empty' }, 'Drop videos or whole folders here\nEvery video inside a folder is found for you,\nand the folder layout is kept in the output.')); box.firstChild.style.whiteSpace = 'pre-line'; return; }
  items.slice(0, 1500).forEach(it => {
    const r = el('div', { className: 'cv-row vc' }), nm = el('div', { className: 'nm2', title: it.path }, it.rel), sz = el('div', { className: 'sz' }, fmt(it.size)), st = el('div', { className: 'st' });
    r.append(nm, sz, st); box.append(r); rows.set(it.id, { st }); paintRow(it);
  });
  if (items.length > 1500) box.append(el('div', { className: 'hint', style: 'padding:8px' }, `…and ${items.length - 1500} more (all of them will be converted).`));
}
$('#vc-addfiles').onclick = async () => add(await api.pickFiles());
$('#vc-addfolder').onclick = async () => add(await api.pickFolder());
$('#vc-clear').onclick = () => { if (running) return; items = []; others = []; dirs = []; byId.clear(); renderList(); sync(); $('#vc-stat').textContent = 'Add some videos or a folder to begin.'; $('#vc-prog').value = 0; };
const drop = $('#vc-drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const paths = [...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean); if (paths.length) add(await api.expand(paths)); });

$('#vc-outbtn').onclick = async () => { const d = await api.pickOutput(); if (d) { outDir = d; sync(); } };
$('#vc-outclear').onclick = () => { outDir = null; sync(); };

// ---------- running ----------
const offs = [];
$('#vc-go').onclick = async () => {
  if (running || !items.length) return;
  const inplace = $('#vc-inplace').checked;
  if (!inplace && !outDir) { const d = await api.pickOutput(); if (!d) { $('#vc-stat').textContent = 'Choose an output folder to start.'; return; } outDir = d; sync(); }
  if ($('#vc-delete').checked && !confirm('After each video is converted and looks complete, the ORIGINAL will be moved to your trash. You can still restore it from there. Continue?')) return;
  const todo = items.slice(); todo.forEach(i => { i.status = 'queued'; i.pct = 0; delete i.error; delete i.note; delete i.copied; paintRow(i); });
  const copyOthers = $('#vc-others').checked && !inplace;
  const spec = { preset: $('#vc-preset').value, crf: +$('#vc-crf').value, effort: +$('#vc-effort').value, maxHeight: +$('#vc-height').value, audio: $('#vc-audio').value, smart: $('#vc-smart').checked, hw: $('#vc-hw').checked && !$('#vc-hwrow').hidden,
    outDir: inplace ? null : outDir, conflict: $('#vc-conflict').value, keepTimes: $('#vc-times').checked, deleteOriginal: $('#vc-delete').checked, threads: +$('#vc-threads').value,
    items: todo.map(i => ({ id: i.id, path: i.path, rel: i.rel })), others: copyOthers ? others.map(o => ({ id: o.id, path: o.path, rel: o.rel })) : [], dirs: inplace ? [] : dirs };
  running = true; started = Date.now(); let finished = 0; const total = todo.length; $('#vc-go').hidden = true; $('#vc-cancel').hidden = false; $('#vc-prog').max = total; $('#vc-prog').value = 0; sync();
  offs.forEach(o => o()); offs.length = 0;
  offs.push(api.onProgress(d => {
    const it = byId.get(d.id); if (!it) return; // sidecar files have no row
    it.status = d.status; it.pct = d.pct; it.outSize = d.outSize; it.inSize = d.inSize; it.error = d.error; it.note = d.note; it.copied = d.copied; paintRow(it);
    if (d.status !== 'working') { finished++; $('#vc-prog').value = finished; $('#vc-stat').textContent = `${finished} of ${total} done`; }
    else { $('#vc-prog').value = finished + (d.pct || 0) / 100; const el2 = (Date.now() - started) / 1000, f = finished + (d.pct || 0) / 100; if (f > 0.05 && el2 > 5) { const eta = Math.round(el2 / f * (total - f)); $('#vc-stat').textContent = `${finished} of ${total} done, about ${eta >= 3600 ? (eta / 3600).toFixed(1) + ' h' : eta >= 60 ? Math.round(eta / 60) + ' min' : eta + ' s'} left`; } }
  }));
  offs.push(api.onFinished(d => {
    running = false; $('#vc-go').hidden = false; $('#vc-cancel').hidden = true; sync();
    const saved = d.inBytes - d.outBytes;
    $('#vc-stat').textContent = (d.cancelled ? 'Cancelled. ' : 'Finished. ') + `${d.done} done` + (d.copied ? ` (${d.copied} copied as they were)` : '') + (d.skipped ? `, ${d.skipped} skipped` : '') + (d.failed ? `, ${d.failed} failed` : '') + (d.others ? `, ${d.others} other file${d.others === 1 ? '' : 's'} copied` : '') + (d.inBytes ? `. ${saved >= 0 ? 'Saved' : 'Grew by'} ${fmt(Math.abs(saved))}.` : '.');
    items.forEach(i => { if (i.status === 'queued' || i.status === 'working') { i.status = 'cancelled'; paintRow(i); } });
    if (d.outDir && !d.cancelled) api.reveal(d.outDir);
  }));
  $('#vc-stat').textContent = 'Starting…';
  try { await api.start(spec); } catch (e) { running = false; $('#vc-go').hidden = false; $('#vc-cancel').hidden = true; sync(); $('#vc-stat').textContent = clean(e); }
};
$('#vc-cancel').onclick = () => api.cancel();

api.tools().then(t => { tools = t; sync(); }).catch(() => {});
loadOpts(); sync(); renderList();
})();
