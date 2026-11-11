// The Sudo Make Visual Novel player. Original code for this project.
// The same file plays a story inside the editor (preview) and inside the exported Windows and Linux programs.
// create(root, project, options) draws the story into root. It never uses the network, and every piece of text goes in as text (never as HTML).
(() => {
'use strict';
const CSS = `.vnp{position:relative;width:100%;height:100%;overflow:hidden;background:#000;user-select:none;outline:none;color:#fff;font-family:var(--vn-font,sans-serif)}
.vnp *{box-sizing:border-box}.vnp-stage{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:#111}
.vnp-l{position:absolute;inset:0}.vnp-bg,.vnp-cg{background-size:cover;background-position:center;transition:opacity .6s}.vnp-cg{background-size:contain;background-repeat:no-repeat;background-color:#000}
.vnp-spr{position:absolute;bottom:0;transform:translateX(-50%);transition:left .35s,opacity .3s,filter .25s;opacity:0}.vnp-spr img{display:block;height:100%;width:auto}
.vnp-box{position:absolute;left:5%;right:5%;bottom:3.5%;height:27%;border-radius:18px;padding:3.2% 3.5% 2% 3.5%;background:var(--vn-box,rgba(16,20,36,.82));border:2px solid var(--vn-accent,#7c6cff);font-size:var(--vn-fs,30px);line-height:1.45;color:var(--vn-text,#fff);cursor:pointer;overflow:hidden}
.vnp-name{position:absolute;left:6.5%;bottom:30%;padding:.15em .9em;border-radius:12px 12px 0 0;font-weight:700;font-size:var(--vn-fs,30px);color:#fff;background:var(--vn-accent,#7c6cff);transform:translateY(2px)}
.vnp-more{position:absolute;right:4%;bottom:3%;font-size:.8em;animation:vnb 1s infinite}@keyframes vnb{50%{transform:translateY(6px)}}
.vnp-bar{position:absolute;right:6%;bottom:31%;display:flex;gap:6px}.vnp-bar button,.vnp-menu button,.vnp-title button,.vnp-choices button{font:inherit;color:#fff;background:rgba(20,24,44,.85);border:1px solid var(--vn-accent,#7c6cff);border-radius:8px;padding:.25em .8em;cursor:pointer}
.vnp-bar button{font-size:18px}.vnp-bar button.on{background:var(--vn-accent,#7c6cff)}.vnp button:hover{filter:brightness(1.25)}
.vnp-choices{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:18px;background:rgba(0,0,0,.35)}.vnp-choices button{min-width:46%;max-width:80%;font-size:30px;padding:.5em 1.2em;border-radius:14px}
.vnp-fx{background:#fff;opacity:0;pointer-events:none;transition:opacity .25s}.vnp-shake{animation:vns .5s}@keyframes vns{20%{transform:translate(-14px,6px)}40%{transform:translate(12px,-8px)}60%{transform:translate(-8px,4px)}80%{transform:translate(6px,-2px)}}
.vnp-title,.vnp-menu{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(5,6,14,.72);text-align:center;padding:4%}.vnp-title h1{font-size:76px;margin:0;text-shadow:0 4px 24px #000}.vnp-title p{margin:0 0 18px;font-size:30px;opacity:.85}.vnp-title button{font-size:34px;min-width:300px}
.vnp-menu h2{margin:0;font-size:40px}.vnp-menu button{font-size:26px}.vnp-menu .row{display:flex;gap:14px;align-items:center;font-size:24px}.vnp-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:80%}.vnp-slots button{height:92px;font-size:20px}.vnp-log{width:80%;flex:1;overflow:auto;text-align:left;font-size:24px;line-height:1.4;padding:10px 18px;background:rgba(0,0,0,.45);border-radius:12px}.vnp-log b{color:var(--vn-accent,#9d90ff)}.vnp-log div{margin-bottom:.6em}
.vnp-toast{position:absolute;left:50%;top:4%;transform:translateX(-50%);background:rgba(0,0,0,.75);padding:.3em 1em;border-radius:10px;font-size:24px;opacity:0;transition:opacity .3s;pointer-events:none}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const POS = { 'far-left': 8, left: 24, center: 50, right: 76, 'far-right': 92 };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const num = v => { if (typeof v === 'number') return v; const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) ? n : v === 'true' ? true : v === 'false' ? false : v; };
function cond(vars, c) { if (!c || !c.v) return true; const a = vars[c.v] === undefined ? 0 : vars[c.v], b = num(c.val); switch (c.op) { case '!=': return a != b; case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b; default: return a == b; } }
function create(root, P, opt = {}) {
  const W = P.w || 1280, H = P.h || 720, th = P.theme || {}, key = 'sma-vn:' + String(P.name || 'story').slice(0, 60);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const timers = new Set(), later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  root.textContent = ''; root.classList.add('vnp'); root.tabIndex = 0; if (!document.getElementById('vnp-css')) { const s = el('style'); s.id = 'vnp-css'; s.textContent = CSS; document.head.append(s); }
  root.style.setProperty('--vn-font', th.font || 'sans-serif'); root.style.setProperty('--vn-accent', th.accent || '#7c6cff'); root.style.setProperty('--vn-text', th.text || '#fff'); root.style.setProperty('--vn-fs', Math.round(H * 0.042) + 'px');
  { const h = th.box || '#101424', a = clamp(th.boxAlpha === undefined ? 0.82 : th.boxAlpha, 0.2, 1); root.style.setProperty('--vn-box', `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`); }
  const stage = el('div', 'vnp-stage'); stage.style.width = W + 'px'; stage.style.height = H + 'px'; root.append(stage);
  const bgA = el('div', 'vnp-l vnp-bg'), bgB = el('div', 'vnp-l vnp-bg'), sprites = el('div', 'vnp-l'), cg = el('div', 'vnp-l vnp-cg'), fx = el('div', 'vnp-l vnp-fx'), box = el('div', 'vnp-box'), nameEl = el('div', 'vnp-name'), more = el('div', 'vnp-more', '▼'), bar = el('div', 'vnp-bar'), choicesEl = el('div', 'vnp-choices'), toast = el('div', 'vnp-toast');
  const textEl = el('div'); box.append(textEl, more); const world = el('div', 'vnp-l'); world.append(bgA, bgB, sprites, cg, fx); stage.append(world, box, nameEl, bar, choicesEl, toast); bgA.style.opacity = 1; bgB.style.opacity = 0; cg.style.opacity = 0; choicesEl.hidden = true; box.hidden = nameEl.hidden = bar.hidden = true;
  const fit = () => { const r = root.getBoundingClientRect(), s = Math.min(r.width / W, r.height / H) || 1; stage.style.transform = `translate(${(r.width - W * s) / 2}px,${(r.height - H * s) / 2}px) scale(${s})`; };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null; if (ro) ro.observe(root); fit();
  // ---- settings, saves ----
  const store = { get(k) { try { return localStorage.getItem(key + ':' + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(key + ':' + k, v); return true; } catch (e) { return false; } } };
  const set = { speed: +(store.get('speed') || 40), vol: +(store.get('vol') || 0.8) }; if (!(set.speed >= 0)) set.speed = 40; if (!(set.vol >= 0)) set.vol = 0.8;
  // ---- audio (WebAudio, decoded from the sounds inside the story) ----
  let ac = null, master = null; const abuf = new Map(); let musicNow = null;
  const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = set.vol; master.connect(ac.destination); } catch (e) { ac = null; } } if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); return ac; };
  const loadSound = id => { if (!id || !P.sounds || !P.sounds[id]) return Promise.resolve(null); if (abuf.has(id)) return abuf.get(id); const c = ctx(); if (!c) return Promise.resolve(null); const p = c.decodeAudioData(unb64(P.sounds[id].data).buffer).catch(() => null); abuf.set(id, p); return p; };
  const music = (id, fade = 1) => { if ((musicNow && musicNow.id) === (id || null)) return; const c = ctx(), old = musicNow; musicNow = id ? { id } : null; if (old && old.g) { const g = old.g; if (c) { g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0, c.currentTime + fade); } later(() => { try { old.src.stop(); } catch (e) {} }, fade * 1000 + 100); } if (!id || !c) return; const me = musicNow; loadSound(id).then(b => { if (!b || musicNow !== me) return; const src = c.createBufferSource(), g = c.createGain(); src.buffer = b; src.loop = true; g.gain.value = 0; src.connect(g); g.connect(master); src.start(); g.gain.linearRampToValueAtTime(0.9, c.currentTime + fade); me.src = src; me.g = g; }); };
  const sfx = id => { const c = ctx(); if (!c) return; loadSound(id).then(b => { if (!b) return; const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = 0.9; s.connect(g); g.connect(master); s.start(); }); };
  // ---- the state of the story ----
  const scene = id => (P.scenes || []).find(s => s.id === id);
  let S = { scene: '', i: 0, vars: Object.assign({}, P.vars || {}), bg: '', cg: '', sp: {}, music: '', log: [] }, mode = 'title', typing = null, auto = false, skip = false, waitFn = null, ended = false, dead = false, curBg = 0, lastSay = null;
  const img = id => (P.images && P.images[id] ? P.images[id].src : '');
  // pictures, GIFs and videos: a video is turned into a temporary blob address the first time it is needed
  const blobs = new Map();
  const media = id => { const a = P.images && P.images[id]; if (!a) return null; if (!/^data:video\//.test(a.src)) return { url: a.src, video: false }; if (!blobs.has(id)) { const m = /^data:([^;,]+);base64,(.*)$/.exec(a.src); if (!m) return null; blobs.set(id, URL.createObjectURL(new Blob([unb64(m[2])], { type: m[1] }))); } return { url: blobs.get(id), video: true }; };
  function paintLayer(l, id, fit) { l.textContent = ''; l.style.backgroundImage = 'none'; const m = id ? media(id) : null; if (!m) return; if (m.video) { const v = document.createElement('video'); v.src = m.url; v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.style.cssText = 'width:100%;height:100%;object-fit:' + fit; l.append(v); v.play().catch(() => {}); } else l.style.backgroundImage = `url("${m.url}")`; }
  const interp = t => String(t || '').replace(/\{([A-Za-z_][\w ]*)\}/g, (m, v) => (S.vars[v.trim()] === undefined ? '0' : String(S.vars[v.trim()])));
  const chr = id => (P.chars && P.chars[id]) || null;
  function setBg(id, fxk, instant) { S.bg = id; const from = curBg ? bgB : bgA, to = curBg ? bgA : bgB; paintLayer(to, id, 'cover'); to.style.backgroundColor = id ? '' : '#111'; if (instant || fxk === 'cut') { to.style.transition = from.style.transition = 'none'; to.style.opacity = 1; from.style.opacity = 0; void to.offsetWidth; to.style.transition = from.style.transition = ''; } else if (fxk === 'black' || fxk === 'flash') { flash(fxk === 'black' ? '#000' : '#fff'); later(() => { to.style.transition = from.style.transition = 'none'; to.style.opacity = 1; from.style.opacity = 0; void to.offsetWidth; to.style.transition = from.style.transition = ''; }, 250); } else { to.style.opacity = 1; from.style.opacity = 0; } curBg = curBg ? 0 : 1; }
  function flash(color) { fx.style.background = color; fx.style.opacity = 1; later(() => { fx.style.opacity = 0; }, 260); }
  function setCg(id, instant) { S.cg = id || ''; if (id) paintLayer(cg, id, 'contain'); if (instant) { cg.style.transition = 'none'; cg.style.opacity = id ? 1 : 0; void cg.offsetWidth; cg.style.transition = ''; } else cg.style.opacity = id ? 1 : 0; sprites.style.visibility = id ? 'hidden' : 'visible'; }
  function drawSprite(cid, instant) { const s = S.sp[cid], c = chr(cid); let n = sprites.querySelector(`[data-c="${CSS_ESC(cid)}"]`); if (!s) { if (n) { if (instant) n.remove(); else { n.style.opacity = 0; later(() => n.remove(), 350); } } return; } if (!c) return; const url = img(c.sprites && c.sprites[s.sp] || Object.values(c.sprites || {})[0]);
    if (!n) { n = el('div', 'vnp-spr'); n.dataset.c = cid; n.append(el('img')); n.style.left = (POS[s.at] || 50) + '%'; sprites.append(n); if (instant) n.style.transition = 'none'; void n.offsetWidth; }
    n.firstChild.src = url; n.firstChild.alt = ''; n.style.height = Math.round(H * 0.92 * (c.scale || 1)) + '%'.replace('%', '') + 'px'; n.style.left = (POS[s.at] || 50) + '%'; n.style.opacity = 1; if (instant) { void n.offsetWidth; n.style.transition = ''; } }
  const CSS_ESC = s => String(s).replace(/["\\]/g, '\\$&');
  function spotlight(cid) { sprites.querySelectorAll('.vnp-spr').forEach(n => { n.style.filter = cid && n.dataset.c !== cid ? 'brightness(.62)' : 'none'; }); }
  function applyVisual(st, instant) { // used by steps that change what you see
    switch (st.t) {
      case 'bg': setBg(st.img || '', st.fx, instant); break;
      case 'cg': setCg(st.img || '', instant); break;
      case 'show': S.sp[st.ch] = { sp: st.sp || '', at: st.at || 'center' }; drawSprite(st.ch, instant); break;
      case 'hide': delete S.sp[st.ch]; drawSprite(st.ch, instant); break;
      case 'music': S.music = st.snd || ''; if (!instant || opt.sound !== false) music(st.snd || '', st.fade === undefined ? 1 : st.fade); break;
    }
  }
  // ---- showing text ----
  function say(who, text, spriteName) {
    const c = chr(who); if (who && spriteName && S.sp[who]) { S.sp[who].sp = spriteName; drawSprite(who); } spotlight(who);
    box.hidden = false; bar.hidden = false; nameEl.hidden = !c; if (c) { nameEl.textContent = c.name; nameEl.style.background = c.color || ''; }
    const full = interp(text); S.log.push({ who: c ? c.name : '', text: full }); if (S.log.length > 200) S.log.shift(); lastSay = { who, text, sp: spriteName };
    more.hidden = true; textEl.textContent = ''; let n = 0; const per = set.speed <= 0 || skip ? full.length : Math.max(1, Math.round(set.speed / 30));
    clearInterval(typing && typing.t); typing = { t: setInterval(() => { n += per; textEl.textContent = full.slice(0, n); if (n >= full.length) finishText(); }, 33), full }; mode = 'say'; if (per >= full.length) { textEl.textContent = full; finishText(); }
  }
  function finishText() { if (!typing) return; clearInterval(typing.t); textEl.textContent = typing.full; typing = null; more.hidden = false; if (skip) later(advance, 25); else if (auto) later(() => { if (auto && mode === 'say' && !typing) advance(); }, 900 + textEl.textContent.length * 45 / Math.max(0.5, set.speed / 40)); }
  function advance() { if (dead || menuOpen()) return; if (mode === 'title' || mode === 'choice' || mode === 'wait') return; if (typing) { finishText(); return; } if (mode === 'say') run(); }
  const jump = id => { const sc = scene(id); if (!sc) { finish(); return false; } S.scene = id; S.i = 0; return true; };
  function finish(text) { if (ended) return; ended = true; mode = 'end'; skip = auto = false; syncBar(); box.hidden = nameEl.hidden = bar.hidden = true; const m = el('div', 'vnp-title'); m.append(el('h1', '', text || 'The End')); const b = el('button', '', 'Back to the title'); b.onclick = () => { m.remove(); showTitle(); }; m.append(b); stage.append(m); b.focus(); }
  function run() { // carry on through the story until something needs the player
    mode = 'run'; let guard = 0;
    while (!dead) {
      if (++guard > 5000) { toastMsg('This story loops without ever stopping to show text.'); mode = 'say'; return; }
      const sc = scene(S.scene); if (!sc) { finish(); return; } const st = sc.steps[S.i++]; if (!st) { finish(); return; }
      switch (st.t) {
        case 'say': say(st.who || '', st.text, st.sprite); return;
        case 'choice': { const opts = (st.options || []).filter(o => cond(S.vars, o.if)); if (!opts.length) break; mode = 'choice'; skip = false; syncBar(); choicesEl.textContent = ''; if (st.prompt) { const p = el('div', '', interp(st.prompt)); p.style.cssText = 'font-size:34px;margin-bottom:10px;text-shadow:0 2px 12px #000'; choicesEl.append(p); } for (const o of opts) { const b = el('button', '', interp(o.text)); b.onclick = e => { e.stopPropagation(); choicesEl.hidden = true; if (o.set && o.set.v) setVar(o.set); if (o.goto && jump(o.goto)) run(); else if (!o.goto) run(); }; choicesEl.append(b); } choicesEl.hidden = false; choicesEl.querySelector('button').focus(); return; }
        case 'goto': if (!jump(st.scene)) return; break;
        case 'set': setVar(st); break;
        case 'if': if (cond(S.vars, st)) { if (st.then && !jump(st.then)) return; } else if (st.else && !jump(st.else)) return; break;
        case 'wait': if (skip) break; mode = 'wait'; later(() => { if (!dead) run(); }, clamp(+st.s || 1, 0, 30) * 1000); return;
        case 'shake': stage.classList.remove('vnp-shake'); void stage.offsetWidth; stage.classList.add('vnp-shake'); break;
        case 'flash': flash(st.color || '#fff'); break;
        case 'sfx': sfx(st.snd); break;
        case 'movie': { if (skip) break; const m = media(st.vid); if (!m || !m.video) break; mode = 'movie'; const o = el('div', 'vnp-l'); o.style.background = '#000'; const v = document.createElement('video'); v.src = m.url; v.autoplay = true; v.playsInline = true; v.style.cssText = 'width:100%;height:100%;object-fit:contain'; v.volume = set.vol; o.append(v); const done = () => { if (!o.isConnected) return; o.remove(); if (!dead) run(); }; v.onended = done; v.onerror = done; o.onclick = e => { e.stopPropagation(); done(); }; stage.append(o); v.play().catch(done); return; }
        case 'end': finish(st.text); return;
        default: applyVisual(st, false);
      }
    }
  }
  function setVar(o) { const v = o.v, val = num(o.val), cur = S.vars[v] === undefined ? 0 : S.vars[v]; S.vars[v] = o.op === '+' ? Number(cur) + Number(val) : o.op === '-' ? Number(cur) - Number(val) : val; }
  // ---- menus, title, saves ----
  const menuOpen = () => !!stage.querySelector('.vnp-menu');
  function toastMsg(t) { toast.textContent = t; toast.style.opacity = 1; later(() => { toast.style.opacity = 0; }, 1600); }
  function snapshot() { return JSON.stringify({ scene: S.scene, i: S.i - (mode === 'say' || mode === 'choice' ? 1 : 0), vars: S.vars, bg: S.bg, cg: S.cg, sp: S.sp, music: S.music, log: S.log.slice(-60), t: Date.now() }); }
  function restore(json) { let o; try { o = JSON.parse(json); } catch (e) { return false; } if (!o || !scene(o.scene)) return false; clearTitle(); ended = false; stage.querySelectorAll('.vnp-title,.vnp-menu').forEach(n => n.remove()); sprites.textContent = ''; S = { scene: o.scene, i: clamp(+o.i || 0, 0, scene(o.scene).steps.length), vars: o.vars && typeof o.vars === 'object' ? o.vars : {}, bg: '', cg: '', sp: {}, music: '', log: Array.isArray(o.log) ? o.log.filter(l => l && typeof l.text === 'string').slice(-200) : [] };
    setBg(o.bg || '', 'cut', true); setCg(o.cg || '', true); for (const [c, s] of Object.entries(o.sp || {})) { if (chr(c) && s) { S.sp[c] = { sp: String(s.sp || ''), at: String(s.at || 'center') }; drawSprite(c, true); } } S.music = String(o.music || ''); music(S.music, 0.3); run(); return true; }
  function overlay(title) { const m = el('div', 'vnp-menu'); m.append(el('h2', '', title)); stage.append(m); m.onclick = e => e.stopPropagation(); return m; }
  function closeBtn(m, cb) { const b = el('button', '', 'Back'); b.onclick = () => { m.remove(); cb && cb(); root.focus(); }; m.append(b); return b; }
  function slotsMenu(saving) { const m = overlay(saving ? 'Save' : 'Load'), g = el('div', 'vnp-slots'); m.append(g); for (let k = 1; k <= 6; k++) { const raw = store.get('slot' + k); let info = 'Empty'; if (raw) try { const o = JSON.parse(raw), sc = scene(o.scene); info = (sc ? sc.name : '?') + '\n' + new Date(o.t).toLocaleString(); } catch (e) {} const b = el('button', '', 'Slot ' + k + '\n' + info); b.style.whiteSpace = 'pre'; b.onclick = () => { if (saving) { if (mode === 'say' || mode === 'choice') { store.set('slot' + k, snapshot()); toastMsg('Saved to slot ' + k); m.remove(); root.focus(); } } else if (raw) { m.remove(); restore(raw); } }; g.append(b); } closeBtn(m); }
  function logMenu() { const m = overlay('History'), l = el('div', 'vnp-log'); for (const e of S.log) { const d = el('div'); if (e.who) d.append(el('b', '', e.who + ': ')); d.append(document.createTextNode(e.text)); l.append(d); } m.append(l); closeBtn(m); l.scrollTop = l.scrollHeight; }
  function optsMenu() { const m = overlay('Settings'); const row = (label, min, max, step, get, setf) => { const r = el('div', 'row'), i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get(); i.oninput = () => setf(+i.value); r.append(el('span', '', label), i); m.append(r); }; row('Text speed (left = instant)', 0, 120, 5, () => set.speed, v => { set.speed = v; store.set('speed', v); }); row('Volume', 0, 1, 0.05, () => set.vol, v => { set.vol = v; store.set('vol', v); if (master) master.gain.value = v; }); closeBtn(m); }
  function mainMenu() { if (menuOpen()) { stage.querySelectorAll('.vnp-menu').forEach(n => n.remove()); return; } const m = overlay('Menu'); const add = (t, f) => { const b = el('button', '', t); b.onclick = () => { m.remove(); f(); }; m.append(b); return b; }; add('Resume', () => root.focus()); add('Save', () => slotsMenu(true)); add('Load', () => slotsMenu(false)); add('History', logMenu); add('Settings', optsMenu); add('Back to the title', () => { showTitle(); }); if (opt.quit) add('Quit', opt.quit); m.firstChild.nextSibling.focus(); }
  function clearTitle() { stage.querySelectorAll('.vnp-title').forEach(n => n.remove()); }
  function showTitle() { stage.querySelectorAll('.vnp-title,.vnp-menu').forEach(n => n.remove()); skip = auto = false; syncBar(); mode = 'title'; ended = false; box.hidden = nameEl.hidden = bar.hidden = true; choicesEl.hidden = true; clearInterval(typing && typing.t); typing = null;
    const t = P.title || {}; sprites.textContent = ''; S = { scene: '', i: 0, vars: Object.assign({}, P.vars || {}), bg: '', cg: '', sp: {}, music: '', log: [] }; setCg('', true); setBg(t.bg || '', 'cut', true); music(t.music || '', 0.6);
    const m = el('div', 'vnp-title'); m.append(el('h1', '', t.text || P.name || 'Visual novel')); if (t.subtitle) m.append(el('p', '', t.subtitle)); const start = el('button', '', 'Start'); start.onclick = () => begin(); m.append(start); const ld = el('button', '', 'Load'); ld.onclick = () => slotsMenu(false); m.append(ld); if (opt.quit) { const q = el('button', '', 'Quit'); q.onclick = opt.quit; m.append(q); } stage.append(m); start.focus(); }
  function begin(sceneId, idx) { clearTitle(); ended = false; sprites.textContent = ''; const sid = sceneId || P.start || (P.scenes[0] && P.scenes[0].id); S = { scene: sid, i: 0, vars: Object.assign({}, P.vars || {}), bg: '', cg: '', sp: {}, music: '', log: [] }; setCg('', true); setBg('', 'cut', true);
    if (idx) { const sc = scene(sid); for (let k = 0; k < idx && k < sc.steps.length; k++) { const st = sc.steps[k]; if (st.t === 'set') setVar(st); else if (st.t === 'say' && st.sprite && S.sp[st.who]) S.sp[st.who].sp = st.sprite; else if (['bg', 'cg', 'show', 'hide', 'music'].includes(st.t)) applyVisual(st, true); } S.i = idx; }
    music(S.music || '', 0.3); stage.querySelectorAll('.vnp-title').forEach(n => n.remove()); run(); root.focus(); }
  // ---- buttons and input ----
  const bAuto = el('button', '', 'Auto'), bSkip = el('button', '', 'Skip'); function syncBar() { bAuto.classList.toggle('on', auto); bSkip.classList.toggle('on', skip); }
  bAuto.onclick = e => { e.stopPropagation(); auto = !auto; skip = false; syncBar(); if (auto && mode === 'say' && !typing) advance(); }; bSkip.onclick = e => { e.stopPropagation(); skip = !skip; auto = false; syncBar(); if (skip) { if (typing) finishText(); else if (mode === 'say') advance(); } };
  for (const [t, f] of [['History', logMenu], ['Save', () => slotsMenu(true)], ['Load', () => slotsMenu(false)], ['Settings', optsMenu], ['Menu', mainMenu]]) { const b = el('button', '', t); b.onclick = e => { e.stopPropagation(); f(); }; bar.append(b); } bar.prepend(bAuto, bSkip);
  box.onclick = () => { ctx(); advance(); }; stage.onclick = e => { ctx(); if (e.target === stage || world.contains(e.target)) advance(); };
  const typingTarget = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable), mine = e => !typingTarget(e.target) && root.isConnected && root.offsetParent !== null;
  const onKey = e => { if (dead || !mine(e)) return; if (e.key === 'Escape') { if (mode !== 'title') mainMenu(); e.preventDefault(); } else if (!menuOpen() && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') && mode === 'say') { e.preventDefault(); ctx(); advance(); } else if (e.key === 'Control' && mode === 'say' && !menuOpen()) { skip = true; syncBar(); if (typing) finishText(); else advance(); } };
  const onKeyUp = e => { if (!dead && e.key === 'Control' && skip) { skip = false; syncBar(); } };
  document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);
  // ---- go ----
  if (opt.sceneId) begin(opt.sceneId, opt.index || 0); else if (opt.skipTitle) begin(); else showTitle(); root.focus();
  return { destroy() { dead = true; timers.forEach(clearTimeout); clearInterval(typing && typing.t); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); if (ro) ro.disconnect(); try { if (musicNow && musicNow.src) musicNow.src.stop(); } catch (e) {} blobs.forEach(u => URL.revokeObjectURL(u)); blobs.clear(); if (ac) { ac.close().catch(() => {}); ac = null; } root.textContent = ''; root.classList.remove('vnp'); },
    state: () => ({ mode, scene: S.scene, i: S.i, vars: Object.assign({}, S.vars), bg: S.bg, cg: S.cg, sp: JSON.parse(JSON.stringify(S.sp)), music: S.music, text: typing ? typing.full : textEl.textContent, speaker: nameEl.hidden ? '' : nameEl.textContent, log: S.log.slice(), choices: mode === 'choice' ? [...choicesEl.querySelectorAll('button')].map(b => b.textContent) : [] }),
    advance, pick: n => { const b = choicesEl.querySelectorAll('button')[n]; if (b) b.click(); }, save: n => store.set('slot' + n, snapshot()), loadSlot: n => { const r = store.get('slot' + n); return r ? restore(r) : false; }, menu: mainMenu, setSkip: v => { skip = !!v; syncBar(); if (skip && mode === 'say') advance(); } };
}
const api = { create };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA_vnplayer = api;
})();
