const {make,G}=require('./romcmp.js'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const saved=G.newGame(); const rom=make(saved); rom.boot(); rom.frame({a:true}); rom.frame({}); for(let i=0;i<30;i++) rom.frame({});
const log=()=>{ rom.g.apu.length=0; }; const n21=()=>rom.g.apu.filter(e=>e.reg===0x17||e.reg===0x19);
log(); rom.frame({a:true}); rom.frame({}); rom.frame({}); ok(n21().length>=2,'jumping plays a sound effect on pulse 2 ('+n21().length+' register writes)');
// coin
const ents=[1,2,3,4,5,6,7].map(i=>rom.ent(i)); const ci=ents.findIndex(e=>e.type===2)+1; const b=0xc800-0xc000; for(let i=0;i<30;i++) rom.frame({}); log(); rom.g.wram[b+3+16*0]=ents[ci-1].x-1; rom.g.wram[b+6]=ents[ci-1].y; rom.frame({}); rom.frame({}); const w=rom.g.apu.filter(e=>e.reg===0x17).map(e=>e.val.toString(16)); ok(w.length>=1,'collecting a coin plays its sound ('+w.join(',')+')');
ok(rom.g.violations.length===0,'no rule violations: '+JSON.stringify(rom.g.violations.slice(0,2)));
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');
