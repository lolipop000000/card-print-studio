import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {applyTemplate,syncSkillElements} from '../src/render/templates.js';
import {createStore} from '../src/model/store.js';
import {createVariant} from '../src/model/variants.js';
import {createVisualEffects,makeVisualEffectLayer} from '../src/model/visual-effects.js';
import {saveCardTemplate,applyCardTemplate,renameCardTemplate,removeCardTemplate} from '../src/model/card-templates.js';
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const asset=id=>({id,mime:'image/png',dataUrl:pixel,width:1,height:1,paintingId:null});
const skill=(id,name)=>({id,name,effect:name+'의 내용',dice:null,keywords:[]});
const bound=(card,field,id)=>card.elements.find(e=>e.binding?.field===field&&(!id||e.binding.skillId===id));
function fixture(){
 const p=createProject();p.cards[0].id='source';let c=p.cards[0];
 c.name='원본 카드';c.passives=[skill('source-p0','원본 패시브')];c.actives=[skill('source-a0','원본 액티브')];
 c.artAssetId='source-art';p.assets['source-art']=asset('source-art');p.assets.decor=asset('decor');p.assets.sprite=asset('sprite');
 c=applyTemplate(c,p.settings,'monster-standard');c.template='custom';c.autoSkillLayout=false;
 bound(c,'name').rect={x:3,y:4,w:25,h:8};bound(c,'name').style.fontPt=17;
 bound(c,'art').style={fit:'cover',cropX:.2,cropY:.8};
 bound(c,'skill.name','source-p0').style.color='#ff0000';bound(c,'skill.name','source-a0').style.color='#0000ff';
 c.passives[0].nameStyle={fontPt:12,color:'#223344'};
 c.visualEffects=createVisualEffects('empty');c.visualEffects.layers=[makeVisualEffectLayer('sprite',{params:{shape:'image',assetId:'sprite'}})];
 c.elements.push({id:'ornament-text',type:'text',rect:{x:5,y:70,w:30,h:5},binding:null,content:'내 장식 문구',style:{fontPt:9,color:'#556677'}});
 c.elements.push({id:'ornament-image',type:'image',rect:{x:6,y:18,w:10,h:12},binding:null,assetId:'decor',style:{fit:'contain'}});
 p.cards[0]=c;return p;
}
function addTarget(p,{extra=false}={}){
 let c=createCard('monster',p);c.id='target';c.name='대상 이름';c.rank='S';c.baseHp=901;c.hpReduction=11;c.quantity=4;c.attributes=['water','dark'];c.attribute='water';
 c.passives=[skill('target-p0','대상 패시브'),...(extra?[skill('target-p1','추가 패시브')]:[])];c.actives=[skill('target-a0','대상 액티브')];
 c.artAssetId='target-art';p.assets['target-art']=asset('target-art');c=applyTemplate(c,p.settings,'monster-standard');p.cards.push(c);return c;
}
function content(card){
 return Object.fromEntries(['id','kind','name','quantity','rank','baseHp','hpReduction','attribute','attributes','artAssetId','effect','keywords'].filter(k=>card[k]!==undefined).map(k=>[k,structuredClone(card[k])]).concat(['passives','actives'].filter(k=>card[k]).map(k=>[k,card[k].map(({nameStyle,...s})=>structuredClone(s))])));
}

test('old projects without saved card designs load with an empty library and roundtrip',()=>{
 const p=createProject();delete p.cardTemplates;const loaded=parseProject(JSON.stringify(p));
 assert.deepEqual(loaded.cardTemplates,[]);assert.deepEqual(parseProject(serializeProject(loaded)).cardTemplates,[]);
});

test('saved designs remain stable after source rename, edit, deletion and JSON roundtrip',()=>{
 const p=fixture(),saved=saveCardTemplate(p,'source','  바다 서식  '),snapshot=structuredClone(saved);
 assert.equal(saved.name,'바다 서식');assert.deepEqual(Object.keys(saved.assets).sort(),['decor','sprite']);assert.equal(saved.assets['source-art'],undefined);
 p.cards[0].name='수정';p.cards[0].passives[0].name='수정 기술';bound(p.cards[0],'name').style.fontPt=32;p.assets.decor.width=3;
 p.cards=[];p.assets={};assert.deepEqual(p.cardTemplates[0],snapshot);assert.deepEqual(validateProject(p),[]);
 assert.deepEqual(parseProject(serializeProject(p)).cardTemplates,[snapshot]);
});

test('applying a manual design remaps skill roles, keeps target content and extra skills, and scales rectangles only',()=>{
 const p=fixture(),saved=saveCardTemplate(p,'source','수동'),target=addTarget(p,{extra:true}),before=content(target),extra=structuredClone(bound(target,'skill.effect','target-p1'));
 Object.assign(p.settings,{cardWidthMm:126,cardHeightMm:44,maxWidthMm:126});const settings=structuredClone(p.settings),art=structuredClone(p.assets['target-art']);
 const applied=applyCardTemplate(p,target.id,saved.id);
 assert.deepEqual(content(applied),before);assert.equal(applied.template,'custom');assert.equal(applied.autoSkillLayout,false);
 assert.deepEqual(bound(applied,'name').rect,{x:6,y:2,w:50,h:4});assert.equal(bound(applied,'name').style.fontPt,17);
 assert.equal(bound(applied,'skill.name','target-p0').style.color,'#ff0000');assert.equal(bound(applied,'skill.name','target-a0').style.color,'#0000ff');
 assert.deepEqual(bound(applied,'skill.effect','target-p1'),extra);assert.equal(applied.passives[0].nameStyle.fontPt,12);
 assert.deepEqual(bound(applied,'art').style,{fit:'cover',cropX:.2,cropY:.8});assert.equal(applied.artAssetId,'target-art');assert.deepEqual(p.assets['target-art'],art);
 assert.equal(applied.elements.find(e=>!e.binding&&e.type==='text').content,'내 장식 문구');assert.ok(p.assets[applied.elements.find(e=>!e.binding&&e.type==='image').assetId]);
 assert.notEqual(applied.visualEffects.layers[0].id,saved.recipe.visualEffects.layers[0].id);assert.deepEqual(p.settings,settings);assert.deepEqual(validateProject(p),[]);
});

test('automatic saved designs generate all target skill rows and fit target text after remapping styles',()=>{
 const p=fixture();p.cards[0].autoSkillLayout=true;const saved=saveCardTemplate(p,'source','자동'),target=addTarget(p,{extra:true});
 target.passives[0].effect='아주 긴 대상의 설명 '.repeat(35);const before=content(target),applied=applyCardTemplate(p,target.id,saved.id);
 assert.deepEqual(content(applied),before);assert.equal(applied.autoSkillLayout,true);
 for(const sk of [...applied.passives,...applied.actives])assert.ok(bound(applied,'skill.name',sk.id)&&bound(applied,'skill.effect',sk.id));
 const first=bound(applied,'skill.effect','target-p0'),second=bound(applied,'skill.name','target-p1');assert.ok(first.rect.h>10);assert.ok(second.rect.y>=first.rect.y+first.rect.h);
 assert.equal(bound(applied,'skill.name','target-a0').style.color,'#0000ff');assert.deepEqual(validateProject(p),[]);
});

test('a source with more skills never creates gameplay skills or dangling bindings on a smaller target',()=>{
 const p=fixture();p.cards[0].passives.push(skill('source-p1','두 번째'));p.cards[0]=applyTemplate(p.cards[0],p.settings,'monster-standard');const saved=saveCardTemplate(p,'source','많은 기술'),target=addTarget(p);
 const applied=applyCardTemplate(p,target.id,saved.id);assert.equal(applied.passives.length,1);assert.equal(applied.actives.length,1);
 assert.ok(applied.elements.every(e=>!e.binding?.skillId||['target-p0','target-a0'].includes(e.binding.skillId)));assert.deepEqual(validateProject(p),[]);
});

test('save and rename require explicit duplicate handling and overwrite preserves the selected saved identity',()=>{
 const p=fixture(),first=saveCardTemplate(p,'source','같은 이름');assert.throws(()=>saveCardTemplate(p,'source','같은 이름'),/같은 이름/);
 const second=saveCardTemplate(p,'source','같은 이름',{allowDuplicate:true});assert.equal(p.cardTemplates.length,2);assert.notEqual(first.id,second.id);
 bound(p.cards[0],'name').style.fontPt=25;const updated=saveCardTemplate(p,'source','같은 이름',{replaceTemplateId:first.id});assert.equal(updated.id,first.id);assert.equal(p.cardTemplates.length,2);
 assert.equal(updated.recipe.elements.find(e=>e.binding?.field==='name').style.fontPt,25);
 renameCardTemplate(p,second.id,'다른 이름');assert.equal(p.cardTemplates[1].name,'다른 이름');assert.throws(()=>renameCardTemplate(p,second.id,'같은 이름'),/같은 이름/);
 removeCardTemplate(p,first.id);assert.equal(p.cardTemplates.length,1);assert.equal(p.cardTemplates[0].id,second.id);
});

test('applying a design is one reversible store edit and leaves a Variant linked with its own gameplay',()=>{
 const p=fixture(),saved=saveCardTemplate(p,'source','서식');addTarget(p);const child=createVariant(p,'target',{label:'내 Variant',quantity:7});p.cards.push(child);const store=createStore(p);
 store.edit('Variant 내용',d=>{const c=d.cards.find(c=>c.id===child.id);c.baseHp=777;c.actives[0].effect='Variant 고유 내용';});
 const before=serializeProject(store.getProject()),beforeCard=store.getProject().cards.find(c=>c.id===child.id),beforeContent=content(beforeCard),meta={parentId:beforeCard.variant.parentId,label:beforeCard.variant.label,ids:structuredClone(beforeCard.variant.ids)};
 store.edit('카드 서식 적용',d=>applyCardTemplate(d,child.id,saved.id));const next=store.getProject(),applied=next.cards.find(c=>c.id===child.id),after=serializeProject(next);
 assert.deepEqual(content(applied),beforeContent);assert.equal(applied.variant.parentId,meta.parentId);assert.equal(applied.variant.label,meta.label);assert.deepEqual(applied.variant.ids,meta.ids);assert.equal(bound(applied,'name').style.fontPt,17);
 assert.ok(store.undo());assert.equal(serializeProject(store.getProject()),before);assert.ok(store.redo());assert.equal(serializeProject(store.getProject()),after);assert.deepEqual(validateProject(store.getProject()),[]);
});

test('an automatic Variant design survives resolution while later parent skill content remains inherited',()=>{
 const p=fixture();p.cards[0].autoSkillLayout=true;const saved=saveCardTemplate(p,'source','자동 Variant');addTarget(p);const child=createVariant(p,'target');p.cards.push(child);
 const current=createStore(p,{prepare:project=>{project.cards=project.cards.map(card=>card.variant&&card.autoSkillLayout?syncSkillElements(card,project.settings,project.keywords||[]):card);}});current.edit('서식 적용',draft=>applyCardTemplate(draft,child.id,saved.id));
 let applied=current.getProject().cards.find(card=>card.id===child.id);assert.equal(bound(applied,'name').style.fontPt,17);assert.equal(applied.passives[0].nameStyle.fontPt,12);
 current.edit('원본 기술 내용',draft=>{draft.cards.find(card=>card.id==='target').passives[0].effect='나중에 바뀐 원본 내용';});applied=current.getProject().cards.find(card=>card.id===child.id);
 assert.equal(applied.passives[0].effect,'나중에 바뀐 원본 내용');assert.equal(bound(applied,'name').style.fontPt,17);
 const reloaded=parseProject(serializeProject(current.getProject())).cards.find(card=>card.id===child.id);assert.equal(bound(reloaded,'name').style.fontPt,17);assert.equal(reloaded.variant.parentId,'target');
});

test('decorative painting snapshots and custom particle images are cloned with independent editable originals',()=>{
 const p=fixture();p.paintings['decor-original']={id:'decor-original',width:64,height:64,activeLayerId:'decor-layer',layers:[{id:'decor-layer',name:'장식 원본',visible:true,locked:false,opacity:.8,blendMode:'multiply',png:pixel}]};p.assets.decor.paintingId='decor-original';
 const saved=saveCardTemplate(p,'source','원본 포함'),snapshot=structuredClone(saved);addTarget(p);const first=applyCardTemplate(p,'target',saved.id),art=p.assets[first.elements.find(e=>e.assetId).assetId],drawing=p.paintings[art.paintingId];
 assert.notEqual(art.id,'decor');assert.notEqual(drawing.id,'decor-original');assert.notEqual(drawing.layers[0].id,'decor-layer');assert.equal(drawing.activeLayerId,drawing.layers[0].id);assert.equal(drawing.layers[0].blendMode,'multiply');
 const spriteId=first.visualEffects.layers[0].params.assetId;assert.notEqual(spriteId,'sprite');assert.equal(p.assets[spriteId].dataUrl,pixel);drawing.layers[0].name='대상에서만 수정';assert.deepEqual(saved,snapshot);assert.equal(p.paintings['decor-original'].layers[0].name,'장식 원본');assert.deepEqual(validateProject(p),[]);
});

test('empty decorative image and dice placeholders remain valid reusable design elements',()=>{
 const p=fixture();p.cards[0].elements.push({id:'empty-image',type:'image',rect:{x:1,y:1,w:8,h:8},binding:null,assetId:null,style:{fit:'contain'}},{id:'empty-dice',type:'dice',rect:{x:1,y:9,w:8,h:8},binding:null,dice:null,style:{fontPt:8}});
 assert.deepEqual(validateProject(p),[]);const saved=saveCardTemplate(p,'source','빈 장식');addTarget(p);const applied=applyCardTemplate(p,'target',saved.id);
 assert.ok(applied.elements.some(e=>!e.binding&&e.type==='image'&&!e.assetId));assert.ok(applied.elements.some(e=>!e.binding&&e.type==='dice'&&!e.dice));assert.deepEqual(validateProject(p),[]);
});

test('malformed design data and hidden resource fields are rejected before project load or apply',()=>{
 const p=fixture(),saved=saveCardTemplate(p,'source','검증');addTarget(p);const valid=serializeProject(p);
 const mutations=[
  v=>v.cardTemplates={},v=>v.cardTemplates[0].name=' ',v=>v.cardTemplates[0].recipe.widthMm=0,
  v=>v.cardTemplates[0].recipe.elements[0].rect.w=-2,v=>v.cardTemplates[0].recipe.elements[0].style.fontPt=0,
  v=>v.cardTemplates[0].recipe.elements[0].style.hiddenAsset={dataUrl:'javascript:bad'},
  v=>v.cardTemplates[0].recipe.elements[0].hiddenAssetId='decor',v=>v.cardTemplates[0].recipe.elements[0].binding={field:'skill.name',skill:{kind:'passive',index:-1}},
  v=>v.cardTemplates[0].recipe.visualEffects.layers[0].params.assetId='missing',v=>v.cardTemplates[0].assets.decor.dataUrl='data:text/html;base64,WA==',
  v=>v.cardTemplates[0].assets.decor.extra={dataUrl:'javascript:bad'},v=>v.cardTemplates[0].assets.decor.paintingId='missing',
  v=>v.cardTemplates[0].recipe.skillStyles[0].name='게임 내용',v=>v.cardTemplates[0].kind='other'
 ];
 for(const mutate of mutations){const bad=JSON.parse(valid);mutate(bad);assert.throws(()=>parseProject(JSON.stringify(bad)));const before=JSON.stringify(bad);assert.throws(()=>applyCardTemplate(bad,'target',saved.id));assert.equal(JSON.stringify(bad),before);}
 const item=createCard('item',p);p.cards.push(item);const before=serializeProject(p);assert.throws(()=>applyCardTemplate(p,item.id,saved.id),/종류/);assert.equal(serializeProject(p),before);
});
