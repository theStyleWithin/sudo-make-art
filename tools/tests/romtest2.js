const {make,G}=require('./romcmp.js'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const saved=G.newGame(); const rom=make(saved); rom.boot();
ok(rom.state()===0,'ROM starts on the title screen'); 
rom.frame({a:true}); rom.frame({}); ok(rom.state()===1,'A starts the game (state '+rom.state()+')'); ok(rom.lives()===3,'3 lives'); ok(rom.g.violations.length===0,'no hardware-rule violations so far '+JSON.stringify(rom.g.violations.slice(0,3)));
// settle onto the floor
for(let i=0;i<20;i++) rom.frame({}); const p0=rom.player(); console.log('player after settling:',JSON.stringify(p0)); 
const jsw=G.createWorld(G.decode(saved),0,true); for(let i=0;i<20;i++) G.step(jsw,{}); console.log('engine player:',jsw.player.x,jsw.player.y);
ok(Math.abs(p0.x-jsw.player.x)<0.01&&Math.abs(p0.y-jsw.player.y)<0.01,'standing position matches the in-app engine');
// compare a scripted run frame by frame
const script=[]; for(let i=0;i<30;i++) script.push({right:true}); for(let i=0;i<20;i++) script.push({right:true,a:true}); for(let i=0;i<30;i++) script.push({right:true}); for(let i=0;i<20;i++) script.push({left:true}); for(let i=0;i<10;i++) script.push({a:true}); for(let i=0;i<30;i++) script.push({});
let maxd=0, worst=-1; const jw=jsw; let prevA=false;
script.forEach((pad,i)=>{ rom.frame(pad); const input={left:!!pad.left,right:!!pad.right,up:!!pad.up,down:!!pad.down,a:!!pad.a,aPressed:!!pad.a&&!prevA}; prevA=!!pad.a; G.step(jw,input); jw.events.length=0; const r=rom.player(), d=Math.max(Math.abs(r.x-jw.player.x),Math.abs(r.y-jw.player.y)); if(d>maxd){ maxd=d; worst=i; } });
console.log('largest difference over',script.length,'frames:',maxd.toFixed(3),'px (frame',worst+')');
ok(maxd<1.0,'the ROM follows the in-app engine within a pixel across walking, jumping and falling');
console.log('violations:',JSON.stringify(rom.g.violations.slice(0,5))); ok(rom.g.violations.length===0,'no video-memory or sprite-memory violations while playing');
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');
