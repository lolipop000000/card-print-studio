import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`
 import {makeSurface,paintSurface} from './src/render/effects/masks.js';
 import {applyEffectFilter} from './src/render/effects/filters.js';
 import {makeVisualEffectLayer,createVisualEffects} from './src/model/visual-effects.js';
 import {renderVisualEffects} from './src/render/effects/composite.js';
 import {getEffectAccelerationStatus} from './src/render/effects/gpu-runtime.js';
 window.performanceApi={makeSurface,paintSurface,applyEffectFilter,makeVisualEffectLayer,createVisualEffects,renderVisualEffects,getEffectAccelerationStatus};
`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});});
after(async()=>{await session?.browser.close();});

test('complete normal filters preserve exact frozen pixels with one GPU readback per filter',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=performanceApi,results=[],view={x:0,y:0,w:63,h:88},work={x:-12,y:-12,w:87,h:112},rect={x:17,y:29,w:22,h:6};
  const draw=c=>{c.fillStyle='#c74b79';c.fillRect(17,29,22,6);c.clearRect(21,30,4,2);c.fillStyle='rgba(57,158,207,.25)';c.fillRect(27,34,7,3);return {fontPt:12};};
  const hash=s=>{const bytes=s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;let h=2166136261;for(const value of bytes)h=Math.imul(h^value,16777619);return h>>>0;};
  for(const dpi of [150,300,237])for(const kind of ['colorAdjust','outline','erode','bevel','directionalBlur']){
   const layer=a.makeVisualEffectLayer(kind,{id:'replacement-'+kind,protectText:false,params:kind==='colorAdjust'?{hue:37,saturation:1.4,brightness:1.1}:{}}),source=a.makeSurface(work,dpi);draw(source.ctx);
   const filtered=a.applyEffectFilter(source,layer,{rect,seed:71,timeSec:1.2}),expected=a.makeSurface(view,dpi);a.paintSurface(expected.ctx,filtered);
   let readbacks=0;const read=WebGL2RenderingContext.prototype.readPixels;WebGL2RenderingContext.prototype.readPixels=function(...args){readbacks++;return read.apply(this,args);};
   const out=a.makeSurface(view,dpi);try{a.renderVisualEffects(out.ctx,{rect,recipe:{...a.createVisualEffects(),seed:71,layers:[layer]},target:'text',source:{key:'replacement-'+dpi+'-'+kind,draw},dpi,cardRect:view,timeSec:1.2});}finally{WebGL2RenderingContext.prototype.readPixels=read;}
   results.push({dpi,kind,readbacks,exact:hash(out)===hash(expected)});
  }return results;
 });
 for(const result of results){assert.equal(result.exact,true,JSON.stringify(result));assert.equal(result.readbacks,1,JSON.stringify(result));}
 assert.deepEqual(session.pageErrors,[]);assert.deepEqual(session.httpRequests,[]);
});

test('small text filters transfer occupied pixels while retaining full-card shader coordinates and alpha',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=performanceApi,results=[],kinds=['colorAdjust','posterize','halftone','scanlines','grain','duotone','foil','holographic'];
  const pixels=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;
  const hash=bytes=>{let h=2166136261;for(const value of bytes)h=Math.imul(h^value,16777619);return h>>>0;};
  for(const dpi of [150,300,237]){
   const source=a.makeSurface({x:-12,y:-12,w:87,h:112},dpi),c=source.ctx;c.fillStyle='rgba(209,73,112,.27)';c.fillRect(17.31,29.17,21.39,4.71);c.fillStyle='#4078ad';c.fillRect(19.57,29.83,8.13,3.37);c.clearRect(21.09,30.11,2.73,1.41);
   const unchanged=hash(pixels(source));
   for(const kind of kinds){
    const layer=a.makeVisualEffectLayer(kind,{id:'bounded-'+kind,motion:{enabled:true,speed:1.3},params:kind==='colorAdjust'?{hue:71,saturation:1.2,brightness:.9}:{}}),options={rect:{x:17.31,y:29.17,w:21.39,h:4.71},seed:791,timeSec:12.35};
    const cpu=pixels(a.applyEffectFilter(source,layer,{...options,backend:'cpu'}));let transferred=0,readbacks=0;
    const read=WebGL2RenderingContext.prototype.readPixels;WebGL2RenderingContext.prototype.readPixels=function(x,y,w,h,...args){transferred+=w*h;readbacks++;return read.call(this,x,y,w,h,...args);};
    let result;try{result=a.applyEffectFilter(source,layer,options);}finally{WebGL2RenderingContext.prototype.readPixels=read;}
    const actual=pixels(result),repeat=pixels(a.applyEffectFilter(source,layer,options));let alpha=0,color=0;
    for(let i=0;i<actual.length;i+=4){alpha=Math.max(alpha,Math.abs(actual[i+3]-cpu[i+3]));for(let k=0;k<3;k++)color=Math.max(color,Math.abs(actual[i+k]*actual[i+3]/255-cpu[i+k]*cpu[i+3]/255));}
    // A pointwise filter cannot be influenced by distant corner pixels. Two
    // sentinels force a full-size reference job on the same GPU, so this checks
    // exact original coordinate/alpha behavior without a device-specific hash.
    const unbounded=a.makeSurface({...source.work},dpi),image=unbounded.ctx.createImageData(source.canvas.width,source.canvas.height);image.data.set(pixels(source));image.data.set([113,57,199,255],0);image.data.set([57,199,113,255],image.data.length-4);unbounded.ctx.putImageData(image,0,0);
    const reference=pixels(a.applyEffectFilter(unbounded,layer,options)),exact=actual.every((value,index)=>index<4||index>=actual.length-4||value===reference[index]);
    results.push({dpi,kind,readbacks,transferred,full:source.canvas.width*source.canvas.height,alpha,color,hash:hash(actual),exact,repeat:hash(actual)===hash(repeat),untouched:unchanged===hash(pixels(source)),work:JSON.stringify(source.work)===JSON.stringify(result.work)});
   }
  }return results;
 });
 await writeFile(`${qa}/effects-interaction-performance.json`,JSON.stringify(results,null,2));
 for(const result of results){assert.equal(result.exact,true,JSON.stringify(result));assert.equal(result.readbacks,1,JSON.stringify(result));assert.ok(result.transferred<result.full/8,JSON.stringify(result));assert.ok(result.alpha<=1,JSON.stringify(result));assert.equal(result.repeat,true,JSON.stringify(result));assert.equal(result.untouched,true,JSON.stringify(result));assert.equal(result.work,true,JSON.stringify(result));}
 assert.deepEqual(session.pageErrors,[]);
});
