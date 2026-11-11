const G=require('../../src/gameengine.js'); const {buildRom}=require('../../src/gbrom.js'); const {GB}=require('../gbemu.js');
exports.G=G;
exports.make=(saved,opts)=>{ const r=buildRom(saved,opts); const g=new GB(r.rom); const S=r.symbols; const mem=a=>g.wram[a-0xc000]; const s16=(lo,hi)=>{ const v=lo|(hi<<8); return v>=32768?v-65536:v; };
  const api={ r,g,S,mem,
    boot(){ g.runFrames(3); },
    frame(pad){ g.pad=pad||{}; const f0=g.frames; let n=0; for(;;){ g.step(); if(g.halted&&g.frames>f0) break; if(++n>3e6) throw new Error('frame did not finish'); } },
    state(){ return mem(S.v_state); },
    player(){ const b=0xc800; return { x:s16(mem(b+3),mem(b+4))+mem(b+2)/256, y:s16(mem(b+6),mem(b+7))+mem(b+5)/256, vy:s16(mem(b+9),0)+0, fl:mem(b+14) }; },
    ent(i){ const b=0xc800+16*i; return { type:mem(b), x:s16(mem(b+3),mem(b+4))+mem(b+2)/256, y:s16(mem(b+6),mem(b+7))+mem(b+5)/256, fl:mem(b+14) }; },
    lives(){ return mem(S.v_lives); }, score(){ return mem(S.v_score)|(mem(S.v_score+1)<<8); }, level(){ return mem(S.v_level); }, ev(){ return mem(S.v_ev); }, cam(){ return [mem(S.v_camx),mem(S.v_camy)]; } };
  return api; };
// the in-app engine driven with the same input
exports.js=(saved,skip)=>{ const game=G.decode(saved); const w=G.createWorld(game,0,false); let prevA=false;
  return { w, step(pad){ pad=pad||{}; const input={left:!!pad.left,right:!!pad.right,up:!!pad.up,down:!!pad.down,a:!!pad.a,b:!!pad.b,aPressed:!!pad.a&&!prevA,startPressed:!!pad.start&&!prevS}; prevA=!!pad.a; prevS=!!pad.start; G.step(w,input); w.events.length=0; }, p(){ return {x:w.player.x,y:w.player.y}; } }; let prevS=false; };
