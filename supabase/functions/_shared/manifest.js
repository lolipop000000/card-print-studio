const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
async function hash(data){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(data))));
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function buildManifest(rows,assets,nicknames,blobBaseUrl){
 const nickname=id=>nicknames instanceof Map?nicknames.get(id)??null:nicknames[id]??null;
 const items=async(input,isAsset)=>Promise.all(input.filter(row=>row.visibility==='public'&&!row.deleted_at).map(async row=>({
  id:row.id,...(isAsset?{kind:row.kind}:{}),owner:row.owner,nickname:nickname(row.owner),title:row.title,version:row.version,
  updatedAt:row.updated_at,hash:await hash(row.data),blobs:[...new Set(row.blob_refs??[])].sort()
 })));
 return {format:'card-print-studio-manifest',version:1,generatedAt:new Date().toISOString(),blobBaseUrl,works:await items(rows,false),assets:await items(assets,true)};
}
