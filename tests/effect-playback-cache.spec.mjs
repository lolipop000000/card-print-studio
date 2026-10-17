import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const code=(await build({
 absWorkingDir:root,
 stdin:{contents:"import {renderCard} from './src/render/card.js';import {createProject} from './src/model/project.js';import {makeVisualEffectLayer,createVisualEffects} from './src/model/visual-effects.js';import {createEffectCache} from './src/render/effects/composite.js';window.playbackApi={renderCard,createProject,makeVisualEffectLayer,createVisualEffects,createEffectCache};",resolveDir:root},
 bundle:true,write:false,format:'iife',
})).outputFiles[0].text;

async function inspectWarmCache(fixture){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addScriptTag({content:code});
  const result=await page.evaluate(kind=>{
   const a=window.playbackApi,project=a.createProject(),card=project.cards[0],assets=new Map(),cache=a.createEffectCache();
   const effects=layer=>({...a.createVisualEffects(),layers:[layer]});
   if(kind==='skill-titles'){
    card.passives=Array.from({length:4},(_,i)=>({id:'skill-'+i,name:'SPELL'+i,effect:'',keywords:[],dice:null,nameStyle:{visualEffects:effects(a.makeVisualEffectLayer('ripple',{protectText:false}))}}));
    card.actives=[];
    card.elements=card.passives.map((skill,i)=>({id:'title-'+i,type:'text',rect:{x:6,y:8+i*12,w:45,h:7},binding:{field:'skill.name',skillId:skill.id},style:{fontPt:12,color:'#15362a',visualEffects:effects(a.makeVisualEffectLayer('glow',{params:{radius:.2,strength:.2},motion:{enabled:false,speed:1}}))}}));
   }else{
    card.elements=Array.from({length:12},(_,i)=>({id:'effect-'+i,type:'effect',rect:{x:5+(i%4)*12,y:10+Math.floor(i/4)*20,w:9,h:9},binding:null,style:{visualEffects:effects(a.makeVisualEffectLayer('ripple',{protectText:false}))}}));
   }
   let frozenCompositions=0;
   for(const method of ['memo','memoOutput']){
    if(typeof cache[method]!=='function')continue;
    const original=cache[method].bind(cache);
    cache[method]=(key,create,...rest)=>original(key,()=>{
     if(String(key).includes('frozen-effect:'))frozenCompositions++;
     return create();
    },...rest);
   }
   const before=JSON.stringify(project),selection={elementId:kind==='skill-titles'?null:'effect-0'},dpi=kind==='skill-titles'?100:80;
   const draw=(timeSec,effectCache)=>{
    const canvas=document.createElement('canvas'),geometry=[];
    const report=a.renderCard(canvas.getContext('2d'),project,card,assets,dpi,{timeSec,playbackTarget:selection,frozenTimeSec:1.2,effectCache,onEffectGeometry:entry=>geometry.push(entry)});
    // Nested effects can report the same transform through their parent. Compare
    // the selectable geometry independently of callback order and duplication.
    const uniqueGeometry=[...new Map(geometry.map(entry=>[JSON.stringify(entry),entry])).entries()].sort(([one],[two])=>one.localeCompare(two)).map(([,entry])=>entry);
    return {pixels:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,report,geometry:uniqueGeometry};
   };
   const equalPixels=(one,two)=>one.length===two.length&&one.every((value,index)=>value===two[index]);
   const first=draw(.3,cache),coldCompositions=frozenCompositions,warm=[];
   for(const time of [.6,.9]){
    const countBefore=frozenCompositions,actual=draw(time,cache),reference=draw(time,a.createEffectCache());
    warm.push({recompositions:frozenCompositions-countBefore,exactPixels:equalPixels(actual.pixels,reference.pixels),diagnosticsMatch:JSON.stringify(actual.report)===JSON.stringify(reference.report),geometryMatch:JSON.stringify(actual.geometry)===JSON.stringify(reference.geometry),geometryCount:actual.geometry.length,finiteGeometry:actual.geometry.every(({rect})=>rect&&Object.values(rect).every(Number.isFinite))});
   }
   return {coldCompositions,coldGeometryCount:first.geometry.length,warm,unchanged:JSON.stringify(project)===before};
  },fixture);
  assert.deepEqual(errors,[],'source renderer must not raise browser errors');
  return result;
 }finally{
  await browser.close();
 }
}

for(const [fixture,label,geometryCount] of [['skill-titles','four decorated skill titles',8],['standalone','twelve standalone effects with one playing',12]]){
 test(`${label} reuse frozen composed surfaces after the first frame`,async()=>{
  const result=await inspectWarmCache(fixture);
  assert.ok(result.coldCompositions>0,'the first frame must compose frozen effects');
  assert.equal(result.coldGeometryCount,geometryCount);
  for(const [index,frame] of result.warm.entries()){
   assert.equal(frame.exactPixels,true,`warm frame ${index+1} must exactly match a fresh render`);
   assert.equal(frame.diagnosticsMatch,true,`warm frame ${index+1} must preserve diagnostics`);
   assert.equal(frame.geometryMatch,true,`warm frame ${index+1} must preserve geometry callbacks`);
   assert.equal(frame.geometryCount,geometryCount);
   assert.equal(frame.finiteGeometry,true);
  }
  assert.equal(result.unchanged,true,'playback must not change the saved project');
  assert.deepEqual(result.warm.map(frame=>frame.recompositions),[0,0],'both later frames must reuse all frozen surfaces');
 });
}
