import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
// This bundle never rewrites the shared app delivery or browser harness.
const built=await build({absWorkingDir:root,stdin:{resolveDir:root,contents:"import {drawStarlight} from './src/render/effects/starlight.js';import {effectRandom} from './src/render/effects/random.js';window.starlightApi={drawStarlight,effectRandom};"},bundle:true,format:'iife',write:false,target:'es2022'});

async function scene(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addScriptTag({content:built.outputFiles[0].text});
  await page.evaluate(()=>{
   window.starlightFrame=(options={})=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.globalAlpha=options.alpha??1;
    const included=[],seed=options.seed??37,params={count:1,size:.25,rays:.22,stretch:1,glow:0,twinkle:0,spin:0,rotation:0,...options.params};
    const random=options.scattered?(index,salt)=>starlightApi.effectRandom(seed,'browser-starlight',index,salt):()=>.5;
    const point=options.empty?()=>null:options.cyclePoints?(index,cycle)=>({x:cycle%2?210:110,y:160}):options.scattered?(index,cycle)=>({x:45+starlightApi.effectRandom(seed,'browser-starlight',index,cycle+':x')*230,y:45+starlightApi.effectRandom(seed,'browser-starlight',index,cycle+':y')*230}):()=>({x:160,y:160});
    const layer={id:'browser-starlight',params},before=JSON.stringify(layer),inheritedAlpha=ctx.globalAlpha;
    starlightApi.drawStarlight(ctx,layer,{height:200,time:options.time??1.2,point,random,include:(...args)=>included.push(args)});
    const data=ctx.getImageData(0,0,320,320).data;
    const at=(x,y)=>[...data.slice((Math.floor(y)*320+Math.floor(x))*4,(Math.floor(y)*320+Math.floor(x))*4+4)];
    const patch=(x,y)=>{let total=0;for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)total+=at(x+xx,y+yy)[3];return total;};
    let visible=0,alpha=0,maxAlpha=0,minX=320,minY=320,maxX=-1,maxY=-1,outside=0;
    for(let y=0;y<320;y++)for(let x=0;x<320;x++){
     const a=data[(y*320+x)*4+3];alpha+=a;maxAlpha=Math.max(maxAlpha,a);if(a<=8)continue;
     visible++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
     if(!included.some(([cx,cy,r])=>Math.hypot(x+.5-cx,y+.5-cy)<=r+1))outside++;
    }
    return {canvas,data,summary:{png:canvas.toDataURL(),visible,alpha,maxAlpha,box:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1},included,outside,center:at(160,160),arm:at(183,160),halo:at(182,182),corner:at(0,0),axes:[[124,160],[196,160],[160,124],[160,196]].map(([x,y])=>patch(x,y)),diagonals:[[133,133],[187,133],[133,187],[187,187]].map(([x,y])=>patch(x,y)),statePreserved:ctx.globalAlpha===inheritedAlpha&&JSON.stringify(layer)===before}};
   };
  });
  return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}
const frame=(page,options)=>page.evaluate(options=>window.starlightFrame(options).summary,options);

test('starlight has four long cardinal rays and clear space between them',async t=>{
 const {browser,page,errors}=await scene();try{
  const star=await frame(page),rotated=await frame(page,{params:{rotation:45}});
  assert.ok(star.axes.every(alpha=>alpha>150),'all four long tips are visible: '+star.axes);
  assert.deepEqual(star.diagonals,[0,0,0,0],'no fifth through eighth diagonal tips');
  t.diagnostic(JSON.stringify({axes:star.axes,rotated:rotated.diagonals,visible:star.visible}));
  assert.ok(rotated.diagonals.every(alpha=>alpha>100),'rotation moves the four fading rays into the diagonals: '+rotated.diagonals);
  assert.deepEqual(rotated.axes,[0,0,0,0]);
  assert.ok(star.visible>700);assert.equal(star.outside,0);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('starlight retains real alpha and a bright core while geometry and glow controls change pixels',async()=>{
 const {browser,page}=await scene();try{
  const plain=await frame(page,{params:{color:'#1c7cff'}}),faint=await frame(page,{alpha:.25,params:{glow:1}}),glow=await frame(page,{params:{glow:1}});
  assert.deepEqual(plain.corner,[0,0,0,0]);assert.equal(plain.halo[3],0);assert.ok(glow.halo[3]>0);
  assert.ok(plain.center[0]>plain.arm[0]+80,'core is brighter than the blue arms');
  assert.ok(faint.maxAlpha>0&&faint.maxAlpha<=66,'all passes multiply inherited opacity: '+faint.maxAlpha);
  assert.equal(faint.statePreserved,true);assert.equal(glow.outside,0);
  const small=await frame(page,{params:{size:.15}}),wide=await frame(page,{params:{rays:.6}}),narrow=await frame(page,{params:{rays:.05}}),tall=await frame(page,{params:{stretch:2}});
  assert.ok(plain.visible>small.visible*2.5,'size changes real surface area');
  assert.ok(wide.visible>narrow.visible*1.5,'inner notch changes ray thickness');
  assert.ok(tall.box.h>tall.box.w*1.8,'stretch lengthens the vertical tips');
  assert.equal(tall.outside,0);
  const coloredCore=await frame(page,{params:{coreColor:'#ff9900'}}),red=await frame(page,{params:{color:'#ff0000'}});
  assert.ok(coloredCore.center[2]<30,'core color changes the visible center');assert.ok(red.arm[1]<30,'ray color changes the visible arms');
 }finally{await browser.close();}
});

test('starlight diffraction rays fade into transparency before their tips instead of ending as an opaque cutout',async t=>{
 const {browser,page}=await scene();try{
  const profile=await page.evaluate(()=>{
   const {data}=window.starlightFrame({params:{glow:0,size:.25,rays:.22,stretch:1}});
   const alpha=x=>data[(160*320+x)*4+3];
   return {core:alpha(160),middle:alpha(183),tail:alpha(195),tip:alpha(201),outside:alpha(212)};
  });
  t.diagnostic(JSON.stringify(profile));
  assert.ok(profile.core>235,'the core remains bright: '+JSON.stringify(profile));
  assert.ok(profile.middle>profile.tail&&profile.tail>profile.tip,'long rays dim continuously towards the tip: '+JSON.stringify(profile));
  assert.ok(profile.tail<75,'long outer rays remain translucent: '+JSON.stringify(profile));
  assert.ok(profile.tip<20,'the edge dissolves into transparency: '+JSON.stringify(profile));
  assert.equal(profile.outside,0);
 }finally{await browser.close();}
});

test('starlight frozen frames repeat exactly at late times and twinkle zero holds the same pixels',async()=>{
 const {browser,page}=await scene();try{
  const options={scattered:true,time:19.345,params:{count:16,size:.08,life:2.8,twinkle:1,spin:.1,glow:.65,randomness:1}};
  const first=await frame(page,options),again=await frame(page,options),later=await frame(page,{...options,time:19.445}),newSeed=await frame(page,{...options,seed:38});
  assert.equal(first.png,again.png);assert.notEqual(first.png,later.png);assert.notEqual(first.png,newSeed.png);
  assert.equal(first.statePreserved,true);assert.equal(first.outside,0);
  const still={scattered:true,params:{count:12,size:.08,twinkle:0,spin:0,glow:.65,randomness:1}};
  assert.equal((await frame(page,{...still,time:1.2})).png,(await frame(page,{...still,time:90})).png);
  const empty=await frame(page,{empty:true});assert.equal(empty.alpha,0);assert.deepEqual(empty.included,[]);
 }finally{await browser.close();}
});

test('starlight reuses one light stamp across different star sizes and repeated print-scale frames',async()=>{
 const {browser,page}=await scene();try{
  const result=await page.evaluate(()=>{
   const Original=window.OffscreenCanvas,allocations=[];
   window.OffscreenCanvas=new Proxy(Original,{construct(target,args){const canvas=new target(...args);allocations.push(canvas);return canvas;}});
   try{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=320;
    const ctx=canvas.getContext('2d');ctx.scale(300/25.4,300/25.4);
    const layer={id:'browser-starlight',params:{count:12,size:.2,twinkle:0,spin:0,stretch:1.45,glow:.65}};
    const options={height:88,point:()=>({x:12,y:12}),random:(index,salt)=>starlightApi.effectRandom(1,layer.id,index,salt)};
    starlightApi.drawStarlight(ctx,layer,{...options,time:1.2});const first=allocations.length;
    for(let i=1;i<=60;i++){ctx.clearRect(0,0,320,320);starlightApi.drawStarlight(ctx,layer,{...options,time:1.2+i/60});}
    return {first,total:allocations.length,liveBytes:allocations.reduce((sum,canvas)=>sum+canvas.width*canvas.height*4,0)};
   }finally{window.OffscreenCanvas=Original;}
  });
  assert.equal(result.first,1,'all sizes share one light stamp: '+JSON.stringify(result));
  assert.equal(result.total,1,'subsequent frames allocate no new light stamps: '+JSON.stringify(result));
  assert.ok(result.liveBytes<=16*1024*1024,'cached backing stores stay inside the budget');
 }finally{await browser.close();}
});

test('starlight crosses pulse and randomized position-cycle boundaries without a visible jump',async t=>{
 const {browser,page}=await scene();try{
  const result=await page.evaluate(()=>{
   const compare=(first,second)=>{let delta=0,energy=0;for(let i=3;i<first.length;i+=4){delta+=Math.abs(first[i]-second[i]);energy+=Math.max(first[i],second[i]);}return delta/Math.max(1,energy);};
   const render=(time,params={})=>window.starlightFrame({time,params:{count:1,size:.25,life:1,twinkle:1,spin:0,...params}}).data;
   const a=render(.21),b=render(1.21),nearA=render(.21),nearB=render(.2101),different=render(.3);
   const relocating=(time,randomness=1)=>window.starlightFrame({time,cyclePoints:true,params:{size:.25,life:1,twinkle:1,randomness}});
   const left=relocating(.4999),right=relocating(.5001),old=relocating(.2),next=relocating(.8),fixed=relocating(.8,0);
   const drift=time=>window.starlightFrame({scattered:true,time,params:{count:9,size:.06,life:1,twinkle:1,spin:0,randomness:1,glow:.65}}).data;
   return {periodic:compare(a,b),boundary:compare(left.data,right.data),relocations:[old.summary.included[0]?.[0],next.summary.included[0]?.[0],fixed.summary.included[0]?.[0]],neighbor:compare(nearA,nearB),moving:compare(a,different),scatteredNeighbor:compare(drift(3.21),drift(3.2101))};
  });
  assert.equal(result.periodic,0,'one-second life/pulse repeats exactly');
  assert.deepEqual(result.relocations,[110,210,110],'randomness changes position only for the next lifetime');
  assert.ok(result.boundary<.02,'vanishing lights hide relocation across the cycle boundary');
  assert.ok(result.neighbor<.01&&result.scatteredNeighbor<.015,'nearby frames vary smoothly: '+JSON.stringify(result));
  assert.ok(result.moving>.05,'the animation visibly changes over time');t.diagnostic(JSON.stringify(result));
 }finally{await browser.close();}
});

test('starlight gallery records four-tip geometry soft glow print opacity and phase variation',async()=>{
 const {browser,page,errors}=await scene();try{
  await page.evaluate(()=>{
   document.body.style.cssText='margin:0;padding:24px;background:#0d1527;color:#e6edff;font:16px sans-serif;display:grid;grid-template-columns:repeat(3,320px);gap:24px';
   const cases=[['Four diffraction rays',{params:{glow:.65,stretch:1.45,color:'#9fcfff'}}],['Rotated four tips',{params:{glow:.65,rotation:45,color:'#cfb6ff'}}],['Thin rays',{params:{glow:.65,rays:.05,color:'#9fffe1'}}],['White paper / alpha 0.45',{alpha:.45,params:{glow:1,color:'#6b9ddc'}}],['Twinkle / time 0.25',{time:.25,params:{twinkle:1,life:2.8,glow:.65,stretch:1.45}}],['Seeded starlight field',{scattered:true,time:1.2,params:{count:20,size:.07,twinkle:1,life:2.8,glow:.65,stretch:1.45}}]];
   for(const [label,options] of cases){const section=document.createElement('section'),title=document.createElement('div'),{canvas}=window.starlightFrame(options);title.textContent=label;title.style.cssText='padding:0 0 10px';canvas.style.cssText='display:block;background:'+(label.startsWith('White')?'#fffdf8':'#080f20')+';border:1px solid #29395a';section.append(title,canvas);document.body.append(section);}
  });
  const output=path.join(root,'artifacts/qa/starlight-gallery.png');await mkdir(path.dirname(output),{recursive:true});await page.screenshot({path:output,fullPage:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
