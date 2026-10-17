import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const hasFilters=existsSync(new URL('../src/render/effects/filters.js',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import * as masks from './src/render/effects/masks.js'; ${hasFilters?"import * as filters from './src/render/effects/filters.js';":'const filters={};'} window.filterApi={...masks,...filters};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
const kinds=['outline','glow','shadow','gradient','sweep','pixelate','blur','colorAdjust','posterize','halftone','chromatic','waveDistort','erode'];
async function openFilter(){
 const result=await openHarness();await result.page.addScriptTag({content:bundle.outputFiles[0].text});
 await result.page.evaluate(()=>{
  window.filterPixels=surface=>surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height).data;
  window.filterHash=surface=>{let h=2166136261;for(const value of filterPixels(surface))h=Math.imul(h^value,16777619);return h>>>0;};
  window.filterLayer=(kind,params={})=>({id:'test-'+kind,kind,opacity:1,protectText:true,motion:{enabled:false,speed:1},params});
  window.filterFixture=()=>{
   const surface=filterApi.makeSurface({x:-4,y:-3,w:28,h:23},127),c=surface.ctx;
   const gradient=c.createLinearGradient(1,0,18,16);gradient.addColorStop(0,'#ef7133');gradient.addColorStop(.5,'#4775d5');gradient.addColorStop(1,'#12ba8d');
   c.fillStyle=gradient;c.fillRect(2,2,13,10);c.clearRect(7,7,3,5);c.fillStyle='#c72c83';c.fillRect(17,7,2,4);c.globalAlpha=.35;c.fillStyle='#e46424';c.fillRect(4,14,5,2);c.globalAlpha=1;return surface;
  };
 });return result;
}

test('filter returns an independent surface at the source work area and resolution',async()=>{
 const {browser,page,pageErrors}=await openFilter();try{
  assert.equal(await page.evaluate(()=>typeof filterApi.applyEffectFilter),'function','standalone sequential filter API is available');
  const result=await page.evaluate(()=>{
   const work={x:-4,y:-3,w:24,h:18},source=filterApi.makeSurface(work,127);source.ctx.fillStyle='#dc601e';source.ctx.fillRect(2,2,6,5);
   const before=filterPixels(source),output=filterApi.applyEffectFilter(source,filterLayer('blur',{radius:0}),{rect:{x:2,y:2,w:6,h:5}}),after=filterPixels(source);
   return {newSurface:output!==source&&output.canvas!==source.canvas,work:output.work,dpi:output.dpi,scale:output.scale,size:[output.canvas.width,output.canvas.height],unchanged:before.every((v,i)=>v===after[i])};
  });
  assert.deepEqual(result,{newSurface:true,work:{x:-4,y:-3,w:24,h:18},dpi:127,scale:5,size:[120,90],unchanged:true});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('every enabled filter visibly processes the accumulator and stays deterministic',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openFilter();try{
  const results=await page.evaluate(kinds=>kinds.map(kind=>{
   const source=filterFixture(),original=filterHash(source),layer=filterLayer(kind,kind==='colorAdjust'?{hue:42,saturation:.45,brightness:1.25}:{}),options={rect:{x:2,y:2,w:13,h:10},timeSec:1.2,seed:29};
   const a=filterApi.applyEffectFilter(source,layer,options),b=filterApi.applyEffectFilter(source,layer,options),pixels=filterPixels(a);
   return {kind,changed:filterHash(a)!==original,deterministic:filterHash(a)===filterHash(b),untouched:filterHash(source)===original,visible:pixels.some((v,i)=>i%4===3&&v>0),transparentCorner:pixels[3]===0};
  }),kinds);
  for(const result of results){assert.equal(result.changed,true,result.kind+' visibly changes colored alpha');assert.equal(result.deterministic,true,result.kind);assert.equal(result.untouched,true,result.kind);assert.equal(result.visible,true,result.kind);assert.equal(result.transparentCorner,true,result.kind);}
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('zero distance radius strength and neutral color limits preserve pixels exactly',async()=>{
 const {browser,page}=await openFilter();try{
  const results=await page.evaluate(()=>{
   const source=filterFixture(),before=filterHash(source),cases=[['outline',{width:0}],['glow',{strength:0}],['glow',{radius:0}],['shadow',{offsetX:0,offsetY:0,blur:0}],['gradient',{strength:0}],['sweep',{strength:0}],['pixelate',{size:0}],['blur',{radius:0}],['colorAdjust',{hue:0,saturation:1,brightness:1}],['chromatic',{distance:0}],['waveDistort',{amplitude:0}],['erode',{depth:0}]];
   return cases.map(([kind,params])=>({kind,unchanged:filterHash(filterApi.applyEffectFilter(source,filterLayer(kind,params)))===before}));
  });for(const result of results)assert.equal(result.unchanged,true,result.kind);
 }finally{await browser.close();}
});

test('outline glow and shadow add alpha around current pixels while preserving the original',async()=>{
 const {browser,page}=await openFilter();try{
  const results=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:20,h:20},127);source.ctx.fillStyle='#34bc72';source.ctx.fillRect(8,8,4,4);
   const at=(surface,x,y)=>Array.from(surface.ctx.getImageData(Math.floor(x*5),Math.floor(y*5),1,1).data);
   return [['outline',{color:'#e02a17',width:1},7.5,10],['glow',{color:'#e02a17',radius:1,strength:1},7.5,10],['shadow',{color:'#e02a17',offsetX:2,offsetY:-2,blur:0},13,7]].map(([kind,params,x,y])=>{
    const output=filterApi.applyEffectFilter(source,filterLayer(kind,params));return {kind,center:at(output,10,10),outside:at(output,x,y)};
   });
  });for(const result of results){assert.deepEqual(result.center,[52,188,114,255],result.kind);assert.ok(result.outside[3]>5,result.kind+' uses full alpha silhouette');assert.ok(result.outside[0]>result.outside[1],result.kind+' uses selected color');}
 }finally{await browser.close();}
});

test('gradient and sweep retain alpha and ignore compositor owned layer opacity and protection',async()=>{
 const {browser,page}=await openFilter();try{
  const results=await page.evaluate(()=>['gradient','sweep'].map(kind=>{
   const source=filterFixture(),before=filterPixels(source),layer=filterLayer(kind),options={rect:{x:2,y:2,w:17,h:14},timeSec:1.2};
   const first=filterApi.applyEffectFilter(source,layer,options),second=filterApi.applyEffectFilter(source,{...layer,opacity:0,scope:'outside',protectText:false},options),after=filterPixels(first);
   return {kind,sameAlpha:before.every((v,i)=>i%4!==3||v===after[i]),sameResult:filterHash(first)===filterHash(second)};
  }));for(const result of results){assert.equal(result.sameAlpha,true,result.kind);assert.equal(result.sameResult,true,result.kind);}
 }finally{await browser.close();}
});

test('blur interpolates translucent color without dark or colored transparent fringes',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:14,h:14},127);source.ctx.fillStyle='#ff0000';source.ctx.fillRect(5,5,4,4);
   const output=filterApi.applyEffectFilter(source,filterLayer('blur',{radius:.8})),pixels=filterPixels(output);let fringe=0,uncolored=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>3&&pixels[i+3]<250){fringe++;if(pixels[i]<250||pixels[i+1]>1||pixels[i+2]>1)uncolored++;}
   return {fringe,uncolored,corner:pixels[3]};
  });assert.ok(result.fringe>80);assert.equal(result.uncolored,0);assert.equal(result.corner,0);
 }finally{await browser.close();}
});

test('color adjustment and posterize quantize unassociated RGB while preserving source alpha',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:6,h:6},127);source.ctx.fillStyle='rgb(201,101,51)';source.ctx.fillRect(1,1,4,4);
   const sample=layer=>Array.from(filterApi.applyEffectFilter(source,layer).ctx.getImageData(15,15,1,1).data);
   return {gray:sample(filterLayer('colorAdjust',{saturation:0})),black:sample(filterLayer('colorAdjust',{brightness:0})),poster:sample(filterLayer('posterize',{levels:4}))};
  });assert.deepEqual(result.gray,[119,119,119,255]);assert.deepEqual(result.black,[0,0,0,255]);assert.deepEqual(result.poster,[170,85,85,255]);
 }finally{await browser.close();}
});

test('pixelation uses physical millimeter cells across content outside the target rectangle',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:12,h:12},127);source.ctx.fillStyle='#20a060';source.ctx.fillRect(8,8,.2,.2);
   const output=filterApi.applyEffectFilter(source,filterLayer('pixelate',{size:1}),{rect:{x:1,y:1,w:2,h:2}}),pixels=filterPixels(output),alphas=[];
   for(let y=40;y<45;y++)for(let x=40;x<45;x++)alphas.push(pixels[(y*60+x)*4+3]);
   return {alphas,changed:filterHash(output)!==filterHash(source),outside:pixels[(39*60+40)*4+3]};
  });assert.equal(result.changed,true);assert.ok(result.alphas[0]>0);assert.equal(new Set(result.alphas).size,1);assert.equal(result.outside,0);
 }finally{await browser.close();}
});

test('halftone makes rotated dot coverage inside the existing silhouette',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:18,h:18},127);source.ctx.fillStyle='#242424';source.ctx.fillRect(3,3,12,12);
   const a=filterApi.applyEffectFilter(source,filterLayer('halftone',{size:1,angle:0})),b=filterApi.applyEffectFilter(source,filterLayer('halftone',{size:1,angle:45})),pixels=filterPixels(a);let hole=0,dot=0,outside=0;
   for(let y=0;y<90;y++)for(let x=0;x<90;x++){const alpha=pixels[(y*90+x)*4+3];if(x>20&&x<70&&y>20&&y<70){if(alpha===0)hole++;if(alpha>230)dot++;}if((x<15||x>=75||y<15||y>=75)&&alpha)outside++;}
   return {hole,dot,outside,rotates:filterHash(a)!==filterHash(b)};
  });assert.ok(result.hole>20);assert.ok(result.dot>20);assert.equal(result.outside,0);assert.equal(result.rotates,true);
 }finally{await browser.close();}
});

test('chromatic displacement separates red and blue channels in millimeters',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:16,h:14},127);source.ctx.fillStyle='#ff00ff';source.ctx.fillRect(5,5,4,4);
   const output=filterApi.applyEffectFilter(source,filterLayer('chromatic',{distance:1,angle:0})),at=(x,y)=>Array.from(output.ctx.getImageData(x*5,y*5,1,1).data);
   return {left:at(4.4,7),middle:at(7,7),right:at(9.4,7),corner:at(0,0)};
  });assert.deepEqual(result.left,[0,0,255,255]);assert.deepEqual(result.middle,[255,0,255,255]);assert.deepEqual(result.right,[255,0,0,255]);assert.deepEqual(result.corner,[0,0,0,0]);
 }finally{await browser.close();}
});

test('wave distortion samples current pixels and explicit motion time deterministically',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterFixture(),layer={...filterLayer('waveDistort',{amplitude:1,wavelength:5}),motion:{enabled:true,speed:1}},draw=timeSec=>filterApi.applyEffectFilter(source,layer,{timeSec});
   return {changed:filterHash(draw(1.2))!==filterHash(source),same:filterHash(draw(1.2))===filterHash(draw(1.2)),moves:filterHash(draw(1.2))!==filterHash(draw(2.1))};
  });assert.deepEqual(result,{changed:true,same:true,moves:true});
 }finally{await browser.close();}
});

test('erosion removes outer and hole edges with fixed seed roughness',async()=>{
 const {browser,page}=await openFilter();try{
  const result=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:20,h:20},127);source.ctx.fillStyle='#53bf9e';source.ctx.fillRect(3,3,14,14);source.ctx.clearRect(8,8,4,4);
   const draw=(roughness,seed)=>filterApi.applyEffectFilter(source,filterLayer('erode',{depth:1,roughness}),{seed}),plain=draw(0,9),at=(x,y)=>plain.ctx.getImageData(x*5,y*5,1,1).data[3];
   return {outer:at(3.4,6),hole:at(7.6,10),middle:at(5,5),same:filterHash(draw(.9,9))===filterHash(draw(.9,9)),seeded:filterHash(draw(.9,9))!==filterHash(draw(.9,19))};
  });assert.deepEqual(result,{outer:0,hole:0,middle:255,same:true,seeded:true});
 }finally{await browser.close();}
});

test('all filters leave completely transparent accumulators empty',async()=>{
 const {browser,page}=await openFilter();try{
  const results=await page.evaluate(kinds=>{
   const source=filterApi.makeSurface({x:-2,y:-2,w:16,h:16},127);return kinds.map(kind=>({kind,empty:filterPixels(filterApi.applyEffectFilter(source,filterLayer(kind),{rect:{x:1,y:1,w:8,h:8}})).every(value=>value===0)}));
  },kinds);for(const result of results)assert.equal(result.empty,true,result.kind);
 }finally{await browser.close();}
});

test('fractional outline width expands an opaque edge by the requested pixel coverage',async()=>{
 const {browser,page}=await openFilter();try{
  const alpha=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:10,h:10},127);source.ctx.fillStyle='#d84720';source.ctx.fillRect(3,3,4,4);
   return filterApi.applyEffectFilter(source,filterLayer('outline',{width:.05})).ctx.getImageData(14,25,1,1).data[3];
  });assert.equal(alpha,64);
 }finally{await browser.close();}
});

test('fractional erosion depth reduces an opaque edge continuously from zero',async()=>{
 const {browser,page}=await openFilter();try{
  const alpha=await page.evaluate(()=>{
   const source=filterApi.makeSurface({x:0,y:0,w:10,h:10},127);source.ctx.fillStyle='#d84720';source.ctx.fillRect(3,3,4,4);
   return filterApi.applyEffectFilter(source,filterLayer('erode',{depth:.05,roughness:0})).ctx.getImageData(15,25,1,1).data[3];
  });assert.equal(alpha,191);
 }finally{await browser.close();}
});
