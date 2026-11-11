// Game Boy sound for exported games: a music player for the four sound channels and a few sound effects. Original code.
// build() turns a song made in Sudo Make Music into data and returns the player's assembly code to go with it.
// The player runs once per video frame (60 times a second) like the tracker itself: it reads rows of notes and writes the
// sound registers. Supported on the cartridge: notes, instruments (tone, envelope, waveform, noise type), volume, note cut,
// arpeggio, slides, vibrato, duty change and speed change. Not supported: volume slides and per-channel volume sliders.
(() => {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const C = isNode ? require('./chip.js') : window.SMA_chip;
const clampi = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const db = (arr, per = 16) => { const out = []; for (let i = 0; i < arr.length; i += per) out.push(' db ' + arr.slice(i, i + per).map(v => v & 255).join(',')); return out.join('\n'); };

const regPulse = n => clampi(Math.round(2048 - 131072 / C.noteHz(n)), 0, 2047);
const regWave = n => clampi(Math.round(2048 - 65536 / C.noteHz(n)), 0, 2047);
function noiseByte(n) { const want = clampi(4096 * Math.pow(2, (n - 48) / 12), 64, 524288); let best = 1e9, byte = 0; for (let s = 0; s <= 13; s++) for (let r = 0; r < 8; r++) { const f = r === 0 ? 524288 / Math.pow(2, s) : 262144 / (r * Math.pow(2, s)), d = Math.abs(Math.log(f / want)); if (d < best) { best = d; byte = (s << 4) | r; } } return byte; }

// sound effects: [frames, note, slide per frame in register units, fade (NR22)]
const SFX = [
  [[1, 'G-4', 0, 0xd1], [1, 'G-4', 24, 0xd1], [1, 'G-4', 24, 0xd1], [1, 'G-4', 24, 0xd1], [1, 'G-4', 24, 0xd1], [1, 'G-4', 24, 0xd1], [2, 'G-4', 24, 0xd1]], // jump
  [[3, 'B-5', 0, 0xd1], [8, 'E-6', 0, 0xd2]],                                                                                                            // coin
  [[2, 'C-5', 0, 0xf2], [2, 'C-5', -30, 0xf2], [2, 'C-5', -30, 0xf2], [2, 'C-5', -30, 0xf2], [2, 'C-5', -30, 0xf2], [2, 'C-5', -30, 0xf2], [4, 'C-5', -30, 0xf3]], // hurt
  [[4, 'A-5', 0, 0xc1]],                                                                                                                                 // talk
  [[4, 'C-5', 0, 0xd1], [6, 'G-5', 0, 0xd2]],                                                                                                            // start
  [[3, 'E-5', 0, 0xd1], [3, 'G-5', 0, 0xd1], [8, 'C-6', 0, 0xd2]],                                                                                       // goal
  [[4, 'C-5', 0, 0xd1], [4, 'E-5', 0, 0xd1], [4, 'G-5', 0, 0xd1], [12, 'C-6', 0, 0xd3]],                                                                 // win
  [[6, 'G-4', 0, 0xd1], [6, 'E-4', 0, 0xd1], [6, 'C-4', 0, 0xd1], [16, 'G-3', 0, 0xd3]],                                                                 // game over
];
function sfxData() {
  const lab = SFX.map((_, i) => 'Sfx' + i);
  let out = 'SfxTable: dw ' + lab.join(',') + '\n';
  SFX.forEach((steps, i) => { const b = []; steps.forEach(([frames, note, slide, env]) => { const reg = clampi(regPulse(C.parseNote(note)) + 0, 0, 2047); let frame = frames; if (slide) { for (let k = 0; k < frames; k++) { const r = clampi(reg + slide * (k + 1), 0, 2047); b.push(1, env, r & 255, 0x80 | (r >> 8)); } } else b.push(frame, env, reg & 255, 0x80 | (reg >> 8)); }); b.push(0); out += `Sfx${i}:\n${db(b, 4)}\n`; });
  return out;
}

function songData(song) {
  const eng = C.ENGINES[song.engine], nch = 4, rows = song.patterns.map(p => p.rows);
  const waves = [], waveIdx = new Map(); const waveOf = w => { const key = w.join(','); if (!waveIdx.has(key)) { waveIdx.set(key, waves.length); const bytes = []; for (let i = 0; i < 32; i += 2) bytes.push((w[i] << 4) | w[i + 1]); waves.push(bytes); } return waveIdx.get(key); };
  const env = i => ((i.dir > 0 ? 8 : 0) | (i.dir === 0 ? 0 : i.period)) & 15;
  const pulse = []; song.inst.pulse.forEach(i => pulse.push(i.duty << 6, env(i), i.vol, 0));
  const wave = []; song.inst.wave.forEach(i => wave.push(i.vol === 0 ? 0 : [0, 0x20, 0x40, 0x60][i.vol], waveOf(i.wave), 0, 0));
  const noise = []; song.inst.noise.forEach(i => noise.push(i.width7 ? 8 : 0, env(i), i.vol, 0));
  const fp = [], fw = [], nz = []; for (let n = 0; n < 96; n++) { const a = regPulse(n), b = regWave(n); fp.push(a & 255, a >> 8); fw.push(b & 255, b >> 8); nz.push(noiseByte(n)); }
  const vt = []; for (let ev = 0; ev < 16; ev++) for (let vc = 0; vc < 16; vc++) vt.push(Math.round(ev * vc / 15));
  const solo = song.ch.some(c => c.solo); let nr51 = 0; song.ch.forEach((c, i) => { const audible = !c.mute && (!solo || c.solo); if (!audible) return; if (c.pan !== 'R') nr51 |= 1 << (4 + i); if (c.pan !== 'L') nr51 |= 1 << i; });
  let s = `MusicOn: db 1\nSongSpeed: db ${song.speed}\nSongLoop: db ${song.loopStart}\nSongOrderLen: db ${song.order.length}\nSongNr51: db ${nr51}\nSongOrder:\n${db(song.order)}\nSongPatTable: dw ${song.patterns.map((_, i) => 'Pat' + i).join(',')}\n`;
  song.patterns.forEach((p, i) => { s += `Pat${i}:\n db ${p.rows}\n${db(Array.from(p.data), 20)}\n`; });
  s += `InstPulse:\n${db(pulse, 4)}\nInstWave:\n${db(wave, 4)}\nInstNoise:\n${db(noise, 4)}\nWaveData:\n${db(waves.flat(), 16)}\nFreqPulse:\n${db(fp)}\nFreqWave:\n${db(fw)}\nNoiseTab:\n${db(nz)}\nVolTab:\n${db(vt)}\n`;
  void eng; void rows; return s;
}
const emptySong = () => { const s = C.newSong(); s.patterns = [C.newPattern(16)]; s.order = [0]; return s; };

const CODE = `
; ===================== sound =====================
rNR10 equ $FF10
rNR12 equ $FF12
rNR21 equ $FF16
rNR22 equ $FF17
rNR23 equ $FF18
rNR24 equ $FF19
rNR30 equ $FF1A
rNR32 equ $FF1C
rNR41 equ $FF20
rNR42 equ $FF21
rNR43 equ $FF22
rNR44 equ $FF23
rNR50 equ $FF24
rNR51 equ $FF25
rNR52 equ $FF26
rWAVE equ $FF30
A_SFXP equ v_aud
A_SFXT equ v_aud+2
A_SFXON equ v_aud+3
A_MON equ v_aud+4
A_TICK equ v_aud+5
A_SPEED equ v_aud+6
A_ROW equ v_aud+7
A_ORD equ v_aud+8
A_PATP equ v_aud+9
A_ROWS equ v_aud+11
A_T equ v_aud+12
A_N equ v_aud+13
A_I equ v_aud+14
A_V equ v_aud+15
A_FC equ v_aud+16
A_FP equ v_aud+17
A_X equ v_aud+18
A_NW equ v_aud+19
A_CH equ v_aud+24
CH_ON equ A_CH
CH_NOTE equ A_CH+4
CH_INST equ A_CH+8
CH_VOL equ A_CH+12
CH_FXC equ A_CH+16
CH_FXP equ A_CH+20
CH_BLO equ A_CH+24
CH_BHI equ A_CH+28
CH_SLO equ A_CH+32
CH_SHI equ A_CH+36
CH_VIB equ A_CH+40

AudioInit:
 ld a,$80
 ldh [rNR52],a
 ld a,$77
 ldh [rNR50],a
 ld a,$FF
 ldh [rNR51],a
 xor a
 ld [A_MON],a
 ld [A_SFXON],a
 ret

AddCh:
 push af
 ld a,[A_T]
 ld e,a
 ld d,0
 add hl,de
 pop af
 ret

MusicSilence:
 xor a
 ldh [rNR12],a
 ldh [rNR22],a
 ldh [rNR30],a
 ldh [rNR42],a
 ret

MusicStart:
 ld a,[MusicOn]
 or a
 ret z
 call MusicSilence
 ld a,[SongNr51]
 ldh [rNR51],a
 ld a,[SongSpeed]
 ld [A_SPEED],a
 xor a
 ld [A_TICK],a
 ld [A_ROW],a
 ld [A_ORD],a
 ld hl,A_CH
 ld bc,44
 xor a
 call MemFill
 ld hl,CH_VOL
 ld a,15
 ld [hl+],a
 ld [hl+],a
 ld [hl+],a
 ld [hl],a
 call LoadPattern
 ld a,1
 ld [A_MON],a
 ret
MusicStop:
 xor a
 ld [A_MON],a
 jp MusicSilence

LoadPattern:
 ld a,[A_ORD]
 ld e,a
 ld d,0
 ld hl,SongOrder
 add hl,de
 ld a,[hl]
 add a,a
 ld e,a
 ld d,0
 ld hl,SongPatTable
 add hl,de
 ld a,[hl+]
 ld h,[hl]
 ld l,a
 ld a,[hl+]
 ld [A_ROWS],a
 ld a,l
 ld [A_PATP],a
 ld a,h
 ld [A_PATP+1],a
 ret

MusicTick:
 call SfxTick
 ld a,[A_MON]
 or a
 ret z
 ld a,[A_TICK]
 or a
 call z,RowStart
 call TickEffects
 ld a,[A_TICK]
 inc a
 ld b,a
 ld a,[A_SPEED]
 cp b
 jr z,.next
 jr c,.next
 ld a,b
 ld [A_TICK],a
 ret
.next: xor a
 ld [A_TICK],a
 ld a,[A_ROW]
 inc a
 ld [A_ROW],a
 ld b,a
 ld a,[A_ROWS]
 cp b
 ret nz
 xor a
 ld [A_ROW],a
 ld a,[A_ORD]
 inc a
 ld [A_ORD],a
 ld b,a
 ld a,[SongOrderLen]
 cp b
 jr nz,.lp
 ld a,[SongLoop]
 ld [A_ORD],a
.lp: jp LoadPattern

RowStart:
 xor a
 ld [A_T],a
.ch: ld a,[A_ROW]
 add a,a
 add a,a
 ld b,a
 ld a,[A_T]
 add a,b
 ld e,a
 ld d,0
 ld h,d
 ld l,e
 add hl,hl
 add hl,hl
 add hl,de
 ld a,[A_PATP]
 ld e,a
 ld a,[A_PATP+1]
 ld d,a
 add hl,de
 ld a,[hl+]
 ld [A_N],a
 ld a,[hl+]
 ld [A_I],a
 ld a,[hl+]
 ld [A_V],a
 ld a,[hl+]
 ld [A_FC],a
 ld a,[hl]
 ld [A_FP],a
 ld a,[A_I]
 or a
 jr z,.noi
 dec a
 ld hl,CH_INST
 call AddCh
 ld [hl],a
.noi: ld a,[A_V]
 or a
 jr z,.nov
 dec a
 ld hl,CH_VOL
 call AddCh
 ld [hl],a
.nov: ld a,[A_FC]
 ld hl,CH_FXC
 call AddCh
 ld [hl],a
 ld a,[A_FP]
 ld hl,CH_FXP
 call AddCh
 ld [hl],a
 ld a,[A_FC]
 cp 'F'
 jr nz,.nof
 ld a,[A_FP]
 or a
 jr z,.nof
 cp 32
 jr nc,.nof
 ld [A_SPEED],a
.nof: ld a,[A_N]
 or a
 jr z,.done
 cp 255
 jr z,.cut
 dec a
 call Trigger
 jr .done
.cut: call CutChannel
.done: ld a,[A_T]
 inc a
 ld [A_T],a
 cp 4
 jr nz,.ch
 ret

CutChannel:
 ld hl,CH_ON
 call AddCh
 ld [hl],0
 ld a,[A_T]
 cp 2
 jr z,.wave
 cp 3
 jr z,.noise
 or a
 ld c,$12
 jr z,.p
 ld a,[A_SFXON]
 or a
 ret nz
 ld c,$17
.p: xor a
 ldh [c],a
 ret
.wave: xor a
 ldh [rNR30],a
 ret
.noise: xor a
 ldh [rNR42],a
 ret

; Trigger: a = note (0..95) on channel A_T
Trigger:
 ld b,a
 ld hl,CH_NOTE
 call AddCh
 ld [hl],b
 ld hl,CH_ON
 call AddCh
 ld [hl],1
 xor a
 ld hl,CH_SLO
 call AddCh
 ld [hl],a
 ld hl,CH_SHI
 call AddCh
 ld [hl],a
 ld hl,CH_VIB
 call AddCh
 ld [hl],a
 ld a,[A_T]
 cp 2
 jp z,.wave
 cp 3
 jp z,.noise
 ; ---- pulse ----
 ld hl,CH_INST
 call AddCh
 ld a,[hl]
 add a,a
 add a,a
 ld e,a
 ld d,0
 ld hl,InstPulse
 add hl,de
 ld a,[hl+]
 ld [A_X],a
 ld a,[hl+]
 ld c,a
 ld a,[hl]
 call VolLevel
 swap a
 or c
 ld c,a
 ld a,[A_FC]
 cp 'S'
 jr nz,.nds
 ld a,[A_FP]
 and 3
 rrca
 rrca
 ld [A_X],a
.nds: ld a,[A_T]
 or a
 ld a,$11
 jr z,.p1
 ld a,[A_SFXON]
 or a
 ret nz
 ld a,$16
.p1: ld [A_X+1],a
 ld a,b
 call GetFreq
 ld a,[A_X+1]
 ld l,a
 ld h,$FF
 ld a,[A_X]
 ld [hl+],a
 ld a,c
 ld [hl+],a
 ld a,e
 ld [hl+],a
 ld a,d
 and 7
 or $80
 ld [hl],a
 jp StoreBase
.wave: ld hl,CH_INST
 call AddCh
 ld a,[hl]
 add a,a
 add a,a
 ld e,a
 ld d,0
 ld hl,InstWave
 add hl,de
 ld a,[hl+]
 ld c,a
 ld a,[hl]
 swap a
 ld e,a
 ld d,0
 ld hl,WaveData
 add hl,de
 xor a
 ldh [rNR30],a
 ld de,rWAVE
 ld b,16
.cw: ld a,[hl+]
 ld [de],a
 inc de
 dec b
 jr nz,.cw
 ld a,$80
 ldh [rNR30],a
 ld hl,CH_VOL
 call AddCh
 ld a,[hl]
 or a
 jr nz,.wv
 ld c,0
.wv: ld a,c
 ldh [rNR32],a
 ld hl,CH_NOTE
 call AddCh
 ld a,[hl]
 call GetFreq
 ld a,e
 ldh [$FF1D],a
 ld a,d
 and 7
 or $80
 ldh [$FF1E],a
 jp StoreBase
.noise: ld hl,CH_INST
 call AddCh
 ld a,[hl]
 add a,a
 add a,a
 ld e,a
 ld d,0
 ld hl,InstNoise
 add hl,de
 ld a,[hl+]
 ld [A_X],a
 ld [A_NW],a
 ld a,[hl+]
 ld c,a
 ld a,[hl]
 call VolLevel
 swap a
 or c
 ldh [rNR42],a
 xor a
 ldh [rNR41],a
 ld hl,CH_NOTE
 call AddCh
 ld a,[hl]
 ld e,a
 ld d,0
 ld hl,NoiseTab
 add hl,de
 ld a,[A_X]
 ld b,a
 ld a,[hl]
 or b
 ldh [rNR43],a
 ld a,$80
 ldh [rNR44],a
 ret

; VolLevel: a = instrument volume, channel A_T's volume column -> a = volume 0..15
VolLevel:
 swap a
 push af
 ld hl,CH_VOL
 call AddCh
 ld a,[hl]
 ld e,a
 pop af
 add a,e
 ld e,a
 ld d,0
 ld hl,VolTab
 add hl,de
 ld a,[hl]
 ret

; GetFreq: a = note -> de = 11-bit frequency value for the channel type of A_T
GetFreq:
 ld l,a
 ld h,0
 add hl,hl
 ld de,FreqPulse
 ld a,[A_T]
 cp 2
 jr nz,.p
 ld de,FreqWave
.p: add hl,de
 ld a,[hl+]
 ld e,a
 ld d,[hl]
 ret

StoreBase:
 ld hl,CH_NOTE
 call AddCh
 ld a,[hl]
 call GetFreq
 ld b,d
 ld c,e
 ld hl,CH_BLO
 call AddCh
 ld [hl],c
 ld hl,CH_BHI
 call AddCh
 ld [hl],b
 ret

; WriteFreq: de = frequency value, no restart
WriteFreq:
 ld a,[A_T]
 cp 2
 jr z,.wave
 or a
 ld c,$13
 jr z,.w
 ld a,[A_SFXON]
 or a
 ret nz
 ld c,$18
 jr .w
.wave: ld c,$1D
.w: ld a,e
 ldh [c],a
 inc c
 ld a,d
 and 7
 ldh [c],a
 ret

TickEffects:
 ld a,[A_TICK]
 or a
 ret z
 xor a
 ld [A_T],a
.ch: ld hl,CH_ON
 call AddCh
 ld a,[hl]
 or a
 jp z,.next
 ld hl,CH_FXC
 call AddCh
 ld a,[hl]
 or a
 jp z,.next
 ld [A_FC],a
 ld hl,CH_FXP
 call AddCh
 ld a,[hl]
 ld [A_FP],a
 ld a,[A_FC]
 cp '0'
 jr z,.arp
 cp '1'
 jp z,.up
 cp '2'
 jp z,.down
 cp '4'
 jp z,.vib
 cp 'C'
 jp z,.cut
 jp .next
.cut: ld a,[A_FP]
 ld b,a
 ld a,[A_TICK]
 cp b
 jp c,.next
 call CutChannel
 jp .next
.arp: ld a,[A_FP]
 or a
 jp z,.next
 ld a,[A_TICK]
.m3: cp 3
 jr c,.m3d
 sub 3
 jr .m3
.m3d: or a
 jp z,.next
 ld b,a
 ld a,[A_FP]
 ld c,a
 ld a,b
 cp 1
 ld a,c
 jr nz,.lo
 swap a
.lo: and $0F
 ld c,a
 ld hl,CH_NOTE
 call AddCh
 ld a,[hl]
 add a,c
 cp 96
 jr c,.ok
 ld a,95
.ok: ld c,a
 ld a,[A_T]
 cp 3
 jr z,.arpn
 ld a,c
 call GetFreq
 call WriteFreq
 jp .next
.arpn: ld e,c
 ld d,0
 ld hl,NoiseTab
 add hl,de
 ld a,[hl]
 ld b,a
 ld a,[A_NW]
 or b
 ldh [rNR43],a
 jp .next
.up: ld a,[A_FP]
 ld e,a
 ld d,0
 jr .slide
.down: ld a,[A_FP]
 ld e,a
 ld d,0
 ld a,e
 cpl
 inc a
 ld e,a
 ld d,$FF
 or a
 jr nz,.slide
 ld d,0
.slide: ld a,[A_T]
 cp 3
 jp z,.next
 push de
 ld hl,CH_SLO
 call AddCh
 ld a,[hl]
 ld c,a
 ld hl,CH_SHI
 call AddCh
 ld a,[hl]
 ld b,a
 pop de
 ld h,b
 ld l,c
 add hl,de
 ld a,l
 ld c,a
 ld a,h
 ld b,a
 ld hl,CH_SLO
 call AddCh
 ld [hl],c
 ld hl,CH_SHI
 call AddCh
 ld [hl],b
 jp .applyslide
.applyslide: ld hl,CH_BLO
 call AddCh
 ld a,[hl]
 ld e,a
 ld hl,CH_BHI
 call AddCh
 ld a,[hl]
 ld d,a
 ld h,b
 ld l,c
 add hl,de
 call ClampFreq
 call WriteFreq
 jp .next
.vib: ld a,[A_T]
 cp 3
 jp z,.next
 ld hl,CH_VIB
 call AddCh
 ld a,[A_FP]
 swap a
 and $0F
 ld b,a
 add a,a
 add a,b
 add a,[hl]
 ld [hl],a
 bit 7,a
 jr z,.tri
 cpl
.tri: sub 64
 ld c,a
 ld b,0
 bit 7,c
 jr z,.pos
 ld b,$FF
.pos: ld a,[A_FP]
 and $0F
 ld d,a
 ld hl,0
 or a
 jr z,.vz
.vm: add hl,bc
 dec d
 jr nz,.vm
.vz: sra h
 rr l
 sra h
 rr l
 sra h
 rr l
 sra h
 rr l
 sra h
 rr l
 push hl
 ld hl,CH_BLO
 call AddCh
 ld a,[hl]
 ld e,a
 ld hl,CH_BHI
 call AddCh
 ld a,[hl]
 ld d,a
 pop hl
 add hl,de
 call ClampFreq
 call WriteFreq
.next: ld a,[A_T]
 inc a
 ld [A_T],a
 cp 4
 jp nz,.ch
 ret

; ClampFreq: hl = frequency value (signed) -> de, kept inside 0..2047
ClampFreq:
 bit 7,h
 jr z,.hi
 ld de,0
 ret
.hi: ld a,h
 cp 8
 jr c,.ok
 ld de,2047
 ret
.ok: ld d,h
 ld e,l
 ret

; ===================== sound effects (on the second pulse channel) =====================
SfxPlay:
 add a,a
 ld e,a
 ld d,0
 ld hl,SfxTable
 add hl,de
 ld a,[hl+]
 ld h,[hl]
 ld l,a
 ld a,l
 ld [A_SFXP],a
 ld a,h
 ld [A_SFXP+1],a
 xor a
 ld [A_SFXT],a
 ld a,1
 ld [A_SFXON],a
 ld a,$40
 ldh [rNR21],a
SfxTick:
 ld a,[A_SFXON]
 or a
 ret z
 ld a,[A_SFXT]
 or a
 jr z,.fetch
 dec a
 ld [A_SFXT],a
 ret nz
.fetch: ld a,[A_SFXP]
 ld l,a
 ld a,[A_SFXP+1]
 ld h,a
 ld a,[hl+]
 or a
 jr z,.end
 ld [A_SFXT],a
 ld a,[hl+]
 ldh [rNR22],a
 ld a,[hl+]
 ldh [rNR23],a
 ld a,[hl+]
 ldh [rNR24],a
 ld a,l
 ld [A_SFXP],a
 ld a,h
 ld [A_SFXP+1],a
 ret
.end: xor a
 ld [A_SFXON],a
 ret

; Turns what happened this frame into music control and one sound effect.
SfxFlush:
 ld a,[v_ev]
 ld b,a
 xor a
 ld [v_ev],a
 ld a,b
 or a
 ret z
 push bc
 bit 4,b
 call nz,MusicStart
 pop bc
 push bc
 ld a,b
 and EV_WIN|EV_OVER
 call nz,MusicStop
 pop bc
 ld a,7
 bit 7,b
 jr nz,SfxPlay
 ld a,6
 bit 6,b
 jr nz,SfxPlay
 ld a,2
 bit 2,b
 jr nz,SfxPlay
 ld a,5
 bit 5,b
 jr nz,SfxPlay
 ld a,1
 bit 1,b
 jr nz,SfxPlay
 ld a,4
 bit 4,b
 jr nz,SfxPlay
 ld a,3
 bit 3,b
 jr nz,SfxPlay
 ld a,0
 bit 0,b
 jr nz,SfxPlay
 ret
`;

// build(songObject or null) -> { code, data, defines }
function build(song) {
  const s = song || emptySong();
  let data = songData(s);
  if (!song) data = data.replace('MusicOn: db 1', 'MusicOn: db 0');
  return { code: CODE, data: data + sfxData(), defines: {} };
}
const api = { build, CODE };
if (isNode) module.exports = api; else window.SMA_gbaudio = api;
})();
