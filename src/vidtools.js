// Video editor: caption styles, a caption list (type them in or import / export SRT and VTT), and animated stickers.
// Captions are made on this device from text you provide; nothing is uploaded and no speech model is downloaded.
(function () {
  const V = () => window.SMA_video.api, $ = s => document.querySelector(s);
  const STYLES = [
    { name: 'Classic', font: 'Arial', bold: true, color: '#ffffff', stroke: '#000000', sw: 4 },
    { name: 'Boxed', font: 'Arial', bold: true, color: '#ffffff', stroke: '#000000', sw: 0, bg: '#000000cc' },
    { name: 'Yellow', font: 'Arial', bold: true, color: '#ffe14d', stroke: '#000000', sw: 5 },
    { name: 'Pop caps', font: 'Impact', bold: false, color: '#ffffff', stroke: '#ff2d75', sw: 6, upper: true },
    { name: 'Neon', font: 'Arial', bold: true, color: '#7cffcb', stroke: '#003d2a', sw: 3, glow: '#00ffa8' },
    { name: 'Comic', font: 'Impact', bold: false, color: '#ffffff', stroke: '#000000', sw: 7, upper: true },
    { name: 'Minimal', font: 'Arial', bold: false, color: '#ffffff', stroke: '#000000', sw: 0, glow: '#000000' },
    { name: 'Word highlight', font: 'Arial', bold: true, color: '#ffffff', stroke: '#000000', sw: 5, karaoke: true, hi: '#ffe14d' },
    { name: 'Highlighter', font: 'Arial', bold: true, color: '#111111', stroke: '#000000', sw: 0, bg: '#ffe14d' },
    { name: 'Retro screen', font: 'Courier New', bold: true, color: '#33ff66', stroke: '#000000', sw: 0, bg: '#000000dd' },
  ];
  const STICKERS = ['v:heart', 'v:star5', 'v:burst16', 'v:bolt', 'v:check', 'v:arrowr', 'v:flower5', 'v:cloud', 'v:crescent', 'v:drop', 'v:star4', 'v:scallop',
    '😀', '😂', '😍', '🥳', '😎', '🤯', '🔥', '✨', '💥', '⭐', '❤️', '👍', '👏', '🎉', '🎈', '💯', '✅', '❌', '⚡', '🌈', '☀️', '🌙', '🎵', '💬', '👀', '🙌', '💖', '🚀', '🦄', '🐶', '🐱', '🍕', '🏆', '💡', '📣', '⏰'];
  const VCOL = { 'v:heart': '#ff3b6b', 'v:star5': '#ffcc00', 'v:burst16': '#ff9f1c', 'v:bolt': '#ffe14d', 'v:check': '#22c55e', 'v:arrowr': '#38bdf8', 'v:flower5': '#ff7ab6', 'v:cloud': '#e5e7eb', 'v:crescent': '#fde68a', 'v:drop': '#60a5fa', 'v:star4': '#fff7ae', 'v:scallop': '#c084fc' };

  const mkCaption = (text, start, dur, st) => { const a = V(), p = a.project(); return { id: a.uid(), kind: 'text', cap: true, start, dur, text, font: 'Arial', size: Math.round(Math.min(p.w, p.h) / 14), color: '#ffffff', stroke: '#000000', sw: 4, bold: true, italic: false, x: 0.5, y: 0.82, maxw: 0.86, ...st }; };
  const applyStyle = (c, st) => { Object.assign(c, { bg: null, glow: null, upper: false, karaoke: false, sw: 0 }, st); };
  const ts = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
  const parseT = s => { const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s.trim()); return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]) : NaN; };
  function parseSubs(txt) { const out = []; for (const block of txt.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n\s*\n/)) { const lines = block.split('\n').filter(l => l.trim() !== ''), i = lines.findIndex(l => l.includes('-->')); if (i < 0) continue;
      const [a, b] = lines[i].split('-->'), s = parseT(a), e = parseT(b.trim().split(/\s/)[0]); const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim(); if (Number.isFinite(s) && Number.isFinite(e) && e > s && text) out.push({ s, e, text }); } return out; }
  const caps = () => V().project().clips.filter(c => c.kind === 'text' && c.cap).sort((a, b) => a.start - b.start);
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  function dialog(startTab) {
    document.getElementById('vtdlg')?.remove(); const back = document.createElement('div'); back.id = 'vtdlg';
    back.innerHTML = '<div class="box"><h3>Captions and stickers</h3><div class="tabs"><button data-t="styles">Caption styles</button><button data-t="list">Caption list</button><button data-t="stickers">Animated stickers</button></div><div id="vt-body"></div><div class="bar"><button id="vt-close" class="pri">Done</button></div></div>';
    document.body.append(back); const body = back.querySelector('#vt-body'); let curStyle = 0, anim = 'bounce'; back.onclick = ev => { if (ev.target === back) back.remove(); }; back.querySelector('#vt-close').onclick = () => back.remove();
    const tab = t => { back.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); body.textContent = ''; ({ styles, list, stickers })[t](); };
    back.querySelectorAll('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.t));

    function styles() {
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Click a style to add a caption at the playhead, or to restyle all captions. Edit words and timing in Caption list.'; body.append(hint);
      const grid = document.createElement('div'); grid.className = 'cgrid'; body.append(grid);
      STYLES.forEach((st, i) => { const b = document.createElement('button'), cv = document.createElement('canvas'); cv.width = 300; cv.height = 110; const c = cv.getContext('2d'); c.fillStyle = '#2b2d3a'; c.fillRect(0, 0, 300, 110);
        const o = { ...st, size: 34, text: st.upper ? 'YOUR CAPTION' : 'Your caption', x: 0.5, y: 0.5, start: 0, dur: 1 }; // little preview drawn the same way the video draws it
        c.font = `${o.bold ? 700 : 400} 34px ${SMA.cssFamily ? SMA.cssFamily(o.font) : o.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (o.bg) { const w = c.measureText(o.text).width + 24; c.fillStyle = o.bg; c.beginPath(); c.roundRect(150 - w / 2, 55 - 26, w, 52, 18); c.fill(); }
        if (o.sw) { c.lineWidth = Math.min(o.sw, 5) * 2; c.strokeStyle = o.stroke; c.lineJoin = 'round'; c.strokeText(o.text, 150, 55); }
        if (o.glow) { c.shadowColor = o.glow; c.shadowBlur = 14; } c.fillStyle = o.color; c.fillText(o.text, 150, 55); b.append(cv); b.title = st.name; b.onclick = () => useStyle(st); const lab = document.createElement('small'); lab.textContent = st.name; lab.style.display = 'block'; lab.style.padding = '2px'; b.append(lab); grid.append(b); });
      const bar = document.createElement('div'); bar.className = 'bar'; const all = document.createElement('button'); all.textContent = 'Restyle all captions with the last style used'; all.onclick = () => { const a = V(); const st = STYLES[curStyle]; a.commit(); caps().forEach(c => applyStyle(c, st)); a.refreshAll(); a.draw(); }; bar.append(all); body.append(bar);
    }
    function useStyle(st) { const a = V(); curStyle = STYLES.indexOf(st); a.commit(); const c = mkCaption('Your caption', a.time(), 2.5, {}); applyStyle(c, st); a.project().clips.push(c); a.select(c.id); tab('list'); }
    function list() {
      const a = V(), hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Times are in seconds. Import a .srt or .vtt file you already have, or type captions in. Everything stays on this device.'; body.append(hint);
      const rows = document.createElement('div'); body.append(rows);
      const paint = () => { rows.textContent = ''; const L = caps(); if (!L.length) rows.textContent = 'No captions yet. Add one below or pick a style.';
        L.forEach(c => { const r = document.createElement('div'); r.className = 'caprow'; const mk = (v, k, t = 'number') => { const i = document.createElement('input'); i.type = t; if (t === 'number') { i.step = 0.1; i.min = 0; } i.value = t === 'number' ? +c[k].toFixed(2) : c[k];
            i.onfocus = () => { i._c = false; }; i.oninput = () => { if (!i._c) { a.commit(); i._c = true; } c[k] = t === 'number' ? Math.max(k === 'dur' ? 0.1 : 0, +i.value || 0) : i.value; a.refreshAll(); a.draw(); }; return i; };
          const del = document.createElement('button'); del.textContent = '×'; del.title = 'Remove'; del.onclick = () => { a.commit(); const p = a.project(); p.clips = p.clips.filter(x => x !== c); a.refreshAll(); a.draw(); paint(); };
          r.append(mk(c.start, 'start'), mk(c.dur, 'dur'), mk(c.text, 'text', 'text'), del); r.firstChild.title = 'Start (s)'; r.children[1].title = 'Length (s)'; rows.append(r); }); };
      paint(); const bar = document.createElement('div'); bar.className = 'bar';
      const add = document.createElement('button'); add.textContent = '+ Caption at the playhead'; add.onclick = () => { a.commit(); const c = mkCaption('New caption', a.time(), 2.5, {}); applyStyle(c, STYLES[curStyle]); a.project().clips.push(c); a.refreshAll(); a.draw(); paint(); }; 
      const imp = document.createElement('button'); imp.textContent = 'Import .srt / .vtt…'; imp.onclick = () => { const f = document.createElement('input'); f.type = 'file'; f.accept = '.srt,.vtt,text/vtt'; f.onchange = async () => { const items = parseSubs(await f.files[0].text()); if (!items.length) { alert('No captions found in that file.'); return; } a.commit(); items.forEach(i => { const c = mkCaption(i.text, i.s, i.e - i.s, {}); applyStyle(c, STYLES[curStyle]); a.project().clips.push(c); }); a.refreshAll(); a.draw(); paint(); }; f.click(); };
      const srt = document.createElement('button'); srt.textContent = 'Save .srt'; srt.onclick = () => { const L = caps(); if (!L.length) return; download('captions.srt', L.map((c, i) => `${i + 1}\n${ts(c.start).replace('.', ',')} --> ${ts(c.start + c.dur).replace('.', ',')}\n${c.text}\n`).join('\n'), 'text/plain'); };
      const vtt = document.createElement('button'); vtt.textContent = 'Save .vtt'; vtt.onclick = () => { const L = caps(); if (!L.length) return; download('captions.vtt', 'WEBVTT\n\n' + L.map(c => `${ts(c.start)} --> ${ts(c.start + c.dur)}\n${c.text}\n`).join('\n'), 'text/vtt'); };
      bar.append(add, imp, srt, vtt); body.append(bar);
    }
    function stickers() {
      const a = V(), row = document.createElement('div'); row.className = 'bar'; row.style.justifyContent = 'flex-start'; const sel = document.createElement('select'); a.ANIMS.forEach(([v, n]) => sel.add(new Option(n, v, false, v === anim))); sel.onchange = () => { anim = sel.value; }; row.append('Animation: ', sel); body.append(row);
      const grid = document.createElement('div'); grid.className = 'sgrid2'; body.append(grid);
      STICKERS.forEach(g => { const b = document.createElement('button'); if (g.startsWith('v:')) { const sh = SMA_SHAPES.byId[g.slice(2)]; b.innerHTML = `<svg width="34" height="34" viewBox="0 0 40 40"><path d="${sh.d(40, 40)}" fill="${VCOL[g]}"/></svg>`; } else b.textContent = g; b.title = g.replace('v:', '');
        b.onclick = () => { const p = a.project(); a.commit(); const c = { id: a.uid(), kind: 'sticker', start: a.time(), dur: 3, glyph: g, color: VCOL[g], anim, speed2: 1, scale: 0.22, x: 0.5, y: 0.5, rot: 0, opacity: 1 }; p.clips.push(c); a.select(c.id); }; grid.append(b); });
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Click a sticker to add it at the playhead. Drag it in the preview to place it, and change its animation, size and speed in the panel on the right.'; body.append(hint);
    }
    tab(startTab);
  }
  function init() { const c = $('#v-captions'), s = $('#v-stickers'); if (!c || c.dataset.on) return; c.dataset.on = 1; c.onclick = () => dialog('styles'); s.onclick = () => dialog('stickers'); }
  window.SMA_VIDTOOLS = { STYLES, parseSubs, ts, parseT, STICKERS };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
