// "Send to Anti-Social" (desktop app): opens Anti-Social on this computer and has it add a decoration pack to its My decorations.
// The work is done in electron/antisocial.js. Used by the profile decoration export window and by the home screen's "Import to Anti-Social" button.
(() => {
'use strict';
const api = window.sma && window.sma.antisocial;
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
// one sentence about what happened
async function send(text, name) {
  const r = await api.send(text, name);
  if (!r.found) return { ok: false, text: 'Anti-Social was not found on this computer. The pack was saved at ' + r.file + ' so you can add it in the app: Settings → Profile decorations → Add my own decorations.' };
  return { ok: true, text: `Opened Anti-Social (${r.how}), and it adds ${r.items === 1 ? 'the decoration' : r.items + ' decorations'} to My decorations by itself. The pack is also saved at ${r.file}; if the app did not add it (an older version), use Settings → Profile decorations → Add my own decorations and pick that file.` };
}
window.SMA_ANTISOCIAL = api ? { available: true, send, clean } : { available: false };
const btn = document.querySelector('#h-antisocial');
if (!api || !btn) return;
btn.hidden = false;
btn.title = 'Pick a decoration pack (.asdeco) you made and open Anti-Social with it, so the app adds it to your decorations for you';
btn.onclick = () => {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.asdeco,application/json', hidden: true });
  inp.onchange = async () => {
    const f = inp.files[0]; inp.remove(); if (!f) return;
    try { const r = await send(await f.text(), f.name); alert(r.text); } catch (e) { alert(clean(e)); }
  };
  document.body.append(inp); inp.click();
};
})();
