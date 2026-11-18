// "Add to Steam" button on the home screen (desktop app). The work is done in electron/steam.js.
(() => {
'use strict';
const api = window.sma && window.sma.steam, btn = document.querySelector('#h-steam');
if (!api || !btn) return;
btn.hidden = false;
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
btn.onclick = async () => {
  try {
    const s = await api.status();
    if (!s.found) { alert('Steam was not found on this computer. Start Steam and sign in once, then try again.'); return; }
    if (s.already >= s.found) { alert('Sudo Make Art is already in your Steam library.'); return; }
    if (s.running) { alert('Steam is running. Close Steam completely (Steam > Exit) and press this button again, because Steam would undo the change when it closes.'); return; }
    if (!confirm(`Add "${s.name}" to your Steam library as a non-Steam game?\n\nIt starts this app: ${s.exe}\n\nThis adds one shortcut to Steam's own shortcuts file for ${s.found} Steam account${s.found > 1 ? 's' : ''} on this computer (a backup copy of the file is kept next to it). Nothing is sent anywhere. Start Steam afterwards and look under Games > Non-Steam.\n\nIf you move or update the app file, press this again.`)) return;
    const r = await api.add(); alert(r.added ? 'Done. Start Steam and look for "Sudo Make Art" in your library.' : 'It was already there. Nothing changed.');
  } catch (e) { alert(clean(e)); }
};
})();
