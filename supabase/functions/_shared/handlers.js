import {validateCloudWork,validateCloudAsset,sniffImage,imageSize,sha256Hex} from './model.bundle.js';
import {RATE,IMPORT,VERSIONS_KEPT,TRASH_DAYS,DRAFT_MIN_INTERVAL_MS,MAX_BLOB_BYTES} from './limits.js';

export class ApiError extends Error{
 constructor(status,code,message){super(message);this.name='ApiError';this.status=status;this.code=code;}
}
const messages={unauthenticated:'로그인 후 다시 시도하세요.','not-member':'관리자 승인 후 저장과 공유를 쓸 수 있어요.',forbidden:'본인 작업만 바꿀 수 있어요.','not-found':'찾을 수 없거나 볼 수 없는 항목이에요.',conflict:'다른 곳에서 먼저 저장했어요.','limit-rate':'잠시 후 다시 시도하세요. 한 시간에 저장할 수 있는 횟수를 넘었어요.','limit-import':'PC 작업 올리기는 하루에 한 번만 할 수 있어요.','unknown-blob':'그림 업로드가 끝나지 않았어요. 다시 저장하세요.',invalid:'저장 요청의 내용이 올바르지 않아요.'};
const fail=(status,code,message=messages[code])=>{throw new ApiError(status,code,message);};
const writeActions=['profile.setNickname','work.create','work.save','work.setVisibility','work.copy','work.delete','work.restore','asset.create','asset.save','asset.setVisibility','asset.copy','asset.delete','asset.restore'];
const hashPattern=/^[0-9a-f]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function title(value){if(typeof value!=='string'||!value.trim()||Array.from(value).length>120||/[\x00-\x1f\x7f]/.test(value))fail(400,'invalid','제목은 줄바꿈 없는 1~120자로 입력하세요.');return value;}
function version(value){if(!Number.isSafeInteger(value)||value<1)fail(400,'invalid','기준 버전이 올바르지 않아요.');return value;}
function validation(fn){try{return fn();}catch(error){if(error.code==='invalid-work')fail(400,'invalid',error.message);throw error;}}

export function createApi({repo,storage,now=Date.now}){
 // Serialize a user's operations within this instance, including the audit rate count.
 // Remote adapters must supply withOwnerLock for a cross-instance transaction boundary.
 const queues=new Map();
 async function locked(id,operation){
  if(repo.withOwnerLock)return repo.withOwnerLock(id,operation);
  const previous=queues.get(id)??Promise.resolve();
  const current=previous.catch(()=>{}).then(operation);queues.set(id,current);
  try{return await current;}finally{if(queues.get(id)===current)queues.delete(id);}
 }
 async function run(user,action,payload,operation){
  const context={target:null};
  return locked(user?.id??'anonymous',async()=>{
   let ok=false,code;
   try{
    if(!user?.id)fail(401,'unauthenticated');
    const profile=await repo.getProfile(user.id);
    if(!profile||!['trial','member'].includes(profile.status))fail(403,'not-member');
    if(!object(payload))fail(400,'invalid');
    const result=await operation({...context,profile,uid:user.id,time:now()});ok=true;return result;
   }catch(error){code=error.code??'internal';throw error;}
   finally{await repo.audit({actor:user?.id??null,action,target:context.target,ok,detail:code?{code}:{}});}
  });
 }
 async function owned(ctx,kind,id,{trash=false}={}){
  if(typeof id!=='string')fail(404,'not-found');
  const row=await (kind==='work'?repo.getWork(id):repo.getAsset(id));
  if(!row||row.owner!==ctx.uid&&(row.visibility!=='public'||row.deleted_at))fail(404,'not-found');
  if(row.owner!==ctx.uid)fail(403,'forbidden');
  if(!trash&&row.deleted_at)fail(404,'not-found');
  return row;
 }
 async function known(refs){const existing=new Set(await repo.hasBlobs(refs));if(refs.some(ref=>!existing.has(ref)))fail(400,'unknown-blob');}
 async function limits(ctx,changes){
  const tier=await repo.getTierLimits(ctx.profile.status);
  if(!tier)fail(403,'not-member');
  const before=await repo.usage(ctx.uid),after=await repo.usage(ctx.uid,changes);
  if(after.cards>tier.max_cards&&after.cards>before.cards)fail(429,'limit-cards',`카드는 최대 ${tier.max_cards}장까지 저장할 수 있어요. (지금 ${after.cards}장)`);
  if(after.blob_bytes>tier.max_blob_bytes&&after.blob_bytes>before.blob_bytes)fail(429,'limit-bytes',`이미지는 최대 ${tier.max_blob_bytes/1048576} MB까지 저장할 수 있어요.`);
 }
 async function rate(ctx,action,payload,{counter=null}={}){
  if(payload.importToken!==undefined){
   if(typeof payload.importToken!=='string')fail(429,'limit-import');
   const runs=await repo.importRunsSince(ctx.uid,ctx.time-IMPORT.windowMs);
   const run=runs.find(row=>row.token===payload.importToken&&Date.parse(row.expires_at)>ctx.time);
   if(!run||counter&&run[counter]>=IMPORT[counter])fail(429,'limit-import');
   return counter?()=>repo.consumeImport(run.token,counter):()=>{};
  }
  const actions=action==='work.saveDraft'?['work.saveDraft']:action==='blob.upload'?['blob.upload']:writeActions;
  const cap=action==='work.saveDraft'?RATE.drafts:action==='blob.upload'?RATE.blobs:RATE.writes;
  if(await repo.countAudit(ctx.uid,actions,ctx.time-RATE.windowMs)>=cap)fail(429,'limit-rate');
  return ()=>{};
 }
 function rowBase(ctx){return {owner:ctx.uid,visibility:'private',version:1,updated_at:new Date(ctx.time).toISOString(),deleted_at:null};}
 async function create(ctx,payload,kind,source=null){
  const isWork=kind==='work',data=source?.data??payload.data;
  const derived=validation(()=>isWork?validateCloudWork(data):validateCloudAsset(source?.kind??payload.kind,data));
  await known(derived.blobRefs);
  const row={...rowBase(ctx),id:crypto.randomUUID(),title:title(source?.title??payload.title),data:structuredClone(data),blob_refs:derived.blobRefs,...(isWork?{card_count:derived.cardCount}:{kind:source?.kind??payload.kind})};
  if(source)Object.assign(row,isWork?{source_work_id:source.id,source_owner:source.owner}:{source_asset_id:source.id,source_owner:source.owner});
  await limits(ctx,{[kind]:row});
  const consume=await rate(ctx,kind+(source?'.copy':'.create'),payload,{counter:isWork?'decks':null});
  const inserted=await (isWork?repo.insertWork(row):repo.insertAsset(row));
  if(isWork)await repo.pushVersion(inserted.id,1,data,derived.blobRefs);
  await consume();return {id:inserted.id,version:1};
 }
 async function save(ctx,payload,kind,draft=false){
  const isWork=kind==='work',row=await owned(ctx,kind,payload.id),data=payload.data;
  const oldDraft=isWork?await repo.getDraft(row.id):null;
  if(draft){
   if(payload.baseSavedAt!==null&&typeof payload.baseSavedAt!=='string')fail(400,'invalid','초안 기준 시간이 올바르지 않아요.');
   if((oldDraft?.saved_at??null)!==payload.baseSavedAt)fail(409,'conflict');
   if(oldDraft&&ctx.time-Date.parse(oldDraft.saved_at)<DRAFT_MIN_INTERVAL_MS)fail(429,'limit-rate');
  }else if(row.version!==version(payload.baseVersion))fail(409,'conflict');
  const derived=validation(()=>isWork?validateCloudWork(data):validateCloudAsset(row.kind,data));await known(derived.blobRefs);
  const timestamp=new Date(ctx.time).toISOString();
  const candidate=draft?{work_id:row.id,owner:ctx.uid,data:structuredClone(data),card_count:derived.cardCount,blob_refs:derived.blobRefs,saved_at:timestamp}:{...row,data:structuredClone(data),blob_refs:derived.blobRefs,version:row.version+1,updated_at:timestamp,...(isWork?{card_count:derived.cardCount}:{})};
  await limits(ctx,draft?{draft:candidate}:{[kind]:candidate,...(isWork?{clearDraft:row.id}:{})});
  const consume=await rate(ctx,draft?'work.saveDraft':kind+'.save',payload);
  if(draft){
   if(!await repo.putDraft(candidate,{expectSavedAt:payload.baseSavedAt}))fail(409,'conflict');
   await consume();return {savedAt:timestamp};
  }
  const updated=await (isWork?repo.updateWork(row.id,candidate,{expectVersion:payload.baseVersion}):repo.updateAsset(row.id,candidate,{expectVersion:payload.baseVersion}));
  if(!updated)fail(409,'conflict');
  if(isWork){await repo.pushVersion(row.id,candidate.version,data,derived.blobRefs);await repo.pruneVersions(row.id,VERSIONS_KEPT);await repo.deleteDraft(row.id);}
  await consume();return {version:candidate.version};
 }
 async function change(ctx,action,payload,kind){
  const operation=action.split('.')[1],row=await owned(ctx,kind,payload.id,{trash:operation==='restore'});
  const patch={updated_at:new Date(ctx.time).toISOString()};
  if(operation==='setVisibility'){
   if(!['private','public'].includes(payload.visibility))fail(400,'invalid','공개 여부는 private 또는 public이어야 해요.');patch.visibility=payload.visibility;
  }else if(operation==='delete')patch.deleted_at=patch.updated_at;
  else{
   if(!row.deleted_at||ctx.time-Date.parse(row.deleted_at)>TRASH_DAYS*86400000)fail(404,'not-found');
   patch.deleted_at=null;await limits(ctx,{[kind]:{...row,...patch}});
  }
  const consume=await rate(ctx,action,payload);
  if(!await (kind==='work'?repo.updateWork(row.id,patch,{expectVersion:row.version}):repo.updateAsset(row.id,patch,{expectVersion:row.version})))fail(409,'conflict');
  await consume();return {};
 }
 return {
  async handle(user,action,payload={}){
   return run(user,action,payload,async ctx=>{
    if(action==='profile.setNickname'){
     if(typeof payload.nickname!=='string')fail(400,'invalid');const nickname=payload.nickname.normalize('NFC').trim();
     if(Array.from(nickname).length<2||Array.from(nickname).length>20||/[\x00-\x1f\x7f-\x9f]/.test(nickname))fail(400,'invalid','닉네임은 제어 문자 없는 2~20자로 입력하세요.');
     const consume=await rate(ctx,action,payload);
     try{await repo.setNickname(ctx.uid,nickname);}catch(error){if(error.code==='23505')fail(400,'invalid','이미 사용 중인 닉네임이에요.');throw error;}
     await consume();return {nickname};
    }
    if(action==='import.begin'){
     if((await repo.importRunsSince(ctx.uid,ctx.time-IMPORT.windowMs)).length)fail(429,'limit-import');
     const run=await repo.startImport(ctx.uid,{started_at:new Date(ctx.time).toISOString(),expires_at:new Date(ctx.time+IMPORT.durationMs).toISOString()});
     return {token:run.token,expiresAt:run.expires_at};
    }
    if(action==='blob.missing'){
     if(!Array.isArray(payload.hashes)||payload.hashes.length>IMPORT.blobs||payload.hashes.some(hash=>typeof hash!=='string'||!hashPattern.test(hash)))fail(400,'invalid');
     const hashes=[...new Set(payload.hashes)],have=new Set(await repo.hasBlobs(hashes));return {missing:hashes.filter(hash=>!have.has(hash))};
    }
    if(![...writeActions,'work.saveDraft'].includes(action))fail(400,'invalid');
    const [kind,operation]=action.split('.');
    if(!['work','asset'].includes(kind))fail(400,'invalid');
    if(operation==='create')return create(ctx,payload,kind);
    if(operation==='save'||kind==='work'&&operation==='saveDraft')return save(ctx,payload,kind,operation==='saveDraft');
    if(['delete','restore','setVisibility'].includes(operation))return change(ctx,action,payload,kind);
    if(operation==='copy'){
     const source=await (kind==='work'?repo.getWork(payload.sourceId):repo.getAsset(payload.sourceId));
     if(!source||source.visibility!=='public'||source.deleted_at)fail(404,'not-found');
     return create(ctx,payload,kind,source);
    }
    fail(400,'invalid');
   });
  },
  async uploadBlob(user,sha,bytes,{importToken}={}){
   return run(user,'blob.upload',importToken===undefined?{}:{importToken},async ctx=>{
    if(typeof sha!=='string'||!hashPattern.test(sha)||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>MAX_BLOB_BYTES)fail(400,'invalid','그림은 최대 20 MB의 PNG, JPEG, WebP여야 해요.');
    const mime=sniffImage(bytes),size=mime&&imageSize(bytes,mime);
    if(!size||size.some(n=>!Number.isSafeInteger(n)||n<1||n>8192)||size[0]*size[1]>16777216||await sha256Hex(bytes)!==sha)fail(400,'invalid','그림의 형식·픽셀 크기·해시가 올바르지 않아요.');
    if((await repo.hasBlobs([sha])).includes(sha))return {sha256:sha};
    await limits(ctx,{extraRefs:[sha],extraSizes:{[sha]:bytes.length}});
    const consume=await rate(ctx,'blob.upload',importToken===undefined?{}:{importToken},{counter:'blobs'});
    await storage.put(sha,bytes,mime);
    await repo.insertBlob({sha256:sha,mime,bytes:bytes.length,uploader:ctx.uid,created_at:new Date(ctx.time).toISOString()});
    await consume();return {sha256:sha};
   });
  }
 };
}
