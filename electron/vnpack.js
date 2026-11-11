'use strict';
// Turns a finished visual novel into a program for Windows or Linux. Original code for this project.
// The story and the player are put into one page, and electron/gamepack.js wraps that page with Electron's official runtime
// (downloaded only after you say yes, and checked against the SHA-256 Electron publishes). Nothing is sent anywhere.
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { buildPackage, VN } = require('./gamepack');

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function buildHtml(projectJson) {
  const P = JSON.parse(projectJson); if (!P || P.app !== 'sudo-make-vn' || !Array.isArray(P.scenes) || !P.scenes.length) throw new Error('This story has no scenes yet.');
  const player = fs.readFileSync(path.join(__dirname, '..', 'src', 'vnplayer.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const data = JSON.stringify(P).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(P.name || 'Visual novel')}</title>\n<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#r{position:absolute;inset:0}</style></head>\n<body><div id="r"></div>\n<script type="application/json" id="story">${data}</script>\n<script>${player}</script>\n<script>SMA_vnplayer.create(document.getElementById('r'),JSON.parse(document.getElementById('story').textContent),{quit:function(){window.close()}});</script>\n</body></html>`;
}
function register() {
  ipcMain.handle('vnpack:build', (e, platform, name, projectJson) => {
    if (typeof projectJson !== 'string' || projectJson.length > 190e6) throw new Error('This story is too big to pack (over about 190 MB). Use smaller videos or pictures.');
    return buildPackage(e, platform, String(name || 'Visual novel'), buildHtml(projectJson), VN);
  });
}
module.exports = { register, buildHtml };
