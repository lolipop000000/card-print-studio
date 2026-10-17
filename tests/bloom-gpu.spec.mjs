import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import {makeSurface} from './src/render/effects/masks.js'; import {applyCreativeFilter} from './src/render/effects/creative-filters.js'; import {blurBloomOnGpu,getBloomAccelerationStatus} from './src/render/effects/gpu-bloom.js'; import {referenceBloom,bloomFixture} from './tests/bloom-performance-reference.mjs'; window.gpuBloomApi={makeSurface,applyCreativeFilter,blurBloomOnGpu,getBloomAccelerationStatus,referenceBloom,bloomFixture};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});});
after(async()=>{await session?.browser.close();});

test('default bloom really executes GPU passes and preserves alpha, artwork and print geometry',async()=>{
 const result=await session.page.evaluate(()=>{
  const {applyCreativeFilter,referenceBloom,bloomFixture}=gpuBloomApi,source=bloomFixture(300),p={radius:2,strength:1.4,threshold:.55,knee:.35,color:'#ef8aff'};
  const read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,original=read(source),expected=read(referenceBloom(source,p));
  let draws=0,glUsed;
  const prototype=WebGL2RenderingContext.prototype,draw=prototype.drawArrays;
  prototype.drawArrays=function(...args){draws++;glUsed=this;return draw.apply(this,args);};
  let actual;try{actual=applyCreativeFilter(source,{kind:'bloom',params:p});}finally{prototype.drawArrays=draw;}
  const bytes=read(actual),after=read(source);let maxAlphaError=0,maxPremultipliedError=0,haloPixels=0;
  for(let i=0;i<bytes.length;i+=4){
   maxAlphaError=Math.max(maxAlphaError,Math.abs(bytes[i+3]-expected[i+3]));
   for(let c=0;c<3;c++)maxPremultipliedError=Math.max(maxPremultipliedError,Math.abs(bytes[i+c]*bytes[i+3]/255-expected[i+c]*expected[i+3]/255));
   if(!original[i+3]&&bytes[i+3])haloPixels++;
  }
  const info=glUsed?.getExtension('WEBGL_debug_renderer_info');
  return {draws,renderer:info?glUsed.getParameter(info.UNMASKED_RENDERER_WEBGL):null,maxAlphaError,maxPremultipliedError,haloPixels,unchanged:original.every((v,i)=>v===after[i]),independent:actual.canvas!==source.canvas&&actual.work!==source.work,metadata:actual.dpi===source.dpi&&JSON.stringify(actual.work)===JSON.stringify(source.work)};
 });
 assert.ok(result.draws>=6,`Production bloom must execute its six blur passes on GPU: ${JSON.stringify(result)}`);
 assert.ok(result.haloPixels>0,'GPU result supplies the visible bloom halo');
 assert.ok(result.maxAlphaError<=1,JSON.stringify(result));
 assert.ok(result.maxPremultipliedError<=1.1,JSON.stringify(result));
 assert.equal(result.unchanged,true);assert.equal(result.independent,true);assert.equal(result.metadata,true);
 assert.deepEqual(session.pageErrors,[]);assert.deepEqual(session.httpRequests,[]);
 await writeFile(`${qa}/bloom-gpu-production.json`,JSON.stringify(result,null,2));
});

test('GPU bloom retains fractional halos, tiny canvases, tint and deterministic print frames',async()=>{
 const results=await session.page.evaluate(()=>{
  const {makeSurface,applyCreativeFilter,getBloomAccelerationStatus,bloomFixture}=gpuBloomApi,results=[],read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;
  const compare=(name,source,params)=>{
   const original=read(source),layer={kind:'bloom',params},cpu=read(applyCreativeFilter(source,layer,{bloomBackend:'cpu'})),before=getBloomAccelerationStatus();
   const output=applyCreativeFilter(source,layer,{seed:9,timeSec:42}),gpu=read(output);let maxAlphaError=0,maxPremultipliedError=0;
   for(let at=0;at<cpu.length;at+=4){
    maxAlphaError=Math.max(maxAlphaError,Math.abs(cpu[at+3]-gpu[at+3]));
    for(let c=0;c<3;c++)maxPremultipliedError=Math.max(maxPremultipliedError,Math.abs(cpu[at+c]*cpu[at+3]/255-gpu[at+c]*gpu[at+3]/255));
   }
   const repeat=read(applyCreativeFilter(source,layer,{seed:987,timeSec:0})),after=read(source);
   results.push({name,maxAlphaError,maxPremultipliedError,deterministic:gpu.every((v,i)=>v===repeat[i]),unchanged:original.every((v,i)=>v===after[i]),gpuRenders:getBloomAccelerationStatus().gpuRenders-before.gpuRenders});
  };
  const params=[{}, {radius:0}, {strength:0}, {radius:.001,threshold:0,knee:0,strength:3,color:'#f0a'}, {radius:.3,threshold:.8,knee:.6,strength:.1,color:'#20ff90'}, {radius:2,threshold:.55,knee:0,strength:2,color:'#ff2080'}, {radius:12,threshold:0,knee:1,strength:3}, {radius:12,threshold:1,knee:0}, {radius:2,threshold:1,knee:1,color:'#000000'}, {radius:Infinity,strength:NaN,threshold:NaN,knee:Infinity,color:'bad'}];
  for(const [w,h] of [[1,1],[1,19],[17,1],[4,3],[113,79]]){
   const dpi=300,scale=dpi/25.4,s=makeSurface({x:-2.3,y:1.7,w:w/scale,h:h/scale},dpi),pixels=s.ctx.createImageData(w,h);let state=5921;
   for(let i=0;i<pixels.data.length;i++){state=Math.imul(state,1664525)+1013904223|0;pixels.data[i]=state>>>24;}
   for(let i=0;i<pixels.data.length;i+=28)pixels.data[i+3]=0;
   s.ctx.putImageData(pixels,0,0);for(const [i,p] of params.entries())compare(`${w}x${h}:case-${i}`,s,p);
  }
  for(const [px,py] of [[0,0],[1,74],[83,70],[165,149]])for(const radius of [.001,.085,.127,.254,.31,.5,1,3,12]){
   const dpi=300,scale=dpi/25.4,w=169,h=151,s=makeSurface({x:-12,y:-12,w:w/scale,h:h/scale},dpi),pixels=s.ctx.createImageData(w,h);
   for(let i=0;i<pixels.data.length;i+=4)pixels.data.set([13,31,7,i%28?19:0],i);
   for(let y=py;y<Math.min(h,py+3);y++)for(let x=px;x<Math.min(w,px+5);x++)pixels.data.set([255,184+x%72,132+y%112,47+x*3%209],(y*w+x)*4);
   s.ctx.putImageData(pixels,0,0);compare(`halo:${px},${py}:r${radius}`,s,{radius,threshold:.25,knee:.6,strength:2.7,color:'#70d0ff'});
  }
  for(const dpi of [150,300])for(const dense of [false,true])compare(`${dpi}dpi:${dense?'dense':'sparse'}`,bloomFixture(dpi,dense),{radius:2,strength:1.4,color:'#ef8aff'});
  return results;
 });
 for(const r of results){assert.ok(r.maxAlphaError<=1,JSON.stringify(r));assert.ok(r.maxPremultipliedError<=1.1,JSON.stringify(r));assert.equal(r.deterministic,true,r.name);assert.equal(r.unchanged,true,r.name);}
 assert.ok(results.filter(r=>r.gpuRenders===2).length>65,'edge and print cases must actually use GPU');
 await writeFile(`${qa}/bloom-gpu-parity.json`,JSON.stringify(results,null,2));
});

test('unavailable GPU, missing float targets and allocation errors use exact CPU fallback without retry storms',async()=>{
 for(const mode of ['unavailable','float','allocation']){
  const page=await session.context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.evaluate(mode=>{
    window.gpuAttempts=0;
    if(mode==='unavailable'){
     const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'){gpuAttempts++;return null;}return get.call(this,type,...args);};
    }else if(mode==='float'){
     const get=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){if(name==='EXT_color_buffer_float'){gpuAttempts++;return null;}return get.call(this,name);};
    }else WebGL2RenderingContext.prototype.texStorage2D=function(){gpuAttempts++;throw new Error('Simulated allocation failure');};
   },mode);
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   const result=await page.evaluate(()=>{
    const {applyCreativeFilter,bloomFixture,referenceBloom,getBloomAccelerationStatus}=gpuBloomApi,s=bloomFixture(150),params={radius:2,strength:1.2},read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,expected=read(referenceBloom(s,params));
    const actual=read(applyCreativeFilter(s,{kind:'bloom',params})),repeat=read(applyCreativeFilter(s,{kind:'bloom',params}));
    return {status:getBloomAccelerationStatus(),attempts:gpuAttempts,exact:actual.every((v,i)=>v===expected[i]&&v===repeat[i])};
   });
   assert.equal(result.exact,true,mode);assert.equal(result.status.backend,'cpu',mode);assert.equal(result.status.gpuRenders,0,mode);assert.equal(result.attempts,1,mode);
   assert.equal(result.status.reason,{unavailable:'webgl2-unavailable',float:'float-target-unavailable',allocation:'gpu-render-failed'}[mode]);assert.deepEqual(errors,[]);
  }finally{await page.close();}
 }
});

test('GPU context loss falls back safely and restoration resumes GPU using fresh targets',async()=>{
 const page=await session.context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(()=>{
   const draw=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){window.bloomGl=this;return draw.apply(this,args);};
  });
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{gpuBloomApi.applyCreativeFilter(gpuBloomApi.bloomFixture(150),{kind:'bloom',params:{radius:2}});});
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('GPU context loss event did not arrive')),5000);
   bloomGl.canvas.addEventListener('webglcontextlost',()=>{clearTimeout(timeout);resolve();},{once:true});window.bloomLoseContext=bloomGl.getExtension('WEBGL_lose_context');bloomLoseContext.loseContext();
  }));
  const lost=await page.evaluate(()=>{
   const {applyCreativeFilter,bloomFixture,referenceBloom,getBloomAccelerationStatus}=gpuBloomApi,s=bloomFixture(150),p={radius:3},read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,a=read(applyCreativeFilter(s,{kind:'bloom',params:p})),b=read(referenceBloom(s,p));
   return {exact:a.every((v,i)=>v===b[i]),status:getBloomAccelerationStatus()};
  });
  assert.equal(lost.exact,true);assert.equal(lost.status.backend,'cpu');assert.equal(lost.status.reason,'context-lost');
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('GPU context restore event did not arrive')),10000);
   bloomGl.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timeout);resolve();},{once:true});bloomLoseContext.restoreContext();
  }));
  const restored=await page.evaluate(()=>{gpuBloomApi.applyCreativeFilter(gpuBloomApi.bloomFixture(300,true),{kind:'bloom',params:{radius:1}});return gpuBloomApi.getBloomAccelerationStatus();});
  assert.equal(restored.backend,'gpu');assert.equal(restored.reason,null);assert.equal(restored.gpuRenders,2);assert.equal(restored.gpuPasses,12);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});

test('size changes reuse one context, delete old textures and oversized jobs do not disable later GPU work',async()=>{
 const page=await session.context.newPage();
 try{
  await page.evaluate(()=>{
   window.gpuContextAttempts=0;window.gpuLiveTextures=new Set();window.gpuMaxTextures=0;
   const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')gpuContextAttempts++;return get.call(this,type,...args);};
   const p=WebGL2RenderingContext.prototype,create=p.createTexture,remove=p.deleteTexture;
   p.createTexture=function(){const texture=create.call(this);gpuLiveTextures.add(texture);gpuMaxTextures=Math.max(gpuMaxTextures,gpuLiveTextures.size);return texture;};
   p.deleteTexture=function(texture){gpuLiveTextures.delete(texture);return remove.call(this,texture);};
  });
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(()=>{
   const {blurBloomOnGpu,getBloomAccelerationStatus}=gpuBloomApi,results=[];
   for(const [w,h] of [[11,17],[11,17],[3,2],[1,1],[128,97]]){
    const energy=new Float32Array(w*h*4);energy.set([255,150,100,255],0);const before=energy.slice(),actual=blurBloomOnGpu(energy,w,h,.75);
    results.push(!!actual&&actual!==energy&&actual.every(Number.isFinite)&&before.every((v,i)=>v===energy[i]));
   }
   const rejected=blurBloomOnGpu(new Float32Array(4),1000000,1,2)===null,reason=getBloomAccelerationStatus().reason;
   const recovery=blurBloomOnGpu(new Float32Array([255,0,0,255]),1,1,.25);
   return {results,rejected,reason,recovery:!!recovery,contexts:gpuContextAttempts,maxTextures:gpuMaxTextures,liveTextures:gpuLiveTextures.size,status:getBloomAccelerationStatus()};
  });
  assert.ok(result.results.every(Boolean),JSON.stringify(result));assert.equal(result.rejected,true);assert.equal(result.reason,'job-too-large');assert.equal(result.recovery,true);assert.equal(result.contexts,1);assert.equal(result.maxTextures,2);assert.equal(result.liveTextures,2);assert.equal(result.status.backend,'gpu');assert.equal(result.status.reason,null);
 }finally{await page.close();}
});
