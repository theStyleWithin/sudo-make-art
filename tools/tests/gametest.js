const G=require('../../src/gameengine.js'); let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const mk=(mut)=>{ const s=G.newGame(); if(mut) mut(s); return G.decode(s); };
const run=(w,n,inp={})=>{ for(let i=0;i<n;i++) G.step(w,inp); return w; };
const play=(game,opts={})=>{ const w=G.createWorld(game,opts.level||0,true); return w; };
// 1 title
let g=mk(); let w=G.createWorld(g); ok(w.state==='title','a game starts on its title screen'); G.step(w,{aPressed:true}); ok(w.state==='play'&&w.events.includes('start'),'pressing A starts it');
// 2 standing on the floor
w=play(mk()); run(w,30); ok(w.player.onGround&&w.player.y+w.player.h===128&&Number.isInteger(w.player.y),'player lands exactly on the floor (y+h='+(w.player.y+w.player.h)+')');
// 3 walking and walls
let x0=w.player.x; run(w,10,{right:true}); ok(Math.abs(w.player.x-x0-12)<0.5,'walks right about 1.2 px a frame ('+(w.player.x-x0).toFixed(1)+' in 10 frames)'); run(w,200,{left:true}); ok(w.player.x===0,'the left edge of the level stops the player (x='+w.player.x+')');
// 4 jumping
w=play(mk()); run(w,10); const gy=w.player.y; G.step(w,{aPressed:true,a:true}); ok(w.events.includes('jump')&&w.player.vy<0&&!w.player.onGround,'A jumps'); let top=gy; for(let i=0;i<60;i++){ G.step(w,{a:true}); top=Math.min(top,w.player.y); } const hold=gy-top; ok(hold>18&&hold<30,'holding A jumps about 3 tiles ('+hold.toFixed(1)+' px)'); ok(w.player.onGround&&w.player.y===gy,'and lands back on the floor');
w=play(mk()); run(w,10); G.step(w,{aPressed:true,a:true}); top=gy; for(let i=0;i<60;i++){ G.step(w,{a:false}); top=Math.min(top,w.player.y); } const tap=gy-top; ok(tap<hold*0.6&&tap>3,'tapping A makes a shorter hop ('+tap.toFixed(1)+' px)');
w=play(mk()); run(w,10); G.step(w,{aPressed:true,a:true}); const e=w.events.length; G.step(w,{aPressed:true,a:true}); ok(w.events.filter(x=>x==='jump').length===1,'no double jump in mid-air');
// 5 a wall blocks exactly at the tile edge
g=mk(s=>{ s.levels[0].cells[15*20+6]=1; }); w=play(g); run(w,10); run(w,200,{right:true}); ok(w.player.x+w.player.w===6*8,'a wall tile stops the player exactly at its edge (right edge at '+(w.player.x+w.player.w)+')');
// 6 coins
w=play(mk()); const coin=w.ents.find(e=>e.role==='coin'); w.player.x=coin.x; w.player.y=coin.y; G.step(w,{}); ok(w.score===10&&!coin.alive&&w.events.includes('coin'),'touching a coin scores 10');
// 7 enemy patrol turns at a wall and at a ledge
g=mk(s=>{ s.levels[0].ents=s.levels[0].ents.filter(e=>e.t!=='enemy'); s.levels[0].ents.push({t:'enemy',x:10,y:15,axis:'h',speed:1}); s.levels[0].cells[15*20+13]=1; s.levels[0].cells[15*20+6]=1; }); w=play(g); w.player.x=1; let en=w.ents.find(e=>e.role==='enemy'); let minx=1e9,maxx=-1e9; for(let i=0;i<400;i++){ G.step(w,{}); w.player.inv=999; minx=Math.min(minx,en.x); maxx=Math.max(maxx,en.x); } ok(maxx+en.w<=13*8+0.01&&minx>=7*8-0.01&&maxx-minx>20,'enemy patrols between two walls ('+minx.toFixed(0)+'..'+(maxx+en.w).toFixed(0)+')');
g=mk(s=>{ s.levels[0].ents=s.levels[0].ents.filter(e=>e.t!=='enemy'); s.levels[0].cells[16*20+12]=-1; s.levels[0].cells[16*20+11]=-1; s.levels[0].ents.push({t:'enemy',x:8,y:15,axis:'h',speed:1}); }); w=play(g); en=w.ents.find(e=>e.role==='enemy'); for(let i=0;i<300;i++){ G.step(w,{}); w.player.inv=999; } ok(en.y+en.h===128,'enemy turns around at a ledge instead of walking off (still on the floor, y+h='+(en.y+en.h)+')');
// 8 hurting, lives, game over, restart
g=mk(s=>{ s.levels[0].ents=s.levels[0].ents.filter(e=>e.t!=='enemy'); }); w=play(g); const sp={...w.spawn}; w.player.x=9*8; w.player.y=15*8; G.step(w,{}); G.step(w,{}); ok(w.lives===2&&w.events.includes('hurt'),'spikes hurt: lives 3 -> '+w.lives); ok(w.player.x===sp.x&&w.player.inv>0,'the player goes back to the start and blinks'); w.player.x=9*8; w.player.y=15*8; G.step(w,{}); ok(w.lives===2,'no second hit while blinking'); 
w.player.inv=0; w.player.x=9*8; w.player.y=15*8; G.step(w,{}); w.player.inv=0; w.player.x=9*8; w.player.y=15*8; G.step(w,{}); ok(w.state==='gameover'&&w.events.includes('gameover'),'out of lives is game over'); G.step(w,{aPressed:true}); ok(w.state==='play'&&w.lives===3&&w.score===0,'A restarts with full lives and score 0');
// 9 falling into a pit
g=mk(s=>{ for(let x=0;x<20;x++){ s.levels[0].cells[16*20+x]=-1; s.levels[0].cells[17*20+x]=-1; } s.levels[0].ents=s.levels[0].ents.filter(e=>e.t!=='enemy'); }); w=play(g); run(w,80); ok(w.lives===2,'falling into a pit costs a life');
// 10 goal, next level, win
const two=G.newGame(); two.levels.push(JSON.parse(JSON.stringify(two.levels[0]))); two.levels[1].name='Level 2'; g=G.decode(two); w=play(g); let goal=w.ents.find(e=>e.role==='goal'); w.player.x=goal.x; w.player.y=goal.y; w.score=30; G.step(w,{}); ok(w.li===1&&w.score===30&&w.state==='play','touching the goal moves to the next level and keeps the score'); goal=w.ents.find(e=>e.role==='goal'); w.player.x=goal.x; w.player.y=goal.y; G.step(w,{}); ok(w.state==='win','the last goal wins the game'); G.step(w,{aPressed:true}); ok(w.state==='title'&&w.li===0,'A on the win screen goes back to the title');
// 11 dialog
w=play(mk()); const npc=w.ents.find(e=>e.role==='npc'); w.player.x=npc.x+4; w.player.y=npc.y; G.step(w,{aPressed:true}); ok(w.state==='dialog'&&w.dialog.lines.length>=3,'A next to a character opens a dialog ('+w.dialog.lines.length+' lines)'); const pages=Math.ceil(w.dialog.lines.length/3); for(let i=0;i<pages;i++) G.step(w,{aPressed:true}); ok(w.state==='play','the dialog closes after its last page'); ok(G.wrapText('HELLO WORLD THIS IS A LONG SENTENCE FOR WRAPPING',18).every(l=>l.length<=18),'text wraps at 18 characters');
// 12 top-down
g=mk(s=>{ s.type='topdown'; }); w=play(g); const t0={x:w.player.x,y:w.player.y}; run(w,10,{up:true}); ok(w.player.y<t0.y-10,'top-down: up moves up without gravity'); run(w,300,{up:true}); ok(w.player.y>=0&&w.player.y<=1,'top-down: the level edge blocks (y='+w.player.y+')'); run(w,5,{down:true,right:true}); ok(Math.abs((w.player.x-t0.x)-5*1.2*0.7071)<1.5,'diagonal movement is normalised');
// 13 camera
const wide=G.newGame(); const L=wide.levels[0]; L.w=40; L.cells=[...Array(40*18)].map((_,i)=>{ const x=i%40,y=Math.floor(i/40); return y===16?2:y===17?1:-1; }); g=G.decode(wide); w=play(g); run(w,5); ok(w.camX===0,'camera sits at the left edge at the start'); w.player.x=30*8; G.step(w,{}); ok(w.camX===40*8-160,'camera stops at the right edge of a wide level ('+w.camX+')'); w.player.x=20*8; G.step(w,{}); ok(w.camX===Math.round(w.player.x+w.player.w/2-80)&&w.camX>0&&w.camX<160,'camera follows the player in between ('+w.camX+')');
// 14 data checks
ok(G.decode(G.newGame()).levels[0].cells.length===360,'default level is 20x18');
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');
