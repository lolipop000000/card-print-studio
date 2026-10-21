import {button} from './dom.js';

/** Appearance belongs to this browser, never to a card or its undo history. */
export function createThemeControl(){
 const key='card-print-studio:theme:v1',root=document.documentElement;
 let theme=root.dataset.theme==='dark'?'dark':'light';
 try{const saved=localStorage.getItem(key);if(saved==='dark'||saved==='light')theme=saved;}catch{}
 const control=button('',()=>{
  theme=theme==='dark'?'light':'dark';apply();
  try{localStorage.setItem(key,theme);}catch{}
 },{id:'theme-toggle','aria-label':'다크 모드 전환'});
 function apply(){
  root.dataset.theme=theme;control.setAttribute('aria-pressed',String(theme==='dark'));
  control.textContent=theme==='dark'?'☀ 라이트 모드':'☾ 다크 모드';
  control.title=theme==='dark'?'밝은 작업 화면으로 전환':'어두운 작업 화면으로 전환';
 }
 apply();return control;
}
