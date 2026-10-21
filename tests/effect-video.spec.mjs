import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

async function install(page){
 const bundle=await build({stdin:{contents:"export {renderEffectVideo} from './src/render/effect-video.js';export {openEffectVideo} from './src/ui/effect-video.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'videoApi',target:'es2022'});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
}

test('slow offline rendering produces 180 sharp frames in a seekable six-second video',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openHarness();try{
  await install(page);
  const r=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d'),times=[],progress=[];
   const blob=await videoApi.renderEffectVideo({canvas,startTimeSec:4.2,onProgress:p=>progress.push(p),renderFrame:async time=>{
    times.push(time);ctx.fillStyle=time<7.2?'#ff2020':'#2020ff';ctx.fillRect(0,0,320,240);
    ctx.fillStyle='white';ctx.fillRect(Math.round((time-4.2)*45),110,12,12);
    if(times.length%30===0)await new Promise(r=>setTimeout(r,40));
   }});
   const video=document.createElement('video');video.muted=true;video.preload='auto';video.src=URL.createObjectURL(blob);document.body.append(video);
   await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('cannot decode '+video.error?.message));});
   async function pixelAt(time){video.currentTime=time;await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));ctx.drawImage(video,0,0);return [...ctx.getImageData(20,20,1,1).data];}
   const duration=video.duration,first=await pixelAt(.05),last=await pixelAt(5.95),size=[video.videoWidth,video.videoHeight];
   video.currentTime=0;await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
   let frames=0;video.requestVideoFrameCallback(function frame(){frames++;if(frames<10)video.requestVideoFrameCallback(frame);});await video.play();await new Promise(r=>setTimeout(r,450));video.pause();
   URL.revokeObjectURL(video.src);video.remove();return {times,progress,duration,first,last,size,frames,bytes:blob.size,type:blob.type};
  });
  assert.equal(r.times.length,180);assert.equal(r.times[0],4.2);assert.ok(Math.abs(r.times.at(-1)-(4.2+179/30))<1e-9);
  assert.equal(r.progress.at(-1),1);assert.ok(r.progress.every((v,i)=>!i||v>=r.progress[i-1]));
  assert.ok(Math.abs(r.duration-6)<.02,`duration=${r.duration}`);assert.deepEqual(r.size,[320,240]);assert.ok(r.bytes>1000);assert.match(r.type,/video\/webm/);
  assert.ok(r.first[0]>180&&r.first[2]<80);assert.ok(r.last[2]>180&&r.last[0]<80);assert.ok(r.frames>=5,'prepared video decodes during native playback');assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('preparation can be cancelled mid-render and reopened without stale progress',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await install(page);const r=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;const controller=new AbortController(),progress=[];let count=0,caught;
   try{await videoApi.renderEffectVideo({canvas,signal:controller.signal,onProgress:p=>progress.push(p),renderFrame:()=>{if(++count===5)controller.abort();}});}catch(e){caught=e.name;}
   const old=progress.length;await new Promise(r=>setTimeout(r,50));const later=progress.length;
   const reopened=await videoApi.renderEffectVideo({canvas,renderFrame:()=>canvas.getContext('2d').fillRect(0,0,160,160)});
   return {count,caught,old,later,size:reopened.size};
  });assert.equal(r.caught,'AbortError');assert.equal(r.count,5);assert.equal(r.old,r.later);assert.ok(r.size>0);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('a delayed codec cannot buffer more than four submitted frames even with an empty request queue',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await install(page);const r=await page.evaluate(async()=>{
   const Original=globalThis.VideoEncoder;let maximum=0,flushes=0;
   class DelayedEncoder{
    static async isConfigSupported(){return {supported:true};}
    constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.encodeQueueSize=0;this.pending=[];}
    configure(){this.state='configured';}
    encode(frame,{keyFrame}){this.pending.push({timestamp:frame.timestamp,type:keyFrame?'key':'delta',byteLength:1,copyTo:data=>data.fill(0)});maximum=Math.max(maximum,this.pending.length);}
    async flush(){flushes++;for(const frame of this.pending.splice(0))this.callbacks.output(frame);}
    close(){this.state='closed';this.pending=[];}
   }
   Object.defineProperty(globalThis,'VideoEncoder',{configurable:true,value:DelayedEncoder});
   try{const canvas=document.createElement('canvas');canvas.width=canvas.height=40;await videoApi.renderEffectVideo({canvas,renderFrame:()=>canvas.getContext('2d').fillRect(0,0,40,40)});return {maximum,flushes};}
   finally{Object.defineProperty(globalThis,'VideoEncoder',{configurable:true,value:Original});}
  });assert.ok(r.maximum<=4,`codec retained ${r.maximum} frames`);assert.ok(r.flushes>=45);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('cancelling while the codec flushes closes it and reports cancellation',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await install(page);const r=await page.evaluate(async()=>{
   const Original=globalThis.VideoEncoder,controller=new AbortController();let closed=0,count=0,caught;
   class WaitingEncoder{
    static async isConfigSupported(){return {supported:true};}
    constructor(){this.state='unconfigured';this.encodeQueueSize=0;}
    configure(){this.state='configured';}
    encode(){count++;}
    async flush(){controller.abort();throw new DOMException('Encoder closed','InvalidStateError');}
    close(){closed++;this.state='closed';}
   }
   Object.defineProperty(globalThis,'VideoEncoder',{configurable:true,value:WaitingEncoder});
   try{const canvas=document.createElement('canvas');canvas.width=canvas.height=40;await videoApi.renderEffectVideo({canvas,signal:controller.signal,renderFrame:()=>{}});}catch(e){caught=e.name;}
   finally{Object.defineProperty(globalThis,'VideoEncoder',{configurable:true,value:Original});}
   return {closed,count,caught};
  });assert.deepEqual(r,{closed:1,count:4,caught:'AbortError'});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('unsupported video encoding and bad frame dimensions explain the actual problem',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await install(page);const r=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=0;canvas.height=0;let invalid,unsupported;
   try{await videoApi.renderEffectVideo({canvas,renderFrame:()=>{}});}catch(e){invalid=e.message;}
   canvas.width=160;canvas.height=160;const encoder=globalThis.VideoEncoder;Object.defineProperty(globalThis,'VideoEncoder',{configurable:true,value:undefined});
   try{await videoApi.renderEffectVideo({canvas,renderFrame:()=>{}});}catch(e){unsupported=e.message;}finally{Object.defineProperty(globalThis,'VideoEncoder',{configurable:true,value:encoder});}
   return {invalid,unsupported};
  });assert.match(r.invalid,/크기|해상도/);assert.match(r.unsupported,/브라우저.*지원/);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('video viewer freezes other targets and snapshots draft recipes without editing the project',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openHarness();try{
  await install(page);const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const project=a.createProject();project.settings.cardWidthMm=40;project.settings.cardHeightMm=30;
   const card=project.cards[0];card.elements=[5,26].map((x,i)=>({id:'effect-'+i,type:'effect',binding:null,rect:{x,y:10,w:8,h:8},style:{visualEffects:{...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('ripple',{protectText:false,params:{count:1,start:.1,end:.8,life:2,frequency:1,color:i?'#ee3333':'#3344ee'}})]}}}));
   const before=JSON.stringify(project),close=videoApi.openEffectVideo({project,target:card,assets:new Map(),startTimeSec:.3,playbackTarget:{elementId:'effect-0'},frozenTimeSec:1.2});
   // Further changes cannot affect the already requested scene.
   card.elements[0].style.visualEffects.layers=[];
   const viewer=document.getElementById('effect-video-viewer');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clearInterval(poll);reject(Error('video preparation timed out: '+viewer.dataset.state));},120000),poll=setInterval(()=>{if(viewer.dataset.state==='ready'){clearTimeout(timer);clearInterval(poll);resolve();}else if(viewer.dataset.state==='error'){clearTimeout(timer);clearInterval(poll);reject(Error(viewer.textContent));}},20);});
   const video=viewer.querySelector('video');video.pause();const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const g=canvas.getContext('2d',{willReadFrequently:true});
   async function halves(time){video.currentTime=time;await new Promise(r=>video.addEventListener('seeked',r,{once:true}));g.drawImage(video,0,0);const half=Math.floor(canvas.width/2);return [g.getImageData(0,0,half,canvas.height).data,g.getImageData(half,0,canvas.width-half,canvas.height).data];}
   const first=await halves(.01),second=await halves(.6),changed=(one,two)=>{let count=0;for(let i=0;i<one.length;i+=4)if(Math.abs(one[i]-two[i])+Math.abs(one[i+1]-two[i+1])+Math.abs(one[i+2]-two[i+2])>50)count++;return count;};
   const result={left:changed(first[0],second[0]),right:changed(first[1],second[1]),width:canvas.width,height:canvas.height};
   const expected=JSON.parse(before);expected.cards[0].elements[0].style.visualEffects.layers=[];result.unchanged=JSON.stringify(project)===JSON.stringify(expected);close();return result;
  });assert.ok(r.left>100,'selected draft effect must remain visible and animate after the original is edited');assert.ok(r.right<20,'non-selected region must remain frozen despite lossy encoding');assert.deepEqual([r.width,r.height],[472,354]);assert.equal(r.unchanged,true);assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
