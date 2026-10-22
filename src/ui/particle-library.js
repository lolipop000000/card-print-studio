import {el,button,field} from './dom.js';
import {download} from './files.js';
import {openDialog} from './dialogs.js';
import {createParticleLibraryStorage} from '../storage/particle-library.js';
import {createParticleLibrary,createParticleEntry,instantiateParticle,parseParticleLibrary,serializeParticleLibrary,particleRecipeTarget,particleRecipeForTarget} from '../model/particle-library.js';
import {createVisualEffects,VISUAL_EFFECT_CATALOG,writeTargetEffects} from '../model/visual-effects.js';
import {makeVisualEffectLayerForTarget} from '../model/effect-emission.js';
import {newId} from '../model/types.js';
import {createProject} from '../model/project.js';
import {createStore} from '../model/store.js';
import {loadAssets} from '../model/assets.js';
import {renderVisualEffects,createEffectCache} from '../render/effects/composite.js';
import {makeSurface} from '../render/effects/masks.js';
import {openVisualEffectsEditor} from './visual-effects.js';

const builtins=Object.entries(VISUAL_EFFECT_CATALOG).filter(([,d])=>d.generative&&d.name).map(([kind,d])=>({id:'builtin-'+kind,name:d.name,recipe:{...createVisualEffects(),layers:[makeVisualEffectLayerForTarget(kind,'effect')]},assets:{},builtin:kind}));
const identity=workspace=>JSON.stringify([workspace?.getState?.().connectionId,workspace?.getState?.().connected,workspace?.getState?.().assetsPath]);
const uniqueName=(name,entries)=>{let next=name,n=1;while(entries.some(entry=>entry.name===next)){const suffix=' ('+(++n)+')';next=Array.from(name).slice(0,120-suffix.length).join('')+suffix;}return next;};
const decoration=(recipe,settings)=>({id:newId(),type:'effect',binding:null,rect:{x:settings.cardWidthMm*.06,y:settings.cardHeightMm*.16,w:settings.cardWidthMm*.88,h:settings.cardHeightMm*.48},style:{visualEffects:recipe}});

export function createParticleLibraryControls(ctx,{workspace}={}){
 const storage=createParticleLibraryStorage({workspace});let library=createParticleLibrary(),loaded=false,signature,queue=Promise.resolve(),disposed=false;
 const listeners=new Set(),notify=()=>{for(const fn of listeners)fn();};
 const stop=storage.subscribe(notify);
 async function ensure(){if(disposed)throw Error('파티클 보관함이 닫혔어요.');const current=identity(workspace);if(!loaded||signature!==current){library=await storage.load();signature=current;loaded=true;}return library;}
 function transact(change){const operation=queue.then(async()=>{await ensure();const next=parseParticleLibrary(serializeParticleLibrary(change(structuredClone(library))));library=next;notify();const saved=await storage.save(next);library=saved;notify();return saved;});queue=operation.catch(()=>{});return operation;}
 async function save(name,recipe,assets,id=null){
  const entry=createParticleEntry(name,recipe,assets);
  await transact(next=>{if(id){if(!next.entries.some(item=>item.id===id))throw Error('수정할 파티클이 사라졌어요. 새 자료로 저장하세요.');entry.id=id;next.entries=next.entries.map(item=>item.id===id?entry:item);}else{entry.name=uniqueName(entry.name,next.entries);next.entries.push(entry);}return next;});return entry;
 }
 function mount({onClose}){
  let active=true,busy=false,selected=null,childEditor=null,version=0;
  const node=el('section',{id:'library-particles',class:'library-particles',hidden:true,'aria-label':'파티클 보관함'});
  const status=el('p',{id:'particle-status',class:'hint',role:'status'}),feedback=el('p',{id:'particle-feedback',class:'asset-feedback',role:'status'}),list=el('div',{id:'particle-list',class:'particle-list'}),details=el('section',{class:'particle-details'});
  const search=el('input',{id:'particle-search',type:'search',placeholder:'파티클 이름 검색','aria-label':'파티클 검색',oninput:()=>renderList()});
  const file=el('input',{id:'particle-library-file',type:'file',hidden:true,accept:'.json,application/json',onchange:event=>{
   const chosen=event.target.files[0];event.target.value='';if(!chosen)return;
   void action(async()=>{if(chosen.size>96*1024*1024)throw Error('파티클 JSON은 96 MB 이하로 나누세요.');const imported=parseParticleLibrary(await chosen.text());if(!active)return;
    await transact(next=>{for(const entry of imported.entries){entry.id='particle-'+newId();entry.name=uniqueName(entry.name,next.entries);next.entries.push(entry);}return next;});feedback.textContent=imported.entries.length+'개를 가져왔어요.';});
  }});
  async function action(fn){if(busy||!active)return;busy=true;feedback.textContent='';renderDetails();try{await fn();}catch(error){if(active)feedback.textContent=error.message;}finally{busy=false;if(active)render();}}
  const current=()=>library.entries.find(entry=>entry.id===selected)||builtins.find(entry=>entry.id===selected);
  function renderList(){
   if(!active)return;const query=search.value.normalize('NFC').toLocaleLowerCase();list.replaceChildren();
   for(const [label,entries] of [['내 파티클',library.entries],['시작 프리셋',builtins]]){
    list.append(el('h3',{},label));for(const entry of entries.filter(entry=>entry.name.toLocaleLowerCase().includes(query))){
     const asset=Object.values(entry.assets)[0],kind=entry.recipe.layers.find(layer=>VISUAL_EFFECT_CATALOG[layer.kind]?.generative)?.kind;
     list.append(button([el('span',{class:'particle-thumbnail'},asset?el('img',{src:asset.dataUrl,alt:'',loading:'lazy'}):el('span',{'aria-hidden':'true'},({flame:'🔥',smoke:'☁',snowflake:'❄',starlight:'✦',sprite:'✧',petal:'✿',ripple:'◎'})[kind]||'✦')),el('strong',{},entry.name),el('small',{},entry.recipe.layers.filter(layer=>VISUAL_EFFECT_CATALOG[layer.kind]?.generative).length+' 이미터')],()=>{selected=entry.id;render();},{class:'particle-entry'+(selected===entry.id?' selected':''),...(entry.builtin?{'data-particle-builtin':entry.builtin}:{'data-particle-entry':entry.id}),'aria-pressed':selected===entry.id}));
    }
   }
  }
  async function preview(entry,canvas){
   const revision=++version;try{const assets=await loadAssets({assets:entry.assets,paintings:{}});if(!active||revision!==version)return;
    const surface=makeSurface({x:0,y:0,w:50,h:32},120),cache=createEffectCache();surface.ctx.fillStyle='#101d2d';surface.ctx.fillRect(0,0,50,32);
    const target=particleRecipeTarget(entry.recipe),source=target==='text'?{key:entry.id,draw:c=>{c.font='700 7px CardStudio,sans-serif';c.fillStyle='#e4f3ff';c.fillText('파티클',10,23);return {fontPt:19.84};}}:undefined;
    try{renderVisualEffects(surface.ctx,{recipe:particleRecipeForTarget(entry.recipe,target),target,assets,dpi:120,rect:{x:9,y:10,w:32,h:16},timeSec:1.2,source,cache});canvas.width=surface.canvas.width;canvas.height=surface.canvas.height;canvas.getContext('2d').drawImage(surface.canvas,0,0);canvas.dataset.ready='true';}finally{cache.clear();}
   }catch(error){if(active&&revision===version)feedback.textContent=error.message;}
  }
  function renderDetails(){
   if(!active)return;const entry=current();details.replaceChildren();if(!entry){details.append(el('p',{class:'empty-note'},'시작 프리셋이나 내 파티클을 선택하세요. 그림과 여러 컷 재생 설정도 함께 보관돼요.'));return;}
   const canvas=el('canvas',{id:'particle-preview','aria-label':entry.name+' 정지 미리보기'});details.append(el('h3',{},entry.name),canvas);
   const name=el('input',{id:'particle-name',value:entry.name,maxLength:120,'aria-label':'파티클 이름'});
   const textOnly=particleRecipeTarget(entry.recipe)==='text',destinations=textOnly?[['name','카드 제목'],['selected','선택한 글자']]:[['decoration','새 독립 장식'],['selected','선택한 글자·그림'],['name','카드 제목'],['frame','카드 프레임']];
   const destination=field('적용 위치','particle-destination',textOnly?'name':'decoration',()=>{},{options:destinations});
   details.append(name,el('div',{class:'asset-action-row'},button('편집',()=>{void action(()=>edit(entry));},{id:'particle-edit',disabled:busy}),button('복제',()=>{void action(async()=>{const copy=await save(name.value+' 사본',entry.recipe,entry.assets);selected=copy.id;});},{id:'particle-duplicate',disabled:busy}),!entry.builtin?button('이름 저장',()=>{void action(()=>save(name.value,entry.recipe,entry.assets,entry.id));},{id:'particle-rename',disabled:busy}):null),destination,
    button('대상에 적용',()=>{const mode=details.querySelector('#particle-destination').value;void action(()=>apply(entry,mode));},{id:'particle-use',class:'primary wide',disabled:busy}),
    button('이 파티클 JSON 저장',()=>download(serializeParticleLibrary({...createParticleLibrary(),entries:[createParticleEntry(name.value,entry.recipe,entry.assets)]}),'particle.json','application/json'),{id:'particle-export',disabled:busy}),
    ...(!entry.builtin?[button('삭제',()=>{void action(async()=>{const answer=await openDialog({title:'파티클을 삭제할까요?',message:entry.name+'을 보관함에서 지워요. 카드에 적용한 조합은 유지돼요.',choices:[{id:'delete',label:'삭제'},{id:'cancel',label:'취소'}]});if(!active||answer!=='delete')return;await transact(next=>({...next,entries:next.entries.filter(item=>item.id!==entry.id)}));selected=null;});},{id:'particle-delete',class:'danger',disabled:busy})]:[]));
   void preview(entry,canvas);
  }
  function render(){if(!active)return;const value=storage.getState();status.textContent=(value.location||'브라우저 보관함')+' · '+library.entries.length+'개'+(value.pending?' · 저장 재시도 필요':'');if(value.message&&value.mode==='error')feedback.textContent=value.message;renderList();renderDetails();}
  async function edit(entry){
   const copy=instantiateParticle(entry),project=createProject(),card=project.cards[0],kind=particleRecipeTarget(copy.recipe);
   const element=kind==='text'?{id:newId(),type:'text',binding:null,content:'파티클',rect:{x:8,y:24,w:project.settings.cardWidthMm-16,h:18},style:{fontPt:18,fontWeight:700,color:'#253d32',align:'center',visualEffects:particleRecipeForTarget(copy.recipe,'text')}}:decoration(copy.recipe,project.settings);
   card.elements=kind==='frame'?[]:[element];if(kind==='frame')card.visualEffects=copy.recipe;
   card.autoSkillLayout=false;card.template='custom';project.assets=copy.assets;
   const assets=await loadAssets(project);if(!active)return;
   const child={...ctx,store:createStore(project),assets,cloudAccount:null,shareAsset:undefined,onEffectsClosed:()=>{childEditor=null;if(active)render();}};
   childEditor=openVisualEffectsEditor(child,{cardId:card.id,elementId:kind==='frame'?null:element.id},{initialName:entry.builtin?entry.name+' 조합':entry.name,applyLabel:'파티클 보관함에 저장',onApply:async value=>{if(!active)throw Error('보관함을 다시 열어 저장하세요.');const saved=await save(value.name,value.recipe,value.assets,entry.builtin?null:entry.id);if(active){selected=saved.id;render();}}});
  }
  function apply(entry,mode){
   const copy=instantiateParticle(entry),project=ctx.store.getProject(),card=ctx.target();if(!card)throw Error('먼저 사용할 카드를 선택하세요.');
   const chosen=mode==='selected'?card.elements.find(item=>item.id===ctx.state.selectedElementId):mode==='name'?card.elements.find(item=>item.binding?.field==='name'):null;
   if(['selected','name'].includes(mode)&&!chosen)throw Error(mode==='selected'?'효과를 붙일 글자나 그림을 먼저 선택하세요.':'이 카드에 제목 요소가 없어요.');
   if(chosen&&!['text','image','effect'].includes(chosen.type))throw Error('글자·그림·독립 장식을 선택하세요.');
   if(mode==='frame'&&ctx.state.back)throw Error('뒷면은 프레임 대신 독립 장식으로 추가하세요.');
   const target={cardId:card.id,back:ctx.state.back,elementId:chosen?.id||null},recipe=particleRecipeForTarget(copy.recipe,mode==='frame'?'frame':chosen?.type||'effect'),element=decoration(recipe,project.settings);
   const result=ctx.store.edit('보관함 파티클 적용',draft=>{Object.assign(draft.assets,copy.assets);const owner=target.back?draft.back:draft.cards.find(item=>item.id===target.cardId);if(mode==='decoration'){owner.elements.push(element);if(owner.kind)owner.template='custom';}else writeTargetEffects(draft,target,recipe);});
   if(result===false)throw Error('현재 자료는 보기 전용이에요. 편집할 사본을 만든 뒤 적용하세요.');
   if(mode==='decoration'){ctx.state.selectedElementId=element.id;ctx.state.selectedElementIds=[element.id];}onClose();ctx.refresh?.();
  }
  node.append(el('div',{class:'asset-library-toolbar'},button('새 파티클 만들기',()=>{void action(()=>edit(builtins.find(entry=>entry.builtin==='sprite')));},{id:'particle-new',class:'primary'}),button('JSON 가져오기',()=>file.click(),{id:'particle-import'}),button('보관함 JSON 저장',()=>download(serializeParticleLibrary(library),'particle-library.json','application/json'),{id:'particle-export-all'}),button('저장 재시도',()=>{void action(()=>transact(next=>next));},{id:'particle-retry'}),button('다시 불러오기',()=>{void action(async()=>{if(storage.getState().pending){const answer=await openDialog({title:'저장하지 못한 파티클 변경을 버릴까요?',message:'먼저 JSON으로 보관할 수 있어요. 저장된 목록으로 돌아갑니다.',choices:[{id:'reload',label:'다시 불러오기'},{id:'cancel',label:'취소'}]});if(!active||answer!=='reload')return;}library=await storage.load({discardPending:true});loaded=true;signature=identity(workspace);});},{id:'particle-reload'})),status,search,el('div',{class:'particle-library-grid'},list,details),feedback,file);
  listeners.add(render);render();
  return {node,isEditing:()=>!!childEditor,activate(){void ensure().then(()=>{if(active)render();}).catch(error=>{if(active)feedback.textContent=error.message;});},destroy(){active=false;version++;listeners.delete(render);void childEditor?.({force:true});node.remove();}};
 }
 return {mount,save,destroy(){disposed=true;stop();listeners.clear();storage.destroy();}};
}
