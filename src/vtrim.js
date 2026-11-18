// Trim video: the page side (desktop app). The cutting happens in the main process (electron/vtrim.js).
(() => {
'use strict';
const api = window.sma && window.sma.vtrim, $ = s => document.querySelector(s);
if (!api) return;
$('#mode-vtrim').hidden = false; $('#h-vtrim').hidden = false; $('#h-vtrim').onclick = () => window.SMA.setMode('vtrim');
const vid = $('#vt-video'), tl = $('#vt-tl'), el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const fmtBytes = n => n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const pad = (n, w = 2) => String(n).padStart(w, '0');
const fmt = t => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000); return ms === 1000 ? fmt(Math.floor(t) + 1) : `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`; };
const short = t => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60); return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`; };
function parseTime(txt) { // 90, 1:30, 01:02:03.5
  const parts = String(txt).trim().replace(',', '.').split(':'); if (parts.length > 3 || parts.some(p => !/^\d+(\.\d*)?$/.test(p))) return null; let t = 0; for (const p of parts) t = t * 60 + parseFloat(p); return Number.isFinite(t) ? t : null; }
let info = null, dur = 0, fps = 25, kf = null, start = 0, end = 0, busy = false, lastOut = null, previewNote = false, raf = 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), xOf = t => (dur ? t / dur : 0) * tl.clientWidth, tOf = x => clamp(x / Math.max(1, tl.clientWidth) * dur, 0, dur);
const mode = () => document.querySelector('input[name=vt-mode]:checked').value;

// ---------- drawing the timeline ----------
function paint() {
  if (!info) return; const w = tl.clientWidth;
  $('#vt-hs').style.left = xOf(start) + 'px'; $('#vt-he').style.left = xOf(end) + 'px'; $('#vt-dl').style.width = xOf(start) + 'px'; $('#vt-dr').style.width = Math.max(0, w - xOf(end)) + 'px'; $('#vt-ph').style.left = xOf(vid.currentTime || 0) + 'px';
  $('#vt-time').textContent = `${fmt(vid.currentTime || 0)} / ${fmt(dur)}`; $('#vt-len').textContent = 'Clip length ' + fmt(end - start);
  $('#vt-start').value = document.activeElement === $('#vt-start') ? $('#vt-start').value : fmt(start); $('#vt-end').value = document.activeElement === $('#vt-end') ? $('#vt-end').value : fmt(end);
  const snap = $('#vt-snap'), lossless = mode() === 'lossless', k = kf && lossless ? snapBack(start) : start; snap.hidden = !(kf && lossless && start - k > 0.01); snap.style.left = xOf(k) + 'px';
  let h; if (!lossless) h = 'Exact: the clip starts on the very frame you chose. The video is re-encoded (H.264, high quality) and the sound re-encoded too, so it takes longer.'; else if (!kf) h = 'Finding the keyframes (the points a lossless cut can start from)…'; else if (start - k > 0.01) h = `Lossless: the clip will start at ${fmt(k)}, the nearest keyframe before your start (${(start - k).toFixed(2)} s earlier), because a lossless cut can only begin on a keyframe. Choose Exact to start on your frame.`; else h = 'Lossless: your start is on a keyframe, so the cut is exact and nothing is re-encoded.';
  $('#vt-hint').textContent = h;
}
function snapBack(t) { let r = 0; for (const k of kf) { if (k <= t + 0.0005) r = k; else break; } return r; }
function drawKeyframes() { const c = $('#vt-kfc'), w = c.width = tl.clientWidth, x = c.getContext('2d'); x.clearRect(0, 0, w, 12); if (!kf || !dur) return; x.fillStyle = '#ffd24a'; let lastX = -9; for (const k of kf) { const px = Math.round(k / dur * w); if (px - lastX < 3) continue; lastX = px; x.fillRect(px, 3, 1, 9); } }
function drawRuler() { const r = $('#vt-ruler'); r.textContent = ''; if (!dur) return; const n = 8; for (let i = 0; i <= n; i++) { const s = el('span', {}, short(dur * i / n)); s.style.left = (i / n * 100) + '%'; r.append(s); } }
function layout() { drawKeyframes(); paint(); }
window.addEventListener('resize', () => { if (document.body.classList.contains('vtrim-mode')) layout(); });

// ---------- opening a video ----------
async function load(i) {
  info = i; dur = i.duration; fps = i.fps > 1 ? i.fps : 25; kf = null; start = 0; end = dur; lastOut = null; $('#vt-reveal').hidden = true; $('#vt-prog').value = 0; $('#vt-fallback').hidden = true; previewNote = false;
  $('#vt-name').textContent = i.name; $('#vt-info').textContent = `${i.width}×${i.height} · ${i.vcodec}${i.acodec ? ' + ' + i.acodec : ' (no sound)'} · ${fps.toFixed(fps % 1 ? 2 : 0)} fps · ${short(dur)} · ${fmtBytes(i.size)}`;
  $('#vt-stage').classList.add('on'); vid.src = i.url; vid.volume = +$('#vt-vol').value; vid.load(); $('#vt-go').disabled = false; $('#vt-stat').textContent = 'Drag the two handles to choose the part to keep, then press Trim.'; $('#vt-mute').disabled = !i.acodec; if (!i.acodec) $('#vt-mute').checked = false;
  drawRuler(); layout();
  const token = i.token; api.keyframes(token).then(k => { if (info && info.token === token) { kf = k; layout(); } }).catch(() => {});
  const strip = $('#vt-strip'); strip.textContent = ''; api.thumbs(token, Math.max(6, Math.round(tl.clientWidth / 80))).then(list => { if (!info || info.token !== token) return; strip.textContent = ''; for (const u of list) { const im = el('img', { alt: '' }); if (u) im.src = u; strip.append(im); } }).catch(() => {});
}
async function openDialog() { try { const i = await api.pick(); if (i) await load(i); } catch (e) { $('#vt-stat').textContent = clean(e); } }
$('#vt-open').onclick = openDialog;
const view = $('#vtrimview');
view.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('#vt-stage').classList.add('drop'); } });
view.addEventListener('dragleave', e => { if (!view.contains(e.relatedTarget)) $('#vt-stage').classList.remove('drop'); });
view.addEventListener('drop', async e => { e.preventDefault(); $('#vt-stage').classList.remove('drop'); const f = e.dataTransfer.files[0]; if (!f || busy) return; try { const p = api.pathFor(f); if (!p) throw new Error('Could not read that file.'); await load(await api.open(p)); } catch (err) { $('#vt-stat').textContent = clean(err); } });

// ---------- playing and moving around ----------
function seek(t) { vid.currentTime = clamp(t, 0, dur); paint(); }
function toggle() { if (!info) return; if (vid.paused) { if (vid.currentTime < start - 0.02 || vid.currentTime >= end - 0.02) vid.currentTime = start; vid.play().catch(() => {}); } else vid.pause(); }
vid.addEventListener('play', () => { $('#vt-play').textContent = '⏸'; loop(); }); vid.addEventListener('pause', () => { $('#vt-play').textContent = '▶'; paint(); });
function loop() { cancelAnimationFrame(raf); const tick = () => { if (!vid.paused) { if (vid.currentTime >= end) { vid.pause(); vid.currentTime = end; } paint(); raf = requestAnimationFrame(tick); } }; raf = requestAnimationFrame(tick); }
vid.addEventListener('seeked', paint); vid.addEventListener('timeupdate', () => { if (vid.paused) paint(); });
vid.addEventListener('error', () => { if (info && !previewNote) { $('#vt-fallback').hidden = false; $('#vt-stat').textContent = 'This video cannot be shown in the preview, but it can still be trimmed.'; } });
$('#vt-play').onclick = toggle; $('#vt-tostart').onclick = () => seek(start); $('#vt-toend').onclick = () => seek(end);
const step = n => { vid.pause(); seek((Math.round((vid.currentTime || 0) * fps) + n) / fps + 0.0005); };
$('#vt-prevframe').onclick = () => step(-1); $('#vt-nextframe').onclick = () => step(1);
const jumpKf = dir => { if (!kf || !kf.length) return; vid.pause(); const t = vid.currentTime || 0; if (dir < 0) { let r = 0; for (const k of kf) { if (k < t - 0.05) r = k; else break; } seek(r); } else { const n = kf.find(k => k > t + 0.05); seek(n === undefined ? dur : n); } };
$('#vt-prevkf').onclick = () => jumpKf(-1); $('#vt-nextkf').onclick = () => jumpKf(1);
$('#vt-vol').oninput = () => { vid.volume = +$('#vt-vol').value; };
$('#vt-setstart').onclick = () => setStart(vid.currentTime || 0); $('#vt-setend').onclick = () => setEnd(vid.currentTime || 0);
const MIN = 0.05; function setStart(t) { start = clamp(t, 0, Math.max(0, end - MIN)); paint(); } function setEnd(t) { end = clamp(t, Math.min(dur, start + MIN), dur); paint(); }
for (const [id, set, get] of [['#vt-start', setStart, () => start], ['#vt-end', setEnd, () => end]]) { const f = $(id); const apply = () => { const t = parseTime(f.value); if (t !== null) { set(t); seek(get()); } f.value = fmt(get()); }; f.onkeydown = e => { if (e.key === 'Enter') { apply(); f.blur(); } else if (e.key === 'Escape') { f.value = fmt(get()); f.blur(); } }; f.onblur = apply; }
// dragging the handles and the playhead
function drag(el2, move, immediate) { el2.addEventListener('pointerdown', e => { if (!info) return; e.preventDefault(); e.stopPropagation(); el2.setPointerCapture(e.pointerId); if (immediate) move(tOf(e.clientX - tl.getBoundingClientRect().left)); const mv = ev => move(tOf(ev.clientX - tl.getBoundingClientRect().left)), up = () => { el2.removeEventListener('pointermove', mv); el2.removeEventListener('pointerup', up); el2.removeEventListener('pointercancel', up); }; el2.addEventListener('pointermove', mv); el2.addEventListener('pointerup', up); el2.addEventListener('pointercancel', up); }); }
drag($('#vt-hs'), t => { setStart(t); vid.pause(); vid.currentTime = start; }); drag($('#vt-he'), t => { setEnd(t); vid.pause(); vid.currentTime = Math.max(start, end - 0.04); }); drag(tl, t => { vid.pause(); seek(t); }, true);
document.querySelectorAll('input[name=vt-mode]').forEach(r => { r.onchange = paint; });
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('vtrim-mode') || !info) return; const t = e.target; if (t && (t.tagName === 'INPUT' && t.type === 'text' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return; const k = e.key;
  if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); const d = k === 'ArrowLeft' ? -1 : 1; if (e.ctrlKey || e.metaKey) jumpKf(d); else if (e.shiftKey) { vid.pause(); seek((vid.currentTime || 0) + d); } else step(d); }
  else if (k === 'i' || k === 'I' || k === '[') setStart(vid.currentTime || 0); else if (k === 'o' || k === 'O' || k === ']') setEnd(vid.currentTime || 0); else if (k === 'Home') seek(start); else if (k === 'End') seek(end);
});
document.addEventListener('sma-mode', e => { if (e.detail !== 'vtrim') vid.pause(); });

// ---------- a lighter copy for the preview ----------
$('#vt-mkpreview').onclick = async () => { const b = $('#vt-mkpreview'); b.disabled = true; busy = true; $('#vt-cancel').hidden = false; $('#vt-go').hidden = true; $('#vt-stat').textContent = 'Making a preview copy…';
  try { const r = await api.preview(info.token); previewNote = true; const t = vid.currentTime || 0; vid.src = r.url; vid.load(); vid.addEventListener('loadedmetadata', () => { vid.currentTime = Math.min(t, dur); }, { once: true }); $('#vt-fallback').hidden = true; $('#vt-stat').textContent = 'Preview ready (only for watching: your original is what gets trimmed).'; }
  catch (e) { $('#vt-stat').textContent = clean(e) === 'Cancelled' ? 'Cancelled.' : clean(e); } finally { b.disabled = false; busy = false; $('#vt-cancel').hidden = true; $('#vt-go').hidden = false; $('#vt-prog').value = 0; } };

// ---------- cutting ----------
api.onProgress(d => { $('#vt-prog').value = d.pct || 0; });
$('#vt-cancel').onclick = () => api.cancel();
$('#vt-go').onclick = async () => {
  if (!info || busy) return; vid.pause(); busy = true; $('#vt-go').hidden = true; $('#vt-cancel').hidden = false; $('#vt-reveal').hidden = true; $('#vt-prog').value = 0; $('#vt-stat').textContent = 'Choose where to save…';
  try {
    const r = await api.trim({ token: info.token, start, end, mode: mode(), mute: $('#vt-mute').checked, stripMeta: $('#vt-meta').checked });
    if (r.cancelled) $('#vt-stat').textContent = 'Not saved.'; else { lastOut = r.path; $('#vt-stat').textContent = `Saved ${fmtBytes(r.size)}, ${fmt(r.duration)} long${r.mode === 'lossless' && Math.abs(r.startedAt - start) > 0.01 ? ` (it starts at ${fmt(r.startedAt)}, the keyframe before your start)` : ''}: ${r.path}`; $('#vt-reveal').hidden = false; }
  } catch (e) { $('#vt-stat').textContent = clean(e) === 'Cancelled' ? 'Cancelled. Nothing was saved.' : 'Could not trim: ' + clean(e); }
  finally { busy = false; $('#vt-go').hidden = false; $('#vt-cancel').hidden = true; $('#vt-prog').value = 0; }
};
$('#vt-reveal').onclick = () => { if (lastOut) api.reveal(lastOut); };
window.SMA_vtrim = { state: () => ({ start, end, dur, fps, kf: kf && kf.length, mode: mode(), loaded: !!info }), snapBack, parseTime, fmt };
drawRuler(); paint();
})();
