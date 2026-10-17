import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model/project.js';
import {validateSkillReferences} from '../src/model/skill-references.js';
import {createVariant,validateVariants} from '../src/model/variants.js';

const source=()=>({id:'source-skill',name:'여울',effect:'가나다라🙂',skillReferences:[{id:'ref-1',skillId:'target-skill',start:0,end:2}]});
function referenceIssue(skill){
 const issues=validateSkillReferences(skill,{cardId:'card-1',skillId:skill.id});assert.equal(issues.length,1);assert.equal(issues[0].code,'skill-reference-range');assert.equal(issues[0].cardId,'card-1');assert.equal(issues[0].skillId,'source-skill');assert.doesNotMatch(issues[0].message,/확인하세요/);return issues[0].message;
}
function variantFixture(){
 const p=createProject();p.cards[0].id='root-card';p.cards[0].name='원본 카드';const child=createVariant(p,'root-card');child.id='child-card';child.name='변형 카드';p.cards.push(child);return {p,child};
}
function variantIssue(project){
 const issues=validateVariants(project);assert.equal(issues.length,1);assert.equal(issues[0].code,'variant');assert.equal(issues[0].cardId,'child-card');assert.doesNotMatch(issues[0].message,/확인하세요/);assert.match(issues[0].message,/변형 카드/);assert.match(issues[0].message,/2번|2번째/);assert.match(issues[0].message,/child-card/);return issues[0].message;
}

test('skill reference structure errors report the supplied list or effect value',()=>{
 let sk=source();sk.skillReferences=null;let message=referenceIssue(sk);assert.match(message,/참조.*목록.*null/);assert.match(message,/배열/);assert.match(message,/여울.*source-skill/);
 sk=source();sk.effect=17;message=referenceIssue(sk);assert.match(message,/효과.*17.*문자열/);
 sk=source();sk.skillReferences=[null];message=referenceIssue(sk);assert.match(message,/1번|1번째/);assert.match(message,/null.*객체/);
});

test('skill reference identity errors report reference order, current ID and allowed format',()=>{
 for(const [field,value,label,current] of [['id','',/참조.*ID/,/“”/],['skillId','constructor',/대상.*스킬.*ID|연결.*스킬.*ID/,/constructor/]]){
  const sk=source();sk.skillReferences[0][field]=value;const message=referenceIssue(sk);assert.match(message,/1번|1번째/);assert.match(message,label);assert.match(message,current);assert.match(message,/199|예약/);
 }
 const sk=source();sk.skillReferences.push({id:'ref-1',skillId:'another',start:2,end:4});const message=referenceIssue(sk);assert.match(message,/2번|2번째/);assert.match(message,/ref-1.*중복|중복.*ref-1/);
});

test('skill reference range errors identify the exact bound, supplied offset and accepted boundary',()=>{
 for(const [field,value,label,current,limit] of [['start',1.5,/시작/,/1.5/,/정수/],['end','3',/끝|종료/,/“3”/,/정수/],['start',-1,/시작/,/-1/,/0/],['end',0,/끝|종료/,/0/,/시작/],['end',9,/끝|종료/,/9/,/6/]]){
  const sk=source();sk.skillReferences[0][field]=value;const message=referenceIssue(sk);assert.match(message,/1번|1번째/);assert.match(message,/ref-1/);for(const pattern of [label,current,limit])assert.match(message,pattern);
 }
});

test('overlapping skill references report the later reference and the earlier ending offset',()=>{
 const sk=source();sk.skillReferences[0].end=3;sk.skillReferences.push({id:'ref-2',skillId:'another',start:2,end:4});const message=referenceIssue(sk);assert.match(message,/2번|2번째/);assert.match(message,/ref-2/);assert.match(message,/시작.*2/);assert.match(message,/이전.*3/);
});

test('a skill reference cannot split an emoji and its diagnostic identifies the exact boundary',()=>{
 for(const [start,end,label] of [[5,6,/시작/],[0,5,/끝|종료/]]){const sk=source();Object.assign(sk.skillReferences[0],{start,end});const message=referenceIssue(sk);assert.match(message,label);assert.match(message,/5/);assert.match(message,/문자.*중간|서로게이트|UTF-16/);}
});

test('skill reference diagnostics preserve valid adjacency, deleted targets and validation purity',()=>{
 for(const refs of [undefined,[],[{id:'ref-1',skillId:'deleted-target',start:0,end:2},{id:'ref-2',skillId:'another',start:2,end:4}],[{id:'emoji-ref',skillId:'target',start:4,end:6}]]){
  const sk=source();sk.skillReferences=refs;const before=structuredClone(sk);assert.deepEqual(validateSkillReferences(sk),[]);assert.deepEqual(sk,before);
 }
 const sk=source();sk.skillReferences[0].end=99;const before=structuredClone(sk);referenceIssue(sk);assert.deepEqual(sk,before);
});

test('Variant metadata errors distinguish missing objects, parent IDs and parent card kinds',()=>{
 for(const [change,patterns] of [[c=>c.variant=null,[/Variant.*null.*객체/]],[c=>c.variant.parentId='',[/원본.*ID.*“”/,/199/]],[c=>c.variant.parentId='missing-parent',[/원본.*missing-parent/,/존재/]],[c=>c.kind='item',[/종류.*item/,/monster/,/root-card/]]]){
  const {p,child}=variantFixture();change(child);const message=variantIssue(p);for(const pattern of patterns)assert.match(message,pattern);
 }
});

test('Variant label errors state the actual type or length and the 120-character boundary',()=>{
 let {p,child}=variantFixture();child.variant.label=17;assert.match(variantIssue(p),/이름|라벨/);assert.match(variantIssue(p),/17.*문자열/);
 ({p,child}=variantFixture());child.variant.label='가'.repeat(121);const message=variantIssue(p);assert.match(message,/121/);assert.match(message,/120/);
});

test('Variant ID mappings identify mapping order and distinguish an invalid source key from its mapped ID',()=>{
 for(const [ids,patterns] of [[null,[/ID.*null.*객체/]],[{'':'mapped-id'},[/1번|1번째/,/원본.*ID.*“”/]],[{'root-element':'constructor'},[/1번|1번째/,/root-element/,/constructor/,/199|예약/]]]){
  const {p,child}=variantFixture();child.variant.ids=ids;const message=variantIssue(p);for(const pattern of patterns)assert.match(message,pattern);
 }
});

test('Variant overrides identify a malformed container, forbidden field or conflicting patch forms',()=>{
 for(const [overrides,patterns] of [[null,[/변경.*null.*객체/]],[{kind:{value:'item'}},[/kind/,/name/,/허용|중 하나/]],[{name:{value:'새 이름',remove:true}},[/name/,/value/,/remove/,/2/,/1|하나/]]]){
  const {p,child}=variantFixture();child.variant.overrides=overrides;const message=variantIssue(p);for(const pattern of patterns)assert.match(message,pattern);
 }
});

test('Variant nested field patches identify their path, reserved key and unsupported JSON value',()=>{
 for(const [patch,patterns] of [[{fields:JSON.parse('{"constructor":{"value":"x"}}')},[/name/,/constructor/,/예약|사용할 수 없/]],[{value:Infinity},[/name/,/Infinity/,/유한/]],[{fields:{color:null}},[/name.*color/,/null/,/객체/]],[{legacyEffect:{fields:[]}},[/legacyEffect.*fields|이전.*fields/,/배열|객체/]]]){
  const {p,child}=variantFixture();child.variant.overrides.name=patch;const message=variantIssue(p);for(const pattern of patterns)assert.match(message,pattern);
 }
});

test('Variant list patch diagnostics identify the failing section, item order and ID',()=>{
 const valid=()=>({edits:{},removed:[],added:[],order:null});
 for(const [change,patterns] of [[l=>l.unexpected=0,[/unexpected/,/edits.*removed.*added.*order/]],[l=>l.edits={'constructor':{value:'x'}},[/edits|수정/,/1번|1번째/,/constructor/]],[l=>l.removed=['ok','__proto__'],[/removed|삭제/,/2번|2번째/,/__proto__/]],[l=>l.added=[{id:'ok'},{name:'missing-id'}],[/added|추가/,/2번|2번째/,/ID.*없음/]],[l=>l.order=['ok',''],[/order|순서/,/2번|2번째/,/“”/]]]){
  const {p,child}=variantFixture(),list=valid();change(list);child.variant.overrides.passives={list};const message=variantIssue(p);for(const pattern of patterns)assert.match(message,pattern);
 }
});

test('Variant excessive patch nesting identifies its path and the 40-level limit',()=>{
 const {p,child}=variantFixture();let patch={value:'최종 값'};for(let i=0;i<41;i++)patch={fields:{next:patch}};child.variant.overrides.name=patch;const message=variantIssue(p);assert.match(message,/name/);assert.match(message,/41/);assert.match(message,/40/);
});

test('Variant cycles report the repeated card ID and the order of the parent chain',()=>{
 const {p,child}=variantFixture();p.cards[0].variant={parentId:'child-card',label:'순환 원본',ids:{},overrides:{}};const issues=validateVariants(p);assert.equal(issues.length,2);for(const issue of issues){assert.equal(issue.code,'variant');assert.doesNotMatch(issue.message,/확인하세요/);assert.match(issue.message,/순환/);assert.match(issue.message,/root-card/);assert.match(issue.message,/child-card/);assert.match(issue.message,/→|->/);}assert.equal(child.variant.parentId,'root-card');
});

test('Variant diagnostics preserve allowed patches, empty labels, absent local IDs and validation purity',()=>{
 const {p,child}=variantFixture();child.variant.label='';child.variant.ids={'unresolved-source':'unresolved-local'};child.variant.overrides={name:{value:'새 이름'},attribute:{remove:true},visualEffects:{legacyEffect:{fields:{enabled:{value:false}}}},passives:{list:{edits:{'absent-skill':{fields:{name:{value:'이름'}}}},removed:['absent-skill'],added:[{id:'new-skill',effect:'직접 작성'}],order:['new-skill']}}};
 const before=structuredClone(p);assert.deepEqual(validateVariants(p),[]);assert.deepEqual(p,before);
 child.variant.overrides.name={value:NaN};const badBefore=structuredClone(p);variantIssue(p);assert.deepEqual(p,badBefore);
});
