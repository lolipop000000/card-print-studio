import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
// Missing production code becomes a public-contract assertion in the RED run.
const spriteImport=existsSync(path.join(root,'src/render/effects/sprite-emitter.js'))?"import * as sprite from './src/render/effects/sprite-emitter.js';":"const sprite={};";
const bundle=await build({absWorkingDir:root,stdin:{contents:spriteImport+"import {effectRandom} from './src/render/effects/random.js';window.spriteApi={...sprite,effectRandom};",resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022'});
async function openSprites(){
 const session=await openHarness();
 await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 await session.page.evaluate(()=>{
  const hash=data=>{let h=2166136261;for(const value of data)h=Math.imul(h^value,16777619);return h>>>0;};
  window.makeSpriteFixture=()=>{
   const source=document.createElement('canvas');source.width=40;source.height=20;
   const g=source.getContext('2d');g.fillStyle='#e63c22';g.fillRect(4,4,12,12);g.fillStyle='#1446f0';g.fillRect(24,4,12,12);
   g.clearRect(8,8,4,4);g.fillStyle='rgba(230,60,34,.5)';g.fillRect(8,8,4,4);return source;
  };
  window.renderSprite=async options=>{
   const api=window.spriteApi,scale=12,canvas=document.createElement('canvas');canvas.width=960;canvas.height=840;
   const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.globalAlpha=options.opacity??1;ctx.fillStyle='#237c91';ctx.strokeStyle='#762b4c';ctx.lineWidth=.23;ctx.lineCap='square';ctx.lineJoin='bevel';ctx.setLineDash([.3,.1]);ctx.lineDashOffset=.1;ctx.filter='none';
   if(options.transform){ctx.translate(3,2);ctx.rotate(.13);}
   const snapshot=()=>({alpha:ctx.globalAlpha,fill:ctx.fillStyle,stroke:ctx.strokeStyle,width:ctx.lineWidth,cap:ctx.lineCap,join:ctx.lineJoin,dash:ctx.getLineDash(),offset:ctx.lineDashOffset,filter:ctx.filter,composite:ctx.globalCompositeOperation,transform:['a','b','c','d','e','f'].map(k=>ctx.getTransform()[k])});
   const before=snapshot(),included=[],seed=options.seed??77,id='sprite-test';
   const params=options.defaults?{}:{shape:'circle',count:1,sizeStart:.12,sizeEnd:.12,travel:0,spread:0,life:2,direction:0,spin:0,rotation:0,gravity:0,fadeIn:0,fadeOut:0,alphaStart:1,alphaEnd:1,drift:0,randomness:0,color:'#5577a9',color2:'#5577a9',...options.params};
   const source=options.source??window.makeSpriteFixture(),sourceCtx=source.getContext('2d'),sourceBefore=hash(sourceCtx.getImageData(0,0,source.width,source.height).data);
   let image=options.missingImage?null:source;
   if(options.imageElement){image=new Image();image.src=source.toDataURL();await image.decode();}
   const random=(index,salt)=>api.effectRandom(seed,id,index,salt),point=(index,cycle=0,salt='emit')=>{
    if(options.empty)return null;
    if(options.pointMode==='cycle')return {x:20+random(index,cycle+':'+salt)*35,y:25+random(index,cycle+':y')*15};
    if(options.pointMode==='row')return {x:16+index*12,y:35};
    return {x:40,y:35,nx:0,ny:-1};
   };
   const started=performance.now(),supported=api.drawSpriteEmitter(ctx,{id,kind:options.kind??'sprite',opacity:options.layerOpacity??1,params},{time:options.time??.6,height:10,point,random,include:(x,y,radius)=>included.push({x,y,radius}),image});
   const elapsed=performance.now()-started,after=snapshot(),data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   let alpha=0,pixels=0,maxAlpha=0,mx=0,my=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
   for(let at=0;at<data.length;at+=4){const value=data[at+3];if(!value)continue;const x=(at/4)%canvas.width,y=Math.floor(at/4/canvas.width);alpha+=value;maxAlpha=Math.max(maxAlpha,value);mx+=x*value;my+=y*value;if(value>1){pixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
   const bounds=included.length?{x:Math.min(...included.map(p=>p.x-p.radius)),y:Math.min(...included.map(p=>p.y-p.radius)),right:Math.max(...included.map(p=>p.x+p.radius)),bottom:Math.max(...included.map(p=>p.y+p.radius))}:null;
   const samples=(options.samples??[]).map(([x,y])=>Array.from(ctx.getImageData(Math.floor(x*scale),Math.floor(y*scale),1,1).data));
   return {supported,before,after,pixels,alpha,maxAlpha,bounds,included,elapsed,samples,hash:hash(data),sourceBefore,sourceAfter:hash(sourceCtx.getImageData(0,0,source.width,source.height).data),centroid:alpha?{x:mx/alpha/scale,y:my/alpha/scale}:null,extent:maxX<0?null:{x:minX/scale,y:minY/scale,right:(maxX+1)/scale,bottom:(maxY+1)/scale}};
  };
 });return session;
}
const render=(page,options={})=>page.evaluate(options=>window.renderSprite(options),options);
async function requireEmitter(page){assert.equal(await page.evaluate(()=>typeof window.spriteApi.drawSpriteEmitter),'function','drawSpriteEmitter is implemented');}
function contained(result){assert.ok(result.bounds,'visible sprites report bounds');assert.ok(result.extent.x>=result.bounds.x-.1&&result.extent.y>=result.bounds.y-.1&&result.extent.right<=result.bounds.right+.1&&result.extent.bottom<=result.bounds.bottom+.1,JSON.stringify({extent:result.extent,bounds:result.bounds}));}
function closeChannel(actual,expected,tolerance=2){assert.ok(Math.abs(actual-expected)<=tolerance,'channel '+actual+' is close to '+expected);}

// A missing kind dispatch, shared placeholder silhouette, or leaked state fails.
test('sprite primitives draw distinct transparent silhouettes and restore Canvas state',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openSprites();try{
  await requireEmitter(page);const hashes=[];
  for(const shape of ['star','circle','rune','diamond','petal','snowflake']){
   const plain=await render(page,{params:{shape}});assert.equal(plain.supported,true,shape);assert.ok(plain.pixels>20,shape+' has real pixels');contained(plain);hashes.push(plain.hash);
   const transformed=await render(page,{params:{shape},transform:true,opacity:.7});assert.deepEqual(transformed.after,transformed.before,shape+' restores state');
  }
  assert.equal(new Set(hashes).size,6,'each primitive has its own silhouette');
  for(const kind of ['unknown','toString','constructor','__proto__']){const result=await render(page,{kind});assert.equal(result.supported,false);assert.equal(result.alpha,0);assert.deepEqual(result.after,result.before);}
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

// Filling an image rectangle, trimming transparent margins, stretching the source,
// or tinting original mode breaks these literal pixel and aspect expectations.
test('original image sprites retain source colors, partial alpha, holes and aspect ratio',async()=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);
  for(const imageElement of [false,true]){
   const result=await render(page,{imageElement,params:{shape:'image',tint:'original',sizeStart:.3,sizeEnd:.3},samples:[[38.5,35],[41.5,35],[40,35],[37.1,33.6]]});
   assert.ok(result.pixels>150);assert.equal(result.sourceAfter,result.sourceBefore);assert.equal(result.samples[0][3],128);closeChannel(result.samples[0][0],230);closeChannel(result.samples[0][1],60);closeChannel(result.samples[0][2],34);
   assert.deepEqual(result.samples[1],[20,70,240,255]);assert.deepEqual(result.samples[2],[0,0,0,0]);assert.deepEqual(result.samples[3],[0,0,0,0]);
   const ratio=(result.extent.right-result.extent.x)/(result.extent.bottom-result.extent.y);assert.ok(Math.abs(ratio-32/12)<.25,'source occupied aspect ratio is retained: '+ratio);contained(result);
  }
 }finally{await browser.close();}
});

// A color overlay that fills alpha holes, damages the source, or ignores lifetime
// interpolation fails on the same semitransparent source pixels.
test('image tint uses the source alpha mask and lifetime tint interpolates the two colors',async()=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);
  const common={time:.5,params:{shape:'image',sizeStart:.3,sizeEnd:.3,tint:'tint',color:'#30c050'},samples:[[38.5,35],[41.5,35],[40,35]]};
  const fixed=await render(page,common);for(let i=0;i<3;i++){closeChannel(fixed.samples[0][i],[48,192,80][i]);closeChannel(fixed.samples[1][i],[48,192,80][i]);}assert.equal(fixed.samples[0][3],128);assert.equal(fixed.samples[1][3],255);assert.deepEqual(fixed.samples[2],[0,0,0,0]);assert.equal(fixed.sourceAfter,fixed.sourceBefore);
  const changing=await render(page,{...common,params:{...common.params,tint:'lifetime',color:'#ff0000',color2:'#0000ff'}});for(let i=0;i<3;i++)closeChannel(changing.samples[1][i],[191,0,64][i]);assert.equal(changing.samples[0][3],128);assert.deepEqual(changing.samples[2],[0,0,0,0]);assert.equal(changing.sourceAfter,changing.sourceBefore);
 }finally{await browser.close();}
});

// Reusing a tinted canvas after a mutable source changes would retain old pixels.
test('tinted canvas sources remain live and missing image assets emit no rectangle',async()=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);
  const result=await page.evaluate(async()=>{
   const source=window.makeSpriteFixture(),options={source,params:{shape:'image',tint:'tint',sizeStart:.3,sizeEnd:.3,color:'#30c050'},samples:[[40,35]]};
   const first=await window.renderSprite(options),g=source.getContext('2d');g.fillStyle='#e63c22';g.fillRect(16,4,8,12);const second=await window.renderSprite(options);return {first,second};
  });assert.equal(result.first.samples[0][3],0);assert.equal(result.second.samples[0][3],255);assert.notEqual(result.first.hash,result.second.hash);assert.equal(result.second.sourceAfter,result.second.sourceBefore);
  const missing=await render(page,{missingImage:true,params:{shape:'image'}});assert.equal(missing.supported,true);assert.equal(missing.pixels,0);assert.equal(missing.bounds,null);
  const empty=await render(page,{empty:true});assert.equal(empty.pixels,0);assert.equal(empty.bounds,null);assert.deepEqual(empty.after,empty.before);
 }finally{await browser.close();}
});

// Reversing endpoint sizes must reverse the visible lifetime size progression.
test('sprite radii grow and shrink monotonically between the independently chosen endpoints',async t=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);const grow=[],shrink=[];
  for(const time of [.4,1,1.6]){
   const a=await render(page,{time,params:{sizeStart:.03,sizeEnd:.2}}),b=await render(page,{time,params:{sizeStart:.2,sizeEnd:.03}});grow.push(a.pixels);shrink.push(b.pixels);contained(a);contained(b);
  }
  assert.ok(grow[0]<grow[1]&&grow[1]<grow[2],JSON.stringify(grow));assert.ok(shrink[0]>shrink[1]&&shrink[1]>shrink[2],JSON.stringify(shrink));assert.deepEqual(grow,[...shrink].reverse());t.diagnostic('visible pixel areas, grow='+grow.join(',')+' shrink='+shrink.join(','));
 }finally{await browser.close();}
});

// Missing either envelope creates visible pop-in at a lifetime boundary. Layer
// opacity belongs to the compositor and must not be applied again here.
test('fade envelopes vanish at both lifetime edges and alpha endpoints preserve caller opacity',async()=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);const params={fadeIn:.1,fadeOut:.35};
  const born=await render(page,{time:0,params}),first=await render(page,{time:.0001,params}),middle=await render(page,{time:1,params}),last=await render(page,{time:1.9999,params}),reborn=await render(page,{time:2,params});
  assert.equal(born.alpha,0);assert.ok(first.maxAlpha<=1);assert.equal(middle.maxAlpha,255);assert.ok(last.maxAlpha<=1);assert.equal(reborn.alpha,0);
  const immediate=await render(page,{time:0,params:{fadeIn:0,fadeOut:0}});assert.equal(immediate.maxAlpha,255);
  const endpoints=await render(page,{time:.5,opacity:.4,layerOpacity:.1,params:{alphaStart:.8,alphaEnd:.2}});closeChannel(endpoints.maxAlpha,66,1);assert.deepEqual(endpoints.after,endpoints.before);
 }finally{await browser.close();}
});

// Nonrandom tracks have uniform temporal spacing and repeat after one full life,
// even when the caller can supply a new origin for every cycle.
test('zero randomness evenly spaces births and repeats fixed per-index life tracks',async()=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);const fades={count:4,fadeIn:.1,fadeOut:.1,sizeStart:.08,sizeEnd:.08};
  for(const [time,invisible] of [[0,0],[.5,3],[1,2],[1.5,1]]){
   const result=await render(page,{time,pointMode:'row',params:fades,samples:[[16,35],[28,35],[40,35],[52,35]]});assert.deepEqual(result.samples.map(p=>p[3]),[0,1,2,3].map(index=>index===invisible?0:255));
  }
  const options={time:.43,pointMode:'cycle',params:{count:7,travel:.7,spread:.9,spin:.7,drift:.3,randomness:0}};
  const first=await render(page,options),nextCycle=await render(page,{...options,time:2.43});assert.equal(nextCycle.hash,first.hash,'the same lifetime phase reuses the same tracks');
 }finally{await browser.close();}
});

// Frame-dependent randomness or stale time makes these rendered hashes fail.
test('seed and explicit time reproduce sprite motion while time and seed changes alter it',async t=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);const options={time:.61,pointMode:'cycle',params:{shape:'star',count:24,travel:.7,spread:.8,spin:.4,gravity:.1,drift:.3,randomness:1,fadeIn:.1,fadeOut:.3,sizeStart:.04,sizeEnd:.1}};
  const first=await render(page,options),repeat=await render(page,options),later=await render(page,{...options,time:.86}),otherSeed=await render(page,{...options,seed:78});
  assert.equal(repeat.hash,first.hash);assert.notEqual(later.hash,first.hash);assert.notEqual(otherSeed.hash,first.hash);contained(first);contained(later);assert.ok(first.pixels>100);
  const near=await render(page,{time:.6101,params:{...options.params,count:1,fadeIn:0,fadeOut:0}}),before=await render(page,{time:.61,params:{...options.params,count:1,fadeIn:0,fadeOut:0}});assert.ok(Math.hypot(near.centroid.x-before.centroid.x,near.centroid.y-before.centroid.y)<.05,'a nearby time stays on a continuous trajectory');
  t.diagnostic('seed/time hashes '+[first,repeat,later,otherSeed].map(r=>r.hash).join(','));
 }finally{await browser.close();}
});

// Ignoring physical age in gravity or sharing one size for all ages breaks the
// literal acceleration and visible maximum-count scenes.
test('gravity accelerates over a lifetime and the maximum count keeps conservative bounds',async t=>{
 const {browser,page}=await openSprites();try{
  await requireEmitter(page);const early=await render(page,{time:.5,params:{gravity:1}}),late=await render(page,{time:1,params:{gravity:1}});closeChannel(early.centroid.y,36.25,.08);closeChannel(late.centroid.y,40,.08);
  const maximum=await render(page,{time:.7,pointMode:'cycle',imageElement:true,params:{shape:'image',tint:'lifetime',count:120,sizeStart:.03,sizeEnd:.1,travel:.3,spread:.7,randomness:1,fadeIn:.1,fadeOut:.35,color:'#ff3300',color2:'#3388ff'}});
  assert.ok(maximum.pixels>1000);assert.ok(maximum.included.length>90&&maximum.included.length<=120);contained(maximum);assert.deepEqual(maximum.after,maximum.before);t.diagnostic('120 tinted image sprites: '+maximum.elapsed.toFixed(2)+' ms render call; '+maximum.included.length+' visible bounds');
 }finally{await browser.close();}
});
