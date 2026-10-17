import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import {readTargetTextStyle,writeTargetTextStyle} from '../src/model/text-style.js';
import {applyTemplate,syncSkillElements} from '../src/render/templates.js';

function fixture(){
 const p=createProject(),c=p.cards[0];
 c.passives=[{id:'first',name:'첫 기술',effect:'짧은 설명',dice:null,keywords:[]},{id:'second',name:'다음 기술',effect:'아래에 배치',dice:null,keywords:[]}];c.actives=[];
 p.cards[0]=applyTemplate(c,p.settings,'monster-standard');return p;
}
const element=(card,field,id='first')=>card.elements.find(e=>e.binding?.field===field&&e.binding.skillId===id);
test('automatic flow keeps authored typography and allocates actual content height',()=>{
 const p=fixture(),c=p.cards[0],style={fontPt:11,fontWeight:800,fontStyle:'italic',letterSpacingMm:.3,lineHeight:1.7,align:'right',underline:true,color:'#654321'};
 Object.assign(element(c,'skill.effect').style,style);c.passives[0].effect='길어지는 효과 설명입니다. '.repeat(12);
 const next=syncSkillElements(c,p.settings,[]),body=element(next,'skill.effect'),following=element(next,'skill.name','second');
 for(const [key,value] of Object.entries(style))assert.equal(body.style[key],value,key);
 assert.ok(body.rect.h>20,'the actual wrapped description must expand');
 assert.ok(following.rect.y>=body.rect.y+body.rect.h,'the next title follows the full description');
});
test('automatic flow preserves artwork header and free elements exactly',()=>{
 const p=fixture(),c=p.cards[0];c.elements.find(e=>e.binding?.field==='art').rect={x:6,y:17,w:42,h:21};
 c.elements.find(e=>e.binding?.field==='name').style.fontPt=17;
 c.elements.push({id:'manual-art',type:'image',binding:null,rect:{x:11,y:9,w:13,h:15},style:{fit:'contain',cropX:.3,cropY:.6},assetId:null},{id:'manual-text',type:'text',binding:null,rect:{x:3,y:6,w:12,h:4},style:{fontPt:9},content:'직접 배치'});
 const expected=structuredClone(c.elements.filter(e=>!e.binding?.skillId));c.passives[0].effect='더 긴 내용 '.repeat(18);
 const next=syncSkillElements(c,p.settings,[]);
 assert.deepEqual(next.elements.filter(e=>!e.binding?.skillId),expected);
});
test('custom automatic flow moves down and back up without resetting font size',()=>{
 const p=fixture(),c=p.cards[0];c.template='custom';c.autoSkillLayout=true;element(c,'skill.effect').style.fontPt=12;
 const before=syncSkillElements(c,p.settings,[]),beforeY=element(before,'skill.name','second').rect.y;
 before.passives[0].effect='자동으로 다음 줄에 이어지는 긴 한글 설명 '.repeat(20);const long=syncSkillElements(before,p.settings,[]);
 assert.equal(element(long,'skill.effect').style.fontPt,12);assert.ok(element(long,'skill.name','second').rect.y>beforeY+20);
 long.passives[0].effect='짧게';const short=syncSkillElements(long,p.settings,[]);
 assert.equal(element(short,'skill.effect').style.fontPt,12);assert.ok(element(short,'skill.name','second').rect.y<element(long,'skill.name','second').rect.y-20);
});
test('impossible automatic content remains full height and never squashes below minimum',()=>{
 const p=fixture(),c=p.cards[0];c.template='custom';c.autoSkillLayout=true;p.settings.minFontPt=10;
 c.passives[0].effect='최소 글자 크기를 지키는 아주 긴 효과 설명 '.repeat(120);element(c,'skill.effect').style.fontPt=10;
 const next=syncSkillElements(c,p.settings,[]),body=element(next,'skill.effect');
 assert.ok(body.rect.h>88,'overflow is genuine card clipping, never a squeezed text rectangle');assert.ok(body.style.fontPt>=10);
 assert.ok(element(next,'skill.name','second').rect.y>=body.rect.y+body.rect.h);
});
test('manual skill layout keeps explicit rectangles after text edits',()=>{
 const p=fixture(),c=p.cards[0];c.template='custom';c.autoSkillLayout=false;element(c,'skill.effect').rect={x:9,y:23,w:35,h:7};
 const before=structuredClone(c.elements);c.passives[0].effect='수동 배치 그대로 '.repeat(20);
 assert.deepEqual(syncSkillElements(c,p.settings,[]).elements,before);
});
test('typography survives save load variant inheritance undo and redo',()=>{
 const p=fixture(),root=p.cards[0];root.template='custom';const child=createVariant(p,root.id);p.cards.push(child);
 const store=createStore(p,{prepare:d=>{d.cards=d.cards.map(c=>syncSkillElements(c,d.settings,d.keywords));}});
 const parentBody=element(store.getProject().cards[0],'skill.effect').id;
 store.edit('글자 꾸미기',d=>{const e=d.cards[0].elements.find(e=>e.id===parentBody);Object.assign(e.style,{fontPt:11,lineHeight:1.6,letterSpacingMm:.25,fontStyle:'italic',underline:true});});
 const changed=store.getProject(),inherited=changed.cards[1].elements.find(e=>e.binding?.field==='skill.effect');
 assert.equal(inherited.style.fontPt,11);assert.equal(inherited.style.lineHeight,1.6);
 const loaded=parseProject(serializeProject(changed));assert.equal(element(loaded.cards[0],'skill.effect').style.fontStyle,'italic');
 assert.equal(store.undo(),true);assert.equal(element(store.getProject().cards[0],'skill.effect').style.fontPt,8.5);
 assert.equal(store.redo(),true);assert.equal(element(store.getProject().cards[0],'skill.effect').style.underline,true);
});
test('invalid typography has exact element and skill name diagnostics',()=>{
 const p=fixture();element(p.cards[0],'skill.effect').style.lineHeight=0;p.cards[0].passives[0].nameStyle={fontPt:NaN,letterSpacingMm:Infinity};
 const problems=validateProject(p);assert.ok(problems.some(e=>e.elementId===element(p.cards[0],'skill.effect').id&&e.message.includes('줄 간격')));
 assert.ok(problems.some(e=>e.skillId==='first'&&e.message.includes('글자 크기')));
});


test('automatic flow preserves authored stacking positions around existing and newly added rows',()=>{
 const p=fixture(),c=p.cards[0],first=element(c,'skill.name'),second=element(c,'skill.effect');
 const overlay={id:'overlay',type:'rect',binding:null,rect:{...first.rect},style:{fill:'#fffdf8'}};c.elements.splice(c.elements.findIndex(e=>e.id===second.id),0,{id:'between',type:'rect',binding:null,rect:{x:1,y:1,w:2,h:2},style:{fill:'#ffffff'}});c.elements.push(overlay);
 const originalIds=c.elements.map(e=>e.id);c.passives[0].effect+=' 긴 설명';const next=syncSkillElements(c,p.settings);assert.deepEqual(next.elements.map(e=>e.id),originalIds);
 next.passives.push({id:'third',name:'추가 기술',effect:'새 내용',dice:null,keywords:[]});const added=syncSkillElements(next,p.settings);assert.equal(added.elements.at(-1).id,'overlay');assert.ok(added.elements.findIndex(e=>e.binding?.skillId==='third')>added.elements.findIndex(e=>e.binding?.skillId==='second'));
});

test('legacy finite font sizes above the new input limit still validate load and remain editable',()=>{
 for(const fontPt of [.01,201,500]){
  const p=createProject(),c=p.cards[0];c.template='custom';c.autoSkillLayout=false;c.elements=[{id:'legacy-text',type:'text',binding:null,content:'이전 파일',rect:{x:0,y:0,w:63,h:88},style:{fontPt,fontWeight:400}}];
  assert.deepEqual(validateProject(p),[],'legacy '+fontPt+' pt remains a valid project');const loaded=parseProject(JSON.stringify(p)),target={cardId:c.id,elementId:'legacy-text'};
  assert.equal(loaded.cards[0].elements[0].style.fontPt,fontPt);writeTargetTextStyle(loaded,target,{...readTargetTextStyle(loaded,target),underline:true});assert.equal(loaded.cards[0].elements[0].style.fontPt,fontPt);assert.equal(loaded.cards[0].elements[0].style.underline,true);
 }
 for(const fontPt of [0,-1,NaN,Infinity]){
  const p=fixture();element(p.cards[0],'skill.effect').style.fontPt=fontPt;assert.ok(validateProject(p).some(problem=>problem.code==='font'),'invalid font '+fontPt+' is still rejected');
 }
});
