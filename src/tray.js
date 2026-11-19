// System tray: the page side. The tray menu lives in electron/tray.js; it sends commands here.
(() => {
'use strict';
const api = window.sma && window.sma.tray; if (!api) return;
api.onCommand(c => {
  if (c.cmd === 'golive') window.SMA_live && window.SMA_live.goLive();
  else if (c.cmd === 'record') window.SMA_live && window.SMA_live.record();
  else if (c.cmd === 'screenshot') { const b = document.querySelector('#h-shot'); if (b) b.click(); }
  else if (c.cmd === 'textgrab') { const b = document.querySelector('#h-textgrab'); if (b) b.click(); }
  else if (c.cmd === 'mode' && c.mode) window.SMA.setMode(c.mode);
  else if (c.cmd === 'newdesign') { window.SMA.setMode('design'); const b = document.querySelector('#new'); if (b) b.click(); }
});
})();
