import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`
 import {makeSurface} from './src/render/effects/masks.js';
 import {applyEffectFilter} from './src/render/effects/filters.js';
 import {makeVisualEffectLayer,createVisualEffects} from './src/model/visual-effects.js';
 import {renderVisualEffects} from './src/render/effects/composite.js';
 import {getEffectAccelerationStatus} from './src/render/effects/gpu-runtime.js';
 window.effectsBenchmark={makeSurface,applyEffectFilter,makeVisualEffectLayer,createVisualEffects,renderVisualEffects,getEffectAccelerationStatus};
 `,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
const kinds=['colorAdjust','posterize','halftone','chromatic','outline','erode','innerGlow','innerShadow','bevel','extrude','foil','holographic','glitch','scanlines','grain','duotone','directionalBlur','displacement'];
const session=await openHarness();
try{
 await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 const cdp=await session.browser.newBrowserCDPSession(),info=await cdp.send('SystemInfo.getInfo');await cdp.detach();
 const filters=await session.page.evaluate(kinds=>{
  const a=effectsBenchmark,median=xs=>xs.toSorted((x,y)=>x-y)[Math.floor(xs.length/2)],results=[];
  for(const dpi of [150,300]){
   const source=a.makeSurface({x:-12,y:-12,w:87,h:112},dpi),c=source.ctx,g=c.createLinearGradient(0,0,63,88);g.addColorStop(0,'#e46b36');g.addColorStop(.5,'#5165d1');g.addColorStop(1,'#26ba91');c.fillStyle=g;c.fillRect(2,2,59,84);c.clearRect(19,29,21,16);c.globalAlpha=.27;c.fillRect(-2,-2,7,8);c.globalAlpha=1;
   for(const kind of kinds){
    const layer=a.makeVisualEffectLayer(kind,{id:'bench-'+kind,params:kind==='colorAdjust'?{hue:37,saturation:1.4,brightness:1.1}:kind==='chromatic'?{mode:'channels'}:{}}),options={rect:{x:2,y:2,w:59,h:84},seed:219,timeSec:2.3};
    const cpu=()=>a.applyEffectFilter(source,layer,{...options,backend:'cpu'}),gpu=()=>a.applyEffectFilter(source,layer,options),start=performance.now();gpu();const coldMs=performance.now()-start;cpu();gpu();
    const before=a.getEffectAccelerationStatus(),cpuSamples=[],gpuSamples=[];
    for(let i=0;i<7;i++)for(const [samples,run] of i%2?[[gpuSamples,gpu],[cpuSamples,cpu]]:[[cpuSamples,cpu],[gpuSamples,gpu]]){const start=performance.now();run();samples.push(performance.now()-start);}
    const cpuMs=median(cpuSamples),gpuMs=median(gpuSamples);results.push({kind,dpi,coldMs,cpuMs,gpuMs,speedup:cpuMs/gpuMs,gpuRenders:a.getEffectAccelerationStatus().gpuRenders-before.gpuRenders,cpuSamples,gpuSamples});
   }
  }return {results,status:a.getEffectAccelerationStatus(),userAgent:navigator.userAgent};
 },kinds);
 const stack=[];
 for(const backend of ['cpu','gpu']){
  const page=await session.context.newPage();try{
   if(backend==='cpu')await page.evaluate(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});
   await page.addScriptTag({content:bundle.outputFiles[0].text});
   stack.push(await page.evaluate(backend=>{
    const a=effectsBenchmark,recipe={...a.createVisualEffects(),seed:79,layers:['flame','smoke','ripple','outline','bevel','chromatic','grain'].map(kind=>a.makeVisualEffectLayer(kind,{id:'stack-'+kind,params:kind==='chromatic'?{mode:'channels'}:{}}))};
    const source={key:'benchmark-stack',draw(c){c.fillStyle='#d8793a';c.fillRect(8,12,44,62);c.clearRect(21,29,14,19);c.globalAlpha=.4;c.fillRect(3,18,9,23);return {};}};
    const draw=()=>{const out=a.makeSurface({x:0,y:0,w:63,h:88},300);a.renderVisualEffects(out.ctx,{rect:{x:8,y:12,w:44,h:62},recipe,target:'art',source,dpi:300,cardRect:{w:63,h:88},timeSec:1.2});return out;};
    const start=performance.now();draw();const coldMs=performance.now()-start;draw();const samples=[];
    for(let i=0;i<7;i++){const start=performance.now();draw();samples.push(performance.now()-start);}const output=draw(),bytes=output.ctx.getImageData(0,0,output.canvas.width,output.canvas.height).data;let hash=2166136261;
    for(const value of bytes)hash=Math.imul(hash^value,16777619);return {backend,coldMs,samples,medianMs:samples.toSorted((x,y)=>x-y)[3],hash:hash>>>0,status:a.getEffectAccelerationStatus(),size:[output.canvas.width,output.canvas.height]};
   },backend));
  }finally{await page.close();}
 }
 const result={...filters,stack,gpuInfo:info.gpu,pageErrors:session.pageErrors,httpRequests:session.httpRequests};
 await writeFile(`${qa}/effects-gpu-benchmark.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({renderer:filters.status.renderer,featureStatus:info.gpu.featureStatus,filters:filters.results.map(({cpuSamples,gpuSamples,...r})=>r),stack:stack.map(({samples,status,...r})=>({...r,status}))},null,2));
 if(session.pageErrors.length||session.httpRequests.length||filters.results.some(r=>r.gpuRenders!==7)||!stack[1].status.gpuRenders)throw Error('Benchmark did not exercise actual production GPU output');
}finally{await session.browser.close();}
