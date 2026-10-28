// Local image editor: cut out backgrounds, erase/restore brush, remove marks (watermarks) by painting over them.
// Everything runs on a canvas in this window. No network, no model download.
(() => {
'use strict';
const $ = s => document.querySelector(s);

const HINTS = {
  erase: 'Paint over anything you want to make transparent.',
  restore: 'Paint to bring back parts of the original image you erased.',
  magic: 'Click a colour to make it transparent. Good for plain backgrounds. Raise Tolerance for gradients and soft shadows.',
  mark: 'Paint over a watermark or blemish, release, and it is filled in from the pixels around it. Works best on small marks over simple backgrounds.',
};

window.openImageEditor = function (src, orig, done) {
  const dlg = $('#imgdlg'), disp = $('#ie-canvas'), dctx = disp.getContext('2d');
  const work = document.createElement('canvas'), wctx = work.getContext('2d', { willReadFrequently: true });
  const origC = document.createElement('canvas'), mask = document.createElement('canvas'), mctx = mask.getContext('2d');
  let tool = 'erase', scale = 1, undo = [], drawing = false, last = null, hasMask = false;

  const load = u => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  Promise.all([load(src), load(orig)]).then(([im, om]) => {
    work.width = mask.width = disp.width = origC.width = im.width; work.height = mask.height = disp.height = origC.height = im.height;
    wctx.drawImage(im, 0, 0); origC.getContext('2d').drawImage(om, 0, 0, im.width, im.height);
    undo = []; hasMask = false; mctx.clearRect(0, 0, mask.width, mask.height);
    dlg.showModal(); fitView(); refresh(); setTool('erase');
  }).catch(() => alert('Could not open this image for editing.'));

  function fitView() {
    const st = $('#ie-stage'), s = Math.min((st.clientWidth - 20) / work.width, (st.clientHeight - 20) / work.height, 1);
    scale = s > 0 ? s : 1; disp.style.width = work.width * scale + 'px'; disp.style.height = work.height * scale + 'px';
  }
  function refresh() {
    dctx.clearRect(0, 0, disp.width, disp.height); dctx.drawImage(work, 0, 0);
    if (hasMask) { dctx.globalAlpha = 0.55; dctx.drawImage(mask, 0, 0); dctx.globalAlpha = 1; }
  }
  function snap() { undo.push(wctx.getImageData(0, 0, work.width, work.height)); if (undo.length > 12) undo.shift(); }
  const brush = () => Math.max(1, +$('#ie-size').value / scale);
  const pos = ev => { const r = disp.getBoundingClientRect(); return [(ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale]; };

  function setTool(t) {
    tool = t; $('#ie-hint').textContent = HINTS[t];
    document.querySelectorAll('#ie-tools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $('#ie-tolwrap').hidden = t !== 'magic'; $('#ie-sizewrap').hidden = t === 'magic';
  }
  document.querySelectorAll('#ie-tools [data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));

  function stroke(ctx, a, b, style) {
    ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = brush();
    if (style) ctx.strokeStyle = style;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1] + 0.01); ctx.stroke(); ctx.restore();
  }
  function paint(a, b) {
    if (tool === 'erase') { wctx.save(); wctx.globalCompositeOperation = 'destination-out'; stroke(wctx, a, b, '#000'); wctx.restore(); }
    else if (tool === 'restore') stroke(wctx, a, b, wctx.createPattern(origC, 'no-repeat'));
    else if (tool === 'mark') { stroke(mctx, a, b, '#ff2d55'); hasMask = true; }
    refresh();
  }

  disp.onpointerdown = ev => {
    const p = pos(ev);
    if (tool === 'magic') { snap(); magic(p); refresh(); return; }
    if (tool !== 'mark') snap(); // mark takes its own snapshot when it fills
    drawing = true; last = p; disp.setPointerCapture(ev.pointerId); paint(p, p);
  };
  disp.onpointermove = ev => { if (!drawing) return; const p = pos(ev); paint(last, p); last = p; };
  disp.onpointerup = () => { if (!drawing) return; drawing = false; if (tool === 'mark') fillMask(); };

  // ----- magic remove: flood fill from the click, matching by colour distance -----
  function colourAt(d, i) { return [d[i], d[i + 1], d[i + 2]]; }
  function floodRemove(d, w, h, seeds, ref, tol) {
    const seen = new Uint8Array(w * h), stack = [];
    const ok = i => d[i + 3] < 10 || ((d[i] - ref[0]) ** 2 + (d[i + 1] - ref[1]) ** 2 + (d[i + 2] - ref[2]) ** 2) <= tol * tol;
    seeds.forEach(([x, y]) => { const k = y * w + x; if (!seen[k] && ok(k * 4)) { seen[k] = 1; stack.push(k); } });
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = (k / w) | 0; d[k * 4 + 3] = 0;
      if (x > 0 && !seen[k - 1] && ok((k - 1) * 4)) { seen[k - 1] = 1; stack.push(k - 1); }
      if (x < w - 1 && !seen[k + 1] && ok((k + 1) * 4)) { seen[k + 1] = 1; stack.push(k + 1); }
      if (y > 0 && !seen[k - w] && ok((k - w) * 4)) { seen[k - w] = 1; stack.push(k - w); }
      if (y < h - 1 && !seen[k + w] && ok((k + w) * 4)) { seen[k + w] = 1; stack.push(k + w); }
    }
  }
  const tolerance = () => +$('#ie-tol').value * 4.4; // slider 0-100 -> colour distance 0-440
  function magic([px, py]) {
    const w = work.width, h = work.height, x = Math.min(w - 1, Math.max(0, px | 0)), y = Math.min(h - 1, Math.max(0, py | 0));
    const img = wctx.getImageData(0, 0, w, h), d = img.data;
    floodRemove(d, w, h, [[x, y]], colourAt(d, (y * w + x) * 4), tolerance());
    wctx.putImageData(img, 0, 0);
  }
  $('#ie-auto').onclick = () => { // plain-background cutout: flood in from every edge using the corner colour
    snap();
    const w = work.width, h = work.height, img = wctx.getImageData(0, 0, w, h), d = img.data;
    const cs = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => colourAt(d, (y * w + x) * 4));
    const ref = [0, 1, 2].map(c => Math.round(cs.reduce((s, v) => s + v[c], 0) / 4));
    const seeds = []; for (let x = 0; x < w; x++) seeds.push([x, 0], [x, h - 1]); for (let y = 0; y < h; y++) seeds.push([0, y], [w - 1, y]);
    floodRemove(d, w, h, seeds, ref, tolerance() || 40); wctx.putImageData(img, 0, 0); refresh();
  };

  // ----- remove mark: fill painted pixels from the surrounding colours, working inwards from the edge -----
  function fillMask() {
    const w = work.width, h = work.height, m = mctx.getImageData(0, 0, w, h).data;
    const img = wctx.getImageData(0, 0, w, h), d = img.data, unknown = new Uint8Array(w * h);
    let list = [];
    for (let k = 0; k < w * h; k++) if (m[k * 4 + 3] > 40) { unknown[k] = 1; list.push(k); }
    if (list.length) {
      if (list.length > 400000) { alert('That area is too large to fill. Paint over a smaller part at a time.'); }
      else {
        snap();
        for (let pass = 0; pass < 600 && list.length; pass++) {
          const ready = [], rest = [];
          for (const k of list) {
            const x = k % w, y = (k / w) | 0; let edge = false;
            for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && !unknown[ny * w + nx]) { edge = true; break; }
            }
            (edge ? ready : rest).push(k);
          }
          if (!ready.length) break;
          const out = ready.map(k => {
            const x = k % w, y = (k / w) | 0; let r = 0, g = 0, b = 0, a = 0, ws = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || unknown[ny * w + nx]) continue;
              const wt = 1 / (1 + dx * dx + dy * dy), i = (ny * w + nx) * 4;
              r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; a += d[i + 3] * wt; ws += wt;
            }
            return [r / ws, g / ws, b / ws, a / ws];
          });
          ready.forEach((k, j) => { const i = k * 4; d[i] = out[j][0]; d[i + 1] = out[j][1]; d[i + 2] = out[j][2]; d[i + 3] = out[j][3]; unknown[k] = 0; });
          list = rest;
        }
        wctx.putImageData(img, 0, 0);
      }
    }
    mctx.clearRect(0, 0, w, h); hasMask = false; refresh();
  }

  $('#ie-undo').onclick = () => { const s = undo.pop(); if (s) { wctx.putImageData(s, 0, 0); mctx.clearRect(0, 0, mask.width, mask.height); hasMask = false; refresh(); } };
  $('#ie-cancel').onclick = () => dlg.close();
  $('#ie-apply').onclick = () => { done(work.toDataURL('image/png')); dlg.close(); };
};
})();
