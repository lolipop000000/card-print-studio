const fieldValues=new WeakMap();
export function el(tag,attrs={},...children){
 const node=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){
  if(v===undefined||v===null)continue;if(k.startsWith('on'))node.addEventListener(k.slice(2),v);
  else if(k==='class')node.className=v;else if(k==='text')node.textContent=v;
  else if(k in node&&!k.startsWith('aria-'))node[k]=v;else node.setAttribute(k,String(v));
 }for(const child of children.flat())if(child!==null&&child!==undefined)node.append(typeof child==='string'?document.createTextNode(child):child);return node;
}
export const button=(text,action,attrs={})=>el('button',{type:'button',onclick:action,...attrs},text);
export function field(label,id,value,action,{type='text',min,max,step,options,textarea=false,...rest}={}){
 let input;if(options){input=el('select',{id,onchange:()=>action(input.value),...rest},options.map(([v,name])=>el('option',{value:v},name)));input.value=value;}
 else if(textarea){
  let composing=false,lastValue=String(value??''),timer;
  const commit=()=>{clearTimeout(timer);if(composing||!input.isConnected||input.value===lastValue)return;lastValue=input.value;action(lastValue);};
  input=el('textarea',{id,value,rows:3,oncompositionstart:()=>{composing=true;input.dataset.composing='true';clearTimeout(timer);},
   oncompositionend:()=>{composing=false;delete input.dataset.composing;timer=setTimeout(commit,0);},
   oninput:event=>{if(!event.isComposing)commit();},onchange:commit,...rest});
 }else{
  input=el('input',{id,type,value,min,max,step,onchange:()=>{if(type==='text')fieldValues.set(input,input.value);action(type==='number'?(input.value===''?null:Number(input.value)):input.value);},...rest});
  if(type==='text')fieldValues.set(input,String(value??''));
 }
 return el('label',{class:'field',htmlFor:id},el('span',{},label),input);
}
export function showMessage(message,kind='error'){const host=document.getElementById('message');if(!host)return;host.hidden=false;host.dataset.kind=kind;host.querySelector('span').textContent=message;}
export function preserveFocus(render){const active=document.activeElement,id=active?.id,start=active?.selectionStart,end=active?.selectionEnd;render();if(id){const next=document.getElementById(id);if(next&&next!==active){next.focus({preventScroll:true});try{if(start!==null&&start!==undefined)next.setSelectionRange(start,end);}catch{}}}}
/** Keep the focused field AND its ancestor chain connected, so mobile IMEs stay attached. */
export function replaceChildrenKeepingInput(host,next,active){
 const input=active?.matches?.('textarea,input[type="text"],input:not([type])')&&active.id&&[...next.querySelectorAll('input,textarea')].find(node=>node.id===active.id&&node.tagName===active.tagName&&node.type===active.type);
 if(!host.contains(active)||!input||(input.value!==active.value&&input.value!==fieldValues.get(active)&&active.dataset.composing!=='true')){host.replaceChildren(...next.childNodes);return;}
 const chain=(node,root)=>{const result=[];for(;node&&node!==root;node=node.parentNode)result.unshift(node);return [root,...result];};
 const before=chain(active,host),after=chain(input,next);
 if(before.length!==after.length||before.some((node,i)=>node.tagName!==after[i].tagName)){host.replaceChildren(...next.childNodes);return;}
 for(let i=0;i<before.length-1;i++){
  const parent=before[i],keep=before[i+1],children=[...after[i].childNodes],at=children.indexOf(after[i+1]);
  for(const child of [...parent.childNodes])if(child!==keep)child.remove();
  for(const child of children.slice(0,at))parent.insertBefore(child,keep);
  for(const child of children.slice(at+1))parent.append(child);
  if(keep!==active){for(const attr of [...keep.attributes])if(!after[i+1].hasAttribute(attr.name))keep.removeAttribute(attr.name);for(const attr of after[i+1].attributes)keep.setAttribute(attr.name,attr.value);}
 }
}
export const typing=target=>target?.matches?.('input,textarea,select,[contenteditable="true"]');
