// Shape library: every shape is a function (w, h) -> SVG path text, so it scales to any size without distorting
// outlines. Original code. window.SMA_SHAPES = { list, byId, search, cats }
(function () {
  const f = n => +n.toFixed(2);
  const P = (pts, w, h, close = true) => pts.map(([x, y], i) => (i ? 'L' : 'M') + f(x * w) + ' ' + f(y * h)).join('') + (close ? 'Z' : '');
  const poly = n => (w, h, rot = -Math.PI / 2) => P(Array.from({ length: n }, (_, i) => [0.5 + Math.cos(rot + i * 2 * Math.PI / n) / 2, 0.5 + Math.sin(rot + i * 2 * Math.PI / n) / 2]), w, h);
  const star = (n, k) => (w, h) => P(Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? k : 1, a = -Math.PI / 2 + i * Math.PI / n; return [0.5 + Math.cos(a) * r / 2, 0.5 + Math.sin(a) * r / 2]; }), w, h);
  const ell = (w, h) => `M0 ${f(h / 2)}A${f(w / 2)} ${f(h / 2)} 0 1 0 ${f(w)} ${f(h / 2)}A${f(w / 2)} ${f(h / 2)} 0 1 0 0 ${f(h / 2)}Z`;
  const scallop = n => (w, h) => { let d = ''; const R = 0.5, c = 0.5; const pts = Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n - Math.PI / 2; return [c + Math.cos(a) * 0.4, c + Math.sin(a) * 0.4]; });
    pts.forEach((p, i) => { const q = pts[(i + 1) % n]; d += (i ? '' : 'M' + f(p[0] * w) + ' ' + f(p[1] * h)) + `A${f(0.14 * w * 6 / n * 1.2)} ${f(0.14 * h * 6 / n * 1.2)} 0 0 1 ${f(q[0] * w)} ${f(q[1] * h)}`; }); return d + 'Z'; };
  const ring = (w, h) => ell(w, h) + (() => { const a = 0.28; return `M${f(w * a)} ${f(h / 2)}A${f(w * (0.5 - a))} ${f(h * (0.5 - a))} 0 1 1 ${f(w * (1 - a))} ${f(h / 2)}A${f(w * (0.5 - a))} ${f(h * (0.5 - a))} 0 1 1 ${f(w * a)} ${f(h / 2)}Z`; })();
  const arrowR = (w, h) => P([[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]], w, h);
  const bubble = tail => (w, h) => `M${f(w * 0.12)} 0H${f(w * 0.88)}Q${w} 0 ${w} ${f(h * 0.12)}V${f(h * 0.6)}Q${w} ${f(h * 0.72)} ${f(w * 0.88)} ${f(h * 0.72)}H${f(w * (tail ? 0.45 : 0.4))}L${f(w * 0.2)} ${h}L${f(w * 0.26)} ${f(h * 0.72)}H${f(w * 0.12)}Q0 ${f(h * 0.72)} 0 ${f(h * 0.6)}V${f(h * 0.12)}Q0 0 ${f(w * 0.12)} 0Z`;
  const heart = (w, h) => `M${f(w / 2)} ${f(h * 0.95)}C${f(w * -0.1)} ${f(h * 0.55)} ${f(w * 0.05)} ${f(h * -0.05)} ${f(w / 2)} ${f(h * 0.28)}C${f(w * 0.95)} ${f(h * -0.05)} ${f(w * 1.1)} ${f(h * 0.55)} ${f(w / 2)} ${f(h * 0.95)}Z`;
  const cloud = (w, h) => `M${f(w * 0.25)} ${f(h * 0.85)}A${f(w * 0.2)} ${f(h * 0.25)} 0 0 1 ${f(w * 0.2)} ${f(h * 0.42)}A${f(w * 0.22)} ${f(h * 0.3)} 0 0 1 ${f(w * 0.5)} ${f(h * 0.18)}A${f(w * 0.2)} ${f(h * 0.25)} 0 0 1 ${f(w * 0.78)} ${f(h * 0.38)}A${f(w * 0.22)} ${f(h * 0.25)} 0 0 1 ${f(w * 0.78)} ${f(h * 0.85)}Z`;
  const moon = (w, h) => `M${f(w * 0.7)} ${f(h * 0.05)}A${f(w * 0.5)} ${f(h * 0.5)} 0 1 0 ${f(w * 0.95)} ${f(h * 0.7)}A${f(w * 0.4)} ${f(h * 0.4)} 0 0 1 ${f(w * 0.7)} ${f(h * 0.05)}Z`;
  const bolt = (w, h) => P([[0.6, 0], [0.15, 0.55], [0.45, 0.55], [0.35, 1], [0.85, 0.4], [0.55, 0.4]], w, h);
  const cross = (w, h) => P([[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]], w, h);
  const xmark = (w, h) => P([[0.2, 0], [0.5, 0.3], [0.8, 0], [1, 0.2], [0.7, 0.5], [1, 0.8], [0.8, 1], [0.5, 0.7], [0.2, 1], [0, 0.8], [0.3, 0.5], [0, 0.2]], w, h);
  const check = (w, h) => P([[0, 0.55], [0.15, 0.4], [0.38, 0.62], [0.85, 0.1], [1, 0.25], [0.38, 0.95]], w, h);
  const drop = (w, h) => `M${f(w / 2)} 0C${f(w * 0.5)} ${f(h * 0.2)} ${w} ${f(h * 0.45)} ${w} ${f(h * 0.65)}A${f(w / 2)} ${f(h * 0.35)} 0 0 1 0 ${f(h * 0.65)}C0 ${f(h * 0.45)} ${f(w * 0.5)} ${f(h * 0.2)} ${f(w / 2)} 0Z`;
  const pie = (w, h) => `M${f(w / 2)} ${f(h / 2)}L${f(w)} ${f(h / 2)}A${f(w / 2)} ${f(h / 2)} 0 1 1 ${f(w / 2)} 0Z`;
  const semi = (w, h) => `M0 ${f(h)}A${f(w / 2)} ${f(h)} 0 0 1 ${f(w)} ${f(h)}Z`;
  const flower = (n) => (w, h) => { let d = ''; for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n - Math.PI / 2, cx = 0.5 + Math.cos(a) * 0.28, cy = 0.5 + Math.sin(a) * 0.28, rx = w * 0.2, ry = h * 0.2; d += `M${f(cx * w - rx)} ${f(cy * h)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx * w + rx)} ${f(cy * h)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx * w - rx)} ${f(cy * h)}Z`; } return d; };
  const ribbon = (w, h) => P([[0, 0.2], [0.12, 0.2], [0.12, 0], [0.88, 0], [0.88, 0.2], [1, 0.2], [0.93, 0.5], [1, 0.8], [0.88, 0.8], [0.88, 1], [0.12, 1], [0.12, 0.8], [0, 0.8], [0.07, 0.5]], w, h);
  const ticket = (w, h) => `M0 0H${f(w)}V${f(h * 0.4)}A${f(h * 0.1)} ${f(h * 0.1)} 0 0 0 ${f(w)} ${f(h * 0.6)}V${f(h)}H0V${f(h * 0.6)}A${f(h * 0.1)} ${f(h * 0.1)} 0 0 0 0 ${f(h * 0.4)}Z`;
  const folder = (w, h) => P([[0, 0.1], [0.38, 0.1], [0.46, 0.25], [1, 0.25], [1, 0.95], [0, 0.95]], w, h);
  const rrect = (w, h) => { const r = Math.min(w, h) * 0.2; return `M${f(r)} 0H${f(w - r)}Q${f(w)} 0 ${f(w)} ${f(r)}V${f(h - r)}Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)}H${f(r)}Q0 ${f(h)} 0 ${f(h - r)}V${f(r)}Q0 0 ${f(r)} 0Z`; };
  const plaque = (w, h) => { const r = Math.min(w, h) * 0.16; return `M${f(r)} 0H${f(w - r)}A${f(r)} ${f(r)} 0 0 0 ${f(w)} ${f(r)}V${f(h - r)}A${f(r)} ${f(r)} 0 0 0 ${f(w - r)} ${f(h)}H${f(r)}A${f(r)} ${f(r)} 0 0 0 0 ${f(h - r)}V${f(r)}A${f(r)} ${f(r)} 0 0 0 ${f(r)} 0Z`; };
  const frame = (w, h) => P([[0, 0], [1, 0], [1, 1], [0, 1]], w, h) + P([[0.12, 0.12], [0.12, 0.88], [0.88, 0.88], [0.88, 0.12]], w, h);
  const blob = (w, h) => `M${f(w * 0.5)} ${f(h * 0.02)}C${f(w * 0.8)} ${f(h * -0.02)} ${f(w * 1.02)} ${f(h * 0.3)} ${f(w * 0.97)} ${f(h * 0.55)}C${f(w * 0.93)} ${f(h * 0.85)} ${f(w * 0.7)} ${f(h * 1.02)} ${f(w * 0.45)} ${f(h * 0.97)}C${f(w * 0.15)} ${f(h * 0.93)} ${f(w * -0.03)} ${f(h * 0.65)} ${f(w * 0.05)} ${f(h * 0.35)}C${f(w * 0.1)} ${f(h * 0.12)} ${f(w * 0.3)} ${f(h * 0.05)} ${f(w * 0.5)} ${f(h * 0.02)}Z`;
  const L = [
    ['rect', 'Rectangle', 'basic', 'box rect', (w, h) => P([[0, 0], [1, 0], [1, 1], [0, 1]], w, h), 1.5],
    ['ellipse', 'Ellipse', 'basic', 'oval circle round', ell, 1.5],
    ['square', 'Square', 'basic', 'box', (w, h) => P([[0, 0], [1, 0], [1, 1], [0, 1]], w, h)],
    ['rounded', 'Rounded square', 'basic', 'rectangle round corners', rrect],
    ['circle', 'Circle', 'basic', 'ellipse oval round', ell],
    ['triangle', 'Triangle', 'basic', 'three', (w, h) => P([[0.5, 0], [1, 1], [0, 1]], w, h)],
    ['rtriangle', 'Right triangle', 'basic', 'corner', (w, h) => P([[0, 0], [1, 1], [0, 1]], w, h)],
    ['diamond', 'Diamond', 'basic', 'rhombus', (w, h) => P([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], w, h)],
    ['parallelogram', 'Parallelogram', 'basic', 'slant', (w, h) => P([[0.25, 0], [1, 0], [0.75, 1], [0, 1]], w, h)],
    ['trapezoid', 'Trapezoid', 'basic', '', (w, h) => P([[0.2, 0], [0.8, 0], [1, 1], [0, 1]], w, h)],
    ['pentagon', 'Pentagon', 'basic', 'five', poly(5)],
    ['hexagon', 'Hexagon', 'basic', 'six honeycomb', (w, h) => poly(6)(w, h, 0)],
    ['heptagon', 'Heptagon', 'basic', 'seven', poly(7)],
    ['octagon', 'Octagon', 'basic', 'eight stop sign', (w, h) => poly(8)(w, h, Math.PI / 8)],
    ['decagon', 'Decagon', 'basic', 'ten', poly(10)],
    ['ring', 'Ring', 'basic', 'donut circle hole', ring],
    ['semicircle', 'Semicircle', 'basic', 'half circle', semi],
    ['pie', 'Pie', 'basic', 'chart slice', pie],
    ['crescent', 'Crescent', 'basic', 'moon', moon],
    ['drop', 'Teardrop', 'basic', 'water', drop],
    ['frame', 'Frame', 'basic', 'border square hole', frame],
    ['blob', 'Blob', 'basic', 'organic', blob],
    ['star4', '4-point star', 'stars', 'sparkle twinkle', star(4, 0.38)],
    ['star5', 'Star', 'stars', 'five favorite rating', star(5, 0.4)],
    ['star6', '6-point star', 'stars', 'six', star(6, 0.5)],
    ['david', 'Star of David', 'stars', 'hexagram david jewish israel six pointed', star(6, 1 / Math.sqrt(3))],
    ['star8', '8-point star', 'stars', '', star(8, 0.5)],
    ['star12', '12-point star', 'stars', 'seal badge', star(12, 0.82)],
    ['burst16', 'Burst', 'stars', 'explosion sale sticker', star(16, 0.78)],
    ['burst24', 'Starburst', 'stars', 'sunburst badge sticker', star(24, 0.88)],
    ['scallop', 'Scalloped badge', 'stars', 'wavy seal stamp', scallop(12)],
    ['flower5', 'Flower', 'nature', 'petals', flower(5)],
    ['flower8', 'Daisy', 'nature', 'petals', flower(8)],
    ['cloud', 'Cloud', 'nature', 'weather', cloud],
    ['bolt', 'Lightning bolt', 'nature', 'thunder energy', bolt],
    ['heart', 'Heart', 'symbols', 'love like', heart],
    ['check', 'Check mark', 'symbols', 'tick done yes', check],
    ['x', 'Cross mark', 'symbols', 'close no x', xmark],
    ['plus', 'Plus', 'symbols', 'add cross', cross],
    ['arrowr', 'Arrow right', 'arrows', 'next', arrowR],
    ['arrowl', 'Arrow left', 'arrows', 'back previous', (w, h) => P([[1, 0.3], [0.4, 0.3], [0.4, 0], [0, 0.5], [0.4, 1], [0.4, 0.7], [1, 0.7]], w, h)],
    ['arrowu', 'Arrow up', 'arrows', '', (w, h) => P([[0.3, 1], [0.3, 0.4], [0, 0.4], [0.5, 0], [1, 0.4], [0.7, 0.4], [0.7, 1]], w, h)],
    ['arrowd', 'Arrow down', 'arrows', '', (w, h) => P([[0.3, 0], [0.7, 0], [0.7, 0.6], [1, 0.6], [0.5, 1], [0, 0.6], [0.3, 0.6]], w, h)],
    ['arrowlr', 'Double arrow', 'arrows', 'both', (w, h) => P([[0, 0.5], [0.25, 0.1], [0.25, 0.35], [0.75, 0.35], [0.75, 0.1], [1, 0.5], [0.75, 0.9], [0.75, 0.65], [0.25, 0.65], [0.25, 0.9]], w, h)],
    ['chevron', 'Chevron', 'arrows', 'next angle', (w, h) => P([[0, 0], [0.6, 0], [1, 0.5], [0.6, 1], [0, 1], [0.4, 0.5]], w, h)],
    ['pentarrow', 'Pentagon arrow', 'arrows', 'step process', (w, h) => P([[0, 0], [0.7, 0], [1, 0.5], [0.7, 1], [0, 1]], w, h)],
    ['bubble', 'Speech bubble', 'callouts', 'talk chat comment', bubble(false)],
    ['bubble2', 'Speech bubble 2', 'callouts', 'talk chat', bubble(true)],
    ['ribbon', 'Ribbon', 'callouts', 'banner label', ribbon],
    ['ticket', 'Ticket', 'callouts', 'coupon', ticket],
    ['folder', 'Folder', 'callouts', 'tab file', folder],
    ['plaque', 'Plaque', 'callouts', 'label scoreboard', plaque],
  ];
  const byId = {}; const list = L.map(([id, name, cat, tags, d, ar]) => (byId[id] = { id, name, cat, tags, d, ar: ar || 1 }));
  const cats = ['basic', 'stars', 'nature', 'symbols', 'arrows', 'callouts'];
  const search = q => { q = (q || '').trim().toLowerCase(); return q ? list.filter(s => (s.name + ' ' + s.cat + ' ' + s.tags).toLowerCase().includes(q)) : list; };
  window.SMA_SHAPES = { list, byId, cats, search };
})();
