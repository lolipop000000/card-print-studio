import {el,button,field,preserveFocus} from './dom.js';
import {addKeyword,updateKeyword,removeKeyword,keywordUseCount,linkKeyword,insertKeywordText,inlineDisplay} from '../model/keywords.js';
import {syncSkillElements} from '../render/templates.js';
import {materializeSkillEffect,hasPlainSkillText} from '../model/skill-references.js';
import {importAsset} from '../model/assets.js';
import {openDialog} from './dialogs.js';
const reflow=project=>{project.cards=project.cards.map(c=>syncSkillElements(c,project.settings,project.keywords||[]));};
function keywordMark(project,keyword){
 const asset=project.assets[keyword.iconAssetId];
 return el('span',{class:'keyword-mark',style:'--keyword-color:'+keyword.color},
  asset?el('img',{src:asset.dataUrl,alt:'',class:'keyword-small-icon'}):null,
  el('span',{},keyword.name));
}
export function openKeywordManager(ctx){
 if(document.getElementById('keyword-editor'))return;
 const dialog=el('dialog',{id:'keyword-editor',class:'keyword-dialog','aria-labelledby':'keyword-title'});
 let selected=ctx.store.getProject().keywords?.[0]?.id,disposed=false;
 const feedback=el('p',{class:'keyword-feedback',role:'alert',hidden:true});
 const list=el('div',{class:'keyword-library'}),editor=el('div',{class:'keyword-fields'});
 let unsubscribe;
 const close=()=>{if(disposed)return;disposed=true;unsubscribe?.();dialog.close();dialog.remove();};
 const edit=(label,change)=>{try{ctx.store.edit(label,p=>{change(p);reflow(p);});feedback.hidden=true;}catch(e){feedback.textContent=e.message;feedback.hidden=false;render();}};
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
   const asset=p.assets[keyword.iconAssetId];
   editor.append(el('section',{class:'keyword-icon-section'},
    el('h3',{},'아이콘'),
    asset?el('img',{id:'keyword-icon-preview',src:asset.dataUrl,alt:keyword.name+' 아이콘'}):el('p',{class:'hint'},'아이콘 없이 이름과 색만 사용해도 돼요.'),
    el('div',{class:'two-fields'},button(asset?'아이콘 교체':'아이콘 가져오기',()=>{selected=keyword.id;iconFile.click();}),button('아이콘 지우기',()=>change('iconAssetId',null),{disabled:!asset}))));
   const uses=keywordUseCount(p,keyword.id);
   editor.append(el('p',{class:'hint'},'사용 중 '+uses+'곳 · 이름을 바꾸면 연결된 본문과 배지가 함께 바뀌어요.'),
    button('삭제',async()=>{
     const choice=await openDialog({title:'키워드를 삭제할까요?',message:uses+'곳의 키워드 연결과 표시를 해제해요. 작성한 효과 글은 남습니다.',choices:[{id:'delete',label:'키워드 삭제'},{id:'cancel',label:'취소'}]});
     if(choice==='delete')edit('키워드 삭제',p=>removeKeyword(p,keyword.id));
    },{id:'keyword-delete',class:'danger wide'}));
  });
 }
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 document.body.append(dialog);unsubscribe=ctx.store.subscribe(render);render();dialog.showModal();
 return close;
}
export function keywordControls(ctx,target,change,effectInputId){
 const p=ctx.store.getProject(),library=p.keywords||[];
 const host=el('div',{class:'skill-keywords'},el('p',{class:'keyword-label'},'키워드'));
 if(!library.length){host.append(button('키워드 만들기',()=>ctx.openKeywords(),{class:'wide subtle'}));return host;}
 const picker=el('select',{id:'keyword-picker-'+target.id,class:'skill-keyword-picker','aria-label':'추가할 키워드'},
  el('option',{value:''},'키워드 선택'),...library.map(k=>el('option',{value:k.id},k.name)));
 const inline=button('본문에 넣기',()=>add('inline'),{class:'keyword-add-inline',disabled:true});
 const badge=button('배지 추가',()=>add('badge'),{class:'keyword-add-badge',disabled:true});
 picker.addEventListener('change',()=>{inline.disabled=badge.disabled=!picker.value;});
 function add(display){
  const keyword=library.find(k=>k.id===picker.value);if(!keyword)return;
  const input=document.getElementById(effectInputId),start=input?.selectionStart??target.effect.length,end=input?.selectionEnd??start;
  let caret;change(t=>{if(display==='inline')materializeSkillEffect(ctx.card(),t);linkKeyword(t,keyword.id,display);if(display==='inline')caret=insertKeywordText(t,keyword,start,end);});
  if(caret!==undefined){const next=document.getElementById(effectInputId);next?.focus({preventScroll:true});next?.setSelectionRange(caret,caret);}
 }
 host.append(picker,el('div',{class:'two-fields'},inline,badge));
 for(const ref of target.keywords||[]){
  const keyword=library.find(k=>k.id===ref.keywordId);if(!keyword)continue;
  host.append(el('div',{class:'keyword-reference'},
   el('div',{class:'keyword-reference-top'},keywordMark(p,keyword),
    button('×',()=>change(t=>t.keywords=t.keywords.filter(r=>r.keywordId!==ref.keywordId)),{'aria-label':keyword.name+' 연결 해제',title:'연결 해제 · 본문 글은 유지'})),
   field('카드 표시','keyword-display-'+target.id+'-'+ref.keywordId,ref.display,v=>change(t=>{
    const found=t.keywords.find(r=>r.keywordId===ref.keywordId);found.display=v;
    if(inlineDisplay(found)&&!hasPlainSkillText(t,keyword.name)){materializeSkillEffect(ctx.card(),t);insertKeywordText(t,keyword);}
   }),{class:'keyword-display',options:[['inline','본문 강조'],['badge','배지'],['both','본문 강조 + 배지']]}),
   keyword.description?el('p',{class:'keyword-definition'},keyword.description):null));
 }
 return host;
}
