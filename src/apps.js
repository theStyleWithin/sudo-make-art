// App switcher: the logo in the top-left is a button that swaps the whole app between its "sudo make …" flavours.
// Art and Video are built (they are modes of the same editor). The others show a plan page until they are built.
(() => {
'use strict';
const $ = s => document.querySelector(s);
const APPS = [
  { id: 'art', name: 'Sudo Make Art', tag: 'Designs, thumbnails, photos, conversion', ready: true, mode: 'home' },
  { id: 'video', name: 'Sudo Make Video', tag: 'Cut, caption and export videos', ready: true, mode: 'video' },
  { id: 'tcg', name: 'Sudo Make TCG', tag: 'Trading cards and whole decks', plan: ['Card templates and frames', 'Art box, name, stats and rules text', 'Print sheets for a whole deck'] },
  { id: 'manga', name: 'Sudo Make Manga', tag: 'Manga and comic pages', plan: ['Panel layouts you can drag and split', 'Speech bubbles and sound effects', 'Screentones and page export'] },
  { id: 'write', name: 'Sudo Write Stuff', tag: 'Stories, notes and scripts', plan: ['Distraction-free writing', 'Chapters and an outline', 'Export to common formats'] },
  { id: 'tiles', name: 'Sudo Make Tiles', tag: 'Tilesets and seamless textures', plan: ['Tile editor with a live seamless preview', 'Automatic edge and corner tiles', 'Export a tileset sheet'] },
  { id: 'pixels', name: 'Sudo Make Pixels', tag: 'Pixel art, sprites and animation', ready: true, mode: 'pixels' },
  { id: 'music', name: 'Sudo Make Music', tag: 'Chiptune and retro music', plan: ['Pattern-based chiptune tracker', 'Handheld-style sound channels', 'Export audio and loops'] },
  { id: 'games', name: 'Sudo Make Games', tag: 'Small games', plan: ['To be decided together'] },
  { id: 'vn', name: 'Sudo Make Visual Novel', tag: 'Visual novels', plan: ['Scenes, characters and dialogue', 'Branching choices', 'Export a playable story'] },
];
const KEY = 'sma-app';
let cur = 'art';
const btn = $('#appsw'), menu = $('#appmenu');
const el = (tag, attrs = {}, text) => Object.assign(document.createElement(tag), attrs, text !== undefined ? { textContent: text } : {});

function build() {
  menu.textContent = '';
  APPS.forEach(a => {
    const b = el('button', { type: 'button', role: 'menuitemradio', className: 'app-item' + (a.id === cur ? ' on' : '') });
    b.setAttribute('aria-checked', String(a.id === cur));
    b.append(el('b', {}, a.name), el('small', {}, a.tag), el('span', { className: 'app-tag' }, a.ready ? '' : 'Coming soon'));
    b.onclick = () => { choose(a.id); close(); btn.focus(); };
    menu.append(b);
  });
}
function open() { build(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); (menu.querySelector('.on') || menu.firstChild).focus(); }
function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
function choose(id, quiet) {
  const a = APPS.find(x => x.id === id) || APPS[0]; cur = a.id;
  $('#appname').textContent = a.name; document.title = a.name;
  document.body.classList.toggle('app-soon', !a.ready);
  if (a.ready) { if (!(quiet && a.id === 'art')) window.SMA && window.SMA.setMode(a.mode); }
  else { $('#soon-name').textContent = a.name; $('#soon-tag').textContent = a.tag; const ul = $('#soon-plan'); ul.textContent = ''; (a.plan || []).forEach(t => ul.append(el('li', {}, t))); }
  try { localStorage.setItem(KEY, a.id); } catch (e) {}
}
btn.onclick = () => (menu.hidden ? open() : close());
document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.appsw-wrap')) close(); });
document.addEventListener('keydown', e => {
  if (menu.hidden) return;
  if (e.key === 'Escape') { close(); btn.focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const it = [...menu.querySelectorAll('.app-item')], i = it.indexOf(document.activeElement); it[(i + (e.key === 'ArrowDown' ? 1 : -1) + it.length) % it.length].focus(); }
});
$('#soon-back').onclick = () => choose('art');
window.SMA_apps = { choose };
let saved = 'art'; try { saved = localStorage.getItem(KEY) || 'art'; } catch (e) {}
if (saved !== 'art') setTimeout(() => choose(saved, true), 50); // after the editor has picked its first mode
})();
