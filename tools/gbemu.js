'use strict';
// A small Game Boy (DMG) emulator used ONLY to test the ROMs that Sudo Make Games builds. Original code for this project.
// It is not shipped in the app. It follows the real rules that make ROMs fail on hardware: video memory cannot be written while
// the screen is being drawn, sprite memory can only be reached in the blanking periods, and during an OAM DMA only high RAM works.
// Every breach is recorded in `violations` so a test can fail on it.
class GB {
  constructor(rom) {
    this.rom = rom; this.vram = new Uint8Array(0x2000); this.wram = new Uint8Array(0x2000); this.oam = new Uint8Array(0xa0); this.hram = new Uint8Array(0x80); this.io = new Uint8Array(0x80); this.wave = new Uint8Array(16);
    this.ie = 0; this.pad = {}; this.violations = []; this.apu = []; this.cycles = 0; this.line = 0; this.lineClock = 0; this.frames = 0; this.dma = 0;
    this.a = 0x01; this.f = 0xb0; this.b = 0; this.c = 0x13; this.d = 0; this.e = 0xd8; this.h = 0x01; this.l = 0x4d; this.sp = 0xfffe; this.pc = 0x100; this.ime = false; this.imeNext = false; this.halted = false; this.opCount = 0;
    this.io[0x40] = 0x91; this.io[0x47] = 0xfc; this.io[0x00] = 0xcf; this.io[0x0f] = 0xe1; this.watch = null;
  }
  // ----- the memory map -----
  get lcdOn() { return !!(this.io[0x40] & 0x80); }
  mode() { if (!this.lcdOn) return 0; if (this.line >= 144) return 1; return this.lineClock < 80 ? 2 : this.lineClock < 252 ? 3 : 0; }
  viol(type, addr) { if (this.violations.length < 50) this.violations.push({ type, addr: addr.toString(16), pc: (this.pcStart || 0).toString(16) }); }
  read(a) {
    a &= 0xffff;
    if (this.dma > 0 && !(a >= 0xff80 && a <= 0xfffe)) { this.viol('dma-read', a); return 0xff; }
    if (a < 0x8000) return this.rom[a];
    if (a < 0xa000) { if (this.mode() === 3) { this.viol('vram-read', a); return 0xff; } return this.vram[a - 0x8000]; }
    if (a < 0xc000) return 0xff;
    if (a < 0xe000) return this.wram[a - 0xc000]; if (a < 0xfe00) return this.wram[a - 0xe000];
    if (a < 0xfea0) { const m = this.mode(); if (m === 2 || m === 3) { this.viol('oam-read', a); return 0xff; } return this.oam[a - 0xfe00]; }
    if (a < 0xff00) return 0xff;
    if (a < 0xff80) {
      const r = a - 0xff00;
      if (r === 0) { const sel = this.io[0], p = this.pad; let v = 0x0f; if (!(sel & 0x10)) { if (p.right) v &= ~1; if (p.left) v &= ~2; if (p.up) v &= ~4; if (p.down) v &= ~8; } if (!(sel & 0x20)) { if (p.a) v &= ~1; if (p.b) v &= ~2; if (p.select) v &= ~4; if (p.start) v &= ~8; } return 0xc0 | (sel & 0x30) | v; }
      if (r === 0x44) return this.lcdOn ? this.line : 0; if (r === 0x41) return 0x80 | (this.io[0x41] & 0x78) | (this.mode()); if (r === 0x0f) return 0xe0 | this.io[0x0f];
      if (r >= 0x30 && r < 0x40) return this.wave[r - 0x30]; return this.io[r];
    }
    if (a < 0xffff) return this.hram[a - 0xff80]; return this.ie;
  }
  write(a, v) {
    a &= 0xffff; v &= 255;
    if (this.dma > 0 && !(a >= 0xff80 && a <= 0xfffe)) { this.viol('dma-write', a); return; }
    if (this.watch && this.watch(a, v)) return;
    if (a < 0x8000) return; // ROM only: no mapper
    if (a < 0xa000) { if (this.mode() === 3) { this.viol('vram-write', a); return; } this.vram[a - 0x8000] = v; return; }
    if (a < 0xc000) return;
    if (a < 0xe000) { this.wram[a - 0xc000] = v; return; } if (a < 0xfe00) { this.wram[a - 0xe000] = v; return; }
    if (a < 0xfea0) { const m = this.mode(); if (m === 2 || m === 3) { this.viol('oam-write', a); return; } this.oam[a - 0xfe00] = v; return; }
    if (a < 0xff00) return;
    if (a < 0xff80) {
      const r = a - 0xff00;
      if (r === 0x46) { this.io[r] = v; this.dma = 160; this.dmaSrc = v << 8; return; }
      if (r === 0x44) return; if (r === 0x40) { const was = this.lcdOn; this.io[r] = v; if (was && !(v & 0x80)) { if (this.line < 144) this.viol('lcd-off-outside-vblank', a); this.line = 0; this.lineClock = 0; } return; }
      if (r === 0x0f) { this.io[r] = v & 0x1f; return; } if (r === 0x04) { this.io[r] = 0; return; }
      if (r >= 0x10 && r <= 0x26) this.apu.push({ cycle: this.cycles, reg: r, val: v, pc: this.pcStart }); if (r >= 0x30 && r < 0x40) { this.wave[r - 0x30] = v; return; }
      this.io[r] = v; return;
    }
    if (a < 0xffff) { this.hram[a - 0xff80] = v; return; } this.ie = v;
  }
  // ----- running -----
  tick(m) { // m machine cycles
    const t = m * 4; this.cycles += t;
    if (this.dma > 0) { const n = Math.min(this.dma, m); for (let i = 0; i < n; i++) { const idx = 160 - this.dma + i; this.oam[idx] = this.dmaRead((this.dmaSrc + idx) & 0xffff); } this.dma -= n; }
    if (!this.lcdOn) return; this.lineClock += t;
    while (this.lineClock >= 456) { this.lineClock -= 456; this.line++; if (this.line === 144) { this.io[0x0f] |= 1; this.frames++; this.frameReady = true; } if (this.line >= 154) this.line = 0; }
  }
  dmaRead(a) { if (a < 0x8000) return this.rom[a]; if (a < 0xa000) return this.vram[a - 0x8000]; if (a >= 0xc000 && a < 0xe000) return this.wram[a - 0xc000]; if (a >= 0xe000 && a < 0xfe00) return this.wram[a - 0xe000]; return 0xff; }
  get hl() { return (this.h << 8) | this.l; } set hl(v) { this.h = (v >> 8) & 255; this.l = v & 255; }
  get bc() { return (this.b << 8) | this.c; } set bc(v) { this.b = (v >> 8) & 255; this.c = v & 255; }
  get de() { return (this.d << 8) | this.e; } set de(v) { this.d = (v >> 8) & 255; this.e = v & 255; }
  get af() { return (this.a << 8) | (this.f & 0xf0); } set af(v) { this.a = (v >> 8) & 255; this.f = v & 0xf0; }
  fetch() { const v = this.read(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  push(v) { this.sp = (this.sp - 1) & 0xffff; this.write(this.sp, v >> 8); this.sp = (this.sp - 1) & 0xffff; this.write(this.sp, v & 255); }
  pop() { const lo = this.read(this.sp); this.sp = (this.sp + 1) & 0xffff; const hi = this.read(this.sp); this.sp = (this.sp + 1) & 0xffff; return lo | (hi << 8); }
  getR(i) { switch (i) { case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e; case 4: return this.h; case 5: return this.l; case 6: return this.read(this.hl); default: return this.a; } }
  setR(i, v) { v &= 255; switch (i) { case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break; case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.write(this.hl, v); break; default: this.a = v; } }
  getRR(i) { return i === 0 ? this.bc : i === 1 ? this.de : i === 2 ? this.hl : this.sp; } setRR(i, v) { v &= 0xffff; if (i === 0) this.bc = v; else if (i === 1) this.de = v; else if (i === 2) this.hl = v; else this.sp = v; }
  cond(i) { return i === 0 ? !(this.f & 0x80) : i === 1 ? !!(this.f & 0x80) : i === 2 ? !(this.f & 0x10) : !!(this.f & 0x10); }
  alu(op, v) {
    const a = this.a; let r;
    switch (op) {
      case 0: r = a + v; this.f = ((r & 255) === 0 ? 0x80 : 0) | (((a & 15) + (v & 15)) > 15 ? 0x20 : 0) | (r > 255 ? 0x10 : 0); this.a = r & 255; break;
      case 1: { const c = (this.f >> 4) & 1; r = a + v + c; this.f = ((r & 255) === 0 ? 0x80 : 0) | (((a & 15) + (v & 15) + c) > 15 ? 0x20 : 0) | (r > 255 ? 0x10 : 0); this.a = r & 255; break; }
      case 2: case 7: r = a - v; this.f = 0x40 | ((r & 255) === 0 ? 0x80 : 0) | (((a & 15) - (v & 15)) < 0 ? 0x20 : 0) | (r < 0 ? 0x10 : 0); if (op === 2) this.a = r & 255; break;
      case 3: { const c = (this.f >> 4) & 1; r = a - v - c; this.f = 0x40 | ((r & 255) === 0 ? 0x80 : 0) | (((a & 15) - (v & 15) - c) < 0 ? 0x20 : 0) | (r < 0 ? 0x10 : 0); this.a = r & 255; break; }
      case 4: this.a = a & v; this.f = (this.a === 0 ? 0x80 : 0) | 0x20; break;
      case 5: this.a = a ^ v; this.f = this.a === 0 ? 0x80 : 0; break;
      case 6: this.a = a | v; this.f = this.a === 0 ? 0x80 : 0; break;
    }
  }
  cb(op) {
    const r = op & 7, x = op >> 6, y = (op >> 3) & 7; let v = this.getR(r);
    if (x === 1) { this.f = (this.f & 0x10) | 0x20 | ((v >> y) & 1 ? 0 : 0x80); return r === 6 ? 3 : 2; }
    if (x === 2) { this.setR(r, v & ~(1 << y)); return r === 6 ? 4 : 2; } if (x === 3) { this.setR(r, v | (1 << y)); return r === 6 ? 4 : 2; }
    let c, res; const oc = (this.f >> 4) & 1;
    switch (y) {
      case 0: c = v >> 7; res = ((v << 1) | c) & 255; break; case 1: c = v & 1; res = (v >> 1) | (c << 7); break; case 2: c = v >> 7; res = ((v << 1) | oc) & 255; break; case 3: c = v & 1; res = (v >> 1) | (oc << 7); break;
      case 4: c = v >> 7; res = (v << 1) & 255; break; case 5: c = v & 1; res = (v >> 1) | (v & 0x80); break; case 6: c = 0; res = ((v << 4) | (v >> 4)) & 255; break; default: c = v & 1; res = v >> 1;
    }
    this.setR(r, res); this.f = (res === 0 ? 0x80 : 0) | (c ? 0x10 : 0); return r === 6 ? 4 : 2;
  }
  step() {
    this.pcStart = this.pc; this.opCount++;
    if (this.imeNext) { this.ime = true; this.imeNext = false; }
    const pending = this.ie & this.io[0x0f] & 0x1f;
    if (this.halted) { if (pending) this.halted = false; else { this.tick(1); return; } }
    if (this.ime && pending) { this.ime = false; for (let i = 0; i < 5; i++) if (pending & (1 << i)) { this.io[0x0f] &= ~(1 << i); this.push(this.pc); this.pc = 0x40 + i * 8; break; } this.tick(5); return; }
    const op = this.fetch(); let m = 1;
    if (op >= 0x40 && op < 0x80) { if (op === 0x76) { this.halted = true; this.tick(1); return; } const s = op & 7, d = (op >> 3) & 7; this.setR(d, this.getR(s)); m = (s === 6 || d === 6) ? 2 : 1; }
    else if (op >= 0x80 && op < 0xc0) { this.alu((op >> 3) & 7, this.getR(op & 7)); m = (op & 7) === 6 ? 2 : 1; }
    else switch (op) {
      case 0x00: break; case 0x10: this.fetch(); break;
      case 0x01: case 0x11: case 0x21: case 0x31: this.setRR(op >> 4, this.fetch16()); m = 3; break;
      case 0x02: this.write(this.bc, this.a); m = 2; break; case 0x12: this.write(this.de, this.a); m = 2; break;
      case 0x22: this.write(this.hl, this.a); this.hl = this.hl + 1; m = 2; break; case 0x32: this.write(this.hl, this.a); this.hl = this.hl - 1; m = 2; break;
      case 0x0a: this.a = this.read(this.bc); m = 2; break; case 0x1a: this.a = this.read(this.de); m = 2; break;
      case 0x2a: this.a = this.read(this.hl); this.hl = this.hl + 1; m = 2; break; case 0x3a: this.a = this.read(this.hl); this.hl = this.hl - 1; m = 2; break;
      case 0x03: case 0x13: case 0x23: case 0x33: this.setRR(op >> 4, this.getRR(op >> 4) + 1); m = 2; break;
      case 0x0b: case 0x1b: case 0x2b: case 0x3b: this.setRR(op >> 4, this.getRR(op >> 4) - 1); m = 2; break;
      case 0x04: case 0x0c: case 0x14: case 0x1c: case 0x24: case 0x2c: case 0x34: case 0x3c: { const r = (op >> 3) & 7, v = (this.getR(r) + 1) & 255; this.setR(r, v); this.f = (this.f & 0x10) | (v === 0 ? 0x80 : 0) | ((v & 15) === 0 ? 0x20 : 0); m = r === 6 ? 3 : 1; break; }
      case 0x05: case 0x0d: case 0x15: case 0x1d: case 0x25: case 0x2d: case 0x35: case 0x3d: { const r = (op >> 3) & 7, v = (this.getR(r) - 1) & 255; this.setR(r, v); this.f = (this.f & 0x10) | 0x40 | (v === 0 ? 0x80 : 0) | ((v & 15) === 15 ? 0x20 : 0); m = r === 6 ? 3 : 1; break; }
      case 0x06: case 0x0e: case 0x16: case 0x1e: case 0x26: case 0x2e: case 0x36: case 0x3e: { const r = (op >> 3) & 7; this.setR(r, this.fetch()); m = r === 6 ? 3 : 2; break; }
      case 0x07: { const c = this.a >> 7; this.a = ((this.a << 1) | c) & 255; this.f = c ? 0x10 : 0; break; } case 0x0f: { const c = this.a & 1; this.a = (this.a >> 1) | (c << 7); this.f = c ? 0x10 : 0; break; }
      case 0x17: { const c = this.a >> 7, oc = (this.f >> 4) & 1; this.a = ((this.a << 1) | oc) & 255; this.f = c ? 0x10 : 0; break; } case 0x1f: { const c = this.a & 1, oc = (this.f >> 4) & 1; this.a = (this.a >> 1) | (oc << 7); this.f = c ? 0x10 : 0; break; }
      case 0x08: { const a = this.fetch16(); this.write(a, this.sp & 255); this.write(a + 1, this.sp >> 8); m = 5; break; }
      case 0x09: case 0x19: case 0x29: case 0x39: { const v = this.getRR(op >> 4), h = this.hl, r = h + v; this.f = (this.f & 0x80) | (((h & 0xfff) + (v & 0xfff)) > 0xfff ? 0x20 : 0) | (r > 0xffff ? 0x10 : 0); this.hl = r; m = 2; break; }
      case 0x18: { const d = this.fetch(); this.pc = (this.pc + (d << 24 >> 24)) & 0xffff; m = 3; break; }
      case 0x20: case 0x28: case 0x30: case 0x38: { const d = this.fetch(); if (this.cond((op >> 3) & 3)) { this.pc = (this.pc + (d << 24 >> 24)) & 0xffff; m = 3; } else m = 2; break; }
      case 0x27: { let a = this.a, c = false; if (!(this.f & 0x40)) { if ((this.f & 0x10) || a > 0x99) { a += 0x60; c = true; } if ((this.f & 0x20) || (a & 15) > 9) a += 6; } else { if (this.f & 0x10) { a -= 0x60; c = true; } if (this.f & 0x20) a -= 6; } this.a = a & 255; this.f = (this.f & 0x40) | (this.a === 0 ? 0x80 : 0) | ((this.f & 0x10) || c ? 0x10 : 0); break; }
      case 0x2f: this.a ^= 255; this.f |= 0x60; break; case 0x37: this.f = (this.f & 0x80) | 0x10; break; case 0x3f: this.f = (this.f & 0x80) | ((this.f & 0x10) ? 0 : 0x10); break;
      case 0xc0: case 0xc8: case 0xd0: case 0xd8: if (this.cond((op >> 3) & 3)) { this.pc = this.pop(); m = 5; } else m = 2; break;
      case 0xc9: this.pc = this.pop(); m = 4; break; case 0xd9: this.pc = this.pop(); this.ime = true; m = 4; break;
      case 0xc1: case 0xd1: case 0xe1: this.setRR((op >> 4) & 3, this.pop()); m = 3; break; case 0xf1: this.af = this.pop(); m = 3; break;
      case 0xc5: case 0xd5: case 0xe5: this.push(this.getRR((op >> 4) & 3)); m = 4; break; case 0xf5: this.push(this.af); m = 4; break;
      case 0xc2: case 0xca: case 0xd2: case 0xda: { const a = this.fetch16(); if (this.cond((op >> 3) & 3)) { this.pc = a; m = 4; } else m = 3; break; }
      case 0xc3: this.pc = this.fetch16(); m = 4; break; case 0xe9: this.pc = this.hl; break;
      case 0xc4: case 0xcc: case 0xd4: case 0xdc: { const a = this.fetch16(); if (this.cond((op >> 3) & 3)) { this.push(this.pc); this.pc = a; m = 6; } else m = 3; break; }
      case 0xcd: { const a = this.fetch16(); this.push(this.pc); this.pc = a; m = 6; break; }
      case 0xc6: case 0xce: case 0xd6: case 0xde: case 0xe6: case 0xee: case 0xf6: case 0xfe: this.alu((op >> 3) & 7, this.fetch()); m = 2; break;
      case 0xc7: case 0xcf: case 0xd7: case 0xdf: case 0xe7: case 0xef: case 0xf7: case 0xff: this.push(this.pc); this.pc = op & 0x38; m = 4; break;
      case 0xcb: m = this.cb(this.fetch()); break;
      case 0xe0: this.write(0xff00 + this.fetch(), this.a); m = 3; break; case 0xf0: this.a = this.read(0xff00 + this.fetch()); m = 3; break;
      case 0xe2: this.write(0xff00 + this.c, this.a); m = 2; break; case 0xf2: this.a = this.read(0xff00 + this.c); m = 2; break;
      case 0xea: this.write(this.fetch16(), this.a); m = 4; break; case 0xfa: this.a = this.read(this.fetch16()); m = 4; break;
      case 0xe8: { const d = this.fetch() << 24 >> 24, sp = this.sp; this.f = (((sp & 15) + (d & 15)) > 15 ? 0x20 : 0) | (((sp & 255) + (d & 255)) > 255 ? 0x10 : 0); this.sp = (sp + d) & 0xffff; m = 4; break; }
      case 0xf8: { const d = this.fetch() << 24 >> 24, sp = this.sp; this.f = (((sp & 15) + (d & 15)) > 15 ? 0x20 : 0) | (((sp & 255) + (d & 255)) > 255 ? 0x10 : 0); this.hl = (sp + d) & 0xffff; m = 3; break; }
      case 0xf9: this.sp = this.hl; m = 2; break; case 0xf3: this.ime = false; this.imeNext = false; break; case 0xfb: this.imeNext = true; break;
      default: throw new Error('illegal opcode ' + op.toString(16) + ' at ' + this.pcStart.toString(16));
    }
    this.tick(m);
  }
  runFrame(limit = 2e6) { this.frameReady = false; let n = 0; while (!this.frameReady) { this.step(); if (++n > limit) throw new Error('no frame after ' + limit + ' steps (pc=' + this.pc.toString(16) + ')'); } }
  runFrames(k) { for (let i = 0; i < k; i++) this.runFrame(); }
  // ----- a picture of the screen (shades 0..3), using the registers as they are now -----
  render() {
    const io = this.io, lcdc = io[0x40], px = new Uint8Array(160 * 144); if (!(lcdc & 0x80)) return px;
    const bgp = io[0x47], obp0 = io[0x48], obp1 = io[0x49], scy = io[0x42], scx = io[0x43], wy = io[0x4a], wx = io[0x4b] - 7, v = this.vram;
    const tileRow = (base, idx, row) => { const addr = base === 0x8000 ? idx * 16 + row * 2 : 0x1000 + ((idx << 24 >> 24) * 16) + row * 2; return [v[addr], v[addr + 1]]; };
    const sprites = []; for (let i = 0; i < 40; i++) sprites.push({ y: this.oam[i * 4] - 16, x: this.oam[i * 4 + 1] - 8, t: this.oam[i * 4 + 2], a: this.oam[i * 4 + 3], i });
    const big = !!(lcdc & 4), sh = big ? 16 : 8;
    for (let y = 0; y < 144; y++) {
      const bgIdx = new Uint8Array(160);
      for (let x = 0; x < 160; x++) {
        let col = 0, useWin = (lcdc & 0x20) && y >= wy && x >= wx;
        if (lcdc & 1 || useWin) {
          let mapBase, mx, my;
          if (useWin) { mapBase = lcdc & 0x40 ? 0x1c00 : 0x1800; mx = x - wx; my = y - wy; } else { mapBase = lcdc & 0x08 ? 0x1c00 : 0x1800; mx = (x + scx) & 255; my = (y + scy) & 255; }
          const idx = v[mapBase + (my >> 3) * 32 + (mx >> 3)], [lo, hi] = tileRow(lcdc & 0x10 ? 0x8000 : 0x8800, idx, my & 7), bit = 7 - (mx & 7); col = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
        }
        bgIdx[x] = col; px[y * 160 + x] = (bgp >> (col * 2)) & 3;
      }
      if (lcdc & 2) { const onLine = sprites.filter(s => y >= s.y && y < s.y + sh).slice(0, 10).sort((a, b) => (b.x - a.x) || (b.i - a.i));
        for (const s of onLine) { let row = y - s.y; if (s.a & 0x40) row = sh - 1 - row; let t = s.t; if (big) t = (t & 0xfe) | (row >= 8 ? 1 : 0); const [lo, hi] = tileRow(0x8000, t, row & 7);
          for (let c = 0; c < 8; c++) { const x = s.x + c; if (x < 0 || x >= 160) continue; const bit = s.a & 0x20 ? c : 7 - c, col = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1); if (!col) continue; if ((s.a & 0x80) && bgIdx[x]) continue; px[y * 160 + x] = ((s.a & 0x10 ? obp1 : obp0) >> (col * 2)) & 3; } } }
    }
    return px;
  }
}
module.exports = { GB };
