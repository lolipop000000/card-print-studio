import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const code=(await build({stdin:{contents:"import {renderCard} from './src/render/card.js';import {createProject} from './src/model/project.js';import {makeVisualEffectLayer,createVisualEffects} from './src/model/visual-effects.js';import {createEffectCache} from './src/render/effects/composite.js';window.playbackApi={renderCard,createProject,makeVisualEffectLayer,createVisualEffects,createEffectCache};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
test('selected-only playback changes only its region and retains deterministic warm cache and full print output',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
  const page=await browser.newPage();await page.addScriptTag({content:code});
  const r=await page.evaluate(()=>{
   const a=window.playbackApi,p=a.createProject(),card=p.cards[0],cache=a.createEffectCache(),canvas=document.createElement('canvas'),assets=new Map();
   let frozenCompositions=0;for(const method of ['memo','memoOutput']){const original=cache[method];cache[method]=(key,create)=>original(key,()=>{if(String(key).includes('frozen-effect:'))frozenCompositions++;return create();});}
   card.elements=[10,43].map((x,i)=>({id:'effect-'+i,type:'effect',rect:{x,y:30,w:10,h:10},binding:null,style:{visualEffects:{...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('ripple',{protectText:false,params:{count:1,start:.1,end:.8,life:2,frequency:1,color:i?'#ee3333':'#3344ee'}})]}}}));
   const before=JSON.stringify(p),draw=(time,selection,dpi=100)=>{a.renderCard(canvas.getContext('2d'),p,card,assets,dpi,{timeSec:time,effectCache:cache,playbackTarget:selection,frozenTimeSec:1.2});const g=canvas.getContext('2d'),half=Math.floor(canvas.width/2);return [g.getImageData(0,0,half,canvas.height).data.join(','),g.getImageData(half,0,canvas.width-half,canvas.height).data.join(',')];};
   const selected={elementId:'effect-0'},one=draw(.3,selected),two=draw(.9,selected),compositions=frozenCompositions,warm=draw(.9,selected),reused=frozenCompositions===compositions,all=draw(.9,null),print=draw(1.2,null,300),frozen=draw(1.2,selected,300),switched=draw(.9,{elementId:'effect-1'});
   return {leftMoves:one[0]!==two[0],rightFrozen:one[1]===two[1],warm:JSON.stringify(warm)===JSON.stringify(two),reused:reused&&compositions===1,allMoves:all[1]!==two[1],printSame:JSON.stringify(print)===JSON.stringify(frozen),switches:switched[1]!==two[1],unchanged:JSON.stringify(p)===before};
  });assert.deepEqual(r,{leftMoves:true,rightFrozen:true,warm:true,reused:true,allMoves:true,printSame:true,switches:true,unchanged:true});
 }finally{await browser.close();}
});

test('selecting a skill name animates all its occurrences inside frozen element effects',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
  const page=await browser.newPage();await page.addScriptTag({content:code});
  const r=await page.evaluate(()=>{
   const a=window.playbackApi,p=a.createProject(),card=p.cards[0],assets=new Map(),cache=a.createEffectCache(),canvas=document.createElement('canvas');
   const nameEffects=()=>({...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('ripple',{protectText:false,params:{count:1,start:.1,end:1.4,life:2,frequency:1,color:'#ec3344'}})]});
   card.passives=[{id:'hit',name:'HIT',effect:'',keywords:[],dice:null,nameStyle:{visualEffects:nameEffects()}},{id:'ray',name:'RAY',effect:'',keywords:[],dice:null,nameStyle:{visualEffects:nameEffects()}}];card.actives=[];
   card.elements=[20,42,64].map((y,i)=>({id:'text-'+i,type:'text',binding:i===1?null:{field:'skill.name',skillId:i?'ray':'hit'},content:i===1?'USE HIT':'',rect:{x:7,y,w:45,h:7},style:{fontPt:12,color:'#15362a',visualEffects:{...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('glow',{params:{radius:.2,strength:.2},motion:{enabled:false,speed:1}})]}}}));
   const draw=(timeSec,playbackTarget,dpi=150)=>{a.renderCard(canvas.getContext('2d'),p,card,assets,dpi,{timeSec,playbackTarget,frozenTimeSec:1.2,effectCache:cache});const g=canvas.getContext('2d'),s=dpi/25.4;return [[16,16],[38,16],[60,16]].map(([y,h])=>g.getImageData(0,Math.floor(y*s),canvas.width,Math.floor(h*s)).data.join(','));};
   const selection={elementId:'text-0',skillId:'hit'},first=draw(.3,selection),second=draw(.9,selection),warm=draw(.9,selection),all=draw(1.2,null,300),frozen=draw(1.2,selection,300);
   return {titleMoves:first[0]!==second[0],referenceMoves:first[1]!==second[1],otherFrozen:first[2]===second[2],warm:JSON.stringify(second)===JSON.stringify(warm),printSame:JSON.stringify(all)===JSON.stringify(frozen)};
  });assert.deepEqual(r,{titleMoves:true,referenceMoves:true,otherFrozen:true,warm:true,printSame:true});
 }finally{await browser.close();}
});
