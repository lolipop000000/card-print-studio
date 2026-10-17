import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import {makeSurface} from './src/render/effects/masks.js'; import {applyCreativeFilter as dispatch} from './src/render/effects/creative-filters.js'; import {referenceBloom,bloomFixture} from './tests/bloom-performance-reference.mjs'; const applyCreativeFilter=(surface,layer,options={})=>dispatch(surface,layer,{...options,bloomBackend:'cpu'}); window.bloomTestApi={makeSurface,applyCreativeFilter,referenceBloom,bloomFixture};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});});
after(async()=>{await session?.browser.close();});

test('CPU fallback bloom preserves baseline RGBA across print, tint, threshold, transparency and tiny canvases',async()=>{
 const results=await session.page.evaluate(()=>{
  const {makeSurface,applyCreativeFilter,referenceBloom,bloomFixture}=bloomTestApi;
  const bytes=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;
  const compare=(name,s,p)=>{
   const original=bytes(s),expected=referenceBloom(s,p),actual=applyCreativeFilter(s,{kind:'bloom',params:p},{timeSec:42,seed:729}),a=bytes(actual),b=bytes(expected),after=bytes(s);
   let mismatches=0,maxDifference=0,sourceChanges=0;
   for(let i=0;i<a.length;i++){if(a[i]!==b[i]){mismatches++;maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[i]));}if(original[i]!==after[i])sourceChanges++;}
   return {name,mismatches,maxDifference,sourceChanges,independent:actual!==s&&actual.canvas!==s.canvas&&actual.work!==s.work,sameMetadata:actual.dpi===s.dpi&&JSON.stringify(actual.work)===JSON.stringify(s.work),size:[actual.canvas.width,actual.canvas.height]};
  };
  const results=[],params=[{}, {radius:0}, {strength:0}, {radius:.01,threshold:0,knee:0,strength:3,color:'#f0a'}, {radius:.3,threshold:.8,knee:.6,strength:.1,color:'#20ff90'}, {radius:2,threshold:.55,knee:0,strength:2,color:'#ff2080'}, {radius:12,threshold:0,knee:1,strength:3}, {radius:12,threshold:1,knee:0}, {radius:2,threshold:1,knee:1,color:'#000000'}, {radius:Infinity,strength:NaN,threshold:NaN,knee:Infinity,color:'bad'}, {radius:90,threshold:-4,knee:9,strength:20,color:'#abc'}];
  for(const [w,h] of [[1,1],[1,19],[17,1],[4,3],[113,79]]){
   const dpi=300,scale=dpi/25.4,s=makeSurface({x:-2.3,y:1.7,w:w/scale,h:h/scale},dpi),pixels=s.ctx.createImageData(w,h);let state=5921;
   for(let i=0;i<pixels.data.length;i++){state=Math.imul(state,1664525)+1013904223|0;pixels.data[i]=state>>>24;}
   // Include exact transparent and dark samples among translucent bright ink.
   for(let i=0;i<pixels.data.length;i+=28)pixels.data[i+3]=0;
   s.ctx.putImageData(pixels,0,0);
   for(const [i,p] of params.entries())results.push(compare(`${w}x${h}:case-${i}`,s,p));
  }
  for(const dpi of [150,300]){
   for(const dense of [false,true])results.push(compare(`${dpi}dpi:${dense?'dense':'sparse'}`,bloomFixture(dpi,dense),{radius:2,color:'#ffa0d8'}));
   results.push(compare(`${dpi}dpi:maximum-radius`,bloomFixture(dpi),{radius:12,strength:3}));
  }
  const empty=makeSurface({x:0,y:0,w:15,h:15},300);
  results.push(compare('transparent',empty,{radius:12,strength:3}));
  empty.ctx.fillStyle='#101010';empty.ctx.fillRect(0,0,15,15);results.push(compare('dark',empty,{radius:12,strength:3}));
  empty.ctx.clearRect(0,0,15,15);empty.ctx.globalAlpha=.25;empty.ctx.fillStyle='#ffffff';empty.ctx.fillRect(5,5,5,5);results.push(compare('same-canvas-mutated',empty,{radius:2,threshold:.8,knee:0}));
  return results;
 });
 for(const item of results){assert.equal(item.mismatches,0,`${item.name}: ${item.mismatches} channels differ by up to ${item.maxDifference}`);assert.equal(item.sourceChanges,0,item.name+' leaves input untouched');assert.equal(item.independent,true,item.name+' has an independent accumulator');assert.equal(item.sameMetadata,true,item.name+' preserves print geometry');}
 assert.deepEqual(session.pageErrors,[]);assert.deepEqual(session.httpRequests,[]);
});

test('bloom static output repeats independently of time, seed and caller opacity',async()=>{
 const result=await session.page.evaluate(()=>{
  const {bloomFixture,applyCreativeFilter}=bloomTestApi,s=bloomFixture(300),params={radius:2,strength:1.4,threshold:.55,knee:.35,color:'#ef8aff'},layer={kind:'bloom',params};
  const a=applyCreativeFilter(s,{...layer,opacity:0,scope:'outside'},{timeSec:0,seed:1}),b=applyCreativeFilter(s,{...layer,opacity:1,scope:'inside'},{timeSec:108,seed:2000}),pa=a.ctx.getImageData(0,0,a.canvas.width,a.canvas.height).data,pb=b.ctx.getImageData(0,0,b.canvas.width,b.canvas.height).data;
  return pa.every((value,i)=>value===pb[i]);
 });
 assert.equal(result,true);
});

test('cropped bloom retains the complete fractional halo at interior and clipped work edges',async()=>{
 const results=await session.page.evaluate(()=>{
  const {makeSurface,applyCreativeFilter,referenceBloom}=bloomTestApi,results=[];
  for(const [w,h] of [[169,151],[320,291]])for(const [px,py] of [[0,0],[1,74],[83,70],[165,149]])for(const radius of [.001,.085,.127,.254,.31,.5,1,3,12]){
   const dpi=300,scale=dpi/25.4,s=makeSurface({x:-12,y:-12,w:w/scale,h:h/scale},dpi),image=s.ctx.createImageData(w,h);
   // Dark translucent ink outside the halo must survive copying; bright colors
   // and unequal alpha force every blur channel to retain its own rolling sum.
   for(let i=0;i<image.data.length;i+=4){image.data[i]=13;image.data[i+1]=31;image.data[i+2]=7;image.data[i+3]=i%28?19:0;}
   for(let y=py;y<Math.min(h,py+3);y++)for(let x=px;x<Math.min(w,px+5);x++){const at=(y*w+x)*4;image.data.set([255,184+x%72,132+y%112,47+x*3%209],at);}
   s.ctx.putImageData(image,0,0);
   const params={radius,threshold:.25,knee:.6,strength:2.7,color:'#70d0ff'},expected=referenceBloom(s,params),actual=applyCreativeFilter(s,{kind:'bloom',params}),a=actual.ctx.getImageData(0,0,w,h).data,b=expected.ctx.getImageData(0,0,w,h).data;
   let mismatches=0,maxDifference=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i]){mismatches++;maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[i]));}
   results.push({name:`${w}x${h}:(${px},${py}),radius=${radius}`,mismatches,maxDifference});
  }
  return results;
 });
 for(const item of results)assert.equal(item.mismatches,0,`${item.name}: ${item.mismatches} channels differ by up to ${item.maxDifference}`);
 assert.deepEqual(session.pageErrors,[]);assert.deepEqual(session.httpRequests,[]);
});
