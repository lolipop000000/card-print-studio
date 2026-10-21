async function sameKey(supplied,expected){
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(supplied),digest(expected)]);
 let difference=0;
 for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
 return difference===0;
}

export async function authorizeMaintenance(request,{legacyKey,secretKeys}={}){
 const supplied=request.headers.get('apikey');
 if(supplied?.startsWith('sb_secret_')&&supplied.length<=16384){
  let configured;
  try{configured=JSON.parse(secretKeys);}catch{configured=null;}
  if(configured&&typeof configured==='object'&&!Array.isArray(configured)){
   let matched=false;
   for(const key of Object.values(configured)){
    if(typeof key==='string'&&key.startsWith('sb_secret_')&&key.length<=16384)matched=(await sameKey(supplied,key))||matched;
   }
   if(matched)return true;
  }
 }
 const bearer=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!bearer||bearer.length>16384||typeof legacyKey!=='string'||!legacyKey)return false;
 return sameKey(bearer,legacyKey);
}
