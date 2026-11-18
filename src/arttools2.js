// Design editor tools, part 2: sticky notes, tables with a safe spreadsheet-style formula engine (and ready-made sheet
// templates), and the signature maker (type, draw or upload; saved on this device only). Original code.
(function () {
  const X = window.SMA_EXT, NS = 'http://www.w3.org/2000/svg', api = () => window.SMA.ext;
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const mc = document.createElement('canvas').getContext('2d');
  const fam = f => (window.SMA && SMA.cssFamily ? SMA.cssFamily(f || 'Arial') : f || 'Arial');
  function wrap(text, fs, font, maxW, bold) { // greedy word wrap using the real font metrics
    mc.font = `${bold ? '700 ' : ''}${fs}px ${fam(font)}`; const out = [];
    for (const para of String(text).split('\n')) { let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word;
      if (mc.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = word; } } out.push(line); }
    return out;
  }

  // ---------- sticky notes ----------
  const NOTE_COLORS = ['#fff3a3', '#ffd1dc', '#c7f0d8', '#c8e3ff', '#e5d4ff', '#ffd9a8'];
  X.types.sticky = {
    label: 'Sticky note', generic: false,
    draw(e, g) {
      el('rect', { x: 6, y: 8, width: e.w, height: e.h, fill: '#000', opacity: 0.18 }, g);
      el('rect', { width: e.w, height: e.h, fill: e.fill }, g);
      el('polygon', { points: `${e.w - 28},${e.h} ${e.w},${e.h - 28} ${e.w},${e.h}`, fill: '#000', opacity: 0.12 }, g);
      const fs = e.fontSize, lines = wrap(e.text, fs, 'Arial', e.w - 36), t = el('text', { 'font-family': fam('Arial'), 'font-size': fs, fill: '#2b2b2b', 'xml:space': 'preserve' }, g);
      lines.slice(0, Math.max(1, Math.floor((e.h - 30) / (fs * 1.25)))).forEach((l, i) => { const s = el('tspan', { x: 18, y: 18 + fs * 0.9 + i * fs * 1.25 }, t); s.textContent = l || ' '; });
    },
    props(e, p, H) {
      const t = document.createElement('textarea'); t.id = 'sticky-text'; t.value = e.text; t.oninput = () => { if (!t._c) { H.commit(); t._c = true; } e.text = t.value; H.render(); }; t.onblur = () => { t._c = false; };
      const sw = document.createElement('div'); sw.className = 'sw'; NOTE_COLORS.forEach(c => { const b = document.createElement('button'); b.className = 'swatch' + (c === e.fill ? ' on' : ''); b.style.background = c; b.onclick = () => { H.commit(); e.fill = c; H.render(); }; sw.append(b); });
      p.append(t, H.row('Color', sw), H.row('Text size', H.field(e, 'fontSize', 'number', { min: 10 })));
    },
  };

  // ---------- formulas (a small parser: no eval, no function calls beyond the list) ----------
  const colN = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const colL = n => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  const FN = {
    SUM: a => a.reduce((x, y) => x + y, 0), AVERAGE: a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN), MIN: a => (a.length ? Math.min(...a) : 0), MAX: a => (a.length ? Math.max(...a) : 0),
    COUNT: a => a.length, ROUND: a => { const k = 10 ** (a[1] || 0); return Math.round(a[0] * k) / k; }, ABS: a => Math.abs(a[0]),
  };
  function evalCell(e, r, c, stack) {
    const raw = (e.cells[r] && e.cells[r][c]) || '', s = String(raw).trim();
    if (s[0] !== '=') { const n = Number(s.replace(/,/g, '')); return s !== '' && Number.isFinite(n) ? n : raw; }
    const key = r + ',' + c; if (stack.includes(key)) return '#CYCLE'; stack = stack.concat(key);
    const toks = s.slice(1).toUpperCase().match(/[A-Z]+\d+:[A-Z]+\d+|[A-Z]+\d+|[A-Z]+(?=\()|\d*\.?\d+|[-+*/(),]/g) || []; let i = 0;
    const get = (rr, cc) => { if (rr < 0 || cc < 0 || rr >= e.rows || cc >= e.cols) throw new Error('#REF!'); return evalCell(e, rr, cc, stack); };
    const ref = t => { const m = /^([A-Z]+)(\d+)$/.exec(t); return [+m[2] - 1, colN(m[1])]; };
    const nums = v => (Array.isArray(v) ? v : [v]);
    function prim() {
      const t = toks[i++]; if (t === undefined) throw new Error('#ERR');
      if (t === '(') { const v = expr(); if (toks[i++] !== ')') throw new Error('#ERR'); return v; }
      if (/^\d*\.?\d+$/.test(t)) return +t;
      if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(t)) { const [a, b] = t.split(':'), [r1, c1] = ref(a), [r2, c2] = ref(b), out = [];
        for (let rr = Math.min(r1, r2); rr <= Math.max(r1, r2); rr++) for (let cc = Math.min(c1, c2); cc <= Math.max(c1, c2); cc++) { const v = get(rr, cc); if (typeof v === 'number') out.push(v); else if (typeof v === 'string' && v.startsWith('#')) throw new Error(v); } return out; }
      if (/^[A-Z]+\d+$/.test(t)) { const v = get(...ref(t)); if (typeof v === 'string' && v.startsWith('#')) throw new Error(v); return typeof v === 'number' ? v : 0; }
      if (FN[t] && toks[i] === '(') { i++; const args = []; if (toks[i] !== ')') { do { args.push(expr()); } while (toks[i] === ',' && ++i); } if (toks[i++] !== ')') throw new Error('#ERR'); return FN[t](args.flatMap(nums)); }
      throw new Error('#ERR');
    }
    const num = v => (Array.isArray(v) ? FN.SUM(v) : v);
    function unary() { if (toks[i] === '-') { i++; return -num(unary()); } if (toks[i] === '+') { i++; return num(unary()); } return prim(); }
    function term() { let v = unary(); while (toks[i] === '*' || toks[i] === '/') { const op = toks[i++], r = num(unary()); if (op === '/' && r === 0) throw new Error('#DIV/0!'); v = op === '*' ? num(v) * r : num(v) / r; } return v; }
    function expr() { let v = term(); while (toks[i] === '+' || toks[i] === '-') { const op = toks[i++], r = num(term()); v = op === '+' ? num(v) + r : num(v) - r; } return v; }
    try { const v = num(expr()); if (i < toks.length) return '#ERR'; return Number.isFinite(v) ? v : '#ERR'; } catch (er) { return String(er.message || '#ERR').startsWith('#') ? er.message : '#ERR'; }
  }
  const fmtVal = v => (typeof v === 'number' ? String(+v.toFixed(2)) : String(v));

  // ---------- tables ----------
  function sizeCells(e) { const c = []; for (let r = 0; r < e.rows; r++) { c.push([]); for (let k = 0; k < e.cols; k++) c[r].push((e.cells[r] && e.cells[r][k]) || ''); } e.cells = c; }
  X.types.table = {
    label: 'Table', generic: false,
    draw(e, g) {
      const cw = e.w / e.cols, rh = e.h / e.rows, fs = e.fontSize;
      for (let r = 0; r < e.rows; r++) for (let c = 0; c < e.cols; c++) {
        const head = e.header && r === 0, band = e.banded && !head && r % 2 === 0;
        el('rect', { x: c * cw, y: r * rh, width: cw, height: rh, fill: head ? e.headFill : band ? e.bandFill : e.cellFill, stroke: e.border, 'stroke-width': 1.5 }, g);
        const v = evalCell(e, r, c, []), str = fmtVal(v), isNum = typeof v === 'number';
        if (str === '') continue;
        const lines = wrap(str, fs, 'Arial', cw - 14, head).slice(0, Math.max(1, Math.floor((rh - 6) / (fs * 1.2)))), t = el('text', { 'font-family': fam('Arial'), 'font-size': fs, 'font-weight': head ? 700 : 400, fill: head ? e.headText : e.text, 'text-anchor': isNum ? 'end' : 'start', 'xml:space': 'preserve' }, g);
        const y0 = r * rh + (rh - lines.length * fs * 1.2) / 2 + fs * 0.9;
        lines.forEach((l, i) => { const s = el('tspan', { x: c * cw + (isNum ? cw - 7 : 7), y: y0 + i * fs * 1.2 }, t); s.textContent = l; });
      }
    },
    props(e, p, H) {
      const dim = (key, label) => { const i = document.createElement('input'); i.type = 'number'; i.min = 1; i.max = 26; i.value = e[key]; i.id = 'tb-' + key;
        i.onchange = () => { const v = Math.max(1, Math.min(key === 'cols' ? 26 : 60, Math.round(+i.value) || 1)); H.commit(); const oldH = e.h / e.rows, oldW = e.w / e.cols; e[key] = v; sizeCells(e); if (key === 'rows') e.h = oldH * v; else e.w = oldW * v; H.render(); }; return H.row(label, i); };
      const chk = (key, label) => { const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!e[key]; i.onchange = () => { H.commit(); e[key] = i.checked; H.render(); }; return H.row(label, i); };
      p.append(dim('rows', 'Rows'), dim('cols', 'Columns'), chk('header', 'Header row'), chk('banded', 'Striped rows'), H.row('Text size', H.field(e, 'fontSize', 'number', { min: 8 })),
        H.row('Header color', H.field(e, 'headFill', 'color')), H.row('Border', H.field(e, 'border', 'color')), H.row('Text', H.field(e, 'text', 'color')));
      H.h('Cells'); const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Type numbers or text. Start with = for a formula: =B2*C2, =SUM(B2:B5), AVERAGE, MIN, MAX, COUNT, ROUND.'; p.append(hint);
      const grid = document.createElement('div'); grid.className = 'tgrid'; grid.style.gridTemplateColumns = `24px repeat(${e.cols}, minmax(54px, 1fr))`; grid.append(document.createElement('span'));
      for (let c = 0; c < e.cols; c++) { const l = document.createElement('span'); l.textContent = colL(c); grid.append(l); }
      for (let r = 0; r < e.rows; r++) { const l = document.createElement('span'); l.textContent = r + 1; grid.append(l);
        for (let c = 0; c < e.cols; c++) { const i = document.createElement('input'); i.id = `tc-${r}-${c}`; i.value = e.cells[r][c]; i.title = colL(c) + (r + 1);
          i.onfocus = () => { i._c = false; }; i.oninput = () => { if (!i._c) { H.commit(); i._c = true; } e.cells[r][c] = i.value; H.render(); }; grid.append(i); } }
      p.append(grid);
    },
  };
  const newTable = (rows, cols, o = {}) => { const A = api(), d = A.doc(), w = Math.min(d.w * 0.8, cols * 150), h = rows * 56;
    const e = A.mk('table', { rows, cols, cells: [], header: true, banded: false, fontSize: 24, w, h, x: (d.w - w) / 2, y: (d.h - h) / 2, headFill: '#8b5cf6', headText: '#ffffff', cellFill: '#ffffff', bandFill: '#f3efff', border: '#c9c3d9', text: '#222222', ...o });
    sizeCells(e); if (o.cells) { e.cells = o.cells; sizeCells(e); } return A.add(e); };

  const TEMPLATES = [
    { name: 'Monthly budget', rows: 7, cols: 4, cells: [['Category', 'Planned', 'Actual', 'Difference'], ['Rent', '1200', '1200', '=C2-B2'], ['Food', '400', '455', '=C3-B3'], ['Transport', '150', '120', '=C4-B4'], ['Fun', '100', '140', '=C5-B5'], ['Savings', '300', '300', '=C6-B6'], ['Total', '=SUM(B2:B6)', '=SUM(C2:C6)', '=SUM(D2:D6)']], banded: true },
    { name: 'Invoice', rows: 6, cols: 4, cells: [['Item', 'Qty', 'Price', 'Total'], ['Design work', '3', '80', '=B2*C2'], ['Printing', '10', '4.5', '=B3*C3'], ['Delivery', '1', '15', '=B4*C4'], ['', '', '', ''], ['', '', 'Total', '=SUM(D2:D5)']] },
    { name: 'Grade book', rows: 5, cols: 5, cells: [['Student', 'Test 1', 'Test 2', 'Test 3', 'Average'], ['Ada', '92', '88', '95', '=ROUND(AVERAGE(B2:D2),1)'], ['Ben', '75', '81', '79', '=ROUND(AVERAGE(B3:D3),1)'], ['Cleo', '88', '90', '84', '=ROUND(AVERAGE(B4:D4),1)'], ['Class', '=AVERAGE(B2:B4)', '=AVERAGE(C2:C4)', '=AVERAGE(D2:D4)', '=ROUND(AVERAGE(E2:E4),1)']], banded: true },
    { name: 'Weekly planner', rows: 6, cols: 6, cells: [['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ['Morning', '', '', '', '', ''], ['Noon', '', '', '', '', ''], ['Afternoon', '', '', '', '', ''], ['Evening', '', '', '', '', ''], ['Notes', '', '', '', '', '']] },
    { name: 'Habit tracker', rows: 5, cols: 8, cells: [['Habit', 'M', 'T', 'W', 'T', 'F', 'S', 'S'], ['Water', '', '', '', '', '', '', ''], ['Read', '', '', '', '', '', '', ''], ['Walk', '', '', '', '', '', '', ''], ['Sleep 8h', '', '', '', '', '', '', '']], banded: true },
    { name: 'Task list', rows: 6, cols: 4, cells: [['Task', 'Owner', 'Due', 'Done'], ['Draft', '', '', ''], ['Review', '', '', ''], ['Revise', '', '', ''], ['Publish', '', '', ''], ['Celebrate', '', '', '']], banded: true },
  ];

  function tablesFly(box) {
    const h = document.createElement('h4'); h.textContent = 'Tables'; box.append(h);
    const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = 'Pick a size'; box.append(cap);
    const lab = document.createElement('div'); lab.className = 'cap'; lab.textContent = '3 × 3'; const g = document.createElement('div'); g.className = 'tpick'; let hr = 3, hc = 3;
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const b = document.createElement('button'); b.dataset.r = r; b.dataset.c = c;
      b.onmouseenter = () => { hr = r; hc = c; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c)); lab.textContent = `${c} columns × ${r} rows`; }; b.onclick = () => { newTable(r, c); SMA_ARTTOOLS.closeFly(); }; g.append(b); }
    box.append(g, lab);
    const t = document.createElement('div'); t.className = 'cap'; t.textContent = 'Sheet templates (formulas included)'; box.append(t);
    TEMPLATES.forEach(tp => { const b = document.createElement('button'); b.className = 'tpl'; b.textContent = tp.name + '  ·  ' + tp.cols + '×' + tp.rows; b.onclick = () => { newTable(tp.rows, tp.cols, { cells: tp.cells.map(r => r.slice()), banded: !!tp.banded }); SMA_ARTTOOLS.closeFly(); }; box.append(b); });
  }

  // ---------- signature maker ----------
  const SIGKEY = 'sma.signatures', INKS = ['#111111', '#1e3a8a', '#7c2d12', '#065f46'];
  const loadSigs = () => { try { return JSON.parse(localStorage.getItem(SIGKEY) || '[]'); } catch (e) { return []; } };
  const saveSigs = l => { try { localStorage.setItem(SIGKEY, JSON.stringify(l.slice(0, 8))); } catch (e) {} };
  function trim(cv) { // crop to the ink, with a little breathing room, transparent background
    const c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null; const pad = 8, o = document.createElement('canvas'); o.width = x1 - x0 + pad * 2; o.height = y1 - y0 + pad * 2; o.getContext('2d').drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1); return o;
  }
  function insertSig(url, w, h) { const A = api(), d = A.doc(), W = Math.min(d.w * 0.35, 360), H = W * h / w; A.add(A.mk('image', { src: url, w: W, h: H, nw: w, nh: h, x: (d.w - W) / 2, y: (d.h - H) / 2 })); }
  function signatureDialog() {
    const back = document.createElement('div'); back.id = 'sigdlg'; back.innerHTML = `<div class="box"><h3>Signature</h3><div class="tabs"><button data-t="type" class="on">Type</button><button data-t="draw">Draw</button><button data-t="upload">Upload</button></div>
      <div class="pane" data-p="type"><label class="sig-lab" for="sig-name">Type your name, then pick a style</label><input id="sig-name" placeholder="Your name" maxlength="40" autocomplete="off" spellcheck="false"><div id="sig-fontrow"></div><div id="sig-styles"></div></div>
      <div class="pane" data-p="draw" hidden><canvas id="sig-pad" width="560" height="200"></canvas><button id="sig-clear">Clear</button></div>
      <div class="pane" data-p="upload" hidden><input id="sig-file" type="file" accept="image/*"><p class="hint">A photo of a signature on white paper works best. The paper becomes transparent. It stays on this device.</p><canvas id="sig-up" width="560" height="200"></canvas></div>
      <div class="inks"></div><div class="mine"><div class="cap">Saved on this device</div><div id="sig-saved"></div></div>
      <div class="bar"><button id="sig-cancel">Cancel</button><button id="sig-save">Save</button><button id="sig-use" class="pri">Add to design</button></div></div>`;
    document.body.append(back); const $ = s => back.querySelector(s); let tab = 'type', ink = INKS[0], styleIx = 0, upImg = null;
    const FONTS = [['"Brush Script MT","Segoe Script","Snell Roundhand","URW Chancery L",cursive', 0.3, ''], ['"Lucida Handwriting","Apple Chancery","Z003",cursive', 0.18, ''], ['Georgia,"Times New Roman",serif', 0.1, 'italic '], ['"Helvetica Neue",Arial,sans-serif', 0.25, 'italic 700 ']]; // your system's script fonts when it has them, slanted either way
    const inks = $('.inks'); INKS.forEach(c => { const b = document.createElement('button'); b.className = 'swatch' + (c === ink ? ' on' : ''); b.style.background = c; b.onclick = () => { ink = c; inks.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b)); refresh(); }; inks.append(b); });
    let customFont = ''; const fontOf = ix => (ix === 4 ? ['"' + customFont.replace(/["\\]/g, '') + '", cursive', 0, ''] : FONTS[ix]); // 4 = a font you picked yourself
    const typed = (name, ix, sz = 96) => { const cv = document.createElement('canvas'); cv.width = 900; cv.height = 220; const c = cv.getContext('2d'), [fam, skew, pre] = fontOf(ix); c.fillStyle = ink; c.font = `${pre}${sz}px ${fam}`; c.textBaseline = 'middle'; c.setTransform(1, 0, -skew, 1, 20 + skew * 110, 0); c.fillText(name, 0, 110); return cv; };
    const styles = $('#sig-styles'); const refresh = () => { styles.textContent = ''; const nm = $('#sig-name').value || 'Your name'; [...FONTS, ...(customFont ? [0] : [])].forEach((_f, i) => { const b = document.createElement('button'); b.className = i === styleIx ? 'on' : ''; const cv = typed(nm, i, 60); cv.style.width = '100%'; b.append(cv); b.onclick = () => { styleIx = i; refresh(); $('#sig-name').focus(); }; styles.append(b); }); if (tab === 'upload') drawUpload(); };
    $('#sig-name').oninput = refresh;
    if (window.SMA_FONTS) { const row = $('#sig-fontrow'); row.append(document.createTextNode('Or use any font on this computer or one you added: ')); row.append(window.SMA_FONTS.pick('Choose a font…', n => { customFont = n; styleIx = 4; refresh(); $('#sig-name').focus(); })); }
    const typeAnywhere = ev => { // typing anywhere while this window is open goes into the name box
      if (!back.isConnected) { document.removeEventListener('keydown', typeAnywhere, true); return; }
      if (tab === 'type' && ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) $('#sig-name').focus();
      else if (ev.key === 'Escape' && !document.querySelector('.fp-pop')) back.remove(); };
    document.addEventListener('keydown', typeAnywhere, true);
    const pad = $('#sig-pad'), pc = pad.getContext('2d'); let down = false, last = null; pc.lineWidth = 4; pc.lineCap = pc.lineJoin = 'round';
    const pp = ev => { const r = pad.getBoundingClientRect(); return [(ev.clientX - r.left) * pad.width / r.width, (ev.clientY - r.top) * pad.height / r.height]; };
    pad.onpointerdown = ev => { down = true; last = pp(ev); pad.setPointerCapture(ev.pointerId); pc.strokeStyle = ink; pc.beginPath(); pc.moveTo(...last); pc.lineTo(last[0] + 0.1, last[1]); pc.stroke(); };
    pad.onpointermove = ev => { if (!down) return; const p = pp(ev), m = [(last[0] + p[0]) / 2, (last[1] + p[1]) / 2]; pc.strokeStyle = ink; pc.beginPath(); pc.moveTo(...last); pc.quadraticCurveTo(last[0], last[1], m[0], m[1]); pc.stroke(); last = p; };
    pad.onpointerup = () => { down = false; }; $('#sig-clear').onclick = () => pc.clearRect(0, 0, pad.width, pad.height);
    const up = $('#sig-up'), drawUpload = () => { const c = up.getContext('2d'); c.clearRect(0, 0, up.width, up.height); if (!upImg) return; const k = Math.min(up.width / upImg.width, up.height / upImg.height), w = upImg.width * k, h = upImg.height * k; c.drawImage(upImg, (up.width - w) / 2, (up.height - h) / 2, w, h);
      const d = c.getImageData(0, 0, up.width, up.height), a = d.data, r = parseInt(ink.slice(1, 3), 16), g = parseInt(ink.slice(3, 5), 16), b = parseInt(ink.slice(5, 7), 16);
      for (let i = 0; i < a.length; i += 4) { const lum = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11); const al = Math.max(0, Math.min(255, (225 - lum) * 2.6)) * (a[i + 3] / 255); a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = al; } c.putImageData(d, 0, 0); };
    $('#sig-file').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const u = URL.createObjectURL(f), im = new Image(); im.onload = () => { upImg = im; drawUpload(); URL.revokeObjectURL(u); }; im.src = u; };
    const current = () => { const cv = tab === 'type' ? typed($('#sig-name').value || '', styleIx) : tab === 'draw' ? pad : up; const t = trim(cv); return t ? { url: t.toDataURL('image/png'), w: t.width, h: t.height } : null; };
    back.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; back.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); back.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.p !== tab; }); refresh(); if (tab === 'type') $('#sig-name').focus(); });
    const paintSaved = () => { const box = $('#sig-saved'); box.textContent = ''; const l = loadSigs(); if (!l.length) box.textContent = 'Nothing saved yet.'; l.forEach((s, i) => { const w = document.createElement('div'); w.className = 'sv'; const im = new Image(); im.src = s.url; im.title = 'Add to design'; im.onclick = () => { insertSig(s.url, s.w, s.h); close(); }; const x = document.createElement('button'); x.textContent = '×'; x.title = 'Remove'; x.onclick = () => { const n = loadSigs(); n.splice(i, 1); saveSigs(n); paintSaved(); }; w.append(im, x); box.append(w); }); };
    const close = () => back.remove();
    $('#sig-cancel').onclick = close; back.onclick = ev => { if (ev.target === back) close(); };
    $('#sig-save').onclick = () => { const s = current(); if (!s) { alert('Nothing to save yet.'); return; } const l = loadSigs(); l.unshift(s); saveSigs(l); paintSaved(); };
    $('#sig-use').onclick = () => { const s = current(); if (!s) { alert('Type, draw or upload a signature first.'); return; } insertSig(s.url, s.w, s.h); close(); };
    refresh(); paintSaved(); setTimeout(() => $('#sig-name').focus(), 0);
  }

  function init() {
    const T = window.SMA_ARTTOOLS, rail = document.getElementById('tools'); if (!T || !rail || rail.dataset.art2) return; rail.dataset.art2 = 1;
    const after = rail.querySelector('[data-tool=shapes]') || rail.lastElementChild;
    const notes = T.mkBtn('notes', '🗒', 'Notes', () => { const A = api(), d = A.doc(); T.closeFly(); A.add(A.mk('sticky', { text: 'Write a note…', fill: NOTE_COLORS[0], fontSize: 30, w: 300, h: 300, x: d.w / 2 - 150, y: d.h / 2 - 150 })); });
    const tables = T.mkBtn('tables', '▦', 'Tables', b => T.openFly(b, tablesFly));
    const sign = T.mkBtn('sign', '✍', 'Sign', () => { T.closeFly(); signatureDialog(); });
    after.after(notes, tables, sign); window.SMA.render();
  }
  window.SMA_ARTTOOLS2 = { evalCell, TEMPLATES, newTable, FN };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else init();
})();
