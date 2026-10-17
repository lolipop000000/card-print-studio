import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,openHarness,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
const PX_MM=25.4/300;

async function open(){
 const h=await openHarness();let project;
 try{project=await h.page.evaluate(()=>{const a=window.testApi,p=a.createProject(),c=p.cards[0];p.name='다중 선택 검증';c.template='custom';c.autoSkillLayout=false;c.name='함께 배치';c.passives=[{id:'group-skill',name:'묶음 기술',effect:'효과',dice:null,keywords:[]}];
  const rect=(id,x,y,w=12,h=10)=>({id,type:'rect',binding:null,rect:{x,y,w,h},style:{fill:'#d2e6dc',color:'#315847'}});
  c.elements=[rect('one',7,12),rect('two',28,13,12,11),{id:'three',type:'text',binding:{field:'skill.effect',skillId:'group-skill'},rect:{x:22,y:40,w:12,h:10},style:{fontPt:8,color:'#315847'}}];
  p.back.elements=[rect('back-one',10,12),rect('back-two',30,12)];return p;});}finally{await h.browser.close();}
 const s=await openApp();await s.page.locator('#project-file').setInputFiles({name:'multi.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await s.page.waitForFunction(()=>document.getElementById('deck-name').value==='다중 선택 검증'&&document.getElementById('save-state').textContent==='저장됨');return {...s,project};
}
async function pt(page,x,y){const b=await page.locator('#card-canvas').boundingBox();return {x:b.x+x*b.width/63,y:b.y+y*b.height/88};}
async function click(page,x,y,shift=false){const p=await pt(page,x,y);if(shift)await page.keyboard.down('Shift');try{await page.mouse.click(p.x,p.y);}finally{if(shift)await page.keyboard.up('Shift');}}
async function drag(page,x1,y1,x2,y2,shift=false){const a=await pt(page,x1,y1),b=await pt(page,x2,y2);if(shift)await page.keyboard.down('Shift');try{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();}finally{if(shift)await page.keyboard.up('Shift');}}
const count=async page=>Number(await page.locator('#selection-box').getAttribute('data-count'));
const rects=p=>Object.fromEntries(p.cards[0].elements.map(e=>[e.id,e.rect]));
function closeErrors(s){assert.deepEqual(s.pageErrors,[]);assert.deepEqual(s.httpRequests,[]);}

test('marquee drag in both directions selects intersecting elements without saving selection or undo history',async()=>{
 const s=await open();try{const {page,project}=s;await drag(page,3,7,44,30);assert.equal(await count(page),2);assert.equal(await page.locator('.selection-member').count(),2);assert.equal(await page.locator('#selection-count').textContent(),'2개 요소 선택');
  assert.deepEqual(await saveProject(page,'multi-selection-only.json'),project);assert.equal(await page.locator('#undo').isDisabled(),true);
  await click(page,55,65);assert.equal(await page.locator('#selection-box').isHidden(),true);await drag(page,44,30,3,7);assert.equal(await count(page),2);closeErrors(s);
 }finally{await s.browser.close();}
});
test('Shift click adds and removes an element, plain click replaces, Shift marquee adds',async()=>{
 const s=await open();try{const {page}=s;await click(page,10,16);assert.equal(await count(page),1);await click(page,31,17,true);assert.equal(await count(page),2);await click(page,10,16,true);assert.equal(await count(page),1);
  await click(page,25,44);assert.equal(await count(page),1);await drag(page,3,7,44,30,true);assert.equal(await count(page),3);await click(page,31,17);assert.equal(await count(page),1);closeErrors(s);
 }finally{await s.browser.close();}
});
test('selected elements drag as one group, preserve spacing at the card edge and undo in one action',async()=>{
 const s=await open();try{const {page,project}=s;await drag(page,3,7,44,30);assert.equal(await count(page),2);await drag(page,10,16,17,21);const moved=await saveProject(page,'multi-moved.json'),r=rects(moved),before=rects(project);
  for(const id of ['one','two']){assert.ok(Math.abs(r[id].x-before[id].x-7)<.02);assert.ok(Math.abs(r[id].y-before[id].y-5)<.02);}assert.deepEqual(r.three,before.three);
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'multi-undone.json'),project);await page.locator('#redo').click();assert.deepEqual(await saveProject(page,'multi-redone.json'),moved);
  await drag(page,17,21,110,21);const clipped=rects(await saveProject(page,'multi-clamped.json'));assert.ok(Math.abs(clipped.two.x+clipped.two.w-63)<.02);assert.ok(Math.abs(clipped.two.x-clipped.one.x-21)<.02);closeErrors(s);
 }finally{await s.browser.close();}
});
test('group arrows, duplicate and delete apply to every selected element, with exact undo',async()=>{
 const s=await open();try{const {page,project}=s;await click(page,10,16);await click(page,25,44,true);assert.equal(await count(page),2);await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');const moved=await saveProject(page,'multi-arrow.json'),r=rects(moved);
  for(const id of ['one','three']){assert.equal(r[id].x,rects(project)[id].x+PX_MM);assert.equal(r[id].y,rects(project)[id].y+PX_MM*10);}assert.equal(moved.cards[0].autoSkillLayout,false);
  await page.locator('#duplicate-elements').click();const doubled=await saveProject(page,'multi-duplicated.json');assert.equal(doubled.cards[0].elements.length,5);assert.equal(await count(page),2);await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'multi-duplicate-undo.json'),moved);
  await drag(page,3,7,44,30);assert.equal(await count(page),2);await page.keyboard.press('Delete');const deleted=await saveProject(page,'multi-deleted.json');assert.deepEqual(deleted.cards[0].elements.map(e=>e.id),['three']);await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'multi-delete-undo.json'),moved);closeErrors(s);
 }finally{await s.browser.close();}
});
test('outside margin marquee, Escape and pointercancel restore selection and leave the project untouched',async()=>{
 const s=await open();try{const {page,project}=s;await click(page,25,44);const a=await pt(page,-2,7),b=await pt(page,44,30);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});assert.equal(await count(page),2);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await count(page),1);assert.equal(await page.locator('#selection-marquee').isHidden(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#selection-box').isHidden(),true);await drag(page,3,7,44,30);const start=await pt(page,10,16),end=await pt(page,18,20);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y);await page.locator('.card-stage').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.deepEqual(await saveProject(page,'multi-cancelled.json'),project);assert.equal(await page.locator('#undo').isDisabled(),true);closeErrors(s);
 }finally{await s.browser.close();}
});
test('common-back multiselection moves only the back and switching card or importing clears selection',async()=>{
 const s=await open();try{const {page,project}=s;await drag(page,3,7,44,30);await page.locator('#back-tab').click();assert.equal(await page.locator('#selection-box').isHidden(),true);await drag(page,4,7,48,28);assert.equal(await count(page),2);await drag(page,14,16,19,19);const saved=await saveProject(page,'multi-back.json');assert.deepEqual(saved.cards,project.cards);assert.ok(Math.abs(saved.back.elements[0].rect.x-15)<.02);
  await page.screenshot({path:path.join(qa,'multiselect-back.png')});await page.locator('#front-tab').click();assert.equal(await page.locator('#selection-box').isHidden(),true);await drag(page,3,7,44,30);await page.locator('#project-file').setInputFiles({name:'reload.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.locator('#selection-box').waitFor({state:'hidden'});await page.waitForFunction(()=>document.getElementById('save-state').textContent==='저장됨');assert.equal(await page.locator('#selection-box').isHidden(),true);closeErrors(s);
 }finally{await s.browser.close();}
});

 test('moving a bound skill in a group turns off enabled automatic layout',async()=>{
 const s=await open();try{const {page}=s;await page.locator('#auto-skill-layout').check();const before=await saveProject(page,'multi-auto-before.json'),effect=before.cards[0].elements.find(e=>e.id==='three');
 await click(page,10,16);await click(page,effect.rect.x+effect.rect.w-3,effect.rect.y+effect.rect.h/2,true);assert.equal(await count(page),2);await page.keyboard.press('ArrowDown');const moved=await saveProject(page,'multi-auto-moved.json');assert.equal(moved.cards[0].autoSkillLayout,false);
 for(const id of ['one','three'])assert.equal(moved.cards[0].elements.find(e=>e.id===id).rect.y,before.cards[0].elements.find(e=>e.id===id).rect.y+PX_MM);await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'multi-auto-undo.json'),before);closeErrors(s);
 }finally{await s.browser.close();}
});

 test('duplicating bound skills preserves both original and copied positions after later skill edits',async()=>{
 const s=await open();try{const {page}=s;await page.locator('#auto-skill-layout').check();const before=await saveProject(page,'multi-copy-auto-before.json'),effect=before.cards[0].elements.find(e=>e.id==='three');
 await click(page,10,16);await click(page,effect.rect.x+effect.rect.w-3,effect.rect.y+effect.rect.h/2,true);await page.locator('#duplicate-elements').click();const copied=await saveProject(page,'multi-copy-auto-copied.json');assert.equal(copied.cards[0].autoSkillLayout,false);assert.equal(copied.cards[0].elements.length,before.cards[0].elements.length+2);
 await page.locator('#skill-group-skill-name').fill('수정한 묶음 기술');await page.locator('#skill-group-skill-name').press('Tab');const edited=await saveProject(page,'multi-copy-auto-edited.json');assert.deepEqual(edited.cards[0].elements,copied.cards[0].elements);assert.ok(edited.cards[0].elements.some(e=>e.id==='three'));await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'multi-copy-auto-edit-undo.json'),copied);closeErrors(s);
 }finally{await s.browser.close();}
});
