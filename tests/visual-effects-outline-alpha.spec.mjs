import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import * as masks from './src/render/effects/masks.js';import * as filters from './src/render/effects/filters.js';import * as composite from './src/render/effects/composite.js';import * as generators from './src/render/effects/generators.js';import * as shape from './src/render/effects/shape.js';import * as model from './src/model/visual-effects.js';window.outlineApi={...masks,...filters,...composite,...generators,...shape,...model};",resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
let session;
before(async()=>{session=await openHarness();await session.page.addScriptTag({content:bundle.outputFiles[0].text});});
after(async()=>{await session?.browser.close();});

// Binary silhouettes and painting a complete tinted underfill both break these
// constants: the expanded edge and the unchanged fill must have the same alpha.
test('outline follows constant source alpha without hardening the fill or fractional edge',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=outlineApi,at=(s,x,y)=>[...s.ctx.getImageData(x,y,1,1).data];
  return [1,64,128,255].map(alpha=>{
   const source=a.makeSurface({x:0,y:0,w:10,h:10},127);source.ctx.fillStyle='#ff0000';source.ctx.globalAlpha=alpha/255;source.ctx.fillRect(3,3,4,4);
   const draw=width=>a.applyEffectFilter(source,{kind:'outline',params:{color:'#0000ff',width}}),full=draw(.4),fractional=draw(.05);
   return {alpha,center:at(full,25,25),edge:at(full,14,25),fractional:at(fractional,14,25)};
  });
 });
 for(const r of results){assert.deepEqual(r.center,[255,0,0,r.alpha],'unchanged fill '+r.alpha);assert.deepEqual(r.edge,[0,0,255,r.alpha],'expanded alpha '+r.alpha);assert.equal(r.fractional[3],Math.round(r.alpha/4),'fractional alpha '+r.alpha);}
});

test('outline keeps an opaque core strong behind antialiasing and has a circular footprint',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=outlineApi,source=a.makeSurface({x:0,y:0,w:6,h:6},127),pixels=source.ctx.createImageData(30,30);
  for(const [x,alpha] of [[10,255],[11,1]]){const at=(10*30+x)*4;pixels.data[at]=255;pixels.data[at+3]=alpha;}source.ctx.putImageData(pixels,0,0);
  const out=a.applyEffectFilter(source,{kind:'outline',params:{color:'#0000ff',width:.4}}),at=(x,y)=>out.ctx.getImageData(x,y,1,1).data[3];
  return {strong:at(12,10),wisp:at(13,10),diagonal:at(12,12),outside:at(13,13)};
 });assert.deepEqual(result,{strong:255,wisp:1,diagonal:44,outside:0});
});

test('outline follows a smooth fading alpha ramp instead of promoting its faint tail',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=outlineApi,alphas=[255,224,192,160,128,96,64,32,16,8,4,2,1],source=a.makeSurface({x:0,y:0,w:124,h:32},25.4),pixels=source.ctx.createImageData(124,32);
  alphas.forEach((alpha,i)=>{for(let y=10;y<22;y++)for(let x=10+i*8;x<18+i*8;x++){const at=(y*124+x)*4;pixels.data[at]=255;pixels.data[at+3]=alpha;}});source.ctx.putImageData(pixels,0,0);
  const out=a.applyEffectFilter(source,{kind:'outline',params:{color:'#0000ff',width:1.25}}),data=out.ctx.getImageData(0,0,124,32).data;
  return {edge:alphas.map((_,i)=>data[(9*124+14+i*8)*4+3]),fill:alphas.map((_,i)=>[...data.slice((16*124+14+i*8)*4,(16*124+14+i*8)*4+4)]),line:Array.from({length:96},(_,i)=>data[(9*124+14+i)*4+3])};
 });
 const alphas=[255,224,192,160,128,96,64,32,16,8,4,2,1];assert.deepEqual(result.edge,alphas);assert.deepEqual(result.fill,alphas.map(alpha=>[255,0,0,alpha]));assert.ok(result.line.every((alpha,i)=>!i||alpha<=result.line[i-1]),'tail fades monotonically');
});

test('outline preserves input work and resolution and leaves zero width and empty alpha unchanged',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=outlineApi,work={x:-4,y:-3,w:18,h:14},source=a.makeSurface(work,127);source.ctx.fillStyle='rgba(255,0,0,.25)';source.ctx.fillRect(1,2,4,5);
  const before=[...source.ctx.getImageData(0,0,90,70).data],out=a.applyEffectFilter(source,{kind:'outline',params:{width:.4,color:'#0000ff'}}),neutral=a.applyEffectFilter(source,{kind:'outline',params:{width:0}}),empty=a.makeSurface(work,127),blank=a.applyEffectFilter(empty,{kind:'outline',params:{width:5}});
  const after=source.ctx.getImageData(0,0,90,70).data,neutralBytes=neutral.ctx.getImageData(0,0,90,70).data;return {work:out.work,dpi:out.dpi,size:[out.canvas.width,out.canvas.height],independent:out!==source&&out.canvas!==source.canvas,untouched:before.every((v,i)=>v===after[i]),neutral:before.every((v,i)=>v===neutralBytes[i]),empty:[...blank.ctx.getImageData(0,0,90,70).data].every(v=>v===0)};
 });assert.deepEqual(result,{work:{x:-4,y:-3,w:18,h:14},dpi:127,size:[90,70],independent:true,untouched:true,neutral:true,empty:true});
});

test('fading expanding ripple retains its alpha through a following outline',async()=>{
 const results=await session.page.evaluate(()=>{
  const a=outlineApi;
  return [.2,1,1.8,1.98].map(timeSec=>{
   const draw=outlined=>{
    const out=a.makeSurface({x:0,y:0,w:80,h:70},101.6),recipe=a.createVisualEffects('empty',{seed:77});recipe.layers=[a.makeVisualEffectLayer('ripple',{params:{color:'#1683c7',width:.35,start:.05,end:.5,frequency:1,count:1,life:2},motion:{enabled:true}})];
    if(outlined)recipe.layers.push(a.makeVisualEffectLayer('outline',{params:{color:'#000000',width:.5}}));
    a.renderVisualEffects(out.ctx,{rect:{x:30,y:25,w:20,h:15},recipe,target:'effect',source:null,dpi:101.6,timeSec,cardRect:{w:80,h:70}});
    const data=out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;let max=0,occupied=0;for(let i=3;i<data.length;i+=4){max=Math.max(max,data[i]);if(data[i])occupied++;}return {max,occupied};
   };return {timeSec,plain:draw(false),outlined:draw(true)};
  });
 });
 for(const r of results){assert.equal(r.outlined.max,r.plain.max,'ripple alpha at '+r.timeSec);assert.ok(r.outlined.occupied>r.plain.occupied,'outline still expands '+r.timeSec);}assert.ok(results.every((r,i)=>!i||r.outlined.max<results[i-1].outlined.max));assert.ok(results.at(-1).outlined.max<=3,'near-end ripple remains faint');
});

test('compositor owns outline opacity once and preserves translucent source color',async()=>{
 const result=await session.page.evaluate(()=>{
  const a=outlineApi,out=a.makeSurface({x:0,y:0,w:40,h:32},25.4),recipe=a.createVisualEffects();recipe.layers=[a.makeVisualEffectLayer('outline',{opacity:.5,params:{width:2,color:'#0000ff'}})];
  a.renderVisualEffects(out.ctx,{rect:{x:10,y:8,w:20,h:16},recipe,target:'image',source:{key:'alpha-64',draw:c=>{c.fillStyle='rgba(255,0,0,'+64/255+')';c.fillRect(10,8,20,16);return {};}},dpi:25.4,cardRect:{w:40,h:32}});
  return {center:[...out.ctx.getImageData(20,16,1,1).data],edge:[...out.ctx.getImageData(9,16,1,1).data]};
 });assert.deepEqual(result,{center:[255,0,0,64],edge:[0,0,255,32]});
});

test('300dpi text and ripple outline has bounded work at normal and maximum width',{timeout:20000},async t=>{
 const results=await session.page.evaluate(()=>{
  const a=outlineApi,source=a.makeSurface({x:-12,y:-12,w:87,h:112},300),c=source.ctx;c.fillStyle='#c74219';c.font='700 5px sans-serif';c.fillText('한글 파동 alpha',7,37);
  const shape=a.analyzeShape(source);a.drawGenerator(c,a.makeVisualEffectLayer('ripple',{params:{count:3,width:.35,start:.05,end:.5},motion:{enabled:true}}),{rect:{x:7,y:30,w:44,h:12},shape,seed:77,timeSec:1.2,sizeHeightMm:12});
  return [.25,5].map(width=>{const begin=performance.now(),out=a.applyEffectFilter(source,{kind:'outline',params:{width,color:'#0000ff'}}),elapsed=performance.now()-begin;return {width,elapsed,size:[out.canvas.width,out.canvas.height]};});
 });
 for(const r of results){assert.deepEqual(r.size,[1028,1323]);assert.ok(r.elapsed<3000,'outline '+r.width+'mm took '+r.elapsed+'ms');}t.diagnostic(JSON.stringify(results));assert.deepEqual(session.pageErrors,[]);
});
