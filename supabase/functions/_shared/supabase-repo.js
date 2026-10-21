// The authenticated HTTP adapter creates one of these per request. A database
// transaction and advisory lock protect quota checks across separate isolates.
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createSupabaseRepo(sql){
 let db=sql,owner=null,audits=null;
 const record=entry=>sql`insert into public.audit_log ${sql({...entry,detail:sql.json(entry.detail)},'actor','action','target','ok','detail')}`;
 const columns={works:['title','visibility','data','card_count','blob_refs','version','source_work_id','source_owner','updated_at','deleted_at'],shared_assets:['kind','title','visibility','data','blob_refs','version','source_asset_id','source_owner','updated_at','deleted_at']};
 function values(row,keys){const result={};for(const key of keys)if(row[key]!==undefined)result[key]=key==='data'?db.json(row[key]):key==='blob_refs'?db.array(row[key],1009):row[key];return result;}
 async function get(table,id){if(!uuid(id))return null;return (await db`select * from ${db('public.'+table)} where id=${id} for share`)[0]??null;}
 async function insert(table,row){const data=values(row,['id','owner',...columns[table]]);return (await db`insert into ${db('public.'+table)} ${db(data,...Object.keys(data))} returning *`)[0];}
 async function update(table,id,patch,{expectVersion}={}){
  if(!uuid(id))return null;
  const data=values(patch,columns[table]);
  return (await db`update ${db('public.'+table)} set ${db(data,...Object.keys(data))} where id=${id} and owner=${owner} and version=${expectVersion} returning *`)[0]??null;
 }
 const repo={
  async withOwnerLock(id,operation){
   const pending=[];let result;
   try{
    result=await sql.begin(async transaction=>{
     db=transaction;owner=uuid(id)?id:null;audits=pending;
     await db`set local lock_timeout = '10s'`;await db`set local statement_timeout = '15s'`;
     await db`select pg_advisory_xact_lock(hashtextextended(${id},0))`;
     const output=await operation();
     for(const entry of pending)await db`insert into public.audit_log ${db({...entry,detail:db.json(entry.detail)},'actor','action','target','ok','detail')}`;
     return output;
    });
   }catch(error){
    // Failed domain operations roll back every row write; their audit survives
    // in a separate transaction. Never store request bodies, tokens or SQL text.
    for(const entry of pending)await record({...entry,ok:false,detail:{code:typeof error.code==='string'?error.code:'internal'}});
    throw error;
   }finally{db=sql;owner=null;audits=null;}
   return result;
  },
  async getProfile(id){return (await db`select id,status,nickname from public.profiles where id=${id} for share`)[0]??null;},
  async setNickname(id,nickname){await db`update public.profiles set nickname=${nickname} where id=${id}`;},
  async getTierLimits(tier){return (await db`select * from public.tier_limits where tier=${tier}`)[0]??null;},
  async usage(id,changes={}){
   const works=await db`select id,owner,card_count,blob_refs,deleted_at from public.works where owner=${id}`;
   const drafts=await db`select work_id,card_count,blob_refs from public.work_drafts where owner=${id}`;
   const assets=await db`select id,owner,blob_refs,deleted_at from public.shared_assets where owner=${id}`;
   const workMap=new Map(works.map(row=>[row.id,row])),draftMap=new Map(drafts.map(row=>[row.work_id,row])),assetMap=new Map(assets.map(row=>[row.id,row]));
   if(changes.work)workMap.set(changes.work.id,changes.work);if(changes.asset)assetMap.set(changes.asset.id,changes.asset);
   if(changes.draft)draftMap.set(changes.draft.work_id,changes.draft);if(changes.clearDraft)draftMap.delete(changes.clearDraft);
   let cards=0;const refs=new Set(changes.extraRefs??[]),add=row=>{for(const ref of row?.blob_refs??[])refs.add(ref);};
   for(const row of workMap.values())if(row.owner===id&&!row.deleted_at){const draft=draftMap.get(row.id);cards+=Math.max(row.card_count,draft?.card_count??0);add(row);add(draft);}
   for(const row of assetMap.values())if(row.owner===id&&!row.deleted_at)add(row);
   const sizes=refs.size?await db`select sha256,bytes from public.blobs where sha256=any(${db.array([...refs],1009)})`:[];
   const byteMap=new Map(sizes.map(row=>[row.sha256,Number(row.bytes)]));let blob_bytes=0;
   for(const ref of refs)blob_bytes+=changes.extraSizes?.[ref]??byteMap.get(ref)??0;
   return {cards,blob_bytes};
  },
  async countAudit(id,actions,sinceMs){return Number((await db`select count(*) as n from public.audit_log where actor=${id} and ok and action=any(${db.array(actions,1009)}) and created_at>${new Date(sinceMs)}`)[0].n);},
  async audit(entry){if(audits)audits.push(entry);else await record(entry);},
  getWork:id=>get('works',id),insertWork:row=>insert('works',row),updateWork:(id,patch,options)=>update('works',id,patch,options),
  getAsset:id=>get('shared_assets',id),insertAsset:row=>insert('shared_assets',row),updateAsset:(id,patch,options)=>update('shared_assets',id,patch,options),
  async getDraft(id){if(!uuid(id))return null;return (await db`select * from public.work_drafts where work_id=${id}`)[0]??null;},
  async putDraft(row,{expectSavedAt}){
   const data=values(row,['work_id','owner','data','card_count','blob_refs','saved_at']);
   if(expectSavedAt===null)return (await db`insert into public.work_drafts ${db(data,...Object.keys(data))} on conflict(work_id) do nothing returning *`)[0]??null;
   return (await db`update public.work_drafts set ${db(data,...Object.keys(data))} where work_id=${row.work_id} and owner=${owner} and saved_at=${expectSavedAt} returning *`)[0]??null;
  },
  async deleteDraft(id){await db`delete from public.work_drafts where work_id=${id} and owner=${owner}`;},
  async pushVersion(id,version,data,refs){await db`insert into public.work_versions(work_id,version,data,blob_refs) values(${id},${version},${db.json(data)},${db.array(refs,1009)})`;},
  async pruneVersions(id,keep){await db`delete from public.work_versions where work_id=${id} and id not in(select id from public.work_versions where work_id=${id} order by version desc limit ${keep})`;},
  async hasBlobs(hashes){if(!hashes.length)return [];return (await db`select sha256 from public.blobs where sha256=any(${db.array(hashes,1009)})`).map(row=>row.sha256);},
  async insertBlob(row){await db`insert into public.blobs ${db(row,'sha256','mime','bytes','uploader','created_at')} on conflict(sha256) do nothing`;},
  async importRunsSince(id,ms){return await db`select * from public.import_runs where owner=${id} and started_at>${new Date(ms)}`;},
  async startImport(id,options){return (await db`insert into public.import_runs(owner,token,started_at,expires_at) values(${id},${crypto.randomUUID()},${options.started_at},${options.expires_at}) returning *`)[0];},
  async consumeImport(token,counter){if(!['decks','blobs'].includes(counter))throw Error('Invalid import counter');await db`update public.import_runs set ${db(counter)}=${db(counter)}+1 where token=${token} and owner=${owner}`;}
 };
 return repo;
}
