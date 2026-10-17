import test from 'node:test';
import assert from 'node:assert/strict';
import * as types from '../src/model/types.js';
import {createProject,createCard,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
import {createVariant,resetVariantOverride} from '../src/model/variants.js';
import {exportCardFile,importCardFile} from '../src/model/card-file.js';
import {applyTemplate,syncSkillElements} from '../src/render/templates.js';
import * as icons from '../src/render/icons.js';

const all=['water','fire','grass','neutral','dark','light'];
const attributes=card=>{assert.equal(typeof types.cardAttributes,'function');return types.cardAttributes(card);};
const choose=(card,values)=>{card.attributes=[...values];card.attribute=values[0];};
const childOf=(p,id)=>p.cards.find(c=>c.id===id);
function family(){const p=createProject();choose(p.cards[0],['water','fire']);const child=createVariant(p,p.cards[0].id);p.cards.push(child);return {store:createStore(p),rootId:p.cards[0].id,childId:child.id};}
function canvasSpy(){
 const labels=[],circles=[],fonts=[],candles=[];
 const ctx=new Proxy({labels,circles,fonts,candles,roundRect:(...args)=>candles.push(args),measureText:text=>({width:[...text].length*2.4}),arc:(x,y,r)=>{if(r===11)circles.push([x,y,r]);},fillText:text=>labels.push(text)},
  {get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;if(key==='font')fonts.push(value);return true;}});
 return ctx;
}

test('monster attributes and optional item attributes read both modern and legacy selections',()=>{
 assert.deepEqual(attributes({kind:'monster',attribute:'fire'}),['fire']);
 assert.deepEqual(attributes({kind:'monster',attribute:'neutral',attributes:['water','light']}),['water','light']);
 assert.deepEqual(attributes({kind:'item'}),[]);
 assert.deepEqual(attributes({kind:'item',attribute:'dark'}),['dark']);
 assert.deepEqual(attributes({kind:'item',attribute:'dark',attributes:all}),all);
 assert.deepEqual(attributes({kind:'item',attribute:'fire',attributes:[]}),[]);
 assert.deepEqual(attributes({elements:[]}),[]);
});

test('new items have no inherent attribute but always keep the candle badge',()=>{
 const p=createProject(),item=createCard('item',p);
 assert.equal(item.attribute,undefined);assert.equal(item.attributes,undefined);
 assert.equal(applyTemplate(item,p.settings,'item').elements.some(e=>e.type==='attribute'),true);
});

test('optional item attributes preserve custom badge and artwork through deck and card files',()=>{
 for(const selected of [null,['fire'],all,[]]){
  const p=createProject(),item=createCard('item',p);if(selected!==null)choose(item,selected);
  Object.assign(item,{template:'custom',autoSkillLayout:false});
  item.elements=[{id:'custom-attribute',type:'attribute',rect:{x:49,y:3.5,w:7.8,h:9},binding:null,style:{fontPt:7}},
   {id:'custom-art',type:'image',rect:{x:7,y:18,w:39,h:30},binding:{field:'art'},style:{fit:'cover',cropX:.2,cropY:.7}}];
  p.cards.push(item);assert.deepEqual(validateProject(p),[]);
  const result=parseProject(serializeProject(p)).cards[1];
  assert.deepEqual(attributes(result),selected??[]);assert.deepEqual(result.elements,item.elements);
  const target=createProject(),added=importCardFile(target,exportCardFile(p,item.id));assert.deepEqual(attributes(added),selected??[]);
 }
});

test('item files made without a badge regain only the candle and preserve manual artwork',()=>{
 const p=createProject(),item=createCard('item',p);item.template='custom';item.autoSkillLayout=false;
 item.elements=[{id:'manual-art',type:'image',rect:{x:8,y:21,w:35,h:26},binding:{field:'art'},style:{fit:'cover',cropX:.2,cropY:.8}}];
 const art=structuredClone(item.elements[0]);p.cards.push(item);const loaded=parseProject(serializeProject(p));
 const result=loaded.cards[1];assert.deepEqual(result.elements.find(e=>e.id==='manual-art'),art);assert.equal(result.elements.filter(e=>e.type==='attribute').length,1);
 assert.deepEqual(parseProject(serializeProject(loaded)),loaded);
});

test('invalid optional item attributes identify the exact value and list constraint',()=>{
 for(const selection of ['fire',null,['unknown'],['fire','fire'],Array(7).fill('water')]){
  const p=createProject(),item=createCard('item',p);item.name='양초';item.attributes=selection;p.cards.push(item);
  const issue=validateProject(p).find(e=>e.code==='item-info');assert.ok(issue);assert.match(issue.message,/양초.*속성/);assert.throws(()=>parseProject(JSON.stringify(p)));
 }
});

test('all six monster attributes round trip through deck and standalone card files',()=>{
 const p=createProject(),card=p.cards[0];choose(card,all);
 assert.deepEqual(validateProject(p),[]);const loaded=parseProject(serializeProject(p));assert.deepEqual(attributes(loaded.cards[0]),all);
 const target=createProject(),added=importCardFile(target,exportCardFile(p,card.id));
 assert.deepEqual(attributes(added),all);assert.equal(added.attribute,'water');assert.deepEqual(validateProject(target),[]);
});

test('legacy scalar monster files keep their original representation and selected attribute',()=>{
 const p=createProject();p.cards[0].attribute='dark';const loaded=parseProject(serializeProject(p));
 assert.deepEqual(loaded,p);assert.equal(loaded.cards[0].attributes,undefined);assert.deepEqual(attributes(loaded.cards[0]),['dark']);
});

test('invalid monster selections identify the card, current value and array or count constraint',()=>{
 for(const [selection,current,rule] of [['water',/water/,/배열/],[null,/null/,/배열/],[[],/0/,/1.*6/],[Array(7).fill('water'),/7/,/1.*6/]]){
  const p=createProject();p.cards[0].name='여섯 빛';p.cards[0].attributes=selection;
  const issue=validateProject(p).find(e=>e.code==='monster-info');assert.ok(issue);assert.match(issue.message,/여섯 빛.*속성/);assert.match(issue.message,current);assert.match(issue.message,rule);
  assert.throws(()=>parseProject(JSON.stringify(p)));
 }
});

test('unknown and duplicate monster attributes report their positions and values',()=>{
 const p=createProject();p.cards[0].name='혼합';p.cards[0].attributes=['water','mystery'];
 let issue=validateProject(p).find(e=>e.code==='monster-info');assert.ok(issue);assert.match(issue.message,/혼합.*2.*mystery/);assert.match(issue.message,/water.*light/);
 p.cards[0].attributes=['fire','water','fire'];issue=validateProject(p).find(e=>e.code==='monster-info');assert.ok(issue);assert.match(issue.message,/3.*fire/);assert.match(issue.message,/중복.*1|1.*중복/);
});

test('an explicit attributes array can load without the compatibility scalar',()=>{
 const p=createProject();delete p.cards[0].attribute;p.cards[0].attributes=['grass','dark'];
 assert.deepEqual(validateProject(p),[]);const c=parseProject(JSON.stringify(p)).cards[0];assert.equal(c.attribute,'grass');assert.deepEqual(attributes(c),['grass','dark']);
});

test('shared variants follow parent multi-attribute changes without capturing unrelated overrides',()=>{
 const {store,rootId,childId}=family();store.edit('이름만 변경',d=>childOf(d,childId).name='별도 이름');
 store.edit('원본 속성',d=>choose(childOf(d,rootId),['grass','dark','light']));
 const child=childOf(store.getProject(),childId);assert.deepEqual(attributes(child),['grass','dark','light']);assert.equal(child.name,'별도 이름');
 assert.equal(child.variant.overrides.attributes,undefined);assert.equal(child.variant.overrides.attribute,undefined);
});

test('editing a variant selection keeps only that selection independent and resets as one field',()=>{
 const {store,rootId,childId}=family();store.edit('자식 속성',d=>choose(childOf(d,childId),['dark','light']));
 store.edit('원본 변경',d=>{const c=childOf(d,rootId);choose(c,['grass','fire']);c.baseHp=222;});
 let child=childOf(store.getProject(),childId);assert.deepEqual(attributes(child),['dark','light']);assert.equal(child.baseHp,222);
 assert.deepEqual(Object.keys(child.variant.overrides),['attributes']);
 const loaded=createStore(parseProject(serializeProject(store.getProject())));assert.deepEqual(attributes(childOf(loaded.getProject(),childId)),['dark','light']);
 loaded.edit('속성 상속 복원',d=>resetVariantOverride(childOf(d,childId),'attributes'));child=childOf(loaded.getProject(),childId);
 assert.deepEqual(attributes(child),['grass','fire']);assert.equal(child.attribute,'grass');assert.deepEqual(child.variant.overrides,{});
});

test('old scalar variant overrides remain effective when the parent gains multiple attributes',()=>{
 const p=createProject(),root=p.cards[0],child=createVariant(p,root.id);child.attribute='fire';child.variant.overrides.attribute={value:'fire'};p.cards.push(child);
 const store=createStore(p);store.edit('복수 속성',d=>choose(d.cards[0],['water','dark']));
 assert.deepEqual(attributes(store.getProject().cards[1]),['fire']);
 const loaded=createStore(parseProject(serializeProject(store.getProject())));assert.deepEqual(attributes(loaded.getProject().cards[1]),['fire']);
 loaded.edit('옛 속성 상속 복원',d=>resetVariantOverride(d.cards[1],'attribute'));assert.deepEqual(attributes(loaded.getProject().cards[1]),['water','dark']);
});

test('legacy scalar edits of a multi-attribute card remain visible and inherited',()=>{
 const {store,rootId,childId}=family();store.edit('옛 방식 원본 수정',d=>childOf(d,rootId).attribute='light');
 assert.deepEqual(attributes(childOf(store.getProject(),rootId)),['light']);assert.deepEqual(attributes(childOf(store.getProject(),childId)),['light']);
 store.edit('옛 방식 자식 수정',d=>childOf(d,childId).attribute='grass');store.edit('원본 다시 수정',d=>choose(childOf(d,rootId),['water','fire','dark']));
 assert.deepEqual(attributes(childOf(store.getProject(),childId)),['grass']);assert.deepEqual(validateProject(store.getProject()),[]);
});

test('item variants inherit optional selections, keep an explicit empty override and reset together',()=>{
 const p=createProject(),item=applyTemplate(createCard('item',p),p.settings,'item');p.cards.push(item);
 const child=createVariant(p,item.id);p.cards.push(child);const store=createStore(p),parent=d=>childOf(d,item.id),variant=d=>childOf(d,child.id);
 store.edit('속성 부여',d=>choose(parent(d),['fire','dark']));assert.deepEqual(attributes(variant(store.getProject())),['fire','dark']);
 store.edit('아이템 속성 해제',d=>choose(variant(d),[]));
 store.edit('원본 다시 변경',d=>{choose(parent(d),['water','light']);parent(d).effect='이어받은 효과';});
 let current=variant(store.getProject());assert.deepEqual(attributes(current),[]);assert.equal(current.attribute,undefined);assert.deepEqual(Object.keys(current.variant.overrides),['attributes']);assert.equal(current.effect,'이어받은 효과');
 const loaded=createStore(parseProject(serializeProject(store.getProject())));assert.deepEqual(attributes(variant(loaded.getProject())),[]);
 loaded.edit('상속 복원',d=>resetVariantOverride(variant(d),'attributes'));current=variant(loaded.getProject());assert.deepEqual(attributes(current),['water','light']);assert.deepEqual(current.variant.overrides,{});
 loaded.undo();assert.deepEqual(attributes(variant(loaded.getProject())),[]);loaded.redo();assert.deepEqual(attributes(variant(loaded.getProject())),['water','light']);
});

test('default multi-attribute layout reserves a clear row without moving the skill area or shrinking text',()=>{
 const p=createProject(),single=applyTemplate(p.cards[0],p.settings,'monster-standard');choose(p.cards[0],all);const multi=applyTemplate(p.cards[0],p.settings,'monster-standard');
 const badge=multi.elements.find(e=>e.type==='attribute'),art=multi.elements.find(e=>e.binding?.field==='art'),oldArt=single.elements.find(e=>e.binding?.field==='art');
 assert.ok(badge.rect.w>=50);assert.ok(badge.rect.y+badge.rect.h<=art.rect.y);
 assert.equal(art.rect.y+art.rect.h,oldArt.rect.y+oldArt.rect.h);assert.ok(multi.elements.every(e=>e.style.fontPt>=p.settings.minFontPt));
});

test('custom attribute and art positions stay intact when selecting multiple attributes',()=>{
 const p=createProject(),c=applyTemplate(p.cards[0],p.settings,'monster-standard');c.template='custom';c.autoSkillLayout=false;
 const art=c.elements.find(e=>e.binding?.field==='art');art.rect={x:8,y:20,w:36,h:27};const before=structuredClone(c.elements);choose(c,all);
 assert.deepEqual(syncSkillElements(c,p.settings).elements,before);
});

test('multiple attributes draw every existing circle and readable label at the configured minimum',()=>{
 assert.equal(typeof icons.drawAttributes,'function');const ctx=canvasSpy();const report=icons.drawAttributes(ctx,all,{x:4,y:14,w:55,h:9},{fontPt:7},7,'monster');
 assert.equal(ctx.circles.length,6);assert.deepEqual(ctx.labels,all.map(a=>types.ATTRIBUTES[a].name));assert.equal(report.fits,true);
 for(const font of ctx.fonts)assert.ok(Number(font.match(/([\d.]+)px/)[1])>=7*25.4/72-.0001);
});

test('compact custom attribute boxes keep all six symbols inside the preserved rectangle',()=>{
 assert.equal(typeof icons.drawAttributes,'function');const ctx=canvasSpy(),report=icons.drawAttributes(ctx,all,{x:49,y:3.5,w:7.8,h:9},{fontPt:7},7,'monster');
 assert.equal(ctx.circles.length,6);assert.equal(report.fits,true);assert.deepEqual(ctx.labels,[]);
});

test('item badges always draw candles, including an unassigned badge and every granted attribute',()=>{
 const rect={x:0,y:0,w:8,h:9},empty=canvasSpy();icons.drawAttributes(empty,[],rect,{fontPt:7},7,'item');
 assert.equal(empty.circles.length,1);assert.equal(empty.candles.length,1);assert.deepEqual(empty.labels,['아이템']);
 const multi=canvasSpy();assert.equal(icons.drawAttributes(multi,all,{x:4,y:14,w:55,h:9},{fontPt:7},7,'item').fits,true);
 assert.equal(multi.circles.length,6);assert.equal(multi.candles.length,6);assert.deepEqual(multi.labels,all.map(a=>types.ATTRIBUTES[a].name));
 const old=canvasSpy();icons.drawAttributeIcon(old,'fire',rect,undefined,'item');assert.equal(old.circles.length,1);assert.equal(old.candles.length,1);
});
