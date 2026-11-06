// Model library: search GGUF image/video models on Hugging Face and download one into the models folder, with checks (desktop app).
(() => {
'use strict';
const api = window.sma && window.sma.modelhub; if (!api) return;
const $ = s => document.querySelector(s), dlg = $('#mhdlg');
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const gb = n => n >= 1 << 30 ? (n / (1 << 30)).toFixed(2) + ' GB' : (n / (1 << 20)).toFixed(0) + ' MB';
const CHIPS = { image: ['flux', 'stable-diffusion', 'sdxl', 'sd3', 'qwen-image'], video: ['wan', 'ltx', 'hunyuan', 'cogvideo'] };
let kind = 'image', current = null, busy = false;

function chips() { const box = $('#mh-chips'); box.textContent = ''; CHIPS[kind].forEach(c => { const b = el('button', { type: 'button' }, c); b.onclick = () => { $('#mh-q').value = c; search(); }; box.append(b); }); }
document.querySelectorAll('.mh-tabs button').forEach(b => b.onclick = () => { kind = b.dataset.kind; document.querySelectorAll('.mh-tabs button').forEach(x => x.classList.toggle('on', x === b)); chips(); search(); });
$('#mh-go').onclick = () => search(); $('#mh-q').onkeydown = e => { if (e.key === 'Enter') search(); };

async function search() {
  const list = $('#mh-list'); list.textContent = ''; list.append(el('p', { className: 'hint' }, 'Searching…'));
  try {
    const r = await api.search($('#mh-q').value, kind); list.textContent = '';
    if (!r.length) { list.append(el('p', { className: 'hint' }, 'Nothing found. Try another word.')); return; }
    r.forEach(m => { const row = el('div', { className: 'mh-item' + (current === m.id ? ' on' : '') }), t = el('b', {}, m.id);
      row.append(t, el('small', {}, `${m.license} · ↓ ${m.downloads.toLocaleString()} · ♥ ${m.likes.toLocaleString()}${m.gated ? ' · needs an account' : ''}`)); row.onclick = () => { current = m.id; list.querySelectorAll('.mh-item').forEach(x => x.classList.toggle('on', x === row)); detail(m); }; list.append(row); });
  } catch (e) { list.textContent = ''; list.append(el('p', { className: 'mh-bad' }, clean(e))); }
}

async function detail(m) {
  const box = $('#mh-detail'); box.textContent = ''; box.append(el('p', { className: 'hint' }, 'Looking up the files…'));
  let info; try { info = await api.files(m.id, kind); } catch (e) { box.textContent = ''; box.append(el('p', { className: 'mh-bad' }, clean(e))); return; }
  box.textContent = ''; const page = el('button', { type: 'button' }, 'Model page ↗'); page.onclick = () => api.open('https://huggingface.co/' + m.id);
  box.append(el('h3', {}, m.id), el('div', { className: 'mh-meta' }, ''), el('p', { className: 'hint' }, `Licence: ${info.license}. Read the licence on the model page before you use a model, especially for anything you publish or sell.`));
  box.querySelector('.mh-meta').append(page);
  if (info.gated) box.append(el('p', { className: 'mh-bad' }, 'This model is gated: you must accept its licence on its page and sign in. This app cannot do that for you, so it cannot download it.'));
  box.append(el('p', { className: 'hint' }, 'Many image and video models also need extra files (a VAE and text encoders). The model page says which; add their paths under “Extra engine arguments” in the AI tool.'));
  if (info.ignored) box.append(el('p', { className: 'hint' }, `${info.ignored} older-style file(s) (.ckpt / .pt / .bin) in this repository are hidden on purpose: those formats can run code when loaded. Only GGUF files are offered.`));
  if (!info.files.length) { box.append(el('p', { className: 'hint' }, 'No downloadable GGUF files in this model.')); return; }
  const h = info.hardware, files = el('div', { className: 'mh-files' }), rows = {};
  box.append(el('p', { className: 'mh-hw' }, 'Your PC: ' + (h.gpu ? `${h.gpu.name}, ${(h.gpu.vramMB / 1024).toFixed(0)} GB video memory (${(h.gpu.freeMB / 1024).toFixed(1)} GB free)` : 'no supported graphics card found (it will run on the processor)') + `, ${(h.ramMB / 1024).toFixed(0)} GB RAM, ${h.cores} cores.`));
  const best = info.files.find(f => f.name === info.best);
  if (best && !info.gated) { const pick = el('button', { type: 'button', className: 'pri' }, 'Pick the best for my PC: ' + best.name); pick.onclick = () => safety(rows[best.name], m.id, best); box.append(pick); }
  else if (!best) box.append(el('p', { className: 'mh-bad' }, 'None of these files is likely to run well on this PC. The smallest one is the best chance; expect it to be very slow.'));
  box.append(files);
  const LABEL = { comfortable: ['Comfortable', 'ok'], slow: ['Slow, uses RAM', 'mid'], cpu: ['Processor only, slow', 'mid'], heavy: ['Too heavy', 'bad'] };
  info.files.forEach(f => { const row = el('div', { className: 'mh-file' }), name = el('span', { className: 'mh-fn', title: f.name }, f.name), size = el('span', { className: 'mh-sz' }, gb(f.size)), b = el('button', { type: 'button', disabled: info.gated }, 'Get…');
    const [txt, cls] = LABEL[f.fit] || ['', ''], badge = el('span', { className: 'mh-fit ' + cls }, (f.name === info.best ? '★ Best for your PC · ' : '') + txt);
    b.onclick = () => safety(row, m.id, f); row.append(name, size, badge, b); files.append(row); rows[f.name] = row; });
}

async function safety(row, repo, f) {
  document.querySelectorAll('.mh-safe').forEach(x => x.remove()); const box = el('div', { className: 'mh-safe' }); row.after(box); box.textContent = 'Looking up the file…';
  let p; try { p = await api.plan(repo, f.name); } catch (e) { box.textContent = ''; box.append(el('p', { className: 'mh-bad' }, clean(e))); return; }
  const hasClam = await api.clam(); box.textContent = '';
  box.append(el('b', {}, 'Before you download anything'), el('p', {}, `${p.file} · ${gb(p.size)} · licence: ${p.license}`), el('p', { className: 'mh-url' }, p.url),
    el('p', { className: 'hint' }, `Hugging Face publishes this SHA-256 for the file: ${p.sha256}`),
    el('p', { className: 'hint' }, 'The app only downloads GGUF files from Hugging Face’s own servers, and keeps the file under a temporary name until it has checked the size, the SHA-256 above, and that the file is a well-formed GGUF. ' + (hasClam ? 'ClamAV is installed, so it will scan the file as well.' : 'ClamAV is not installed, so there will be no antivirus scan (you can install ClamAV to add one).')));
  const acts = el('div', { className: 'mh-actions' }), vt = el('button', { type: 'button' }, 'Check on VirusTotal ↗'), page = el('button', { type: 'button' }, 'Model page ↗'), go = el('button', { type: 'button', className: 'pri' }, 'Download and check'), no = el('button', { type: 'button' }, 'Cancel');
  vt.onclick = () => api.open(p.virusTotal); page.onclick = () => api.open(p.page); no.onclick = () => box.remove(); acts.append(vt, page, go, no); box.append(acts, el('p', { className: 'hint' }, 'VirusTotal looks the file up by its SHA-256, so nothing is uploaded. It may not know very large model files, and “not found” is normal; VirusTotal does not scan files this big.'));
  go.onclick = () => start(box, p);
}

let off = null;
async function start(box, p) {
  if (busy) return; busy = true; box.textContent = ''; const bar = el('progress', { max: 1, value: 0 }), msg = el('div', { className: 'hint' }, 'Starting…'), stop = el('button', { type: 'button' }, 'Cancel'); box.append(el('b', {}, 'Downloading ' + p.file), bar, msg, stop); stop.onclick = () => api.cancel();
  off?.(); let t0 = Date.now();
  off = api.onProgress(d => { if (d.file !== p.file) return;
    if (d.phase === 'download') { bar.value = d.got / d.total; const sec = (Date.now() - t0) / 1000; msg.textContent = `${gb(d.got)} of ${gb(d.total)} · ${(d.got / 1048576 / Math.max(sec, 1)).toFixed(1)} MB/s`; }
    else if (d.phase === 'inspect') msg.textContent = 'Checking that it is a well-formed model file…'; else if (d.phase === 'scan') msg.textContent = 'Scanning with ClamAV…'; });
  try {
    const r = await api.download(p.repo, p.file); box.textContent = '';
    box.append(el('b', {}, 'Checks passed and saved'), ...r.checks.map(c => el('div', { className: 'mh-ok' }, '✓ ' + c)), el('p', {}, `Saved as “${r.name}” in your models folder. It is now in the AI tool’s model list.`));
    document.dispatchEvent(new CustomEvent('sma-models', { detail: r.name }));
  } catch (e) { box.textContent = ''; box.append(el('p', { className: 'mh-bad' }, '✗ ' + clean(e)), el('p', { className: 'hint' }, 'Nothing was kept or added.')); }
  finally { busy = false; off?.(); off = null; }
}

$('#mh-close').onclick = () => dlg.close();
window.SMA_MODELHUB = { open() { dlg.showModal(); if (!$('#mh-list').children.length) { chips(); search(); } } };
})();
