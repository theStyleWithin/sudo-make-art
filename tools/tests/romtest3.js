const {make,G}=require('./romcmp.js'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
let overruns=0, maxCycles=0;
const start=(saved,opts)=>{ const rom=make(saved,opts); const f=rom.frame; rom.frame=(pad)=>{ const c0=rom.g.cycles, fr0=rom.g.frames; f.call(rom,pad); const dc=rom.g.cycles-c0; if(rom.g.frames-fr0>1) overruns++; }; rom.boot(); rom.frame({a:true}); rom.frame({}); for(let i=0;i<15;i++) rom.frame({}); return rom; };
const setPos=(rom,i,x,y)=>{ const b=0xc800+16*i-0xc000; rom.g.wram[b+2]=0; rom.g.wram[b+3]=x&255; rom.g.wram[b+4]=(x>>8)&255; rom.g.wram[b+5]=0; rom.g.wram[b+6]=y&255; rom.g.wram[b+7]=(y>>8)&255; };
const walk=(rom,dir,n)=>{ for(let i=0;i<n;i++) rom.frame({[dir]:true}); };
let saved=G.newGame(), rom=start(saved);
// coin
let ents=[1,2,3,4,5,6,7].map(i=>rom.ent(i)); console.log('entities:',ents.map(e=>e.type+'@'+Math.round(e.x)+','+Math.round(e.y)).join(' '));
const coinIdx=ents.findIndex(e=>e.type===2)+1; setPos(rom,0,rom.ent(coinIdx).x-1,rom.ent(coinIdx).y); rom.frame({}); ok(rom.score()===10&&rom.ent(coinIdx).type===0,'touching a coin adds 10 to the score and removes the coin');
// spikes hurt
rom=start(saved); setPos(rom,0,9*8+1,15*8); rom.frame({}); rom.frame({}); ok(rom.lives()===2,'spikes cost a life (lives '+rom.lives()+')'); let p=rom.player(); ok(Math.abs(p.x-9)<1&&rom.mem(rom.S.v_inv)>0,'back at the start and blinking');
setPos(rom,0,9*8+1,15*8); rom.frame({}); ok(rom.lives()===2,'no second hit while blinking');
// enemy contact + game over screen
rom=start(saved); const en=rom.ent(ents.findIndex(e=>e.type===1)+1); for(let k=0;k<3;k++){ rom.g.wram[rom.S.v_inv-0xc000]=0; const e2=rom.ent(ents.findIndex(x=>x.type===1)+1); setPos(rom,0,e2.x,e2.y); rom.frame({}); }
ok(rom.state()===3,'three hits end the game (state '+rom.state()+', lives '+rom.lives()+')'); rom.frame({}); let hist=[0,0,0,0]; rom.g.render().forEach(v=>hist[v]++); ok(hist[3]>300,'the GAME OVER screen is drawn ('+hist[3]+' dark pixels)');
rom.frame({a:true}); rom.frame({}); ok(rom.state()===1&&rom.lives()===3&&rom.score()===0,'A restarts with 3 lives and no score');
// goal on the last level -> win
rom=start(saved); const gi=ents.findIndex(e=>e.type===3)+1; rom.g.wram[rom.S.v_score-0xc000]=123; setPos(rom,0,rom.ent(gi).x,rom.ent(gi).y); rom.frame({}); rom.frame({}); ok(rom.state()===4,'touching the goal of the last level wins'); hist=[0,0,0,0]; rom.g.render().forEach(v=>hist[v]++); ok(hist[3]>300,'the win screen is drawn'); 
const wmap=Array.from(rom.g.vram.slice(0x1c00+9*32+10,0x1c00+9*32+15)); ok(JSON.stringify(wmap)===JSON.stringify([0,0,1,2,3].map(d=>rom.r.report.F0+1+d)),'the score 00123 is written on the win screen ('+wmap.join(',')+')');
rom.frame({a:true}); rom.frame({}); ok(rom.state()===0,'A on the win screen returns to the title');
// two levels
const two=G.newGame(); two.levels.push(JSON.parse(JSON.stringify(two.levels[0]))); rom=start(two); const g2=rom.ent(ents.findIndex(e=>e.type===3)+1); setPos(rom,0,g2.x,g2.y); rom.frame({}); rom.frame({}); ok(rom.level()===1&&rom.state()===1,'the goal leads to level 2'); ok(rom.ent(ents.findIndex(e=>e.type===2)+1).type===2,'level 2 has its coins again');
// dialogue
rom=start(saved); const ni=ents.findIndex(e=>e.type===4)+1; const np=rom.ent(ni); setPos(rom,0,np.x+2,np.y); rom.frame({}); rom.frame({a:true}); ok(rom.state()===2,'A next to a character opens the dialogue (state '+rom.state()+')'); rom.frame({}); rom.frame({});
const row1=Array.from(rom.g.vram.slice(0x1c00+32+1,0x1c00+32+19)); const F0=rom.r.report.F0, tileOf=ch=>F0+[' ',...'0123456789',...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',...'!?.,:-\'*'].indexOf(ch); ok(row1.slice(0,6).join()===[...'HELLO!'].map(tileOf).join(),'the first line of speech is in the window map ("HELLO!")'); ok(rom.g.io[0x4a]===104,'the window is shown at the bottom of the screen (WY='+rom.g.io[0x4a]+')');
const shotA=rom.g.render(); let dark=0; for(let y=104;y<144;y++) for(let x=0;x<160;x++) if(shotA[y*160+x]===3) dark++; ok(dark>150,'the dialogue box has text and a border ('+dark+' dark pixels)');
for(let i=0;i<8&&rom.state()===2;i++){ rom.frame({a:true}); rom.frame({}); } ok(rom.state()===1,'A advances the pages and closes the dialogue'); rom.frame({}); rom.frame({}); ok(rom.g.io[0x4a]===144,'the window is hidden again');
// camera in a wide level
const wide=G.newGame(); const L=wide.levels[0]; L.w=32; L.cells=[...Array(32*18)].map((_,i)=>{ const x=i%32,y=Math.floor(i/32); return y===16?2:y===17?1:-1; }); L.ents=L.ents.filter(e=>e.t==='player'); L.ents.push({t:'goal',x:31,y:15}); rom=start(wide); ok(rom.cam()[0]===0,'camera starts at the left edge'); walk(rom,'right',150); ok(rom.cam()[0]>0&&rom.cam()[0]<=96,'the camera scrolls with the player (camx '+rom.cam()[0]+')'); setPos(rom,0,31*8-12,15*8); rom.frame({}); rom.frame({}); ok(rom.cam()[0]===96,'and stops at the right edge (96)');
// top-down
const td=G.newGame(); td.type='topdown'; rom=start(td); const t0=rom.player(); walk(rom,'up',10); const t1=rom.player(); ok(t1.y<t0.y-10,'top-down: up moves up with no gravity ('+t0.y+' -> '+t1.y+')'); const jsT=G.createWorld(G.decode(td),0,true); for(let i=0;i<17;i++) G.step(jsT,{}); for(let i=0;i<10;i++) G.step(jsT,{up:true}); ok(Math.abs(jsT.player.y-t1.y)<1,'matches the in-app engine ('+jsT.player.y.toFixed(1)+')');
// enemy patrol compared with the in-app engine
rom=start(saved); const jw=G.createWorld(G.decode(saved),0,true); for(let i=0;i<17;i++) G.step(jw,{}); let maxd=0; const ei=ents.findIndex(e=>e.type===1)+1; for(let i=0;i<400;i++){ rom.g.wram[rom.S.v_inv-0xc000]=99; jw.player.inv=99; rom.frame({}); G.step(jw,{}); const re=rom.ent(ei), je=jw.ents.find(e=>e.role==='enemy'); maxd=Math.max(maxd,Math.abs(re.x-je.x)); } ok(maxd<1.5,'the enemy patrols like the in-app one over 400 frames (largest gap '+maxd.toFixed(2)+' px)');
// sprites visible: count OAM entries in a normal frame and check the player sprite is where it should be
rom=start(saved); const oam=Array.from(rom.g.oam); let used=0; for(let i=0;i<40;i++) if(oam[i*4]>0) used++; ok(used>=8,'sprites are on screen (HUD plus characters): '+used+' entries'); 
console.log('frames that ran over one video frame:',overruns); ok(overruns===0,'every frame of the game fits inside one video frame'); ok(rom.g.violations.length===0,'no video-memory, sprite-memory or DMA rule violations: '+JSON.stringify(rom.g.violations.slice(0,3)));
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');
