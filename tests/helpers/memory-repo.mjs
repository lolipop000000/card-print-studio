// Models the SQL rows and optimistic updates; deliberately no browser or network.
export function memoryRepo({now=()=>Date.now()}={}){
 const state={profiles:new Map(),tiers:new Map([['trial',{max_cards:10,max_blob_bytes:15728640}],['member',{max_cards:120,max_blob_bytes:157286400}]]),works:new Map(),drafts:new Map(),assets:new Map(),blobs:new Map(),versions:new Map(),audits:[],imports:[],puts:[]};
 const copy=v=>v==null?v:structuredClone(v),stamp=()=>new Date(now()).toISOString();
 const repo={
  state,
  async getProfile(id){return copy(state.profiles.get(id));},
  async setNickname(id,nickname){if([...state.profiles.values()].some(p=>p.id!==id&&p.nickname?.toLowerCase()===nickname.toLowerCase()))throw Object.assign(new Error('duplicate'),{code:'23505'});state.profiles.get(id).nickname=nickname;},
  async getTierLimits(tier){return copy(state.tiers.get(tier));},
  async usage(id,changes={}){
   let cards=0;const refs=new Set();
   const add=row=>{for(const ref of row?.blob_refs??[])refs.add(ref);};
   const works=new Map(state.works);if(changes.work)works.set(changes.work.id,changes.work);
   for(const row of works.values())if(row.owner===id&&!row.deleted_at){
    const draft=changes.draft?.work_id===row.id?changes.draft:changes.clearDraft===row.id?null:state.drafts.get(row.id);
    cards+=Math.max(row.card_count,draft?.card_count??0);add(row);add(draft);
   }
   const assets=new Map(state.assets);if(changes.asset)assets.set(changes.asset.id,changes.asset);
   for(const row of assets.values())if(row.owner===id&&!row.deleted_at)add(row);
   for(const ref of changes.extraRefs??[])refs.add(ref);
   const attached=new Set([...state.works.values(),...state.drafts.values(),...state.assets.values(),...[...state.versions.values()].flat()].flatMap(row=>row.blob_refs??[]));
   for(const row of state.blobs.values())if(row.uploader===id&&!attached.has(row.sha256))refs.add(row.sha256);
   let bytes=0;for(const ref of refs)bytes+=changes.extraSizes?.[ref]??state.blobs.get(ref)?.bytes??0;
   return {cards,blob_bytes:bytes};
  },
  async countAudit(id,actions,sinceMs){return state.audits.filter(row=>row.actor===id&&row.ok&&actions.includes(row.action)&&Date.parse(row.created_at)>sinceMs).length;},
  async audit(entry){state.audits.push(copy({...entry,created_at:stamp()}));},
  async getWork(id){return copy(state.works.get(id));},
  async insertWork(row){const result={...row,id:crypto.randomUUID(),created_at:stamp()};state.works.set(result.id,copy(result));return copy(result);},
  async updateWork(id,patch,{expectVersion}={}){const row=state.works.get(id);if(!row||expectVersion!==undefined&&row.version!==expectVersion)return null;Object.assign(row,copy(patch));return copy(row);},
  async getDraft(id){return copy(state.drafts.get(id));},
  async putDraft(row,{expectSavedAt}={}){const old=state.drafts.get(row.work_id);if((old?.saved_at??null)!==expectSavedAt)return null;state.drafts.set(row.work_id,copy(row));return copy(row);},
  async deleteDraft(id){state.drafts.delete(id);},
  async pushVersion(id,version,data,refs){const rows=state.versions.get(id)??[];rows.push(copy({work_id:id,version,data,blob_refs:refs}));state.versions.set(id,rows);},
  async pruneVersions(id,keep){state.versions.set(id,(state.versions.get(id)??[]).slice(-keep));},
  async getAsset(id){return copy(state.assets.get(id));},
  async insertAsset(row){const result={...row,id:crypto.randomUUID(),created_at:stamp()};state.assets.set(result.id,copy(result));return copy(result);},
  async updateAsset(id,patch,{expectVersion}={}){const row=state.assets.get(id);if(!row||expectVersion!==undefined&&row.version!==expectVersion)return null;Object.assign(row,copy(patch));return copy(row);},
  async hasBlobs(hashes){return hashes.filter(hash=>state.blobs.has(hash));},
  async insertBlob(row){if(!state.blobs.has(row.sha256))state.blobs.set(row.sha256,copy(row));},
  async importRunsSince(id,ms){return copy(state.imports.filter(run=>run.owner===id&&Date.parse(run.started_at)>ms));},
  async startImport(id,options){const row={owner:id,decks:0,blobs:0,token:crypto.randomUUID(),started_at:stamp(),expires_at:new Date(now()+7200000).toISOString(),...options};state.imports.push(row);return copy(row);},
  async consumeImport(token,counter){const row=state.imports.find(run=>run.token===token);if(row)row[counter]++;}
 };
 return {repo,storage:{async put(sha,bytes,mime){state.puts.push({sha,bytes:new Uint8Array(bytes),mime});}},state};
}
