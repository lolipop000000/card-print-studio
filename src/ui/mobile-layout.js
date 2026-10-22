import {el,button} from './dom.js';

export const MOBILE_QUERY='(max-width: 620px), (max-width: 960px) and (max-height: 500px) and (pointer: coarse)';
const inspectorSections=new WeakMap();

/** Section expansion belongs to the workspace, not to the card or undo history. */
export function organizeMobileInspector(host){
 if(!matchMedia(MOBILE_QUERY).matches)return;
 let state=inspectorSections.get(host);if(!state){state=new Map();inspectorSections.set(host,state);}
 for(const section of host.querySelectorAll('.inspector-group')){
  const heading=section.querySelector(':scope > h3');if(!heading)continue;
  const title=heading.textContent,content=el('div',{class:'mobile-inspector-content'});
  if(!state.has(title))state.set(title,['카드 정보','몬스터','아이템 효과','선택한 요소'].includes(title));
  const toggle=button(title,()=>{state.set(title,!state.get(title));sync();},{class:'mobile-inspector-toggle'});
  function sync(){const expanded=state.get(title);section.dataset.mobileExpanded=String(expanded);toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',title+(expanded?' 접기':' 펼치기'));}
  while(heading.nextSibling)content.append(heading.nextSibling);section.append(content);heading.replaceChildren(toggle);sync();
 }
}
