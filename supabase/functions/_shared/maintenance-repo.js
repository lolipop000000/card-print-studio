// Journal in the existing server-only audit table; Appendix A stays unchanged.
// Commit unavailable metadata before the irreversible object deletion.
export const GC_LOCK=731947265;
export const GC_PENDING='maintenance.blob-delete-pending';
export function createMaintenanceRepo(sql){
 let db;
 async function transaction(fn){await db`begin`;try{const value=await fn(db);await db`commit`;return value;}catch(error){await db`rollback`;throw error;}}
 return {
  async runExclusive(fn){
   db=await sql.reserve();let locked=false;
   try{await db`set lock_timeout='10s'`;await db`select pg_advisory_lock(${GC_LOCK})`;locked=true;return await fn();}
   finally{try{if(locked)await db`select pg_advisory_unlock(${GC_LOCK})`;}finally{try{await db`reset lock_timeout`;}finally{db.release();db=null;}}}
  },
  async purgeTrash(before){return transaction(async tx=>{const works=await tx`delete from public.works where deleted_at < ${before}`,assets=await tx`delete from public.shared_assets where deleted_at < ${before}`;return works.count+assets.count;});},
  async orphanBlobs(before){
   const rows=await db`select sha256 from public.blobs b where created_at < ${before} and not exists (select 1 from (select unnest(blob_refs) as sha from public.works union all select unnest(blob_refs) from public.work_drafts union all select unnest(blob_refs) from public.work_versions union all select unnest(blob_refs) from public.shared_assets) refs where refs.sha=b.sha256) union select detail->>'sha256' from public.audit_log where action=${GC_PENDING}`;
   return rows.map(row=>row.sha256).filter(hash=>/^[a-f0-9]{64}$/.test(hash));
  },
  async prepareBlobDeletion(hash){
   await transaction(async tx=>{
    if(!(await tx`select id from public.audit_log where action=${GC_PENDING} and detail->>'sha256'=${hash}`).length)await tx`insert into public.audit_log(actor,action,ok,detail) values(null,${GC_PENDING},false,${tx.json({sha256:hash})})`;
    await tx`delete from public.blobs where sha256=${hash}`;
   });
  },
  async finishBlobDeletion(hash){await db`delete from public.audit_log where action=${GC_PENDING} and detail->>'sha256'=${hash}`;},
  async purgeAudit(before){const rows=await db`delete from public.audit_log where created_at < ${before} and action<>${GC_PENDING}`;return rows.count;}
 };
}
