// Sudo Take Screenshot: the buttons (home screen and Sources). The picking happens in its own full-screen window (src/pinpoint.js).
(() => {
'use strict';
const api = window.sma && window.sma.pinpoint, $ = s => document.querySelector(s);
if (!api) return;
const home = document.createElement('button'); home.id = 'h-shot'; home.textContent = 'Sudo Take Screenshot'; home.title = 'Freeze the screen, point at a picture, click to save it'; $('#h-folder').before(home);
const src = document.createElement('button'); src.id = 'srcshot'; src.textContent = '📷 Screenshot'; src.title = 'Sudo Take Screenshot: freeze the screen, point at a picture, click to save it into Sources'; $('#srcnew').before(src);
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
function toast(t) { const n = document.createElement('div'); n.className = 'toast'; n.textContent = t; document.body.append(n); setTimeout(() => n.remove(), 6000); }
async function shoot() {
  try {
    const r = await api.start(); if (!r || !r.dataUrl) return;
    const blob = await (await fetch(r.dataUrl)).blob(); await window.SMA.addFiles([new File([blob], r.name, { type: 'image/png' })]);
    toast('Saved to ' + r.path + ', copied to the clipboard and added to Sources.');
    if (window.__trayShot) { window.__trayShot = false; try { window.sma.tray.toast('Sudo Take Screenshot', 'Picture saved: ' + r.path + ' (also copied)'); } catch (e) {} }
  } catch (e) { toast(clean(e)); window.__trayShot = false; }
}
home.onclick = shoot; src.onclick = shoot;
})();
