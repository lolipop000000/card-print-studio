import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {openHarness} from './helpers/browser.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import * as fx from './src/model/visual-effects.js';import * as g from './src/render/effects/generators.js';import * as c from './src/render/effects/composite.js';import * as m from './src/render/effects/masks.js';Object.assign(window.testApi,{...fx,...g,...c,...m});",resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022'});
async function open(){const s=await openHarness();await s.page.addScriptTag({content:bundle.outputFiles[0].text});return s;}
const kinds=['firefly','bubble','petal','leaf','snowflake','crystal','confetti','comet','rain','dust','rune','vortex'];

test('every added particle routes through the shared renderer on small Korean text',async()=>{
 const {browser,page,pageErrors,httpRequests}=await open();try{
  const results=await page.evaluate(async kinds=>{
   const a=window.testApi;await a.ensureFont();const work={x:0,y:0,w:63,h:40},rect={x:12,y:14,w:39,h:9};
   const hash=s=>{let h=2166136261;for(const n of s.ctx.getImageData(0,0,s.canvas.width,s.canvas.height).data)h=Math.imul(h^n,16777619);return h>>>0;};
   const source={key:'small-korean-particles',draw:g=>{g.font='700 '+(7*25.4/72)+'px CardStudio';g.fillStyle='#254c46';g.fillText('꽃잎의 수호자',rect.x,rect.y+5);return {fontPt:7,fits:true};}};
   const draw=(recipe,timeSec)=>{const out=a.makeSurface(work,150);a.renderVisualEffects(out.ctx,{rect,recipe,source,dpi:150,target:'text',timeSec,minFontPt:7});return out;};
   const plain=hash(draw(a.createVisualEffects('empty'),1.2));return kinds.map(kind=>{
    const layer=a.makeVisualEffectLayer(kind,{id:'particle-public-'+kind}),recipe={version:2,seed:144,layers:[layer]},first=hash(draw(recipe,1.2)),later=hash(draw(recipe,2.1));
    const frozen=structuredClone(recipe);frozen.layers[0].motion.enabled=false;
    return {kind,visible:first!==plain,repeat:first===hash(draw(recipe,1.2)),moves:first!==later,frozen:hash(draw(frozen,.2))===hash(draw(frozen,5.8))};
   });
  },kinds);
  for(const r of results){assert.equal(r.visible,true,r.kind+' emits through the common pipeline');assert.equal(r.repeat,true,r.kind);assert.equal(r.moves,true,r.kind);assert.equal(r.frozen,true,r.kind);}
  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});

test('ripple fade curve changes raw opacity and its outline fades with the expanding wave',async()=>{
 const {browser,page}=await open();try{
  const values=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:63,h:70},rect={x:23,y:28,w:17,h:12};
   const maximum=out=>{const d=out.ctx.getImageData(0,0,out.canvas.width,out.canvas.height).data;let max=0;for(let i=3;i<d.length;i+=4)max=Math.max(max,d[i]);return max;};
   const raw=fade=>{const out=a.makeSurface(work,150),layer=a.makeVisualEffectLayer('ripple',{params:{count:1,start:.05,end:.8,frequency:1,life:2,width:.25,fade}});a.drawGenerator(out.ctx,layer,{rect,seed:42,timeSec:1,sizeHeightMm:12});return maximum(out);};
   const outlined=timeSec=>{const out=a.makeSurface(work,150),recipe={version:2,seed:42,layers:[a.makeVisualEffectLayer('ripple',{params:{count:1,start:.05,end:.8,frequency:1,life:2,width:.25,fade:1}}),a.makeVisualEffectLayer('outline',{params:{width:.25,color:'#284b65'}})]};a.renderVisualEffects(out.ctx,{rect,recipe,source:null,target:'effect',dpi:150,timeSec});return maximum(out);};
   return {gentle:raw(.5),normal:raw(1),fast:raw(3),early:outlined(.4),middle:outlined(1),late:outlined(1.8)};
  });assert.ok(values.gentle>values.normal+30,JSON.stringify(values));assert.ok(values.normal>values.fast+60,JSON.stringify(values));
  assert.ok(values.early>values.middle+50,JSON.stringify(values));assert.ok(values.middle>values.late+60,JSON.stringify(values));assert.ok(values.late<40,JSON.stringify(values));
 }finally{await browser.close();}
});
