// The Game Boy program that plays a game made in Sudo Make Games. Original code for this project, written in SM83 assembly.
// It is assembled by src/sm83asm.js together with the game's own data (src/gbrom.js). The rules match the in-app engine
// (src/gameengine.js): gravity and jumping, enemies that patrol, coins, a goal, characters who talk, lives and a score.
// Positions are 16-bit pixel numbers plus an 8-bit fraction, so speeds like 1.2 pixels a frame are kept exactly.
(() => {
'use strict';
const VARS = [['v_vbl', 1], ['v_state', 1], ['v_level', 1], ['v_lives', 1], ['v_score', 2], ['v_time', 2], ['v_pad', 1], ['v_edge', 1], ['v_lw', 1], ['v_lh', 1], ['v_nent', 1], ['v_camx', 1], ['v_camy', 1], ['v_wy', 1], ['v_ev', 1], ['v_dpage', 1], ['v_dpages', 1], ['v_dptr', 2], ['v_dirty', 1], ['v_spawn', 4], ['v_i', 1], ['v_inv', 1], ['v_hurtq', 1],
  ['v_rx', 2], ['v_ry', 2], ['v_rw', 1], ['v_rh', 1], ['v_want', 1], ['v_t0', 1], ['v_t1', 1], ['v_t2', 1], ['v_t3', 1], ['v_ep', 2], ['v_oam', 1], ['v_op', 2], ['v_sx', 2], ['v_sy', 2], ['v_ex', 2], ['v_ey', 2], ['s0', 1], ['s1', 1], ['s2', 1], ['s3', 1], ['s4', 1], ['s5', 1], ['s6', 1], ['s7', 1], ['s8', 1], ['s9', 1], ['s10', 1], ['s11', 1], ['v_aud', 64]];
function equates() { let a = 0xc0a0; const out = []; for (const [n, sz] of VARS) { out.push(`${n} equ $${a.toString(16)}`); a += sz; } if (a > 0xc400) throw new Error('too many variables'); return out.join('\n'); }

// score digits: unrolled so each divisor is a constant
function scoreDigits() {
  let s = 'ScoreDigits:\n ld a,[v_score]\n ld l,a\n ld a,[v_score+1]\n ld h,a\n';
  [10000, 1000, 100, 10].forEach((d, k) => { s += ` ld c,0\n.d${k}: ld a,l\n sub ${d & 255}\n ld e,a\n ld a,h\n sbc a,${d >> 8}\n jr c,.d${k}e\n ld l,e\n ld h,a\n inc c\n jr .d${k}\n.d${k}e: ld a,c\n ld [s${k}],a\n`; });
  return s + ' ld a,l\n ld [s4],a\n ret\n';
}

function runtimeAsm() { return `
; ===================== hardware =====================
rP1 equ $FF00
rIF equ $FF0F
rLCDC equ $FF40
rSCY equ $FF42
rSCX equ $FF43
rLY equ $FF44
rDMA equ $FF46
rBGP equ $FF47
rOBP0 equ $FF48
rWY equ $FF4A
rWX equ $FF4B
rIE equ $FFFF
LCDC_ON equ $F3
OAMBUF equ $C000
LEVELBUF equ $C400
ENTS equ $C800
WORK equ $CA00
WORK2 equ $CA10
${equates()}
; entity records are 16 bytes
E_TYPE equ 0
E_SPR equ 1
E_XF equ 2
E_XP equ 3
E_XH equ 4
E_YF equ 5
E_YP equ 6
E_YH equ 7
E_VYF equ 8
E_VYH equ 9
E_W equ 10
E_H equ 11
E_OX equ 12
E_OY equ 13
E_FL equ 14
E_AUX equ 15
W_TYPE equ WORK+0
W_SPR equ WORK+1
W_XF equ WORK+2
W_XP equ WORK+3
W_XH equ WORK+4
W_YF equ WORK+5
W_YP equ WORK+6
W_YH equ WORK+7
W_VYF equ WORK+8
W_VYH equ WORK+9
W_W equ WORK+10
W_H equ WORK+11
W_OX equ WORK+12
W_OY equ WORK+13
W_FL equ WORK+14
W_AUX equ WORK+15
W2_XP equ WORK2+3
W2_XH equ WORK2+4
W2_YP equ WORK2+6
W2_YH equ WORK2+7
W2_W equ WORK2+10
W2_H equ WORK2+11
T_ENEMY equ 1
T_COIN equ 2
T_GOAL equ 3
T_NPC equ 4
S_TITLE equ 0
S_PLAY equ 1
S_DIALOG equ 2
S_OVER equ 3
S_WIN equ 4
PAD_A equ $01
PAD_START equ $08
EV_JUMP equ $01
EV_COIN equ $02
EV_HURT equ $04
EV_TALK equ $08
EV_START equ $10
EV_GOAL equ $20
EV_WIN equ $40
EV_OVER equ $80
GRAV equ $38
SPEEDP equ $0133
SPEEDN equ $FECD
DIAGP equ $00D9
DIAGN equ $FF27
JUMP_LO equ $B3
JUMP_HI equ $FC
HURT_FRAMES equ 90

; ===================== vectors and header =====================
org $40
 jp VBlankISR
org $48
 reti
org $50
 reti
org $58
 reti
org $60
 reti
org $100
 nop
 jp Start
 db $CE,$ED,$66,$66,$CC,$0D,$00,$0B,$03,$73,$00,$83,$00,$0C,$00,$0D
 db $00,$08,$11,$1F,$88,$89,$00,$0E,$DC,$CC,$6E,$E6,$DD,$DD,$D9,$99
 db $BB,$BB,$67,$63,$6E,$0E,$EC,$CC,$DD,$DC,$99,$9F,$BB,$B9,$33,$3E
 ds 28,0
org $150

; ===================== start =====================
Start:
 di
 ld sp,$DFFF
 call WaitVBlank
 xor a
 ldh [rLCDC],a
 ld hl,$C000
 ld bc,$1000
 xor a
 call MemFill
 ld hl,DmaRoutine
 ld de,$FF80
 ld bc,DmaRoutineEnd-DmaRoutine
 call MemCopy
 ld hl,TileBlock
 ld de,$8000
 ld bc,TILEBLOCK_LEN
 call MemCopy
 ld hl,$9800
 ld bc,$0800
 ld a,T_BLANK
 call MemFill
 ld a,$E4
 ldh [rBGP],a
 ldh [rOBP0],a
 ld a,7
 ldh [rWX],a
 ld a,[LivesInit]
 ld [v_lives],a
 call AudioInit
 ld hl,ScreenTitle
 call ShowScreen
 xor a
 ldh [rIF],a
 ld a,1
 ldh [rIE],a
 ei
MainLoop:
 halt
 nop
 ld a,[v_vbl]
 or a
 jr z,MainLoop
 xor a
 ld [v_vbl],a
 call Frame
 jr MainLoop

VBlankISR:
 push af
 call $FF80
 ld a,[v_camy]
 ldh [rSCY],a
 ld a,[v_camx]
 ldh [rSCX],a
 ld a,[v_wy]
 ldh [rWY],a
 ld a,1
 ld [v_vbl],a
 pop af
 reti

DmaRoutine:
 ld a,high(OAMBUF)
 ldh [rDMA],a
 ld a,40
.w: dec a
 jr nz,.w
 ret
DmaRoutineEnd:

; ===================== small helpers =====================
WaitVBlank:
.w: ldh a,[rLY]
 cp 144
 jr c,.w
 ret
LcdOff:
 ldh a,[rLCDC]
 add a,a
 ret nc
 call WaitVBlank
 xor a
 ldh [rLCDC],a
 ret
LcdOn:
 ld a,LCDC_ON
 ldh [rLCDC],a
 ret
MemCopy:
 ld a,[hl+]
 ld [de],a
 inc de
 dec bc
 ld a,b
 or c
 jr nz,MemCopy
 ret
MemFill:
 ld d,a
.l: ld [hl],d
 inc hl
 dec bc
 ld a,b
 or c
 jr nz,.l
 ret
Copy16:
 ld b,16
.l: ld a,[hl+]
 ld [de],a
 inc de
 dec b
 jr nz,.l
 ret
AddEvent:
 ld b,a
 ld a,[v_ev]
 or b
 ld [v_ev],a
 ret
Sra3:
 sra h
 rr l
 sra h
 rr l
 sra h
 rr l
 ld a,l
 ret
Clamp16:
 bit 7,h
 jr nz,.z
 ld a,h
 or a
 jr nz,.m
 ld a,l
 cp b
 ret c
.m: ld a,b
 ret
.z: xor a
 ret

; ===================== one frame =====================
Frame:
 call VBlankWork
 call ReadPad
 ld hl,v_time
 inc [hl]
 jr nz,.t
 inc hl
 inc [hl]
.t: call MusicTick
 ld a,[v_state]
 cp S_PLAY
 jp z,FramePlay
 cp S_TITLE
 jp z,FrameTitle
 cp S_DIALOG
 jp z,FrameDialog
 jp FrameOver
FrameEnd:
 call BuildOAM
 call SfxFlush
 ret

VBlankWork:
 ld a,[v_dirty]
 or a
 ret z
 xor a
 ld [v_dirty],a
 jp DrawDialogText

ReadPad:
 ld a,$20
 ldh [rP1],a
 ldh a,[rP1]
 ldh a,[rP1]
 ldh a,[rP1]
 ldh a,[rP1]
 cpl
 and $0F
 swap a
 ld b,a
 ld a,$10
 ldh [rP1],a
 ldh a,[rP1]
 ldh a,[rP1]
 ldh a,[rP1]
 ldh a,[rP1]
 cpl
 and $0F
 or b
 ld b,a
 ld a,$30
 ldh [rP1],a
 ld a,[v_pad]
 ld c,a
 ld a,b
 ld [v_pad],a
 ld a,c
 cpl
 and b
 ld [v_edge],a
 ret

FrameTitle:
 ld a,[v_edge]
 and PAD_A|PAD_START
 jp z,FrameEnd
StartGame:
 ld a,[LivesInit]
 ld [v_lives],a
 xor a
 ld [v_score],a
 ld [v_score+1],a
 ld [v_level],a
 ld a,EV_START
 call AddEvent
 call LoadLevel
 ld a,S_PLAY
 ld [v_state],a
 jp FrameEnd
FrameOver:
 ld a,[v_edge]
 and PAD_A|PAD_START
 jp z,FrameEnd
 ld a,[v_state]
 cp S_WIN
 jp nz,StartGame
 xor a
 ld [v_state],a
 ld hl,ScreenTitle
 call ShowScreen
 jp FrameEnd
FrameDialog:
 ld a,[v_edge]
 and PAD_A
 jp z,FrameEnd
 ld a,EV_TALK
 call AddEvent
 ld a,[v_dpage]
 inc a
 ld [v_dpage],a
 ld b,a
 ld a,[v_dpages]
 cp b
 jr z,.close
 ld a,1
 ld [v_dirty],a
 jp FrameEnd
.close:
 ld a,144
 ld [v_wy],a
 ld a,S_PLAY
 ld [v_state],a
 jp FrameEnd
FramePlay:
 ld a,[v_inv]
 or a
 jr z,.ni
 dec a
 ld [v_inv],a
.ni: call PlayerStep
 ld a,[v_state]
 cp S_PLAY
 jp nz,FrameEnd
 call EntitiesStep
 ld a,[v_state]
 cp S_PLAY
 jr nz,.skipcam
 call UpdateCamera
.skipcam: jp FrameEnd

; ===================== screens (title, game over, win) and the dialogue box =====================
ShowScreen:
 push hl
 call LcdOff
 pop hl
 ld de,$9C00
 ld b,18
.row: push de
 ld c,20
.col: ld a,[hl+]
 ld [de],a
 inc de
 dec c
 jr nz,.col
 pop de
 ld a,e
 add a,32
 ld e,a
 jr nc,.nc
 inc d
.nc: dec b
 jr nz,.row
 ld a,[v_state]
 cp S_OVER
 jr z,.sc
 cp S_WIN
 jr nz,.nosc
.sc: call ScoreDigits
 ld hl,$9C00+9*32+10
 ld de,s0
 ld b,5
.dg: ld a,[de]
 add a,T_DIGIT0
 ld [hl+],a
 inc de
 dec b
 jr nz,.dg
.nosc: xor a
 ld [v_wy],a
 ldh [rWY],a
 ldh [rSCX],a
 ldh [rSCY],a
 ld [v_camx],a
 ld [v_camy],a
 jp LcdOn

DrawDialogText:
 ld a,[v_dptr]
 ld l,a
 ld a,[v_dptr+1]
 ld h,a
 ld a,[v_dpage]
 or a
 jr z,.go
 ld b,a
 ld de,54
.add: add hl,de
 dec b
 jr nz,.add
.go: ld de,$9C21
 ld b,3
.line: ld c,18
.c: ld a,[hl+]
 ld [de],a
 inc de
 dec c
 jr nz,.c
 ld a,e
 add a,14
 ld e,a
 jr nc,.n
 inc d
.n: dec b
 jr nz,.line
 ld a,104
 ld [v_wy],a
 ret

StartDialog:
 add a,a
 ld l,a
 ld h,0
 ld de,TextTable
 add hl,de
 ld a,[hl+]
 ld h,[hl]
 ld l,a
 ld a,[hl+]
 ld [v_dpages],a
 ld a,l
 ld [v_dptr],a
 ld a,h
 ld [v_dptr+1],a
 xor a
 ld [v_dpage],a
 ld a,1
 ld [v_dirty],a
 ld a,S_DIALOG
 ld [v_state],a
 ld a,EV_TALK
 jp AddEvent

${scoreDigits()}

; ===================== loading a level (screen off) =====================
LoadLevel:
 call LcdOff
 ld a,[v_level]
 add a,a
 ld l,a
 ld h,0
 ld de,LevelTable
 add hl,de
 ld a,[hl+]
 ld h,[hl]
 ld l,a
 ld a,[hl+]
 ld [v_lw],a
 ld a,[hl+]
 ld [v_lh],a
 ld a,[hl+]
 ld [v_nent],a
 push hl
 ld hl,ENTS
 ld bc,400
 xor a
 call MemFill
 pop hl
 ld de,ENTS
 ld a,[v_nent]
 inc a
 ld [s0],a
.cp: call Copy16
 ld a,[s0]
 dec a
 ld [s0],a
 jr nz,.cp
 ld a,[ENTS+E_XP]
 ld [v_spawn],a
 ld a,[ENTS+E_XH]
 ld [v_spawn+1],a
 ld a,[ENTS+E_YP]
 ld [v_spawn+2],a
 ld a,[ENTS+E_YH]
 ld [v_spawn+3],a
 push hl
 ld hl,LEVELBUF
 ld bc,1024
 ld a,$FF
 call MemFill
 pop hl
 ld de,LEVELBUF
 ld a,[v_lh]
 ld [s1],a
.rows: ld a,[v_lw]
 ld b,a
.cc: ld a,[hl+]
 ld [de],a
 inc de
 dec b
 jr nz,.cc
 ld a,[v_lw]
 ld b,a
 ld a,32
 sub b
 add a,e
 ld e,a
 jr nc,.n2
 inc d
.n2: ld a,[s1]
 dec a
 ld [s1],a
 jr nz,.rows
 ld hl,LEVELBUF
 ld de,$9800
 ld bc,1024
.bg: ld a,[hl+]
 cp $FF
 jr nz,.t
 ld a,T_BLANK
.t: ld [de],a
 inc de
 dec bc
 ld a,b
 or c
 jr nz,.bg
 ld hl,DialogFrame
 ld de,$9C00
 ld b,5
.dr: push de
 ld c,20
.dc: ld a,[hl+]
 ld [de],a
 inc de
 dec c
 jr nz,.dc
 pop de
 ld a,e
 add a,32
 ld e,a
 jr nc,.dn
 inc d
.dn: dec b
 jr nz,.dr
 ld a,144
 ld [v_wy],a
 ldh [rWY],a
 xor a
 ld [v_inv],a
 ld [v_hurtq],a
 ld [v_dirty],a
 call UpdateCamera
 ld a,[v_camx]
 ldh [rSCX],a
 ld a,[v_camy]
 ldh [rSCY],a
 jp LcdOn

UpdateCamera:
 ld a,[ENTS+E_XP]
 ld l,a
 ld a,[ENTS+E_XH]
 ld h,a
 ld a,[ENTS+E_W]
 srl a
 ld c,a
 ld b,0
 add hl,bc
 ld a,l
 sub 80
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
 ld a,[v_lw]
 sub 20
 jr nc,.mx
 xor a
.mx: add a,a
 add a,a
 add a,a
 ld b,a
 call Clamp16
 ld [v_camx],a
 ld a,[ENTS+E_YP]
 ld l,a
 ld a,[ENTS+E_YH]
 ld h,a
 ld a,[ENTS+E_H]
 srl a
 ld c,a
 ld b,0
 add hl,bc
 ld a,l
 sub 72
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
 ld a,[v_lh]
 sub 18
 jr nc,.my
 xor a
.my: add a,a
 add a,a
 add a,a
 ld b,a
 call Clamp16
 ld [v_camy],a
 ret

; ===================== collision =====================
; TileFlagAt: b = tile x, c = tile y (signed). Returns a = 0 (empty), 1 (solid) or 2 (hurts). Keeps bc and de.
TileFlagAt:
 bit 7,b
 jr nz,.solid
 ld a,b
 ld hl,v_lw
 cp [hl]
 jr nc,.solid
 bit 7,c
 jr nz,.vert
 ld a,c
 ld hl,v_lh
 cp [hl]
 jr nc,.vert
 ld a,c
 and 7
 swap a
 rlca
 or b
 ld l,a
 ld a,c
 srl a
 srl a
 srl a
 add a,high(LEVELBUF)
 ld h,a
 ld a,[hl]
 cp $FF
 jr z,.empty
 ld l,a
 ld h,high(TileFlags)
 ld a,[hl]
 ret
.vert: ld a,[GameType]
 or a
 jr z,.empty
.solid: ld a,1
 ret
.empty: xor a
 ret

; RectHas: v_rx,v_ry (16-bit pixel), v_rw,v_rh; a = flag wanted. Returns a = 1 if any tile in the rectangle has that flag.
RectHas:
 ld [v_want],a
 ld a,[v_rx]
 ld l,a
 ld a,[v_rx+1]
 ld h,a
 call Sra3
 ld [v_t0],a
 ld a,[v_rw]
 dec a
 ld c,a
 ld b,0
 ld a,[v_rx]
 ld l,a
 ld a,[v_rx+1]
 ld h,a
 add hl,bc
 call Sra3
 ld [v_t1],a
 ld a,[v_ry]
 ld l,a
 ld a,[v_ry+1]
 ld h,a
 call Sra3
 ld [v_t2],a
 ld a,[v_rh]
 dec a
 ld c,a
 ld b,0
 ld a,[v_ry]
 ld l,a
 ld a,[v_ry+1]
 ld h,a
 add hl,bc
 call Sra3
 ld [v_t3],a
 ld a,[v_t2]
 ld c,a
.row: ld a,[v_t0]
 ld b,a
.col: call TileFlagAt
 ld d,a
 ld a,[v_want]
 cp d
 jr z,.found
 ld a,[v_t1]
 cp b
 jr z,.nextrow
 inc b
 jr .col
.nextrow: ld a,[v_t3]
 cp c
 jr z,.none
 inc c
 jr .row
.found: ld a,1
 ret
.none: xor a
 ret

TryX:
 ld a,l
 ld [v_rx],a
 ld a,h
 ld [v_rx+1],a
 ld a,[W_YP]
 ld [v_ry],a
 ld a,[W_YH]
 ld [v_ry+1],a
 jr TryCommon
TryY:
 ld a,l
 ld [v_ry],a
 ld a,h
 ld [v_ry+1],a
 ld a,[W_XP]
 ld [v_rx],a
 ld a,[W_XH]
 ld [v_rx+1],a
TryCommon:
 ld a,[W_W]
 ld [v_rw],a
 ld a,[W_H]
 ld [v_rh],a
 ld a,1
 jp RectHas

; MoveX / MoveY: de = signed 8.8 distance. Moves WORK one pixel at a time and stops at solid tiles. Returns a = 1 if blocked.
MoveX:
 ld a,[W_XF]
 add a,e
 ld [W_XF],a
 ld a,d
 adc a,0
 or a
 ret z
 ld c,a
 bit 7,c
 jr nz,.neg
.pl: ld a,[W_XP]
 add a,1
 ld l,a
 ld a,[W_XH]
 adc a,0
 ld h,a
 push bc
 call TryX
 pop bc
 or a
 jr nz,.blk
 ld a,[v_rx]
 ld [W_XP],a
 ld a,[v_rx+1]
 ld [W_XH],a
 dec c
 jr nz,.pl
 xor a
 ret
.neg: ld a,c
 cpl
 inc a
 ld c,a
.nl: ld a,[W_XP]
 sub 1
 ld l,a
 ld a,[W_XH]
 sbc a,0
 ld h,a
 push bc
 call TryX
 pop bc
 or a
 jr nz,.blk
 ld a,[v_rx]
 ld [W_XP],a
 ld a,[v_rx+1]
 ld [W_XH],a
 dec c
 jr nz,.nl
 xor a
 ret
.blk: xor a
 ld [W_XF],a
 ld a,1
 ret
MoveY:
 ld a,[W_YF]
 add a,e
 ld [W_YF],a
 ld a,d
 adc a,0
 or a
 ret z
 ld c,a
 bit 7,c
 jr nz,.neg
.pl: ld a,[W_YP]
 add a,1
 ld l,a
 ld a,[W_YH]
 adc a,0
 ld h,a
 push bc
 call TryY
 pop bc
 or a
 jr nz,.blk
 ld a,[v_ry]
 ld [W_YP],a
 ld a,[v_ry+1]
 ld [W_YH],a
 dec c
 jr nz,.pl
 xor a
 ret
.neg: ld a,c
 cpl
 inc a
 ld c,a
.nl: ld a,[W_YP]
 sub 1
 ld l,a
 ld a,[W_YH]
 sbc a,0
 ld h,a
 push bc
 call TryY
 pop bc
 or a
 jr nz,.blk
 ld a,[v_ry]
 ld [W_YP],a
 ld a,[v_ry+1]
 ld [W_YH],a
 dec c
 jr nz,.nl
 xor a
 ret
.blk: xor a
 ld [W_YF],a
 ld a,1
 ret

LoadWork:
 ld de,WORK
 ld b,16
.l: ld a,[hl+]
 ld [de],a
 inc de
 dec b
 jr nz,.l
 ret
LoadWork2:
 ld de,WORK2
 ld b,16
.l: ld a,[hl+]
 ld [de],a
 inc de
 dec b
 jr nz,.l
 ret
StoreWorkAt:
 ld hl,WORK
 ld b,16
.l: ld a,[hl+]
 ld [de],a
 inc de
 dec b
 jr nz,.l
 ret
StoreWorkEp:
 ld a,[v_ep]
 ld e,a
 ld a,[v_ep+1]
 ld d,a
 jr StoreWorkAt

; hl = distance between two things on one side, b = first thing's size, c = second thing's size. a = 1 if they overlap.
Ovl1D:
 bit 7,h
 jr nz,.lt
 ld a,h
 or a
 jr nz,.no
 ld a,l
 cp b
 jr nc,.no
.lt: ld a,c
 ld e,a
 ld d,0
 add hl,de
 bit 7,h
 jr nz,.no
 ld a,h
 or l
 jr z,.no
 ld a,1
 ret
.no: xor a
 ret
Overlap:
 ld a,[W2_XP]
 ld l,a
 ld a,[W2_XH]
 ld h,a
 ld a,[W_XP]
 ld e,a
 ld a,[W_XH]
 ld d,a
 ld a,l
 sub e
 ld l,a
 ld a,h
 sbc a,d
 ld h,a
 ld a,[W_W]
 ld b,a
 ld a,[W2_W]
 ld c,a
 call Ovl1D
 or a
 ret z
 ld a,[W2_YP]
 ld l,a
 ld a,[W2_YH]
 ld h,a
 ld a,[W_YP]
 ld e,a
 ld a,[W_YH]
 ld d,a
 ld a,l
 sub e
 ld l,a
 ld a,h
 sbc a,d
 ld h,a
 ld a,[W_H]
 ld b,a
 ld a,[W2_H]
 ld c,a
 jp Ovl1D
NearCheck:
 ld de,13
 add hl,de
 bit 7,h
 jr nz,.no
 ld a,h
 or a
 jr nz,.no
 ld a,l
 cp 27
 jr nc,.no
 ld a,1
 ret
.no: xor a
 ret
NpcNear:
 ld a,[W2_W]
 srl a
 ld c,a
 ld b,0
 ld a,[W2_XP]
 ld l,a
 ld a,[W2_XH]
 ld h,a
 add hl,bc
 ld a,[W_W]
 srl a
 ld c,a
 ld a,[W_XP]
 ld e,a
 ld a,[W_XH]
 ld d,a
 ld b,0
 ld a,e
 add a,c
 ld e,a
 ld a,d
 adc a,0
 ld d,a
 ld a,l
 sub e
 ld l,a
 ld a,h
 sbc a,d
 ld h,a
 call NearCheck
 or a
 ret z
 ld a,[W2_H]
 srl a
 ld c,a
 ld b,0
 ld a,[W2_YP]
 ld l,a
 ld a,[W2_YH]
 ld h,a
 add hl,bc
 ld a,[W_H]
 srl a
 ld c,a
 ld a,[W_YP]
 ld e,a
 ld a,[W_YH]
 ld d,a
 ld a,e
 add a,c
 ld e,a
 ld a,d
 adc a,0
 ld d,a
 ld a,l
 sub e
 ld l,a
 ld a,h
 sbc a,d
 ld h,a
 jp NearCheck

; ===================== the player =====================
PlayerStep:
 ld hl,ENTS
 call LoadWork
 ld a,[v_pad]
 ld b,a
 ld c,0
 bit 4,b
 jr z,.nr
 inc c
.nr: bit 5,b
 jr z,.nl
 dec c
.nl: ld a,c
 ld [s0],a
 ld c,0
 bit 6,b
 jr z,.nu
 dec c
.nu: bit 7,b
 jr z,.nd
 inc c
.nd: ld a,c
 ld [s1],a
 ld a,[s0]
 or a
 jr z,.nf
 ld c,a
 ld a,[W_FL]
 res 1,a
 bit 7,c
 jr z,.fs
 set 1,a
.fs: ld [W_FL],a
.nf: ld a,[GameType]
 or a
 jp nz,.topdown
 ld a,[v_edge]
 bit 0,a
 jr z,.nojump
 ld a,[W_FL]
 bit 0,a
 jr z,.nojump
 res 0,a
 ld [W_FL],a
 ld a,JUMP_LO
 ld [W_VYF],a
 ld a,JUMP_HI
 ld [W_VYH],a
 ld a,EV_JUMP
 call AddEvent
.nojump: ld a,[v_pad]
 bit 0,a
 jr nz,.held
 ld a,[W_VYH]
 bit 7,a
 jr z,.held
 ld a,[W_VYF]
 sub $CD
 ld a,[W_VYH]
 sbc a,$FE
 jr nc,.held
 ld a,$CD
 ld [W_VYF],a
 ld a,$FE
 ld [W_VYH],a
.held: ld a,[W_VYF]
 add a,GRAV
 ld [W_VYF],a
 ld a,[W_VYH]
 adc a,0
 ld [W_VYH],a
 bit 7,a
 jr nz,.nt
 cp 4
 jr c,.nt
 ld a,4
 ld [W_VYH],a
 xor a
 ld [W_VYF],a
.nt: ld a,[s0]
 or a
 jr z,.nomx
 ld de,SPEEDP
 bit 7,a
 jr z,.dx
 ld de,SPEEDN
.dx: call MoveX
.nomx: ld a,[W_VYH]
 ld d,a
 ld a,[W_VYF]
 ld e,a
 call MoveY
 or a
 jr nz,.yblock
 ld a,[W_VYH]
 bit 7,a
 jr nz,.air
 ld a,[W_YP]
 add a,1
 ld l,a
 ld a,[W_YH]
 adc a,0
 ld h,a
 call TryY
 or a
 jr z,.air
 xor a
 ld [W_VYF],a
 ld [W_VYH],a
 ld [W_YF],a
 ld a,[W_FL]
 set 0,a
 ld [W_FL],a
 jr .vdone
.air: ld a,[W_FL]
 res 0,a
 ld [W_FL],a
 jr .vdone
.yblock: ld a,[W_VYH]
 bit 7,a
 jr nz,.ceil
 ld a,[W_FL]
 set 0,a
 ld [W_FL],a
 jr .zero
.ceil: ld a,[W_FL]
 res 0,a
 ld [W_FL],a
.zero: xor a
 ld [W_VYF],a
 ld [W_VYH],a
.vdone: ld a,[v_lh]
 ld l,a
 ld h,0
 add hl,hl
 add hl,hl
 add hl,hl
 ld de,24
 add hl,de
 ld a,[W_YP]
 sub l
 ld c,a
 ld a,[W_YH]
 sbc a,h
 bit 7,a
 jr nz,.hazard
 or c
 jr z,.hazard
 ld a,1
 ld [v_hurtq],a
 jr .hazard
.topdown: ld a,[s0]
 or a
 jr z,.tdy
 ld b,a
 ld a,[s1]
 or a
 jr z,.sx
 ld de,DIAGP
 bit 7,b
 jr z,.tx
 ld de,DIAGN
 jr .tx
.sx: ld de,SPEEDP
 bit 7,b
 jr z,.tx
 ld de,SPEEDN
.tx: call MoveX
.tdy: ld a,[s1]
 or a
 jr z,.hazard
 ld b,a
 ld a,[s0]
 or a
 jr z,.sy
 ld de,DIAGP
 bit 7,b
 jr z,.ty
 ld de,DIAGN
 jr .ty
.sy: ld de,SPEEDP
 bit 7,b
 jr z,.ty
 ld de,SPEEDN
.ty: call MoveY
.hazard: ld a,[W_XP]
 ld [v_rx],a
 ld a,[W_XH]
 ld [v_rx+1],a
 ld a,[W_YP]
 ld [v_ry],a
 ld a,[W_YH]
 ld [v_ry+1],a
 ld a,[W_W]
 ld [v_rw],a
 ld a,[W_H]
 ld [v_rh],a
 ld a,2
 call RectHas
 or a
 jr z,.store
 ld a,1
 ld [v_hurtq],a
.store: ld de,ENTS
 call StoreWorkAt
 ld a,[v_hurtq]
 or a
 ret z
 xor a
 ld [v_hurtq],a
 jp Hurt

Hurt:
 ld a,[v_state]
 cp S_PLAY
 ret nz
 ld a,[v_inv]
 or a
 ret nz
 ld a,[v_lives]
 dec a
 ld [v_lives],a
 ld a,EV_HURT
 call AddEvent
 ld a,[v_lives]
 or a
 jr z,.dead
 ld a,[v_spawn]
 ld [ENTS+E_XP],a
 ld a,[v_spawn+1]
 ld [ENTS+E_XH],a
 ld a,[v_spawn+2]
 ld [ENTS+E_YP],a
 ld a,[v_spawn+3]
 ld [ENTS+E_YH],a
 xor a
 ld [ENTS+E_XF],a
 ld [ENTS+E_YF],a
 ld [ENTS+E_VYF],a
 ld [ENTS+E_VYH],a
 ld a,[ENTS+E_FL]
 res 0,a
 ld [ENTS+E_FL],a
 ld a,HURT_FRAMES
 ld [v_inv],a
 ret
.dead: ld a,S_OVER
 ld [v_state],a
 ld a,EV_OVER
 call AddEvent
 ld hl,ScreenOver
 jp ShowScreen

; ===================== enemies, coins, the goal and talking characters =====================
EntitiesStep:
 ld hl,ENTS
 call LoadWork2
 ld a,1
 ld [v_i],a
.loop: ld a,[v_nent]
 ld b,a
 ld a,[v_i]
 cp b
 jr z,.go
 jr nc,.done
.go: ld l,a
 ld h,0
 add hl,hl
 add hl,hl
 add hl,hl
 add hl,hl
 ld de,ENTS
 add hl,de
 ld a,l
 ld [v_ep],a
 ld a,h
 ld [v_ep+1],a
 ld a,[hl]
 or a
 jr z,.next
 call LoadWork
 ld a,[W_TYPE]
 cp T_ENEMY
 jr z,.enemy
 cp T_COIN
 jr z,.coin
 cp T_GOAL
 jr z,.goal
 cp T_NPC
 jr z,.npc
 jr .next
.enemy: call EnemyStep
 call StoreWorkEp
 call Overlap
 or a
 jr z,.next
 call Hurt
 ld a,[v_state]
 cp S_PLAY
 ret nz
 jr .next
.coin: call Overlap
 or a
 jr z,.next
 xor a
 ld [W_TYPE],a
 call StoreWorkEp
 ld hl,v_score
 ld a,[hl]
 add a,10
 ld [hl+],a
 ld a,[hl]
 adc a,0
 ld [hl],a
 ld a,EV_COIN
 call AddEvent
 jr .next
.goal: call Overlap
 or a
 jr z,.next
 ld a,EV_GOAL
 call AddEvent
 ld a,[v_level]
 inc a
 ld [v_level],a
 ld b,a
 ld a,[NLevels]
 cp b
 jr z,.win
 jp LoadLevel
.win: ld a,S_WIN
 ld [v_state],a
 ld a,EV_WIN
 call AddEvent
 ld hl,ScreenWin
 jp ShowScreen
.npc: ld a,[v_edge]
 bit 0,a
 jr z,.next
 call NpcNear
 or a
 jr z,.next
 ld a,[W_AUX]
 cp $FF
 jr z,.next
 call StartDialog
 ret
.next: ld hl,v_i
 inc [hl]
 jp .loop
.done: ret

EnemySpeed:
 ld a,[W_AUX]
 ld e,a
 ld d,0
 sla e
 rl d
 sla e
 rl d
 ld a,[W_FL]
 bit 1,a
 ret z
 xor a
 sub e
 ld e,a
 ld a,0
 sbc a,d
 ld d,a
 ret
Reverse:
 ld a,[W_FL]
 xor 2
 ld [W_FL],a
 ret
LedgeCheck:
 ld a,[W_XP]
 ld l,a
 ld a,[W_XH]
 ld h,a
 ld a,[W_FL]
 bit 1,a
 jr nz,.left
 ld a,[W_W]
 inc a
 ld c,a
 ld b,0
 add hl,bc
 jr .got
.left: ld a,l
 sub 1
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
.got: call Sra3
 ld [s0],a
 ld a,[W_YP]
 ld l,a
 ld a,[W_YH]
 ld h,a
 ld a,[W_H]
 inc a
 ld c,a
 ld b,0
 add hl,bc
 call Sra3
 ld c,a
 ld a,[s0]
 ld b,a
 call TileFlagAt
 or a
 ret nz
 jp Reverse
EnemyStep:
 ld a,[GameType]
 or a
 jr nz,.td
 ld a,[W_FL]
 bit 2,a
 jr nz,.vertical
 ld a,[W_VYF]
 add a,GRAV
 ld [W_VYF],a
 ld a,[W_VYH]
 adc a,0
 ld [W_VYH],a
 bit 7,a
 jr nz,.g1
 cp 4
 jr c,.g1
 ld a,4
 ld [W_VYH],a
 xor a
 ld [W_VYF],a
.g1: ld a,[W_VYH]
 ld d,a
 ld a,[W_VYF]
 ld e,a
 call MoveY
 or a
 jr nz,.eyb
 ld a,[W_VYH]
 bit 7,a
 jr nz,.eair
 ld a,[W_YP]
 add a,1
 ld l,a
 ld a,[W_YH]
 adc a,0
 ld h,a
 call TryY
 or a
 jr z,.eair
 xor a
 ld [W_VYF],a
 ld [W_VYH],a
 ld [W_YF],a
 ld a,[W_FL]
 set 0,a
 ld [W_FL],a
 jr .walk
.eair: ld a,[W_FL]
 res 0,a
 ld [W_FL],a
 jr .walk
.eyb: ld a,[W_VYH]
 bit 7,a
 jr nz,.ec
 ld a,[W_FL]
 set 0,a
 ld [W_FL],a
 jr .ez
.ec: ld a,[W_FL]
 res 0,a
 ld [W_FL],a
.ez: xor a
 ld [W_VYF],a
 ld [W_VYH],a
.walk: call EnemySpeed
 call MoveX
 or a
 jr z,.nb
 jp Reverse
.nb: ld a,[W_FL]
 bit 0,a
 ret z
 jp LedgeCheck
.vertical: call EnemySpeed
 call MoveY
 or a
 ret z
 jp Reverse
.td: ld a,[W_FL]
 bit 2,a
 jr nz,.vertical
 call EnemySpeed
 call MoveX
 or a
 ret z
 jp Reverse

; ===================== sprites =====================
EmitOAM:
 ld c,a
 ld a,[v_ex+1]
 or a
 ret nz
 ld a,[v_ex]
 or a
 ret z
 cp 168
 ret nc
 ld a,[v_ey+1]
 or a
 ret nz
 ld a,[v_ey]
 or a
 ret z
 cp 160
 ret nc
 ld d,a
 ld a,[v_wy]
 cp 144
 jr nc,.nowin
 add a,8
 cp d
 ret c
.nowin: ld a,[v_oam]
 cp 40
 ret nc
 inc a
 ld [v_oam],a
 ld a,[v_op]
 ld l,a
 ld a,[v_op+1]
 ld h,a
 ld a,[v_ey]
 ld [hl+],a
 ld a,[v_ex]
 ld [hl+],a
 ld a,c
 ld [hl+],a
 ld a,b
 ld [hl+],a
 ld a,l
 ld [v_op],a
 ld a,h
 ld [v_op+1],a
 ret

FrameIndex:
 ld a,[s4]
 ld [s6],a
 ld a,[s2]
 cp 2
 ret c
 ld a,[s5]
 or a
 ret z
 ld a,[v_time]
 ld c,a
 ld a,[s3]
 ld b,a
 ld a,c
 inc b
.sh: dec b
 jr z,.shd
 srl a
 jr .sh
.shd: ld c,a
 ld a,[s2]
 ld b,a
 ld a,c
.mod: cp b
 jr c,.md
 sub b
 jr .mod
.md: or a
 ret z
 ld b,a
 ld a,[s0]
 ld c,a
 ld a,[s1]
 ld d,a
 xor a
.m: add a,c
 dec d
 jr nz,.m
 ld c,a
 ld a,[s4]
.fm: add a,c
 dec b
 jr nz,.fm
 ld [s6],a
 ret

; Draws the thing in WORK. s5 = 1 to play its animation.
DrawEnt:
 ld a,[W_SPR]
 ld l,a
 ld h,0
 add hl,hl
 add hl,hl
 add hl,hl
 ld de,SpriteTable
 add hl,de
 ld a,[hl+]
 ld [s0],a
 ld a,[hl+]
 ld [s1],a
 ld a,[hl+]
 ld [s2],a
 ld a,[hl+]
 ld [s3],a
 ld a,[hl]
 ld [s4],a
 call FrameIndex
 ld a,[W_XP]
 ld l,a
 ld a,[W_XH]
 ld h,a
 ld a,[v_camx]
 ld c,a
 ld a,l
 sub c
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
 ld a,[W_OX]
 ld c,a
 ld a,l
 sub c
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
 ld a,l
 ld [v_sx],a
 ld a,h
 ld [v_sx+1],a
 ld a,[W_YP]
 ld l,a
 ld a,[W_YH]
 ld h,a
 ld a,[v_camy]
 ld c,a
 ld a,l
 sub c
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
 ld a,[W_OY]
 ld c,a
 ld a,l
 sub c
 ld l,a
 ld a,h
 sbc a,0
 ld h,a
 ld a,l
 ld [v_sy],a
 ld a,h
 ld [v_sy+1],a
 xor a
 ld [s10],a
 ld a,[W_TYPE]
 cp T_ENEMY
 jr z,.canflip
 cp 5
 jr nz,.noflip
.canflip: ld a,[W_FL]
 bit 1,a
 jr z,.noflip
 ld a,$20
 ld [s10],a
.noflip: xor a
 ld [s8],a
.row: xor a
 ld [s9],a
.col: ld a,[s9]
 ld b,a
 ld a,[s10]
 or a
 jr z,.nof
 ld a,[s0]
 dec a
 sub b
 ld b,a
.nof: ld a,b
 add a,a
 add a,a
 add a,a
 add a,8
 ld c,a
 ld a,[v_sx]
 add a,c
 ld [v_ex],a
 ld a,[v_sx+1]
 adc a,0
 ld [v_ex+1],a
 ld a,[s8]
 add a,a
 add a,a
 add a,a
 add a,16
 ld c,a
 ld a,[v_sy]
 add a,c
 ld [v_ey],a
 ld a,[v_sy+1]
 adc a,0
 ld [v_ey+1],a
 ld a,[s8]
 ld b,a
 ld a,[s0]
 ld c,a
 xor a
 inc b
.rw: dec b
 jr z,.rwd
 add a,c
 jr .rw
.rwd: ld b,a
 ld a,[s9]
 add a,b
 ld b,a
 ld a,[s6]
 add a,b
 ld d,a
 ld a,[s10]
 ld b,a
 ld a,d
 call EmitOAM
 ld a,[s9]
 inc a
 ld [s9],a
 ld b,a
 ld a,[s0]
 cp b
 jr nz,.col
 ld a,[s8]
 inc a
 ld [s8],a
 ld b,a
 ld a,[s1]
 cp b
 jr nz,.row
 ret

BuildOAM:
 ld hl,OAMBUF
 ld bc,160
 xor a
 call MemFill
 ld a,[v_state]
 cp S_PLAY
 jr z,.draw
 cp S_DIALOG
 ret nz
.draw: call ScoreDigits
 ld hl,OAMBUF
 ld a,17
 ld [hl+],a
 ld a,10
 ld [hl+],a
 ld a,T_HEART
 ld [hl+],a
 xor a
 ld [hl+],a
 ld a,17
 ld [hl+],a
 ld a,18
 ld [hl+],a
 ld a,[v_lives]
 add a,T_DIGIT0
 ld [hl+],a
 xor a
 ld [hl+],a
 ld b,0
.sd: ld a,17
 ld [hl+],a
 ld a,b
 add a,a
 add a,a
 add a,a
 add a,126
 ld [hl+],a
 ld de,s0
 ld a,e
 add a,b
 ld e,a
 ld a,[de]
 add a,T_DIGIT0
 ld [hl+],a
 xor a
 ld [hl+],a
 inc b
 ld a,b
 cp 5
 jr nz,.sd
 ld a,l
 ld [v_op],a
 ld a,h
 ld [v_op+1],a
 ld a,7
 ld [v_oam],a
 ld a,[v_nent]
 inc a
 ld [v_i],a
 ld a,0
 ld [s11],a
.ent: ld a,[s11]
 ld l,a
 ld h,0
 add hl,hl
 add hl,hl
 add hl,hl
 add hl,hl
 ld de,ENTS
 add hl,de
 ld a,[hl]
 or a
 jr z,.nx
 ld a,[s11]
 or a
 jr nz,.other
 ld a,[v_inv]
 or a
 jr z,.show
 ld a,[v_time]
 bit 2,a
 jr nz,.nx
.show: ld a,[v_pad]
 and $F0
 ld [s5],a
 jr .dodraw
.other: ld a,[hl]
 cp T_ENEMY
 ld a,0
 jr nz,.na
 inc a
.na: ld [s5],a
.dodraw: call LoadWork
 call DrawEnt
.nx: ld a,[s11]
 inc a
 ld [s11],a
 ld b,a
 ld a,[v_i]
 cp b
 jr nz,.ent
 ret
${'${AUDIO}'}
`; }
const api = { runtimeAsm, VARS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.SMA_gbrt = api;
})();
