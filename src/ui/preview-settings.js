import {el} from './dom.js';

const KEY='pp-monster:preview:v1',EVENT='pp-monster:preview-change',defaults={durationSec:6,loop:true,dpi:null};
function read(){
 try{const saved=JSON.parse(localStorage.getItem(KEY));return {
  durationSec:Number.isFinite(saved?.durationSec)&&saved.durationSec>=.1&&saved.durationSec<=3600?saved.durationSec:6,
  loop:typeof saved?.loop==='boolean'?saved.loop:true,
  dpi:Number.isFinite(saved?.dpi)&&saved.dpi>=50&&saved.dpi<=600?Math.round(saved.dpi):null
 };}catch{return {...defaults};}
}

/** Preview preferences stay local and never become card data or an undo step. */
export function createPreviewSettings(prefix,onChange){
 const state=read(),presets=[150,300,600];
 const duration=el('input',{id:prefix+'-preview-duration',type:'number',min:.1,max:3600,step:.1,value:state.durationSec});
 const loop=el('input',{id:prefix+'-preview-loop',type:'checkbox',checked:state.loop});
 const dpi=el('select',{id:prefix+'-preview-dpi'},[['auto','자동'],...presets.map(value=>[String(value),value+' dpi']),['custom','직접 입력']].map(([value,text])=>el('option',{value},text)));
 const custom=el('input',{id:prefix+'-preview-custom-dpi',type:'number',min:50,max:600,step:1,value:state.dpi??300});
 const customField=el('label',{class:'field',htmlFor:custom.id},el('span',{},'직접 입력 (50–600 dpi)'),custom);
 const actual=el('output',{id:prefix+'-preview-resolution',class:'preview-resolution','aria-live':'polite'});
 function sync(){duration.value=state.durationSec;loop.checked=state.loop;dpi.value=state.dpi===null?'auto':presets.includes(state.dpi)?String(state.dpi):'custom';custom.value=state.dpi??300;customField.hidden=dpi.value!=='custom';}
 function changed(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}onChange({...state});window.dispatchEvent(new CustomEvent(EVENT,{detail:{source:node,preferences:{...state}}}));}
 duration.addEventListener('change',()=>{const value=Number(duration.value);if(Number.isFinite(value)&&value>=.1)state.durationSec=Math.min(3600,value);duration.value=state.durationSec;changed();});
 loop.addEventListener('change',()=>{state.loop=loop.checked;changed();});
 dpi.addEventListener('change',()=>{customField.hidden=dpi.value!=='custom';state.dpi=dpi.value==='auto'?null:dpi.value==='custom'?Number(custom.value):Number(dpi.value);changed();});
 custom.addEventListener('change',()=>{const value=Number(custom.value);state.dpi=Number.isFinite(value)&&value>0?Math.min(600,Math.max(50,Math.round(value))):state.dpi??300;custom.value=state.dpi;changed();});
 const node=el('div',{class:'preview-settings-fields'},
  el('label',{class:'field',htmlFor:duration.id},el('span',{},'종료 시간 (초)'),duration),
  el('label',{class:'check'},loop,'반복 재생'),
  el('label',{class:'field',htmlFor:dpi.id},el('span',{},'렌더링 DPI'),dpi),customField,actual);
 function receive(event){if(event.detail.source===node)return;Object.assign(state,event.detail.preferences);sync();onChange({...state});}
 function storage(event){if(event.key!==KEY)return;Object.assign(state,read());sync();onChange({...state});}
 window.addEventListener(EVENT,receive);window.addEventListener('storage',storage);
 sync();return {node,get:()=>({...state}),updateActual(value){actual.textContent=(state.dpi===null?'자동 · ':state.dpi!==value?'설정 '+state.dpi+' · 적용 ':'')+value+' dpi';},destroy(){window.removeEventListener(EVENT,receive);window.removeEventListener('storage',storage);}};
}
