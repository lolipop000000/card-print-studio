function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
export function diffManifest(previous,next){
 const delta=kind=>{
  const before=new Map((previous?.[kind]??[]).map(item=>[item.id,item])),after=new Map((next?.[kind]??[]).map(item=>[item.id,item]));
  return {changed:[...after].filter(([id,item])=>JSON.stringify(canonical(before.get(id)))!==JSON.stringify(canonical(item))).map(([id])=>id),removed:[...before.keys()].filter(id=>!after.has(id))};
 };
 const blobs=manifest=>new Set([...(manifest?.works??[]),...(manifest?.assets??[])].flatMap(item=>item.blobs??[]));
 const works=delta('works'),assets=delta('assets'),oldBlobs=blobs(previous);
 return {changedWorks:works.changed,removedWorks:works.removed,changedAssets:assets.changed,removedAssets:assets.removed,newBlobs:[...blobs(next)].filter(sha=>!oldBlobs.has(sha)).sort()};
}
