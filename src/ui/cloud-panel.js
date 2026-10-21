import {el,button,showMessage} from './dom.js';
import {confirmReplacement} from './files.js';
const mb=value=>(Number(value||0)/1048576).toFixed(1).replace(/\.0$/,'');
export async function openCloudPanel(ctx,{client,session,account}){
 if(ctx.closeCloudPanel)return;
 const dialog=el('dialog',{id:'cloud-panel',class:'cloud-dialog','aria-labelledby':'cloud-panel-title'}),list=el('div',{id:'cloud-list',class:'cloud-list'}),usage=el('p',{id:'cloud-usage'}),feedback=el('p',{role:'status'}),tabs=el('nav',{class:'cloud-tabs'});
 let tab='mine',closed=false,revision=0,feed=new Map(),own=[],draftIds=new Set(),assets=new Map(),busy=false,loading=null;
 const assetEvents=new Map();
 const profile=()=>account.getProfile(),canWrite=()=>['trial','member'].includes(profile()?.status);
 const panelOwner=profile()?.id??null;
 const active=()=>!closed&&dialog.isConnected;
 const close=()=>{if(closed)return;closed=true;revision++;stopFeed();stopAuth?.();if(dialog.open)dialog.close();dialog.remove();ctx.closeCloudPanel=null;ctx.refresh?.();};
 ctx.closeCloudPanel=close;
 async function act(action){if(busy)return;busy=true;render();try{await action();}catch(error){if(active())feedback.textContent=error.message;else showMessage(error.message);}finally{busy=false;if(active())render();}}
 async function openWork(id){if(!await confirmReplacement(ctx.store,{save:ctx.save}))return;await session.open(id);close();}
 function row(item,actions,extra=''){return el('article',{'data-cloud-item':item.id??item.item_id,class:'cloud-row'},el('div',{},el('strong',{},item.title),el('small',{},extra)),el('div',{class:'cloud-row-actions'},actions));}
 const action=(label,key,run)=>button(label,()=>{void act(run);},{'data-cloud-action':key,disabled:busy});
 function render(){
  if(!active())return;
  for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.dataset.tab===tab));
  list.replaceChildren();
  if(tab==='mine'||tab==='trash'){
   const rows=own.filter(item=>tab==='trash'?!!item.deleted_at:!item.deleted_at);
   for(const item of rows){
    let text=item.card_count+'장 · '+(item.visibility==='public'?'공개':'비공개');
    if(draftIds.has(item.id)||session.state().workId===item.id&&session.state().hasUnsavedDraft)text+=' · 공개본과 다름';
    const actions=[];
    if(tab==='mine'){
     actions.push(action('열기','open',()=>openWork(item.id)));
     if(canWrite())actions.push(action(item.visibility==='public'?'비공개로':'공개하기','visibility',async()=>{await client.call('work.setVisibility',{id:item.id,visibility:item.visibility==='public'?'private':'public'},{expectedUserId:panelOwner});await load();}),action('삭제','delete',async()=>{await client.call('work.delete',{id:item.id},{expectedUserId:panelOwner});await load();}));
    }else{
     const remaining=Math.max(0,Math.ceil(30-(Date.now()-Date.parse(item.deleted_at))/86400000));text+=' · 삭제 '+new Date(item.deleted_at).toLocaleDateString()+' · '+remaining+'일 남음';
     if(canWrite()&&remaining>0)actions.push(action('복구','restore',async()=>{await client.call('work.restore',{id:item.id},{expectedUserId:panelOwner});await load();}));
    }
    list.append(row(item,actions,text));
   }
   if(!rows.length)list.append(el('p',{},tab==='mine'?'내 작업이 없어요. 저장을 누르면 새 비공개 작업이 생겨요.':'휴지통이 비어 있어요.'));
  }else if(tab==='public'){
   for(const item of [...feed.values()].filter(item=>item.kind==='work').sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))){
    const actions=[action('보기','view',()=>openWork(item.item_id))];
    if(canWrite())actions.push(action('사본 만들기','copy',async()=>{if(!await confirmReplacement(ctx.store,{save:ctx.save}))return;const result=await client.call('work.copy',{sourceId:item.item_id},{expectedUserId:panelOwner});await session.open(result.id);close();}));
    list.append(row(item,actions,(item.nickname||'닉네임 미설정')+' · '+new Date(item.updated_at).toLocaleString()));
   }
   if(!list.children.length)list.append(el('p',{},'공개된 작업이 없어요.'));
  }else if(ctx.renderCloudAssets){void ctx.renderCloudAssets(list,{client,session,account,assets:[...assets.values()],feed:[...feed.values()],act,refresh:load,close});}
  else list.append(el('p',{},'공유 에셋을 이곳에서 찾아볼 수 있어요.'));
 }
 async function load(){
  const token=++revision,pending={token,events:[]};loading=pending;feedback.textContent='목록을 읽고 있어요…';
  try{
   const auth=await client.session(),owner=auth?.user.id;
   const [publicRows,mine,drafts,assetRows,limits,used]=await Promise.all([
    client.select('public_feed'),owner?client.select('works',{columns:'id,owner,title,card_count,visibility,version,deleted_at,updated_at',eq:{owner},order:{column:'updated_at'}}):[],owner?client.select('work_drafts',{columns:'work_id',eq:{owner}}):[],client.select('shared_assets',{columns:'id,owner,kind,title,visibility,version,deleted_at,updated_at',is:{deleted_at:null}}),client.select('tier_limits'),owner?client.usage():null
   ]);
   if(!active()||token!==revision)return;
   feed=new Map(publicRows.map(row=>[row.item_id,row]));own=mine;draftIds=new Set(drafts.map(row=>row.work_id));assets=new Map(assetRows.map(row=>[row.id,row]));
   for(const event of pending.events)applyEvent(event);
   const limit=limits.find(row=>row.tier===profile()?.status);
   usage.textContent=used&&limit?'카드 '+used.cards+' / '+limit.max_cards+'장, 이미지 '+mb(used.blob_bytes)+' MB / '+mb(limit.max_blob_bytes)+' MB':owner?'관리자 승인 후 사용량 한도가 표시돼요.':'로그인하면 내 작업과 사용량을 볼 수 있어요.';
   feedback.textContent='';render();
  }catch(error){if(active()&&token===revision)feedback.textContent=error.message;}
  finally{if(loading===pending)loading=null;}
 }
 function applyEvent(event){
  const id=event.row.item_id,serial=(assetEvents.get(id)??0)+1;assetEvents.set(id,serial);
  if(event.type==='delete'){
   feed.delete(id);const item=assets.get(id);
   if(item?.owner===profile()?.id){
    assets.set(id,{...item,visibility:'private'});
    void client.select('shared_assets',{eq:{id},single:true}).then(row=>{
     if(!active()||assetEvents.get(id)!==serial)return;
     if(row&&!row.deleted_at)assets.set(id,row);else assets.delete(id);if(tab==='assets')render();
    }).catch(error=>{if(active())feedback.textContent=error.message;});
   }else assets.delete(id);
  }else{
   feed.set(id,event.row);
   if(event.row.kind==='asset')assets.set(id,{...assets.get(id),id,owner:event.row.owner,kind:event.row.asset_kind??assets.get(id)?.kind,title:event.row.title,version:event.row.version,updated_at:event.row.updated_at,visibility:'public',deleted_at:null});
  }
 }
 for(const [key,label] of [['mine','내 작업'],['public','공개 목록'],['assets','에셋'],['trash','휴지통']])tabs.append(button(label,()=>{tab=key;render();},{id:'cloud-tab-'+key,'data-tab':key}));
 dialog.append(el('h2',{id:'cloud-panel-title'},'클라우드'),usage,tabs,list,feedback,el('div',{class:'dialog-actions'},canWrite()?button('PC 작업 한 번에 올리기',()=>{void ctx.openCloudImport();},{id:'cloud-import-open'}):null,button('새로고침',()=>{void load();}),button('닫기',close,{id:'cloud-close'})));
 const stopFeed=client.subscribeFeed(event=>{if(!active())return;loading?.events.push(event);applyEvent(event);if(tab==='public'||tab==='assets')render();},{onReady:()=>{if(active())void load();}});
 const stopAuth=client.onAuthChange?.(auth=>{if(active()&&(auth?.user.id??null)!==panelOwner)close();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();await load();
}
