// A small assembler for the Game Boy's processor (the Sharp SM83). Original code for this project.
// It reads assembly text (RGBDS-like: labels, local .labels, db/dw/ds/org/equ, expressions) and produces bytes.
// It is used to build Game Boy ROMs for Sudo Make Games, so no outside toolchain is needed.
(() => {
'use strict';
const R8 = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, '[hl]': 6, a: 7 }, R16 = { bc: 0, de: 1, hl: 2, sp: 3 }, R16S = { bc: 0, de: 1, hl: 2, af: 3 }, CC = { nz: 0, z: 1, nc: 2, c: 3 };
const ALU = { add: 0, adc: 1, sub: 2, sbc: 3, and: 4, xor: 5, or: 6, cp: 7 }, CBOPS = { rlc: 0, rrc: 1, rl: 2, rr: 3, sla: 4, sra: 5, swap: 6, srl: 7 };

function assemble(source, opts = {}) {
  const lines = source.split('\n'), syms = new Map(Object.entries(opts.defines || {})), out = new Uint8Array(opts.size || 0x8000).fill(opts.fill === undefined ? 0xff : opts.fill);
  let maxEnd = 0;
  const err = (n, m) => { throw new Error(`asm line ${n}: ${m}`); };
  // ---- expressions: numbers ($hex, %bin, dec, 'c'), symbols, + - * / % << >> & | ^ ~ ( ), low(x) high(x), $ = current address ----
  function evalExpr(str, ln, pc, final) {
    let i = 0; const s = str.trim();
    const ws = () => { while (s[i] === ' ') i++; };
    function prim() {
      ws(); const c = s[i];
      if (c === '(') { i++; const v = or(); ws(); if (s[i] !== ')') err(ln, 'missing )'); i++; return v; }
      if (c === '-') { i++; return -prim(); } if (c === '+') { i++; return prim(); } if (c === '~') { i++; return ~prim(); }
      if (c === '$' && !/[0-9a-fA-F]/.test(s[i + 1] || '')) { i++; return pc; }
      let m;
      if ((m = /^\$([0-9a-fA-F]+)/.exec(s.slice(i)))) { i += m[0].length; return parseInt(m[1], 16); }
      if ((m = /^%([01]+)/.exec(s.slice(i)))) { i += m[0].length; return parseInt(m[1], 2); }
      if ((m = /^0x([0-9a-fA-F]+)/.exec(s.slice(i)))) { i += m[0].length; return parseInt(m[1], 16); }
      if ((m = /^(\d+)/.exec(s.slice(i)))) { i += m[0].length; return parseInt(m[1], 10); }
      if ((m = /^'(.)'/.exec(s.slice(i)))) { i += 3; return m[1].charCodeAt(0); }
      if ((m = /^([A-Za-z_.][\w.]*)/.exec(s.slice(i)))) {
        i += m[0].length; const name = m[1]; ws();
        if ((name === 'low' || name === 'high') && s[i] === '(') { i++; const v = or(); ws(); i++; return name === 'low' ? v & 255 : (v >> 8) & 255; }
        const key = name.startsWith('.') ? scope + name : name;
        if (syms.has(key)) return syms.get(key); if (!final) return 0; err(ln, 'unknown symbol ' + name);
      }
      err(ln, 'bad expression: ' + s);
    }
    const mul = () => { let v = prim(); for (;;) { ws(); const c = s[i]; if (c === '*') { i++; v *= prim(); } else if (c === '/') { i++; const d = prim(); v = d ? Math.trunc(v / d) : 0; } else if (c === '%' && /[\s\d$(]/.test(s[i + 1] || '')) { i++; const d = prim(); v = d ? v % d : 0; } else return v; } };
    const add = () => { let v = mul(); for (;;) { ws(); const c = s[i]; if (c === '+') { i++; v += mul(); } else if (c === '-') { i++; v -= mul(); } else return v; } };
    const sh = () => { let v = add(); for (;;) { ws(); if (s.startsWith('<<', i)) { i += 2; v <<= add(); } else if (s.startsWith('>>', i)) { i += 2; v >>= add(); } else return v; } };
    const and = () => { let v = sh(); for (;;) { ws(); if (s[i] === '&') { i++; v &= sh(); } else return v; } };
    const xor = () => { let v = and(); for (;;) { ws(); if (s[i] === '^') { i++; v ^= and(); } else return v; } };
    function or() { let v = xor(); for (;;) { ws(); if (s[i] === '|') { i++; v |= xor(); } else return v; } }
    const v = or(); ws(); if (i < s.length) err(ln, 'junk after expression: ' + s.slice(i)); return v;
  }
  let scope = '', changed = false; const longJr = new Set();
  const splitArgs = t => { const a = []; let d = 0, cur = '', q = false; for (const ch of t) { if (ch === "'") q = !q; if (!q) { if (ch === '(' || ch === '[') d++; if (ch === ')' || ch === ']') d--; if (ch === ',' && d === 0) { a.push(cur.trim()); cur = ''; continue; } } cur += ch; } if (cur.trim()) a.push(cur.trim()); return a; };
  const isMem = a => /^\[.*\]$/.test(a);
  const memInner = a => a.slice(1, -1).trim();

  // one pass over the program; in pass 0 unknown symbols read as 0 so sizes can be found, in pass 1 everything is final
  function pass(final) {
    let pc = 0; scope = ''; maxEnd = 0; if (!final) syms.__labels = new Set();
    const emit = (b, ln) => { for (const x of b) { if (final) { if (pc < 0 || pc >= out.length) err(ln, 'address out of the ROM: ' + pc.toString(16)); out[pc] = x & 255; } pc++; } if (pc > maxEnd) maxEnd = pc; };
    lines.forEach((raw, idx) => {
      const ln = idx + 1; let line = raw; let q = false, cut = -1; for (let k = 0; k < line.length; k++) { if (line[k] === "'") q = !q; if (!q && line[k] === ';') { cut = k; break; } } if (cut >= 0) line = line.slice(0, cut); line = line.trim(); if (!line) return;
      let m;
      if ((m = /^([A-Za-z_.][\w.]*):(.*)$/.exec(line))) { const nm = m[1]; if (!nm.startsWith('.')) scope = nm; const key = nm.startsWith('.') ? scope + nm : nm; if (!final) { if (syms.has(key) && syms.__labels && syms.__labels.has(key)) err(ln, 'label defined twice: ' + nm); (syms.__labels = syms.__labels || new Set()).add(key); } syms.set(key, pc); line = m[2].trim(); if (!line) return; }
      if ((m = /^([A-Za-z_][\w]*)\s+equ\s+(.+)$/i.exec(line))) { syms.set(m[1], evalExpr(m[2], ln, pc, final)); return; }
      const sp = line.search(/\s/), op = (sp < 0 ? line : line.slice(0, sp)).toLowerCase(), rest = sp < 0 ? '' : line.slice(sp + 1).trim();
      const args = splitArgs(rest), E = e => evalExpr(e, ln, pc, final), lc = args.map(a => a.toLowerCase());
      const byte = (e, bits = 8) => { const v = E(e); if (final && (v < -128 || v > 255)) err(ln, 'value does not fit in a byte: ' + e + ' = ' + v); return v & 255; };
      const word = e => E(e) & 0xffff;
      const rel = e => { const t = E(e), d = t - (pc + 2); if (final && (d < -128 || d > 127)) err(ln, 'jump too far (' + d + ') to ' + e); return d & 255; };
      switch (op) {
        case 'org': pc = E(rest); return;
        case 'db': { const b = []; for (const a of args) { if (/^"/.test(a)) for (const ch of JSON.parse(a)) b.push(ch.charCodeAt(0)); else b.push(byte(a)); } emit(b, ln); return; }
        case 'dw': { const b = []; for (const a of args) { const v = word(a); b.push(v & 255, v >> 8); } emit(b, ln); return; }
        case 'ds': { const n = E(args[0]), v = args[1] !== undefined ? byte(args[1]) : 0; emit(new Array(n).fill(v), ln); return; }
        case 'align': { const n = E(rest); while (pc % n) emit([opts.fill === undefined ? 0xff : opts.fill], ln); return; }
        case 'nop': return emit([0x00], ln); case 'halt': return emit([0x76], ln); case 'stop': return emit([0x10, 0x00], ln); case 'di': return emit([0xf3], ln); case 'ei': return emit([0xfb], ln);
        case 'rlca': return emit([0x07], ln); case 'rrca': return emit([0x0f], ln); case 'rla': return emit([0x17], ln); case 'rra': return emit([0x1f], ln); case 'daa': return emit([0x27], ln); case 'cpl': return emit([0x2f], ln); case 'scf': return emit([0x37], ln); case 'ccf': return emit([0x3f], ln);
        case 'reti': return emit([0xd9], ln);
        case 'ret': if (args.length) { if (!(lc[0] in CC)) err(ln, 'bad condition'); return emit([0xc0 | (CC[lc[0]] << 3)], ln); } return emit([0xc9], ln);
        case 'rst': return emit([0xc7 | (E(args[0]) & 0x38)], ln);
        case 'jp': if (lc[0] === '[hl]' || lc[0] === 'hl') return emit([0xe9], ln); if (args.length === 2) { if (!(lc[0] in CC)) err(ln, 'bad condition'); const v = word(args[1]); return emit([0xc2 | (CC[lc[0]] << 3), v & 255, v >> 8], ln); } { const v = word(args[0]); return emit([0xc3, v & 255, v >> 8], ln); }
        case 'jr': {
          const cc = args.length === 2 ? lc[0] : null, tgt = args.length === 2 ? args[1] : args[0]; if (cc && !(cc in CC)) err(ln, 'bad condition');
          if (!longJr.has(ln)) { const d = E(tgt) - (pc + 2); if (d < -128 || d > 127) { if (!final) { longJr.add(ln); changed = true; } else err(ln, 'jump too far (' + d + ') to ' + tgt); } }
          if (longJr.has(ln)) { const v = word(tgt); return emit([cc ? 0xc2 | (CC[cc] << 3) : 0xc3, v & 255, v >> 8], ln); }
          return emit(cc ? [0x20 | (CC[cc] << 3), rel(tgt)] : [0x18, rel(tgt)], ln);
        }
        case 'call': if (args.length === 2) { if (!(lc[0] in CC)) err(ln, 'bad condition'); const v = word(args[1]); return emit([0xc4 | (CC[lc[0]] << 3), v & 255, v >> 8], ln); } { const v = word(args[0]); return emit([0xcd, v & 255, v >> 8], ln); }
        case 'push': return emit([0xc5 | (R16S[lc[0]] << 4)], ln); case 'pop': return emit([0xc1 | (R16S[lc[0]] << 4)], ln);
        case 'inc': case 'dec': { const dec = op === 'dec'; if (lc[0] in R16) return emit([(dec ? 0x0b : 0x03) | (R16[lc[0]] << 4)], ln); if (lc[0] in R8) return emit([(dec ? 0x05 : 0x04) | (R8[lc[0]] << 3)], ln); err(ln, 'bad operand for ' + op); }
        case 'add': case 'adc': case 'sub': case 'sbc': case 'and': case 'xor': case 'or': case 'cp': {
          if (op === 'add' && lc[0] === 'hl' && lc[1] in R16) return emit([0x09 | (R16[lc[1]] << 4)], ln);
          if (op === 'add' && lc[0] === 'sp') return emit([0xe8, byte(args[1])], ln);
          let src; if (args.length === 2) { if (lc[0] !== 'a') err(ln, op + ' needs a as its first operand'); src = args[1]; } else src = args[0]; const sl = src.toLowerCase();
          if (sl in R8) return emit([0x80 | (ALU[op] << 3) | R8[sl]], ln); return emit([0xc6 | (ALU[op] << 3), byte(src)], ln);
        }
        case 'ldh': { const hi = e => { const v = E(e); if (final && !((v >= 0xff00 && v <= 0xffff) || (v >= 0 && v <= 255))) err(ln, 'ldh needs an address in FF00-FFFF: ' + e); return v & 255; }; const [d, s2] = args; if (isMem(d) && s2.toLowerCase() === 'a') { const inner = memInner(d); if (inner.toLowerCase() === 'c') return emit([0xe2], ln); return emit([0xe0, hi(inner)], ln); } if (d.toLowerCase() === 'a' && isMem(s2)) { const inner = memInner(s2); if (inner.toLowerCase() === 'c') return emit([0xf2], ln); return emit([0xf0, hi(inner)], ln); } err(ln, 'bad ldh'); }
        case 'ld': {
          const [d, s2] = args, dl = lc[0], sl = lc[1];
          if (dl === 'sp' && sl === 'hl') return emit([0xf9], ln);
          if (dl === 'hl' && /^sp\s*[+-]/.test(sl)) return emit([0xf8, byte(s2.replace(/^sp\s*/i, ''))], ln);
          if (dl in R16 && !isMem(s2) && !(sl in R8)) { const v = word(s2); return emit([0x01 | (R16[dl] << 4), v & 255, v >> 8], ln); }
          if (dl in R8 && sl in R8) { if (dl === '[hl]' && sl === '[hl]') err(ln, 'ld [hl],[hl] is halt'); return emit([0x40 | (R8[dl] << 3) | R8[sl]], ln); }
          if (dl in R8 && !isMem(s2) && !(sl in R8)) { if (dl === 'a' && /^[a-z]/.test(sl) && false) return; return emit([0x06 | (R8[dl] << 3), byte(s2)], ln); }
          if (isMem(d) && sl === 'sp') { const v = word(memInner(d)); return emit([0x08, v & 255, v >> 8], ln); }
          if (isMem(d) && sl === 'a') { const inner = memInner(d).toLowerCase(); if (inner === 'bc') return emit([0x02], ln); if (inner === 'de') return emit([0x12], ln); if (inner === 'hl+' || inner === 'hli') return emit([0x22], ln); if (inner === 'hl-' || inner === 'hld') return emit([0x32], ln); if (inner === 'hl') return emit([0x77], ln); const v = word(memInner(d)); return emit([0xea, v & 255, v >> 8], ln); }
          if (dl === 'a' && isMem(s2)) { const inner = memInner(s2).toLowerCase(); if (inner === 'bc') return emit([0x0a], ln); if (inner === 'de') return emit([0x1a], ln); if (inner === 'hl+' || inner === 'hli') return emit([0x2a], ln); if (inner === 'hl-' || inner === 'hld') return emit([0x3a], ln); if (inner === 'hl') return emit([0x7e], ln); const v = word(memInner(s2)); return emit([0xfa, v & 255, v >> 8], ln); }
          err(ln, 'cannot assemble: ' + line);
        }
        case 'rlc': case 'rrc': case 'rl': case 'rr': case 'sla': case 'sra': case 'swap': case 'srl': if (!(lc[0] in R8)) err(ln, 'bad operand'); return emit([0xcb, (CBOPS[op] << 3) | R8[lc[0]]], ln);
        case 'bit': case 'res': case 'set': { const n = E(args[0]); if (n < 0 || n > 7 || !(lc[1] in R8)) err(ln, 'bad bit operand'); return emit([0xcb, ({ bit: 0x40, res: 0x80, set: 0xc0 })[op] | (n << 3) | R8[lc[1]]], ln); }
        default: err(ln, 'unknown instruction: ' + op);
      }
    });
  }
  for (let i = 0; i < 12; i++) { changed = false; pass(false); if (!changed) break; }
  pass(true);
  const labels = {}; for (const [k, v] of syms) if (typeof v === 'number' && !k.includes('.')) labels[k] = v;
  return { bytes: out, end: maxEnd, symbols: labels };
}
const api = { assemble };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA_asm = api;
})();
