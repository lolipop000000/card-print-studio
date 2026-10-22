import {el,button,showMessage} from './dom.js';
import {confirmReplacement} from './files.js';
import {MOBILE_QUERY} from './mobile-layout.js';

const mb=value=>(Number(value||0)/1048576).toFixed(1).replace(/\.0$/,'');
const normalized=value=>String(value??'').normalize('NFC').toLocaleLowerCase();
const kinds=[['all','모든 종류'],['work','덱'],['image','이미지'],['keyword','키워드'],['effect_template','이펙트'],['card_template','카드 서식']];

/** Cloud collections share the image library's modal and account lifecycle. */
export function mountLibraryHub(ctx,{dialog,images,particles,onParticlesOpen,header,onClose,initialAccount=false}){
 const {cloudClient:client,cloudSession:session,cloudAccount:account}=ctx;
 const available=client.availability.available;let owner=account.getProfile()?.id;
 const accountHome=account.node.parentNode,accountNext=account.node.nextSibling;
 const usage=el('p',{id:'cloud-usage',class:'hint',role:'status'}),feedback=el('p',{id:'cloud-feedback',class:'asset-feedback',role:'status'});
 const accountSection=el('details',{class:'library-account',open:initialAccount},el('summary',{id:'library-account-toggle'},'내 계정 설정'),el('div',{class:'library-account-body'},account.node,usage));
 const tabs=el('nav',{class:'library-location-tabs',role:'tablist','aria-label':'보관함 자료 위치'});
 const list=el('div',{id:'cloud-list',class:'cloud-list'}),count=el('output',{id:'library-result-count','aria-live':'polite'});
 const panel=el('section',{id:'cloud-panel',class:'library-cloud-panel',hidden:true,'data-detail':'false','data-loading':'false','aria-label':'클라우드 자료'});
 let tab='images',closed=false,revision=0,busy=false,loaded=false,loading=null,feed=new Map(),own=[],assets=new Map(),draftIds=new Set(),selected=null,scrollTop=0,dialogScroll=0;
 const assetEvents=new Map(),viewState=new Map();
 const active=()=>!closed&&dialog.isConnected;
 const canWrite=()=>account.canWrite();
 const search=el('input',{id:'library-search',type:'search',placeholder:'제목이나 만든 사람 검색','aria-label':'자료 검색'});
 const kind=el('select',{id:'library-kind','aria-label':'자료 종류'},kinds.map(([value,label])=>el('option',{value},label)));
 let composing=false;
 search.addEventListener('compositionstart',()=>{composing=true;});
 search.addEventListener('compositionend',()=>{composing=false;render();});
 search.addEventListener('input',event=>{if(!composing&&!event.isComposing)render();});kind.addEventListener('change',()=>render());
 const focusItem=id=>[...list.querySelectorAll('[data-library-open]')].find(node=>node.dataset.libraryOpen===id)?.focus({preventScroll:true});
 const back=button('‹ 목록으로',()=>{const origin=selected;selected=null;panel.dataset.detail='false';render();list.scrollTop=scrollTop;dialog.scrollTop=dialogScroll;focusItem(origin);},{id:'library-back',class:'library-detail-back'});
 const importer=button('PC 작업 올리기',()=>{void ctx.openCloudImport();},{id:'cloud-import-open'});
 panel.append(el('div',{class:'library-filter-bar'},search,kind,count),back,list,feedback,el('div',{class:'library-cloud-actions'},importer,button('새로고침',()=>{void load();},{id:'library-refresh'})));
 header.after(accountSection,tabs);images.after(panel);
 function showImages(){selectTab('images');}
 function showMine(){if(!active())return;selectTab('mine');search.value='';kind.value='all';render();}
 function close(){if(active())onClose();}
 async function act(action){
  if(busy||closed)return;busy=true;render();
  try{await action();}catch(error){if(active())feedback.textContent=error.message;else showMessage(error.message);}
  finally{busy=false;if(active())render();}
 }
 const action=(label,key,run)=>button(label,()=>{void act(run);},{'data-cloud-action':key,disabled:busy});
 async function openWork(id){if(!await confirmReplacement(ctx.store,{save:ctx.save})||!active())return;await session.open(id);close();}
 function workRow(item,actions,extra){return el('article',{class:'cloud-row','data-cloud-item':item.id??item.item_id},el('div',{},el('strong',{},item.title),el('small',{},extra)),el('div',{class:'cloud-row-actions'},actions));}
 function matches(item,type){return (kind.value==='all'||kind.value===type)&&normalized(item.title+' '+(item.nickname??feed.get(item.id)?.nickname??'')).includes(normalized(search.value).trim());}
 function decorateRows(){
  for(const row of list.querySelectorAll('.cloud-row')){
   const id=row.dataset.cloudItem??row.dataset.cloudAsset,title=row.querySelector('strong');if(!title)continue;
   title.replaceWith(button(title.textContent,()=>{scrollTop=list.scrollTop;dialogScroll=dialog.scrollTop;selected=id;panel.dataset.detail='true';render();if(matchMedia(MOBILE_QUERY).matches){dialog.scrollTop=0;back.focus({preventScroll:true});}else focusItem(id);},{'data-library-open':id,class:'library-item-title','aria-label':title.textContent+' 상세 보기'}));row.dataset.selected=String(selected===id);
  }
  if(selected&&!list.querySelector('.cloud-row[data-selected="true"]')){selected=null;panel.dataset.detail='false';}
 }
 function render(){
  if(!active())return;importer.hidden=!canWrite()||tab!=='mine';importer.disabled=busy;kind.disabled=busy;if(['images','particles'].includes(tab))return;
  list.replaceChildren();const trash=tab==='trash';
  if(kind.value==='all'||kind.value==='work'){
   const rows=tab==='public'?[...feed.values()].filter(item=>item.kind==='work').sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))):own.filter(item=>trash?!!item.deleted_at:!item.deleted_at);
   for(const item of rows.filter(item=>matches(item,'work'))){
    const id=item.id??item.item_id,actions=[];
    let text=tab==='public'?(item.nickname||'닉네임 미설정')+' · '+new Date(item.updated_at).toLocaleDateString():item.card_count+'장 · '+(item.visibility==='public'?'공개':'비공개');
    if(tab==='public'){
     actions.push(action('보기','view',()=>openWork(id)));
     if(canWrite())actions.push(action('사본 만들기','copy',async()=>{if(!await confirmReplacement(ctx.store,{save:ctx.save})||!active())return;const result=await client.call('work.copy',{sourceId:id},{expectedUserId:owner});await session.open(result.id);close();}));
    }else if(trash){
     const remaining=Math.max(0,Math.ceil(30-(Date.now()-Date.parse(item.deleted_at))/86400000));text+=' · '+remaining+'일 남음';
     if(canWrite()&&remaining>0)actions.push(action('복구','restore',async()=>{await client.call('work.restore',{id},{expectedUserId:owner});await load();}));
    }else{
     if(draftIds.has(id)||session.state().workId===id&&session.state().hasUnsavedDraft)text+=' · 공개본과 다름';actions.push(action('열기','open',()=>openWork(id)));
     if(canWrite())actions.push(action(item.visibility==='public'?'비공개로':'공개하기','visibility',async()=>{await client.call('work.setVisibility',{id,visibility:item.visibility==='public'?'private':'public'},{expectedUserId:owner});await load();}),action('삭제','delete',async()=>{await client.call('work.delete',{id},{expectedUserId:owner});await load();}));
    }
    list.append(workRow(item,actions,text));
   }
  }
  const visibleAssets=[...assets.values()].filter(item=>(tab==='public'?item.visibility==='public'&&!item.deleted_at:item.owner===owner&&(trash?!!item.deleted_at:!item.deleted_at))&&matches(item,item.kind));
  if(visibleAssets.length)ctx.renderCloudAssets?.(list,{assets:visibleAssets,act,refresh:load,trash,openImages:showImages,openMine:showMine});
  const size=list.querySelectorAll('.cloud-row').length;count.textContent=size+'개';
  if(!size)list.append(el('p',{class:'empty-note'},search.value||kind.value!=='all'?'검색 조건에 맞는 자료가 없어요.':tab==='public'?'아직 공개된 자료가 없어요.':trash?'휴지통이 비어 있어요.':owner?'저장한 덱과 공유한 에셋이 이곳에 모여요.':'내 자료는 로그인 후 볼 수 있어요.'));
  decorateRows();
 }
 function selectTab(next){
  if(closed||!['images','particles'].includes(next)&&!available)return;viewState.set(tab,{query:search.value,kind:kind.value});tab=next;selected=null;panel.dataset.detail='false';
  const previous=viewState.get(tab);search.value=previous?.query??'';kind.value=previous?.kind??'all';images.hidden=tab!=='images';if(particles)particles.hidden=tab!=='particles';panel.hidden=['images','particles'].includes(tab);dialog.dataset.libraryTab=tab;
  for(const control of tabs.children){const chosen=control.dataset.tab===tab;control.setAttribute('aria-selected',String(chosen));control.tabIndex=chosen?0:-1;}
  render();if(tab==='particles')onParticlesOpen?.();if(!['images','particles'].includes(tab)&&!loaded&&!loading)void load();
 }
 for(const [key,label] of [['images','이미지'],...(particles?[['particles','파티클']]:[]),['mine','내 자료'],['public','공개 자료'],['trash','휴지통']]){
  const local=['images','particles'].includes(key);
  const control=button(label,()=>selectTab(key),{id:local?'library-tab-'+key:'cloud-tab-'+key,role:'tab','data-tab':key,'aria-controls':key==='images'?images.id:key==='particles'?particles.id:panel.id,'aria-selected':String(key==='images'),tabIndex:key==='images'?0:-1,disabled:!local&&!available});
  control.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const entries=[...tabs.children].filter(node=>!node.disabled),index=entries.indexOf(control),next=event.key==='Home'?0:event.key==='End'?entries.length-1:(index+(event.key==='ArrowRight'?1:-1)+entries.length)%entries.length;selectTab(entries[next].dataset.tab);entries[next].focus();});tabs.append(control);
 }
 async function load(){
  if(!available||closed)return;const token=++revision,pending={events:[]};loading=pending;panel.dataset.loading='true';feedback.textContent='자료를 읽고 있어요…';
  try{
   await account.whenReady();if(!active()||token!==revision)return;
   const auth=await client.session(),currentOwner=auth?.user.id??null;if(!active()||token!==revision)return;if(owner===undefined)owner=currentOwner;else if(currentOwner!==owner){close();return;}
   const [publicRows,mine,drafts,assetRows,limits,used]=await Promise.all([client.select('public_feed'),owner?client.select('works',{columns:'id,owner,title,card_count,visibility,version,deleted_at,updated_at',eq:{owner},order:{column:'updated_at'}}):[],owner?client.select('work_drafts',{columns:'work_id',eq:{owner}}):[],client.select('shared_assets',{columns:'id,owner,kind,title,visibility,version,deleted_at,updated_at'}),client.select('tier_limits'),owner?client.usage():null]);
   if(!active()||token!==revision)return;feed=new Map(publicRows.map(item=>[item.item_id,item]));own=mine;draftIds=new Set(drafts.map(item=>item.work_id));assets=new Map(assetRows.map(item=>[item.id,item]));
   for(const event of pending.events)applyEvent(event);const limit=limits.find(item=>item.tier===account.getProfile()?.status);
   usage.textContent=used&&limit?'카드 '+used.cards+' / '+limit.max_cards+'장 · 이미지 '+mb(used.blob_bytes)+' / '+mb(limit.max_blob_bytes)+' MB':owner?'관리자 승인 후 사용량 한도가 표시돼요.':'Google로 로그인하면 내 자료를 저장할 수 있어요.';
   loaded=true;feedback.textContent='';render();
  }catch(error){if(active()&&token===revision)feedback.textContent=error.message;}
  finally{if(loading===pending){loading=null;panel.dataset.loading='false';}}
 }
 function applyEvent(event){
  const id=event.row.item_id,serial=(assetEvents.get(id)??0)+1;assetEvents.set(id,serial);
  if(event.type==='delete'){
   feed.delete(id);const item=assets.get(id);
   if(item?.owner===owner){assets.set(id,{...item,visibility:'private'});void client.select('shared_assets',{eq:{id},single:true}).then(value=>{if(!active()||assetEvents.get(id)!==serial)return;if(value)assets.set(id,value);else assets.delete(id);render();}).catch(error=>{if(active())feedback.textContent=error.message;});}else assets.delete(id);
  }else{feed.set(id,event.row);if(event.row.kind==='asset')assets.set(id,{...assets.get(id),id,owner:event.row.owner,kind:event.row.asset_kind??assets.get(id)?.kind,title:event.row.title,nickname:event.row.nickname,version:event.row.version,updated_at:event.row.updated_at,visibility:'public',deleted_at:null});}
 }
  const stopFeed=available?client.subscribeFeed(event=>{if(!active())return;loading?.events.push(event);applyEvent(event);render();},{onReady:()=>{if(active()&&(loaded||!['images','particles'].includes(tab)||accountSection.open))void load();}}):()=>{};
 const stopAuth=client.onAuthChange?.(auth=>{if(!active())return;const next=auth?.user.id??null;if(owner===undefined)owner=next;else if(next!==owner)close();});
 accountSection.addEventListener('toggle',()=>{if(active()&&accountSection.open&&!loaded&&!loading)void load();});
 ctx.closeCloudPanel=close;usage.textContent=available?'계정을 열거나 자료 위치를 선택하면 사용량을 불러와요.':client.availability.reason==='file'?'웹 주소에서 열면 로그인과 공유를 사용할 수 있어요.':'클라우드 연결 설정을 확인해 주세요.';dialog.dataset.libraryTab='images';if(initialAccount)queueMicrotask(()=>{if(active()&&!loading)void load();});
 return {destroy(){if(closed)return;closed=true;revision++;stopFeed();stopAuth?.();if(ctx.closeCloudPanel===close)ctx.closeCloudPanel=null;if(accountHome)accountHome.insertBefore(account.node,accountNext?.parentNode===accountHome?accountNext:null);else account.node.remove();}};
}
