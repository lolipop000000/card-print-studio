import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url)),PX_MM=25.4/300;
const bundle=build({absWorkingDir:root,stdin:{contents:"import './src/app.js';import {createProject} from './src/model/project.js';window.alignmentFixtureProject=createProject;",resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'}});
async function open(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
 await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><body><div id="app"></div></body></html>');await page.addStyleTag({content:await readFile(new URL('../src/styles.css',import.meta.url),'utf8')});await page.addScriptTag({content:(await bundle).outputFiles[0].text});await page.waitForSelector('[data-ready="true"]');
 const project=await page.evaluate(()=>{const p=window.alignmentFixtureProject(),c=p.cards[0];p.name='정렬 이동 검증';c.template='custom';c.autoSkillLayout=false;
 const rect=(id,x,y,w=10,h=8)=>({id,type:'rect',binding:null,rect:{x,y,w,h},style:{fill:'#b7dbcf',color:'#183e32'}});
 c.elements=[rect('one',7,12),rect('two',28,25,8,11),rect('three',43,45,12,10),rect('untouched',8,70,14,8)];p.back.elements=[rect('back-one',5,15,8,8),rect('back-two',24,32,12,12),rect('back-three',45,52,10,10)];return p;});
 await page.locator('#project-file').setInputFiles({name:'alignment.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.getElementById('deck-name').value==='정렬 이동 검증'&&document.getElementById('save-state').textContent==='저장됨');return {browser,page,project,errors};
 }catch(error){await browser.close();throw error;}
}
async function save(page){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'프로젝트 파일 내보내기',exact:true}).click();const stream=await (await pending).createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString());}
async function clickAt(page,x,y,shift=false){const b=await page.locator('#card-canvas').boundingBox();if(shift)await page.keyboard.down('Shift');try{await page.mouse.click(b.x+x*b.width/63,b.y+y*b.height/88);}finally{if(shift)await page.keyboard.up('Shift');}}
const rects=p=>Object.fromEntries(p.cards[0].elements.map(e=>[e.id,e.rect]));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,actual+' should equal '+expected);

test('arrow movement uses one printed pixel and ten with Shift independently of zoom',async()=>{
 const s=await open();try{const {page,project}=s;await clickAt(page,10,16);await page.keyboard.press('ArrowRight');let got=await save(page);close(rects(got).one.x,rects(project).one.x+PX_MM);
 await page.locator('#card-zoom').evaluate(input=>{input.value='9';input.dispatchEvent(new Event('input',{bubbles:true}));});await clickAt(page,10,16);await page.keyboard.press('Shift+ArrowDown');got=await save(page);close(rects(got).one.y,rects(project).one.y+PX_MM*10);assert.deepEqual(rects(got).two,rects(project).two);
 await page.locator('#undo').click();await page.locator('#undo').click();assert.deepEqual(await save(page),project);assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});

test('single and multiple selections expose card and selection alignment controls',async()=>{
 const s=await open();try{const {page}=s;await clickAt(page,10,16);assert.equal(await page.locator('#element-alignment-reference').count(),1);assert.equal(await page.locator('#element-alignment-reference').inputValue(),'card');await clickAt(page,30,28,true);assert.equal(await page.locator('#element-alignment-reference').inputValue(),'selection');assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});

test('alignment applies to one or many elements in one undo, retains selection and never records a no-op',async()=>{
 const s=await open();try{const {page,project}=s;await clickAt(page,10,16);await page.locator('#element-align-left').click();let got=await save(page);assert.equal(rects(got).one.x,0);assert.deepEqual(got.cards[0].elements.slice(1),project.cards[0].elements.slice(1));assert.equal(await page.locator('#selection-box').getAttribute('data-count'),'1');
 await page.locator('#element-align-left').click();await page.locator('#undo').click();assert.deepEqual(await save(page),project);assert.equal(await page.locator('#undo').isDisabled(),true);
 await clickAt(page,30,28,true);assert.equal(await page.locator('#element-alignment-reference').inputValue(),'selection');await page.locator('#element-align-top').click();got=await save(page);assert.equal(rects(got).one.y,12);assert.equal(rects(got).two.y,12);assert.deepEqual(got.cards[0].elements.slice(2),project.cards[0].elements.slice(2));assert.equal(await page.locator('.selection-member').count(),2);
 await page.locator('#undo').click();assert.deepEqual(await save(page),project);await page.locator('#element-alignment-reference').selectOption('card');await page.locator('#element-align-right').click();got=await save(page);assert.equal(rects(got).one.x,53);assert.equal(rects(got).two.x,55);assert.equal(await page.locator('#element-alignment-reference').inputValue(),'card');await page.locator('#undo').click();assert.deepEqual(await save(page),project);assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});

test('equal-gap distribution, common-back alignment, redo and JSON save preserve all unrelated content',async()=>{
 const s=await open();try{const {page,project}=s;await clickAt(page,10,16);await clickAt(page,30,28,true);assert.equal(await page.locator('#element-distribute-horizontal').isDisabled(),true);await clickAt(page,46,48,true);await page.locator('#element-distribute-horizontal').click();const horizontal=await save(page);assert.equal(rects(horizontal).one.x,7);assert.equal(rects(horizontal).two.x,26);assert.equal(rects(horizontal).three.x,43);assert.deepEqual(rects(horizontal).untouched,rects(project).untouched);
 await page.locator('#undo').click();assert.deepEqual(await save(page),project);await page.locator('#redo').click();assert.deepEqual(await save(page),horizontal);await page.locator('#element-distribute-vertical').click();const distributed=await save(page);assert.equal(rects(distributed).one.y,12);assert.equal(rects(distributed).two.y,27);assert.equal(rects(distributed).three.y,45);await page.locator('#undo').click();await page.locator('#undo').click();assert.deepEqual(await save(page),project);
 await page.locator('#back-tab').click();await clickAt(page,8,18);await clickAt(page,27,35,true);await clickAt(page,48,55,true);await page.locator('#element-alignment-reference').selectOption('card');await page.locator('#element-align-bottom').click();const saved=await save(page);assert.deepEqual(saved.cards,project.cards);assert.deepEqual(saved.back.elements.map(e=>e.rect.y),[80,76,78]);assert.equal(await page.locator('#selection-box').getAttribute('data-count'),'3');await page.locator('#undo').click();assert.deepEqual(await save(page),project);await page.locator('#redo').click();assert.deepEqual(await save(page),saved);
 await page.locator('#project-file').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');assert.deepEqual(await save(page),saved);assert.equal(await page.locator('#selection-box').isHidden(),true);assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});

test('arrow typing and dialog guards remain intact and group moves clamp as a group at card bounds',async()=>{
 const s=await open();try{const {page,project}=s;await clickAt(page,10,16);await page.locator('#deck-name').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');assert.deepEqual(await save(page),project);
 await page.locator('#element-alignment-reference').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');assert.deepEqual(await save(page),project);await page.locator('#keyword-manager').click();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('Escape');assert.deepEqual(await save(page),project);
 await clickAt(page,30,28,true);await page.locator('#card-zoom').evaluate(input=>{input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('.card-stage').focus();await page.keyboard.press('ArrowRight');let got=await save(page);for(const id of ['one','two'])close(rects(got)[id].x,rects(project)[id].x+PX_MM);
 await page.locator('.card-stage').focus();for(let i=0;i<40;i++)await page.keyboard.press('Shift+ArrowRight');got=await save(page);close(rects(got).two.x+rects(got).two.w,63);close(rects(got).two.x-rects(got).one.x,21);assert.deepEqual(rects(got).three,rects(project).three);
 await page.locator('.card-stage').focus();await page.keyboard.press('ArrowRight');await page.locator('#undo').click();const previous=await save(page);assert.ok(rects(previous).two.x<55);assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});

test('manual art alignment retains automatic skill flow while bound skill and item alignment disables it',async()=>{
 const s=await open();try{const {page}=s;let project=await page.evaluate(()=>{const p=window.alignmentFixtureProject(),c=p.cards[0],canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);p.name='자동 정렬 회귀';p.assets['original-art']={id:'original-art',mime:'image/png',width:2,height:2,dataUrl:canvas.toDataURL(),paintingId:null};c.artAssetId='original-art';c.template='monster-standard';c.autoSkillLayout=true;c.passives=[{id:'alignment-skill',name:'원본 기술',effect:'내용 보존',dice:null,keywords:[]}];
 c.elements=[{id:'art-only',type:'image',binding:{field:'art'},rect:{x:7,y:12,w:10,h:8},style:{fit:'contain',cropX:.5,cropY:.5}},{id:'bound-skill',type:'text',binding:{field:'skill.effect',skillId:'alignment-skill'},rect:{x:28,y:25,w:10,h:11},style:{fontPt:8,color:'#183e32'}}];return p;});
 await page.locator('#project-file').setInputFiles({name:'auto.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.getElementById('deck-name').value==='자동 정렬 회귀');project=await save(page);await clickAt(page,10,16);await page.locator('#element-align-left').click();let got=await save(page);assert.equal(got.cards[0].template,'custom');assert.equal(got.cards[0].autoSkillLayout,true);assert.deepEqual(got.assets,project.assets);assert.deepEqual(got.cards[0].elements[1],project.cards[0].elements[1]);await page.locator('#undo').click();assert.deepEqual(await save(page),project);
 const nameRow=project.cards[0].elements.find(e=>e.binding?.field==='skill.name');await clickAt(page,nameRow.rect.x+nameRow.rect.w/2,nameRow.rect.y+nameRow.rect.h/2,true);await page.locator('#element-align-left').click();got=await save(page);assert.equal(got.cards[0].autoSkillLayout,true,'stationary bound rows must retain automatic flow when only artwork moves');assert.deepEqual(got.cards[0].elements.find(e=>e.id===nameRow.id),nameRow);await page.locator('#undo').click();assert.deepEqual(await save(page),project);const skillRect=project.cards[0].elements.find(e=>e.binding?.field==='skill.effect').rect;await clickAt(page,skillRect.x+skillRect.w/2,skillRect.y+skillRect.h/2);await page.locator('#element-align-right').click();got=await save(page);assert.equal(got.cards[0].template,'custom');assert.equal(got.cards[0].autoSkillLayout,false);assert.deepEqual(got.assets,project.assets);assert.deepEqual(got.cards[0].passives,project.cards[0].passives);await page.locator('#undo').click();assert.deepEqual(await save(page),project);
 const item=structuredClone(project);item.name='아이템 정렬 회귀';item.cards[0].kind='item';item.cards[0].effect='아이템 원본';item.cards[0].keywords=[];item.cards[0].template='item';item.cards[0].elements=item.cards[0].elements.filter(e=>e.id==='art-only');item.cards[0].elements.push({id:'item-effect',type:'text',binding:{field:'item.effect'},rect:{x:28,y:25,w:10,h:11},style:{fontPt:8}});await page.locator('#project-file').setInputFiles({name:'item.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(item))});await page.waitForFunction(()=>document.getElementById('deck-name').value==='아이템 정렬 회귀');const loadedItem=await save(page),itemRect=loadedItem.cards[0].elements.find(e=>e.binding?.field==='item.effect').rect;await clickAt(page,itemRect.x+itemRect.w/2,itemRect.y+itemRect.h/2);await page.locator('#element-align-bottom').click();got=await save(page);assert.equal(got.cards[0].autoSkillLayout,false);assert.equal(got.cards[0].template,'custom');assert.equal(got.cards[0].effect,'아이템 원본');await page.locator('#undo').click();assert.deepEqual(await save(page),loadedItem);assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});

test('impossible overlap distribution explains the problem without changing pixels, selection or undo',async()=>{
 const s=await open();try{const {page,project}=s;project.name='겹침 정렬 회귀';project.cards[0].elements=[{id:'wide',type:'rect',binding:null,rect:{x:0,y:10,w:50,h:8},style:{fill:'#426647'}},{id:'inside',type:'rect',binding:null,rect:{x:10,y:30,w:5,h:8},style:{fill:'#426647'}},{id:'edge',type:'rect',binding:null,rect:{x:20,y:50,w:5,h:8},style:{fill:'#426647'}}];await page.locator('#project-file').setInputFiles({name:'overlap.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>document.getElementById('deck-name').value==='겹침 정렬 회귀');await clickAt(page,5,14);await clickAt(page,12,34,true);await clickAt(page,22,54,true);await page.locator('#element-distribute-horizontal').click();assert.match(await page.locator('#message').textContent(),/순서|겹쳐/);assert.deepEqual(await save(page),project);assert.equal(await page.locator('#undo').isDisabled(),true);assert.equal(await page.locator('#selection-box').getAttribute('data-count'),'3');assert.deepEqual(s.errors,[]);
 }finally{await s.browser.close();}
});
