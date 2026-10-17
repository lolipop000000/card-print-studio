import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {exportCardFile,parseCardFile,importCardFile} from '../src/model/card-file.js';
import {createStore} from '../src/model/store.js';
import {applyTemplate,syncSkillElements} from '../src/render/templates.js';
import {setElementSelection,selectedElements,marqueeElements} from '../src/ui/element-selection.js';

const shape=(id,locked)=>({id,type:'rect',binding:null,rect:{x:5,y:5,w:10,h:10},style:{fill:'#427963'},...(locked===undefined?{}:{locked})});

test('optional element locks roundtrip through deck and portable card JSON and remain undoable',()=>{
 const p=createProject(),c=p.cards[0];c.template='custom';c.autoSkillLayout=false;c.elements=[shape('locked',true),shape('unlocked',false),shape('legacy')];p.back.elements=[shape('back-lock',true)];
 assert.deepEqual(parseProject(serializeProject(p)),p);
 const file=exportCardFile(p,c.id),one=parseCardFile(file);assert.deepEqual(one.cards[0],c);
 const destination=createProject(),imported=importCardFile(destination,file);assert.deepEqual(imported.elements.map(e=>e.locked),[true,false,undefined]);
 const store=createStore(p);store.edit('포인터 잠금 해제',d=>{d.cards[0].elements[0].locked=false;});assert.equal(store.getProject().cards[0].elements[0].locked,false);assert.equal(store.undo(),true);assert.deepEqual(store.getProject(),p);assert.equal(store.redo(),true);assert.equal(store.getProject().cards[0].elements[0].locked,false);
});

test('malformed element locks identify the element instead of silently changing pointer behavior',()=>{
 for(const value of ['true',1,null,{},[]]){
  const p=createProject();p.cards[0].elements=[shape('invalid',value)];
  const problem=validateProject(p).find(p=>p.code==='element-lock');assert.equal(problem?.elementId,'invalid',JSON.stringify(value));assert.match(problem.message,/잠금/);assert.throws(()=>parseProject(JSON.stringify(p)),/잠금/);
 }
});

test('skill and item automatic reflow preserve authored lock states and identities',()=>{
 const p=createProject(),c=p.cards[0];c.passives=[{id:'skill',name:'잠긴 기술',effect:'변경 전',dice:null,keywords:[]}];p.cards[0]=applyTemplate(c,p.settings,'monster-standard');
 const card=p.cards[0],name=card.elements.find(e=>e.binding?.field==='skill.name'),effect=card.elements.find(e=>e.binding?.field==='skill.effect');name.id='authored-name';name.locked=true;effect.id='authored-effect';effect.locked=false;card.passives[0].effect='자동 배치 변경 후에도 포인터 잠금 유지';
 const next=syncSkillElements(card,p.settings);assert.equal(next.elements.find(e=>e.id===name.id)?.locked,true);assert.equal(next.elements.find(e=>e.id===effect.id)?.locked,false);assert.equal(next.autoSkillLayout,true);assert.equal(card.elements.find(e=>e.id===name.id).locked,true);
 const item=applyTemplate(createCard('item',p),p.settings,'item'),body=item.elements.find(e=>e.binding?.field==='item.effect');body.locked=true;body.id='authored-item';item.effect='변경한 아이템 설명';assert.equal(syncSkillElements(item,p.settings).elements.find(e=>e.id===body.id)?.locked,true);
});

test('template attribute retargeting preserves locks without adding lock fields to legacy elements',()=>{
 const p=createProject(),c=applyTemplate(p.cards[0],p.settings,'monster-standard'),attribute=c.elements.find(e=>e.type==='attribute'),rank=c.elements.find(e=>e.type==='rank');attribute.locked=true;rank.locked=false;c.attributes=['water','fire'];
 const next=applyTemplate(c,p.settings,'monster-standard');assert.equal(next.elements.find(e=>e.id===attribute.id)?.locked,true);assert.equal(next.elements.find(e=>e.id===rank.id)?.locked,false);assert.ok(next.elements.filter(e=>!['attribute','rank'].includes(e.type)).every(e=>!Object.hasOwn(e,'locked')));assert.notDeepEqual(next.elements.find(e=>e.id===attribute.id).rect,attribute.rect);
});

test('pointer marquee skips locked elements while programmatic selection can still edit them',()=>{
 const elements=[shape('locked',true),shape('unlocked',false),shape('legacy')],target={elements},state={};setElementSelection(state,['locked','legacy'],target);assert.deepEqual(selectedElements(state,target).map(e=>e.id),['locked','legacy']);assert.deepEqual(marqueeElements(elements,{x:0,y:0,w:20,h:20}).map(e=>e.id),['unlocked','legacy']);
});
