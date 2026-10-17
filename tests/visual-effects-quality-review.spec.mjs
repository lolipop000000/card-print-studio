import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openHarness} from './helpers/browser.mjs';
import {analyzeAlpha} from '../src/render/effects/shape.js';
import * as fx from '../src/model/visual-effects.js';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
const hash=value=>createHash('sha256').update(value).digest('hex');

test('changing text protection identity invalidates the converted preview mask',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:63,h:88},blank=a.makeSurface(work,100),full=a.makeSurface(work,100),cache=a.createEffectCache(),recipe=a.createVisualEffects('smoke');full.ctx.fillRect(0,0,63,88);
   recipe.layers[0].id='mask-smoke';recipe.layers[0].emit={face:'area',openOnly:false};
   const draw=(mask,c)=>{const out=a.makeSurface(work,100);a.renderVisualEffects(out.ctx,{rect:{x:15,y:40,w:30,h:22},recipe,target:'effect',source:null,dpi:100,timeSec:1.2,cache:c,textProtection:mask});return out.canvas.toDataURL();};
   const initial=draw(blank,cache),updated=draw(full,cache),fresh=draw(full,a.createEffectCache());return {initial,updated,fresh};
  });assert.notEqual(hash(r.initial),hash(r.updated));assert.equal(hash(r.updated),hash(r.fresh));
 }finally{await browser.close();}
});

test('frame band analysis preserves its opening and both boundary normals',()=>{
 const size=36,alpha=new Uint8Array(size*size);
 for(let y=4;y<32;y++)for(let x=4;x<32;x++)if(x<8||x>=28||y<8||y>=28)alpha[y*size+x]=255;
 const band=analyzeAlpha(alpha,size,size,{scale:2,fillHoles:false}),glyph=analyzeAlpha(alpha,size,size,{scale:2});
 assert.equal(band.solid[18*size+18],0);assert.equal(glyph.solid[18*size+18],1);
 assert.ok(band.points.some(p=>p.y>3.4&&p.y<4.1&&p.x>5&&p.x<13&&p.ny>.45));
 assert.ok(!band.inside.some(p=>p.x>5&&p.x<13&&p.y>5&&p.y<13));
});

test('full frame ripple follows the inner border into the card',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:63,h:88},out=a.makeSurface(work,100),recipe=a.createVisualEffects();
   recipe.frame={scope:'full',bandMm:4};recipe.layers=[a.makeVisualEffectLayer('ripple',{id:'frame-ripple',params:{count:1},motion:{enabled:false}})];
   a.renderVisualEffects(out.ctx,{rect:{x:1,y:1,w:61,h:86},recipe,target:'frame',dpi:100,timeSec:1.2,cardRect:work,source:{key:'frame',draw:g=>{g.strokeStyle='#b6c2b8';g.lineWidth=.28;g.strokeRect(1,1,61,86);}}});
   const bytes=out.ctx.getImageData(Math.round(4.2*out.scale),Math.round(20*out.scale),Math.round(2*out.scale),Math.round(40*out.scale)).data;
   let alpha=0;for(let i=3;i<bytes.length;i+=4)alpha+=bytes[i];return alpha;
  });assert.ok(r>1000,'inner contour must produce visible pixels: '+r);
 }finally{await browser.close();}
});

function oldLayer(kind){
 const layer=fx.makeVisualEffectLayer(kind,{id:'dormant-'+kind});
 delete layer.protectText;delete layer.emit;delete layer.scope;layer.placement='behind';layer.emitter='bottom';layer.origin={x:0,y:0,w:1,h:1};layer.rotationDeg=0;
 if(kind==='smoke')delete layer.params.height;
 return layer;
}
for(const kind of ['smoke','glow'])test('deleted legacy '+kind+' layer retains dormant geometry overrides through import and revival',()=>{
 const p=createProject(),layer=oldLayer(kind);p.cards[0].visualEffects={seed:71,layers:[layer]};p.cards.push(createVariant(p,p.cards[0].id));const store=createStore(p);
 store.edit('Variant geometry',d=>{d.cards[1].visualEffects.layers[0].origin.x=.25;d.cards[1].visualEffects.layers[0].emitter='edge';});
 store.edit('Delete source layer',d=>{d.cards[0].visualEffects.layers=[];});
 assert.deepEqual(validateProject(store.getProject()),[]);
 const loaded=parseProject(JSON.stringify(store.getProject())),saved=serializeProject(loaded);assert.equal(serializeProject(parseProject(saved)),saved);
 const revived=createStore(loaded);
 revived.edit('Restore same source layer',d=>{d.cards[0].visualEffects.layers.push(fx.upgradeVisualEffects({seed:71,layers:[layer]},'frame').layers[0]);});
 const result=revived.getProject().cards[1].visualEffects.layers[0];assert.equal(result.kind,kind);assert.deepEqual(fx.validateVisualEffects(revived.getProject().cards[1].visualEffects,'frame'),[]);
 if(kind==='smoke'){assert.equal(result.origin.x,.25);assert.equal(result.emit.face,'all');}
 else for(const key of ['origin','emitter','rotationDeg','placement'])assert.equal(key in result,false,key);
});

test('flame width and mist softness each change the visible result',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(()=>{
   const a=window.testApi,work={x:0,y:0,w:63,h:88},draw=(kind,params)=>{
    const out=a.makeSurface(work,100),recipe=a.createVisualEffects();recipe.layers=[a.makeVisualEffectLayer(kind,{id:'control-'+kind,emit:{face:'area',openOnly:false},params})];
    a.renderVisualEffects(out.ctx,{rect:{x:10,y:30,w:43,h:35},recipe,target:'effect',source:null,dpi:100,timeSec:1.2});return out.canvas.toDataURL();
   };
   return {widthA:draw('flame',{width:.05}),widthB:draw('flame',{width:.5}),softA:draw('mist',{softness:0}),softB:draw('mist',{softness:1})};
  });assert.notEqual(hash(r.widthA),hash(r.widthB));assert.notEqual(hash(r.softA),hash(r.softB));
 }finally{await browser.close();}
});
