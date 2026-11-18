// Design editor tools: pens (pen, marker, felt tip, highlighter, eraser), the shape library with search, and
// lines with arrow/dot/diamond/square/bar ends and dash styles. Registers new element kinds in SMA_EXT and adds the
// Pens and Shapes buttons to the tool rail. Original code, everything stays in the document so it exports cleanly.
(function () {
  const X = window.SMA_EXT = window.SMA_EXT || { types: {} };
  const api = () => window.SMA.ext, SH = window.SMA_SHAPES, NS = 'http://www.w3.org/2000/svg';
  const f2 = n => +(+n).toFixed(2);

  // ---------- pen settings ----------
  const BRUSHES = { pen: { name: 'Pen', sw: 4, op: 1, cap: 'round' }, marker: { name: 'Marker', sw: 14, op: 0.9, cap: 'round' }, felt: { name: 'Felt tip', sw: 9, op: 1, cap: 'round' }, highlighter: { name: 'Highlighter', sw: 30, op: 0.4, cap: 'square' } };
  const PALETTE = ['#000000', '#545454', '#a6a6a6', '#ffffff', '#ff3131', '#ff914d', '#ffde59', '#7ed957', '#03989e', '#38b6ff', '#5271ff', '#8c52ff', '#cb6ce6', '#ff66c4', '#ff5757', '#00bf63'];
  const S = { brush: 'pen', color: '#000000', sw: 4, op: 1, tool: null, shapeFill: '#8b5cf6' };

  // ---------- geometry helpers ----------
  function rdp(pts, eps) { // thins a stroke: drops points that barely change its shape
    if (pts.length < 3) return pts; const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1]; let m = 0, mi = 0; const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (d > m) { m = d; mi = i; } }
    if (m <= eps) return [pts[0], pts[pts.length - 1]]; return rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps));
  }
  function smooth(pts) { // quadratic curves through the midpoints: smooth, but still passes close to every point
    if (pts.length === 1) return `M${f2(pts[0][0])} ${f2(pts[0][1])}l0.01 0`;
    if (pts.length === 2) return `M${f2(pts[0][0])} ${f2(pts[0][1])}L${f2(pts[1][0])} ${f2(pts[1][1])}`;
    let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += `Q${f2(pts[i][0])} ${f2(pts[i][1])} ${f2(mx)} ${f2(my)}`; }
    const l = pts[pts.length - 1]; return d + `L${f2(l[0])} ${f2(l[1])}`;
  }
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  // ---------- element kind: freehand stroke ----------
  X.types.path = {
    label: 'Drawing', generic: false,
    draw(e, g) {
      const pts = e.pts.map(([x, y]) => [x * e.w, y * e.h]), d = smooth(pts), B = BRUSHES[e.brush] || BRUSHES.pen;
      el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(e.sw, 16), 'pointer-events': 'stroke', 'stroke-linecap': 'round' }, g); // easy to grab
      el('path', { d, fill: 'none', stroke: e.stroke, 'stroke-width': e.sw, 'stroke-linecap': B.cap, 'stroke-linejoin': 'round' }, g);
    },
    props(e, p, H) {
      const sel = document.createElement('select'); Object.entries(BRUSHES).forEach(([k, b]) => sel.add(new Option(b.name, k))); sel.value = e.brush;
      sel.onchange = () => { H.commit(); e.brush = sel.value; H.render(); };
      p.append(H.row('Brush', sel), H.row('Color', H.field(e, 'stroke', 'color')), H.row('Weight', H.field(e, 'sw', 'range', { min: 1, max: 80, step: 1 })));
    },
  };

  // ---------- element kind: library shape ----------
  X.types.shape = {
    label: 'Shape',
    draw(e, g) {
      const s = SH.byId[e.shape] || SH.byId.square;
      el('path', { d: s.d(e.w, e.h), fill: e.fill, stroke: e.sw ? e.stroke : 'none', 'stroke-width': e.sw, 'stroke-linejoin': 'round', 'fill-rule': e.shape === 'ring' || e.shape === 'frame' ? 'evenodd' : 'nonzero' }, g);
    },
  };

  // ---------- element kind: line with ends and dash styles ----------
  const ENDS = [['none', 'None'], ['arrow', 'Arrow'], ['dot', 'Dot'], ['diamond', 'Diamond'], ['square', 'Square'], ['bar', 'Bar']];
  X.types.line = {
    draw(e, g) {
      const sw = Math.max(e.sw, 1), s = sw * 3 + 5, a = e.start || 'none', b = e.end || 'none';
      const cut = k => (k === 'arrow' ? s * 0.7 : k === 'none' || k === 'bar' ? 0 : s * 0.5);
      let x1 = Math.min(cut(a), e.w / 2), x2 = e.w - Math.min(cut(b), e.w / 2);
      const dash = e.dash === 'dashed' ? `${sw * 3} ${sw * 2}` : e.dash === 'dotted' ? `0.01 ${sw * 2}` : null;
      const ln = el('line', { x1, y1: 0, x2, y2: 0, stroke: e.stroke, 'stroke-width': sw, 'stroke-linecap': e.dash === 'dashed' ? 'butt' : 'round' }, g); if (dash) ln.setAttribute('stroke-dasharray', dash);
      const mark = (k, x, dir) => { // dir: -1 at the start (points left), +1 at the end (points right)
        const P = pts => el('polygon', { points: pts.map(p => p.join(',')).join(' '), fill: e.stroke }, g);
        if (k === 'arrow') P([[x, 0], [x - dir * s, -s * 0.55], [x - dir * s, s * 0.55]]);
        else if (k === 'dot') el('circle', { cx: x - dir * s / 2, cy: 0, r: s / 2, fill: e.stroke }, g);
        else if (k === 'diamond') P([[x, 0], [x - dir * s / 2, -s / 2], [x - dir * s, 0], [x - dir * s / 2, s / 2]]);
        else if (k === 'square') P([[x, -s / 2], [x - dir * s, -s / 2], [x - dir * s, s / 2], [x, s / 2]]);
        else if (k === 'bar') P([[x - dir * sw, -s * 0.7], [x, -s * 0.7], [x, s * 0.7], [x - dir * sw, s * 0.7]]);
      };
      if (a !== 'none') mark(a, 0 + (a === 'arrow' ? 0 : 0), -1); if (b !== 'none') mark(b, e.w, 1);
    },
    props(e, p, H) {
      const mk = (key, label) => { const s = document.createElement('select'); ENDS.forEach(([v, n]) => s.add(new Option(n, v))); s.value = e[key] || 'none'; s.onchange = () => { H.commit(); e[key] = s.value; H.render(); }; p.append(H.row(label, s)); };
      mk('start', 'Start'); mk('end', 'End');
      const d = document.createElement('select'); [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']].forEach(([v, n]) => d.add(new Option(n, v))); d.value = e.dash || 'solid';
      d.onchange = () => { H.commit(); e.dash = d.value; H.render(); }; p.append(H.row('Style', d));
    },
  };

  // ---------- drawing on the page ----------
  let drawing = null, preview = null, eraserDot = null;
  const svg = () => api().svg, armed = () => !!S.tool;
  function setTool(t) { S.tool = t; const s = svg(); s.classList.toggle('tool-armed', !!t); s.style.cursor = t ? 'crosshair' : ''; document.querySelectorAll('#tools [data-tool]').forEach(b => b.classList.toggle('on', !!t && b.dataset.tool === t.group)); }
  function ensurePreview() { if (!preview || !preview.isConnected) preview = el('g', { id: 'arttool-preview', 'pointer-events': 'none' }, svg()); return preview; }
  function clearPreview() { if (preview) preview.remove(); preview = null; eraserDot = null; }

  function eraseAt([px, py]) {
    const A = api(), r = 14 / A.zoom(); let hit = false;
    for (const e of A.doc().els.slice()) {
      if (e.type !== 'path') continue; const a = -e.rot * Math.PI / 180, dx = px - (e.x + e.w / 2), dy = py - (e.y + e.h / 2);
      const lx = dx * Math.cos(a) - dy * Math.sin(a) + e.w / 2, ly = dx * Math.sin(a) + dy * Math.cos(a) + e.h / 2, pts = e.pts.map(([x, y]) => [x * e.w, y * e.h]), tol = r + e.sw / 2;
      let near = false; for (let i = 0; i < pts.length && !near; i++) { const [ax, ay] = pts[i], [bx, by] = pts[Math.min(i + 1, pts.length - 1)], vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
        const t = L ? Math.max(0, Math.min(1, ((lx - ax) * vx + (ly - ay) * vy) / L)) : 0; near = Math.hypot(lx - (ax + t * vx), ly - (ay + t * vy)) <= tol; }
      if (near) { if (!drawing.did) { A.commit(); drawing.did = true; } A.remove(e.id); hit = true; }
    }
    if (hit) A.render();
  }

  function onDown(ev) {
    if (!armed() || ev.button > 0 || ev.target.closest('[data-h]')) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); svg().setPointerCapture(ev.pointerId);
    const A = api(), p = A.pt(ev), t = S.tool; drawing = { t, p0: p, pts: [p], id: ev.pointerId };
    if (t.kind === 'eraser') { eraseAt(p); return; }
    ensurePreview(); if (t.kind === 'pen') { drawing.node = el('path', { fill: 'none', stroke: S.color, 'stroke-width': S.sw, opacity: S.op, 'stroke-linecap': BRUSHES[S.brush].cap, 'stroke-linejoin': 'round' }, preview); drawing.node.setAttribute('d', smooth([p])); }
  }
  function onMove(ev) {
    const A = api(), t = S.tool;
    if (!drawing) { if (t && t.kind === 'eraser') { const p = A.pt(ev); ensurePreview(); if (!eraserDot) eraserDot = el('circle', { fill: 'none', stroke: '#8b5cf6', 'stroke-width': 1.5 / A.zoom() }, preview); eraserDot.setAttribute('cx', p[0]); eraserDot.setAttribute('cy', p[1]); eraserDot.setAttribute('r', 14 / A.zoom()); } return; }
    ev.stopImmediatePropagation(); const p = A.pt(ev), D = drawing;
    if (D.t.kind === 'eraser') { eraseAt(p); return; }
    if (D.t.kind === 'pen') { const l = D.pts[D.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) * A.zoom() >= 1.5) { D.pts.push(p); D.node.setAttribute('d', smooth(D.pts)); } return; }
    // shape / line: drag out a box (or a line)
    let [x0, y0] = D.p0, [x1, y1] = p; D.p1 = p; D.shift = ev.shiftKey; D.node && D.node.remove();
    if (D.t.kind === 'line') { if (ev.shiftKey) { const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 12)) * Math.PI / 12, L = Math.hypot(x1 - x0, y1 - y0); x1 = x0 + Math.cos(a) * L; y1 = y0 + Math.sin(a) * L; D.p1 = [x1, y1]; }
      D.node = el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: S.color, 'stroke-width': 6, 'stroke-linecap': 'round' }, ensurePreview()); }
    else { let w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); if (ev.shiftKey) w = h = Math.max(w, h); const x = x1 < x0 ? x0 - w : x0, y = y1 < y0 ? y0 - h : y0; D.box = { x, y, w, h };
      D.node = el('path', { d: (SH.byId[D.t.id] || SH.byId.square).d(Math.max(w, 1), Math.max(h, 1)), transform: `translate(${x} ${y})`, fill: S.shapeFill, opacity: 0.8, 'fill-rule': D.t.id === 'ring' || D.t.id === 'frame' ? 'evenodd' : 'nonzero' }, ensurePreview()); }
  }
  function onUp(ev) {
    const D = drawing; if (!D) return; ev.stopImmediatePropagation(); drawing = null; const A = api(); clearPreview();
    if (D.t.kind === 'eraser') return;
    if (D.t.kind === 'pen') {
      const pts = rdp(D.pts, 0.6 / A.zoom()), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x = Math.min(...xs), y = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x), h = Math.max(1, Math.max(...ys) - y);
      A.add(A.mk('path', { x, y, w, h, pts: pts.map(q => [f2((q[0] - x) / w), f2((q[1] - y) / h)]), brush: S.brush, stroke: S.color, sw: S.sw, opacity: S.op }));
    } else if (D.t.kind === 'line') {
      const [x0, y0] = D.p0, [x1, y1] = D.p1 && Math.hypot(D.p1[0] - x0, D.p1[1] - y0) > 6 ? D.p1 : [x0 + 300, y0]; const len = Math.hypot(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      A.add(A.mk('line', { x: cx - len / 2, y: cy, w: len, h: 0, rot: Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI, stroke: '#111111', sw: 6 })); setTool(null);
    } else if (D.t.kind === 'shape') {
      const b = D.box && D.box.w > 6 && D.box.h > 6 ? D.box : { x: D.p0[0] - 150, y: D.p0[1] - 150, w: 300, h: 300 };
      A.add(A.mk('shape', { shape: D.t.id, ...b, fill: S.shapeFill })); setTool(null);
    }
  }
  function attach() { const s = svg(); s.addEventListener('pointerdown', onDown, true); s.addEventListener('pointermove', onMove, true); s.addEventListener('pointerup', onUp, true); }

  function addShape(id) { const A = api(), d = A.doc(); A.add(A.mk('shape', { shape: id, x: d.w / 2 - 150, y: d.h / 2 - 150, w: 300, h: 300, fill: S.shapeFill })); }

  // ---------- tool rail + flyouts ----------
  let fly = null, flyFor = null;
  function closeFly() { if (fly) fly.remove(); fly = null; flyFor = null; }
  function openFly(btn, build) {
    if (flyFor === btn) { closeFly(); return; } closeFly(); fly = document.createElement('div'); fly.id = 'flyout'; flyFor = btn;
    const r = btn.getBoundingClientRect(); fly.style.top = Math.max(60, Math.min(r.top, innerHeight - 420)) + 'px'; build(fly); document.body.append(fly);
  }
  const docColors = () => { const out = []; for (const e of api().doc().els) for (const c of [e.fill, e.sw && e.stroke, e.type === 'path' && e.stroke, e.type === 'line' && e.stroke]) if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) && !out.includes(c.toLowerCase())) out.push(c.toLowerCase()); return out.slice(0, 12); };
  function swatches(parent, current, onPick) {
    const wrap = document.createElement('div'); wrap.className = 'sw';
    const add = c => { const b = document.createElement('button'); b.className = 'swatch' + (c.toLowerCase() === current.toLowerCase() ? ' on' : ''); b.style.background = c; b.title = c; b.onclick = () => { onPick(c); wrap.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b)); }; wrap.append(b); };
    PALETTE.forEach(add); const cu = document.createElement('input'); cu.type = 'color'; cu.value = /^#[0-9a-f]{6}$/i.test(current) ? current : '#000000'; cu.title = 'Custom color'; cu.oninput = () => onPick(cu.value); wrap.append(cu); parent.append(wrap);
    const dc = docColors(); if (dc.length) { const l = document.createElement('div'); l.className = 'cap'; l.textContent = 'Colors in this design'; parent.append(l); const w2 = document.createElement('div'); w2.className = 'sw'; dc.forEach(c => { const b = document.createElement('button'); b.className = 'swatch'; b.style.background = c; b.title = c; b.onclick = () => onPick(c); w2.append(b); }); parent.append(w2); }
  }
  function slider(parent, label, min, max, val, fmt, on) { const l = document.createElement('label'); l.className = 'fs'; const v = document.createElement('span'); v.textContent = fmt(val); const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.value = val; i.oninput = () => { v.textContent = fmt(+i.value); on(+i.value); }; l.append(label + ' ', v, i); parent.append(l); }

  function penFly(box) {
    const h = document.createElement('h4'); h.textContent = 'Pens'; box.append(h);
    const row = document.createElement('div'); row.className = 'brushes';
    const sel = k => { S.brush = k; if (k !== 'eraser') { S.sw = BRUSHES[k].sw; S.op = BRUSHES[k].op; } box.querySelectorAll('.brush').forEach(b => b.classList.toggle('on', b.dataset.k === k)); setTool({ kind: k === 'eraser' ? 'eraser' : 'pen', group: 'pen' }); if (k !== 'eraser') { box.querySelector('[data-w]').value = S.sw; box.querySelector('[data-w]').dispatchEvent(new Event('input')); box.querySelector('[data-o]').value = Math.round((1 - S.op) * 100); box.querySelector('[data-o]').dispatchEvent(new Event('input')); } };
    [...Object.entries(BRUSHES).map(([k, b]) => [k, b.name]), ['eraser', 'Eraser']].forEach(([k, n]) => { const b = document.createElement('button'); b.className = 'brush' + (S.tool && S.brush === k ? ' on' : ''); b.dataset.k = k; b.innerHTML = `<svg width="64" height="26" viewBox="0 0 64 26"><path d="M4 18Q18 2 32 14T60 8" fill="none" stroke="${k === 'eraser' ? '#9aa' : '#ddd'}" stroke-width="${k === 'eraser' ? 3 : Math.min(12, BRUSHES[k].sw / 2.2)}" stroke-linecap="round" opacity="${k === 'eraser' ? 1 : BRUSHES[k].op}" ${k === 'eraser' ? 'stroke-dasharray="2 5"' : ''}/></svg><small>${n}</small>`; b.onclick = () => sel(k); row.append(b); });
    box.append(row);
    const c = document.createElement('div'); c.className = 'cap'; c.textContent = 'Color'; box.append(c); swatches(box, S.color, col => { S.color = col; });
    slider(box, 'Weight', 1, 80, S.sw, v => v + ' px', v => { S.sw = v; }); box.lastChild.querySelector('input').dataset.w = 1;
    slider(box, 'Transparency', 0, 95, Math.round((1 - S.op) * 100), v => v + '%', v => { S.op = 1 - v / 100; }); box.lastChild.querySelector('input').dataset.o = 1;
    const done = document.createElement('button'); done.className = 'pri'; done.textContent = 'Done drawing'; done.onclick = () => { setTool(null); closeFly(); }; box.append(done);
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Drag on the page to draw. The eraser removes a whole stroke when you touch it.'; box.append(hint);
    if (!S.tool) sel(S.brush === 'eraser' ? 'pen' : S.brush);
  }
  function shapeFly(box) {
    const h = document.createElement('h4'); h.textContent = 'Shapes'; box.append(h);
    const q = document.createElement('input'); q.type = 'search'; q.placeholder = 'Search shapes (heart, arrow, star…)'; box.append(q);
    const chips = document.createElement('div'); chips.className = 'chips'; box.append(chips); let cat = 'all';
    ['all', ...SH.cats].forEach(c => { const b = document.createElement('button'); b.textContent = c[0].toUpperCase() + c.slice(1); b.dataset.c = c; b.onclick = () => { cat = c; paint(); }; chips.append(b); });
    const grid = document.createElement('div'); grid.className = 'sgrid'; box.append(grid);
    const fl = document.createElement('div'); fl.className = 'cap'; fl.textContent = 'Fill color for new shapes'; box.append(fl); swatches(box, S.shapeFill, c => { S.shapeFill = c; paint(); });
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Click a shape to add it. Shift-click, then drag on the page to size it as you place it.'; box.append(hint);
    function paint() { chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === cat)); grid.textContent = '';
      const items = SH.search(q.value).filter(s => cat === 'all' || s.cat === cat); if (!items.length) { grid.textContent = 'No shapes match.'; return; }
      items.forEach(s => { const b = document.createElement('button'); b.title = s.name; b.innerHTML = `<svg width="40" height="40" viewBox="-2 -2 44 44"><path d="${s.d(40, 40)}" fill="${S.shapeFill}" fill-rule="${s.id === 'ring' || s.id === 'frame' ? 'evenodd' : 'nonzero'}"/></svg>`;
        b.onclick = ev => { if (ev.shiftKey) { setTool({ kind: 'shape', id: s.id, group: 'shapes' }); closeFly(); } else addShape(s.id); }; grid.append(b); }); }
    q.oninput = paint; paint(); setTimeout(() => q.focus(), 0);
  }

  function mkBtn(id, icon, label, fn) { const b = document.createElement('button'); b.dataset.tool = id; b.innerHTML = `${icon}<small>${label}</small>`; b.onclick = () => fn(b); return b; }
  function init() {
    const rail = document.getElementById('tools'); if (!rail || rail.dataset.art) return; rail.dataset.art = 1; attach();
    const lineBtn = rail.querySelector('[data-add=line]'), starBtn = rail.querySelector('[data-add=star]');
    starBtn.after(mkBtn('shapes', '◇', 'Shapes', b => openFly(b, shapeFly)));
    lineBtn.before(mkBtn('pen', '✎', 'Pens', b => { if (flyFor === b) { setTool(null); } openFly(b, penFly); }));
    // the Line button now draws by dragging; a plain click still drops in a default line
    lineBtn.dataset.tool = 'line'; lineBtn.addEventListener('click', ev => { ev.stopImmediatePropagation(); closeFly(); setTool({ kind: 'line', group: 'line' }); }, true);
    rail.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && !b.dataset.tool && b !== lineBtn) { setTool(null); closeFly(); } }, true);
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && (S.tool || fly)) { setTool(null); closeFly(); } });
    document.addEventListener('pointerdown', ev => { if (fly && !fly.contains(ev.target) && !ev.target.closest('#tools') && !(S.tool && S.tool.group === 'pen')) { closeFly(); } }, true);
    window.SMA.render();
  }
  window.SMA_ARTTOOLS = { state: S, setTool, init, BRUSHES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
