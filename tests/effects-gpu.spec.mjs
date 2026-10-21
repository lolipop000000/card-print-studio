import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`
 import {makeSurface} from './src/render/effects/masks.js';
 import {applyEffectFilter} from './src/render/effects/filters.js';
 import {makeVisualEffectLayer,createVisualEffects} from './src/model/visual-effects.js';
 import {getEffectAccelerationStatus,runGpuEffect} from './src/render/effects/gpu-runtime.js';
 import {gpuContour,gpuMixPixels} from './src/render/effects/gpu-filters.js';
 import {renderVisualEffects} from './src/render/effects/composite.js';
 window.allGpuApi={makeSurface,applyEffectFilter,makeVisualEffectLayer,createVisualEffects,getEffectAccelerationStatus,runGpuEffect,gpuContour,gpuMixPixels,renderVisualEffects};
 `,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});});
after(async()=>{await session?.browser.close();});

const kinds=['colorAdjust','posterize','halftone','chromatic','outline','erode','innerGlow','innerShadow','bevel','extrude','foil','holographic','glitch','scanlines','grain','duotone','directionalBlur','displacement'];

test('every pixel filter executes real GPU work and returns deterministic independent artwork',async()=>{
 const results=await session.page.evaluate(kinds=>{
  const {makeSurface,applyEffectFilter,makeVisualEffectLayer}=allGpuApi,read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,results=[];
  const logs=[],log=WebGL2RenderingContext.prototype.getShaderInfoLog;WebGL2RenderingContext.prototype.getShaderInfoLog=function(...args){const message=log.apply(this,args);logs.push(message);return message;};
  const source=makeSurface({x:-3.7,y:-2.1,w:28,h:23},127),c=source.ctx;
  const gradient=c.createLinearGradient(1,0,18,16);gradient.addColorStop(0,'#ef7133');gradient.addColorStop(.5,'#4775d5');gradient.addColorStop(1,'#12ba8d');
  c.fillStyle=gradient;c.fillRect(2,2,13,10);c.clearRect(7,7,3,5);c.fillStyle='#c72c83';c.fillRect(17,7,2,4);c.globalAlpha=.35;c.fillStyle='#e46424';c.fillRect(4,14,5,2);c.globalAlpha=1;
  const original=read(source),options={rect:{x:2,y:2,w:17,h:14},seed:29,timeSec:1.2};
  for(const kind of kinds){
   const layer=makeVisualEffectLayer(kind,{id:'gpu-'+kind,params:kind==='colorAdjust'?{hue:39,saturation:1.4,brightness:1.15}:kind==='chromatic'?{mode:'channels'}:{}});
   const cpu=read(applyEffectFilter(source,layer,{...options,backend:'cpu'}));let draws=0;
   const draw=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){draws++;return draw.apply(this,args);};
   let output;try{output=applyEffectFilter(source,layer,options);}finally{WebGL2RenderingContext.prototype.drawArrays=draw;}
   const gpu=read(output),repeat=read(applyEffectFilter(source,layer,options)),after=read(source);let maxAlpha=0,maxColor=0,changedPixels=0,differingPixels=0;
   for(let i=0;i<gpu.length;i+=4){let differs=false;maxAlpha=Math.max(maxAlpha,Math.abs(cpu[i+3]-gpu[i+3]));
    for(let k=0;k<3;k++){const error=Math.abs(cpu[i+k]*cpu[i+3]/255-gpu[i+k]*gpu[i+3]/255);maxColor=Math.max(maxColor,error);if(error>1.1)differs=true;}
    if(Math.abs(cpu[i+3]-gpu[i+3])>1)differs=true;if(differs)differingPixels++;
    if(gpu[i]!==original[i]||gpu[i+1]!==original[i+1]||gpu[i+2]!==original[i+2]||gpu[i+3]!==original[i+3])changedPixels++;
   }
   results.push({kind,draws,maxAlpha,maxColor,differingPixels,changedPixels,repeat:gpu.every((v,i)=>v===repeat[i]),untouched:original.every((v,i)=>v===after[i]),independent:source.canvas!==output.canvas&&source.work!==output.work,metadata:JSON.stringify(source.work)===JSON.stringify(output.work)&&source.dpi===output.dpi,logs:[...logs]});
  }
  WebGL2RenderingContext.prototype.getShaderInfoLog=log;return results;
 },kinds);
 await writeFile(`${qa}/effects-gpu-production.json`,JSON.stringify(results,null,2));
 for(const r of results){assert.ok(r.draws>0,`actual GPU filter draw required: ${JSON.stringify(r)}`);assert.ok(r.changedPixels>0,r.kind);assert.equal(r.repeat,true,r.kind);assert.equal(r.untouched,true,r.kind);assert.equal(r.independent,true,r.kind);assert.equal(r.metadata,true,r.kind);assert.ok(r.maxAlpha<=1,JSON.stringify(r));assert.ok(r.differingPixels<=2,JSON.stringify(r));}
 assert.deepEqual(session.pageErrors,[]);assert.deepEqual(session.httpRequests,[]);
});

test('GPU bilinear sampling preserves both sides of cardinal and near-cardinal directional blur',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=allGpuApi,results=[],angles=[0,90,-90,180,-180,1e-7,-1e-7,89.9999999,-89.9999999,179.9999999,-179.9999999];
  for(const alpha of [64,128,255])for(const angle of angles){
   const source=a.makeSurface({x:0,y:0,w:5,h:5},127),pixels=source.ctx.createImageData(25,25);pixels.data.set([255,0,0,alpha],(12*25+12)*4);source.ctx.putImageData(pixels,0,0);
   const layer=a.makeVisualEffectLayer('directionalBlur',{id:'cardinal-blur',params:{distance:.8,angle,samples:5,strength:1}}),read=s=>s.ctx.getImageData(0,0,25,25).data;
   const cpu=read(a.applyEffectFilter(source,layer,{backend:'cpu'})),before=a.getEffectAccelerationStatus(),gpu=read(a.applyEffectFilter(source,layer)),after=a.getEffectAccelerationStatus();let maxAlpha=0,maxColor=0,occupied=0;
   for(let i=0;i<gpu.length;i+=4){maxAlpha=Math.max(maxAlpha,Math.abs(gpu[i+3]-cpu[i+3]));for(let k=0;k<3;k++)maxColor=Math.max(maxColor,Math.abs(gpu[i+k]*gpu[i+3]/255-cpu[i+k]*cpu[i+3]/255));if(gpu[i+3])occupied++;}
   results.push({alpha,angle,maxAlpha,maxColor,occupied,gpu:after.gpuRenders-before.gpuRenders,cpu:after.cpuRenders-before.cpuRenders});
  }return results;
 });
 await writeFile(`${qa}/effects-gpu-cardinal-sampling.json`,JSON.stringify(results,null,2));
 for(const r of results){assert.equal(r.gpu,1,JSON.stringify(r));assert.equal(r.cpu,0,JSON.stringify(r));assert.equal(r.occupied,5,JSON.stringify(r));assert.ok(r.maxAlpha<=1&&r.maxColor<=1,JSON.stringify(r));}
 assert.deepEqual(session.pageErrors,[]);
});

test('GPU inner shadows retain tiny positive and negative offsets without losing the interior',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=allGpuApi,results=[];
  for(const alpha of [64,128,255])for(const offsetX of [0,1e-8,-1e-8,1e-6,-1e-6,.4,-.4]){
   const source=a.makeSurface({x:0,y:0,w:5,h:5},127);source.ctx.fillStyle=`rgba(255,255,255,${alpha/255})`;source.ctx.fillRect(2.4,0,.2,5);
   const layer=a.makeVisualEffectLayer('innerShadow',{id:'near-grid-shadow',params:{offsetX,offsetY:0,blur:0,strength:1,color:'#000000'}}),read=s=>s.ctx.getImageData(0,0,25,25).data;
   const cpu=read(a.applyEffectFilter(source,layer,{backend:'cpu'})),before=a.getEffectAccelerationStatus(),gpu=read(a.applyEffectFilter(source,layer)),after=a.getEffectAccelerationStatus();let maxAlpha=0,maxColor=0;
   for(let i=0;i<gpu.length;i+=4){maxAlpha=Math.max(maxAlpha,Math.abs(gpu[i+3]-cpu[i+3]));for(let k=0;k<3;k++)maxColor=Math.max(maxColor,Math.abs(gpu[i+k]*gpu[i+3]/255-cpu[i+k]*cpu[i+3]/255));}
   results.push({alpha,offsetX,maxAlpha,maxColor,gpu:after.gpuRenders-before.gpuRenders,cpu:after.cpuRenders-before.cpuRenders});
  }return results;
 });
 await writeFile(`${qa}/effects-gpu-shadow-sampling.json`,JSON.stringify(results,null,2));
 for(const r of results){assert.equal(r.gpu,1,JSON.stringify(r));assert.equal(r.cpu,0,JSON.stringify(r));assert.ok(r.maxAlpha<=1&&r.maxColor<=1.1,JSON.stringify(r));}
 assert.deepEqual(session.pageErrors,[]);
});

test('drawing surfaces request GPU acceleration while analysis surfaces retain cheap readback',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=allGpuApi.makeSurface({x:0,y:0,w:20,h:20},150),b=allGpuApi.makeSurface({x:0,y:0,w:20,h:20},150,{readback:true});
  return {drawing:a.ctx.getContextAttributes().willReadFrequently,analysis:b.ctx.getContextAttributes().willReadFrequently};
 });assert.deepEqual(result,{drawing:false,analysis:true});
});

test('dark-ink chromatic fringes preserve native tint quantization and fractional edge sampling',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=allGpuApi,results=[];
  for(const dpi of [25.4,300])for(const alpha of [17,127,254,255])for(const mode of ['auto','fringe']){
   const w=dpi===300?83:13,h=dpi===300?67:9,scale=dpi/25.4,source=a.makeSurface({x:-3.1,y:.7,w:w/scale,h:h/scale},dpi),data=source.ctx.createImageData(w,h);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x+y)%3!==0){const i=(y*w+x)*4;data.data.set([20,30,40,alpha],i);}source.ctx.putImageData(data,0,0);
   const layer=a.makeVisualEffectLayer('chromatic',{id:'fringe-review',params:{mode,distance:.31,angle:37,strength:.61}}),read=s=>s.ctx.getImageData(0,0,w,h).data;
   const cpu=read(a.applyEffectFilter(source,layer,{backend:'cpu'})),before=a.getEffectAccelerationStatus(),actual=read(a.applyEffectFilter(source,layer)),after=a.getEffectAccelerationStatus();
   results.push({dpi,alpha,mode,exact:actual.every((v,i)=>v===cpu[i]),native:after.canvasRenders-before.canvasRenders,gpu:after.gpuRenders-before.gpuRenders,eligible:source.ctx.getContextAttributes().willReadFrequently===false});
  }return results;
 });for(const r of results){assert.equal(r.exact,true,JSON.stringify(r));assert.equal(r.native,1,JSON.stringify(r));assert.equal(r.gpu,0);assert.equal(r.eligible,true);}
});

test('ripple contours and partial-alpha filter interpolation return the actual GPU pixels',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=allGpuApi,width=41,height=29,distance=new Float32Array(width*height),rings=[{radius:.7,alpha:.27},{radius:1.8,alpha:.63}],scale=5,stroke=.35;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)distance[y*width+x]=Math.hypot(x-20,y-14)/scale-1.2;
  distance[0]=Infinity;distance[1]=-Infinity;const before=a.getEffectAccelerationStatus(),contour=a.gpuContour({width,height,distance,scale},rings,'#79d9ff',stroke);let contourError=0;
  for(let i=0;i<distance.length;i++){
   let alpha=0;if(distance[i]>=0&&Number.isFinite(distance[i]))for(const ring of rings){const coverage=Math.max(0,Math.min(1,(stroke*.5+.5/scale-Math.abs(distance[i]-ring.radius))*scale))*ring.alpha;alpha=1-(1-alpha)*(1-coverage);}
   contourError=Math.max(contourError,Math.abs(contour[i*4+3]-Math.round(alpha*255)));
  }
  const base=new Uint8ClampedArray(width*height*4),filtered=new Uint8ClampedArray(base.length),weights=new Float32Array(width*height);let state=37;
  for(let i=0;i<base.length;i++){state=Math.imul(state,1664525)+1013904223|0;base[i]=state>>>24;filtered[i]=state>>>16;}
  for(let i=0;i<weights.length;i++)weights[i]=[0,1,.5,.17,.999,1/255][i%6];
  const mix=a.gpuMixPixels(width,height,base,filtered,weights);let mixError=0;
  for(let i=0;i<weights.length;i++){const k=i*4,m=weights[i],alpha=base[k+3]*(1-m)+filtered[k+3]*m;mixError=Math.max(mixError,Math.abs(mix[k+3]-Math.round(alpha)));for(let c=0;c<3;c++){const expected=alpha?Math.round((base[k+c]*base[k+3]*(1-m)+filtered[k+c]*filtered[k+3]*m)/alpha):0;mixError=Math.max(mixError,Math.abs(mix[k+c]-expected));}}
  const after=a.getEffectAccelerationStatus();return {contourError,mixError,ripple:after.kinds.ripple.gpu-(before.kinds.ripple?.gpu||0),mix:after.kinds.composite.gpu-(before.kinds.composite?.gpu||0)};
 });assert.ok(result.contourError<=1,JSON.stringify(result));assert.ok(result.mixError<=1,JSON.stringify(result));assert.equal(result.ripple,1);assert.equal(result.mix,1);
});

test('a GPU filter followed by a failed composite finishes on CPU and reports mixed work',async()=>{
 const page=await session.context.newPage();try{
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(()=>{
   const a=allGpuApi,recipe={...a.createVisualEffects(),seed:271,layers:[a.makeVisualEffectLayer('duotone',{id:'mix-failure',opacity:.47})]},source={key:'mixed-source',draw(c){c.fillStyle='#ca3b75';c.fillRect(3,3,9,7);c.globalAlpha=.31;c.fillRect(5,10,9,4);c.globalAlpha=1;return {};}};
   const draw=()=>{const out=a.makeSurface({x:0,y:0,w:24,h:21},127);a.renderVisualEffects(out.ctx,{rect:{x:3,y:3,w:12,h:12},recipe,target:'art',source,dpi:127,cardRect:{w:24,h:21}});return Array.from(out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data);};
   const expected=draw(),read=WebGL2RenderingContext.prototype.readPixels;let reads=0;
   WebGL2RenderingContext.prototype.readPixels=function(...args){if(++reads===2)throw Error('simulated composite readback failure');return read.apply(this,args);};
   let actual;try{actual=draw();}finally{WebGL2RenderingContext.prototype.readPixels=read;}
   const status=a.getEffectAccelerationStatus();let error=0;for(let i=0;i<actual.length;i++)error=Math.max(error,Math.abs(actual[i]-expected[i]));return {reads,error,status};
  });assert.equal(result.reads,2);assert.ok(result.error<=1,JSON.stringify(result));assert.equal(result.status.reason,'gpu-render-failed');assert.ok(result.status.kinds.duotone.gpu>=2);assert.equal(result.status.kinds.composite.cpu,1);
 }finally{await page.close();}
});

test('complete native particle and GPU filter stacks preserve alpha and frozen frames at print resolution',async()=>{
 const results=[];
 for(const dpi of [150,300]){
  const outputs=[];
  for(const backend of ['cpu','gpu']){
   const page=await session.context.newPage();try{
    if(backend==='cpu')await page.evaluate(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    outputs.push(await page.evaluate(({dpi,backend})=>{
     const a=allGpuApi,recipe={...a.createVisualEffects(),seed:79,layers:['flame','smoke','ripple','outline','bevel','chromatic','grain'].map(kind=>a.makeVisualEffectLayer(kind,{id:'stack-'+kind,params:kind==='chromatic'?{mode:'channels'}:{}}))},source={key:'stack-source',draw(c){c.fillStyle='#d8793a';c.fillRect(3,3,12,15);c.clearRect(7,8,4,5);c.globalAlpha=.4;c.fillRect(1,5,5,8);return {};}};
     const draw=()=>{const out=a.makeSurface({x:0,y:0,w:20,h:22},dpi);a.renderVisualEffects(out.ctx,{rect:{x:3,y:3,w:12,h:15},recipe,target:'art',source,dpi,cardRect:{w:20,h:22},timeSec:1.2});return out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;};
     const first=draw(),repeat=draw();return {backend,pixels:Array.from(first),repeat:first.every((v,i)=>v===repeat[i]),status:a.getEffectAccelerationStatus()};
    },{dpi,backend}));
   }finally{await page.close();}
  }
  const [cpu,gpu]=outputs;let alpha=0,premul=0;
  for(let i=0;i<gpu.pixels.length;i+=4){alpha=Math.max(alpha,Math.abs(cpu.pixels[i+3]-gpu.pixels[i+3]));for(let k=0;k<3;k++)premul=Math.max(premul,Math.abs(cpu.pixels[i+k]*cpu.pixels[i+3]/255-gpu.pixels[i+k]*gpu.pixels[i+3]/255));}
  results.push({dpi,alpha,premul,cpuStable:cpu.repeat,gpuStable:gpu.repeat,gpuCalls:gpu.status.gpuRenders,cpuCalls:gpu.status.cpuRenders,ripple:gpu.status.kinds.ripple?.gpu,mixing:gpu.status.kinds.composite?.gpu||0});
 }
 await writeFile(`${qa}/effects-gpu-stacks.json`,JSON.stringify(results,null,2));
 for(const r of results){assert.equal(r.cpuStable,true);assert.equal(r.gpuStable,true);assert.ok(r.gpuCalls>0&&r.ripple>0,JSON.stringify(r));assert.equal(r.mixing,0,'full replacement filters need no extra mixing transfer');assert.equal(r.cpuCalls,0);assert.ok(r.alpha<=3&&r.premul<=3.1,JSON.stringify(r));}
});

test('GPU pixel filters preserve tiny, partial-alpha, neutral and 300 DPI inputs',async()=>{
 const results=await session.page.evaluate(kinds=>{
  const {makeSurface,applyEffectFilter,makeVisualEffectLayer,getEffectAccelerationStatus}=allGpuApi,read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,results=[];
  for(const [w,h,dpi] of [[1,1,300],[1,17,300],[19,1,150],[17,13,300],[221,173,300]]){
   const scale=dpi/25.4,source=makeSurface({x:-3.17,y:1.23,w:w/scale,h:h/scale},dpi),pixels=source.ctx.createImageData(w,h);let state=5921;
   for(let i=0;i<pixels.data.length;i++){state=Math.imul(state,1664525)+1013904223|0;pixels.data[i]=state>>>24;}
   for(let i=0;i<pixels.data.length;i+=4)if(i%28===0)pixels.data[i+3]=0;source.ctx.putImageData(pixels,0,0);
   for(const kind of kinds){
    const params=kind==='colorAdjust'?{hue:-120,saturation:1.8,brightness:.8}:kind==='chromatic'?{mode:'channels',angle:45,distance:.31}:kind==='outline'?{width:.31}:kind==='grain'?{size:.021,strength:.7}:kind==='bevel'||kind==='innerGlow'?{size:1.7,width:1.7}:{};
    const layer=makeVisualEffectLayer(kind,{id:'edge-'+kind,params,motion:{enabled:true,speed:1.7}}),options={seed:917,timeSec:3.73,rect:source.work},cpu=read(applyEffectFilter(source,layer,{...options,backend:'cpu'})),before=getEffectAccelerationStatus().gpuRenders,gpu=read(applyEffectFilter(source,layer,options));let alpha=0,color=0,bad=0;
    for(let i=0;i<gpu.length;i+=4){alpha=Math.max(alpha,Math.abs(gpu[i+3]-cpu[i+3]));let error=0;for(let k=0;k<3;k++)error=Math.max(error,Math.abs(cpu[i+k]*cpu[i+3]/255-gpu[i+k]*gpu[i+3]/255));color=Math.max(color,error);if(error>1.1)bad++;}
    results.push({kind,w,h,dpi,alpha,color,bad,gpu:getEffectAccelerationStatus().gpuRenders>before});
   }
  }
  return results;
 },kinds);
 await writeFile(`${qa}/effects-gpu-edge-parity.json`,JSON.stringify(results,null,2));
 for(const r of results){assert.equal(r.gpu,true,JSON.stringify(r));assert.ok(r.alpha<=1,JSON.stringify(r));assert.ok(r.bad<=Math.max(2,r.w*r.h*.002),JSON.stringify(r));}
});

test('unsupported GPU and allocation failure use the complete CPU result without retry storms',async()=>{
 for(const mode of ['unavailable','float','allocation']){
  const page=await session.context.newPage();try{
   await page.evaluate(mode=>{
    window.gpuAttempts=0;
    if(mode==='unavailable'){const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2'){gpuAttempts++;return null;}return get.call(this,type,...args);};}
    else if(mode==='float'){const get=WebGL2RenderingContext.prototype.getExtension;WebGL2RenderingContext.prototype.getExtension=function(name){if(name==='EXT_color_buffer_float'){gpuAttempts++;return null;}return get.call(this,name);};}
    else WebGL2RenderingContext.prototype.texStorage2D=function(){gpuAttempts++;throw Error('simulated allocation failure');};
   },mode);
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   const result=await page.evaluate(kinds=>{
    const {makeSurface,applyEffectFilter,makeVisualEffectLayer,getEffectAccelerationStatus}=allGpuApi,s=makeSurface({x:-2,y:-1,w:20,h:17},127),c=s.ctx;c.fillStyle='#df536a';c.fillRect(1,1,7,9);c.globalAlpha=.3;c.fillRect(10,3,3,8);
    const read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,results=[];
    for(const kind of kinds){const layer=makeVisualEffectLayer(kind,{id:'fallback-'+kind}),options={timeSec:2.1,seed:337},cpu=read(applyEffectFilter(s,layer,{...options,backend:'cpu'})),actual=read(applyEffectFilter(s,layer,options));results.push(actual.every((v,i)=>v===cpu[i]));}
    return {exact:results.every(Boolean),attempts:gpuAttempts,status:getEffectAccelerationStatus()};
   },kinds);assert.equal(result.exact,true,mode);assert.equal(result.attempts,1,mode);assert.equal(result.status.backend,'cpu',mode);assert.equal(result.status.gpuRenders,0,mode);
  }finally{await page.close();}
 }
});

test('lost contexts fall back exactly and restoration resumes GPU work with fresh resources',async()=>{
 const page=await session.context.newPage();try{
  await page.evaluate(()=>{const draw=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){window.effectGl=this;return draw.apply(this,args);};});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{const a=allGpuApi;window.contextFixture=a.makeSurface({x:-2,y:-1,w:24,h:21},150);contextFixture.ctx.fillStyle='#af376d';contextFixture.ctx.fillRect(1,1,13,14);a.applyEffectFilter(contextFixture,a.makeVisualEffectLayer('outline'));});
  await page.evaluate(()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('loss event absent')),5000);effectGl.canvas.addEventListener('webglcontextlost',()=>{clearTimeout(timer);resolve();},{once:true});window.effectLose=effectGl.getExtension('WEBGL_lose_context');effectLose.loseContext();}));
  const lost=await page.evaluate(kinds=>{
   const a=allGpuApi,read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;
   const exact=kinds.every(kind=>{const layer=a.makeVisualEffectLayer(kind,{id:'lost-'+kind}),cpu=read(a.applyEffectFilter(contextFixture,layer,{backend:'cpu'})),actual=read(a.applyEffectFilter(contextFixture,layer));return actual.every((v,i)=>v===cpu[i]);});return {exact,status:a.getEffectAccelerationStatus()};
  },kinds);assert.equal(lost.exact,true);assert.equal(lost.status.reason,'context-lost');assert.equal(lost.status.backend,'cpu');
  await page.evaluate(()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('restore event absent')),10000);effectGl.canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);resolve();},{once:true});effectLose.restoreContext();}));
  const restored=await page.evaluate(()=>{const a=allGpuApi;a.applyEffectFilter(contextFixture,a.makeVisualEffectLayer('bevel'));return a.getEffectAccelerationStatus();});assert.equal(restored.backend,'gpu');assert.equal(restored.reason,null);assert.equal(restored.gpuRenders,2);
 }finally{await page.close();}
});

test('context loss inside a multipass filter or readback returns a complete CPU frame and recovers',async()=>{
 for(const when of ['first-draw','last-draw','readback']){
  const page=await session.context.newPage();try{
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   const result=await page.evaluate(async when=>{
    const a=allGpuApi,source=a.makeSurface({x:-2,y:-1,w:21,h:17},127),c=source.ctx;c.fillStyle='#d56329';c.fillRect(1,1,11,10);c.clearRect(4,4,3,4);c.globalAlpha=.3;c.fillRect(12,3,3,8);
    const layer=a.makeVisualEffectLayer('bevel'),read=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data,expected=read(a.applyEffectFilter(source,layer,{backend:'cpu'})),p=WebGL2RenderingContext.prototype,draw=p.drawArrays,readback=p.readPixels;let draws=0,extension,lostEvent,lostCanvas;
    const lose=gl=>{if(extension)return;lostCanvas=gl.canvas;lostEvent=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('loss timeout')),5000);gl.canvas.addEventListener('webglcontextlost',()=>{clearTimeout(timer);resolve();},{once:true});});extension=gl.getExtension('WEBGL_lose_context');extension.loseContext();};
    p.drawArrays=function(...args){const out=draw.apply(this,args);draws++;if(when==='first-draw'&&draws===1||when==='last-draw'&&draws===3)lose(this);return out;};
    p.readPixels=function(...args){const out=readback.apply(this,args);if(when==='readback')lose(this);return out;};
    let actual;try{actual=read(a.applyEffectFilter(source,layer));}finally{p.drawArrays=draw;p.readPixels=readback;}
    await lostEvent;const failed=a.getEffectAccelerationStatus();
    // The loss event must finish dispatching before WEBGL_lose_context allows
    // restoration. An await continuation can still run inside that event.
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('restore timeout')),10000);lostCanvas.addEventListener('webglcontextrestored',()=>{clearTimeout(timer);resolve();},{once:true});setTimeout(()=>extension.restoreContext(),0);});
    a.applyEffectFilter(source,layer);return {when,draws,exact:actual.every((v,i)=>v===expected[i]),failed,restored:a.getEffectAccelerationStatus()};
   },when);assert.equal(result.exact,true,when);assert.equal(result.failed.reason,'context-lost');assert.equal(result.failed.gpuRenders,0);assert.equal(result.restored.backend,'gpu');assert.equal(result.restored.reason,null);assert.equal(result.restored.gpuRenders,1);
  }finally{await page.close();}
 }
});

test('size changes, mixed kernels and oversized jobs keep bounded targets and remain usable',async()=>{
 const page=await session.context.newPage();try{
  await page.evaluate(()=>{
   window.gpuContexts=0;window.liveTextures=new Set();window.maxTextures=0;const get=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl2')gpuContexts++;return get.call(this,type,...args);};
   const p=WebGL2RenderingContext.prototype,create=p.createTexture,remove=p.deleteTexture;p.createTexture=function(){const t=create.call(this);liveTextures.add(t);maxTextures=Math.max(maxTextures,liveTextures.size);return t;};p.deleteTexture=function(t){liveTextures.delete(t);return remove.call(this,t);};
  });await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(()=>{
   const a=allGpuApi,outputs=[];for(const [w,h] of [[19,31],[19,31],[8,5],[1,1],[128,97]])for(const kind of ['outline','foil','innerShadow','grain','extrude']){
    const source=a.makeSurface({x:0,y:0,w:w/5,h:h/5},127);source.ctx.fillStyle='#9d3178';source.ctx.fillRect(0,0,w/10,h/10);const before=a.getEffectAccelerationStatus().gpuRenders;a.applyEffectFilter(source,a.makeVisualEffectLayer(kind));outputs.push(a.getEffectAccelerationStatus().gpuRenders>before);
   }
   const tooBig=a.runGpuEffect({kind:'oversized',width:99999,height:1,data:new Uint8ClampedArray(),passes:[]}),reason=a.getEffectAccelerationStatus().reason;
   const source=a.makeSurface({x:0,y:0,w:13,h:11},127);source.ctx.fillRect(2,2,5,4);a.applyEffectFilter(source,a.makeVisualEffectLayer('duotone'));
   return {outputs,tooBig,reason,status:a.getEffectAccelerationStatus(),contexts:gpuContexts,maxTextures,live:liveTextures.size};
  });assert.ok(result.outputs.every(Boolean));assert.equal(result.tooBig,null);assert.equal(result.reason,'job-too-large');assert.equal(result.status.backend,'gpu');assert.equal(result.status.reason,null);assert.equal(result.contexts,1);assert.ok(result.maxTextures<=7,JSON.stringify(result));assert.ok(result.live<=7,JSON.stringify(result));
 }finally{await page.close();}
});
