// Local AI image generation / editing UI. Talks to the desktop app's engine bridge (window.sma.ai). Hidden on Android.
(() => {
'use strict';
const api = window.sma && window.sma.ai, SMA = window.SMA;
if (!api || !SMA) return;
const $ = s => document.querySelector(s);
const dlg = $('#aidlg'); let jobId = null, lastBlob = null, lastKind = 'image', offProg = null;

$('#tool-ai').hidden = false;
$('#tool-ai').onclick = async () => { dlg.showModal(); await refresh(); };
$('#ai-close').onclick = () => dlg.close();
$('#ai-folder').onclick = () => api.openModels();
$('#ai-mode').onchange = () => { const m = $('#ai-mode').value; $('#ai-strwrap').hidden = m !== 'edit'; $('#ai-framewrap').hidden = m !== 'video'; showPlan(); };

const txt = (n, t) => Object.assign(document.createElement(n), { textContent: t });
async function refresh() {
  const { models } = await api.models(), sel = $('#ai-model'), keep = sel.value; sel.textContent = '';
  models.forEach(m => sel.add(new Option(`${m.name} (${(m.bytes / 1073741824).toFixed(1)} GB)`, m.name)));
  if (!models.length) sel.add(new Option('No models yet: open the models folder and add one', ''));
  if (keep) sel.value = keep;
  await renderEngines(await api.settings()); await showPlan();
}
async function renderEngines(s) {
  const box = $('#ai-engines'); box.textContent = '';
  [['cuda', 'NVIDIA (CUDA) engine'], ['vulkan', 'Vulkan engine (AMD/Intel/NVIDIA)'], ['cpu', 'CPU engine (no GPU needed)']].forEach(([k, label]) => {
    const r = document.createElement('div'); r.className = 'eng'; r.append(txt('span', label), Object.assign(txt('code', s.engines[k] || 'not set'), { title: s.engines[k] || '' }));
    const set = txt('button', 'Choose…'); set.onclick = async () => { await renderEngines(await api.chooseEngine(k)); showPlan(); };
    r.append(set);
    if (s.engines[k]) { const c = txt('button', 'Clear'); c.onclick = async () => { await renderEngines(await api.clearEngine(k)); showPlan(); }; r.append(c); }
    box.append(r);
  });
}
const size = () => $('#ai-size').value.split('x').map(Number);
async function showPlan() {
  const box = $('#ai-plan'); const model = $('#ai-model').value;
  if (!model) { box.textContent = 'Add a model file to the models folder to begin. Models and engines are not included; you choose and download your own.'; return; }
  try {
    const [width, height] = size(), p = await api.plan({ model, width, height, video: $('#ai-mode').value === 'video', frames: +$('#ai-frames').value });
    const hw = await api.hardware();
    box.textContent = '';
    box.append(txt('div', hw.gpu ? `GPU: ${hw.gpu.name}, ${hw.gpu.vramFree} of ${hw.gpu.vramTotal} MB free · RAM free: ${hw.ramFree} MB` : `No NVIDIA GPU detected · RAM free: ${hw.ramFree} MB`));
    p.notes.forEach(n => box.append(txt('div', '• ' + n)));
  } catch (e) { box.textContent = e.message; }
}
$('#ai-model').onchange = $('#ai-size').onchange = showPlan;

async function initImage(w, h) { // selected image, resized to the generation size
  const img = SMA.selectedImage(); if (!img) throw new Error('Select an image in the design first.');
  const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = img.src; });
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(el, 0, 0, w, h);
  return new Promise(res => c.toBlob(b => b.arrayBuffer().then(res), 'image/png'));
}
function setBusy(b) { $('#ai-go').hidden = b; $('#ai-cancel').hidden = !b; $('#ai-prog').hidden = !b; if (b) $('#ai-prog').removeAttribute('value'); }
let busy = false;
const generate = async () => {
  if (busy) return; busy = true;
  $('#ai-err').textContent = ''; const [width, height] = size(), edit = $('#ai-mode').value === 'edit', video = $('#ai-mode').value === 'video';
  if (!$('#ai-prompt').value.trim()) { $('#ai-err').textContent = 'Write a prompt first.'; busy = false; return; }
  if (!$('#ai-model').value) { $('#ai-err').textContent = 'Choose a model.'; busy = false; return; }
  setBusy(true); offProg?.();
  const off1 = api.onStarted(d => { jobId = d.id; }), off2 = api.onProgress(d => { const p = $('#ai-prog'); p.max = d.total; p.value = d.step; });
  offProg = () => { off1(); off2(); };
  try {
    const r = await api.generate({ model: $('#ai-model').value, prompt: $('#ai-prompt').value, negative: $('#ai-neg').value, width, height,
      steps: +$('#ai-steps').value, cfg: +$('#ai-cfg').value, seed: +$('#ai-seed').value, extraArgs: $('#ai-extra').value,
      init: edit ? await initImage(width, height) : undefined, strength: +$('#ai-strength').value, video, frames: +$('#ai-frames').value });
    const isVid = !!r.video; lastBlob = new Blob([isVid ? r.video : r.image], { type: isVid ? 'video/mp4' : 'image/png' }); lastKind = isVid ? 'video' : 'image';
    const u = URL.createObjectURL(lastBlob); $('#ai-img').hidden = isVid; $('#ai-vid').hidden = !isVid; (isVid ? $('#ai-vid') : $('#ai-img')).src = u; $('#ai-add').disabled = isVid; $('#ai-src').disabled = false;
  } catch (e) { $('#ai-err').textContent = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  finally { busy = false; setBusy(false); offProg?.(); offProg = null; jobId = null; }
};
$('#ai-go').onclick = generate;
$('#ai-cancel').onclick = () => { if (jobId) api.cancel(jobId); };
$('#ai-add').onclick = () => { if (lastBlob) { SMA.addImageBlob(lastBlob); dlg.close(); } };
$('#ai-src').onclick = () => { if (lastBlob) SMA.addFiles([new File([lastBlob], 'ai-' + Date.now() + (lastKind === 'video' ? '.mp4' : '.png'), { type: lastKind === 'video' ? 'video/mp4' : 'image/png' })]); };

// ----- "sudo make art" quick start -----
// A plain text box, never run as a command. It only ever holds the phrase below (or the start of it); anything else is refused.
const PHRASE = 'sudo make art', cmd = $('#ai-cmd'); let okValue = '';
const norm = s => s.toLowerCase().replace(/\s+/g, ' ');
const refuse = () => { cmd.classList.remove('no'); void cmd.offsetWidth; cmd.classList.add('no'); $('#ai-err').textContent = 'That box only accepts the words: sudo make art'; };
cmd.addEventListener('input', () => {
  const v = cmd.value;
  if (norm(v) === '' || PHRASE.startsWith(norm(v))) { okValue = v; $('#ai-err').textContent = ''; cmd.classList.remove('no'); } // still on the way to the phrase
  else { cmd.value = okValue; refuse(); } // not part of the phrase: put back what was there before
});
cmd.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return; ev.preventDefault();
  if (norm(cmd.value).trim() === PHRASE) { cmd.value = okValue = ''; $('#ai-err').textContent = ''; generate(); }
  else { cmd.value = okValue = ''; refuse(); } // Enter on anything else clears and rejects it
});
})();
