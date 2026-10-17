import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const hasCreative=existsSync(new URL('../src/render/effects/creative-filters.js',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:`import {makeSurface} from './src/render/effects/masks.js'; ${hasCreative?"import {applyCreativeFilter} from './src/render/effects/creative-filters.js';":'const applyCreativeFilter=()=>null;'} window.creativeApi={makeSurface,applyCreativeFilter};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{
 session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 await session.page.evaluate(()=>{
  window.creativePixels=s=>s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data;
  window.creativeHash=s=>{if(!s)return null;let h=2166136261;for(const value of creativePixels(s))h=Math.imul(h^value,16777619);return h>>>0;};
  window.creativeLayer=(kind,params={},motion={enabled:false,speed:1})=>({id:'creative-'+kind,kind,params,motion,opacity:1,scope:'inside',protectText:true});
  window.creativeDraw=(s,kind,params={},options={},motion)=>creativeApi.applyCreativeFilter(s,creativeLayer(kind,params,motion),{timeSec:1.2,seed:29,...options});
  window.creativeAt=(s,x,y)=>Array.from(s.ctx.getImageData(Math.floor((x-s.work.x)*s.scale),Math.floor((y-s.work.y)*s.scale),1,1).data);
  window.creativeFixture=(dpi=127,work={x:-4,y:-3,w:30,h:25})=>{
   const s=creativeApi.makeSurface(work,dpi),c=s.ctx,g=c.createLinearGradient(2,2,18,18);g.addColorStop(0,'#ffffff');g.addColorStop(.4,'#ef8a38');g.addColorStop(1,'#1f94cd');c.fillStyle=g;c.fillRect(2,2,16,15);c.clearRect(7,7,7,7);c.fillStyle='#d4237d';c.globalAlpha=.45;c.fillRect(19,4,2,13);c.globalAlpha=1;return s;
  };
  window.creativePoint=(color=[255,0,0,255])=>{const s=creativeApi.makeSurface({x:0,y:0,w:5,h:5},127),p=s.ctx.createImageData(25,25);p.data.set(color,(12*25+12)*4);s.ctx.putImageData(p,0,0);return s;};
 });
});
after(async()=>{await session?.browser.close();});

test('creative filters return independent deterministic accumulators and leave compositing to their caller',async()=>{
 const result=await session.page.evaluate(()=>['bloom','directionalBlur','displacement'].map(kind=>{
  const s=creativeFixture(),before=creativeHash(s),a=creativeDraw(s,kind),b=creativeDraw(s,kind);if(!a||!b)return {kind,available:false};
  const layer={...creativeLayer(kind),opacity:0,scope:'outside',protectText:false},c=creativeApi.applyCreativeFilter(s,layer,{rect:{x:2,y:2,w:1,h:1},seed:29,timeSec:1.2});
  return {kind,available:true,changed:creativeHash(a)!==before,repeat:creativeHash(a)===creativeHash(b),sourceUntouched:creativeHash(s)===before,independent:a!==s&&a.canvas!==s.canvas,sameCompositorSettings:creativeHash(a)===creativeHash(c),work:a.work,dpi:a.dpi,size:[a.canvas.width,a.canvas.height],farCorner:creativeAt(a,-3,-2)};
 }));
 for(const item of result){assert.equal(item.available,true,item.kind+' returns a full accumulator');assert.equal(item.changed,true,item.kind+' transforms real pixels');assert.equal(item.repeat,true,item.kind);assert.equal(item.sourceUntouched,true,item.kind);assert.equal(item.independent,true,item.kind);assert.equal(item.sameCompositorSettings,true,item.kind);assert.deepEqual(item.work,{x:-4,y:-3,w:30,h:25});assert.equal(item.dpi,127);assert.deepEqual(item.size,[150,125]);assert.deepEqual(item.farCorner,[0,0,0,0]);}
 assert.deepEqual(session.pageErrors,[]);assert.deepEqual(session.httpRequests,[]);
 assert.equal(await session.page.evaluate(()=>creativeDraw(creativeFixture(),'unknown-creative-filter')),null);
});

test('zero physical controls and zero blend strengths are exact independent identities',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativeFixture(),before=creativeHash(s),cases=[['bloom',{strength:0}],['bloom',{radius:0}],['directionalBlur',{strength:0}],['directionalBlur',{distance:0}],['displacement',{amount:0}]];
  return cases.map(([kind,params])=>{const out=creativeDraw(s,kind,params);return {kind,params,identity:!!out&&creativeHash(out)===before,independent:!!out&&out.canvas!==s.canvas};});
 });for(const item of result){assert.equal(item.identity,true,JSON.stringify(item));assert.equal(item.independent,true,item.kind);}
});

test('bloom adds a tinted halo only from bright source energy and preserves dark source and far holes',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativeApi.makeSurface({x:0,y:0,w:24,h:20},254);s.ctx.fillStyle='#ffffff';s.ctx.fillRect(6,6,12,10);s.ctx.clearRect(9,9,6,4);
  s.ctx.fillStyle='#101010';s.ctx.fillRect(1,1,2,2);const before=creativeHash(s),out=creativeDraw(s,'bloom',{threshold:.55,knee:0,radius:1,strength:2,color:'#ff2080'});if(!out)return null;
  const black=creativeApi.makeSurface(s.work,254);black.ctx.fillStyle='#000000';black.ctx.fillRect(3,3,18,14);const dark=creativeDraw(black,'bloom',{threshold:.55,knee:.35,radius:4,strength:3});
  return {halo:creativeAt(out,5.7,7),base:creativeAt(out,7,7),darkBase:creativeAt(out,2,2),hole:creativeAt(out,12,11),far:creativeAt(out,0,19),blackIdentity:creativeHash(black)===creativeHash(dark),untouched:creativeHash(s)===before};
 });assert.ok(result,'bloom is available');assert.ok(result.halo[3]>10,'bright energy expands actual alpha');assert.ok(result.halo[0]>220&&result.halo[1]<60&&result.halo[2]>80&&result.halo[2]<170,'halo follows selected tint');assert.deepEqual(result.base,[255,255,255,255]);assert.deepEqual(result.darkBase,[16,16,16,255]);assert.deepEqual(result.hole,[0,0,0,0]);assert.deepEqual(result.far,[0,0,0,0]);assert.equal(result.blackIdentity,true);assert.equal(result.untouched,true);
});

test('bloom thresholds unassociated luminance while translucent alpha attenuates emitted energy',async()=>{
 const result=await session.page.evaluate(()=>[1,.25].map(alpha=>{
  const s=creativeApi.makeSurface({x:0,y:0,w:16,h:16},254);s.ctx.globalAlpha=alpha;s.ctx.fillStyle='#ffffff';s.ctx.fillRect(6,6,4,4);
  const out=creativeDraw(s,'bloom',{threshold:.8,knee:0,radius:1,strength:1});if(!out)return null;
  const before=creativePixels(s),after=creativePixels(out);let emitted=0;for(let i=3;i<after.length;i+=4)if(!before[i])emitted+=after[i];return emitted;
 }));assert.ok(result.every(value=>value>0),'translucent bright ink still emits bloom');assert.ok(result[1]/result[0]>.19&&result[1]/result[0]<.31,'quarter-alpha ink emits about a quarter of the halo energy');
});

test('bloom soft knee brightens the transition below a hard threshold',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativeApi.makeSurface({x:0,y:0,w:16,h:16},254);s.ctx.fillStyle='#999999';s.ctx.fillRect(6,6,4,4);
  const hard=creativeDraw(s,'bloom',{threshold:.65,knee:0,radius:1,strength:3}),soft=creativeDraw(s,'bloom',{threshold:.65,knee:.6,radius:1,strength:3});if(!hard||!soft)return null;
  return {hardIdentity:creativeHash(hard)===creativeHash(s),softChanged:creativeHash(soft)!==creativeHash(s),halo:creativeAt(soft,5.9,7)};
 });assert.ok(result,'bloom is available');assert.equal(result.hardIdentity,true);assert.equal(result.softChanged,true);assert.ok(result.halo[3]>0);
});

test('directional blur uses centered evenly spaced samples and blends strength in premultiplied RGBA',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativePoint(),draw=(angle,strength=1,samples=5)=>creativeDraw(s,'directionalBlur',{distance:.8,angle,samples,strength}),h=draw(0),v=draw(90),half=draw(0,.5),three=draw(0,1,3);if(!h||!v||!half||!three)return null;
  const at=(surface,x,y)=>Array.from(surface.ctx.getImageData(x,y,1,1).data);
  return {horizontal:Array.from({length:7},(_,i)=>at(h,9+i,12)),vertical:Array.from({length:7},(_,i)=>at(v,12,9+i)),offAxis:at(h,12,11),halfCenter:at(half,12,12),halfEdge:at(half,10,12),threeCenter:at(three,12,12),threeGap:at(three,11,12)};
 });assert.ok(result,'directional blur is available');const expected=[[0,0,0,0],...Array.from({length:5},()=>[255,0,0,51]),[0,0,0,0]];assert.deepEqual(result.horizontal,expected);assert.deepEqual(result.vertical,expected);assert.deepEqual(result.offAxis,[0,0,0,0]);assert.deepEqual(result.halfCenter,[255,0,0,153]);assert.deepEqual(result.halfEdge,[255,0,0,26]);assert.deepEqual(result.threeCenter,[255,0,0,85]);assert.deepEqual(result.threeGap,[0,0,0,0]);
});

test('fractional directional samples retain saturated colors along translucent edges',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativePoint([255,0,0,128]),out=creativeDraw(s,'directionalBlur',{distance:.2,angle:0,samples:3,strength:1});if(!out)return null;
  const at=x=>Array.from(out.ctx.getImageData(x,12,1,1).data);return {left:at(11),center:at(12),right:at(13),far:at(10)};
 });assert.ok(result,'directional blur is available');assert.deepEqual(result.left,[255,0,0,21]);assert.deepEqual(result.center,[255,0,0,85]);assert.deepEqual(result.right,[255,0,0,21]);assert.deepEqual(result.far,[0,0,0,0]);
});

test('displacement honors each axis and samples alpha without dark interpolation fringes',async()=>{
 const result=await session.page.evaluate(()=>['x','y','both'].map(axis=>{
  const s=creativePoint([255,0,0,128]),out=creativeDraw(s,'displacement',{amount:.2,wavelength:4,axis});if(!out)return {axis,available:false};
  const d=creativePixels(out),w=out.canvas.width;let occupied=0,wrongAxis=0,wrongColor=0,emptyGarbage=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]){occupied++;if(axis==='x'&&Math.floor(i/4/w)!==12||axis==='y'&&i/4%w!==12)wrongAxis++;if(d[i]!==255||d[i+1]||d[i+2])wrongColor++;}else if(d[i]||d[i+1]||d[i+2])emptyGarbage++;}
  return {axis,available:true,occupied,wrongAxis,wrongColor,emptyGarbage,changed:creativeHash(s)!==creativeHash(out)};
 }));for(const item of result){assert.equal(item.available,true,item.axis);assert.ok(item.occupied>0,item.axis);assert.equal(item.wrongAxis,0,item.axis);assert.equal(item.wrongColor,0,item.axis+' remains saturated red');assert.equal(item.emptyGarbage,0,item.axis);assert.equal(item.changed,true,item.axis);}
});

test('displacement is deterministic from seed and continuous explicit time beyond six seconds',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativeFixture(),p={amount:1,wavelength:5,axis:'both'},draw=(timeSec,enabled=true,seed=29,speed=1.3)=>creativeDraw(s,'displacement',p,{timeSec,seed},{enabled,speed});
  const first=draw(.8),later=draw(2.1),repeat=draw(.8),before=draw(5.999),after=draw(6.001);if(!first||!later||!repeat||!before||!after)return null;
  const a=creativePixels(before),b=creativePixels(after);let difference=0;for(let i=0;i<a.length;i++)difference+=Math.abs(a[i]-b[i]);
  return {repeat:creativeHash(first)===creativeHash(repeat),moves:creativeHash(first)!==creativeHash(later),staticTime:creativeHash(draw(.1,false))===creativeHash(draw(100,false)),seedChanges:creativeHash(first)!==creativeHash(draw(.8,true,311)),noSixSecondWrap:creativeHash(draw(7.3))!==creativeHash(draw(1.3)),boundaryMeanDifference:difference/a.length,speedEquivalent:creativeHash(draw(2,true,29,1))===creativeHash(draw(1,true,29,2))};
 });assert.ok(result,'displacement is available');assert.equal(result.repeat,true);assert.equal(result.moves,true);assert.equal(result.staticTime,true);assert.equal(result.seedChanges,true);assert.equal(result.noSixSecondWrap,true);assert.ok(result.boundaryMeanDifference<.5,'phase moves smoothly across six seconds');assert.equal(result.speedEquivalent,true);
});

test('displacement uses millimeter world coordinates consistently when the work rectangle changes',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=creativeFixture(127,{x:-4,y:-3,w:30,h:25}),b=creativeApi.makeSurface({x:-3.6,y:-2.6,w:29.2,h:24.2},127),p={amount:.7,wavelength:4.5,axis:'both'};
  // A literal pixel crop avoids Canvas gradient dithering changing the fixture.
  b.ctx.putImageData(a.ctx.getImageData(2,2,b.canvas.width,b.canvas.height),0,0);
  const outA=creativeDraw(a,'displacement',p),outB=creativeDraw(b,'displacement',p);if(!outA||!outB)return null;
  const pa=creativePixels(outA),pb=creativePixels(outB),wa=outA.canvas.width,wb=outB.canvas.width;let mismatches=0;
  for(let y=10;y<outB.canvas.height-10;y++)for(let x=10;x<wb-10;x++)for(let c=0;c<4;c++)if(pa[((y+2)*wa+x+2)*4+c]!==pb[(y*wb+x)*4+c])mismatches++;
  return {mismatches,hole:creativeAt(outA,10,10),far:creativeAt(outA,-3,-2)};
 });assert.ok(result,'displacement is available');assert.equal(result.mismatches,0,'sampling phase follows world position, not canvas origin');assert.deepEqual(result.hole,[0,0,0,0]);assert.deepEqual(result.far,[0,0,0,0]);
});

test('creative filter controls clamp unsafe values and invalid numbers use finite defaults',async()=>{
 const result=await session.page.evaluate(()=>{
  const s=creativeFixture(),cases=[
   ['bloom',{threshold:-4,knee:9,radius:90,strength:20,color:'bad'},{threshold:0,knee:1,radius:12,strength:3,color:'#ffffff'}],
   ['directionalBlur',{distance:90,angle:900,samples:99,strength:12},{distance:8,angle:180,samples:25,strength:1}],
   ['displacement',{amount:20,wavelength:0,axis:'bad'},{amount:3,wavelength:.5,axis:'both'}]
  ];
  const clamped=cases.map(([kind,invalid,expected])=>{const a=creativeDraw(s,kind,invalid),b=creativeDraw(s,kind,expected);return {kind,available:!!a&&!!b,same:creativeHash(a)===creativeHash(b)};});
  const defaults=['bloom','directionalBlur','displacement'].map(kind=>{const a=creativeDraw(s,kind,{threshold:NaN,knee:Infinity,radius:NaN,strength:Infinity,distance:NaN,angle:Infinity,samples:NaN,amount:NaN,wavelength:Infinity}),b=creativeDraw(s,kind);return {kind,available:!!a&&!!b,same:creativeHash(a)===creativeHash(b)};});
  return {clamped,defaults};
 });for(const item of [...result.clamped,...result.defaults]){assert.equal(item.available,true,item.kind);assert.equal(item.same,true,item.kind+' has bounded finite parameters');}
});

test('maximum physical controls keep empty accumulators empty and finish a 300dpi card within bounded work',async t=>{
 const result=await session.page.evaluate(()=>{
  const cases=[['bloom',{radius:12,strength:3}],['directionalBlur',{distance:8,samples:25}],['displacement',{amount:3,wavelength:.5}]];
  return cases.map(([kind,params])=>{
   const empty=creativeApi.makeSurface({x:-2,y:-2,w:16,h:16},300),blank=creativeDraw(empty,kind,params),s=creativeApi.makeSurface({x:0,y:0,w:63,h:88},300);s.ctx.fillStyle='#ffffff';s.ctx.fillRect(12,16,39,56);s.ctx.clearRect(23,32,17,24);
   const start=performance.now(),out=creativeDraw(s,kind,params),elapsed=performance.now()-start;if(!out||!blank)return {kind,available:false};
   const d=creativePixels(out);return {kind,available:true,empty:creativePixels(blank).every(v=>v===0),size:[out.canvas.width,out.canvas.height],visible:d.some((v,i)=>i%4===3&&v>0),elapsed};
  });
 });for(const item of result){assert.equal(item.available,true,item.kind);assert.equal(item.empty,true,item.kind);assert.equal(item.visible,true,item.kind);assert.deepEqual(item.size,[744,1039]);assert.ok(item.elapsed<8000,item.kind+' avoids radius-squared or unbounded sampling');t.diagnostic(item.kind+' maximum-control 300dpi card: '+Math.round(item.elapsed)+' ms');}
 assert.deepEqual(session.pageErrors,[]);
});
