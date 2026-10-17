import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import {createCardLibrary,setCardQuantities} from '../src/model/card-library.js';

const ids=cards=>cards.map(card=>card.id);
function deck(){
 const project=createProject();project.cards=[];
 const add=(kind,id,name,extra={})=>{const card=Object.assign(createCard(kind,project),{id,name},extra);project.cards.push(card);return card;};
 add('monster','river','물의 수호자',{rank:'A',attribute:'water',attributes:['water','fire'],quantity:2});
 add('monster','cat','흰 고양이',{attribute:'neutral',quantity:3});
 add('item','candle','속성 없는 양초',{quantity:4});
 add('item','neutral-item','무속성 양초',{attributes:['neutral'],quantity:5});
 add('item','potion','WATER Potion',{attributes:['water','light'],quantity:6});
 return project;
}

test('name searches compose with kind and monster rank filters without changing the deck',()=>{
 const project=deck(),before=structuredClone(project),library=createCardLibrary();
 library.setFilters(project,{query:'  WATER  '});assert.deepEqual(ids(library.visibleCards(project)),['potion']);
 library.setFilters(project,{query:'양초',kind:'item'});assert.deepEqual(ids(library.visibleCards(project)),['candle','neutral-item']);
 library.setFilters(project,{query:'',kind:'monster',rank:'A'});assert.deepEqual(ids(library.visibleCards(project)),['river']);
 library.setFilters(project,{kind:'item'});assert.deepEqual(ids(library.visibleCards(project)),[],'rank must not match an item');
 assert.deepEqual(project,before);
});

test('Korean names match canonically equivalent input and clearing filters restores variant order',()=>{
 const project=deck(),variant=createVariant(project,'river');variant.id='river-variant';project.cards.push(variant);const library=createCardLibrary();
 assert.deepEqual(ids(library.visibleCards(project)),['river','river-variant','cat','candle','neutral-item','potion']);
 library.setFilters(project,{query:'물의'.normalize('NFD')});assert.deepEqual(ids(library.visibleCards(project)),['river','river-variant']);
 library.setFilters(project,{query:''});assert.equal(library.visibleCards(project).length,6);
});

test('attribute filters match every membership and distinguish absent item attributes from neutral',()=>{
 const project=deck(),library=createCardLibrary();
 const cases=[['water',['river','potion']],['fire',['river']],['light',['potion']],['neutral',['cat','neutral-item']],['none',['candle']]];
 for(const [attribute,expected] of cases){library.setFilters(project,{attribute});assert.deepEqual(ids(library.visibleCards(project)),expected,attribute);}
 library.setFilters(project,{attribute:'water',kind:'item'});assert.deepEqual(ids(library.visibleCards(project)),['potion']);
});

test('selection stays independent of project data and drops hidden cards when filters change',()=>{
 const project=deck(),before=structuredClone(project),library=createCardLibrary();
 library.toggleSelection(project,'river');library.toggleSelection(project,'candle');assert.deepEqual(library.selectedIds(project),['river','candle']);
 library.setFilters(project,{kind:'item'});assert.deepEqual(library.selectedIds(project),['candle']);
 library.setFilters(project,{kind:''});assert.deepEqual(library.selectedIds(project),['candle'],'hidden selections must not return');
 assert.equal(library.isSelected('river'),false);assert.deepEqual(project,before);
});

test('select visible and shift ranges use only the displayed card order',()=>{
 const project=deck(),library=createCardLibrary();library.setFilters(project,{kind:'item'});library.selectVisible(project);
 assert.deepEqual(library.selectedIds(project),['candle','neutral-item','potion']);
 library.clearSelection();library.toggleSelection(project,'candle',{checked:true});library.toggleSelection(project,'potion',{shiftKey:true,checked:true});
 assert.deepEqual(library.selectedIds(project),['candle','neutral-item','potion']);
 library.toggleSelection(project,'candle',{shiftKey:true,checked:false});assert.deepEqual(library.selectedIds(project),[]);
 library.toggleSelection(project,'river',{checked:true});assert.deepEqual(library.selectedIds(project),[],'a hidden card cannot join the batch');
});

test('deleted cards and anchors are pruned, and reset clears filters for a replacement deck',()=>{
 const project=deck(),library=createCardLibrary();library.toggleSelection(project,'candle');project.cards=project.cards.filter(card=>card.id!=='candle');library.reconcile(project);
 assert.deepEqual(library.selectedIds(project),[]);library.toggleSelection(project,'potion',{shiftKey:true,checked:true});assert.deepEqual(library.selectedIds(project),['potion']);
 library.setFilters(project,{kind:'item',attribute:'water'});library.reset();
 assert.deepEqual(library.selectedIds(project),[]);assert.equal(library.visibleCards(project).length,4);assert.deepEqual(library.filters,{query:'',kind:'',rank:'',attribute:''});
});

test('one quantity edit updates only selected cards and one undo restores the whole batch',()=>{
 const store=createStore(deck()),before=structuredClone(store.getProject()),library=createCardLibrary();
 library.toggleSelection(store.getProject(),'river');library.toggleSelection(store.getProject(),'potion');const selected=library.selectedIds(store.getProject());
 store.edit('선택 카드 인쇄 수량',draft=>setCardQuantities(draft,selected,'7'));
 assert.deepEqual(store.getProject().cards.map(card=>card.quantity),[7,3,4,5,7]);assert.equal(store.undo(),true);assert.deepEqual(store.getProject(),before);assert.equal(store.canUndo(),false);
 assert.equal(store.redo(),true);assert.deepEqual(store.getProject().cards.map(card=>card.quantity),[7,3,4,5,7]);
});

test('invalid quantities leave the deck intact and stale selected IDs cannot affect another card',()=>{
 const project=deck(),before=structuredClone(project);
 for(const value of ['',0,-1,1.5,'2.5',Infinity,NaN,Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>setCardQuantities(project,['river','potion'],value),/1 이상.*정수/);assert.deepEqual(project,before);
 }
 assert.equal(setCardQuantities(project,['missing','river','river'],9),1);assert.deepEqual(project.cards.map(card=>card.quantity),[9,3,4,5,6]);
});
