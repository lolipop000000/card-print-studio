import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
import {openHarness} from './helpers/browser.mjs';
test('deformed Korean rich text preserves keyword and icon colors at physical print resolution',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),icon=document.createElement('canvas');icon.width=icon.height=20;icon.getContext('2d').fillStyle='#c535de';icon.getContext('2d').fillRect(0,0,20,20);
   p.keywords=[{id:'heal',name:'회복',description:'',color:'#eb3344',iconAssetId:'icon'}];
   p.cards[0].passives=[{id:'s',name:'재생',effect:'체력을 회복 한다 🙂',dice:null,keywords:[{keywordId:'heal',display:'inline'}]}];
   p.cards[0]=a.applyTemplate(p.cards[0],p.settings,'monster-standard',p.keywords);
   const e=p.cards[0].elements.find(e=>e.binding?.field==='skill.effect');e.style.visualEffects=a.createVisualEffects();e.style.visualEffects.layers=[
    a.makeVisualEffectLayer('textWarp',{params:{arc:.2,wave:.15,skewDeg:8,scaleX:1.05,scaleY:1.1}}),
    a.makeVisualEffectLayer('gradient',{params:{color:'#22ce88',color2:'#3e92da'}})];
   const canvas=document.createElement('canvas'),recipe=e.style.visualEffects;delete e.style.visualEffects;a.renderCard(canvas.getContext('2d'),p,p.cards[0],new Map([['icon',icon]]),300);const before=canvas.toDataURL();e.style.visualEffects=recipe;const report=a.renderCard(canvas.getContext('2d'),p,p.cards[0],new Map([['icon',icon]]),300),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let red=0,purple=0;for(let i=0;i<data.length;i+=4){if(data[i]>190&&data[i+1]<100&&data[i+2]<120)red++;if(data[i]>150&&data[i+1]<100&&data[i+2]>150)purple++;}
   return {changed:before!==canvas.toDataURL(),report,width:canvas.width,height:canvas.height,red,purple};
  });
  assert.equal(r.changed,true);assert.deepEqual([r.width,r.height],[744,1039]);assert.ok(r.red>50);assert.ok(r.purple>50);assert.ok(!r.report.problems.some(p=>p.severity!=='warning'));
 }finally{await browser.close();}
});
test('warped text cannot bypass minimum font size or existing overflow validation',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),e={id:'t',type:'text',binding:null,content:'작은 글자',rect:{x:10,y:10,w:40,h:10},style:{fontPt:7,visualEffects:a.createVisualEffects()}};p.back.elements=[e];
   e.style.visualEffects.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleY:.5}})];
   const canvas=document.createElement('canvas'),small=a.renderCard(canvas.getContext('2d'),p,p.back,new Map(),300);
   e.content='엄청긴한글🙂'.repeat(200);e.style.visualEffects.layers[0].params.scaleY=1;e.rect.h=4;
   return {small,long:a.renderCard(canvas.getContext('2d'),p,p.back,new Map(),300)};
  });
  assert.ok(r.small.problems.some(p=>p.code==='effect-font-minimum'));assert.ok(r.long.problems.some(p=>p.code==='text-overflow'));
 }finally{await browser.close();}
});
test('cached image effects follow replacement pixels and default rendering uses saved print time',async()=>{
 const {browser,page}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),cache=a.createEffectCache(),assets=new Map(),canvas=document.createElement('canvas');
   const image=x=>{const c=document.createElement('canvas');c.width=c.height=20;const g=c.getContext('2d');g.fillStyle='#f04020';g.beginPath();g.arc(x,10,3,0,Math.PI*2);g.fill();return c;};
   const e={id:'im',type:'image',assetId:'art',binding:null,rect:{x:10,y:10,w:30,h:30},style:{fit:'contain',visualEffects:a.createVisualEffects()}};
   e.style.visualEffects.layers=[a.makeVisualEffectLayer('outline')];p.back.elements=[e];assets.set('art',image(5));
   const draw=options=>{a.renderCard(canvas.getContext('2d',{willReadFrequently:true}),p,p.back,assets,200,{effectCache:cache,...options});return canvas.toDataURL();};
   const first=draw();assets.set('art',image(15));const second=draw(),scale=200/25.4;
   const old=Array.from(canvas.getContext('2d').getImageData(Math.round(17.5*scale),Math.round(25*scale),1,1).data),now=Array.from(canvas.getContext('2d').getImageData(Math.round(32.5*scale),Math.round(25*scale),1,1).data);
   e.style.visualEffects=a.createVisualEffects('flame',{seed:3});cache.clear();p.print.effectFrameSec=2.35;
   return {first,second,old,now,saved:draw(),explicit:draw({timeSec:2.35}),moving:draw({timeSec:.1})};
  });
  assert.notEqual(r.first,r.second);assert.ok(r.old[1]>200);assert.ok(r.now[1]<100);
  assert.equal(hash(r.saved),hash(r.explicit));assert.notEqual(hash(r.saved),hash(r.moving));
 }finally{await browser.close();}
});

test('offscreen warped text keeps its clipping warning while decoded transparent pixels and empty text stay empty',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  const r=await page.evaluate(async()=>{
   const a=window.testApi;await a.ensureFont();const p=a.createProject(),assets=new Map(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
   p.print.duplex=true;p.back.elements=[];
   const e={id:'offscreen-text',type:'text',binding:null,content:'가',rect:{x:0,y:20,w:63,h:10},style:{fontPt:7,align:'left',visualEffects:a.createVisualEffects()}};
   e.style.visualEffects.layers=[a.makeVisualEffectLayer('textWarp',{params:{scaleX:3}})];
   const views=[];
   for(const dpi of [100,300]){
    p.back.elements=[];a.renderCard(ctx,p,p.back,assets,dpi);const blank=canvas.toDataURL();
    p.back.elements=[e];const report=a.renderCard(ctx,p,p.back,assets,dpi);views.push({dpi,report,inkGone:canvas.toDataURL()===blank});
   }
   const preflight=await a.preflightProject(p,assets);
   const pixel=document.createElement('canvas');pixel.width=pixel.height=1;const decoded=new Image();decoded.src=pixel.toDataURL();await decoded.decode();assets.set('clear',decoded);
   const controls=[];
   for(const type of ['image','text']){
    p.back.elements=[];a.renderCard(ctx,p,p.back,assets,300);const blank=canvas.toDataURL();
    const empty={...e,id:'clear-'+type,type,content:'',assetId:type==='image'?'clear':undefined,style:{fontPt:7,fit:'contain',visualEffects:a.createVisualEffects()}};
    if(type==='text')empty.style.visualEffects.layers.push(a.makeVisualEffectLayer('textWarp',{params:{scaleX:3,arc:.8}}));
    empty.style.visualEffects.layers.push(a.makeVisualEffectLayer('outline'),a.makeVisualEffectLayer('glow'));
    p.back.elements=[empty];const report=a.renderCard(ctx,p,p.back,assets,300);controls.push({type,report,unchanged:canvas.toDataURL()===blank});
   }
   return {views,preflight,controls,decodedSize:[decoded.naturalWidth,decoded.naturalHeight]};
  });
  for(const v of r.views){assert.equal(v.inkGone,true,'the scaled glyph is entirely outside the working raster');assert.ok(v.report.problems.some(p=>p.code==='effect-clipped'&&p.severity==='warning'),v.dpi+' DPI must warn about fully discarded text');assert.ok(!v.report.problems.some(p=>p.severity!=='warning'));}
  assert.ok(r.preflight.some(p=>p.code==='effect-clipped'&&p.severity==='warning'));
  assert.deepEqual(r.decodedSize,[1,1]);
  for(const v of r.controls){assert.equal(v.unchanged,true,v.type);assert.deepEqual(v.report.problems,[],v.type);}
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
