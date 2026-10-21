import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {keywordTargets,keywordUseCount,selectedKeywords,linkKeyword,insertKeywordText,updateKeyword,removeKeyword} from '../src/model/keywords.js';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import path from 'node:path';

const keyword=(id,name)=>({id,name,description:'',color:'#427963',iconAssetId:null});
function fixture(){
 const rain=keyword('rain','비'),storm=keyword('storm','비바람');
 const passive={id:'passive',name:'비의 기사',effect:'비를 얻는다.',keywords:[{keywordId:'rain',display:'both'}],nameKeywords:[{keywordId:'rain',display:'inline'}]};
 const active={id:'active',name:'비바람 강타',effect:'비바람',keywords:[{keywordId:'storm',display:'inline'}],nameKeywords:[{keywordId:'storm',display:'inline'}]};
 const card={id:'monster',kind:'monster',name:'비의 정령',nameKeywords:[{keywordId:'rain',display:'inline'}],passives:[passive],actives:[active]};
 const item={id:'item',kind:'item',name:'비의 돌',effect:'비를 얻는다.',keywords:[{keywordId:'rain',display:'inline'}],nameKeywords:[{keywordId:'rain',display:'inline'}]};
 return {project:{cards:[card,item],keywords:[rain,storm]},card,item,passive,active,rain,storm};
}

test('typed title keywords are automatic while body display filters stay independent',()=>{
 const {project,passive}=fixture();
 passive.nameKeywords=[{keywordId:'storm',display:'inline'}];
 assert.deepEqual(selectedKeywords(project,passive,'title').map(k=>k.id),['rain']);
 assert.deepEqual(selectedKeywords(project,passive,'inline').map(k=>k.id),['rain']);
 assert.deepEqual(selectedKeywords(project,passive,'badge').map(k=>k.id),['rain']);
 assert.deepEqual(selectedKeywords(project,passive).map(k=>k.id),['rain']);
});

test('card, skill and item titles match registered keywords without explicit title links',()=>{
 const {project,card,passive,active,item}=fixture();
 for(const owner of [card,passive,active,item])delete owner.nameKeywords;
 assert.deepEqual([card,passive,active,item].map(owner=>selectedKeywords(project,owner,'title').map(k=>k.id)),[['rain'],['rain'],['storm'],['rain']]);
 assert.deepEqual(selectedKeywords(project,{name:'비바람 비 비'},'name').map(k=>k.id),['rain','storm']);
 assert.deepEqual(selectedKeywords(project,{name:'맑은 하늘'},'title'),[]);
 assert.equal(keywordUseCount(project,'rain'),3);
 assert.equal(keywordUseCount(project,'storm'),1);
 assert.deepEqual(selectedKeywords(project,{name:'비',effect:'비'},'inline'),[],'automatic title matching must not enable body keywords');
});

test('a keyword added after a typed title becomes active without rewriting the authored text',()=>{
 const project={keywords:[]},owner={name:'폭풍 [빛]+ 폭풍',effect:'[빛]+'};
 assert.deepEqual(selectedKeywords(project,owner,'title'),[]);
 project.keywords.push(keyword('literal','[빛]+'),keyword('storm','폭풍'));
 assert.deepEqual(selectedKeywords(project,owner,'title').map(k=>k.id),['literal','storm']);
 assert.equal(owner.name,'폭풍 [빛]+ 폭풍');
 assert.equal(Object.hasOwn(owner,'nameKeywords'),false,'display is derived and must not create an extra saved edit');
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

test('renaming automatic title keywords uses longest literal matches and preserves unlinked body text',()=>{
 const {project,card,item,passive,active}=fixture();
 card.name='비바람 비';card.nameKeywords.push({keywordId:'storm',display:'inline'});
 passive.nameKeywords=[];
 active.name='비바람 비';active.effect='비 비바람';
 updateKeyword(project,'rain',{name:'폭우'});
 assert.equal(card.name,'비바람 폭우');assert.equal(item.name,'폭우의 돌');
 assert.equal(item.effect,'폭우를 얻는다.');assert.equal(passive.effect,'폭우를 얻는다.');
 assert.equal(passive.name,'폭우의 기사');assert.equal(active.name,'비바람 폭우');assert.equal(active.effect,'비 비바람');
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

async function titleInk(page,card){
 const rects=card.elements.filter(e=>e.binding?.field==='name'||e.binding?.field==='skill.name').map(e=>e.rect);
 return page.locator('#card-canvas').evaluate((canvas,rects)=>{
  const scale=canvas.width/63,ctx=canvas.getContext('2d');
  return rects.map(r=>{
   const data=ctx.getImageData(Math.floor(r.x*scale),Math.floor(r.y*scale),Math.ceil(r.w*scale),Math.ceil(r.h*scale)).data;let text=0,icon=0;
   for(let i=0;i<data.length;i+=4){if(data[i]>160&&data[i+1]<80&&data[i+2]>35&&data[i+2]<125)text++;if(data[i]<40&&data[i+1]>45&&data[i+1]<140&&data[i+2]>210)icon++;}
   return {text,icon};
  });
 },rects);
}

test('real editor automatically styles typed monster, skill and item titles and restores them from JSON',async t=>{
 const app=await openApp(),{page}=app;t.after(()=>app.browser.close());
 await page.locator('#card-name').fill('불꽃 기사');
 for(const [kind,name] of [['passives','불꽃 수호'],['actives','불꽃 강타']]){
  await page.locator(kind==='passives'?'#add-passive':'#add-active').click();
  await page.locator('#'+kind+' .skill-name').fill(name);
  await page.locator('#'+kind+' .skill-effect').fill('불꽃은 본문에만 쓴 글자');
 }
 // Register after the titles were authored: no picker or insertion button is used.
 await page.locator('#keyword-manager').click();await page.locator('#keyword-add').click();
 await page.locator('#keyword-name').fill('불꽃');await page.locator('#keyword-description').click();
 await page.locator('#keyword-color').fill('#dd1144');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;const g=c.getContext('2d');g.fillStyle='#0055ff';g.fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#keyword-icon-file').setInputFiles({name:'fire.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.locator('#keyword-icon-preview').waitFor();await page.locator('#keyword-close').click();
 assert.equal(await page.locator('.title-keywords .keyword-mark').count(),3);
 assert.equal(await page.locator('.title-keywords .keyword-reference button').count(),0,'automatic matches must not offer an ineffective unlink button');
 await page.locator('#card-name').fill('불꽃의 기사');await page.locator('#undo').click();assert.equal(await page.locator('#card-name').inputValue(),'불꽃 기사');
 await page.locator('#redo').click();assert.equal(await page.locator('#card-name').inputValue(),'불꽃의 기사');
 const monster=await saveProject(page,'automatic-title-monster.json');
 await page.waitForFunction(()=>{const c=document.getElementById('card-canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4===0&&v>160&&d[i+1]<80&&d[i+2]>35&&d[i+2]<125);});
 for(const ink of await titleInk(page,monster.cards[0])){assert.ok(ink.text>8,'each typed title must render the keyword color');assert.ok(ink.icon>8,'each typed title must render the keyword icon');}
 assert.ok(monster.cards[0].passives.every(s=>s.keywords.length===0));assert.ok(monster.cards[0].actives.every(s=>s.keywords.length===0));
 await page.locator('#card-name').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(qa,'automatic-title-keywords.png')});
 await page.locator('#add-item').click();await page.locator('#card-name').fill('불꽃 돌');
 const saved=await saveProject(page,'automatic-title-deck.json');
 assert.equal(await page.locator('.title-keywords .keyword-mark').count(),1);
 for(const ink of await titleInk(page,saved.cards[1])){assert.ok(ink.text>8);assert.ok(ink.icon>8);}
 const restored=await openApp();t.after(()=>restored.browser.close());
 await restored.page.locator('#project-file').setInputFiles(path.join(qa,'automatic-title-deck.json'));
 await restored.page.waitForFunction(()=>document.getElementById('card-name')?.value==='불꽃의 기사');
 assert.equal(await restored.page.locator('.title-keywords .keyword-mark').count(),3);
 assert.deepEqual(await saveProject(restored.page,'automatic-title-restored.json'),saved);
 for(const ink of await titleInk(restored.page,saved.cards[0])){assert.ok(ink.text>8);assert.ok(ink.icon>8);}
 assert.deepEqual(app.pageErrors,[]);assert.deepEqual(restored.pageErrors,[]);
 assert.equal(app.httpRequests.length+restored.httpRequests.length,0);
});
