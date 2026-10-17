import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const hasMaterials=existsSync(new URL('../src/render/effects/material-filters.js',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import * as masks from './src/render/effects/masks.js'; ${hasMaterials?"import * as materials from './src/render/effects/material-filters.js';":'const materials={applyMaterialFilter:()=>null};'} window.materialApi={...masks,...materials};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
const kinds=['innerGlow','innerShadow','bevel','extrude','foil','holographic','glitch','scanlines','grain','duotone'];

async function openMaterial(){
 const result=await openHarness();await result.page.addScriptTag({content:bundle.outputFiles[0].text});
 await result.page.evaluate(()=>{
  window.materialPixels=surface=>surface.ctx.getImageData(0,0,surface.canvas.width,surface.canvas.height).data;
  window.materialHash=surface=>{if(!surface)return null;let h=2166136261;for(const value of materialPixels(surface))h=Math.imul(h^value,16777619);return h>>>0;};
  window.materialLayer=(kind,params={})=>({id:'material-'+kind,kind,opacity:1,protectText:true,scope:'inside',motion:{enabled:false,speed:1},params});
  window.materialFixture=(dpi=127)=>{
   const surface=materialApi.makeSurface({x:-4,y:-3,w:28,h:23},dpi),c=surface.ctx;
   const gradient=c.createLinearGradient(1,0,18,16);gradient.addColorStop(0,'#ef7133');gradient.addColorStop(.5,'#4775d5');gradient.addColorStop(1,'#12ba8d');
   c.fillStyle=gradient;c.fillRect(2,2,13,10);c.clearRect(7,7,3,5);c.fillStyle='#c72c83';c.fillRect(17,7,2,4);c.globalAlpha=.35;c.fillStyle='#e46424';c.fillRect(4,14,5,2);c.globalAlpha=1;return surface;
  };
  window.materialAt=(surface,x,y)=>Array.from(surface.ctx.getImageData(Math.floor((x-surface.work.x)*surface.scale),Math.floor((y-surface.work.y)*surface.scale),1,1).data);
  window.materialDraw=(source,kind,params={},options={})=>materialApi.applyMaterialFilter(source,materialLayer(kind,params),{rect:{x:2,y:2,w:17,h:14},seed:29,timeSec:1.2,...options});
 });return result;
}

test('each material independently transforms the full accumulator with deterministic pixels',async t=>{
 const {browser,page,pageErrors,httpRequests}=await openMaterial();try{
  for(const kind of kinds)await t.test(kind,async()=>{
   const result=await page.evaluate(kind=>{
    const source=materialFixture(),before=materialHash(source),a=materialDraw(source,kind),b=materialDraw(source,kind);
    if(!a)return {available:false};const pixels=materialPixels(a);
    return {available:true,changed:materialHash(a)!==before,hash:materialHash(a),repeat:materialHash(b),untouched:materialHash(source)===before,independent:a!==source&&a.canvas!==source.canvas,work:a.work,dpi:a.dpi,size:[a.canvas.width,a.canvas.height],corner:pixels[3],visible:pixels.some((v,i)=>i%4===3&&v>0)};
   },kind);
   assert.equal(result.available,true,kind+' produces a material result');assert.equal(result.changed,true,kind+' visibly changes the source');assert.equal(result.hash,result.repeat,kind+' repeats from explicit seed and time');assert.equal(result.untouched,true);assert.equal(result.independent,true);assert.deepEqual(result.work,{x:-4,y:-3,w:28,h:23});assert.equal(result.dpi,127);assert.deepEqual(result.size,[140,115]);assert.equal(result.corner,0);assert.equal(result.visible,true);
  });
  const hashes=await page.evaluate(kinds=>kinds.map(kind=>materialHash(materialDraw(materialFixture(),kind))),kinds);assert.equal(new Set(hashes).size,10,'ten material treatments have distinct output');assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('neutral strength and zero physical controls return exact independent copies',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(kinds=>{
   const source=materialFixture(),before=materialHash(source),cases=[...kinds.map(kind=>[kind,{strength:0}]),['innerGlow',{width:0}],['innerShadow',{offsetX:0,offsetY:0,blur:0}],['bevel',{size:0}],['extrude',{depth:0}],['foil',{size:0}],['holographic',{size:0}],['glitch',{distance:0}],['scanlines',{width:0}],['scanlines',{spacing:0}],['grain',{size:0}]];
   return cases.map(([kind,params])=>{const output=materialDraw(source,kind,params);return {kind,params,unchanged:materialHash(output)===before,independent:output!==source&&output?.canvas!==source.canvas};});
  },kinds);for(const result of results){assert.equal(result.unchanged,true,JSON.stringify(result));assert.equal(result.independent,true,result.kind);}
 }finally{await browser.close();}
});

test('material colors preserve translucent alpha, transparent holes, and compositor ownership',async()=>{
 const {browser,page}=await openMaterial();try{
  // Extrusion adds a side silhouette; glitch deliberately displaces RGBA rows,
  // including alpha and holes. Only color and inward materials preserve alpha.
  const results=await page.evaluate(kinds=>kinds.filter(kind=>!['extrude','glitch'].includes(kind)).map(kind=>{
   const source=materialFixture(),before=materialPixels(source),a=materialDraw(source,kind);if(!a)return {kind,available:false};
   const after=materialPixels(a),b=materialApi.applyMaterialFilter(source,{...materialLayer(kind),opacity:0,protectText:false,scope:'outside'},{rect:{x:2,y:2,w:17,h:14},seed:29,timeSec:1.2});
   return {kind,available:true,sameAlpha:before.every((v,i)=>i%4!==3||v===after[i]),sameResult:materialHash(a)===materialHash(b),hole:materialAt(a,8,8),transparentGarbage:after.some((v,i)=>i%4!==3&&after[i-i%4+3]===0&&v!==0)};
  }),kinds);
  for(const result of results){assert.equal(result.available,true,result.kind);assert.equal(result.sameAlpha,true,result.kind+' preserves antialiased and translucent alpha');assert.equal(result.sameResult,true,result.kind+' leaves opacity, scope and protection to compositor');assert.deepEqual(result.hole,[0,0,0,0],result.kind);assert.equal(result.transparentGarbage,false,result.kind);}
  assert.equal(await page.evaluate(()=>materialApi.applyMaterialFilter(materialFixture(),materialLayer('unknown-material'))),null);
 }finally{await browser.close();}
});

test('empty accumulators stay empty for every material',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(kinds=>kinds.map(kind=>{const source=materialApi.makeSurface({x:-2,y:-2,w:16,h:16},127),output=materialDraw(source,kind);return {kind,empty:!!output&&materialPixels(output).every(value=>value===0)};}),kinds);
  for(const result of results)assert.equal(result.empty,true,result.kind);
 }finally{await browser.close();}
});

test('motion uses explicit time only and disabled motion ignores time',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(kinds=>{
   const source=materialFixture(),draw=(kind,timeSec,enabled,seed=29)=>materialApi.applyMaterialFilter(source,{...materialLayer(kind),motion:{enabled,speed:1.3}},{rect:{x:2,y:2,w:17,h:14},timeSec,seed});
   return {still:kinds.map(kind=>({kind,same:materialHash(draw(kind,.1,false))===materialHash(draw(kind,5.9,false))})),animated:['innerGlow','foil','holographic','glitch','scanlines','grain'].map(kind=>({kind,same:materialHash(draw(kind,.8,true))===materialHash(draw(kind,.8,true)),moves:materialHash(draw(kind,.8,true))!==materialHash(draw(kind,2.1,true))})),seeded:['foil','holographic','glitch','grain'].map(kind=>({kind,changes:materialHash(draw(kind,1.2,false,29))!==materialHash(draw(kind,1.2,false,311))}))};
  },kinds);
  for(const item of result.still)assert.equal(item.same,true,item.kind);for(const item of result.animated){assert.equal(item.same,true,item.kind);assert.equal(item.moves,true,item.kind);}for(const item of result.seeded)assert.equal(item.changes,true,item.kind);
 }finally{await browser.close();}
});

test('inner glow is an inward gradient around outer and hole edges without tinting the center',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:24,h:24},254);source.ctx.fillStyle='#304050';source.ctx.fillRect(2,2,20,20);source.ctx.clearRect(10,10,4,4);
   const output=materialDraw(source,'innerGlow',{color:'#ffffff',width:1,strength:1});if(!output)return null;
   return {edge:materialAt(output,2.1,6),middle:materialAt(output,2.5,6),inner:materialAt(output,3.4,6),center:materialAt(output,6,6),holeEdge:materialAt(output,9.9,12),hole:materialAt(output,12,12),outside:materialAt(output,1.9,6)};
  });assert.ok(result,'inner glow is implemented');assert.ok(result.edge[0]>result.middle[0]+30);assert.ok(result.middle[0]>result.inner[0]+15);assert.deepEqual(result.center,[48,64,80,255]);assert.deepEqual(result.inner,[48,64,80,255]);assert.ok(result.holeEdge[0]>160);assert.deepEqual(result.hole,[0,0,0,0]);assert.deepEqual(result.outside,[0,0,0,0]);
 }finally{await browser.close();}
});

test('inner shadow follows offset direction and leaves distant interior unchanged',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:20,h:20},254);source.ctx.fillStyle='#c8c8c8';source.ctx.fillRect(3,3,14,14);
   const a=materialDraw(source,'innerShadow',{color:'#000000',offsetX:1,offsetY:0,blur:.3,strength:1}),b=materialDraw(source,'innerShadow',{color:'#000000',offsetX:-1,offsetY:0,blur:.3,strength:1});if(!a||!b)return null;
   return {left:materialAt(a,3.3,10),right:materialAt(a,16.6,10),center:materialAt(a,10,10),reversedLeft:materialAt(b,3.3,10),reversedRight:materialAt(b,16.6,10)};
  });assert.ok(result,'inner shadow is implemented');assert.ok(result.left[0]<result.right[0]-60);assert.ok(result.reversedRight[0]<result.reversedLeft[0]-60);assert.deepEqual(result.center,[200,200,200,255]);
 }finally{await browser.close();}
});

test('subpixel inner shadow blur approaches zero continuously',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:12,h:12},127);source.ctx.fillStyle='#c8c8c8';source.ctx.fillRect(3,3,6,6);
   const output=materialDraw(source,'innerShadow',{color:'#000000',offsetX:0,offsetY:0,blur:.001,strength:1});return output?{edge:materialAt(output,3,6),center:materialAt(output,6,6)}:null;
  });assert.ok(result);assert.ok(result.edge[0]>=197,'a 0.005 pixel blur must not become a whole pixel blur: '+JSON.stringify(result));assert.deepEqual(result.center,[200,200,200,255]);
 }finally{await browser.close();}
});

test('subpixel inner glow and bevel widths contribute smoothly below one pixel',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(()=>['innerGlow','bevel'].map(kind=>{
   const source=materialApi.makeSurface({x:0,y:0,w:12,h:12},127);source.ctx.fillStyle='#404040';source.ctx.fillRect(3,3,6,6);
   const draw=size=>materialDraw(source,kind,{color:'#ffffff',highlight:'#ffffff',shadow:'#000000',strength:1,angle:180,width:size,size}),a=draw(.02),b=draw(.04);return {kind,small:a?materialAt(a,3,6)[0]:null,larger:b?materialAt(b,3,6)[0]:null};
  }));for(const result of results){assert.ok(result.small>64,JSON.stringify(result));assert.ok(result.larger>result.small+3,JSON.stringify(result));}
 }finally{await browser.close();}
});

test('bevel lights opposite edges and gives 7 pt Korean strokes visible highlights and shadows',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:50,h:18},300),c=source.ctx;c.fillStyle='#808080';c.fillRect(2,2,12,12);c.font=`${7*25.4/72}px "Malgun Gothic",sans-serif`;c.fillText('각광 분광 환상',18,8);c.fillText('금속 재질 효과',18,12);
   const output=materialDraw(source,'bevel',{highlight:'#ffffff',shadow:'#000000',size:.5,angle:-55,strength:.9});if(!output)return null;
   const before=materialPixels(source),after=materialPixels(output),w=source.canvas.width;let highlights=0,shadows=0,ink=0;
   for(let y=0;y<source.canvas.height;y++)for(let x=Math.ceil(18*source.scale);x<w;x++){const at=(y*w+x)*4;if(before[at+3]>200){ink++;if(after[at]>before[at]+12)highlights++;if(after[at]<before[at]-12)shadows++;}}
   return {highlights,shadows,ink,center:materialAt(output,8,8),top:materialAt(output,8,2.1),bottom:materialAt(output,8,13.8),sameAlpha:before.every((v,i)=>i%4!==3||v===after[i])};
  });assert.ok(result,'bevel is implemented');assert.ok(result.ink>200);assert.ok(result.highlights>25,JSON.stringify(result));assert.ok(result.shadows>25,JSON.stringify(result));assert.deepEqual(result.center,[128,128,128,255]);assert.ok(result.top[0]>result.bottom[0]+60);assert.equal(result.sameAlpha,true);
 }finally{await browser.close();}
});

test('extrusion extends by physical depth and preserves the colored front face',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(()=>[127,254,300].map(dpi=>{
   const source=materialApi.makeSurface({x:0,y:0,w:18,h:16},dpi);source.ctx.fillStyle='#ed5b30';source.ctx.fillRect(4,4,4,4);
   const output=materialDraw(source,'extrude',{color:'#463655',depth:2,angle:0});if(!output)return {dpi,available:false};const bounds=materialApi.alphaBounds(output);
   return {dpi,available:true,bounds,front:materialAt(output,6,6),side:materialAt(output,9,6),empty:materialAt(output,10.5,6)};
  }));for(const result of results){assert.equal(result.available,true);assert.ok(Math.abs(result.bounds.x-4)<.12);assert.ok(Math.abs(result.bounds.w-6)<.2,JSON.stringify(result));assert.ok(Math.abs(result.bounds.h-4)<.2);assert.deepEqual(result.front,[237,91,48,255]);assert.ok(result.side[3]>200);assert.ok(result.side[2]>result.side[1]);assert.deepEqual(result.empty,[0,0,0,0]);}
 }finally{await browser.close();}
});

test('foil and holographic have metallic contrast and spectral variation at matching physical positions',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(()=>['foil','holographic'].map(kind=>{
   const create=(work,dpi)=>{const s=materialApi.makeSurface(work,dpi);s.ctx.fillStyle='#999999';s.ctx.fillRect(1,1,30,20);return materialDraw(s,kind,{size:4,angle:-25,strength:1},{rect:{x:1,y:1,w:30,h:20}});},a=create({x:0,y:0,w:34,h:24},127),b=create({x:-2,y:-3,w:38,h:29},127),high=create({x:0,y:0,w:34,h:24},254);if(!a||!b||!high)return {kind,available:false};
   const colors=new Set(),hues=new Set();let low=255,bright=0,error=0,count=0,anchor=true;
   for(let yi=0;yi<12;yi++)for(let xi=0;xi<24;xi++){const x=3.1+xi,y=3.1+yi,p=materialAt(a,x,y),q=materialAt(b,x,y),r=materialAt(high,x,y),value=(p[0]+p[1]+p[2])/3;low=Math.min(low,value);bright=Math.max(bright,value);colors.add(p.slice(0,3).map(v=>Math.floor(v/24)).join(','));if(Math.max(...p.slice(0,3))-Math.min(...p.slice(0,3))>55)hues.add(p.indexOf(Math.max(...p.slice(0,3))));anchor&&=p.every((v,i)=>v===q[i]);for(let k=0;k<3;k++){error+=Math.abs(p[k]-r[k]);count++;}}
   return {kind,available:true,colors:colors.size,hues:hues.size,span:bright-low,meanResolutionError:error/count,anchor};
  }));for(const result of results){assert.equal(result.available,true);assert.ok(result.colors>15,JSON.stringify(result));assert.ok(result.span>75,JSON.stringify(result));assert.ok(result.meanResolutionError<28,JSON.stringify(result));assert.equal(result.anchor,true);if(result.kind==='holographic')assert.equal(result.hues,3,JSON.stringify(result));}
 }finally{await browser.close();}
});

test('glitch translates row bands with meaningful distance, band count, and strength',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:30,h:20},254),c=source.ctx,g=c.createLinearGradient(0,0,30,0);g.addColorStop(0,'#000000');g.addColorStop(1,'#ffffff');c.fillStyle=g;c.fillRect(1,1,28,18);
   const draw=params=>materialDraw(source,'glitch',params,{rect:{x:1,y:1,w:28,h:18}}),a=draw({distance:2,bands:4,strength:1}),b=draw({distance:2,bands:14,strength:1}),weak=draw({distance:2,bands:4,strength:.2});if(!a||!b||!weak)return null;
   const shifts=[],weakShifts=[];for(let y=2;y<18;y+=.3){shifts.push(materialAt(a,15,y)[0]-materialAt(source,15,y)[0]);weakShifts.push(materialAt(weak,15,y)[0]-materialAt(source,15,y)[0]);}
   return {rows:new Set(shifts).size,strong:shifts.reduce((n,v)=>n+Math.abs(v),0),weak:weakShifts.reduce((n,v)=>n+Math.abs(v),0),bands:materialHash(a)!==materialHash(b),sameBand:Math.abs(materialAt(a,10,2)[0]-materialAt(source,10,2)[0]-(materialAt(a,10,3)[0]-materialAt(source,10,3)[0]))<2};
  });assert.ok(result,'glitch is implemented');assert.ok(result.rows>=3);assert.ok(result.rows<=7,'rows share the same band displacement');assert.ok(result.strong>result.weak*2,JSON.stringify(result));assert.equal(result.bands,true);assert.equal(result.sameBand,true);
 }finally{await browser.close();}
});

test('regression: glitch visibly displaces black white and red Korean silhouettes',async t=>{
 const {browser,page,pageErrors}=await openMaterial();try{
  for(const color of ['#000000','#ffffff','#ff0000'])await t.test(color,async()=>{
   const result=await page.evaluate(color=>{
    const source=materialApi.makeSurface({x:0,y:0,w:50,h:20},300),c=source.ctx;c.fillStyle=color;c.font=`${7*25.4/72}px "Malgun Gothic",sans-serif`;c.fillText('검은 한글 글리치',6,7);c.font=`${14*25.4/72}px "Malgun Gothic",sans-serif`;c.fillText('각광 분광 환상',6,15);
    const before=materialPixels(source),hash=materialHash(source),options={rect:{x:5,y:3,w:40,h:14},seed:29,timeSec:1.2},layer=materialLayer('glitch',{distance:.7,bands:14,strength:.9}),output=materialApi.applyMaterialFilter(source,layer,options),scoped=materialApi.applyMaterialFilter(source,{...layer,opacity:0,scope:'outside',protectText:false},options),after=materialPixels(output);let changedAlpha=0,added=0,removed=0,colorErrors=0;
    const wanted=color==='#000000'?[0,0,0]:color==='#ffffff'?[255,255,255]:[255,0,0];
    for(let at=0;at<after.length;at+=4){if(before[at+3]!==after[at+3])changedAlpha++;if(!before[at+3]&&after[at+3]>16)added++;if(before[at+3]>16&&!after[at+3])removed++;if(after[at+3]&&wanted.some((v,k)=>after[at+k]!==v))colorErrors++;}
    return {changed:materialHash(output)!==hash,changedAlpha,added,removed,colorErrors,unchangedSource:materialHash(source)===hash,independent:output!==source&&output.canvas!==source.canvas,compositorOwned:materialHash(output)===materialHash(scoped),corner:materialAt(output,0,0)};
   },color);
   assert.equal(result.changed,true,color+' flat text must visibly glitch');assert.ok(result.changedAlpha>100,JSON.stringify(result));assert.ok(result.added>40,JSON.stringify(result));assert.ok(result.removed>40,JSON.stringify(result));assert.equal(result.colorErrors,0,'resampling preserves a flat unassociated color');assert.equal(result.unchangedSource,true);assert.equal(result.independent,true);assert.equal(result.compositorOwned,true);assert.deepEqual(result.corner,[0,0,0,0]);
  });assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('glitch interpolates premultiplied RGBA without opaque ghosts or black transparent fringes',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:16,h:4},25.4);source.ctx.fillStyle='rgba(255,0,0,.5)';source.ctx.fillRect(6,1,1,1);
   const output=materialDraw(source,'glitch',{distance:.7,bands:1,strength:1},{rect:{x:0,y:0,w:16,h:4}}),d=materialPixels(output),samples=[];let mass=0,garbage=0;
   for(let at=0;at<d.length;at+=4){if(d[at+3]){samples.push(Array.from(d.slice(at,at+4)));mass+=d[at+3];}else if(d[at]||d[at+1]||d[at+2])garbage++;}
   const full=materialApi.makeSurface({x:0,y:0,w:16,h:4},25.4);full.ctx.fillStyle='#ff0000';full.ctx.fillRect(0,1,16,2);const clipped=materialDraw(full,'glitch',{distance:4,bands:1,strength:1},{rect:{x:0,y:0,w:16,h:4}}),row=Array.from({length:16},(_,x)=>materialAt(clipped,x,1));return {samples,mass,garbage,row};
  });assert.equal(result.samples.length,2,'a fractional shift transports coverage into an adjacent pixel');assert.ok(Math.abs(result.mass-128)<=1,'coverage is transported once, without retaining an opaque original');for(const sample of result.samples){assert.deepEqual(sample.slice(0,3),[255,0,0]);assert.ok(sample[3]>0&&sample[3]<128);}assert.equal(result.garbage,0);assert.ok(result.row.some(p=>p[3]===0),'samples beyond the canvas are transparent');for(const sample of result.row){if(sample[3])assert.deepEqual(sample.slice(0,3),[255,0,0]);else assert.deepEqual(sample,[0,0,0,0]);}
 }finally{await browser.close();}
});

test('glitch transports holes with their row silhouette instead of retaining the original mask',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:40,h:16},254);source.ctx.fillStyle='#000000';source.ctx.fillRect(8,3,20,10);source.ctx.clearRect(17,3,3,10);
   const output=materialDraw(source,'glitch',{distance:4,bands:1,strength:1},{rect:{x:8,y:3,w:20,h:10}}),row=surface=>{const d=materialPixels(surface),y=60,w=surface.canvas.width,edges=[];let previous=false;for(let x=0;x<w;x++){const opaque=d[(y*w+x)*4+3]>128;if(opaque!==previous)edges.push(x);previous=opaque;}return edges;};return {before:row(source),after:row(output)};
  });assert.deepEqual(result.before,[80,170,200,280]);assert.equal(result.after.length,4,'outer edges and one complete hole remain');const offsets=result.after.map((edge,i)=>edge-result.before[i]);assert.ok(Math.abs(offsets[0])>=11,JSON.stringify(result));assert.ok(Math.max(...offsets)-Math.min(...offsets)<=1,'all four silhouette and hole edges share one row displacement');
 }finally{await browser.close();}
});

test('glitch displacement strength is linear in millimeters across dpi and distance is capped at four',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(()=>[127,254,300].map(dpi=>{
   const source=materialApi.makeSurface({x:0,y:0,w:40,h:18},dpi);source.ctx.fillStyle='#000000';source.ctx.fillRect(14,3,2,10);
   const draw=(strength,distance=2)=>materialDraw(source,'glitch',{distance,bands:4,strength},{rect:{x:8,y:3,w:20,h:10}}),full=draw(1),half=draw(.5),centroid=(surface,y)=>{const d=materialPixels(surface),row=Math.floor(y*surface.scale),w=surface.canvas.width;let sum=0,mass=0;for(let x=0;x<w;x++){const a=d[(row*w+x)*4+3];sum+=(x+.5)/surface.scale*a;mass+=a;}return sum/mass;};return {dpi,shifts:[4,6.5,9,11.5].map(y=>({full:centroid(full,y)-centroid(source,y),half:centroid(half,y)-centroid(source,y)})),capped:materialHash(draw(1,4))===materialHash(draw(1,9))};
  }));for(const result of results){assert.equal(result.capped,true,JSON.stringify(result));for(let i=0;i<result.shifts.length;i++){const shift=result.shifts[i];assert.ok(Math.abs(shift.full)>=.59&&Math.abs(shift.full)<=2.01,JSON.stringify(result));assert.ok(Math.abs(shift.half-shift.full*.5)<.025,JSON.stringify(result));assert.ok(Math.abs(shift.full-results[0].shifts[i].full)<.025,JSON.stringify(result));}}
 }finally{await browser.close();}
});

test('scanline spacing and width are physical and rotation changes the stripe axis',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(()=>[127,254,300].map(dpi=>{
   const source=materialApi.makeSurface({x:0,y:0,w:14,h:14},dpi);source.ctx.fillStyle='#ffffff';source.ctx.fillRect(1,1,12,12);
   const draw=angle=>materialDraw(source,'scanlines',{color:'#000000',spacing:1,width:.3,angle,strength:1},{rect:{x:1,y:1,w:12,h:12}}),a=draw(0),b=draw(90);if(!a||!b)return {dpi,available:false};
   const runs=[];let dark=materialAt(a,7,1.9)[0]<100;for(let i=20;i<120;i++){const y=i/10,on=materialAt(a,7,y)[0]<100;if(on&&!dark)runs.push(y);dark=on;}
   const row=Array.from({length:80},(_,i)=>materialAt(a,2+i/10,7.1)[0]),column=Array.from({length:80},(_,i)=>materialAt(b,7.1,2+i/10)[0]);return {dpi,available:true,runs,flatRow:new Set(row).size===1,flatColumn:new Set(column).size===1,rotates:materialHash(a)!==materialHash(b)};
  }));for(const result of results){assert.equal(result.available,true);assert.ok(result.runs.length>=9&&result.runs.length<=11);for(let i=1;i<result.runs.length;i++)assert.ok(Math.abs(result.runs[i]-result.runs[i-1]-1)<.11,JSON.stringify(result));assert.equal(result.flatRow,true,JSON.stringify(result));assert.equal(result.flatColumn,true,JSON.stringify(result));assert.equal(result.rotates,true,JSON.stringify(result));}
 }finally{await browser.close();}
});

test('grain uses seeded physical cells with balanced tone and size dependent texture',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:30,h:22},300);source.ctx.fillStyle='#808080';source.ctx.fillRect(1,1,28,20);const a=materialDraw(source,'grain',{size:.15,strength:.6}),b=materialDraw(source,'grain',{size:.8,strength:.6});if(!a||!b)return null;
   const stats=surface=>{const d=materialPixels(surface),w=surface.canvas.width;let total=0,square=0,changes=0,count=0;for(let y=20;y<surface.canvas.height-20;y++)for(let x=20;x<w-20;x++){const at=(y*w+x)*4,v=d[at]-128;total+=v;square+=v*v;changes+=Math.abs(d[at]-d[at+4]);count++;}return {mean:total/count,deviation:Math.sqrt(square/count),changes:changes/count};};return {fine:stats(a),coarse:stats(b)};
  });assert.ok(result,'grain is implemented');assert.ok(Math.abs(result.fine.mean)<3);assert.ok(result.fine.deviation>8);assert.ok(result.fine.changes>result.coarse.changes*2,JSON.stringify(result));
 }finally{await browser.close();}
});

test('regression: grain sizes from .02 to .05 mm produce distinct physical textures',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:-12,y:-12,w:87,h:112},300);source.ctx.fillStyle='#808080';source.ctx.fillRect(3,3,20,12);const before=materialPixels(source),started=performance.now(),outputs=[.02,.03,.04,.05].map(size=>{const output=materialDraw(source,'grain',{size,strength:.6}),after=materialPixels(output);return {size,hash:materialHash(output),alpha:before.every((v,i)=>i%4!==3||v===after[i])};});return {outputs,elapsed:performance.now()-started};
  });assert.equal(new Set(result.outputs.map(output=>output.hash)).size,4,'catalog minimum sizes must not collapse to one work-area-dependent pitch');for(const output of result.outputs)assert.equal(output.alpha,true);assert.ok(result.elapsed<8000,'four 300 dpi fine textures remain bounded: '+result.elapsed.toFixed(0)+'ms');
 }finally{await browser.close();}
});

test('grain texture at fixed world positions is independent of work origin and padding',async()=>{
 const {browser,page}=await openMaterial();try{
  const results=await page.evaluate(()=>[.02,.05,.15].map(size=>{
   const create=work=>{const source=materialApi.makeSurface(work,254);source.ctx.fillStyle='#808080';source.ctx.fillRect(3,3,16,10);source.ctx.clearRect(8,6,2,3);return materialDraw(source,'grain',{size,strength:.6},{rect:{x:3,y:3,w:16,h:10}});},compact=create({x:0,y:0,w:24,h:18}),padded=create({x:-4,y:-3,w:87,h:112});let mismatched=0,total=0;
   const a=materialPixels(compact),b=materialPixels(padded);for(let y=35;y<125;y++)for(let x=35;x<185;x++){const ia=(y*compact.canvas.width+x)*4,ib=((y+30)*padded.canvas.width+x+40)*4;for(let k=0;k<4;k++){total++;if(a[ia+k]!==b[ib+k])mismatched++;}}return {size,mismatched,total};
  }));for(const result of results)assert.equal(result.mismatched,0,'one world-space texture must survive padding changes: '+JSON.stringify(result));
 }finally{await browser.close();}
});

test('duotone maps luminance endpoints and blends strength without changing alpha',async()=>{
 const {browser,page}=await openMaterial();try{
  const result=await page.evaluate(()=>{
   const source=materialApi.makeSurface({x:0,y:0,w:12,h:8},254),c=source.ctx;c.fillStyle='#000000';c.fillRect(1,1,3,6);c.fillStyle='#ffffff';c.fillRect(4,1,3,6);c.globalAlpha=.5;c.fillStyle='#808080';c.fillRect(7,1,3,6);
   const a=materialDraw(source,'duotone',{color:'#30235a',color2:'#ffc48d',strength:1}),b=materialDraw(source,'duotone',{color:'#30235a',color2:'#ffc48d',strength:.5});return a&&b?{black:materialAt(a,2,4),white:materialAt(a,5,4),half:materialAt(b,2,4),translucent:materialAt(a,8,4)}:null;
  });assert.ok(result,'duotone is implemented');assert.deepEqual(result.black,[48,35,90,255]);assert.deepEqual(result.white,[255,196,141,255]);assert.deepEqual(result.half,[24,18,45,255]);assert.equal(result.translucent[3],128);assert.ok(result.translucent[0]>100&&result.translucent[0]<220);
 }finally{await browser.close();}
});

test('all materials process a 300 dpi card within bounded time and retain output resolution',async()=>{
 const {browser,page,pageErrors}=await openMaterial();try{
  const result=await page.evaluate(kinds=>{
   const source=materialApi.makeSurface({x:0,y:0,w:63,h:88},300),c=source.ctx,g=c.createLinearGradient(0,0,63,88);g.addColorStop(0,'#ce8a3f');g.addColorStop(1,'#315a8a');c.fillStyle=g;c.fillRect(2,2,59,84);c.clearRect(20,30,18,14);const started=performance.now();
   const outputs=kinds.map(kind=>{const a=materialDraw(source,kind);return {kind,available:!!a,size:a?[a.canvas.width,a.canvas.height]:null};});return {elapsed:performance.now()-started,outputs};
  },kinds);for(const item of result.outputs){assert.equal(item.available,true,item.kind);assert.deepEqual(item.size,[744,1039],item.kind);}assert.ok(result.elapsed<12000,'ten full 300 dpi treatments remain bounded: '+result.elapsed.toFixed(0)+'ms');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
