import {el,button} from './dom.js';
export function openDialog({title,message,choices,onOpen}){
 return new Promise(resolve=>{const dialog=el('dialog',{class:'confirm-dialog'},el('h2',{},title),el('p',{},message));const end=id=>{dialog.close();dialog.remove();resolve(id);};dialog.append(el('div',{class:'dialog-actions'},choices.map((c,i)=>button(c.label,()=>end(c.id),{class:i===0?'primary':''}))));dialog.addEventListener('cancel',event=>{event.preventDefault();end('cancel');});document.body.append(dialog);onOpen?.(dialog);dialog.showModal();});
}
