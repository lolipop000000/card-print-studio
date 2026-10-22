import {el,button,field,preserveFocus,showMessage} from './dom.js';
import {selectedElements} from './element-selection.js';
import {RANKS,ATTRIBUTES,cardAttributes,newId,clone} from '../model/types.js';
import {finalHp} from '../model/project.js';
import {resetVariantOverride} from '../model/variants.js';
import {syncSkillElements,fitCard,applyTemplate} from '../render/templates.js';
import {openDialog} from './dialogs.js';
import {keywordControls} from './keywords.js';
import {skillEffectField,skillReferenceControls} from './skill-references.js';
import {preserveSkillReferenceNames,remapSkillReferences} from '../model/skill-references.js';
import {createVisualEffects,writeTargetEffects} from '../model/visual-effects.js';
import {textStyleFields} from './text-style-fields.js';
import {renderElementAlignmentControls} from './element-alignment.js';
import {renderObjectList} from './object-list.js';
import {rangeTextField,textRangeControls} from './text-ranges.js';
import {editText,remapTextRanges} from '../model/text-ranges.js';
import {organizeMobileInspector} from './mobile-layout.js';
function group(title,...children){return el('section',{class:'inspector-group'},el('h3',{},title),children);}
function attributeControls(card,editCard){
 const selectedAttributes=cardAttributes(card),item=card.kind==='item',label=item?'아이템에 부여한 속성':'몬스터 속성';
 const selection=selectedAttributes.map(value=>ATTRIBUTES[value].name).join(' · ')||'속성 없음';
 const picker=el('details',{id:'attributes',class:'attribute-picker',role:'group','aria-label':label},
  el('summary',{id:'attribute-menu-toggle','aria-label':'속성 선택: '+selection},el('span',{id:'attribute-selection'},selection),el('span',{class:'attribute-menu-arrow','aria-hidden':true},'⌄')),
  el('div',{class:'attribute-options'},el('p',{class:'hint'},item?'여러 개를 선택할 수 있어요. 전부 해제하면 속성 없음이며, 양초 표시는 유지됩니다.':'여러 개를 선택할 수 있어요. 최소 한 개는 남겨 주세요.'),
  el('div',{class:'two-fields'},Object.entries(ATTRIBUTES).map(([value,attribute])=>el('label',{class:'check'},
   el('input',{id:'attribute-'+value,type:'checkbox',checked:selectedAttributes.includes(value),disabled:!item&&selectedAttributes.length===1&&selectedAttributes[0]===value,onchange:event=>editCard(label,(c,d)=>{
    const selected=new Set(cardAttributes(c));if(event.target.checked)selected.add(value);else selected.delete(value);if(!selected.size&&!item)return;
    const previousTemplate=c.template==='custom'?null:applyTemplate(c,d.settings,c.template,d.keywords||[]);
    c.attributes=Object.keys(ATTRIBUTES).filter(key=>selected.has(key));if(c.attributes.length)c.attribute=c.attributes[0];else delete c.attribute;
    if(previousTemplate){
     const nextTemplate=applyTemplate(c,d.settings,c.template,d.keywords||[]);
     for(const e of c.elements.filter(element=>element.type==='attribute'||element.binding?.field==='art')){
      const matches=element=>e.type==='attribute'?element.type==='attribute':element.binding?.field==='art',before=previousTemplate.elements.find(matches),after=nextTemplate.elements.find(matches);
      if(before&&after&&['x','y','w','h'].every(key=>Math.abs(e.rect[key]-before.rect[key])<.00001))e.rect={...after.rect};
     }
    }
    Object.assign(c,syncSkillElements(c,d.settings,d.keywords||[]));
   })}),el('span',{class:'attribute-swatch',style:'background:'+attribute.color,'aria-hidden':true}),attribute.name)))));
 picker.addEventListener('keydown',event=>{if(event.key==='Escape'&&picker.open){event.preventDefault();event.stopPropagation();picker.open=false;picker.querySelector('summary').focus();}});
 return el('div',{class:'field attribute-field'},el('span',{},'속성'),picker);
}
function boundTextControls(card,field,skillId,editCard,minFontPt,idPrefix,label){
 const e=card.elements.find(e=>e.type==='text'&&e.binding?.field===field&&(skillId===null||e.binding.skillId===skillId));if(!e)return null;
 return el('details',{'data-text-style':idPrefix},el('summary',{},label),
  el('div',{class:'two-fields'},textStyleFields(e.style,(key,value)=>editCard(label,(c,d)=>{
   const automatic=c.autoSkillLayout??c.template!=='custom',target=c.elements.find(item=>item.id===e.id);if(!target)return;target.style[key]=value;c.template='custom';c.autoSkillLayout=automatic;
   if(automatic)Object.assign(c,syncSkillElements(c,d.settings,d.keywords||[]));
  }),{idPrefix,minFontPt,includeColor:true})));
}
export function renderInspector(host,ctx){
 const settingsOpen=host.querySelector('.settings')?.open??false,attributesOpen=host.querySelector('#attributes')?.open??false,scroll=host.scrollTop,openTextStyles=new Set([...host.querySelectorAll('details[data-text-style][open]')].map(node=>node.dataset.textStyle));
 preserveFocus(()=>{
 host.replaceChildren();const p=ctx.store.getProject(),card=ctx.card(),target=ctx.target();
 if(target){const objects=el('div',{class:'object-panel'});renderObjectList(objects,ctx);host.append(objects);}
 const editCard=(label,fn)=>ctx.edit(label,d=>{const c=d.cards.find(c=>c.id===ctx.state.activeCardId);if(!c)return;fn(c,d);});
 const set=(key,value)=>editCard('카드 '+key,(c,d)=>{c[key]=value;if(key==='effect')Object.assign(c,syncSkillElements(c,d.settings,d.keywords||[]));});
 const cardTextChange=fn=>editCard('카드 글자 수정',(c,d)=>{fn(c,c);Object.assign(c,syncSkillElements(c,d.settings,d.keywords||[]));});
 const boundId=(field,skillId)=>card?.elements.find(e=>e.binding?.field===field&&(e.binding.skillId||null)===(skillId||null))?.id;
 if(!ctx.state.back&&card){
  host.append(group('카드 정보',
   rangeTextField('카드 이름','card-name',card,'name',cardTextChange),
   textRangeControls(ctx,{card,owner:card,field:'name',inputId:'card-name',elementId:boundId('name'),change:cardTextChange}),
   keywordControls(ctx,card,cardTextChange,'card-name',{field:'name'}),
   boundTextControls(card,'name',null,editCard,p.settings.minFontPt,'card-name-style','카드 이름 글자 꾸미기'),
   field('인쇄 수량','card-quantity',card.quantity,v=>set('quantity',v),{type:'number',min:1,step:1})
  ));
  if(card.variant){const parent=p.cards.find(c=>c.id===card.variant.parentId),labels={name:'이름',attribute:'속성',attributes:'속성',rank:'등급',baseHp:'기본 HP',hpReduction:'차감 HP',artAssetId:'그림',passives:'패시브 일부',actives:'액티브 일부',effect:'효과',keywords:'키워드',template:'템플릿',autoSkillLayout:'자동 배치',elements:'요소 배치',visualEffects:'프레임 이펙트'};
   host.append(group('Variant',field('Variant 구분명','variant-label',card.variant.label,v=>editCard('Variant 이름',c=>c.variant.label=v)),button('원본: '+parent.name,()=>ctx.selectCard(parent.id),{class:'wide'}),el('p',{class:'hint'},'원본의 변경을 이어받아요. 직접 바꾼 부분과 인쇄 수량은 별도로 유지합니다.'),...Object.keys(card.variant.overrides).map(key=>button((labels[key]||key)+' · 원본 값으로',()=>editCard('상속 복원',c=>resetVariantOverride(c,key)),{class:'wide subtle','data-variant-reset':key})),button('변경 모두 원본 값으로',()=>editCard('상속 모두 복원',c=>resetVariantOverride(c)),{id:'variant-reset',class:'wide'}),button('연결 해제 · 독립 카드로',()=>editCard('Variant 연결 해제',c=>delete c.variant),{id:'variant-detach',class:'wide'})));
  }
  host.append(button('+ Variant 만들기',()=>ctx.addVariant(),{id:'add-variant',class:'wide dashed'}));
  if(card.kind==='monster'){
   host.append(group('몬스터',
    field('등급','rank',card.rank,v=>set('rank',v),{options:RANKS.map(r=>[r,r+' 등급'])}),
    attributeControls(card,editCard),
    el('div',{class:'two-fields'},field('기본 HP','base-hp',card.baseHp,v=>set('baseHp',v),{type:'number',min:0,step:1}),field('직접 깎을 HP','hp-reduction',card.hpReduction,v=>set('hpReduction',v),{type:'number',min:0,max:card.baseHp,step:1})),
    el('div',{class:'hp-result'},el('span',{},'카드에 표시되는 HP'),el('strong',{id:'final-hp'},String(finalHp(card)))),
    button('등급 기준값 적용',()=>editCard('등급 체력 기준 적용',(c,d)=>{const hp=d.settings.rankRules[c.rank].baseHp;if(hp<c.hpReduction)throw new Error('차감량이 기준 HP보다 커요. 차감량을 먼저 줄여 주세요.');c.baseHp=hp;}),{id:'apply-rank',class:'wide subtle'}),
    !ctx.state.ignoreOutputWarnings&&p.settings.rankRules[card.rank].hpCap!==null&&finalHp(card)>p.settings.rankRules[card.rank].hpCap?el('p',{id:'hp-cap-alert',class:'warning'},'설정한 등급 HP 상한을 넘었어요.'):null
   ));
   for(const [key,label] of [['passives','패시브'],['actives','액티브']]){
    const list=el('div',{id:key,class:'skills'});
    card[key].forEach((sk,index)=>{
     const change=fn=>editCard('기술 수정',c=>{fn(c[key].find(s=>s.id===sk.id),c);Object.assign(c,syncSkillElements(c,p.settings,p.keywords||[]));});
     const reorder=delta=>editCard('기술 순서',c=>{const next=index+delta;if(next<0||next>=c[key].length)return;const a=c[key].splice(index,1)[0];c[key].splice(next,0,a);Object.assign(c,syncSkillElements(c,p.settings,p.keywords||[]));});
     const item=el('div',{class:'skill', 'data-skill':sk.id},
      el('div',{class:'skill-top'},el('span',{},label+' '+(index+1)),el('div',{class:'mini-actions'},
       button('↑',()=>reorder(-1),{'aria-label':'기술 위로',disabled:index===0}),
       button('↓',()=>reorder(1),{'aria-label':'기술 아래로',disabled:index===card[key].length-1}),
       button('⧉',()=>editCard('기술 복제',c=>{const copy=clone(sk);copy.id=newId();remapSkillReferences(copy,id=>id===sk.id?copy.id:id,()=>newId());remapTextRanges(copy,()=>newId());c[key].splice(index+1,0,copy);Object.assign(c,syncSkillElements(c,p.settings,p.keywords||[]));}),{'aria-label':'기술 복제'}),
       button('×',()=>editCard('기술 삭제',(c,d)=>{preserveSkillReferenceNames(c,sk.id,d);c[key].splice(index,1);Object.assign(c,syncSkillElements(c,p.settings,p.keywords||[]));}),{'aria-label':'기술 삭제'}))),
      rangeTextField('기술 이름','skill-'+sk.id+'-name',sk,'name',change,{class:'skill-name'}),
      textRangeControls(ctx,{card,owner:sk,field:'name',inputId:'skill-'+sk.id+'-name',elementId:boundId('skill.name',sk.id),change}),
      keywordControls(ctx,sk,change,'skill-'+sk.id+'-name',{field:'name'}),
      boundTextControls(card,'skill.name',sk.id,editCard,p.settings.minFontPt,'skill-'+sk.id+'-name-style','기술 이름 글자 꾸미기'),
      skillEffectField(card,sk,change,'skill-'+sk.id+'-effect',ctx.store),
      textRangeControls(ctx,{card,owner:sk,field:'effect',inputId:'skill-'+sk.id+'-effect',elementId:boundId('skill.effect',sk.id),change}),
      boundTextControls(card,'skill.effect',sk.id,editCard,p.settings.minFontPt,'skill-'+sk.id+'-effect-style','효과 설명 글자 꾸미기'),
      skillReferenceControls(card,sk,change,'skill-'+sk.id+'-effect',ctx.store),
       button('스킬 이름만 이펙트',()=>ctx.openVisualEffects({cardId:card.id,back:false,skillId:sk.id,elementId:null}),{class:'skill-name-effects wide'}),
      keywordControls(ctx,sk,change,'skill-'+sk.id+'-effect'),
      el('label',{class:'check'},el('input',{type:'checkbox',checked:!!sk.dice,onchange:event=>change(s=>s.dice=event.target.checked?{faces:[4,5,6],text:'성공',color:'#427963'}:null)}),'6면 주사위 조건'));
     if(sk.dice){
      item.append(el('div',{class:'dice-options'},[1,2,3,4,5,6].map(n=>button(['⚀','⚁','⚂','⚃','⚄','⚅'][n-1],()=>change(s=>s.dice.faces=s.dice.faces.includes(n)?s.dice.faces.filter(f=>f!==n):[...s.dice.faces,n].sort()),{'aria-label':'주사위 '+n,'aria-pressed':sk.dice.faces.includes(n),class:sk.dice.faces.includes(n)?'selected':''}))),
       field('조건 문구','skill-'+sk.id+'-dice-text',sk.dice.text,v=>change(s=>s.dice.text=v)),
       field('조건 색상','skill-'+sk.id+'-dice-color',sk.dice.color,v=>change(s=>s.dice.color=v),{type:'color'}));
     }
     list.append(item);
    });
    host.append(group(label,list,button('+ '+label+' 추가',()=>editCard(label+' 추가',c=>{c[key].push({id:newId(),name:'새 '+label,effect:'',dice:null,keywords:[]});Object.assign(c,syncSkillElements(c,p.settings,p.keywords||[]));}),{id:key==='passives'?'add-passive':'add-active',class:'wide dashed'})));
   }
  }else {host.append(group('아이템 효과',attributeControls(card,editCard),rangeTextField('효과 설명','item-effect',card,'effect',cardTextChange,{textarea:true}),textRangeControls(ctx,{card,owner:card,field:'effect',inputId:'item-effect',elementId:boundId('item.effect'),change:cardTextChange}),boundTextControls(card,'item.effect',null,editCard,p.settings.minFontPt,'item-effect-style','효과 설명 글자 꾸미기'),keywordControls(ctx,card,cardTextChange,'item-effect')));}
  host.append(group('시각 이펙트',button('선택한 대상 이펙트 만들기',()=>{
   const selected=card.elements.find(e=>e.id===ctx.state.selectedElementId&&['text','image','effect'].includes(e.type))||card.elements.find(e=>e.binding?.field==='name')||card.elements.find(e=>['text','image','effect'].includes(e.type));
   if(selected)ctx.openVisualEffects({cardId:card.id,back:false,elementId:selected.id});
  },{id:'card-text-effects',class:'wide primary',disabled:!card.elements.some(e=>['text','image','effect'].includes(e.type))}),button('프레임 이펙트 만들기',()=>ctx.openVisualEffects({cardId:card.id,back:false,elementId:null}),{id:'card-frame-effects',class:'wide'}),button('프레임 이펙트 해제',()=>ctx.edit('프레임 이펙트 해제',p=>writeTargetEffects(p,{cardId:card.id,back:false,elementId:null},createVisualEffects())),{id:'card-frame-effects-clear',class:'wide subtle',disabled:!card.visualEffects?.layers.length})));
  host.append(group('사용자 그림',button('그림 가져오기',()=>ctx.pickImage(null),{class:'wide'}),button('보관함에서 가져오기',()=>ctx.pickLibraryImage('art'),{id:'art-library',class:'wide'}),button('현재 그림 자르기',()=>ctx.cropImage(),{id:'art-crop',class:'wide',disabled:!card.artAssetId}),button('그림 그리기',()=>ctx.openPainting(),{id:'open-painting',class:'wide primary'}),button('그림 자동 맞춤',()=>editCard('그림 자동 맞춤',c=>{for(const e of c.elements)if(e.binding?.field==='art')e.style.fit='contain';c.template='custom';}),{id:'art-auto-fit',class:'wide'}),el('p',{class:'hint'},'자르기는 새 그림으로 저장해요. 그리기 원본과 레이어는 그대로 남아요.')));
  host.append(group('내용 맞춤',el('label',{class:'check'},el('input',{id:'auto-skill-layout',type:'checkbox',checked:card.autoSkillLayout??card.template!=='custom',onchange:event=>editCard('기술 자동 배치',(c,d)=>{c.autoSkillLayout=event.target.checked;if(c.autoSkillLayout)Object.assign(c,syncSkillElements(c,d.settings,d.keywords||[]));else c.template='custom';})}),'기술 영역 자동 맞춤'),el('div',{class:'two-fields'},button('기본 템플릿',()=>editCard('기본 템플릿',(c,d)=>Object.assign(c,applyTemplate(c,d.settings,c.kind==='monster'?'monster-standard':'item',d.keywords||[])))),button('긴 효과 맞춤',()=>editCard('내용 맞춤',(c,d)=>Object.assign(c,fitCard(c,d.settings,d.keywords||[]))))),el('p',{class:'hint'},'설명과 글자 설정에 맞춰 높이가 늘어나고 다음 기술은 아래로 이어져요. 위치나 크기를 직접 바꾸면 수동 배치로 전환합니다.')));
 }else if(ctx.state.back)host.append(group('공통 뒷면',el('p',{class:'hint'},'모든 카드에 같은 뒷면이 인쇄돼요. 아래 요소를 추가해 디자인하세요.')));
 const selectedItems=selectedElements(ctx.state,target),selected=selectedItems.length===1?selectedItems[0]:null;
 if(selectedItems.length>1)host.prepend(group('선택한 요소',el('strong',{id:'selection-count'},selectedItems.length+'개 요소 선택'),el('p',{class:'hint'},'끌어서 함께 이동 · 방향키 1px · Shift 10px (인쇄 300dpi 기준) · Esc 선택 해제'),renderElementAlignmentControls(ctx,selectedItems),button('선택 요소 복제',()=>ctx.duplicateElement(),{id:'duplicate-elements',class:'wide'}),button('선택 요소 삭제',()=>ctx.deleteElement(),{id:'delete-elements',class:'wide danger'}),button('선택 해제',()=>ctx.selectElements([]),{id:'clear-element-selection',class:'wide subtle'})));
 if(selected){
  const update=(key,value)=>ctx.editTarget('요소 속성',t=>{
   const automatic=t.autoSkillLayout??t.template!=='custom',e=t.elements.find(e=>e.id===selected.id);
   if(key==='content')editText(e,'content',value);else if(key.startsWith('rect.'))e.rect[key.slice(5)]=value;else if(key.startsWith('style.'))e.style[key.slice(6)]=value;else e[key]=value;
   if(t.kind){t.template='custom';t.autoSkillLayout=automatic;
    const bound=e.binding?.skillId||e.binding?.field?.startsWith('item.');
    if(bound&&key.startsWith('rect.'))t.autoSkillLayout=false;
    else if(automatic&&key.startsWith('style.'))Object.assign(t,syncSkillElements(t,p.settings,p.keywords||[]));
   }
  });
  const body=[el('div',{class:'two-fields'},...['x','y','w','h'].map(k=>field(({x:'X 위치',y:'Y 위치',w:'가로',h:'세로'})[k]+' (mm)','element-'+k,selected.rect[k],v=>update('rect.'+k,v),{type:'number',step:.1,min:['w','h'].includes(k)?.1:undefined})))];
  body.push(el('p',{class:'hint'},'방향키 1px · Shift 10px (인쇄 300dpi 기준)'),renderElementAlignmentControls(ctx,selectedItems));
  if(selected.type==='text'){if(!selected.binding){const change=fn=>ctx.editTarget('자유 글자 수정',t=>fn(t.elements.find(e=>e.id===selected.id)));body.unshift(rangeTextField('텍스트','element-content',selected,'content',change,{textarea:true}),textRangeControls(ctx,{card:target,owner:selected,field:'content',inputId:'element-content',elementId:selected.id,change,back:ctx.state.back}));}else body.unshift(el('p',{class:'hint'},'카드 정보와 연결된 글자예요. 내용은 카드 정보에서 수정하세요.'));}
  if(['rank','attribute','dice','keywords'].includes(selected.type))body.push(field('글자 크기 (pt)','element-font',selected.style.fontPt??9,v=>update('style.fontPt',Math.max(p.settings.minFontPt,v)),{type:'number',min:p.settings.minFontPt,step:.5}),field('글자 / 선 색','element-color',selected.style.color||'#253d32',v=>update('style.color',v),{type:'color'}));
  if(selected.type==='text')body.push(...textStyleFields(selected.style,(key,value)=>update('style.'+key,value),{idPrefix:'element',minFontPt:p.settings.minFontPt,includeColor:true}));
  if(selected.type==='image')body.push(el('label',{class:'check'},el('input',{id:'image-transparent',type:'checkbox',checked:!selected.style.fill||selected.style.fill==='transparent',onchange:e=>update('style.fill',e.target.checked?'transparent':'#eef0e8')}),'투명 배경 유지'));
  if(['rect','dice'].includes(selected.type)||selected.type==='image'&&selected.style.fill&&selected.style.fill!=='transparent')body.push(field('바탕 색','element-fill',selected.style.fill||'#eef0e8',v=>update('style.fill',v),{type:'color'}));
  if(selected.type==='image')body.push(field('그림 맞춤','image-fit',selected.style.fit||'contain',v=>update('style.fit',v),{options:[['contain','전체 보이기'],['cover','영역 채우기']]}),field('자르기 가로 위치','image-crop-x',selected.style.cropX??.5,v=>update('style.cropX',v),{type:'number',min:0,max:1,step:.05}),field('자르기 세로 위치','image-crop-y',selected.style.cropY??.5,v=>update('style.cropY',v),{type:'number',min:0,max:1,step:.05}),button('그림 교체',()=>ctx.pickImage(selected.id),{class:'wide'}),button('보관함 그림으로 교체',()=>ctx.pickLibraryImage('replace',selected.id),{id:'image-library',class:'wide'}),button('선택한 그림 자르기',()=>ctx.cropImage(selected.id),{id:'image-crop',class:'wide',disabled:!p.assets[selected.binding?.field==='art'?target.artAssetId:selected.assetId]}));
  if(selected.type==='dice'&&!selected.binding){const dice=selected.dice||{faces:[],text:'',color:'#427963'};body.push(field('조건 문구','element-dice-text',dice.text,v=>update('dice',{...dice,text:v})),el('div',{class:'dice-options'},[1,2,3,4,5,6].map(n=>button(String(n),()=>update('dice',{...dice,faces:dice.faces.includes(n)?dice.faces.filter(f=>f!==n):[...dice.faces,n].sort()}),{class:dice.faces.includes(n)?'selected':''}))));}
  if(['text','image','effect'].includes(selected.type))body.push(
   button('선택한 대상 이펙트 만들기',()=>ctx.openVisualEffects({cardId:ctx.state.activeCardId,back:ctx.state.back,elementId:selected.id}),{id:'element-effects',class:'wide primary'}),
   button('이펙트 해제',()=>ctx.edit('요소 이펙트 해제',p=>writeTargetEffects(p,{cardId:ctx.state.activeCardId,back:ctx.state.back,elementId:selected.id},createVisualEffects())),{id:'element-effects-clear',class:'wide subtle',disabled:!selected.style.visualEffects?.layers.length}));
  if(selected.type==='effect')body.push(button('이펙트 요소 복제',()=>ctx.duplicateElement(),{id:'duplicate-element',class:'wide'}));
  body.push(el('div',{class:'two-fields'},button('뒤로 보내기',()=>ctx.reorderElement(-1)),button('앞으로 가져오기',()=>ctx.reorderElement(1))),button('요소 삭제',()=>ctx.deleteElement(),{id:'delete-element',class:'wide danger'}));
  host.append(group('선택한 요소',...body));
 }
 host.append(group('자유 요소 추가',el('div',{class:'two-fields'},button('텍스트 추가',()=>ctx.addElement('text')),button('이미지 추가',()=>ctx.addElement('image')),button('보관함 이미지 추가',()=>ctx.pickLibraryImage('element'),{id:'add-library-image'}),button('사각형 추가',()=>ctx.addElement('rect')),button('주사위 추가',()=>ctx.addElement('dice')),button('이펙트 요소 추가',()=>ctx.addElement('effect'),{id:'add-effect'}))));
 const settings=el('details',{class:'settings'},el('summary',{},'덱 설정 · 크기 / 글자 / 등급'));
 const resize=(d,w,h)=>{const sx=w/d.settings.cardWidthMm,sy=h/d.settings.cardHeightMm;for(const t of [...d.cards,d.back])for(const e of t.elements){e.rect.x*=sx;e.rect.w*=sx;e.rect.y*=sy;e.rect.h*=sy;}d.settings.cardWidthMm=w;d.settings.cardHeightMm=h;};
 const changeSetting=async(key,v)=>{if(v===null||v<=0){showMessage('0보다 큰 값을 입력하세요.');ctx.renderInspector();return;}
  if(['maxWidthMm','maxHeightMm'].includes(key)&&v<p.settings[key==='maxWidthMm'?'cardWidthMm':'cardHeightMm']){
   const choice=await openDialog({title:'카드 크기도 줄일까요?',message:'새 최대 크기에 맞춰 모든 카드와 공통 뒷면을 함께 줄여요. 위치와 요소 크기도 비례 조정됩니다.',choices:[{id:'resize',label:'함께 줄이기'},{id:'cancel',label:'취소'}]});if(choice!=='resize'){ctx.renderInspector();return;}
   ctx.edit('최대 카드 크기',d=>{d.settings[key]=v;resize(d,Math.min(d.settings.cardWidthMm,d.settings.maxWidthMm),Math.min(d.settings.cardHeightMm,d.settings.maxHeightMm));});return;
  }
  ctx.edit('덱 설정',d=>{if(key==='cardWidthMm'||key==='cardHeightMm')resize(d,key==='cardWidthMm'?v:d.settings.cardWidthMm,key==='cardHeightMm'?v:d.settings.cardHeightMm);else d.settings[key]=v;
   if(key==='minFontPt'){
    for(const t of [...d.cards,d.back]){for(const e of t.elements)if(e.style.fontPt)e.style.fontPt=Math.max(v,e.style.fontPt);for(const sk of [...t.passives||[],...t.actives||[]])if(sk.nameStyle?.fontPt)sk.nameStyle.fontPt=Math.max(v,sk.nameStyle.fontPt);}
    d.cards=d.cards.map(c=>syncSkillElements(c,d.settings,d.keywords||[]));
   }});
 };
 for(const [key,label] of [['cardWidthMm','카드 가로 (mm)'],['cardHeightMm','카드 세로 (mm)'],['maxWidthMm','최대 가로 (mm)'],['maxHeightMm','최대 세로 (mm)'],['minFontPt','최소 글자 크기 (pt)']])settings.append(field(label,'setting-'+key,p.settings[key],v=>changeSetting(key,v),{type:'number',min:.1,step:.5}));
 const table=el('div',{class:'rank-table'},el('p',{class:'hint'},'등급 기준 HP / 선택적 상한 (빈칸 = 제한 없음)'));
 for(const rank of RANKS)table.append(el('div',{class:'rank-rule'},el('strong',{},rank),field('기준',rank+'-base',p.settings.rankRules[rank].baseHp,v=>ctx.edit('등급 기준',d=>d.settings.rankRules[rank].baseHp=v),{type:'number',min:0}),field('상한',rank+'-cap',p.settings.rankRules[rank].hpCap??'',v=>ctx.edit('등급 상한',d=>d.settings.rankRules[rank].hpCap=v),{type:'number',min:0})));
 settings.open=settingsOpen;settings.append(table);host.append(settings);
 const attributes=host.querySelector('#attributes');if(attributes)attributes.open=attributesOpen;
 for(const node of host.querySelectorAll('details[data-text-style]'))node.open=openTextStyles.has(node.dataset.textStyle);
 organizeMobileInspector(host);
 });
 host.scrollTop=scroll;
}
