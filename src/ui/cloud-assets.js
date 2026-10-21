import {snapshotAsset,snapshotLibraryEntry,applySharedAsset} from '../cloud/shared-assets.js';
import {el,button,showMessage} from './dom.js';
export function createCloudAssetControls(ctx,{client,blobs,account,assetLibrary}){
 let disposed=false;
 const requireMember=()=>{if(disposed||!account.canWrite())throw Error('관리자 승인 후 공유와 가져오기를 쓸 수 있어요.');};
 async function share(snapshot,title,kind){
  requireMember();const owner=account.getProfile().id,documentId=ctx.store.getDocumentId();
  const check=()=>{requireMember();if(account.getProfile().id!==owner||ctx.store.getDocumentId()!==documentId)throw Error('공유하는 동안 계정이나 덱이 바뀌었어요. 다시 공유하세요.');};
  const {data,blobBytes}=await snapshot;check();await blobs.ensureUploaded(blobBytes);check();
  const rows=await client.select('shared_assets',{eq:{owner,kind},is:{deleted_at:null}});check();const existing=rows.find(row=>row.data.item.id===data.item.id);
  const result=await client.call(existing?'asset.save':'asset.create',existing?{id:existing.id,data,baseVersion:existing.version}:{kind,title,data});check();
  await client.call('asset.setVisibility',{id:existing?.id??result.id,visibility:'public'});check();showMessage('에셋을 공개했어요. 다른 친구가 사본으로 가져갈 수 있어요.','success');return existing?.id??result.id;
 }
 ctx.shareAsset=(kind,id)=>{try{requireMember();const item=ctx.store.getProject()[{keyword:'keywords',card_template:'cardTemplates',effect_template:'visualEffectPresets'}[kind]]?.find(item=>item.id===id);if(!item)throw Error('공유할 항목이 없어졌어요.');return share(snapshotAsset(ctx.store.getProject(),kind,id),item.name,kind).catch(error=>{showMessage(error.message);return false;});}catch(error){showMessage(error.message);return Promise.resolve(false);}};
 ctx.shareLibraryEntry=entry=>{try{requireMember();return share(snapshotLibraryEntry(entry),entry.name,'image').catch(error=>{showMessage(error.message);return false;});}catch(error){showMessage(error.message);return Promise.resolve(false);}};
 ctx.renderCloudAssets=(list,{assets,act,refresh})=>{
  const owner=account.getProfile()?.id,canWrite=account.canWrite();
  for(const item of assets.filter(row=>!row.deleted_at&&(row.owner===owner||row.visibility==='public'))){
   const actions=[],mine=item.owner===owner;
   const action=(label,run,attrs={})=>button(label,()=>{void act(run);},attrs);
   if(mine&&canWrite)actions.push(action(item.visibility==='public'?'비공개로':'공개하기',async()=>{await client.call('asset.setVisibility',{id:item.id,visibility:item.visibility==='public'?'private':'public'});await refresh();}),action('삭제',async()=>{await client.call('asset.delete',{id:item.id});await refresh();}));
   if(!mine&&canWrite)actions.push(action('내 보관함에 가져오기',async()=>{
    requireMember();const before=ctx.store.getProject(),documentId=ctx.store.getDocumentId(),user=account.getProfile().id;
    if(ctx.cloudSession.state().viewing&&item.kind!=='image')throw Error('내 작업이나 새 덱을 열고 에셋을 가져오세요.');
    const result=await client.call('asset.copy',{sourceId:item.id}),copy=await client.select('shared_assets',{eq:{id:result.id},single:true});
    requireMember();if(account.getProfile().id!==user)throw Error('계정이 바뀌었어요. 새 계정의 에셋 목록을 여세요.');
    if(item.kind==='image')await assetLibrary.reload();
    else{
     const project=structuredClone(before);await applySharedAsset(project,copy.data,hash=>blobs.fetch(hash));requireMember();
     if(account.getProfile().id!==user||ctx.store.getDocumentId()!==documentId||ctx.store.getProject()!==before)throw Error('에셋을 읽는 동안 덱이 바뀌었어요. 사본은 내 에셋에 남아 있어요. 다시 적용하세요.');
     ctx.store.edit('공유 에셋 가져오기',draft=>Object.assign(draft,project));
    }
    await refresh();showMessage(item.kind==='image'?'내 이미지 보관함에 사본을 추가했어요.':'열린 덱에 독립 사본을 추가했어요.','success');
   },{'data-cloud-asset-take':item.id}));
   list.append(el('article',{class:'cloud-row','data-cloud-asset':item.id},el('div',{},el('strong',{},item.title),el('small',{},({keyword:'키워드',image:'이미지',card_template:'카드 서식',effect_template:'이펙트'}[item.kind]??item.kind)+' · '+(mine?'내 에셋':item.visibility==='public'?'공개 에셋':'비공개')+' · v'+item.version)),el('div',{class:'cloud-row-actions'},actions)));
  }
  if(!list.children.length)list.append(el('p',{},'공유한 에셋이 없어요. 키워드·서식·내 이펙트·이미지 보관함에서 공유할 수 있어요.'));
 };
 return {destroy(){disposed=true;delete ctx.shareAsset;delete ctx.shareLibraryEntry;delete ctx.renderCloudAssets;}};
}
