import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {keywordTargets,keywordUseCount,selectedKeywords,linkKeyword,insertKeywordText,updateKeyword,removeKeyword} from '../src/model/keywords.js';

const keyword=(id,name)=>({id,name,description:'',color:'#427963',iconAssetId:null});
function fixture(){
 const rain=keyword('rain','비'),storm=keyword('storm','비바람');
 const passive={id:'passive',name:'비의 기사',effect:'비를 얻는다.',keywords:[{keywordId:'rain',display:'both'}],nameKeywords:[{keywordId:'rain',display:'inline'}]};
 const active={id:'active',name:'비바람 강타',effect:'비바람',keywords:[{keywordId:'storm',display:'inline'}],nameKeywords:[{keywordId:'storm',display:'inline'}]};
 const card={id:'monster',kind:'monster',name:'비의 정령',nameKeywords:[{keywordId:'rain',display:'inline'}],passives:[passive],actives:[active]};
 const item={id:'item',kind:'item',name:'비의 돌',effect:'비를 얻는다.',keywords:[{keywordId:'rain',display:'inline'}],nameKeywords:[{keywordId:'rain',display:'inline'}]};
 return {project:{cards:[card,item],keywords:[rain,storm]},card,item,passive,active,rain,storm};
}

test('title selection uses only title references while body display filters stay independent',()=>{
 const {project,passive}=fixture();
 passive.nameKeywords=[{keywordId:'storm',display:'inline'}];
 assert.deepEqual(selectedKeywords(project,passive,'title').map(k=>k.id),['storm']);
 assert.deepEqual(selectedKeywords(project,passive,'inline').map(k=>k.id),['rain']);
 assert.deepEqual(selectedKeywords(project,passive,'badge').map(k=>k.id),['rain']);
 assert.deepEqual(selectedKeywords(project,passive).map(k=>k.id),['rain']);
});

test('keyword use counts include monster names and count each title/body owner once',()=>{
 const {project}=fixture();
 assert.deepEqual(keywordTargets(project).map(owner=>owner.id),['monster','passive','active','item']);
 assert.equal(keywordUseCount(project,'rain'),3);
 assert.equal(keywordUseCount(project,'storm'),1);
});

test('linking a title keyword keeps body display settings and avoids duplicate title refs',()=>{
 const {passive}=fixture();
 linkKeyword(passive,'storm','both','name');
 linkKeyword(passive,'storm','inline','title');
 assert.deepEqual(passive.nameKeywords,[{keywordId:'rain',display:'inline'},{keywordId:'storm',display:'inline'}]);
 assert.deepEqual(passive.keywords,[{keywordId:'rain',display:'both'}]);
 linkKeyword(passive,'storm','badge');linkKeyword(passive,'storm','inline');
 assert.deepEqual(passive.keywords,[{keywordId:'rain',display:'both'},{keywordId:'storm',display:'both'}]);
});

test('title insertion replaces the selected letters and rebases only title styling',()=>{
 const owner={name:'작은 불꽃 기사',effect:'효과 유지',textRanges:{name:[{id:'fire',start:3,end:5,style:{color:'#ff0000'}},{id:'knight',start:6,end:8,style:{color:'#0000ff'}}],effect:[{id:'effect',start:0,end:2,style:{fontWeight:700}}]}};
 const caret=insertKeywordText(owner,keyword('ice','얼음 폭풍'),3,5,'name');
 assert.equal(owner.name,'작은 얼음 폭풍 기사');assert.equal(caret,8);assert.equal(owner.effect,'효과 유지');
 assert.deepEqual(owner.textRanges.name.map(r=>[r.id,r.start,r.end]),[['fire',3,8],['knight',9,11]]);
 assert.deepEqual(owner.textRanges.effect,[{id:'effect',start:0,end:2,style:{fontWeight:700}}]);
});

test('title insertion defaults to the title end without requiring an effect field',()=>{
 const owner={name:'기사'};
 assert.equal(insertKeywordText(owner,keyword('rain','비'),undefined,undefined,'title'),4);
 assert.equal(owner.name,'기사 비');assert.equal(Object.hasOwn(owner,'effect'),false);
});

test('renaming linked titles uses longest literal matches without affecting body-only text',()=>{
 const {project,card,item,passive,active}=fixture();
 card.name='비바람 비';card.nameKeywords.push({keywordId:'storm',display:'inline'});
 passive.nameKeywords=[];
 updateKeyword(project,'rain',{name:'폭우'});
 assert.equal(card.name,'비바람 폭우');assert.equal(item.name,'폭우의 돌');
 assert.equal(item.effect,'폭우를 얻는다.');assert.equal(passive.effect,'폭우를 얻는다.');
 assert.equal(passive.name,'비의 기사');assert.equal(active.name,'비바람 강타');
});

test('renaming separated keyword occurrences preserves styling in the text between them',()=>{
 const {project,passive}=fixture();
 passive.name='비 가운데 비';passive.effect='비 가운데 비';
 passive.textRanges={name:[{id:'name-middle',start:2,end:5,style:{color:'#ff0000'}}],effect:[{id:'effect-middle',start:2,end:5,style:{color:'#0000ff'}}]};
 updateKeyword(project,'rain',{name:'아주 큰 비'});
 assert.equal(passive.name,'아주 큰 비 가운데 아주 큰 비');assert.equal(passive.effect,'아주 큰 비 가운데 아주 큰 비');
 assert.deepEqual(passive.textRanges.name.map(r=>[r.id,r.start,r.end]),[['name-middle',7,10]]);
 assert.deepEqual(passive.textRanges.effect.map(r=>[r.id,r.start,r.end]),[['effect-middle',7,10]]);
});

test('deleting a keyword unlinks names and body while keeping authored letters and other refs',()=>{
 const {project,card,passive,item}=fixture();
 passive.nameKeywords.push({keywordId:'storm',display:'inline'});
 removeKeyword(project,'rain');
 assert.deepEqual(card.nameKeywords,[]);assert.deepEqual(item.nameKeywords,[]);
 assert.deepEqual(passive.nameKeywords,[{keywordId:'storm',display:'inline'}]);assert.deepEqual(passive.keywords,[]);
 assert.equal(card.name,'비의 정령');assert.equal(passive.name,'비의 기사');assert.equal(item.effect,'비를 얻는다.');
});

let uiBundle;
async function keywordPage(t){
 const require=createRequire(import.meta.url);let playwright;
 try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
 uiBundle??=build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
  import {createProject} from './src/model/project.js';
  import {createStore} from './src/model/store.js';
  import {el,preserveFocus} from './src/ui/dom.js';
  import {rangeTextField} from './src/ui/text-ranges.js';
  import {skillEffectField} from './src/ui/skill-references.js';
  import {keywordControls} from './src/ui/keywords.js';
  const p=createProject();p.keywords=[{id:'rain',name:'비',description:'',color:'#427963',iconAssetId:null}];
  p.cards[0].name='불꽃 기사';p.cards[0].passives=[{id:'passive',name:'불꽃 강타',effect:'처음 마지막',dice:null,keywords:[]}];
  const store=createStore(p),host=document.getElementById('fixture'),ctx={store,card:()=>store.getProject().cards[0],openKeywords:()=>{}};
  const cardChange=fn=>store.edit('card text',draft=>fn(draft.cards[0],draft.cards[0]));
  const skillChange=fn=>store.edit('skill text',draft=>fn(draft.cards[0].passives[0],draft.cards[0]));
  function render(){preserveFocus(()=>{const card=ctx.card(),skill=card.passives[0];host.replaceChildren(
   el('section',{id:'card-controls'},rangeTextField('카드 이름','card-name',card,'name',cardChange),keywordControls(ctx,card,cardChange,'card-name',{field:'name'})),
   el('section',{id:'skill-controls'},rangeTextField('기술 이름','skill-name',skill,'name',skillChange),keywordControls(ctx,skill,skillChange,'skill-name',{field:'name'}),skillEffectField(card,skill,skillChange,'skill-effect',store),keywordControls(ctx,skill,skillChange,'skill-effect'))
  );});}
  store.subscribe(render);render();window.keywordProject=()=>structuredClone(store.getProject());window.keywordRerender=render;
 `},bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});
 const bundle=await uiBundle,browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 t.after(()=>browser.close());const page=await browser.newPage();
 await page.setContent('<!doctype html><html lang="ko"><body><main id="fixture"></main><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>');
 return page;
}

test('title controls insert at the remembered selection after picker and button focus',async t=>{
 const page=await keywordPage(t),input=page.locator('#skill-name');
 assert.equal(await page.locator('#skill-controls .skill-keyword-picker').count(),1,'body selectors still identify only the body picker');
 assert.equal(await page.locator('#skill-controls .title-keyword-picker').count(),1);
 await input.evaluate(e=>{e.focus();e.setSelectionRange(3,5);e.dispatchEvent(new Event('select',{bubbles:true}));});
 await page.locator('#skill-controls .title-keyword-picker').focus();
 await page.locator('#skill-controls .title-keyword-picker').selectOption('rain');
 await page.locator('#skill-controls .keyword-add-title').focus();
 await page.locator('#skill-controls .keyword-add-title').click();
 const result=await page.evaluate(()=>({skill:keywordProject().cards[0].passives[0],active:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}));
 assert.equal(result.skill.name,'불꽃 비');assert.equal(result.skill.effect,'처음 마지막');
 assert.deepEqual(result.skill.nameKeywords,[{keywordId:'rain',display:'inline'}]);assert.deepEqual(result.skill.keywords,[]);
 assert.deepEqual([result.active,result.start,result.end],['skill-name',4,4]);
});

test('title insertion waits for composition and retains the committed caret across rerenders',async t=>{
 const page=await keywordPage(t),picker=page.locator('#card-controls .title-keyword-picker');
 assert.equal(await picker.count(),1,'card names provide their own title keyword control');
 await picker.selectOption('rain');
 await page.locator('#card-name').evaluate(e=>{
  e.focus();e.setSelectionRange(3,3);e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
  e.value='불꽃 바람 기사';e.setSelectionRange(5,5);e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'바람',isComposing:true}));
 });
 await page.locator('#card-controls .keyword-add-title').click();
 assert.equal(await page.evaluate(()=>keywordProject().cards[0].name),'불꽃 기사','a partial composition must not be saved or replaced');
 await page.locator('#card-name').evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'바람'})));
 await page.waitForFunction(()=>keywordProject().cards[0].name==='불꽃 바람 기사');
 await page.locator('#card-controls .keyword-add-title').click();
 const result=await page.evaluate(()=>({name:keywordProject().cards[0].name,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}));
 assert.deepEqual(result,{name:'불꽃 바람 비 기사',start:7,end:7});
});

test('discarding a composing input does not leave a later title field locked',async t=>{
 const page=await keywordPage(t);
 await page.locator('#card-controls .title-keyword-picker').selectOption('rain');
 await page.locator('#card-name').evaluate(e=>{e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));});
 await page.evaluate(()=>keywordRerender());
 await page.locator('#card-name').evaluate(e=>{e.focus();e.setSelectionRange(3,3);e.dispatchEvent(new Event('select',{bubbles:true}));});
 await page.locator('#card-controls .keyword-add-title').click();
 assert.equal(await page.evaluate(()=>keywordProject().cards[0].name),'불꽃 비 기사');
});
