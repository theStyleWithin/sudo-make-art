// Removes personal metadata (EXIF, GPS, camera and device details, dates, titles, software tags, XMP, comments)
// from images, without touching the pixels. Plain JavaScript, no dependencies, so it runs in the app window and in the
// main process alike. Also holds the shared "Remove metadata" switch (on by default).
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.SMA_META = m; })(typeof self !== 'undefined' ? self : this, function () {
  const KEY = 'sma.stripMeta';
  const u8 = b => (b instanceof Uint8Array ? b : new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b));
  const str = (b, o, n) => { let s = ''; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s; };
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const r = new Uint8Array(n); let o = 0; for (const p of parts) { r.set(p, o); o += p.length; } return r; };

  // ---- JPEG ----
  // Keeps only what is needed to show the picture: JFIF, the colour profile, Adobe's colour flag. The camera's
  // rotation flag is the one tag that changes how the picture looks, so it is kept alone in a bare EXIF block.
  function exifOrientation(b, o, len) { // b[o..o+len) is an EXIF payload starting at "Exif\0\0"
    if (len < 20 || str(b, o, 4) !== 'Exif') return 1; const t = o + 6, le = b[t] === 0x49;
    const r16 = p => (le ? b[p] | b[p + 1] << 8 : b[p] << 8 | b[p + 1]), r32 = p => (le ? (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0 : (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0);
    const ifd = t + r32(t + 4); if (ifd + 2 > o + len) return 1; const n = r16(ifd);
    for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 12 > o + len) break; if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 1; } }
    return 1;
  }
  const bareExif = ori => new Uint8Array([0xFF, 0xE1, 0, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4D, 0x4D, 0, 0x2A, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, ori, 0, 0, 0, 0, 0, 0]);
  function jpeg(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('Not a JPEG'); const out = [b.subarray(0, 2)], removed = new Set(); let p = 2, ori = 1;
    while (p < b.length) {
      if (b[p] !== 0xFF) { out.push(b.subarray(p)); break; }
      const mk = b[p + 1]; if (mk === 0xFF) { p++; continue; }
      if (mk === 0xDA) { out.push(b.subarray(p)); break; } // image data starts: copy the rest as it is
      if (mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)) { out.push(b.subarray(p, p + 2)); p += 2; continue; }
      const len = b[p + 2] << 8 | b[p + 3], seg = b.subarray(p, p + 2 + len), id = str(b, p + 4, 12);
      let keep = true;
      if (mk === 0xE1) { keep = false; if (id.startsWith('Exif')) { ori = exifOrientation(b, p + 4, len - 2); removed.add('EXIF (camera, GPS, dates)'); } else removed.add('XMP'); }
      else if (mk === 0xE2 && !id.startsWith('ICC_PROFILE')) { keep = false; removed.add('extra data'); }
      else if (mk === 0xED) { keep = false; removed.add('Photoshop / IPTC info'); }
      else if (mk === 0xFE) { keep = false; removed.add('comment'); }
      else if ((mk >= 0xE3 && mk <= 0xEF && mk !== 0xEE) || mk === 0xE0 && !id.startsWith('JFIF')) { keep = false; removed.add('extra data'); }
      if (keep) out.push(seg); p += 2 + len;
    }
    if (ori > 1) { out.splice(1, 0, bareExif(ori)); }
    return { data: cat(out), removed: [...removed] };
  }

  // ---- PNG ----
  function png(b) {
    const out = [b.subarray(0, 8)], removed = new Set(); let p = 8; const drop = { tEXt: 'text', iTXt: 'text', zTXt: 'text', eXIf: 'EXIF (camera, GPS, dates)', tIME: 'date', iDOT: 'extra data' };
    while (p + 8 <= b.length) {
      const len = (b[p] << 24 | b[p + 1] << 16 | b[p + 2] << 8 | b[p + 3]) >>> 0, type = str(b, p + 4, 4), end = p + 12 + len; if (end > b.length) { out.push(b.subarray(p)); break; }
      if (drop[type]) removed.add(drop[type]); else out.push(b.subarray(p, end)); p = end; if (type === 'IEND') break;
    }
    return { data: cat(out), removed: [...removed] };
  }

  // ---- WebP ----
  function webp(b) {
    if (str(b, 0, 4) !== 'RIFF' || str(b, 8, 4) !== 'WEBP') throw new Error('Not a WebP'); const out = [], removed = new Set(); let p = 12;
    while (p + 8 <= b.length) {
      const id = str(b, p, 4), len = (b[p + 4] | b[p + 5] << 8 | b[p + 6] << 16 | b[p + 7] << 24) >>> 0, end = Math.min(b.length, p + 8 + len + (len & 1));
      if (id === 'EXIF') removed.add('EXIF (camera, GPS, dates)'); else if (id === 'XMP ') removed.add('XMP');
      else if (id === 'VP8X') { const c = b.slice(p, end); c[8] &= ~0x0C; out.push(c); } else out.push(b.subarray(p, end));
      p = end;
    }
    const body = cat(out), head = new Uint8Array(12); head.set(b.subarray(0, 12)); const size = body.length + 4; head[4] = size & 255; head[5] = size >> 8 & 255; head[6] = size >> 16 & 255; head[7] = size >>> 24 & 255;
    return { data: cat([head, body]), removed: [...removed] };
  }

  // ---- GIF ----
  function gif(b) {
    if (str(b, 0, 3) !== 'GIF') throw new Error('Not a GIF'); const out = []; const removed = new Set(); let p = 13; const flags = b[10];
    if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1)); out.push(b.subarray(0, p));
    const skipSub = q => { while (q < b.length && b[q] !== 0) q += b[q] + 1; return q + 1; };
    while (p < b.length) {
      const t = b[p];
      if (t === 0x3B) { out.push(b.subarray(p, p + 1)); break; }
      if (t === 0x21) {
        const label = b[p + 1], e = skipSub(p + 2); // every extension is a run of sub-blocks
        if (label === 0xFE) { removed.add('comment'); p = e; continue; }
        if (label === 0xFF && !/^(NETSCAPE2\.0|ANIMEXTS1\.0)/.test(str(b, p + 3, b[p + 2]))) { removed.add('extra data'); p = e; continue; }
        out.push(b.subarray(p, e)); p = e; continue;
      }
      if (t === 0x2C) { // image: descriptor, optional colour table, LZW size, data blocks
        let e = p + 10; const f = b[p + 9]; if (f & 0x80) e += 3 * (1 << ((f & 7) + 1)); e = skipSub(e + 1); out.push(b.subarray(p, e)); p = e; continue;
      }
      out.push(b.subarray(p)); break;
    }
    return { data: cat(out), removed: [...removed] };
  }

  function kind(b) {
    if (b[0] === 0xFF && b[1] === 0xD8) return 'jpeg'; if (b[0] === 0x89 && str(b, 1, 3) === 'PNG') return 'png';
    if (str(b, 0, 4) === 'RIFF' && str(b, 8, 4) === 'WEBP') return 'webp'; if (str(b, 0, 3) === 'GIF') return 'gif'; return null;
  }
  // strip(bytes) → { data, removed: [what was taken out], changed, kind }. Unknown formats come back untouched.
  function strip(bytes) {
    const b = u8(bytes), k = kind(b); if (!k) return { data: b, removed: [], changed: false, kind: null };
    try { const r = ({ jpeg, png, webp, gif })[k](b); return { ...r, changed: r.removed.length > 0, kind: k }; } catch (e) { return { data: b, removed: [], changed: false, kind: k, error: String(e.message || e) }; }
  }
  function dataUrl(url) { // strips a data: URL of an image and returns a new data: URL
    const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(url); if (!m || typeof atob !== 'function') return url;
    const bin = atob(m[2]), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    const r = strip(b); if (!r.changed) return url; let s = ''; for (let i = 0; i < r.data.length; i += 0x8000) s += String.fromCharCode.apply(null, r.data.subarray(i, i + 0x8000));
    return 'data:' + m[1] + ';base64,' + btoa(s);
  }

  // ---- the shared switch ----
  const get = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
  const set = v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };
  function bind(box) { if (!box) return; box.checked = get(); box.addEventListener('change', () => { set(box.checked); document.querySelectorAll('input[data-meta]').forEach(x => { x.checked = box.checked; }); }); }
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('input[data-meta]').forEach(bind));
  return { strip, kind, dataUrl, get, set, bind };
});
