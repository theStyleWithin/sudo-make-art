'use strict';
// Looks inside a GGUF model file and refuses it if it is malformed. It only reads the header (never the weights) and fails
// instead of reading past the end of the file, so a damaged or hostile file cannot make it misbehave.
const fs = require('fs');

class Reader { // bounds-checked reads from the start of a file; fails instead of reading past the end
  constructor(fd, size) { this.fd = fd; this.size = size; this.pos = 0; this.buf = Buffer.alloc(0); this.base = 0; this.cap = 256 * 1024 * 1024; }
  need(n) { if (n < 0 || this.pos + n > this.size) throw new Error('The header runs past the end of the file'); if (this.pos > this.cap) throw new Error('The header is unreasonably large'); if (this.pos < this.base || this.pos + n > this.base + this.buf.length) { const len = Math.min(Math.max(n, 1 << 20), this.size - this.pos); this.buf = Buffer.alloc(len); fs.readSync(this.fd, this.buf, 0, len, this.pos); this.base = this.pos; } }
  take(n) { this.need(n); const b = this.buf.subarray(this.pos - this.base, this.pos - this.base + n); this.pos += n; return b; }
  u8() { return this.take(1)[0]; } u32() { return this.take(4).readUInt32LE(0); }
  u64() { const v = this.take(8).readBigUInt64LE(0); if (v > 2n ** 53n) throw new Error('A number in the header is absurdly large'); return Number(v); }
  str(max) { const n = this.u64(); if (n > max) throw new Error('A name in the header is too long'); return this.take(n).toString('utf8'); }
}
const FIXED = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
function skipValue(r, type, depth) {
  if (type in FIXED) { r.take(FIXED[type]); return; }
  if (type === 8) { r.str(1 << 24); return; }
  if (type === 9) { if (depth > 1) throw new Error('Nested lists are too deep'); const et = r.u32(), n = r.u64(); if (n > 5e8) throw new Error('A list in the header is too long');
    if (et in FIXED) r.take(FIXED[et] * n); else for (let i = 0; i < n; i++) skipValue(r, et, depth + 1); return; }
  throw new Error('Unknown value type ' + type + ' in the header');
}
function inspectGguf(file) { // throws with a plain reason if the file is not a well-formed GGUF
  const fd = fs.openSync(file, 'r'); try {
    const size = fs.fstatSync(fd).size; if (size < 32) throw new Error('The file is too small to be a model'); const r = new Reader(fd, size);
    if (r.take(4).toString('latin1') !== 'GGUF') throw new Error('This is not a GGUF file (wrong file signature)');
    const version = r.u32(); if (version !== 2 && version !== 3) throw new Error('Unsupported GGUF version ' + version);
    const nTensors = r.u64(), nKv = r.u64(); if (nTensors < 1 || nTensors > 1 << 20) throw new Error('Implausible tensor count ' + nTensors); if (nKv > 1 << 16) throw new Error('Implausible metadata count ' + nKv);
    let align = 32, arch = '', name = '';
    for (let i = 0; i < nKv; i++) { const key = r.str(4096), type = r.u32();
      if (key === 'general.alignment' && type === 4) { align = r.u32(); if (!align || align > 1 << 20 || (align & (align - 1))) throw new Error('Odd alignment value'); }
      else if ((key === 'general.architecture' || key === 'general.name') && type === 8) { const s = r.str(1 << 16); if (key === 'general.architecture') arch = s; else name = s; }
      else skipValue(r, type, 0); }
    const offs = [];
    for (let i = 0; i < nTensors; i++) { r.str(4096); const nd = r.u32(); if (nd < 1 || nd > 8) throw new Error('A tensor has an impossible number of dimensions');
      for (let d = 0; d < nd; d++) { const v = r.u64(); if (v < 1 || v > 2 ** 40) throw new Error('A tensor has an impossible size'); }
      const type = r.u32(); if (type > 63) throw new Error('A tensor has an unknown data type'); offs.push(r.u64()); }
    const dataStart = Math.ceil(r.pos / align) * align; if (dataStart >= size) throw new Error('The file ends before any tensor data');
    for (const o of offs) if (o % align !== 0 || dataStart + o >= size) throw new Error('A tensor points outside the file (the file looks truncated or damaged)');
    return { version, tensors: nTensors, arch, name };
  } finally { fs.closeSync(fd); }
}


module.exports = { inspectGguf };
