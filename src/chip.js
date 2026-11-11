// The sound engine behind Sudo Make Music. Original code for this project.
// It turns a song (patterns of notes) into audio samples, the way a handheld console's four sound channels would play it:
// two pulse-wave channels, one channel that plays a hand-drawn 32-step waveform, and one noise channel. It has no
// browser dependencies, so it can also be tested on its own. Other genres can be added later as more entries in ENGINES.
(() => {
'use strict';

const TICK_HZ = 60;                    // a tracker "tick": the speed of a song is how many ticks one row lasts
const FIELDS = 5;                      // per cell: note, instrument, volume, effect command, effect parameter
const NOTE_CUT = 255;                  // note field value for "stop this channel"
const PULSE_PATTERNS = [[0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1, 1, 0]]; // 12.5%, 25%, 50%, 75%
const EFFECTS = '0124ACFS';            // 0 arpeggio, 1 slide up, 2 slide down, 4 vibrato, A volume slide, C note cut, F speed, S duty

// ----- engines: which channels a song has. A new genre = a new entry with its own channel list and renderer settings. -----
const ENGINES = {
  gameboy: { name: 'Game Boy (4 channels)', channels: [{ name: 'Pulse 1', type: 'pulse' }, { name: 'Pulse 2', type: 'pulse' }, { name: 'Wave', type: 'wave' }, { name: 'Noise', type: 'noise' }] },
};

// ----- instruments -----
const WAVES = {
  triangle: [...Array(32)].map((_, i) => (i < 16 ? i : 31 - i)),
  saw: [...Array(32)].map((_, i) => Math.floor(i / 2)),
  sine: [...Array(32)].map((_, i) => Math.round(7.5 + 7.5 * Math.sin(i / 32 * 2 * Math.PI))),
  square: [...Array(32)].map((_, i) => (i < 16 ? 15 : 0)),
  pulse25: [...Array(32)].map((_, i) => (i < 8 ? 15 : 0)),
  organ: [...Array(32)].map((_, i) => Math.max(0, Math.min(15, Math.round(7.5 + 4.5 * Math.sin(i / 32 * 2 * Math.PI) + 3 * Math.sin(i / 32 * 4 * Math.PI) + 1.5 * Math.sin(i / 32 * 6 * Math.PI))))),
  buzz: [...Array(32)].map((_, i) => (i % 2 ? 15 : 0) * (i < 24 ? 1 : 0.5) | 0),
  silent: new Array(32).fill(0),
};
const pulseInst = (name, duty, vol, dir, period) => ({ name, duty, vol, dir, period });
const noiseInst = (name, width7, vol, dir, period) => ({ name, width7, vol, dir, period });
function defaultInstruments() {
  const pulse = [pulseInst('Lead 50%', 2, 15, 0, 0), pulseInst('Lead 25%', 1, 15, 0, 0), pulseInst('Pluck', 2, 15, -1, 2), pulseInst('Thin 12.5%', 0, 13, 0, 0), pulseInst('Soft 75%', 3, 10, 0, 0), pulseInst('Blip', 1, 13, -1, 1), pulseInst('Stab', 2, 15, -1, 4), pulseInst('Swell', 2, 3, 1, 5)];
  const wave = [['Triangle bass', 'triangle'], ['Saw', 'saw'], ['Soft sine', 'sine'], ['Square', 'square'], ['Pulse 25%', 'pulse25'], ['Organ', 'organ'], ['Buzz', 'buzz']].map(([name, w]) => ({ name, wave: WAVES[w].slice(), vol: 1 }));
  const noise = [noiseInst('Hat', false, 10, -1, 1), noiseInst('Snare', false, 15, -1, 2), noiseInst('Kick', true, 15, -1, 3), noiseInst('Crash', false, 12, -1, 5), noiseInst('Metal', true, 11, -1, 2), noiseInst('Tick', false, 9, -1, 1)];
  const fill = (a, make) => { while (a.length < 16) a.push(make(a.length)); return a; };
  return { pulse: fill(pulse, i => pulseInst('Pulse ' + i, 2, 15, 0, 0)), wave: fill(wave, i => ({ name: 'Wave ' + i, wave: WAVES.triangle.slice(), vol: 1 })), noise: fill(noise, i => noiseInst('Noise ' + i, false, 12, -1, 2)) };
}

// ----- songs -----
function newPattern(rows, channels = 4) { return { rows, data: new Uint8Array(rows * channels * FIELDS) }; }
function newSong(engine = 'gameboy') {
  return { engine, name: 'Untitled song', speed: 6, loopStart: 0, order: [0], patterns: [newPattern(32)], inst: defaultInstruments(), ch: ENGINES[engine].channels.map(() => ({ mute: false, solo: false, pan: 'C', vol: 100 })) };
}
const cellIndex = (row, ch, field, channels = 4) => ((row * channels) + ch) * FIELDS + field;
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = n => NOTE_NAMES[n % 12] + Math.floor(n / 12); // note numbers: 0 = C-0, 57 = A-4 (440 Hz), 95 = B-7
function parseNote(s) { const m = /^([A-Ga-g])([-#b]?)(\d)$/.exec(s); if (!m) return -1; const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return base + 12 * +m[3]; }

// ----- the sound of each channel type -----
const clampi = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pulseHz = f => { const x = clampi(Math.round(2048 - 131072 / f), 0, 2047); return 131072 / (2048 - x); };   // the register only has 11 bits, so pitches are slightly "snapped", as on the real chip
const waveHz = f => { const x = clampi(Math.round(2048 - 65536 / f), 0, 2047); return 65536 / (2048 - x); };
const noteHz = semis => 440 * Math.pow(2, (semis - 57) / 12);

function makeChannel(type) { return { type, on: false, pitch: 0, instIdx: 0, volCol: 15, ev: 15, edir: 0, eper: 0, etimer: 0, phase: 0, lfsr: 0x7fff, nacc: 0, duty: 0, dutyOverride: false, width7: false, wave: null, wshift: 0, fxc: 0, fxp: 0, slide: 0, vib: 0, hp: 0, lastIn: 0 }; }

// Renders a song (or part of it) to stereo samples. opts: sampleRate, pattern (render just that pattern), from/to (order positions), solo is read from the song.
function render(song, opts = {}) {
  const engine = ENGINES[song.engine] || ENGINES.gameboy, sr = opts.sampleRate || 44100, nch = engine.channels.length;
  const seq = opts.pattern !== undefined ? [{ pat: opts.pattern, order: -1 }] : song.order.slice(opts.from || 0, (opts.to === undefined ? song.order.length - 1 : opts.to) + 1).map((p, i) => ({ pat: p, order: (opts.from || 0) + i }));
  // pass 1: the timeline (rows and how many ticks each lasts: the F effect changes the speed)
  const rows = []; let speed = clampi(opts.speed || song.speed || 6, 1, 31), ticks = 0;
  for (const s of seq) { const pat = song.patterns[s.pat]; if (!pat) continue; for (let r = 0; r < pat.rows; r++) { for (let c = 0; c < nch; c++) { const i = cellIndex(r, c, 0, nch); if (pat.data[i + 3] === 70 /* F */ && pat.data[i + 4] >= 1) speed = clampi(pat.data[i + 4], 1, 31); } rows.push({ pat, r, order: s.order, speed, tick0: ticks }); ticks += speed; } }
  const tickStart = t => Math.floor(t * sr / TICK_HZ), total = tickStart(ticks), L = new Float32Array(total), R = new Float32Array(total), starts = [];
  const chans = engine.channels.map(c => makeChannel(c.type)), solo = song.ch.some(c => c.solo);
  const mixCh = engine.channels.map((_, c) => { const cfg = song.ch[c] || {}; const audible = !cfg.mute && (!solo || cfg.solo); const g = audible ? (cfg.vol === undefined ? 100 : cfg.vol) / 100 * 0.25 : 0; return { l: cfg.pan === 'R' ? 0 : g, r: cfg.pan === 'L' ? 0 : g }; });
  const bank = { pulse: song.inst.pulse, wave: song.inst.wave, noise: song.inst.noise };

  for (const row of rows) {
    const { pat, r } = row; starts.push({ sample: tickStart(row.tick0), order: row.order, row: r, pattern: s2i(song, pat) });
    // row start: read each channel's cell
    chans.forEach((ch, c) => {
      const i = cellIndex(r, c, 0, nch), note = pat.data[i], inst = pat.data[i + 1], vol = pat.data[i + 2];
      ch.fxc = pat.data[i + 3]; ch.fxp = pat.data[i + 4];
      if (inst > 0) ch.instIdx = inst - 1; if (vol > 0) ch.volCol = vol - 1;
      if (note === NOTE_CUT) ch.on = false;
      else if (note > 0) {
        const def = (bank[ch.type] || [])[ch.instIdx] || {}; ch.on = true; ch.pitch = note - 1; ch.phase = 0; ch.slide = 0; ch.vib = 0; ch.etimer = 0; ch.dutyOverride = false;
        if (ch.type === 'wave') { ch.wave = def.wave || WAVES.triangle; ch.wshift = def.vol === 0 ? 4 : clampi((def.vol || 1) - 1, 0, 3); ch.ev = 15; ch.edir = 0; ch.eper = 0; }
        else { ch.duty = def.duty || 0; ch.width7 = !!def.width7; ch.ev = def.vol === undefined ? 15 : def.vol; ch.edir = def.dir || 0; ch.eper = def.period || 0; ch.lfsr = 0x7fff; }
      }
      if (ch.fxc === 83 /* S */ && ch.type === 'pulse') { ch.duty = ch.fxp & 3; ch.dutyOverride = true; }
    });
    // each tick of the row
    for (let t = 0; t < row.speed; t++) {
      const a = tickStart(row.tick0 + t), b = tickStart(row.tick0 + t + 1), n = b - a;
      chans.forEach((ch, c) => {
        const cmd = ch.fxc ? String.fromCharCode(ch.fxc) : '', p = ch.fxp; let semis = ch.pitch;
        if (cmd === 'C' && t >= p) ch.on = false;
        if (cmd === '0' && p) semis += [0, p >> 4, p & 15][t % 3];
        if (cmd === '1' && t > 0) ch.slide += p / 16; if (cmd === '2' && t > 0) ch.slide -= p / 16;
        if (cmd === '4') { ch.vib += (p >> 4) * 0.08; semis += Math.sin(ch.vib) * (p & 15) * 0.125; }
        if (cmd === 'A' && t > 0) ch.volCol = clampi(ch.volCol + (p >> 4) - (p & 15), 0, 15);
        semis += ch.slide;
        if (!ch.on) { ch.hp = 0; ch.lastIn = 0; return; }
        const mc = mixCh[c]; if (!mc.l && !mc.r) return;
        const stepEnv = ch.eper > 0 ? ch.eper * sr / 64 : 0; const dc = 0.995;
        if (ch.type === 'pulse' || ch.type === 'wave') {
          const f = ch.type === 'pulse' ? pulseHz(noteHz(semis)) : waveHz(noteHz(semis)), inc = f / sr, pat8 = PULSE_PATTERNS[ch.duty & 3];
          for (let k = 0; k < n; k++) {
            let v;
            if (ch.type === 'pulse') { const env = ch.ev; v = pat8[Math.floor(ch.phase * 8)] ? Math.round(env * ch.volCol / 15) / 15 : 0; }
            else v = ch.wshift > 3 ? 0 : (ch.wave[Math.floor(ch.phase * 32)] >> ch.wshift) / 15 * Math.round(ch.volCol) / 15;
            ch.phase += inc; if (ch.phase >= 1) ch.phase -= Math.floor(ch.phase);
            if (stepEnv && ++ch.etimer >= stepEnv) { ch.etimer -= stepEnv; ch.ev = clampi(ch.ev + ch.edir, 0, 15); }
            const y = v - ch.lastIn + dc * ch.hp; ch.lastIn = v; ch.hp = y; const idx = a + k; L[idx] += y * mc.l; R[idx] += y * mc.r;
          }
        } else { // noise: a shift register that is clocked faster for higher notes
          const clock = clampi(4096 * Math.pow(2, (semis - 48) / 12), 64, 524288), inc = clock / sr;
          for (let k = 0; k < n; k++) {
            ch.nacc += inc; while (ch.nacc >= 1) { ch.nacc -= 1; const x = (ch.lfsr ^ (ch.lfsr >> 1)) & 1; ch.lfsr = (ch.lfsr >> 1) | (x << 14); if (ch.width7) ch.lfsr = (ch.lfsr & ~0x40) | (x << 6); }
            const v = (~ch.lfsr & 1) ? Math.round(ch.ev * ch.volCol / 15) / 15 : 0;
            if (stepEnv && ++ch.etimer >= stepEnv) { ch.etimer -= stepEnv; ch.ev = clampi(ch.ev + ch.edir, 0, 15); }
            const y = v - ch.lastIn + dc * ch.hp; ch.lastIn = v; ch.hp = y; const idx = a + k; L[idx] += y * mc.l; R[idx] += y * mc.r;
          }
        }
      });
    }
  }
  const loopStart = opts.pattern !== undefined ? 0 : (starts.find(s => s.order === song.loopStart) || starts[0] || { sample: 0 }).sample;
  return { L, R, sampleRate: sr, length: total, rows: starts, loopStart };
}
const s2i = (song, pat) => song.patterns.indexOf(pat);

// A 16-bit stereo WAV file of the rendered song.
function toWav(r) {
  const n = r.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, r.sampleRate, true); v.setUint32(28, r.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  const q = x => Math.round(clampi(x, -1, 1) * 32767); for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, q(r.L[i]), true); v.setInt16(46 + i * 4, q(r.R[i]), true); }
  return new Uint8Array(buf);
}

const clampi2 = (v, lo, hi) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function parseSong(json) { // checks a song file and returns the song (used by the editor, by games and by the ROM builder)
  const o = JSON.parse(json); if (o.app !== 'sudo-make-music' || o.v !== 1) throw new Error('Not a Sudo Make Music file');
  const eng = ENGINES[o.engine]; if (!eng) throw new Error('This song needs a sound engine this version does not have'); const nch = eng.channels.length, bad = () => { throw new Error('Damaged song file'); };
  const patterns = o.patterns.map(p => { const rows = clampi2(p.rows, 1, 128), data = unb64(p.data); if (data.length !== rows * nch * FIELDS) bad(); for (let i = 0; i < data.length; i += FIELDS) { if (data[i] > 96 && data[i] !== 255 || data[i + 1] > 16 || data[i + 2] > 16 || (data[i + 3] && !EFFECTS.includes(String.fromCharCode(data[i + 3])))) bad(); } return { rows, data }; });
  if (!patterns.length || !o.order.length || o.order.some(p => !Number.isInteger(p) || p < 0 || p >= patterns.length)) bad();
  const def = defaultInstruments(), inst = { pulse: def.pulse, wave: def.wave, noise: def.noise }, take = (kind, fn) => { (o.instruments && o.instruments[kind] || []).slice(0, 16).forEach((x, i) => { inst[kind][i] = fn(x, def[kind][i]); }); };
  const n = (v, lo, hi, d) => (Number.isFinite(+v) ? clampi2(v, lo, hi) : d), nm = (x, d) => String(x && x.name || d.name).slice(0, 24);
  take('pulse', (x, d) => ({ name: nm(x, d), duty: n(x.duty, 0, 3, 2), vol: n(x.vol, 0, 15, 15), dir: n(x.dir, -1, 1, 0), period: n(x.period, 0, 7, 0) }));
  take('noise', (x, d) => ({ name: nm(x, d), width7: !!x.width7, vol: n(x.vol, 0, 15, 12), dir: n(x.dir, -1, 1, 0), period: n(x.period, 0, 7, 0) }));
  take('wave', (x, d) => ({ name: nm(x, d), wave: Array.isArray(x.wave) && x.wave.length === 32 ? x.wave.map(v => n(v, 0, 15, 0)) : d.wave, vol: n(x.vol, 0, 3, 1) }));
  const ch = eng.channels.map((_, i) => { const c = (o.channels || [])[i] || {}; return { mute: !!c.mute, solo: !!c.solo, pan: ['L', 'C', 'R'].includes(c.pan) ? c.pan : 'C', vol: n(c.vol, 0, 100, 100) }; });
  return { engine: o.engine, name: String(o.name || 'Untitled song').slice(0, 120), speed: n(o.speed, 1, 31, 6), loopStart: n(o.loopStart, 0, o.order.length - 1, 0), order: o.order.slice(), patterns, inst, ch };
}

const api = { parseSong, ENGINES, FIELDS, NOTE_CUT, EFFECTS, WAVES, TICK_HZ, newSong, newPattern, defaultInstruments, cellIndex, noteName, parseNote, render, toWav, pulseHz, waveHz, noteHz };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA_chip = api;
})();
