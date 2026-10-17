import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
import {createProject,createCard} from '../src/model/project.js';
import {applyTemplate} from '../src/render/templates.js';
import {createVariant} from '../src/model/variants.js';

function fixture(){
 const p=createProject();p.cards[0].id='design-source';p.cards[0].name='서식 원본';p.cards[0].passives=[{id:'source-skill',name:'원본 기술',effect:'원본 내용',dice:null,keywords:[],nameStyle:{fontPt:12,color:'#cc3344'}}];
 p.cards[0]=applyTemplate(p.cards[0],p.settings,'monster-standard');p.cards[0].template='custom';p.cards[0].autoSkillLayout=false;
 const title=p.cards[0].elements.find(e=>e.binding?.field==='name');title.rect={x:3,y:4,w:25,h:8};title.style.fontPt=17;
 p.cards[0].elements.push({id:'design-decoration',type:'text',rect:{x:4,y:76,w:40,h:5},binding:null,content:'내 장식 문구',style:{fontPt:9,color:'#665544'}});
 let target=createCard('monster',p);Object.assign(target,{id:'design-target',name:'서식을 받을 카드',rank:'S',baseHp:778,hpReduction:18,quantity:3,attributes:['water','dark'],attribute:'water',passives:[{id:'target-skill',name:'내 기술',effect:'내 기술 내용',dice:null,keywords:[]}]});
 target=applyTemplate(target,p.settings,'monster-standard');p.cards.push(target);return p;
}
let loadNumber=0;
async function load(page,p){const incoming={...p,name:'카드 서식 검증 덱 '+ ++loadNumber};await page.locator('#project-file').setInputFiles({name:'card-designs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});await page.waitForFunction(({deck,card})=>document.getElementById('deck-name')?.value===deck&&document.getElementById('card-name')?.value===card,{deck:incoming.name,card:p.cards[0].name});}
async function open(page){await page.locator('#card-templates').click();await page.locator('#card-template-dialog').waitFor();}
async function close(page){await page.locator('#card-template-close').click();await page.locator('#card-template-dialog').waitFor({state:'detached'});}
async function save(page,name){await page.locator('#card-template-name').fill(name);await page.locator('#card-template-save').click();}
function content(c){const {elements,template,autoSkillLayout,visualEffects,variant,...value}=c;for(const field of ['passives','actives'])if(value[field])value[field]=value[field].map(({nameStyle,...sk})=>sk);return value;}

test('saved design access follows replacement deck selection and front or back view',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);await load(page,fixture());assert.equal(await page.locator('#card-templates').isDisabled(),false);await open(page);await close(page);
  await page.locator('#back-tab').click();assert.equal(await page.locator('#card-templates').isDisabled(),true);
  await page.locator('#front-tab').click();assert.equal(await page.locator('#card-templates').isDisabled(),false);
  const replacement=createProject();replacement.cards[0].name='다른 ID의 카드';await load(page,replacement);assert.equal(await page.locator('#card-templates').isDisabled(),false);await open(page);
  assert.match(await page.locator('.card-template-target').innerText(),/다른 ID의 카드/);await close(page);
  await page.getByRole('button',{name:'새 덱',exact:true}).click();assert.equal(await page.locator('#card-templates').isDisabled(),false);await open(page);await close(page);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('saved card designs survive source deletion and project transfer and apply as one undoable visual change',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);const p=fixture();await load(page,p);await open(page);await save(page,'내 바다 서식');await close(page);
  await page.locator('#delete-card').click();const portable=await saveProject(page,'card-design-portable.json');assert.equal(portable.cardTemplates[0].name,'내 바다 서식');assert.equal(portable.cards.length,1);
  Object.assign(portable.settings,{cardWidthMm:126,cardHeightMm:44,maxWidthMm:126});await load(page,portable);const before=await saveProject(page,'card-design-before.json');
  await open(page);await page.locator('[data-template-id] [data-action="apply"]').click();await close(page);const applied=await saveProject(page,'card-design-applied.json');
  assert.deepEqual(content(applied.cards[0]),content(before.cards[0]));const title=applied.cards[0].elements.find(e=>e.binding?.field==='name');assert.equal(title.style.fontPt,17);assert.deepEqual(title.rect,{x:6,y:2,w:50,h:4});
  assert.equal(applied.cards[0].elements.find(e=>!e.binding&&e.type==='text').content,'내 장식 문구');assert.ok(applied.cards[0].elements.some(e=>e.binding?.skillId==='target-skill'));
  await page.locator('#undo').click();assert.deepEqual(await saveProject(page,'card-design-undo.json'),before);await page.locator('#redo').click();assert.deepEqual(await saveProject(page,'card-design-redo.json'),applied);
  await page.screenshot({path:path.join(qa,'card-template-applied.png'),fullPage:true});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('duplicate card design saves offer overwrite, add and cancel and saved names can be changed or deleted',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);await load(page,fixture());await open(page);await save(page,'같은 서식');assert.equal(await page.locator('[data-template-id]').count(),1);
  await save(page,'같은 서식');await page.locator('#card-template-duplicate-dialog').getByRole('button',{name:'취소',exact:true}).click();assert.equal(await page.locator('[data-template-id]').count(),1);
  await save(page,'같은 서식');await page.locator('#card-template-duplicate-dialog').getByRole('button',{name:'추가',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-template-id]').length===2);
  await save(page,'같은 서식');await page.locator('#card-template-duplicate-target').selectOption({index:1});await page.locator('#card-template-duplicate-dialog').getByRole('button',{name:'덮어쓰기',exact:true}).click();await page.locator('#card-template-duplicate-dialog').waitFor({state:'detached'});assert.equal(await page.locator('[data-template-id]').count(),2);
  await page.locator('[data-template-id] [data-action="rename"]').first().click();await page.locator('#card-template-rename-name').fill('새 이름');await page.locator('#card-template-rename-dialog').getByRole('button',{name:'이름 변경',exact:true}).click();await page.locator('[data-template-id]').filter({hasText:'새 이름'}).waitFor();
  await page.locator('[data-template-id]').filter({hasText:'새 이름'}).locator('[data-action="delete"]').click();assert.equal(await page.locator('[data-template-id]').count(),1);await close(page);
  const saved=await saveProject(page,'card-design-renamed.json');assert.equal(saved.cardTemplates.length,1);assert.equal(saved.cardTemplates[0].name,'같은 서식');assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('applying a card design preserves Variant relation and its own game content',async()=>{
 const {browser,page,pageErrors}=await openApp();try{
  page.setDefaultTimeout(10_000);const p=fixture(),variant=createVariant(p,'design-target',{label:'내 별도 Variant',quantity:5});p.cards.push(variant);await load(page,p);
  await open(page);await save(page,'Variant 서식');await close(page);await page.locator('[data-card-id="'+variant.id+'"] .card-select').click();
  const before=await saveProject(page,'card-design-variant-before.json');await open(page);await page.locator('[data-template-id] [data-action="apply"]').click();await close(page);
  const after=await saveProject(page,'card-design-variant-after.json'),card=after.cards.find(c=>c.id===variant.id),old=before.cards.find(c=>c.id===variant.id);
  assert.deepEqual(content(card),content(old));assert.equal(card.variant.parentId,'design-target');assert.equal(card.variant.label,'내 별도 Variant');assert.equal(card.elements.find(e=>e.binding?.field==='name').style.fontPt,17);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
