import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import * as variants from '../src/model/variants.js';
import {updateKeyword} from '../src/model/keywords.js';
import {syncSkillElements} from '../src/render/templates.js';
import {planSheets} from '../src/printing/layout.js';
function fixture(){
 const p=createProject(),root=p.cards[0];root.name='원본';root.passives=[{id:'source-passive',name:'회복',effect:'체력 5 회복',dice:null,keywords:[]}];
 const c=variants.createVariant(p,root.id,{label:'스페셜',quantity:2});p.cards.push(c);return {p,rootId:root.id,id:c.id};
}
test('variants inherit edits and new skills while all IDs remain unique',()=>{
 const {p,rootId,id}=fixture(),store=createStore(p);
 store.edit('원본 수정',d=>{const root=d.cards.find(c=>c.id===rootId);root.name='변경된 원본';root.passives[0].effect='체력 8 회복';root.actives.push({id:'new-active',name:'강타',effect:'대미지 30',dice:null,keywords:[]});});
 const next=store.getProject(),root=next.cards.find(c=>c.id===rootId),c=next.cards.find(c=>c.id===id);
 assert.equal(c.name,root.name);assert.equal(c.passives[0].effect,root.passives[0].effect);assert.equal(c.actives[0].name,'강타');
 assert.notEqual(c.passives[0].id,root.passives[0].id);assert.notEqual(c.actives[0].id,root.actives[0].id);
 assert.equal(c.quantity,2);assert.deepEqual(validateProject(next),[]);
});
test('only edited skill fields are overridden, and new parent skills still arrive',()=>{
 const {p,rootId,id}=fixture(),store=createStore(p);
 store.edit('Variant 수정',d=>{const c=d.cards.find(c=>c.id===id);c.passives[0].effect='체력 20 회복';c.attribute='fire';});
 store.edit('원본 수정',d=>{const root=d.cards.find(c=>c.id===rootId);root.passives[0].name='새 회복';root.passives[0].effect='체력 9 회복';root.attribute='water';root.passives.push({id:'second-passive',name:'보호',effect:'방어',dice:null,keywords:[]});});
 const c=store.getProject().cards.find(c=>c.id===id);assert.equal(c.passives[0].effect,'체력 20 회복');assert.equal(c.passives[0].name,'새 회복');assert.equal(c.attribute,'fire');assert.equal(c.passives[1].name,'보호');
 assert.deepEqual(validateProject(store.getProject()),[]);
});
test('inheritance, reset, undo and reload keep variant relationships and overrides',()=>{
 const {p,rootId,id}=fixture(),store=createStore(p);store.edit('이름 변경',d=>{d.cards.find(c=>c.id===id).name='스페셜 이름';});
 const saved=serializeProject(store.getProject()),loaded=parseProject(saved);assert.deepEqual(loaded,store.getProject());
 const reload=createStore(loaded);reload.edit('원본 체력',d=>{d.cards.find(c=>c.id===rootId).baseHp=220;});assert.equal(reload.getProject().cards.find(c=>c.id===id).baseHp,220);
 reload.edit('상속 복원',d=>variants.resetVariantOverride(d.cards.find(c=>c.id===id),'name'));assert.equal(reload.getProject().cards.find(c=>c.id===id).name,'원본');
 reload.undo();assert.equal(reload.getProject().cards.find(c=>c.id===id).name,'스페셜 이름');reload.redo();assert.equal(reload.getProject().cards.find(c=>c.id===id).name,'원본');
});
test('removing a parent preserves child cards as independent cards',()=>{
 const {p,rootId,id}=fixture(),store=createStore(p),before=structuredClone(p.cards.find(c=>c.id===id));
 store.edit('원본 삭제',d=>d.cards=d.cards.filter(c=>c.id!==rootId));const c=store.getProject().cards.find(c=>c.id===id);
 assert.equal(c.variant,undefined);assert.equal(c.name,before.name);assert.deepEqual(c.passives,before.passives);assert.equal(c.quantity,2);assert.deepEqual(validateProject(store.getProject()),[]);
 store.undo();assert.equal(store.getProject().cards.find(c=>c.id===id).variant.parentId,rootId);
});
test('original and variants print together with independent quantities and matching backs',()=>{
 const {p,rootId,id}=fixture(),other=createCard('item',p);p.cards.splice(1,0,other);
 p.print.duplex=true;p.print.gapMm=0;const plan=planSheets(p);
 const front=plan.pages[0].cells.filter(c=>c.cardId),back=plan.pages[1].cells.filter(c=>c.cardId);
 assert.deepEqual(front.map(c=>c.cardId),[rootId,id,id,other.id]);assert.deepEqual(back.map(c=>c.cardId),front.map(c=>c.cardId));
 assert.equal(p.cards.find(c=>c.id===id).quantity,2);
});
test('missing parents, cycles and unsafe override fields reject imported files',()=>{
 const {p,rootId,id}=fixture();
 for(const mutate of [
  d=>d.cards.find(c=>c.id===id).variant.parentId='missing',
  d=>d.cards.find(c=>c.id===rootId).variant={parentId:id,label:'순환',overrides:{},ids:{}},
  d=>d.cards.find(c=>c.id===id).variant.overrides.kind={value:'item'},
  d=>d.cards.find(c=>c.id===id).variant.overrides.name={fields:JSON.parse('{"__proto__":{"value":{}}}')}
 ]){const d=structuredClone(p);mutate(d);assert.ok(validateProject(d).length);assert.throws(()=>parseProject(JSON.stringify(d)));}
});

test('keyword rename keeps shared effects inherited and preserves explicit variant effects',()=>{
 const p=createProject(),root=p.cards[0];p.keywords=[{id:'heal',name:'회복',description:'',color:'#427963',iconAssetId:null}];
 root.passives=[{id:'healing',name:'치유',effect:'회복 5',dice:null,keywords:[{keywordId:'heal',display:'both'}]}];
 const shared=variants.createVariant(p,root.id),own=variants.createVariant(p,root.id);p.cards.push(shared,own);const store=createStore(p);
 store.edit('Variant 효과',d=>d.cards.find(c=>c.id===own.id).passives[0].effect='회복 20');
 store.edit('키워드 이름',d=>{updateKeyword(d,'heal',{name:'재생'});d.cards=d.cards.map(c=>syncSkillElements(c,d.settings,d.keywords));});
 assert.equal(store.getProject().cards.find(c=>c.id===shared.id).variant.overrides.passives,undefined);
 store.edit('원본 효과',d=>{const c=d.cards.find(c=>c.id===root.id);c.passives[0].name='새 치유';c.passives[0].effect='재생 10';});
 assert.equal(store.getProject().cards.find(c=>c.id===shared.id).passives[0].effect,'재생 10');
 assert.equal(store.getProject().cards.find(c=>c.id===own.id).passives[0].effect,'재생 20');
 assert.equal(store.getProject().cards.find(c=>c.id===own.id).passives[0].name,'새 치유');
 assert.deepEqual(validateProject(store.getProject()),[]);
});
test('legacy prototype-named IDs work as ordinary IDs in variants and saved files',()=>{
 for(const skillId of ['toString','valueOf','hasOwnProperty']){
  const p=createProject(),root=p.cards[0];root.passives=[{id:skillId,name:'기술',effect:'효과',dice:null,keywords:[]}];
  root.elements=[{id:'__lookupGetter__',type:'rect',rect:{x:4,y:4,w:10,h:10},binding:null,style:{fill:'#fff'}}];
  assert.deepEqual(validateProject(p),[]);p.cards.push(variants.createVariant(p,root.id));
  const store=createStore(p);store.edit('원본 수정',d=>d.cards[0].passives[0].effect='새 효과');
  assert.equal(store.getProject().cards[1].passives[0].effect,'새 효과');assert.deepEqual(validateProject(store.getProject()),[]);
  assert.deepEqual(parseProject(serializeProject(store.getProject())),store.getProject());
 }
});
test('deck resize scales a variants existing custom art overrides',()=>{
 const p=createProject(),root=p.cards[0];root.template='custom';root.elements=[{id:'root-art',type:'image',binding:{field:'art'},rect:{x:4,y:15,w:55,h:33},style:{fit:'contain'}}];
 const child=variants.createVariant(p,root.id);p.cards.push(child);const store=createStore(p);
 store.edit('그림 이동',d=>{const c=d.cards.find(c=>c.id===child.id);c.elements[0].rect.x=6;});
 store.edit('덱 크기',d=>{for(const c of [...d.cards,d.back])for(const e of c.elements){e.rect.x*=.5;e.rect.w*=.5;}d.settings.cardWidthMm=31.5;});
 const c=store.getProject().cards.find(c=>c.id===child.id);assert.equal(c.elements[0].rect.x,3);assert.equal(c.elements[0].rect.w,27.5);assert.ok(c.elements[0].rect.x+c.elements[0].rect.w<=31.5);
 assert.deepEqual(validateProject(store.getProject()),[]);
});

test('source removal of a dice condition keeps sparse child changes valid',()=>{
 const p=createProject(),root=p.cards[0];root.passives=[{id:'dice-skill',name:'판정',effect:'효과',dice:{faces:[1,6],text:'원본 조건',color:'#3688ba'},keywords:[]}];
 p.cards[0]=syncSkillElements(root,p.settings,p.keywords);
 const child=variants.createVariant(p,root.id);p.cards.push(child);
 const reflow=d=>{d.cards=d.cards.map(c=>syncSkillElements(c,d.settings,d.keywords));};
 const store=createStore(p,{prepare:reflow});
 store.edit('Variant 조건 문구',d=>{d.cards.find(c=>c.id===child.id).passives[0].dice.text='별도 조건';reflow(d);});
 store.edit('원본 조건 제거',d=>{d.cards.find(c=>c.id===root.id).passives[0].dice=null;reflow(d);});
 assert.equal(store.getProject().cards.find(c=>c.id===child.id).passives[0].dice,null);
 assert.ok(!store.getProject().cards.find(c=>c.id===child.id).elements.some(e=>e.binding?.field==='skill.dice'));
 store.edit('원본 조건 복원',d=>{d.cards.find(c=>c.id===root.id).passives[0].dice={faces:[2,5],text:'새 원본 조건',color:'#3688ba'};reflow(d);});
 assert.deepEqual(store.getProject().cards.find(c=>c.id===child.id).passives[0].dice,{faces:[2,5],text:'별도 조건',color:'#3688ba'});
 store.edit('원본 조건 제거',d=>{d.cards.find(c=>c.id===root.id).passives[0].dice=null;reflow(d);});
 const ownDice={faces:[3],text:'독립 조건',color:'#d7553d'};
 store.edit('Variant에 별도 조건 추가',d=>{d.cards.find(c=>c.id===child.id).passives[0].dice=structuredClone(ownDice);reflow(d);});
 store.edit('원본 조건 변경',d=>{d.cards.find(c=>c.id===root.id).passives[0].dice={faces:[4],text:'원본',color:'#3688ba'};reflow(d);});
 store.edit('원본 조건 제거',d=>{d.cards.find(c=>c.id===root.id).passives[0].dice=null;reflow(d);});
 assert.deepEqual(store.getProject().cards.find(c=>c.id===child.id).passives[0].dice,ownDice);
 assert.deepEqual(validateProject(store.getProject()),[]);
 assert.deepEqual(createStore(parseProject(serializeProject(store.getProject())),{prepare:reflow}).getProject(),store.getProject());
});
test('short imported skill IDs remap template elements without rewriting child IDs',()=>{
 const p=createProject(),root=p.cards[0];root.id='imported-card';
 root.passives=['a','b','c','d','e','f'].map(id=>({id,name:'기술 '+id,effect:'효과',dice:null,keywords:[]}));
 p.cards[0]=syncSkillElements(root,p.settings,p.keywords);p.cards[0].template='custom';
 p.cards[0].elements.push({id:root.id+':'+ 'z'.repeat(180),type:'rect',rect:{x:2,y:2,w:1,h:1},binding:null,style:{fill:'#fff'}});
 assert.deepEqual(validateProject(p),[]);
 const child=variants.createVariant(p,root.id);p.cards.push(child);
 const store=createStore(p,{prepare:d=>{d.cards=d.cards.map(c=>syncSkillElements(c,d.settings,d.keywords));}});
 const c=store.getProject().cards.find(c=>c.id===child.id);
 for(const skill of c.passives){
  const title=c.elements.find(e=>e.binding?.skillId===skill.id&&e.binding.field==='skill.name');
  assert.equal(title.id,c.id+':'+skill.id+':name');
 }
 assert.ok(Object.values(c.variant.ids).every(id=>id.length<200));
 assert.deepEqual(validateProject(store.getProject()),[]);
 assert.deepEqual(parseProject(serializeProject(store.getProject())),store.getProject());
});


test('unrelated skill edits retain hidden dice overrides and explicit disabled conditions',()=>{
 const p=createProject(),root=p.cards[0];root.passives=[{id:'conditional',name:'원본 이름',effect:'효과',dice:{faces:[1],text:'원본 조건',color:'#3688ba'},keywords:[]}];
 const textChild=variants.createVariant(p,root.id),disabledChild=variants.createVariant(p,root.id);p.cards.push(textChild,disabledChild);const store=createStore(p);
 store.edit('조건 변경',d=>{d.cards.find(c=>c.id===textChild.id).passives[0].dice.text='별도 조건';d.cards.find(c=>c.id===disabledChild.id).passives[0].dice=null;});
 store.edit('원본 조건 숨기기',d=>d.cards[0].passives[0].dice=null);
 store.edit('Variant 기술 이름',d=>{d.cards.find(c=>c.id===textChild.id).passives[0].name='별도 이름';d.cards.find(c=>c.id===disabledChild.id).passives[0].name='주사위 없는 이름';});
 store.edit('원본 조건 다시 표시',d=>d.cards[0].passives[0].dice={faces:[2,6],text:'새 원본 조건',color:'#d7553d'});
 const a=store.getProject().cards.find(c=>c.id===textChild.id),b=store.getProject().cards.find(c=>c.id===disabledChild.id);
 assert.equal(a.passives[0].name,'별도 이름');assert.deepEqual(a.passives[0].dice,{faces:[2,6],text:'별도 조건',color:'#d7553d'});assert.equal(b.passives[0].dice,null);
 assert.deepEqual(parseProject(serializeProject(store.getProject())),store.getProject());
});
test('a combined parent and child edit keeps untouched child fields shared',()=>{
 const {p,rootId,id}=fixture(),store=createStore(p);
 store.edit('동시 수정',d=>{const root=d.cards.find(c=>c.id===rootId),child=d.cards.find(c=>c.id===id);root.passives[0].name='새 원본 기술';root.passives.push({id:'new-source-skill',name:'추가 기술',effect:'새 효과',dice:null,keywords:[]});child.passives[0].effect='별도 효과';});
 const c=store.getProject().cards.find(c=>c.id===id);
 assert.equal(c.passives[0].name,'새 원본 기술');assert.equal(c.passives[0].effect,'별도 효과');assert.equal(c.passives[1].name,'추가 기술');
 store.edit('원본 재수정',d=>d.cards.find(c=>c.id===rootId).passives[0].name='다시 바뀐 기술');
 assert.equal(store.getProject().cards.find(c=>c.id===id).passives[0].name,'다시 바뀐 기술');assert.deepEqual(validateProject(store.getProject()),[]);
});

test('editing an independently added dice condition keeps its other members independent',()=>{
 const {p,rootId,id}=fixture(),store=createStore(p),own={faces:[3],text:'별도 조건',color:'#d7553d'};
 store.edit('Variant에 조건 추가',d=>d.cards.find(c=>c.id===id).passives[0].dice=structuredClone(own));
 store.edit('원본에 조건 추가',d=>d.cards.find(c=>c.id===rootId).passives[0].dice={faces:[4],text:'원본 조건',color:'#3688ba'});
 store.edit('Variant 조건 문구',d=>d.cards.find(c=>c.id===id).passives[0].dice.text='바뀐 별도 조건');
 const expected={...own,text:'바뀐 별도 조건'};
 assert.deepEqual(store.getProject().cards.find(c=>c.id===id).passives[0].dice,expected);
 store.edit('원본 조건 수정',d=>d.cards.find(c=>c.id===rootId).passives[0].dice={faces:[5],text:'새 원본 조건',color:'#427963'});
 assert.deepEqual(store.getProject().cards.find(c=>c.id===id).passives[0].dice,expected);
 assert.deepEqual(parseProject(serializeProject(store.getProject())),store.getProject());
});
