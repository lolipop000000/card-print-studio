import {saveCardTemplate,applyCardTemplate,renameCardTemplate,removeCardTemplate,cardTemplateNameKey} from '../model/card-templates.js';
import {loadAssets} from '../model/assets.js';
import {el,button,field,showMessage,typing} from './dom.js';
import {openDialog} from './dialogs.js';

/** The editor inserts button, refreshes after selection changes, and destroys on disposal. */
export function createCardTemplateControls(ctx){
 const {store}=ctx;let dialog=null,pendingPrompt=null,closeDialog=null,disposed=false,busy=false;
 const launch=button('내 카드 서식',open,{id:'card-templates',title:'현재 카드의 배치·글자·이펙트·장식을 서식으로 보관해요.'});
 const unsubscribe=store.subscribe(updateButton);updateButton();
 function updateButton(){launch.disabled=disposed||!!ctx.state?.back||!ctx.card();}
 function error(message){const feedback=dialog?.querySelector('#card-template-feedback');if(feedback){feedback.textContent=message;feedback.dataset.kind='error';}else showMessage(message);}
 function status(message){const feedback=dialog?.querySelector('#card-template-feedback');if(feedback){feedback.textContent=message;feedback.dataset.kind='success';}}
 function setBusy(value){busy=value;if(dialog)for(const node of dialog.querySelectorAll('button,input,select'))node.disabled=value||node.dataset.unavailable==='true';}
 async function duplicate(name,matches){
  let selected=0;
  const action=await openDialog({title:'같은 이름의 카드 서식이 있어요',message:'“'+name+'” 서식이 '+matches.length+'개 있어요. 덮어쓸 하나를 고르거나 같은 이름으로 추가할 수 있어요.',
   choices:[{id:'overwrite',label:'덮어쓰기'},{id:'add',label:'추가'},{id:'cancel',label:'취소'}],onOpen:prompt=>{
    pendingPrompt=prompt;prompt.id='card-template-duplicate-dialog';prompt.insertBefore(field('덮어쓸 서식','card-template-duplicate-target','0',value=>{selected=Number(value);},{options:matches.map((saved,index)=>[String(index),(index+1)+' · '+saved.name+' · '+(saved.kind==='monster'?'몬스터':'아이템')])}),prompt.lastChild);
   }});pendingPrompt=null;return {action:disposed?'cancel':action,id:matches[selected]?.id};
 }
 async function open(){
  if(disposed||dialog)return;if(typing(document.activeElement))document.activeElement.blur();const selected=ctx.card();if(!selected||ctx.state?.back){updateButton();return;}
  const targetId=selected.id,panel=el('dialog',{id:'card-template-dialog',class:'card-template-dialog','aria-labelledby':'card-template-title'}),list=el('div',{id:'card-template-list',class:'card-template-list'}),feedback=el('p',{id:'card-template-feedback',class:'card-template-feedback',role:'status'});
  dialog=panel;let stopUpdates;
  const name=el('input',{id:'card-template-name',type:'text',maxLength:120,value:selected.name+' 서식',placeholder:'예: 푸른 파도 몬스터',onkeydown:event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();save();}}});
  const heading=el('p',{class:'card-template-target'});
  const close=()=>{
   if(panel!==dialog)return;pendingPrompt?.dispatchEvent(new Event('cancel',{cancelable:true}));stopUpdates?.();if(panel.open)panel.close();panel.remove();dialog=null;closeDialog=null;busy=false;ctx.refresh?.();updateButton();
  };
  function active(){return !disposed&&dialog===panel&&panel.open;}
  function current(){return store.getProject().cards.find(card=>card.id===targetId);}
  function refresh(){
   if(!active())return;const card=current();if(!card){close();return;}
   heading.textContent='적용 대상: '+card.name+(card.variant?' · '+card.variant.label:'');list.replaceChildren();
   const saved=store.getProject().cardTemplates||[];
   if(!saved.length)list.append(el('p',{class:'hint card-template-empty'},'저장한 서식이 없어요. 현재 카드의 디자인에 이름을 붙여 보관하세요.'));
   for(const preset of saved){
    const compatible=preset.kind===card.kind;
    const applyButton=button('적용',()=>apply(preset.id),{'data-action':'apply',class:'primary',disabled:busy||!compatible,'data-unavailable':String(!compatible),'aria-label':preset.name+' 서식 적용',title:compatible?'현재 카드에 디자인을 적용해요.':'같은 종류의 카드에 적용할 수 있어요.'});
    list.append(el('div',{class:'card-template-row','data-template-id':preset.id},
     el('div',{class:'card-template-summary'},el('strong',{},preset.name),el('small',{},(preset.kind==='monster'?'몬스터':'아이템')+' · '+preset.recipe.widthMm+' × '+preset.recipe.heightMm+' mm · '+(preset.recipe.autoSkillLayout?'기술 자동 맞춤':'수동 배치'))),
     el('div',{class:'card-template-actions'},applyButton,button('이름 변경',()=>rename(preset.id),{'data-action':'rename',disabled:busy,'aria-label':preset.name+' 서식 이름 변경'}),button('삭제',()=>remove(preset.id),{'data-action':'delete',class:'danger',disabled:busy,'aria-label':preset.name+' 서식 삭제'}))));
   }
  }
  async function save(){
   if(busy||!active())return;const before=store.getProject(),card=current(),value=cardTemplateNameKey(name.value);if(!card)return close();
   setBusy(true);
   try{
    const matches=(before.cardTemplates||[]).filter(saved=>cardTemplateNameKey(saved.name)===value);let choice={action:'add'};
    if(matches.length)choice=await duplicate(value,matches);
    if(!active()||choice.action==='cancel')return;
    if(store.getProject()!==before)throw Error('이름을 고르는 동안 덱이 바뀌었어요. 현재 카드를 확인하고 다시 저장하세요.');
    store.edit('내 카드 서식 저장',draft=>saveCardTemplate(draft,card.id,name.value,{replaceTemplateId:choice.action==='overwrite'?choice.id:null,allowDuplicate:choice.action==='add'}));
    status(choice.action==='overwrite'?'선택한 서식을 덮어썼어요.':'현재 카드 디자인을 서식으로 저장했어요.');
   }catch(cause){error(cause.message);}finally{if(active()){setBusy(false);refresh();}}
  }
  async function apply(templateId){
   if(busy||!active())return;setBusy(true);
   try{
    const before=store.getProject(),preset=before.cardTemplates?.find(saved=>saved.id===templateId);if(!preset)throw Error('적용할 카드 서식이 없어졌어요.');
    await loadAssets(preset);if(!active())return;
    if(store.getProject()!==before)throw Error('서식을 읽는 동안 덱이 바뀌었어요. 다시 적용하세요.');
    store.edit('카드 서식 적용',draft=>applyCardTemplate(draft,targetId,templateId));
    if(ctx.state){ctx.state.selectedElementId=null;ctx.state.selectedElementIds=[];}
    ctx.refresh?.();status('서식을 적용했어요. 카드 이름·내용·대표 그림과 Variant 연결은 유지돼요. 실행 취소로 되돌릴 수 있어요.');
   }catch(cause){error(cause.message);}finally{if(active()){setBusy(false);refresh();}}
  }
  async function rename(templateId){
   if(busy||!active())return;const before=store.getProject(),preset=before.cardTemplates?.find(saved=>saved.id===templateId);if(!preset)return;setBusy(true);let input;
   try{
    const action=await openDialog({title:'서식 이름 변경',message:'카드와 디자인은 그대로 두고 서식 이름을 바꿔요.',choices:[{id:'rename',label:'이름 변경'},{id:'cancel',label:'취소'}],onOpen:prompt=>{
     pendingPrompt=prompt;prompt.id='card-template-rename-dialog';const wrapper=field('새 서식 이름','card-template-rename-name',preset.name,()=>{},{maxLength:120});input=wrapper.querySelector('input');prompt.insertBefore(wrapper,prompt.lastChild);input.focus();input.select();
    }});pendingPrompt=null;if(!active()||action!=='rename')return;
    const value=cardTemplateNameKey(input.value),matches=(before.cardTemplates||[]).filter(saved=>saved.id!==templateId&&cardTemplateNameKey(saved.name)===value);let choice={action:'add'};
    if(matches.length)choice=await duplicate(value,matches);
    if(!active()||choice.action==='cancel')return;
    if(store.getProject()!==before)throw Error('이름을 바꾸는 동안 덱이 바뀌었어요. 서식을 확인하고 다시 시도하세요.');
    store.edit('카드 서식 이름 변경',draft=>renameCardTemplate(draft,templateId,value,{replaceTemplateId:choice.action==='overwrite'?choice.id:null,allowDuplicate:choice.action==='add'}));status('서식 이름을 바꿨어요.');
   }catch(cause){error(cause.message);}finally{if(active()){setBusy(false);refresh();}}
  }
  function remove(templateId){
   if(busy||!active())return;
   try{store.edit('카드 서식 삭제',draft=>removeCardTemplate(draft,templateId));status('서식을 삭제했어요. 실행 취소로 복원할 수 있어요.');}catch(cause){error(cause.message);}
  }
  panel.append(el('h2',{id:'card-template-title'},'내 카드 서식'),heading,
   el('p',{class:'hint'},'배치·글자·프레임 이펙트·장식만 저장해 다른 카드에 적용해요. 이름·HP·스킬 내용·대표 그림·속성·수량은 대상 카드의 값을 유지해요. 같은 종류의 카드에 적용할 수 있고 프로젝트와 함께 보관돼요.'),
   el('div',{class:'card-template-save'},el('label',{class:'field',htmlFor:name.id},el('span',{},'서식 이름'),name),button('현재 카드 서식 저장',save,{id:'card-template-save',class:'primary'})),
   list,feedback,el('div',{class:'dialog-actions'},button('닫기',close,{id:'card-template-close'})));
  panel.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close();});panel.addEventListener('close',()=>{if(dialog===panel)close();});
  closeDialog=close;document.body.append(panel);panel.showModal();stopUpdates=store.subscribe(refresh);refresh();ctx.refresh?.();name.focus();name.select();
 }
 return {button:launch,refresh:updateButton,destroy(){disposed=true;unsubscribe();pendingPrompt?.dispatchEvent(new Event('cancel',{cancelable:true}));closeDialog?.();updateButton();}};
}
