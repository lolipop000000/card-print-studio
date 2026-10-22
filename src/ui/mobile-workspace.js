import {el,button,typing} from './dom.js';
import {MOBILE_QUERY} from './mobile-layout.js';

function paneTabs(host,entries,{label,initial,attribute,onChange=()=>{}}){
 let current=initial;
 const tabs=el('nav',{class:'mobile-pane-tabs',role:'tablist','aria-label':label});
 function select(id,focus=false){
  current=id;host.setAttribute(attribute,id);
  for(const tab of tabs.children){const selected=tab.dataset.pane===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected&&focus)tab.focus();}
  onChange(id);
 }
 for(const [id,text,panel] of entries){
  const tab=button(text,()=>select(id),{id:host.classList.contains('studio')?'mobile-'+id:undefined,role:'tab','data-pane':id,'aria-controls':panel.id||undefined});
  tab.addEventListener('keydown',event=>{const index=entries.findIndex(([key])=>key===current),next=event.key==='ArrowRight'?(index+1)%entries.length:event.key==='ArrowLeft'?(index+entries.length-1)%entries.length:event.key==='Home'?0:event.key==='End'?entries.length-1:null;if(next===null)return;event.preventDefault();select(entries[next][0],true);});tabs.append(tab);
 }
 // Initial layout has no callbacks: callers may still be mounting their canvases.
 host.setAttribute(attribute,initial);for(const tab of tabs.children){tab.setAttribute('aria-selected',String(tab.dataset.pane===initial));tab.tabIndex=tab.dataset.pane===initial?0:-1;}
 return {node:tabs,select,current:()=>current};
}

/** Responsive viewing state never enters project JSON or undo history. */
export function mountMobileWorkspace(root,{onChange=()=>{},save=()=>{},openLibrary=()=>{}}={}){
 const media=matchMedia(MOBILE_QUERY),top=root.querySelector('.topbar'),grid=root.querySelector('.workspace-grid');
 const library=grid.querySelector('.library'),workspace=grid.querySelector('.workspace'),inspector=grid.querySelector('.inspector');
 library.id||='mobile-library-panel';workspace.id||='mobile-preview-panel';
 const tabs=paneTabs(root,[['cards','카드 목록',library],['editor','편집',inspector],['preview','미리보기',workspace]],{label:'모바일 작업 영역',initial:'preview',attribute:'data-mobile-view',onChange:id=>{closeMenu();onChange(id);}});
 tabs.node.id='mobile-workspace-tabs';
 const bottom=el('footer',{class:'mobile-bottom-bar'},tabs.node,button('보관함',()=>{closeMenu();openLibrary();},{id:'mobile-library'}));grid.after(bottom);
 const actions=top.querySelector('.top-actions');actions.id||='studio-top-actions';
 const menu=button('더보기',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));root.dataset.mobileMenu=String(open);},{id:'mobile-menu-toggle',class:'mobile-menu-toggle','aria-expanded':'false','aria-controls':actions.id});
 const header=el('div',{class:'mobile-header-actions'},button('저장',save,{id:'mobile-save',class:'primary','aria-label':'프로젝트 저장'}),menu);top.insertBefore(header,actions);
 function closeMenu(){menu.setAttribute('aria-expanded','false');root.dataset.mobileMenu='false';}
 function refresh(){closeMenu();onChange(tabs.current());}
 media.addEventListener('change',refresh);
 const dismiss=event=>{if(event.key==='Escape'&&menu.getAttribute('aria-expanded')==='true'){closeMenu();menu.focus();}else if(event.type==='pointerdown'&&!top.contains(event.target))closeMenu();};
 document.addEventListener('keydown',dismiss);document.addEventListener('pointerdown',dismiss);
 const dialogMounts=new Map();
 function mountDialogs(){
  for(const [dialog,nav] of dialogMounts)if(!dialog.isConnected){nav.remove();dialogMounts.delete(dialog);}
  for(const dialog of document.querySelectorAll('.effect-dialog[open],.painting-dialog[open]')){
   if(dialogMounts.has(dialog))continue;
   const effect=dialog.classList.contains('effect-dialog'),entries=effect?[['library','목록',dialog.querySelector('.effect-library')],['preview','미리보기',dialog.querySelector('.effect-center')],['settings','설정',dialog.querySelector('.effect-controls')]]:[['canvas','그리기',dialog.querySelector('.paint-viewport')],['settings','설정 · 레이어',dialog.querySelector('.paint-panel')]];
   if(entries.some(([, ,panel])=>!panel))continue;
   entries.forEach(([id,,panel])=>panel.id||=(effect?'mobile-effect-':'mobile-paint-')+id);
   const nav=paneTabs(dialog,entries,{label:effect?'이펙트 작업 영역':'그림 작업 영역',initial:effect?'preview':'canvas',attribute:'data-mobile-section',onChange:()=>{window.dispatchEvent(new Event('resize'));}}).node;
   nav.classList.add('mobile-dialog-tabs');(dialog.querySelector(effect?'.effect-target-bar':'.paint-top')).after(nav);dialogMounts.set(dialog,nav);
  }
 }
 const observer=new MutationObserver(mountDialogs);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});mountDialogs();
 // Browsers that resize the visual viewport for the keyboard keep the focused field reachable.
 const focus=event=>{if(media.matches&&typing(event.target))requestAnimationFrame(()=>{if(event.target===document.activeElement)event.target.scrollIntoView({block:'nearest',inline:'nearest'});});};
 document.addEventListener('focusin',focus);
 return {isPreviewVisible:()=>!media.matches||tabs.current()==='preview',isPhone:()=>media.matches,show:tabs.select,destroy(){observer.disconnect();media.removeEventListener('change',refresh);document.removeEventListener('focusin',focus);document.removeEventListener('keydown',dismiss);document.removeEventListener('pointerdown',dismiss);bottom.remove();header.remove();for(const [dialog,nav] of dialogMounts){nav.remove();dialog.removeAttribute('data-mobile-section');}delete root.dataset.mobileView;delete root.dataset.mobileMenu;}};
}
