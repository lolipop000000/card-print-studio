import {el,button} from './dom.js';
import {ATTRIBUTES,cardAttributes} from '../model/types.js';

const sessions=new WeakMap(),normalize=value=>String(value??'').normalize('NFC').toLocaleLowerCase();
const targetKey=ctx=>JSON.stringify([ctx.store.getDocumentId?.()??0,!!ctx.state.back,ctx.target()?.id??null]);
const types={text:'텍스트',image:'그림',rect:'도형',attribute:'속성',rank:'등급',dice:'주사위',keywords:'키워드',effect:'이펙트'};
function describe(element,target){
 const field=element.binding?.field,skill=[...(target.passives||[]),...(target.actives||[])].find(s=>s.id===element.binding?.skillId);
 if(field==='name')return {name:'카드 이름',detail:target.name};
 if(field==='hp')return {name:'HP',detail:String(target.baseHp-target.hpReduction)};
 if(field==='art')return {name:'카드 그림',detail:''};
 if(field?.startsWith('skill.')){
  const part={'skill.name':'이름','skill.effect':'효과','skill.dice':'주사위','skill.keywords':'키워드'}[field],kind=target.passives?.includes(skill)?'패시브':'액티브';
  return {name:kind+' · '+(skill?.name||'기술')+' · '+part,detail:field==='skill.effect'?skill?.effect:''};
 }
 if(field?.startsWith('item.'))return {name:field==='item.effect'?'아이템 효과':'아이템 키워드',detail:field==='item.effect'?target.effect:''};
 if(element.type==='attribute')return {name:'속성',detail:cardAttributes(target).map(key=>ATTRIBUTES[key].name).join(' · ')};
 if(element.type==='rank')return {name:'등급',detail:target.rank};
 return {name:element.content||types[element.type]||element.type,detail:element.content?types[element.type]:''};
}

/** Frontmost objects appear first; stored element order remains back to front. */
export function renderObjectList(host,ctx){
 const target=ctx.target();host.replaceChildren();if(!target)return;
 const key=targetKey(ctx);let session=sessions.get(ctx);
 if(!session||session.key!==key){session={key,query:'',scroll:0,drag:null};sessions.set(ctx,session);}
 const list=el('div',{id:'object-list',class:'object-list',role:'list','aria-label':'카드 요소 목록',onscroll:()=>{session.scroll=list.scrollTop;}});
 const search=el('input',{id:'object-search',type:'search',value:session.query,placeholder:'이름·내용으로 찾기',oninput:()=>{session.query=search.value;session.scroll=0;rows();}});
 const count=el('span',{class:'object-count','aria-live':'polite'});
 host.append(el('section',{class:'inspector-group object-manager'},el('h3',{},'요소 찾기'),el('label',{class:'field',htmlFor:'object-search'},el('span',{},'요소 검색'),search),el('p',{class:'hint object-hint'},'위에 있는 요소가 앞에 표시됩니다. 끌어서 순서를 바꾸세요. Shift로 여러 개 선택할 수 있어요.'),count,list,el('p',{class:'hint object-hint'},'잠그면 캔버스 클릭·드래그를 건너뜁니다. 목록에서 선택해 수정하거나 잠금을 풀 수 있어요.')));
 function edit(label,change){
  if(targetKey(ctx)!==key)return;
  ctx.editTarget(label,t=>{if(change(t)&&t.kind)t.template='custom';});
 }
 function step(id,delta){edit('요소 표시 순서',t=>{const i=t.elements.findIndex(e=>e.id===id),j=i+delta;if(i<0||j<0||j>=t.elements.length)return false;[t.elements[i],t.elements[j]]=[t.elements[j],t.elements[i]];return true;});}
 function dragValid(){return session.drag?.key===targetKey(ctx)&&session.drag.project===ctx.store.getProject();}
 function clearDrop(){for(const row of list.children)delete row.dataset.drop;}
 function rows(){
  list.replaceChildren();const current=ctx.target();if(targetKey(ctx)!==key||!current)return;
  const selected=new Set(ctx.state.selectedElementIds??[ctx.state.selectedElementId]),query=normalize(session.query).trim(),elements=[...current.elements].reverse();let shown=0;
  for(const [index,element] of elements.entries()){
   const {name,detail}=describe(element,current),label=[name,detail].filter(Boolean).join(' · ');
   if(query&&!normalize([label,element.type,element.binding?.field,element.assetId,element.id].join(' ')).includes(query))continue;shown++;
   const choose=button('',event=>{
    if(targetKey(ctx)!==key)return;
    const ids=ctx.state.selectedElementIds??[ctx.state.selectedElementId];ctx.selectElements(event.shiftKey?(ids.includes(element.id)?ids.filter(id=>id!==element.id):[...ids,element.id]):[element.id]);
   },{id:'object-select-'+element.id,class:'object-select','data-object-select':element.id,'aria-label':label+' 선택','aria-pressed':selected.has(element.id),title:label});
   choose.append(el('span',{class:'object-order','aria-hidden':'true'},String(index+1)),el('span',{class:'object-label'},el('strong',{},name),detail?el('small',{},detail):null));
   const lock=button(element.locked===true?'잠김':'잠금',()=>edit('요소 포인터 잠금',t=>{const e=t.elements.find(e=>e.id===element.id);if(!e)return false;e.locked=e.locked!==true;return true;}),{id:'object-lock-'+element.id,class:'object-lock','data-object-lock':element.id,'aria-label':name+' 포인터 잠금'+(element.locked===true?' 해제':''),'aria-pressed':element.locked===true,title:element.locked===true?'캔버스 포인터 잠금 해제':'캔버스 포인터 잠금'});
   const row=el('div',{class:'object-row',role:'listitem',draggable:true,'data-object-id':element.id,'data-selected':selected.has(element.id),'data-locked':element.locked===true,
    ondragstart:event=>{if(targetKey(ctx)!==key)return;session.drag={id:element.id,key,project:ctx.store.getProject()};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',element.id);},
    ondragover:event=>{if(!dragValid())return;event.preventDefault();event.dataTransfer.dropEffect='move';clearDrop();row.dataset.drop=event.clientY<row.getBoundingClientRect().y+row.getBoundingClientRect().height/2?'before':'after';},
    ondragleave:event=>{if(!row.contains(event.relatedTarget))delete row.dataset.drop;},
    ondrop:event=>{
     if(!dragValid())return;event.preventDefault();event.stopPropagation();const id=session.drag.id,front=event.clientY<row.getBoundingClientRect().y+row.getBoundingClientRect().height/2;session.drag=null;clearDrop();if(id===element.id)return;
     edit('요소 표시 순서',t=>{const from=t.elements.findIndex(e=>e.id===id);if(from<0||!t.elements.some(e=>e.id===element.id))return false;const [source]=t.elements.splice(from,1),to=t.elements.findIndex(e=>e.id===element.id)+(front?1:0);t.elements.splice(to,0,source);return from!==to;});
    },ondragend:()=>{session.drag=null;clearDrop();}
   },choose,el('div',{class:'object-actions'},button('↑',()=>step(element.id,1),{id:'object-forward-'+element.id,'data-object-forward':element.id,disabled:index===0,'aria-label':name+' 앞으로',title:'앞으로 (목록 위로)'}),button('↓',()=>step(element.id,-1),{id:'object-backward-'+element.id,'data-object-backward':element.id,disabled:index===elements.length-1,'aria-label':name+' 뒤로',title:'뒤로 (목록 아래로)'}),lock));
   list.append(row);
  }
  if(!shown)list.append(el('p',{class:'hint object-empty'},query?'검색에 맞는 요소가 없어요.':'아직 요소가 없어요.'));
  count.textContent=query?shown+' / '+elements.length+'개 요소':elements.length+'개 요소';list.scrollTop=session.scroll;
 }
 rows();
}
