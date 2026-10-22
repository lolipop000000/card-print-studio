import {el,button,field} from './dom.js';
import {clone,newId} from '../model/types.js';
import {VISUAL_EFFECT_CATALOG} from '../model/visual-effects.js';
import {makeVisualEffectLayerForTarget} from '../model/effect-emission.js';
import {BLEND_MODES,DEFAULT_BLEND_MODE} from '../model/blend-modes.js';
import {isSpriteFieldVisible,SPRITE_CONTROL_HINT,SPRITE_SHEET_HINT} from '../model/sprite-controls.js';
import {PARTICLE_IMAGES,particleImageData} from '../render/particle-images.js';
const placements=[['behind','대상 뒤'],['front','대상 앞']];
const scopes=[['all','지금까지 쌓은 전체'],['inside','원본 모양 안쪽'],['outside','원본 모양 바깥']];
export function renderVisualEffectFields(host,{recipe,selectedLayerId,targetType,onChange,onSelect,assetOptions=[],onImportImage,onLibraryImage,onBuiltinImage,importing=false}){
 const layer=recipe.layers.find(l=>l.id===selectedLayerId),index=recipe.layers.indexOf(layer),definition=layer&&VISUAL_EFFECT_CATALOG[layer.kind];
 const advancedOpen=host.querySelector('#effect-advanced')?.open||false;
 const spriteGroupState=new Map([...host.querySelectorAll('[data-sprite-group]')].map(group=>[group.dataset.spriteGroup,group.open]));
 const emitterValue=host.querySelector('#effect-emitter-preset')?.value??'sprite';
 const kinds=Object.entries(VISUAL_EFFECT_CATALOG).filter(([,d])=>!d.generative&&(!d.textOnly||targetType==='text'));
 const group=d=>d.generative?'입자·자연':d.textOnly||['waveDistort','displacement','heatHaze','glitch','pixelate','erode'].includes(d.kind)?'형태·왜곡':'빛·색·질감';
 const picker=el('select',{id:'effect-layer-kind','aria-label':'추가할 효과'},['빛·색·질감','형태·왜곡'].map(label=>el('optgroup',{label},kinds.filter(([kind,d])=>group({...d,kind})===label).map(([kind,d])=>el('option',{value:kind,disabled:d.textOnly&&recipe.layers.some(l=>l.kind===kind)},d.name)))));
 const emitter=el('select',{id:'effect-emitter-preset','aria-label':'파티클 시작 프리셋'},Object.entries(VISUAL_EFFECT_CATALOG).filter(([,d])=>d.generative).map(([kind,d])=>el('option',{value:kind},d.name)));
 emitter.value=emitterValue;

 picker.value='outline';
 const list=el('div',{id:'effect-layer-list',class:'effect-layer-list'},el('div',{id:'effect-original',class:'effect-original'},el('strong',{},'원본'),el('small',{},'위에서 아래로 적용')));
 for(const l of recipe.layers){
  const d=VISUAL_EFFECT_CATALOG[l.kind];
  list.append(el('div',{class:'effect-layer'+(l===layer?' active':''),'data-kind':l.kind},
   el('input',{type:'checkbox',checked:l.enabled,'aria-label':d.name+' 켜기',onchange:event=>onChange(r=>r.layers.find(a=>a.id===l.id).enabled=event.target.checked)}),
   button((d.generative?'✦ ':d.textOnly?'↝ ':'◇ ')+d.name,()=>onSelect(l.id),{class:'effect-layer-select','aria-pressed':l===layer}),
   el('small',{},l.kind==='textWarp'?'글자 원본':d.generative?placements.find(([v])=>v===l.placement)?.[1]:({all:'전체',inside:'안쪽',outside:'바깥'})[l.scope])));
 }
 const add=()=>{const kind=picker.value;onChange(r=>{const next=makeVisualEffectLayerForTarget(kind,targetType);kind==='textWarp'?r.layers.unshift(next):r.layers.push(next);return next.id;});};
 const header=[el('h3',{},'효과 레이어 · '+recipe.layers.length+' / 12')];
 if(targetType==='frame'){
  const frame=recipe.frame||{scope:'border',bandMm:4},change=fn=>onChange(r=>{r.frame??={scope:'border',bandMm:4};fn(r.frame);});
  header.push(field('프레임 효과 범위','effect-frame-scope',frame.scope,v=>change(f=>f.scope=v),{options:[['border','테두리'],['borderBleed','테두리 + 안쪽 번짐'],['full','배경 전체']]}),field('테두리 띠 두께 (mm)','effect-frame-band',frame.bandMm,v=>change(f=>f.bandMm=v),{type:'number',min:2,max:10,step:.5}));
 }
 host.replaceChildren(...header,el('div',{class:'effect-add-row particle-add-row'},emitter,button('✦ 파티클 추가',()=>onChange(r=>{const next=makeVisualEffectLayerForTarget(emitter.value,targetType);r.layers.push(next);return next.id;}),{id:'effect-particle-add',disabled:recipe.layers.length>=12})),el('div',{class:'effect-add-row'},picker,button('+ 효과 추가',add,{id:'effect-layer-add',disabled:recipe.layers.length>=12})),list);
 if(!layer){host.append(el('p',{id:'effect-empty',class:'empty-note'},'효과를 추가하거나 왼쪽 프리셋으로 시작하세요.'));return;}
 const mutate=change=>onChange(r=>change(r.layers.find(l=>l.id===layer.id)));
 const canMove=delta=>layer.kind!=='textWarp'&&index+delta>=0&&index+delta<recipe.layers.length&&recipe.layers[index+delta].kind!=='textWarp';
 const reorder=delta=>onChange(r=>{const i=r.layers.findIndex(l=>l.id===layer.id),j=i+delta;if(j<0||j>=r.layers.length||r.layers[j].kind==='textWarp'||layer.kind==='textWarp')return;[r.layers[i],r.layers[j]]=[r.layers[j],r.layers[i]];});
 const actions=el('div',{class:'effect-layer-actions'},
  button('↑',()=>reorder(-1),{id:'effect-layer-up','aria-label':'적용 순서 위로',disabled:!canMove(-1)}),
  button('↓',()=>reorder(1),{id:'effect-layer-down','aria-label':'적용 순서 아래로',disabled:!canMove(1)}),
  button('복제',()=>onChange(r=>{const l=clone(layer);l.id=newId();r.layers.splice(index+1,0,l);return l.id;}),{id:'effect-layer-duplicate',disabled:layer.kind==='textWarp'||recipe.layers.length>=12}),
  button('삭제',()=>onChange(r=>r.layers.splice(index,1)),{id:'effect-layer-delete',class:'danger'}),
  button('초기화',()=>onChange(r=>r.layers[index]=makeVisualEffectLayerForTarget(layer.kind,targetType,{id:layer.id})),{id:'effect-layer-reset'}));
 const panel=el('section',{class:'effect-layer-fields'},el('h3',{},(definition.generative?'파티클 이미터 · ':'')+definition.name),actions);
 if(layer.kind==='textWarp')panel.append(el('p',{class:'hint'},'글자 모양을 먼저 바꿔요. 뒤에 붙인 불꽃과 연기도 변형된 글자를 따라갑니다.'));
 else if(definition.generative)panel.append(field('앞뒤 배치','effect-placement',layer.placement,v=>mutate(l=>l.placement=v),{options:placements}));
 else panel.append(field('필터 적용 범위','effect-scope',layer.scope,v=>mutate(l=>l.scope=v),{options:scopes}));
 if(layer.kind!=='textWarp')panel.append(field('혼합 모드','effect-layer-blend-mode',layer.blendMode??DEFAULT_BLEND_MODE,v=>mutate(l=>l.blendMode=v),{options:BLEND_MODES}),
  el('p',{id:'effect-blend-hint',class:'hint'},definition.generative?'대상 뒤: 이펙트 → 지금까지의 결과, 대상 앞: 지금까지의 결과 → 이펙트 순으로 혼합해요. 메뉴의 ‘현재 레이어’는 두 번째로 겹치는 쪽이에요.':'일반은 필터 결과로 바꾸고, 다른 모드는 지금까지의 결과 위에 필터 결과를 혼합해요. 불투명도와 적용 범위는 그다음 조절해요.'));
 if(definition.hint)panel.append(el('p',{id:'effect-layer-hint',class:'hint'},definition.hint));
 if(layer.kind==='sprite')panel.append(el('p',{id:'effect-sprite-controls-hint',class:'hint'},SPRITE_CONTROL_HINT),el('div',{class:'particle-image-gallery','aria-label':'기본 입자 이미지'},...PARTICLE_IMAGES.map(([key,name])=>button([el('img',{src:particleImageData(key),alt:'',width:40,height:40}),el('span',{},name)],()=>onBuiltinImage?.(layer.id,key),{'data-particle-image':key,disabled:importing||!onBuiltinImage,title:name}))));
 if(layer.kind!=='textWarp')panel.append(el('label',{class:'check'},el('input',{id:'effect-over-text',type:'checkbox',checked:layer.protectText===false,onchange:event=>mutate(l=>l.protectText=!event.target.checked)}),'글자 위에도 그리기'));
 const groups=new Map(),groupIds={'이미지 자르기':'crop','크기·회전 중심':'transform','여러 컷 재생':'sheet','이동 패턴':'path'};
 const entries=Object.entries(definition.fields);if(layer.kind==='sprite')entries.sort(([a],[b])=>(a==='shape'?0:a==='renderMode'?1:2)-(b==='shape'?0:b==='renderMode'?1:2));
 for(const [key,f] of entries){
  if(layer.kind==='sprite'&&!isSpriteFieldVisible(key,layer.params))continue;
  if(layer.kind==='sprite'&&layer.params.renderMode==='single'&&f.group==='이동 패턴')continue;
  let fieldHost=panel;
  if(f.group){
   if(!groups.has(f.group)){
    const group=el('details',{id:'effect-sprite-'+groupIds[f.group],'data-sprite-group':f.group,open:spriteGroupState.get(f.group)??f.group==='이동 패턴'},el('summary',{},f.group));
    if(f.group==='이동 패턴')group.append(el('p',{class:'hint'},'기존 움직임에 경로를 더해요. 거리와 진폭은 대상 높이의 비율이에요.'));
    if(f.group==='여러 컷 재생')group.append(el('p',{class:'hint'},SPRITE_SHEET_HINT));
    groups.set(f.group,group);panel.append(group);
   }fieldHost=groups.get(f.group);
  }
  if(f.type==='asset'){
   fieldHost.append(field(f.label,'effect-param-'+key,layer.params[key]||'',v=>mutate(l=>l.params[key]=v||null),{options:[['','이미지 선택 안 함'],...assetOptions]}),
    el('div',{class:'two-fields'},button('입자 이미지 가져오기',()=>onImportImage?.(layer.id),{id:'effect-sprite-import',disabled:importing}),button('보관함에서 선택',()=>onLibraryImage?.(layer.id),{id:'effect-sprite-library',disabled:importing||!onLibraryImage})));
  }else{
   const scale=f.displayScale??1,number=f.type==='number',label=layer.kind==='sprite'&&layer.params.renderMode==='single'?({sizeStart:'장식 크기',alphaStart:'그림 투명도',rotation:'회전'})[key]||f.label:f.label;
   fieldHost.append(field(label+(f.unit?' ('+f.unit+')':''),'effect-param-'+key,number?(layer.params[key]??f.value)*scale:layer.params[key]??f.value,v=>mutate(l=>l.params[key]=number?v/scale:v),{type:f.type,min:number?f.min*scale:f.min,max:number?f.max*scale:f.max,step:number?f.step*scale:f.step,options:f.options}));
  }
 }

 if(layer.kind!=='textWarp')panel.append(field('불투명도','effect-opacity',layer.opacity,v=>mutate(l=>l.opacity=v),{type:'number',min:0,max:1,step:.05}));
 if(definition.generative){
  if(layer.kind!=='sprite'||layer.params.renderMode!=='single')panel.append(field(targetType==='effect'?'발생 위치':'모양에서 피어나는 면','effect-face',layer.emit.face,v=>mutate(l=>l.emit.face=v),{options:[['up','윗면'],['down','아랫면'],['side','옆면'],['all','모든 가장자리'],['inside','모양 안쪽'],['area',targetType==='effect'?'영역 전체':'직접 정한 영역']]}),
   el('label',{class:'check'},el('input',{id:'effect-open-only',type:'checkbox',checked:layer.emit.openOnly,onchange:event=>mutate(l=>l.emit.openOnly=event.target.checked)}),'바로 앞이 빈 곳만'),
   el('p',{class:'hint'},targetType==='effect'?'독립 장식은 영역 전체에서 시작해요. 고급 설정에서 발생 위치와 크기를 조절하세요.':'글자와 그림의 실제 모양에서 피어나요. 글자 구멍은 채운 덩어리로 계산합니다.'));
  const advanced=el('details',{id:'effect-advanced',open:advancedOpen},el('summary',{},'고급 · 발생 영역과 회전'),
   el('div',{class:'two-fields'},...Object.entries({x:'가로 위치',y:'세로 위치',w:'발생 폭',h:'발생 높이'}).map(([k,label])=>field(label+' (비율)','effect-origin-'+k,layer.origin[k],v=>mutate(l=>l.origin[k]=v),{type:'number',min:k==='w'?.05:k==='h'?.005:-1,max:k==='y'?5:['w','h'].includes(k)?3:2,step:.05}))),
   field('회전 (°)','effect-rotation',layer.rotationDeg,v=>mutate(l=>l.rotationDeg=v),{type:'number',min:-180,max:180,step:5}));
  panel.append(advanced);
 }
 if(definition.animated||layer.kind==='textWarp')panel.append(
  el('label',{class:'check'},el('input',{id:'effect-motion',type:'checkbox',checked:layer.motion.enabled,onchange:event=>mutate(l=>l.motion.enabled=event.target.checked)}),layer.kind==='textWarp'?'물결 움직임':'움직임'),
  field('재생 속도','effect-speed',layer.motion.speed,v=>mutate(l=>l.motion.speed=v),{type:'number',min:.1,max:3,step:.1}));
 host.append(panel);
}
