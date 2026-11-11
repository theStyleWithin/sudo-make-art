const C=require('../../src/chip.js'); const fs=require('fs'); const {execFileSync}=require('child_process');
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const song=()=>{ const s=C.newSong(); return s; };
const put=(s,pat,row,ch,{note,inst,vol,fx,fp}={})=>{ const d=s.patterns[pat].data, i=C.cellIndex(row,ch,0); if(note!==undefined) d[i]=note===255?255:note+1; if(inst!==undefined) d[i+1]=inst+1; if(vol!==undefined) d[i+2]=vol+1; if(fx){ d[i+3]=fx.charCodeAt(0); d[i+4]=fp||0; } };
const freq=(x,sr,a,b)=>{ let c=0; for(let i=a+1;i<b;i++) if(x[i-1]<=0&&x[i]>0) c++; return c/((b-a)/sr); };
const rms=(x,a,b)=>{ let s=0; for(let i=a;i<b;i++) s+=x[i]*x[i]; return Math.sqrt(s/(b-a)); };
const only=(s,ch)=>{ s.ch.forEach((c,i)=>{ c.mute=i!==ch; }); };
// 1. length
let s=song(); put(s,0,0,0,{note:57,inst:0}); let r=C.render(s); ok(r.length===32*6*735,'32 rows x speed 6 x 735 samples per tick = '+r.length);
// 2. pitch of A-4 on pulse (quantised like the real chip)
const mono=r=>r.L; let f=freq(mono(r),44100,2000,60000); ok(Math.abs(f-C.pulseHz(440))<8&&Math.abs(f-440)<5,'pulse A-4 plays about 440 Hz: measured '+f.toFixed(1)+' Hz (register-quantised target '+C.pulseHz(440).toFixed(1)+')');
// 3. duty cycles: fraction of time above zero
for(const [d,exp] of [[0,.125],[1,.25],[2,.5],[3,.75]]){ s=song(); s.inst.pulse[0].duty=d; put(s,0,0,0,{note:45,inst:0}); r=C.render(s); let hi=0,n=0; for(let i=20000;i<80000;i++){ n++; if(r.L[i]>0) hi++; } const fr=hi/n; ok(Math.abs(fr-exp)<0.04,'pulse duty '+(exp*100)+'% measured '+(fr*100).toFixed(1)+'%'); }
// 4. envelope decays in 16 steps and stays at zero
s=song(); s.inst.pulse[0]={name:'x',duty:2,vol:15,dir:-1,period:2}; put(s,0,0,0,{note:45,inst:0}); r=C.render(s); const w=4410; const e0=rms(r.L,2000,2000+w), e1=rms(r.L,2000+20000,2000+20000+w), e2=rms(r.L,70000,70000+w); ok(e0>e1&&e1>e2&&e2<0.003,'envelope decays: rms '+e0.toFixed(3)+' > '+e1.toFixed(3)+' > '+e2.toFixed(4));
s=song(); put(s,0,0,0,{note:45,inst:0}); r=C.render(s); const steady=rms(r.L,30000,30000+w), s2=song(); put(s2,0,0,0,{note:45,inst:0,vol:7}); const q=C.render(s2); const half=rms(q.L,30000,30000+w); ok(Math.abs(half/steady-7/15)<0.06,'volume column 7 is 7/15 of full volume: ratio '+(half/steady).toFixed(3));
// 5. wave channel
s=song(); only(s,2); put(s,0,0,2,{note:57,inst:0}); r=C.render(s); f=freq(r.L,44100,3000,60000); ok(Math.abs(f-C.waveHz(440))<8,'wave channel A-4 about 440 Hz: '+f.toFixed(1)); ok(rms(r.L,5000,20000)>0.01,'wave channel is audible');
s=song(); only(s,2); s.inst.wave[0].vol=3; put(s,0,0,2,{note:57,inst:0}); const q2=C.render(s); ok(rms(q2.L,5000,20000)<rms(r.L,5000,20000)*0.4,'wave volume 25% is quieter than 100%');
// 6. noise: 7-bit register repeats every 127 steps, 15-bit does not (at 8192 Hz, note C-4 clocks the register at 4096 Hz = 2 samples per step)
for(const w7 of [true,false]){ s=song(); only(s,3); s.inst.noise[0]={name:'n',width7:w7,vol:15,dir:0,period:0}; put(s,0,0,3,{note:48,inst:0}); r=C.render(s,{sampleRate:8192}); const x=r.L, a=2000, len=3000; let num=0,d1=0,d2=0; for(let i=0;i<len;i++){ num+=x[a+i]*x[a+i+254]; d1+=x[a+i]**2; d2+=x[a+i+254]**2; } const ac=num/Math.sqrt(d1*d2); ok(w7?ac>0.95:ac<0.5,(w7?'7-bit':'15-bit')+' noise autocorrelation at 127 steps = '+ac.toFixed(2)+(w7?' (repeats)':' (does not repeat)')); }
// 7. effects
s=song(); put(s,0,0,0,{note:45,inst:0,fx:'0',fp:0x47}); r=C.render(s); const t=735; const fa=freq(r.L,44100,0*t+100,1*t-50), fb=freq(r.L,44100,1*t+100,2*t-50); ok(fb>fa*1.2,'arpeggio 0 4 7: second tick is higher than the first ('+fa.toFixed(0)+' -> '+fb.toFixed(0)+' Hz)');
s=song(); put(s,0,0,0,{note:45,inst:0,fx:'1',fp:0x10}); r=C.render(s); ok(freq(r.L,44100,5*t,6*t)>freq(r.L,44100,1*t,2*t)*1.1,'slide up raises the pitch');
s=song(); put(s,0,0,0,{note:45,inst:0,fx:'C',fp:2}); r=C.render(s); ok(rms(r.L,100,2*t-100)>0.02&&rms(r.L,3*t,6*t)<0.002,'note cut C02 silences the note after 2 ticks');
s=song(); put(s,0,0,0,{note:45,inst:0,fx:'F',fp:3}); r=C.render(s); ok(r.length===(31*3+3)*735&&false===false||r.length===32*3*735,'speed F03 on row 0 changes the song length ('+r.length+')');
s=song(); put(s,0,0,0,{note:45,inst:0,fx:'4',fp:0x84}); r=C.render(s); ok(rms(r.L,2000,30000)>0.02,'vibrato still sounds');
s=song(); s.inst.pulse[0].duty=0; put(s,0,0,0,{note:45,inst:0,fx:'S',fp:2}); r=C.render(s); let hi=0,n=0; for(let i=20000;i<80000;i++){ n++; if(r.L[i]>0) hi++; } ok(Math.abs(hi/n-.5)<.04,'S02 switches the pulse to 50% duty');
// 8. mixing: mute, solo, pan
s=song(); put(s,0,0,0,{note:45,inst:0}); s.ch[0].mute=true; r=C.render(s); ok(rms(r.L,0,50000)===0,'muted channel is silent');
s=song(); put(s,0,0,0,{note:45,inst:0}); put(s,0,0,1,{note:52,inst:0}); s.ch[1].solo=true; r=C.render(s); const sf=freq(r.L,44100,3000,40000); ok(Math.abs(sf-C.pulseHz(C.noteHz(52)))<10,'solo plays only that channel ('+sf.toFixed(0)+' Hz)');
s=song(); put(s,0,0,0,{note:45,inst:0}); s.ch[0].pan='R'; r=C.render(s); ok(rms(r.L,0,50000)===0&&rms(r.R,0,50000)>0.01,'pan right: left side silent, right side audible'); s.ch[0].pan='L'; r=C.render(s); ok(rms(r.R,0,50000)===0&&rms(r.L,0,50000)>0.01,'pan left');
// 9. pattern-only render and note cut
s=song(); s.patterns.push(C.newPattern(16)); put(s,1,0,0,{note:45,inst:0}); r=C.render(s,{pattern:1}); ok(r.length===16*6*735,'rendering one pattern uses only its rows'); put(s,0,2,0,{note:255}); put(s,0,0,0,{note:45,inst:0}); r=C.render(s); ok(rms(r.L,2*6*735+500,3*6*735)<0.002,'note-off (---) stops the channel');
// 10. WAV decodes
s=song(); put(s,0,0,0,{note:57,inst:0}); put(s,0,4,2,{note:45,inst:0}); r=C.render(s); fs.mkdirSync('pxout',{recursive:true}); fs.writeFileSync('/tmp/song.wav',C.toWav(r));
const out=execFileSync(require('../../node_modules/ffmpeg-static'),['-hide_banner','-i','/tmp/song.wav','-f','null','-'],{stdio:'pipe'}).toString()+''; 
try{ execFileSync(require('../../node_modules/ffmpeg-static'),['-hide_banner','-i','/tmp/song.wav','-f','null','-'],{stdio:'pipe'}); }catch(e){}
let info=''; try{ execFileSync(require('../../node_modules/ffmpeg-static'),['-hide_banner','-i','/tmp/song.wav'],{stdio:'pipe'}); }catch(e){ info=String(e.stderr); }
ok(/pcm_s16le.*44100 Hz, stereo/.test(info)&&/Duration: 00:00:03\.2/.test(info),'WAV is 16-bit stereo 44.1 kHz and 3.2 s long');
console.log(fails?('\n'+fails+' FAILED'):'\nALL PASSED');
