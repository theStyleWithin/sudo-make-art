// Local AI image generation / editing UI. Talks to the desktop app's engine bridge (window.sma.ai). Hidden on Android.
(() => {
'use strict';
const api = window.sma && window.sma.ai, SMA = window.SMA;
if (!api || !SMA) return;
const $ = s => document.querySelector(s);
const dlg = $('#aidlg'); let jobId = null, lastBlob = null, offProg = null;

$('#tool-ai').hidden = false;
$('#tool-ai').onclick = async () => { dlg.showModal(); await refresh(); };
$('#ai-close').onclick = () => dlg.close();
$('#ai-folder').onclick = () => api.openModels();
$('#ai-mode').onchange = () => { $('#ai-strwrap').hidden = $('#ai-mode').value !== 'edit'; };

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
    const [width, height] = size(), p = await api.plan({ model, width, height });
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
$('#ai-go').onclick = async () => {
  $('#ai-err').textContent = ''; const [width, height] = size(), edit = $('#ai-mode').value === 'edit';
  if (!$('#ai-prompt').value.trim()) { $('#ai-err').textContent = 'Write a prompt first.'; return; }
  if (!$('#ai-model').value) { $('#ai-err').textContent = 'Choose a model.'; return; }
  setBusy(true); offProg?.();
  const off1 = api.onStarted(d => { jobId = d.id; }), off2 = api.onProgress(d => { const p = $('#ai-prog'); p.max = d.total; p.value = d.step; });
  offProg = () => { off1(); off2(); };
  try {
    const r = await api.generate({ model: $('#ai-model').value, prompt: $('#ai-prompt').value, negative: $('#ai-neg').value, width, height,
      steps: +$('#ai-steps').value, cfg: +$('#ai-cfg').value, seed: +$('#ai-seed').value, extraArgs: $('#ai-extra').value,
      init: edit ? await initImage(width, height) : undefined, strength: +$('#ai-strength').value });
    lastBlob = new Blob([r.image], { type: 'image/png' }); $('#ai-img').src = URL.createObjectURL(lastBlob); $('#ai-add').disabled = $('#ai-src').disabled = false;
  } catch (e) { $('#ai-err').textContent = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  finally { setBusy(false); offProg?.(); offProg = null; jobId = null; }
};
$('#ai-cancel').onclick = () => { if (jobId) api.cancel(jobId); };
$('#ai-add').onclick = () => { if (lastBlob) { SMA.addImageBlob(lastBlob); dlg.close(); } };
$('#ai-src').onclick = () => { if (lastBlob) SMA.addFiles([new File([lastBlob], 'ai-' + Date.now() + '.png', { type: 'image/png' })]); };
})();
