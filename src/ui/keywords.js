import {el,button,field,preserveFocus} from './dom.js';
import {addKeyword,updateKeyword,removeKeyword,keywordUseCount,linkKeyword,insertKeywordText,inlineDisplay,selectedKeywords} from '../model/keywords.js';
import {syncSkillElements} from '../render/templates.js';
import {materializeSkillEffect,hasPlainSkillText,resolveSkillEffect,editSkillEffect} from '../model/skill-references.js';
import {editText} from '../model/text-ranges.js';
import {importAsset} from '../model/assets.js';
import {newId} from '../model/types.js';
import {openDialog} from './dialogs.js';
const reflow=project=>{project.cards=project.cards.map(c=>syncSkillElements(c,project.settings,project.keywords||[]));};
const editorStates=new WeakMap();
const inputBindings=new WeakMap();
function keywordState(ctx,target,field,text){
 let states=editorStates.get(ctx.store);if(!states)editorStates.set(ctx.store,states=new Map());
 const key=(ctx.store.getDocumentId?.()||'')+':'+target.id+':'+field;
 let state=states.get(key);if(!state)states.set(key,state={keywordId:'',range:null,composing:false});
 if(state.range?.text!==text)state.range=null;
 return state;
}
function keywordMark(project,keyword){
 const asset=project.assets[keyword.iconAssetId];
 return el('span',{class:'keyword-mark',style:'--keyword-color:'+keyword.color},
  asset?el('img',{src:asset.dataUrl,alt:'',class:'keyword-small-icon'}):null,
  el('span',{},keyword.name));
}
export function openKeywordManager(ctx){
 if(document.getElementById('keyword-editor'))return;
 const dialog=el('dialog',{id:'keyword-editor',class:'keyword-dialog','aria-labelledby':'keyword-title'});
 let selected=ctx.store.getProject().keywords?.[0]?.id,disposed=false,pendingIcon=false;
 const feedback=el('p',{class:'keyword-feedback',role:'alert',hidden:true});
 const list=el('div',{class:'keyword-library'}),editor=el('div',{class:'keyword-fields'});
 let unsubscribe;
 const close=()=>{if(disposed)return;disposed=true;unsubscribe?.();dialog.close();dialog.remove();};
 const edit=(label,change)=>{try{ctx.store.edit(label,p=>{change(p);reflow(p);});feedback.hidden=true;}catch(e){feedback.textContent=e.message;feedback.hidden=false;render();}};
 async function chooseLibraryIcon(keywordId){
  if(pendingIcon||disposed||!ctx.openAssetLibrary)return;
  const documentId=ctx.store.getDocumentId();pendingIcon=true;render();
  try{
   const picked=await ctx.openAssetLibrary({pick:true,title:'키워드 아이콘 선택'});
   if(!picked||disposed)return;
   if(ctx.store.getDocumentId()!==documentId||!ctx.store.getProject().keywords?.some(k=>k.id===keywordId))return;
   const asset={id:newId(),mime:picked.mime,dataUrl:picked.dataUrl,width:picked.width,height:picked.height,paintingId:null};
   edit('키워드 아이콘',p=>{updateKeyword(p,keywordId,{iconAssetId:asset.id});p.assets[asset.id]=asset;});
  }catch(error){if(!disposed){feedback.textContent=error.message;feedback.hidden=false;}}
  finally{pendingIcon=false;if(!disposed)render();}
 }
 const iconFile=el('input',{id:'keyword-icon-file',type:'file',accept:'image/png,image/jpeg,image/webp',hidden:true,onchange:async event=>{
  const file=event.target.files[0],id=selected;event.target.value='';if(!file)return;
  try{const asset=await importAsset(file);edit('키워드 아이콘',p=>{updateKeyword(p,id,{iconAssetId:asset.id});p.assets[asset.id]=asset;});}
  catch(e){feedback.textContent=e.message;feedback.hidden=false;}
 }});
 dialog.append(el('header',{class:'keyword-top'},el('div',{},el('h2',{id:'keyword-title'},'키워드 관리'),el('p',{class:'hint'},'이름·설명·색·직접 그린 아이콘을 여러 카드에서 함께 사용해요.')),
  button('닫기',close,{id:'keyword-close'})),el('div',{class:'keyword-grid'},list,editor),feedback,iconFile);
 function render(){
  preserveFocus(()=>{
   const p=ctx.store.getProject(),keywords=p.keywords||[];
   if(!keywords.some(k=>k.id===selected))selected=keywords[0]?.id;
   list.replaceChildren(button('+ 키워드 추가',()=>edit('키워드 추가',p=>selected=addKeyword(p)),{id:'keyword-add',class:'primary wide'}),
    ...keywords.map(k=>button('',()=>{selected=k.id;render();},{class:'keyword-choice'+(k.id===selected?' active':''),'aria-label':k.name+' 키워드 선택'})));
   [...list.querySelectorAll('.keyword-choice')].forEach((b,i)=>b.append(keywordMark(p,keywords[i])));
   const keyword=keywords.find(k=>k.id===selected);editor.replaceChildren();
   if(!keyword){editor.append(el('p',{class:'empty-note'},'키워드를 추가하고 카드에 넣어보세요.'));return;}
   const change=(key,value)=>edit('키워드 수정',p=>updateKeyword(p,keyword.id,{[key]:value}));
   editor.append(field('키워드 이름','keyword-name',keyword.name,v=>change('name',v)),
    field('설명','keyword-description',keyword.description,v=>change('description',v),{textarea:true}),
    field('키워드 색','keyword-color',keyword.color,v=>change('color',v),{type:'color'}));
   editor.append(button(keyword.visualEffects?.layers.length?'전용 이펙트 수정':'전용 이펙트 만들기',()=>ctx.openVisualEffects({cardId:ctx.card()?.id||p.cards[0]?.id,keywordId:keyword.id}),{id:'keyword-effects',class:'wide',disabled:!p.cards.length}),
    el('p',{class:'hint'},'이 키워드가 나오는 제목·본문·배지에 함께 적용해요. 직접 지정한 글자별 이펙트가 우선해요.'));
   if(ctx.cloudAccount?.canWrite())editor.append(button('에셋으로 공유',()=>ctx.shareAsset('keyword',keyword.id),{id:'keyword-share'}));
   const asset=p.assets[keyword.iconAssetId];
   editor.append(el('section',{class:'keyword-icon-section'},
    el('h3',{},'아이콘'),
    asset?el('img',{id:'keyword-icon-preview',src:asset.dataUrl,alt:keyword.name+' 아이콘'}):el('p',{class:'hint'},'아이콘 없이 이름과 색만 사용해도 돼요.'),
    el('div',{class:'two-fields'},button(asset?'아이콘 교체':'아이콘 가져오기',()=>{selected=keyword.id;iconFile.click();}),button('보관함에서 선택',()=>chooseLibraryIcon(keyword.id),{id:'keyword-icon-library',disabled:pendingIcon||!ctx.openAssetLibrary}),button('아이콘 지우기',()=>change('iconAssetId',null),{disabled:!asset}))));
   const uses=keywordUseCount(p,keyword.id);
   editor.append(el('p',{class:'hint'},'사용 중 '+uses+'곳 · 이름을 바꾸면 연결된 이름·본문·배지가 함께 바뀌어요.'),
    button('삭제',async()=>{
     const choice=await openDialog({title:'키워드를 삭제할까요?',message:uses+'곳의 키워드 연결과 표시를 해제해요. 작성한 이름과 효과 글은 남습니다.',choices:[{id:'delete',label:'키워드 삭제'},{id:'cancel',label:'취소'}]});
     if(choice==='delete')edit('키워드 삭제',p=>removeKeyword(p,keyword.id));
    },{id:'keyword-delete',class:'danger wide'}));
  });
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 document.body.append(dialog);unsubscribe=ctx.store.subscribe(render);render();dialog.showModal();
 return close;
}
export function keywordControls(ctx,target,change,inputId,{field:textField='effect'}={}){
 textField=textField==='name'||textField==='title'?'name':'effect';const title=textField==='name',refsKey=title?'nameKeywords':'keywords';
 const p=ctx.store.getProject(),library=p.keywords||[],text=title?target.name||'':resolveSkillEffect(ctx.card(),target).text;
 const state=keywordState(ctx,target,textField,text);
 const host=el('div',{class:'skill-keywords'+(title?' title-keywords':''),'data-keyword-field':textField},el('p',{class:'keyword-label'},title?'제목 키워드 · 자동 표시':'키워드'));
 if(title)host.append(el('p',{class:'hint'},'등록한 키워드를 제목에 직접 쓰면 색·굵기·아이콘이 자동으로 적용돼요.'));
 if(!library.length){host.append(button('키워드 만들기',()=>ctx.openKeywords(),{class:'wide subtle'}));return host;}
 if(!library.some(k=>k.id===state.keywordId))state.keywordId='';
 const picker=el('select',{id:'keyword-picker-'+(title?'name-':'')+target.id,class:title?'title-keyword-picker':'skill-keyword-picker','aria-label':title?'제목에 넣을 키워드':'추가할 키워드'},
  el('option',{value:''},'키워드 선택'),...library.map(k=>el('option',{value:k.id},k.name)));
 picker.value=state.keywordId;
 const inline=button(title?'제목에 넣기':'본문에 넣기',()=>add('inline'),{class:title?'keyword-add-title wide':'keyword-add-inline',disabled:!picker.value});
 const badge=title?null:button('배지 추가',()=>add('badge'),{class:'keyword-add-badge',disabled:!picker.value});
 picker.addEventListener('change',()=>{state.keywordId=picker.value;inline.disabled=!picker.value;if(badge)badge.disabled=!picker.value;});
 function remember(input){
  if(!input?.isConnected||state.composing||input.dataset.composing==='true')return;
  state.range={start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection,text:input.value};
 }
 // Inputs are still being assembled when these controls are created. Track the
 // completed field, keeping its selection separate from picker/button focus.
 queueMicrotask(()=>{
  const input=document.getElementById(inputId);if(!host.isConnected||!input)return;
  inputBindings.get(input)?.abort();const binding=new AbortController();inputBindings.set(input,binding);const options={signal:binding.signal};
  state.composing=input.dataset.composing==='true';
  for(const event of ['focus','blur','select','keyup','pointerup','input'])input.addEventListener(event,()=>remember(input),options);
  input.addEventListener('compositionstart',()=>{state.composing=true;},options);
  input.addEventListener('compositionend',()=>{state.composing=false;remember(input);},options);
  if(document.activeElement===input)remember(input);
  else if(state.range?.text===input.value)input.setSelectionRange(state.range.start,state.range.end,state.range.direction);
 });
 host.addEventListener('pointerdown',()=>{const input=document.getElementById(inputId);if(document.activeElement===input)remember(input);},{capture:true});
 function add(display){
  const keyword=library.find(k=>k.id===picker.value);if(!keyword)return;
  const input=document.getElementById(inputId);if(state.composing||input?.dataset.composing==='true')return;
  const value=input?.value??text,range=state.range?.text===value?state.range:null,start=range?.start??input?.selectionStart??value.length,end=range?.end??input?.selectionEnd??start;
  let caret;change((t,current)=>{
   if(display==='inline'){
    if(title){if(t.name!==value)editText(t,'name',value);}
    else {materializeSkillEffect(current??ctx.card(),t);if(t.effect!==value)editSkillEffect(current??ctx.card(),t,value);}
   }
   linkKeyword(t,keyword.id,display,textField);
   if(display==='inline'){caret=insertKeywordText(t,keyword,start,end,textField);state.range={start:caret,end:caret,direction:'none',text:t[textField]};}
  });
  if(caret!==undefined){const next=document.getElementById(inputId);next?.focus({preventScroll:true});next?.setSelectionRange(caret,caret);}
 }
 host.append(picker,title?inline:el('div',{class:'two-fields'},inline,badge));
 const references=title?selectedKeywords(p,target,'title').map(keyword=>({keywordId:keyword.id})):target[refsKey]||[];
 for(const ref of references){
  const keyword=library.find(k=>k.id===ref.keywordId);if(!keyword)continue;
  host.append(el('div',{class:'keyword-reference'},
   el('div',{class:'keyword-reference-top'},keywordMark(p,keyword),
    title?el('span',{class:'hint'},'자동 표시'):button('×',()=>change(t=>t[refsKey]=t[refsKey].filter(r=>r.keywordId!==ref.keywordId)),{'aria-label':keyword.name+' 연결 해제',title:'연결 해제 · 본문 글은 유지'})),
   title?null:field('카드 표시','keyword-display-'+target.id+'-'+ref.keywordId,ref.display,v=>change(t=>{
    const found=t.keywords.find(r=>r.keywordId===ref.keywordId);found.display=v;
    if(inlineDisplay(found)&&!hasPlainSkillText(t,keyword.name)){materializeSkillEffect(ctx.card(),t);insertKeywordText(t,keyword);}
   }),{class:'keyword-display',options:[['inline','본문 강조'],['badge','배지'],['both','본문 강조 + 배지']]}),
   keyword.description?el('p',{class:'keyword-definition'},keyword.description):null));
 }
 return host;
}
