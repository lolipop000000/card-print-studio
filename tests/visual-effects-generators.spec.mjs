import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openHarness,qa} from './helpers/browser.mjs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
// Bundle only this task's modules into the existing isolated browser fixture.
// This never rewrites the shared harness while other workers run their tests.
const qualityBundle=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),stdin:{contents:"import * as masks from './src/render/effects/masks.js';import * as shape from './src/render/effects/shape.js';import * as textures from './src/render/effects/textures.js';import * as generators from './src/render/effects/generators.js';Object.assign(window.testApi,{...masks,...shape,...textures,...generators});",resolveDir:fileURLToPath(new URL('../',import.meta.url))},bundle:true,format:'iife',write:false,target:'es2022'});
async function openGenerators(){const session=await openHarness();await session.page.addScriptTag({content:qualityBundle.outputFiles[0].text});return session;}

async function requireApi(page,names){for(const name of names)assert.equal(await page.evaluate(name=>typeof window.testApi[name],name),'function',name+' is implemented');}
async function generatorScene(page,kind,options={}){
 return page.evaluate(({kind,options})=>{
  const a=window.testApi,dpi=150,work={x:0,y:0,w:90,h:75},source=a.makeSurface(work,dpi);
  if(!options.empty){source.ctx.fillRect(22,32,14,12);source.ctx.fillRect(43,36,12,12);}
  const shape=a.analyzeShape(source),out=a.makeSurface(work,dpi),rect={x:20,y:30,w:40,h:20};
  const params={color:'#e74917',color2:'#ff9e24',color3:'#fff0a3',height:.68,size:.1,width:.1,count:110,sway:.4,life:2,direction:-90,density:.6,spread:.5,softness:.8,tail:.1,shape:'star',frequency:1,branches:3,start:.05,end:.5,length:.5,...options.params};
  const layer={id:'quality-'+kind,kind,params,enabled:true,opacity:1,rotationDeg:0,origin:{x:0,y:0,w:1,h:1},motion:{enabled:true,speed:1},emit:{face:options.face??'up',openOnly:true}};
  const bounds=a.drawGenerator(out.ctx,layer,{rect,shape,seed:77,timeSec:options.timeSec??1.2});
  const data=out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;
  let alpha=0,maxY=-1,contrasting=0;const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const paper=.2126*linear(255)+.7152*linear(253)+.0722*linear(248);
  for(let i=0;i<data.length;i+=4)if(data[i+3]>8){alpha++;maxY=Math.max(maxY,Math.floor(i/4/out.canvas.width)/out.scale);const opacity=data[i+3]/255,r=data[i]*opacity+255*(1-opacity),g=data[i+1]*opacity+253*(1-opacity),b=data[i+2]*opacity+248*(1-opacity);if(paper-(.2126*linear(r)+.7152*linear(g)+.0722*linear(b))>=.12)contrasting++;}
  return {png:out.canvas.toDataURL(),alpha,maxY,contrast:alpha?contrasting/alpha:0,bounds};
 },{kind,options});
}

test('shape surfaces cap analysis at 150dpi and invalidate changed alpha',async()=>{
 const {browser,page}=await openGenerators();try{
  await requireApi(page,['makeSurface','analyzeShape']);
  const result=await page.evaluate(()=>{const a=window.testApi,s=a.makeSurface({x:-12,y:-12,w:87,h:112},300);s.ctx.fillRect(20,30,10,12);const first=a.analyzeShape(s),same=a.analyzeShape(s);s.ctx.clearRect(20,30,10,12);const empty=a.analyzeShape(s);return {dpi:first.scale*25.4,same:first===same,bounds:first.boundsMm,empty:empty.points.length};});
  assert.equal(result.dpi,150);assert.equal(result.same,true);assert.ok(result.bounds.w<=10.4);assert.equal(result.empty,0);
 }finally{await browser.close();}
});

test('cached smoke textures have irregular detail and fire sprites cool through seven temperatures',async()=>{
 const {browser,page}=await openGenerators();try{
  await requireApi(page,['getSmokeTexture','getMistTexture','getFireTexture','getSparkTexture']);
  const result=await page.evaluate(()=>{
   const a=window.testApi,smoke=a.getSmokeTexture(0,0),other=a.getSmokeTexture(1,0),fire=a.getFireTexture(0),cold=a.getFireTexture(4),alpha=smoke.getContext('2d').getImageData(0,0,128,128).data;
   const unique=new Set();for(let i=3;i<alpha.length;i+=4)unique.add(alpha[i]);
   const sample=c=>[...c.getContext('2d').getImageData(32,32,1,1).data];
   return {size:[smoke.width,smoke.height,fire.width,fire.height],same:smoke===a.getSmokeTexture(0,0),different:smoke.toDataURL()!==other.toDataURL(),unique:unique.size,warm:sample(fire),cold:sample(cold),mist:a.getMistTexture(0).width,spark:a.getSparkTexture().width};
  });
  assert.deepEqual(result.size,[128,128,64,64]);assert.equal(result.same,true);assert.equal(result.different,true);assert.ok(result.unique>40);assert.ok(result.warm[1]>result.cold[1]+100);assert.ok(result.mist>=64);assert.equal(result.spark,64);
 }finally{await browser.close();}
});

test('round fire stays attached to open top faces and is visible on bright paper',async t=>{
 const {browser,page,pageErrors}=await openGenerators();try{
  await requireApi(page,['makeSurface','analyzeShape','drawGenerator']);
  const first=await generatorScene(page,'flame'),same=await generatorScene(page,'flame'),later=await generatorScene(page,'flame',{timeSec:2.8});
  assert.equal(first.png,same.png);assert.notEqual(first.png,later.png);assert.ok(first.alpha>300);assert.ok(first.maxY<40,'no fire begins at lower faces');assert.ok(first.contrast>=.6,'at least 60% of visible fire differs from paper luminance by .12');assert.deepEqual(pageErrors,[]);t.diagnostic('fire visible pixels='+first.alpha+', paper contrast='+first.contrast.toFixed(4)+', last y='+first.maxY.toFixed(2)+'mm');
 }finally{await browser.close();}
});

test('all shape generators leave an empty source empty',async()=>{
 const {browser,page}=await openGenerators();try{
  await requireApi(page,['makeSurface','analyzeShape','drawGenerator']);
  for(const kind of ['flame','smoke','ember','mist','lightning','ripple','particle','aura']){const scene=await generatorScene(page,kind,{empty:true});assert.equal(scene.alpha,0,kind);assert.equal(scene.bounds,null,kind);}
 }finally{await browser.close();}
});

test('contour ripples follow each separated silhouette and aura rays follow upper normals',async()=>{
 const {browser,page}=await openGenerators();try{
  await requireApi(page,['makeSurface','analyzeShape','drawGenerator']);
  const result=await page.evaluate(()=>{
   const a=window.testApi,w={x:0,y:0,w:80,h:65},source=a.makeSurface(w,150);source.ctx.fillRect(17,28,10,18);source.ctx.fillRect(47,28,10,18);const shape=a.analyzeShape(source),out=a.makeSurface(w,150);
   a.drawGenerator(out.ctx,{id:'contours',kind:'ripple',opacity:1,rotationDeg:0,origin:{x:0,y:0,w:1,h:1},motion:{enabled:true,speed:1},emit:{face:'all',openOnly:false},params:{color:'#1683c7',width:.35,start:.05,end:.5,frequency:1,count:3,life:2}},{rect:{x:17,y:28,w:40,h:18},shape,seed:77,timeSec:1.2});
   const sum=(x,y,w,h)=>{const data=out.ctx.getImageData(Math.round(x*out.scale),Math.round(y*out.scale),Math.round(w*out.scale),Math.round(h*out.scale)).data;let n=0;for(let i=3;i<data.length;i+=4)n+=data[i];return n;};return {left:sum(12,32,4,8),right:sum(58,32,4,8),gap:sum(36,30,2,14)};
  });
  assert.ok(result.left>1000);assert.ok(result.right>1000);assert.equal(result.gap,0,'separated glyphs retain separate contours');
  const aura=await generatorScene(page,'aura',{params:{count:80,color:'#7a4ed7'}});assert.ok(aura.alpha>100);assert.ok(aura.maxY<38,'upper aura rays extend along actual normals');
 }finally{await browser.close();}
});

test('quality generator atlas records round fire textured smoke and normal-attached scenes',async()=>{
 const {browser,page,pageErrors,httpRequests}=await openGenerators();try{
  await requireApi(page,['makeSurface','analyzeShape','drawGenerator']);
  await page.evaluate(async()=>{await window.testApi.ensureFont();document.body.style.cssText='margin:0;background:#e9e1d1;padding:24px;display:grid;grid-template-columns:repeat(2,620px);gap:20px';
   const a=window.testApi;for(const kind of ['burning-integrated','burning','smoke','mist','lightning','ripple','particle','aura']){
    const work={x:0,y:0,w:100,h:65},src=a.makeSurface(work,150),rect={x:10,y:31,w:80,h:14};src.ctx.font='900 12px CardStudio';src.ctx.textAlign='center';src.ctx.textBaseline='middle';src.ctx.fillStyle='#2b1a12';src.ctx.fillText('화염의 수호자',50,40);
    const shape=a.analyzeShape(src),out=a.makeSurface(work,150);out.ctx.fillStyle='#fffdf8';out.ctx.fillRect(0,0,100,65);
    const add=k=>a.drawGenerator(out.ctx,{id:'atlas-'+k,kind:k,opacity:1,rotationDeg:0,origin:{x:0,y:0,w:1,h:1},motion:{enabled:true,speed:1},emit:{face:['flame','smoke'].includes(k)?'up':'all',openOnly:true},params:{color:k==='smoke'?'#79818c':k==='flame'?'#e74917':'#5f63c7',color2:'#ff9e24',color3:'#fff0a3',height:k==='smoke'?.95:.68,size:k==='smoke'?.09:k==='particle'?.04:k==='mist'?.4:.1,width:k==='lightning'?.18:.35,count:k==='flame'?110:k==='smoke'?70:k==='ripple'?3:k==='mist'?12:60,sway:.4,life:k==='smoke'?3.5:k==='mist'?5:k==='flame'?1.8:2,direction:-90,density:.6,spread:.5,softness:.8,shape:'star',frequency:2,branches:3,start:.05,end:.9,length:.5}},{rect,shape,seed:77,timeSec:1.2,sizeHeightMm:12});
    if(kind==='burning-integrated'){
     const recipe=a.createVisualEffects('burningText',{seed:77}),draw=g=>{g.drawImage(src.canvas,0,0,100,65);return {fontPt:12*72/25.4,fits:true};};
     a.renderVisualEffects(out.ctx,{rect,recipe,target:'text',source:{key:'quality-integrated',draw,drawPlainMask:draw},dpi:150,timeSec:1.2,minFontPt:7});
    }else {if(kind==='burning'){add('smoke');add('flame');}else add(kind);out.ctx.drawImage(src.canvas,0,0,100,65);}out.ctx.fillStyle='#53473a';out.ctx.font='700 2.4px sans-serif';out.ctx.textAlign='left';out.ctx.fillText(kind+' / 150dpi / time 1.2s',4,61);out.canvas.style.cssText='width:620px;height:403px;background:#fffdf8;box-shadow:0 3px 12px #b6aa95';document.body.append(out.canvas);
   }
  });
  await page.screenshot({path:path.join(qa,'visual-effects-quality-generators.png'),fullPage:true});assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});


test('side aura preserves the horizontal normal instead of inventing upward motion',async()=>{
 const {browser,page}=await openGenerators();try{
  const bounds=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:80,h:70},source=a.makeSurface(work,150);source.ctx.fillRect(35,30,12,20);const shape=a.analyzeShape(source),out=a.makeSurface(work,150);
   const middle=sign=>shape.points.filter(p=>p.nx*sign>.99).sort((a,b)=>Math.abs(a.y-40)-Math.abs(b.y-40))[0];shape.points=[middle(-1),middle(1)];
   return a.drawGenerator(out.ctx,{id:'horizontal-aura',kind:'aura',opacity:1,rotationDeg:0,origin:{x:0,y:0,w:1,h:1},motion:{enabled:true,speed:1},emit:{face:'side',openOnly:true},params:{color:'#7a4ed7',length:.5,count:2}},{rect:{x:35,y:30,w:12,h:20},shape,seed:77,timeSec:1.2});
  });
  assert.ok(bounds.x<35);assert.ok(bounds.x+bounds.w>47);assert.ok(bounds.y>=39,'horizontal normals keep rays beside the silhouette');assert.ok(bounds.y+bounds.h<=41);
 }finally{await browser.close();}
});


test('even aura sampling includes both sides instead of aliasing alternating raster edges',async()=>{
 const {browser,page}=await openGenerators();try{
  const bounds=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:80,h:70},source=a.makeSurface(work,150);source.ctx.fillRect(35,30,12,20);const shape=a.analyzeShape(source),out=a.makeSurface(work,150);
   return a.drawGenerator(out.ctx,{id:'even-aura',kind:'aura',opacity:1,rotationDeg:0,origin:{x:0,y:0,w:1,h:1},motion:{enabled:true,speed:1},emit:{face:'side',openOnly:true},params:{color:'#7a4ed7',length:.5,count:2}},{rect:{x:35,y:30,w:12,h:20},shape,seed:77,timeSec:1.2});
  });
  assert.ok(bounds.x<35,'left side receives a ray');assert.ok(bounds.x+bounds.w>47,'right side receives a ray');
 }finally{await browser.close();}
});
