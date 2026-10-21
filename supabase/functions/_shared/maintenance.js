export async function runMaintenance({repo,storage,now=Date.now}){
 const time=now(),before=days=>new Date(time-days*86400000).toISOString();
 return repo.runExclusive(async()=>{
  const trashed=await repo.purgeTrash(before(30)),orphans=await repo.orphanBlobs(before(1));
  for(const hash of orphans){await storage.remove(hash);await repo.deleteBlob(hash);}
  const audits=await repo.purgeAudit(before(90));return {trashed,blobs:orphans.length,audits};
 });
}
