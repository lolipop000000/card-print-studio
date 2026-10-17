import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import {makeSurface} from './src/render/effects/masks.js'; import {applyEffectFilter} from './src/render/effects/filters.js'; window.chromaticApi={makeSurface,applyEffectFilter};",resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
async function open(){const result=await openHarness();await result.page.addScriptTag({content:bundle.outputFiles[0].text});return result;}

test('automatic chromatic fringing is visible on black and dark Korean without changing opaque source ink',async()=>{
 const {browser,page,pageErrors}=await open();try{
  const cases=await page.evaluate(async()=>{
   await document.fonts.ready;
   return ['#000000','#18252e'].map(color=>{
    const source=chromaticApi.makeSurface({x:0,y:0,w:48,h:18},150);source.ctx.font='bold 5px sans-serif';source.ctx.fillStyle=color;source.ctx.fillText('한글 색수차',5,11);
    const before=source.ctx.getImageData(0,0,source.canvas.width,source.canvas.height).data;
    const output=chromaticApi.applyEffectFilter(source,{kind:'chromatic',params:{distance:.3,angle:0}}),after=output.ctx.getImageData(0,0,output.canvas.width,output.canvas.height).data;
    const sourceAfter=source.ctx.getImageData(0,0,source.canvas.width,source.canvas.height).data; let colorFringe=0,inkChanged=0;for(let i=0;i<after.length;i+=4){if(before[i+3]===255&&before.slice(i,i+4).some((v,j)=>v!==after[i+j]))inkChanged++;if(!before[i+3]&&after[i+3]>30&&Math.max(...after.slice(i,i+3))-Math.min(...after.slice(i,i+3))>80)colorFringe++;}
    return {color,colorFringe,inkChanged,sourceUntouched:before.every((v,i)=>v===sourceAfter[i])};
   });
  });for(const item of cases){assert.ok(item.colorFringe>50,item.color+' creates real saturated fringes');assert.equal(item.inkChanged,0);assert.equal(item.sourceUntouched,true);}assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('RGB splitting creates no opaque black ghost from a channel with no signal',async()=>{
 const {browser,page}=await open();try{
  const result=await page.evaluate(()=>{
   const source=chromaticApi.makeSurface({x:0,y:0,w:16,h:14},127);source.ctx.fillStyle='#ff0000';source.ctx.fillRect(5,5,4,4);
   const out=chromaticApi.applyEffectFilter(source,{kind:'chromatic',params:{distance:1,angle:0,mode:'channels'}}),at=(x,y)=>Array.from(out.ctx.getImageData(x*5,y*5,1,1).data);
   return {left:at(4.4,7),center:at(7,7),right:at(9.4,7)};
  });assert.deepEqual(result,{left:[0,0,0,0],center:[255,0,0,255],right:[255,0,0,255]});
 }finally{await browser.close();}
});

test('explicit colored fringes follow millimeter distance and angle, preserving holes and empty margins',async()=>{
 const {browser,page}=await open();try{
  const results=await page.evaluate(()=>[127,254].map(dpi=>{
   const s=chromaticApi.makeSurface({x:0,y:0,w:16,h:16},dpi),scale=dpi/25.4;s.ctx.fillStyle='#000000';s.ctx.fillRect(5,5,6,6);s.ctx.clearRect(6,6,4,4);
   const draw=angle=>chromaticApi.applyEffectFilter(s,{kind:'chromatic',params:{distance:1,angle,mode:'fringe',color:'#ec3868',color2:'#168fba',strength:1}}),h=draw(0),v=draw(90),at=(surface,x,y)=>Array.from(surface.ctx.getImageData(Math.floor(x*scale),Math.floor(y*scale),1,1).data);
   return {left:at(h,4.5,6),right:at(h,11.5,6),top:at(v,6,4.5),bottom:at(v,6,11.5),hole:at(h,8,8),corner:at(h,0,0)};
  }));for(const result of results){assert.deepEqual(result,{left:[22,143,186,255],right:[236,56,104,255],top:[22,143,186,255],bottom:[236,56,104,255],hole:[0,0,0,0],corner:[0,0,0,0]});}
 }finally{await browser.close();}
});

test('RGB alpha follows color signals without black silhouettes at the original red and blue edges',async()=>{
 const {browser,page}=await open();try{
  const results=await page.evaluate(()=>['#ff0000','#0000ff','#000000'].map(color=>{
   const source=chromaticApi.makeSurface({x:0,y:0,w:16,h:14},127);source.ctx.fillStyle=color;source.ctx.fillRect(5,5,4,4);
   const out=chromaticApi.applyEffectFilter(source,{kind:'chromatic',params:{distance:1,angle:0,mode:'channels'}}),half=chromaticApi.applyEffectFilter(source,{kind:'chromatic',params:{distance:1,angle:0,mode:'channels',strength:.5}}),at=(s,x)=>Array.from(s.ctx.getImageData(Math.floor(x*5),35,1,1).data);
   return {color,left:at(out,5.4),right:at(out,8.6),center:at(out,7),halfLeft:at(half,5.4),halfRight:at(half,8.6)};
  }));assert.deepEqual(results[0].left,[0,0,0,0]);assert.deepEqual(results[0].halfLeft,[255,0,0,128]);assert.deepEqual(results[1].right,[0,0,0,0]);assert.deepEqual(results[1].halfRight,[0,0,255,128]);assert.deepEqual(results[2].center,[0,0,0,255]);
 }finally{await browser.close();}
});

test('zero strength or distance is an exact identity and channel strength blends premultiplied alpha',async()=>{
 const {browser,page}=await open();try{
  const result=await page.evaluate(()=>{
   const source=chromaticApi.makeSurface({x:0,y:0,w:16,h:14},127);source.ctx.fillStyle='#ff00ff';source.ctx.fillRect(5,5,4,4);const before=source.ctx.getImageData(0,0,source.canvas.width,source.canvas.height).data;
   const results=[{distance:0,mode:'fringe'},{distance:1,strength:0,mode:'channels'},{distance:1,strength:0,mode:'fringe'}].map(params=>{const out=chromaticApi.applyEffectFilter(source,{kind:'chromatic',params}),pixels=out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;return before.every((v,i)=>v===pixels[i]);});
   const half=chromaticApi.applyEffectFilter(source,{kind:'chromatic',params:{mode:'channels',distance:1,strength:.5}});return {identities:results,left:Array.from(half.ctx.getImageData(22,35,1,1).data)};
  });assert.deepEqual(result.identities,[true,true,true]);assert.deepEqual(result.left,[0,0,255,128]);
 }finally{await browser.close();}
});
