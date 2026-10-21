import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant,resetVariantOverride} from '../src/model/variants.js';
import {insertKeywordText,updateKeyword} from '../src/model/keywords.js';
const refs=await import('../src/model/skill-references.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
function api(name){assert.equal(typeof refs[name],'function','Skill references must support '+name);return refs[name];}
function fixture(){const p=createProject(),c=p.cards[0];c.passives=[{id:'target',name:'강타',effect:'기본 효과',dice:null,keywords:[]}];c.actives=[{id:'source',name:'연계',effect:'다시 강타 발동',dice:null,keywords:[],skillReferences:[{id:'ref-one',skillId:'target',start:3,end:5}]}];return {p,c,source:c.actives[0],target:c.passives[0]};}

test('inserted skill references resolve the current name without rewriting authored prose',()=>{
 const {c,source,target}=fixture();source.effect='다시 발동';delete source.skillReferences;
 assert.equal(api('insertSkillReference')(c,source,target.id,3,3),5);
 assert.equal(source.effect,'다시 강타발동');assert.equal(source.skillReferences.length,1);
 assert.equal(source.skillReferences[0].skillId,'target');
 source.effect+=' 강타';target.name='폭풍의 강타🙂';
 const resolved=api('resolveSkillEffect')(c,source);
 assert.equal(resolved.text,'다시 폭풍의 강타🙂발동 강타');
 assert.equal(source.effect,'다시 강타발동 강타');
 assert.equal(resolved.skillReferences[0].start,3);assert.equal(resolved.skillReferences[0].end,11);
});

test('edits rebase references and overlapping replacements unlink just the edited annotation',()=>{
 const {c,source}=fixture();
 api('editSkillEffect')(c,source,'먼저 다시 강타 발동',{start:0,end:0,inputType:'insertText'});
 assert.deepEqual(source.skillReferences.map(r=>[r.start,r.end]),[[6,8]]);
 api('editSkillEffect')(c,source,'먼저 다시 강력 발동',{start:6,end:8,inputType:'insertText'});
 assert.equal(source.effect,'먼저 다시 강력 발동');assert.equal(source.skillReferences.length,0);
});

test('identical displayed names retain different target identities through an edit',()=>{
 const {c,source,target}=fixture();c.passives.push({id:'target-two',name:'강타',effect:'',dice:null,keywords:[]});
 source.effect='강타 강타';source.skillReferences=[{id:'ref-a',skillId:'target',start:0,end:2},{id:'ref-b',skillId:'target-two',start:3,end:5}];
 api('editSkillEffect')(c,source,'강타',{start:0,end:3,inputType:'deleteContentForward'});
 assert.deepEqual(source.skillReferences.map(r=>[r.skillId,r.start,r.end]),[['target-two',0,2]]);
 target.name='첫 기술';c.passives[1].name='둘째 기술';
 assert.equal(api('resolveSkillEffect')(c,source).text,'둘째 기술');
});

test('keyword rename updates automatic titles while preserving authored reference spans',()=>{
 const {p,c,source,target}=fixture();p.keywords=[{id:'kw',name:'강타',description:'',color:'#427963',iconAssetId:null}];
 source.effect='강타 후 강타 발동';source.skillReferences[0].start=5;source.skillReferences[0].end=7;source.keywords=[{keywordId:'kw',display:'inline'}];
 updateKeyword(p,'kw',{name:'큰 타격'});
 assert.equal(target.name,'큰 타격');
 assert.equal(source.effect,'큰 타격 후 강타 발동');assert.deepEqual(source.skillReferences.map(r=>[r.start,r.end]),[[7,9]]);
 const resolved=api('resolveSkillEffect')(c,source);
 assert.equal(resolved.text,'큰 타격 후 큰 타격 발동');assert.deepEqual(resolved.skillReferences.map(r=>[r.start,r.end]),[[7,11]]);
 insertKeywordText(source,p.keywords[0],0,0);
 assert.deepEqual(source.skillReferences.map(r=>[r.start,r.end]),[[12,14]]);
});

test('malformed ranges fail validation while missing skill targets remain saveable',()=>{
 const {p}=fixture();
 for(const patch of [r=>r.start=-1,r=>r.end=100,r=>r.start=3.5,r=>r.end=3,r=>r.skillId='__proto__',r=>r.id='',r=>r.start='3']){
  const bad=structuredClone(p);patch(bad.cards[0].actives[0].skillReferences[0]);
  assert.ok(validateProject(bad).some(p=>p.code==='skill-reference-range'),'Malformed skill annotation cannot enter a saved project');
 }
 const overlap=structuredClone(p);overlap.cards[0].actives[0].skillReferences.push({id:'overlap',skillId:'target',start:4,end:6});assert.ok(validateProject(overlap).length);
 p.cards[0].actives[0].skillReferences[0].skillId='deleted-target';
 assert.deepEqual(validateProject(p),[]);assert.doesNotThrow(()=>parseProject(serializeProject(p)));
 const result=api('resolveSkillEffect')(p.cards[0],p.cards[0].actives[0]);assert.equal(result.text,'다시 강타 발동');assert.equal(result.missing.length,1);
});

test('old projects gain no skill-reference field through load save or ordinary edits',()=>{
 const p=createProject();p.cards[0].passives=[{id:'old',name:'기존 기술',effect:'직접 쓴 설명🙂',dice:null,keywords:[]}];
 const text=serializeProject(p),loaded=parseProject(text);assert.equal(serializeProject(loaded),text);
 assert.equal(Object.hasOwn(loaded.cards[0].passives[0],'skillReferences'),false);
 api('editSkillEffect')(loaded.cards[0],loaded.cards[0].passives[0],'직접 쓴 설명🙂 추가');
 assert.equal(Object.hasOwn(loaded.cards[0].passives[0],'skillReferences'),false);
});

test('variant references map to local skills and preserve a shared rename',()=>{
 const {p,c}=fixture(),child=createVariant(p,c.id);p.cards.push(child);const store=createStore(p);
 const inherited=store.getProject().cards[1];assert.equal(inherited.actives[0].skillReferences[0].skillId,inherited.passives[0].id);
 assert.notEqual(inherited.actives[0].skillReferences[0].id,'ref-one');
 store.edit('rename',d=>d.cards[0].passives[0].name='큰 강타');
 const next=store.getProject().cards[1];assert.equal(api('resolveSkillEffect')(next,next.actives[0]).text,'다시 큰 강타 발동');
 assert.deepEqual(next.variant.overrides,{});
 const round=parseProject(serializeProject(store.getProject()));assert.deepEqual(validateProject(round),[]);
});

test('variant effect and ranges form one override so parent offsets cannot drift',()=>{
 const {p,c,source}=fixture();source.effect='강타 발동';source.skillReferences[0].start=0;source.skillReferences[0].end=2;
 const child=createVariant(p,c.id);p.cards.push(child);const store=createStore(p);
 store.edit('child effect',d=>d.cards[1].actives[0].effect='강타 즉시 발동');
 store.edit('parent prefix',d=>{const s=d.cards[0].actives[0];s.effect='지금 강타 발동';s.skillReferences[0].start=3;s.skillReferences[0].end=5;});
 let next=store.getProject().cards[1];assert.equal(next.actives[0].effect,'강타 즉시 발동');assert.deepEqual(next.actives[0].skillReferences.map(r=>[r.start,r.end]),[[0,2]]);
 assert.equal(api('resolveSkillEffect')(next,next.actives[0]).text,'강타 즉시 발동');
 store.undo();store.redo();assert.deepEqual(store.getProject().cards[1].actives[0].skillReferences.map(r=>[r.start,r.end]),[[0,2]]);
 store.edit('reset',d=>resetVariantOverride(d.cards[1],'actives'));next=store.getProject().cards[1];assert.equal(next.actives[0].effect,'지금 강타 발동');
});

test('reference ID remapping leaves arbitrary authored prose unchanged',()=>{
 const {source}=fixture();source.effect='target 다시 강타 발동';source.skillReferences[0].start=10;source.skillReferences[0].end=12;
 api('remapSkillReferences')(source,id=>'copy-'+id);
 assert.equal(source.effect,'target 다시 강타 발동');assert.deepEqual(source.skillReferences,[{id:'copy-ref-one',skillId:'copy-target',start:10,end:12}]);
});

test('deletion preserves the last displayed name and undo restores the live reference',()=>{
 const {p}=fixture(),store=createStore(p);
 store.edit('rename',d=>d.cards[0].passives[0].name='번개 강타');
 store.edit('delete',d=>{const c=d.cards[0];api('preserveSkillReferenceNames')(c,'target');c.passives=[];});
 let c=store.getProject().cards[0];assert.equal(c.actives[0].effect,'다시 번개 강타 발동');assert.deepEqual(validateProject(store.getProject()),[]);
 assert.equal(api('resolveSkillEffect')(c,c.actives[0]).missing.length,1);
 store.undo();c=store.getProject().cards[0];assert.equal(api('resolveSkillEffect')(c,c.actives[0]).text,'다시 번개 강타 발동');assert.equal(api('resolveSkillEffect')(c,c.actives[0]).missing.length,0);
});


test('default reference insertion appends after resolved names rather than inside a renamed reference',()=>{
 const {c,source,target}=fixture();target.name='폭풍의 강타🙂';
 api('insertSkillReference')(c,source,target.id);
 assert.equal(source.effect,'다시 폭풍의 강타🙂 발동폭풍의 강타🙂');
 assert.deepEqual(source.skillReferences.map(r=>[r.start,r.end]),[[3,11],[14,22]]);
});

test('a legacy child effect override cannot acquire newly inherited parent reference ranges',()=>{
 const {p,c,source}=fixture();delete source.skillReferences;const child=createVariant(p,c.id);p.cards.push(child);const store=createStore(p);
 store.edit('own prose',d=>d.cards[1].actives[0].effect='독립적인 본문');
 store.edit('new parent reference',d=>d.cards[0].actives[0].skillReferences=[{id:'new-ref',skillId:'target',start:3,end:5}]);
 const next=store.getProject().cards[1];assert.equal(next.actives[0].effect,'독립적인 본문');assert.equal(Object.hasOwn(next.actives[0],'skillReferences'),false);assert.deepEqual(validateProject(store.getProject()),[]);
});


test('deleting an inherited target preserves latest displayed names through overridden descendants',()=>{
 const {p,c,source}=fixture();source.effect='강타 발동';source.skillReferences[0].start=0;source.skillReferences[0].end=2;
 const child=createVariant(p,c.id);p.cards.push(child);p.cards.push(createVariant(p,child.id));p.cards.push(createVariant(p,c.id));const store=createStore(p);
 store.edit('child prose',d=>{const c=d.cards[1];api('editSkillEffect')(c,c.actives[0],'강타 추가 발동',{start:2,end:2,inputType:'insertText'});});
 store.edit('rename',d=>d.cards[0].passives[0].name='폭풍 강타');
 const expected=store.getProject().cards.map(c=>api('resolveSkillEffect')(c,c.actives[0]).text);
 assert.deepEqual(expected,['폭풍 강타 발동','폭풍 강타 추가 발동','폭풍 강타 추가 발동','폭풍 강타 발동']);
 store.edit('delete',d=>{api('preserveSkillReferenceNames')(d.cards[0],'target',d);d.cards[0].passives=[];});
 let next=store.getProject();assert.deepEqual(next.cards.map(c=>api('resolveSkillEffect')(c,c.actives[0]).text),expected);
 assert.deepEqual(next.cards[2].variant.overrides,{});assert.deepEqual(next.cards[3].variant.overrides,{});
 assert.deepEqual(validateProject(parseProject(serializeProject(next))),[]);
 store.undo();assert.ok(store.getProject().cards.every(c=>c.passives.length===1));store.redo();assert.deepEqual(store.getProject().cards.map(c=>api('resolveSkillEffect')(c,c.actives[0]).text),expected);
});

test('deleting a parent target captures each descendant own target name without unrelated overrides',()=>{
 const {p,c}=fixture(),child=createVariant(p,c.id);p.cards.push(child);p.cards.push(createVariant(p,child.id));const store=createStore(p);
 store.edit('child target name',d=>d.cards[1].passives[0].name='내 폭풍 강타🙂');
 store.edit('root target name',d=>d.cards[0].passives[0].name='부모 번개 강타');
 const expected=store.getProject().cards.map(c=>api('resolveSkillEffect')(c,c.actives[0]).text);
 store.edit('delete',d=>{api('preserveSkillReferenceNames')(d.cards[0],'target',d);d.cards[0].passives=[];});
 const next=store.getProject();assert.deepEqual(next.cards.map(c=>api('resolveSkillEffect')(c,c.actives[0]).text),expected);
 assert.deepEqual(next.cards[2].variant.overrides,{});assert.deepEqual(Object.keys(next.cards[1].variant.overrides).sort(),['actives','passives']);
 assert.deepEqual(validateProject(next),[]);
});

test('replacing a reference with the same displayed letters still unlinks only that selection',()=>{
 const {c,source}=fixture();c.passives.push({id:'target-two',name:'강타',effect:'',dice:null,keywords:[]});source.effect='강타 강타';source.skillReferences=[{id:'ref-a',skillId:'target',start:0,end:2},{id:'ref-b',skillId:'target-two',start:3,end:5}];
 api('editSkillEffect')(c,source,'강타 강타',{start:0,end:2,inputType:'insertCompositionText'});
 assert.deepEqual(source.skillReferences.map(r=>r.skillId),['target-two']);
});
