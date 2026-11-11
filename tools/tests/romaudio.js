const {make,G}=require('./romcmp.js'); const C=require('../../src/chip.js'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const song=C.newSong(); song.speed=5; song.patterns=[C.newPattern(16)]; song.order=[0]; song.loopStart=0;
const put=(r,ch,note,inst,fx,fp,vol)=>{ const d=song.patterns[0].data,i=C.cellIndex(r,ch,0); d[i]=note==='off'?255:C.parseNote(note)+1; if(inst!==undefined) d[i+1]=inst+1; if(vol!==undefined) d[i+2]=vol+1; if(fx){ d[i+3]=fx.charCodeAt(0); d[i+4]=fp; } };
put(0,0,'C-5',0); put(2,0,'off'); put(4,1,'A-4',2); put(4,2,'C-3',0); put(6,3,'C-4',1); put(8,0,'C-5',0,'0',0x47); put(10,0,'C-5',0,'1',0x10); put(12,0,'A-4',1,'S',3); put(13,1,'A-4',0,undefined,undefined,7);
const b=u=>Buffer.from(u).toString('base64');
const json=JSON.stringify({app:'sudo-make-music',kind:'song',v:1,name:'t',engine:'gameboy',speed:5,loopStart:0,order:[0],patterns:[{rows:16,data:b(song.patterns[0].data)}],instruments:song.inst,channels:song.ch});
const saved=G.newGame(); saved.song=json; const rom=make(saved); rom.boot(); const t0=rom.g.cycles; rom.g.apu.length=0; rom.frame({a:true});
for(let i=0;i<100;i++) rom.frame({}); 
const ev=rom.g.apu.map(e=>({f:Math.floor((e.cycle-t0)/70224), reg:e.reg, val:e.val}));
const at=(f,reg)=>ev.filter(e=>e.f===f&&e.reg===reg).map(e=>e.val);
// find the frame the music started: first NR12 write
const first=ev.find(e=>e.reg===0x12&&e.val!==0); const base=first.f; console.log('music begins in frame',base);
const reg=(n,w)=>{ const f=w?C.waveHz(0)&&Math.max(0,Math.min(2047,Math.round(2048-65536/C.noteHz(n)))):Math.max(0,Math.min(2047,Math.round(2048-131072/C.noteHz(n)))); return f; };
const row=r=>base+r*5;
// row 0: pulse 1 C-5 instrument 0 (duty 50%, volume 15, no fade)
let p=C.parseNote('C-5'), f=reg(p,false); let w=at(row(0),0x11); ok(w[0]===0x80,'row 0: pulse 1 duty 50% (NR11='+(w[0]&&w[0].toString(16))+')'); w=at(row(0),0x12); ok(w[0]===0xf0,'row 0: pulse 1 volume 15, no fade (NR12='+(w[0]&&w[0].toString(16))+')'); ok(at(row(0),0x13)[0]===(f&255)&&at(row(0),0x14)[0]===(0x80|(f>>8)),'row 0: pulse 1 pitch C-5 and restart (NR13/14 = '+(at(row(0),0x13)[0]).toString(16)+'/'+(at(row(0),0x14)[0]).toString(16)+', want '+(f&255).toString(16)+'/'+(0x80|(f>>8)).toString(16)+')');
ok(at(row(2),0x12)[0]===0,'row 2: note off silences pulse 1');
// row 4 pulse 2 A-4 inst 2: duty 50% vol 15 fade out period 2
p=C.parseNote('A-4'); f=reg(p,false); ok(at(row(4),0x16)[0]===0x80&&at(row(4),0x17)[0]===0xf2&&at(row(4),0x18)[0]===(f&255)&&at(row(4),0x19)[0]===(0x80|(f>>8)),'row 4: pulse 2 A-4 with a fade (NR22='+(at(row(4),0x17)[0]||0).toString(16)+')');
// wave channel
p=C.parseNote('C-3'); f=reg(p,true); ok(at(row(4),0x1a).join()==='0,128','row 4: wave channel switched off then on while its waveform is loaded'); ok(at(row(4),0x1c)[0]===0x20,'row 4: wave level 100%'); ok(at(row(4),0x1d)[0]===(f&255)&&at(row(4),0x1e)[0]===(0x80|(f>>8)),'row 4: wave pitch C-3 ('+(at(row(4),0x1d)[0]).toString(16)+'/'+(at(row(4),0x1e)[0]).toString(16)+' want '+(f&255).toString(16)+'/'+(0x80|(f>>8)).toString(16)+')');
const wv=Array.from(rom.g.wave), tri=C.WAVES.triangle; let wok=true; for(let i=0;i<32;i+=2) if(wv[i>>1]!==((tri[i]<<4)|tri[i+1])) wok=false; ok(wok,'the wave channel holds the triangle waveform from the instrument');
// noise
ok(at(row(6),0x21)[0]===0xf2&&at(row(6),0x23)[0]===0x80,'row 6: noise snare (volume 15, fade 2, restart): NR42='+(at(row(6),0x21)[0]||0).toString(16)); const nb=at(row(6),0x22)[0]; console.log('   noise NR43',nb.toString(16)); ok(nb!==undefined&&(nb&8)===0,'row 6: smooth (15-bit) noise');
// arpeggio on row 8: ticks 1 and 2 write different pitches than base
p=C.parseNote('C-5'); const lo=at(row(8),0x13); const t1=at(row(8)+0,0x13); const all=ev.filter(e=>e.reg===0x13&&e.f>=row(8)&&e.f<row(9)).map(e=>e.val); const want=[0,4,7].map(o=>reg(p+o,false)&255);
ok(all.length>=3&&all[0]===want[0]&&all[1]===want[1]&&all[2]===want[2],'row 8: arpeggio 4-7 cycles the pitch (NR13 per frame '+all.slice(0,5).map(v=>v.toString(16)).join(' ')+', want '+want.map(v=>v.toString(16)).join(' ')+' ...)');
// slide row 10: pitch moves up each frame
const sl=ev.filter(e=>e.reg===0x13&&e.f>=row(10)&&e.f<row(11)).map(e=>e.val); const hiW=ev.filter(e=>e.reg===0x14&&e.f>=row(10)&&e.f<row(11)).map(e=>e.val); const vals=sl.map((v,i)=>v|((hiW[i]&7)<<8)); ok(vals.length>=3&&vals[1]>vals[0]&&vals[2]>vals[1],'row 10: slide up raises the pitch each frame ('+vals.join(',')+')');
// duty change on row 12 (S03 = 75%)
ok(at(row(12),0x11)[0]===0xc0,'row 12: S03 switches pulse 1 to 75% duty (NR11='+(at(row(12),0x11)[0]||0).toString(16)+')');
// volume column on row 13: pulse 2 inst 0 vol 15 with column 7 -> 7
ok(((at(row(13),0x17)[0]||0)>>4)===7,'row 13: volume column 7 gives start volume 7 (NR22='+(at(row(13),0x17)[0]||0).toString(16)+')');
// loops: after 16 rows * 5 frames the pattern restarts
const second=ev.filter(e=>e.reg===0x12&&e.val===0xf0&&e.f>=base+75); ok(second.length>0&&second[0].f===base+80,'the song loops after 16 rows (second pass starts at frame +'+(second[0]?second[0].f-base:'?')+')');
ok(rom.g.violations.length===0,'no hardware-rule violations while playing: '+JSON.stringify(rom.g.violations.slice(0,3)));
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');
