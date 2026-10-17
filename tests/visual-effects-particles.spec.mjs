import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness,qa} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const kinds=['firefly','bubble','petal','leaf','snowflake','crystal','confetti','comet','rain','dust','rune','vortex'];
// A missing module is bundled as an empty export so the RED run fails on the
// public contract assertion, rather than on an esbuild resolution error.
const particleImport=existsSync(path.join(root,'src/render/effects/particle-generators.js'))?"import * as particles from './src/render/effects/particle-generators.js';":"const particles={};";
const bundle=await build({absWorkingDir:root,stdin:{contents:particleImport+"import {effectRandom} from './src/render/effects/random.js';window.particleApi={...particles,effectRandom};",resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022'});
async function openParticles(){
 const session=await openHarness();
 await session.page.addScriptTag({content:bundle.outputFiles[0].text});
 await session.page.evaluate(()=>{
  window.renderParticle=options=>{
   const a=window.particleApi,scale=12,canvas=document.createElement('canvas');canvas.width=960;canvas.height=840;
   const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.globalAlpha=options.opacity??1;ctx.fillStyle='#237c91';ctx.strokeStyle='#762b4c';ctx.lineWidth=.23;ctx.lineCap='square';ctx.lineJoin='bevel';ctx.setLineDash([.3,.1]);ctx.lineDashOffset=.1;ctx.shadowBlur=0;ctx.filter='none';
   if(options.transform){ctx.translate(3,2);ctx.rotate(.13);}
   const snapshot=()=>({alpha:ctx.globalAlpha,fill:ctx.fillStyle,stroke:ctx.strokeStyle,width:ctx.lineWidth,cap:ctx.lineCap,join:ctx.lineJoin,dash:ctx.getLineDash(),offset:ctx.lineDashOffset,filter:ctx.filter,composite:ctx.globalCompositeOperation,transform:[...['a','b','c','d','e','f'].map(k=>ctx.getTransform()[k])]});
   const before=snapshot(),includes=[],points=options.empty?[]:options.points??[{x:40,y:35,nx:0,ny:-1}],seed=options.seed??77,id='particle-test';
   const random=(index,salt)=>options.controlled?(salt==='phase'?0:.5):a.effectRandom(seed,id,index,salt);
   const params=options.defaults?{}:{count:1,size:.12,travel:0,spread:0,life:2,direction:0,fade:1,spin:0,color:'#5577a9',color2:'#5577a9',...options.params};
   const time=options.static?1.2:(options.time??.6)*(options.speed??1);
   const supported=a.drawParticleGenerator(ctx,{id,kind:options.kind,params},{time,height:10,point:(index,cycle)=>points.length?points[Math.floor(a.effectRandom(seed,id,index,cycle+':emit')*points.length)]:null,random,include:(x,y,radius)=>includes.push({x,y,radius})});
   const after=snapshot(),data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
   let alpha=0,pixels=0,maxAlpha=0,mx=0,my=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1,contrasting=0;
   const columns=new Array(canvas.width).fill(0),linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},paper=.2126*linear(255)+.7152*linear(253)+.0722*linear(248);
   for(let n=0;n<data.length;n+=4){const v=data[n+3];if(!v)continue;const x=(n/4)%canvas.width,y=Math.floor(n/4/canvas.width);alpha+=v;mx+=x*v;my+=y*v;columns[x]+=v;maxAlpha=Math.max(maxAlpha,v);if(v>1){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}if(v>8){pixels++;const opacity=v/255,r=data[n]*opacity+255*(1-opacity),g=data[n+1]*opacity+253*(1-opacity),b=data[n+2]*opacity+248*(1-opacity);if(paper-(.2126*linear(r)+.7152*linear(g)+.0722*linear(b))>.1)contrasting++;}}
   const mask=[];for(let y=260;y<580;y+=4)for(let x=320;x<640;x+=4){let on=false;for(let dy=0;dy<4&&!on;dy++)for(let dx=0;dx<4;dx++)if(data[((y+dy)*canvas.width+x+dx)*4+3]>16){on=true;break;}mask.push(on?'1':'0');}
   const bounds=includes.length?{x:Math.min(...includes.map(p=>p.x-p.radius)),y:Math.min(...includes.map(p=>p.y-p.radius)),right:Math.max(...includes.map(p=>p.x+p.radius)),bottom:Math.max(...includes.map(p=>p.y+p.radius))}:null;
   const center=((35*scale)*canvas.width+40*scale)*4+3;
   const samples=(options.samples??[]).map(([x,y])=>[...ctx.getImageData(Math.round(x*scale),Math.round(y*scale),1,1).data]);return {samples,supported,before,after,alpha,pixels,maxAlpha,centroid:alpha?{x:mx/alpha/scale,y:my/alpha/scale}:null,extent:maxX<0?null:{x:minX/scale,y:minY/scale,right:(maxX+1)/scale,bottom:(maxY+1)/scale},bounds,includes:includes.length,mask:mask.join(''),columns,centerAlpha:data[center],png:canvas.toDataURL(),contrast:pixels?contrasting/pixels:0};
  };
 });
 return session;
}
async function requireParticle(page){assert.equal(await page.evaluate(()=>typeof window.particleApi.drawParticleGenerator),'function','drawParticleGenerator is implemented');}
const render=(page,kind,options={})=>page.evaluate(options=>window.renderParticle(options),{kind,...options});
function silhouetteDistance(a,b){let union=0,different=0;for(let i=0;i<a.length;i++){if(a[i]==='1'||b[i]==='1')union++;if(a[i]!==b[i])different++;}return union?different/union:0;}

// Removing a kind or emitting no real Canvas pixels must fail here.
test('all twelve particle kinds render and preserve the caller Canvas state',async()=>{
 const {browser,page,pageErrors}=await openParticles();try{
  await requireParticle(page);
  for(const kind of kinds){const r=await render(page,kind,{transform:true});assert.equal(r.supported,true,kind);assert.ok(r.pixels>12,kind+' has visible shape');assert.deepEqual(r.after,r.before,kind+' restores Canvas state');assert.ok(r.includes>0,kind+' records bounds');}
  for(const kind of ['unrecognized','toString','constructor','__proto__']){const unsupported=await render(page,kind);assert.equal(unsupported.supported,false,kind+' is unsupported');assert.equal(unsupported.alpha,0);assert.deepEqual(unsupported.after,unsupported.before);}assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

// A generic shape reused with new colors has identical monochrome occupancy.
test('the twelve particle silhouettes differ even with identical colors',async t=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);const scenes={};for(const kind of kinds)scenes[kind]=await render(page,kind,{controlled:true});
  let minimum=1,pair='';for(let i=0;i<kinds.length;i++)for(let j=i+1;j<kinds.length;j++){const distance=silhouetteDistance(scenes[kinds[i]].mask,scenes[kinds[j]].mask);if(distance<minimum){minimum=distance;pair=kinds[i]+'/'+kinds[j];}assert.ok(distance>.08,kinds[i]+' and '+kinds[j]+' need distinct paths; distance='+distance);}
  t.diagnostic('nearest monochrome pair='+pair+', silhouette difference='+minimum.toFixed(3));
 }finally{await browser.close();}
});

// Wall-clock reads, shared particle history, or ignoring the seed break this.
test('saved seed and canonical time produce repeatable static and animated particles',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of kinds){const first=await render(page,kind,{params:{count:12,travel:.5,spread:.8}}),same=await render(page,kind,{params:{count:12,travel:.5,spread:.8}}),differentSeed=await render(page,kind,{seed:971,params:{count:12,travel:.5,spread:.8}}),later=await render(page,kind,{time:1.4,params:{count:12,travel:.5,spread:.8}});assert.equal(first.png,same.png,kind);assert.notEqual(first.png,differentSeed.png,kind+' responds to saved seed');assert.notEqual(first.png,later.png,kind+' animates from time');const frozen=await render(page,kind,{static:true,time:.1}),frozenLater=await render(page,kind,{static:true,time:5.8});assert.equal(frozen.png,frozenLater.png,kind+' remains static at caller frame 1.2s');}
 }finally{await browser.close();}
});

test('empty emission stays empty and selected emission points anchor the shapes',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of kinds){const empty=await render(page,kind,{empty:true});assert.equal(empty.supported,true,kind);assert.equal(empty.alpha,0,kind);assert.equal(empty.bounds,null,kind);assert.deepEqual(empty.after,empty.before);const left=await render(page,kind,{controlled:true,points:[{x:20,y:30,nx:0,ny:-1}]}),right=await render(page,kind,{controlled:true,points:[{x:50,y:40,nx:1,ny:0}]});assert.ok(Math.abs(right.centroid.x-left.centroid.x-30)<.08,kind+' uses the supplied x');assert.ok(Math.abs(right.centroid.y-left.centroid.y-10)<.08,kind+' uses the supplied y');}
 }finally{await browser.close();}
});

test('all particle types multiply caller opacity and fade at birth and death',async t=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of kinds){const alive=await render(page,kind,{controlled:true}),dim=await render(page,kind,{controlled:true,opacity:.2}),born=await render(page,kind,{controlled:true,time:0}),young=await render(page,kind,{controlled:true,time:.01}),dying=await render(page,kind,{controlled:true,time:1.99}),nextBirth=await render(page,kind,{controlled:true,time:2});assert.ok(alive.alpha>200,kind+' is present midlife');t.diagnostic(kind+' opacity mass ratio='+(dim.alpha/alive.alpha).toFixed(3));assert.ok(dim.alpha<alive.alpha*.4,kind+' multiplies inherited alpha despite overlapping strokes');assert.equal(born.alpha,0,kind+' starts transparent');assert.ok(young.alpha<alive.alpha*.05,kind+' fades in');assert.ok(dying.alpha<alive.alpha*.03,kind+' fades to zero');assert.equal(nextBirth.alpha,0,kind+' has no death-to-birth pop');const slow=await render(page,kind,{controlled:true,time:1.3,params:{fade:.2}}),fast=await render(page,kind,{controlled:true,time:1.3,params:{fade:4}});assert.ok(fast.alpha<slow.alpha*.35,kind+' fade exponent changes decay');}
 }finally{await browser.close();}
});

test('count size travel spread direction and life controls change real particle output',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of kinds){const one=await render(page,kind,{params:{count:1,size:.035,travel:.5,spread:.8}}),many=await render(page,kind,{params:{count:24,size:.035,travel:.5,spread:.8}});assert.ok(many.pixels>one.pixels*2,kind+' count creates more particles');const small=await render(page,kind,{controlled:true,params:{size:.025}}),large=await render(page,kind,{controlled:true,params:{size:.1}});assert.ok(large.pixels>small.pixels*2,kind+' size scales its shape');const still=await render(page,kind,{controlled:true}),moved=await render(page,kind,{controlled:true,params:{travel:1}});assert.ok(moved.centroid.x-still.centroid.x>1.7,kind+' travel moves along direction');const down=await render(page,kind,{controlled:true,params:{travel:1,direction:90}}),up=await render(page,kind,{controlled:true,params:{travel:1,direction:-90}});assert.ok(down.centroid.y-up.centroid.y>3,kind+' direction orients movement');const narrow=await render(page,kind,{params:{count:12,travel:.6,spread:0}}),wide=await render(page,kind,{params:{count:12,travel:.6,spread:1.5}});assert.notEqual(narrow.png,wide.png,kind+' spread changes movement');const short=await render(page,kind,{params:{count:8,life:.5,travel:.5}}),long=await render(page,kind,{params:{count:8,life:5,travel:.5}});assert.notEqual(short.png,long.png,kind+' life changes particle ages');}
 }finally{await browser.close();}
});

test('spin rotates petals leaves snow crystals confetti rune shards and vortex paths',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of ['petal','leaf','snowflake','crystal','confetti','rune','vortex']){const stopped=await render(page,kind,{controlled:true,params:{spin:0}}),spinning=await render(page,kind,{controlled:true,params:{spin:.37}});assert.notEqual(stopped.png,spinning.png,kind+' spin rotates the visible shape');}
 }finally{await browser.close();}
});

test('bubble interiors stay transparent and comet and rain trails taper to transparent tips',async t=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);const bubble=await render(page,'bubble',{controlled:true});assert.equal(bubble.centerAlpha,0,'a bubble is a ring rather than a filled disc');assert.ok(bubble.maxAlpha>30);
  for(const kind of ['comet','rain']){const r=await render(page,kind,{controlled:true,params:{size:.15}}),occupied=r.columns.map((v,i)=>v>0?i:-1).filter(i=>i>=0),left=occupied[0],head=40*12,span=head-left;assert.ok(span>36,kind+' has a tail longer than its head');const average=(from,to)=>r.columns.slice(from,to).reduce((a,b)=>a+b,0)/Math.max(1,to-from),tip=average(left,left+Math.floor(span*.18)),middle=average(left+Math.floor(span*.45),left+Math.floor(span*.7));assert.ok(tip<middle*.6,kind+' tail tip fades rather than stopping with a hard opaque end');t.diagnostic(kind+' trail alpha: tip='+tip.toFixed(1)+', middle='+middle.toFixed(1));}
 }finally{await browser.close();}
});

test('conservative particle bounds contain rotated shapes and full tails',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of kinds)for(const time of [.4,1.6]){const r=await render(page,kind,{time,params:{count:12,size:.13,travel:1.8,spread:2,spin:2.3}});assert.ok(r.extent&&r.bounds,kind);assert.ok(r.extent.x>=r.bounds.x-.12,kind+' left bound');assert.ok(r.extent.y>=r.bounds.y-.12,kind+' upper bound');assert.ok(r.extent.right<=r.bounds.right+.12,kind+' right bound');assert.ok(r.extent.bottom<=r.bounds.bottom+.12,kind+' lower bound');}
 }finally{await browser.close();}
});

test('colored solid particles retain dark detail on bright paper',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  for(const kind of ['petal','leaf','snowflake','crystal','confetti','rune']){const r=await render(page,kind,{controlled:true,params:{color:'#efca78',color2:'#f3dfab'}});assert.ok(r.contrast>.15,kind+' has a modest contrasting border or facet');}
 }finally{await browser.close();}
});

test('particle atlas records the twelve default shapes on bright paper',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openParticles();try{
  await requireParticle(page);
  await page.evaluate(async kinds=>{document.body.style.cssText='margin:0;padding:24px;background:#e9e1d1;display:grid;grid-template-columns:repeat(3,420px);gap:16px';for(const kind of kinds){const points=Array.from({length:12},(_,i)=>({x:30+i*1.8,y:35,nx:0,ny:-1})),scene=window.renderParticle({kind,defaults:true,time:1.2,points}),detail=window.renderParticle({kind,controlled:true}),card=document.createElement('div'),label=document.createElement('div'),canvas=document.createElement('canvas'),image=new Image(),icon=new Image();image.src=scene.png;icon.src=detail.png;await Promise.all([image.decode(),icon.decode()]);canvas.width=600;canvas.height=470;const g=canvas.getContext('2d');g.fillStyle='#fffdf8';g.fillRect(0,0,600,470);g.drawImage(image,24*12,21*12,33*12,27*12,0,0,600,330);g.drawImage(icon,25*12,25*12,30*12,20*12,0,300,300,200);g.fillStyle='#766b60';g.font='16px sans-serif';g.fillText('enlarged single shape',280,424);card.style.cssText='background:#fffdf8;padding:8px;box-shadow:0 2px 8px #b6aa95';canvas.style.cssText='width:400px;height:313px;display:block';label.textContent=kind+' / defaults / fixed seed / 1.2s';label.style.cssText='font:600 15px sans-serif;color:#473a30;padding:6px';card.append(canvas,label);document.body.append(card);}},kinds);
  await page.screenshot({path:path.join(qa,'particles-atlas.png'),fullPage:true});assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});


// Invalid alpha colors would make the two equally colored crystal faces flat.
test('crystal facets retain shaded planes when both selected colors match',async()=>{
 const {browser,page}=await openParticles();try{
  await requireParticle(page);
  const r=await render(page,'crystal',{controlled:true,params:{color:'#efca78',color2:'#efca78'},samples:[[39.7,35.48],[40.54,35.06]]});
  assert.ok(r.samples[1][0]-r.samples[0][0]>12,'the right facet has darker red than the lit left facet: '+JSON.stringify(r.samples));
 }finally{await browser.close();}
});
