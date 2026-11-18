// Design editor tools, part 3: picture frames (shapes, letters and numbers, devices, film, retro), collage grids,
// and form elements. Dropping a picture on a frame snaps it into the frame. Original code.
(function () {
  const X = window.SMA_EXT, SH = window.SMA_SHAPES, NS = 'http://www.w3.org/2000/svg', api = () => window.SMA.ext;
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const f = n => +(+n).toFixed(2), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rr = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}H${f(x + w - r)}Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)}V${f(y + h - r)}Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)}H${f(x + r)}Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)}V${f(y + r)}Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
  const rc = (x, y, w, h) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;

  // ---------- frame definitions ----------
  // clip(w,h): where the picture shows. box(w,h): the area the picture is fitted to. deco(g,w,h): drawn over the picture (bezels, bars).
  const FR = {};
  const addShapeFrame = (id, name) => { FR[id] = { name, cat: 'Shapes', ar: 1, clip: (w, h) => SH.byId[id].d(w, h), shape: true }; };
  [['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['heart', 'Heart'], ['star5', 'Star'], ['hexagon', 'Hexagon'], ['octagon', 'Octagon'], ['pentagon', 'Pentagon'], ['diamond', 'Diamond'], ['triangle', 'Triangle'], ['blob', 'Blob'], ['scallop', 'Scalloped'], ['flower5', 'Flower'], ['cloud', 'Cloud'], ['drop', 'Teardrop'], ['burst16', 'Burst'], ['crescent', 'Crescent'], ['ticket', 'Ticket']].forEach(([i, n]) => addShapeFrame(i, n));
  FR.arch = { name: 'Arch', cat: 'Shapes', ar: 0.75, clip: (w, h) => `M0 ${f(h)}V${f(w / 2)}A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(w)} ${f(w / 2)}V${f(h)}Z` };
  FR.glyph = { name: 'Letter or number', cat: 'Letters', ar: 1, glyph: true, clip: () => '' };
  FR.phone = { name: 'Phone', cat: 'Devices', ar: 0.5, clip: (w, h) => rr(w * 0.06, h * 0.045, w * 0.88, h * 0.91, w * 0.08), box: (w, h) => [w * 0.06, h * 0.045, w * 0.88, h * 0.91],
    deco(g, w, h) { el('path', { d: rr(0, 0, w, h, w * 0.14) + rr(w * 0.06, h * 0.045, w * 0.88, h * 0.91, w * 0.08), fill: '#111827', 'fill-rule': 'evenodd' }, g); el('rect', { x: w * 0.38, y: h * 0.018, width: w * 0.24, height: h * 0.012, rx: h * 0.006, fill: '#374151' }, g); } };
  FR.laptop = { name: 'Laptop', cat: 'Devices', ar: 1.5, clip: (w, h) => rc(w * 0.12, h * 0.04, w * 0.76, h * 0.74), box: (w, h) => [w * 0.12, h * 0.04, w * 0.76, h * 0.74],
    deco(g, w, h) { el('path', { d: rr(w * 0.1, 0, w * 0.8, h * 0.82, 10) + rc(w * 0.12, h * 0.04, w * 0.76, h * 0.74), fill: '#1f2937', 'fill-rule': 'evenodd' }, g); el('path', { d: `M0 ${f(h * 0.86)}H${f(w)}L${f(w * 0.96)} ${f(h)}H${f(w * 0.04)}Z`, fill: '#9ca3af' }, g); el('rect', { x: w * 0.42, y: h * 0.86, width: w * 0.16, height: h * 0.025, rx: 3, fill: '#6b7280' }, g); } };
  FR.browser = { name: 'Browser window', cat: 'Devices', ar: 1.4, clip: (w, h) => rc(0, h * 0.1, w, h * 0.9), box: (w, h) => [0, h * 0.1, w, h * 0.9],
    deco(g, w, h) { el('rect', { width: w, height: h * 0.1, fill: '#e5e7eb' }, g); [0, 1, 2].forEach(i => el('circle', { cx: h * 0.05 + i * h * 0.045, cy: h * 0.05, r: h * 0.015, fill: ['#ef4444', '#f59e0b', '#22c55e'][i] }, g)); el('rect', { x: w * 0.2, y: h * 0.025, width: w * 0.6, height: h * 0.05, rx: h * 0.025, fill: '#fff' }, g); el('rect', { width: w, height: h, fill: 'none', stroke: '#9ca3af', 'stroke-width': 2 }, g); } };
  FR.polaroid = { name: 'Instant photo', cat: 'Paper', ar: 0.85, clip: (w, h) => rc(w * 0.07, h * 0.06, w * 0.86, h * 0.74), box: (w, h) => [w * 0.07, h * 0.06, w * 0.86, h * 0.74],
    deco(g, w, h) { el('path', { d: rc(0, 0, w, h) + rc(w * 0.07, h * 0.06, w * 0.86, h * 0.74), fill: '#fffdf8', stroke: '#d6d3d1', 'stroke-width': 1.5, 'fill-rule': 'evenodd' }, g); } };
  FR.film = { name: 'Film strip', cat: 'Retro', ar: 1.7, clip: (w, h) => rc(0, h * 0.17, w, h * 0.66), box: (w, h) => [0, h * 0.17, w, h * 0.66],
    deco(g, w, h) { el('rect', { width: w, height: h * 0.17, fill: '#111' }, g); el('rect', { y: h * 0.83, width: w, height: h * 0.17, fill: '#111' }, g); const n = Math.max(4, Math.round(w / (h * 0.16)));
      for (let i = 0; i < n; i++) for (const y of [h * 0.04, h * 0.87]) el('rect', { x: (i + 0.25) * w / n, y, width: w / n * 0.5, height: h * 0.09, rx: 3, fill: '#f5f5f4' }, g); } };
  FR.tv = { name: 'Retro TV', cat: 'Retro', ar: 1.25, clip: (w, h) => rr(w * 0.07, h * 0.2, w * 0.62, h * 0.64, w * 0.05), box: (w, h) => [w * 0.07, h * 0.2, w * 0.62, h * 0.64],
    deco(g, w, h) { el('path', { d: `M${f(w * 0.3)} ${f(h * 0.12)}L${f(w * 0.45)} 0M${f(w * 0.6)} ${f(h * 0.12)}L${f(w * 0.45)} 0`, stroke: '#78716c', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, g);
      el('path', { d: rr(0, h * 0.12, w, h * 0.88, w * 0.06) + rr(w * 0.07, h * 0.2, w * 0.62, h * 0.64, w * 0.05), fill: '#b45309', 'fill-rule': 'evenodd' }, g); [0.3, 0.52].forEach(y => el('circle', { cx: w * 0.85, cy: h * y, r: w * 0.06, fill: '#fde68a', stroke: '#78350f', 'stroke-width': 3 }, g)); for (let i = 0; i < 4; i++) el('rect', { x: w * 0.78, y: h * (0.68 + i * 0.045), width: w * 0.14, height: 3, fill: '#78350f' }, g); } };
  FR.stamp = { name: 'Postage stamp', cat: 'Paper', ar: 0.8, clip: (w, h) => rc(w * 0.09, h * 0.07, w * 0.82, h * 0.86), box: (w, h) => [w * 0.09, h * 0.07, w * 0.82, h * 0.86],
    deco(g, w, h) { el('path', { d: rc(0, 0, w, h) + rc(w * 0.09, h * 0.07, w * 0.82, h * 0.86), fill: '#fff', stroke: '#a8a29e', 'stroke-width': 2, 'stroke-dasharray': '3 6', 'fill-rule': 'evenodd' }, g); } };
  const CATS = ['Shapes', 'Letters', 'Devices', 'Paper', 'Retro'];

  // ---------- the frame element ----------
  X.types.frame = {
    label: 'Frame', generic: false,
    draw(e, g) {
      const F = FR[e.frame] || FR.square, w = e.w, h = e.h, id = 'fcl-' + e.id;
      const cp = el('clipPath', { id }, g);
      if (F.glyph) { const t = el('text', { x: w / 2, y: h * 0.82, 'text-anchor': 'middle', 'font-family': 'Arial Black, Impact, Arial, sans-serif', 'font-weight': 900, 'font-size': h * 1.02 }, cp); t.textContent = (e.glyph || 'A')[0]; }
      else el('path', { d: F.clip(w, h) }, cp);
      const [bx, by, bw, bh] = F.box ? F.box(w, h) : [0, 0, w, h], inner = el('g', { 'clip-path': `url(#${id})` }, g);
      if (e.src && e.iw) {
        const z = clamp(e.zoom || 1, 1, 6), s = Math.max(bw / e.iw, bh / e.ih) * z, iw = e.iw * s, ih = e.ih * s;
        const mx = Math.max(0, (iw - bw) / 2) / bw, my = Math.max(0, (ih - bh) / 2) / bh, ox = clamp(e.ox || 0, -mx, mx), oy = clamp(e.oy || 0, -my, my);
        el('image', { href: e.src, x: bx + (bw - iw) / 2 + ox * bw, y: by + (bh - ih) / 2 + oy * bh, width: iw, height: ih, preserveAspectRatio: 'none' }, inner);
      } else {
        el('rect', { x: bx, y: by, width: bw, height: bh, fill: e.fill || '#e4e0f0' }, inner);
        const ic = Math.min(bw, bh) * 0.28; el('path', { d: `M${f(bx + bw / 2 - ic)} ${f(by + bh / 2 + ic * 0.6)}l${f(ic * 0.7)} ${f(-ic * 0.8)}l${f(ic * 0.5)} ${f(ic * 0.5)}l${f(ic * 0.35)} ${f(-ic * 0.4)}l${f(ic * 0.9)} ${f(ic * 0.7)}Z`, fill: '#fff', opacity: 0.8 }, inner);
        el('circle', { cx: bx + bw / 2 + ic * 0.55, cy: by + bh / 2 - ic * 0.55, r: ic * 0.22, fill: '#fff', opacity: 0.8 }, inner);
      }
      if (F.deco) F.deco(g, w, h);
    },
    props(e, p, H) {
      const F = FR[e.frame] || FR.square;
      const btn = (t, fn, cls) => { const b = document.createElement('button'); b.textContent = t; if (cls) b.className = cls; b.onclick = fn; return b; };
      const pickFile = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => i.files[0] && fillFrame(e, i.files[0]); i.click(); };
      p.append(btn(e.src ? 'Replace picture…' : 'Add a picture…', pickFile, 'pri'));
      if (e.src) { p.append(H.row('Zoom', H.field(e, 'zoom', 'range', { min: 1, max: 4, step: 0.05 })), H.row('Move left / right', H.field(e, 'ox', 'range', { min: -0.5, max: 0.5, step: 0.01 })), H.row('Move up / down', H.field(e, 'oy', 'range', { min: -0.5, max: 0.5, step: 0.01 })), btn('Remove picture', () => { H.commit(); delete e.src; H.render(); })); }
      else p.append(H.row('Empty color', H.field(e, 'fill', 'color')));
      if (F.glyph) { const t = document.createElement('input'); t.id = 'fr-glyph'; t.maxLength = 1; t.value = e.glyph || 'A'; t.oninput = () => { if (t.value) { H.commit(); e.glyph = t.value[0]; H.render(); } }; p.append(H.row('Letter or number', t)); }
      const s = document.createElement('select'); Object.entries(FR).forEach(([k, d]) => s.add(new Option(d.name, k))); s.value = e.frame; s.onchange = () => { H.commit(); e.frame = s.value; H.render(); }; p.append(H.row('Frame', s));
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Drag a picture onto the frame and it snaps in.'; p.append(hint);
    },
  };
  function fillFrame(e, blobOrUrl, thenRender = true) {
    const A = api(), go = url => { const im = new Image(); im.onload = () => { A.commit(); e.src = url; e.iw = im.naturalWidth; e.ih = im.naturalHeight; e.zoom = 1; e.ox = 0; e.oy = 0; A.select(e.id); }; im.src = url; };
    if (typeof blobOrUrl === 'string') go(blobOrUrl); else { const r = new FileReader(); r.onload = () => go(r.result); r.readAsDataURL(blobOrUrl); }
  }
  // snap a dropped picture into the frame under it
  X.onDrop = img => {
    if (img.type !== 'image') return false; const A = api(), cx = img.x + img.w / 2, cy = img.y + img.h / 2;
    const fr = A.doc().els.slice().reverse().find(e => e.type === 'frame' && cx >= e.x && cx <= e.x + e.w && cy >= e.y && cy <= e.y + e.h); if (!fr) return false;
    A.remove(img.id); fr.src = img.src; fr.iw = img.nw || img.w; fr.ih = img.nh || img.h;
    fr.zoom = 1; fr.ox = 0; fr.oy = 0; A.select(fr.id); return true;
  };
  const newFrame = (id, o = {}) => { const A = api(), d = A.doc(), F = FR[id], base = 460, ar = F.ar || 1, w = ar >= 1 ? base : base * ar, h = ar >= 1 ? base / ar : base;
    return A.add(A.mk('frame', { frame: id, glyph: o.glyph, w, h, x: (d.w - w) / 2, y: (d.h - h) / 2, fill: '#e4e0f0', zoom: 1, ox: 0, oy: 0 })); };
  const thumb = (id, glyph) => { const s = el('svg', { width: 46, height: 46, viewBox: '-2 -2 52 52' }), g = el('g', {}, s), F = FR[id], ar = F.ar || 1, w = ar >= 1 ? 48 : 48 * ar, h = ar >= 1 ? 48 / ar : 48;
    g.setAttribute('transform', `translate(${(48 - w) / 2} ${(48 - h) / 2})`); X.types.frame.draw({ id: 'th' + id + (glyph || ''), frame: id, glyph, w, h, fill: '#a78bfa' }, g); return s; };

  // ---------- collage grids ----------
  const GRIDS = [
    ['2 columns', [[0, 0, .5, 1], [.5, 0, .5, 1]]], ['2 rows', [[0, 0, 1, .5], [0, .5, 1, .5]]], ['3 columns', [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]]], ['3 rows', [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]]],
    ['2 × 2', [[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]]], ['3 × 3', [0, 1, 2].flatMap(r => [0, 1, 2].map(c => [c / 3, r / 3, 1 / 3, 1 / 3]))], ['2 × 3', [0, 1, 2].flatMap(r => [0, 1].map(c => [c / 2, r / 3, .5, 1 / 3]))],
    ['Big left', [[0, 0, .6, 1], [.6, 0, .4, .5], [.6, .5, .4, .5]]], ['Big top', [[0, 0, 1, .6], [0, .6, .5, .4], [.5, .6, .5, .4]]], ['Big + row', [[0, 0, 1, .65], [0, .65, 1 / 3, .35], [1 / 3, .65, 1 / 3, .35], [2 / 3, .65, 1 / 3, .35]]],
    ['Mosaic', [[0, 0, .6, .6], [.6, 0, .4, .3], [.6, .3, .4, .3], [0, .6, .4, .4], [.4, .6, .6, .4]]],
  ];
  function addGrid(cells, gap) { const A = api(), d = A.doc(), m = Math.round(Math.min(d.w, d.h) * 0.04), W = d.w - 2 * m, Hh = d.h - 2 * m; A.commit(); let last;
    cells.forEach(([x, y, w, h]) => { const e = A.mk('frame', { frame: 'square', x: m + x * W + gap / 2, y: m + y * Hh + gap / 2, w: w * W - gap, h: h * Hh - gap, fill: '#e4e0f0', zoom: 1, ox: 0, oy: 0 }); d.els.push(e); last = e; });
    A.select(last.id); }

  // ---------- forms ----------
  const FORMS = [['input', 'Text field', 420, 70, 'Your name'], ['textarea', 'Message box', 420, 170, 'Write a message…'], ['checkbox', 'Checkbox', 360, 50, 'I agree'], ['radio', 'Radio button', 360, 50, 'Option one'], ['toggle', 'Switch', 360, 50, 'Notifications'],
    ['dropdown', 'Dropdown', 420, 70, 'Choose one'], ['button', 'Button', 280, 70, 'Submit'], ['search', 'Search bar', 460, 70, 'Search'], ['slider', 'Slider', 420, 50, ''], ['stars', 'Rating', 330, 60, ''], ['progress', 'Progress bar', 420, 36, ''], ['tabs', 'Tabs', 440, 64, 'One,Two,Three']];
  X.types.form = {
    label: 'Form element', generic: false,
    draw(e, g) {
      const w = e.w, h = e.h, k = e.kind, ac = e.fill, line = '#cbd5e1', txt = (x, y, s, size, fill, anchor = 'start', wt = 400) => { const t = el('text', { x, y, 'font-family': 'Arial, sans-serif', 'font-size': size, fill, 'text-anchor': anchor, 'font-weight': wt, 'xml:space': 'preserve' }, g); t.textContent = s; };
      const field = () => el('rect', { x: 1, y: 1, width: w - 2, height: h - 2, rx: 12, fill: '#fff', stroke: line, 'stroke-width': 2 }, g);
      if (k === 'input' || k === 'dropdown' || k === 'search' || k === 'textarea') { field(); const fs = Math.min(28, h * 0.4); txt(k === 'search' ? h * 0.9 : 20, k === 'textarea' ? 20 + fs : h / 2 + fs * 0.35, e.text, fs, '#64748b');
        if (k === 'dropdown') el('path', { d: `M${w - 44} ${h / 2 - 5}l12 12l12 -12`, stroke: '#475569', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
        if (k === 'search') { el('circle', { cx: h * 0.42, cy: h * 0.46, r: h * 0.16, fill: 'none', stroke: '#475569', 'stroke-width': 4 }, g); el('path', { d: `M${h * 0.54} ${h * 0.58}l${h * 0.14} ${h * 0.14}`, stroke: '#475569', 'stroke-width': 4, 'stroke-linecap': 'round' }, g); }
        if (k === 'textarea') el('path', { d: `M${w - 22} ${h - 8}l14 -14M${w - 14} ${h - 8}l6 -6`, stroke: '#94a3b8', 'stroke-width': 3, 'stroke-linecap': 'round' }, g); }
      else if (k === 'checkbox') { const s = Math.min(h, 36); el('rect', { x: 2, y: (h - s) / 2, width: s, height: s, rx: 8, fill: e.checked ? ac : '#fff', stroke: e.checked ? ac : line, 'stroke-width': 3 }, g); if (e.checked) el('path', { d: `M${s * 0.22} ${h / 2}l${s * 0.2} ${s * 0.22}l${s * 0.38} ${-s * 0.4}`, stroke: '#fff', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g); txt(s + 16, h / 2 + 9, e.text, 26, '#1e293b'); }
      else if (k === 'radio') { const s = Math.min(h, 36); el('circle', { cx: s / 2 + 2, cy: h / 2, r: s / 2, fill: '#fff', stroke: e.checked ? ac : line, 'stroke-width': 3 }, g); if (e.checked) el('circle', { cx: s / 2 + 2, cy: h / 2, r: s * 0.24, fill: ac }, g); txt(s + 16, h / 2 + 9, e.text, 26, '#1e293b'); }
      else if (k === 'toggle') { const tw = 76, th = 40, y = (h - th) / 2; el('rect', { x: 2, y, width: tw, height: th, rx: th / 2, fill: e.checked ? ac : '#cbd5e1' }, g); el('circle', { cx: e.checked ? tw - th / 2 + 2 : th / 2 + 2, cy: h / 2, r: th / 2 - 4, fill: '#fff' }, g); txt(tw + 18, h / 2 + 9, e.text, 26, '#1e293b'); }
      else if (k === 'button') { el('rect', { width: w, height: h, rx: h / 2.4, fill: ac }, g); txt(w / 2, h / 2 + Math.min(28, h * 0.4) * 0.35, e.text, Math.min(28, h * 0.4), '#fff', 'middle', 700); }
      else if (k === 'slider') { const v = clamp(e.value ?? 0.6, 0, 1); el('rect', { x: 0, y: h / 2 - 5, width: w, height: 10, rx: 5, fill: '#e2e8f0' }, g); el('rect', { x: 0, y: h / 2 - 5, width: w * v, height: 10, rx: 5, fill: ac }, g); el('circle', { cx: w * v, cy: h / 2, r: 16, fill: '#fff', stroke: ac, 'stroke-width': 5 }, g); }
      else if (k === 'stars') { const v = Math.round(clamp(e.value ?? 3, 0, 5)); for (let i = 0; i < 5; i++) { const cx = h / 2 + i * (h + 4), cy = h / 2, R = h * 0.46, pts = []; for (let j = 0; j < 10; j++) { const r = j % 2 ? R * 0.42 : R, a = -Math.PI / 2 + j * Math.PI / 5; pts.push(f(cx + Math.cos(a) * r) + ',' + f(cy + Math.sin(a) * r)); } el('polygon', { points: pts.join(' '), fill: i < v ? ac : '#e2e8f0' }, g); } }
      else if (k === 'progress') { const v = clamp(e.value ?? 0.65, 0, 1); el('rect', { width: w, height: h, rx: h / 2, fill: '#e2e8f0' }, g); el('rect', { width: Math.max(h, w * v), height: h, rx: h / 2, fill: ac }, g); }
      else if (k === 'tabs') { const names = (e.text || 'One,Two,Three').split(',').map(s => s.trim()).filter(Boolean).slice(0, 6), n = names.length || 1, sw = w / n; el('rect', { width: w, height: h, rx: h / 2.4, fill: '#e2e8f0' }, g);
        el('rect', { x: 4, y: 4, width: sw - 8, height: h - 8, rx: (h - 8) / 2.4, fill: ac }, g); names.forEach((s, i) => txt(sw * i + sw / 2, h / 2 + 9, s, 24, i ? '#334155' : '#fff', 'middle', 600)); }
    },
    props(e, p, H) {
      if (!['slider', 'stars', 'progress'].includes(e.kind)) { const t = document.createElement('input'); t.id = 'fm-text'; t.value = e.text; t.oninput = () => { if (!t._c) { H.commit(); t._c = true; } e.text = t.value; H.render(); }; t.onfocus = () => { t._c = false; }; p.append(H.row(e.kind === 'tabs' ? 'Tabs (comma separated)' : 'Text', t)); }
      if (['checkbox', 'radio', 'toggle'].includes(e.kind)) { const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!e.checked; c.onchange = () => { H.commit(); e.checked = c.checked; H.render(); }; p.append(H.row('Checked / on', c)); }
      if (e.kind === 'slider' || e.kind === 'progress') p.append(H.row('Value', H.field(e, 'value', 'range', { min: 0, max: 1, step: 0.01 })));
      if (e.kind === 'stars') p.append(H.row('Stars', H.field(e, 'value', 'range', { min: 0, max: 5, step: 1 })));
      p.append(H.row('Accent color', H.field(e, 'fill', 'color')));
    },
  };
  const newForm = ([kind, , w, h, text]) => { const A = api(), d = A.doc(); A.add(A.mk('form', { kind, w, h, text, x: (d.w - w) / 2, y: (d.h - h) / 2, fill: '#8b5cf6', checked: true, value: kind === 'stars' ? 4 : undefined })); };

  // ---------- flyouts ----------
  function framesFly(box) {
    const T = window.SMA_ARTTOOLS, h = document.createElement('h4'); h.textContent = 'Frames and grids'; box.append(h);
    const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = 'Add a frame, then drag a picture onto it. It snaps in and crops to the frame.'; box.append(hint);
    CATS.forEach(cat => { const c = document.createElement('div'); c.className = 'cap'; c.textContent = cat; box.append(c); const grid = document.createElement('div'); grid.className = 'sgrid flat'; box.append(grid);
      if (cat === 'Letters') { 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').forEach(ch => { const b = document.createElement('button'); b.title = ch; b.textContent = ch; b.style.fontWeight = 900; b.onclick = () => newFrame('glyph', { glyph: ch }); grid.append(b); }); return; }
      Object.entries(FR).filter(([, d]) => d.cat === cat).forEach(([id, d]) => { const b = document.createElement('button'); b.title = d.name; b.append(thumb(id)); b.onclick = () => newFrame(id); grid.append(b); }); });
    const gc = document.createElement('div'); gc.className = 'cap'; gc.textContent = 'Collage grids'; box.append(gc); const gap = document.createElement('label'); gap.className = 'fs'; const gv = document.createElement('span'); gv.textContent = '16 px'; const gi = document.createElement('input'); gi.type = 'range'; gi.min = 0; gi.max = 60; gi.value = 16; gi.oninput = () => { gv.textContent = gi.value + ' px'; }; gap.append('Gap ', gv, gi); box.append(gap);
    const gg = document.createElement('div'); gg.className = 'sgrid flat'; gg.style.marginTop = '6px'; box.append(gg);
    GRIDS.forEach(([name, cells]) => { const b = document.createElement('button'); b.title = name; const s = el('svg', { width: 46, height: 46, viewBox: '0 0 48 48' }); cells.forEach(([x, y, w, hh]) => el('rect', { x: 2 + x * 44 + 1, y: 2 + y * 44 + 1, width: w * 44 - 2, height: hh * 44 - 2, fill: '#a78bfa', rx: 2 }, s)); b.append(s); b.onclick = () => { addGrid(cells, +gi.value); T.closeFly(); }; gg.append(b); });
  }
  function formsFly(box) {
    const h = document.createElement('h4'); h.textContent = 'Form elements'; box.append(h);
    FORMS.forEach(fm => { const b = document.createElement('button'); b.className = 'tpl'; b.textContent = fm[1]; b.onclick = () => newForm(fm); box.append(b); });
  }

  function init() {
    const T = window.SMA_ARTTOOLS, rail = document.getElementById('tools'); if (!T || !rail || rail.dataset.art3) return; rail.dataset.art3 = 1;
    const after = rail.querySelector('[data-tool=sign]') || rail.querySelector('[data-tool=shapes]');
    after.after(T.mkBtn('frames', '▣', 'Frames', b => T.openFly(b, framesFly)), T.mkBtn('forms', '☑', 'Forms', b => T.openFly(b, formsFly))); window.SMA.render();
  }
  window.SMA_ARTTOOLS3 = { FRAMES: FR, GRIDS, newFrame, addGrid, fillFrame };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 10)); else init();
})();
