import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {buildManifest} from '../_shared/manifest.js';

const serviceUrl=Deno.env.get('SUPABASE_URL')!;
const reader=createClient(serviceUrl,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function publicRows(table:string){
 const result:Record<string,unknown>[]=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await reader.from(table).select('id,owner,title,visibility,deleted_at,data,version,blob_refs,updated_at'+(table==='shared_assets'?',kind':'')).eq('visibility','public').is('deleted_at',null).order('id').range(offset,offset+999);
  if(error)throw Error('read-failed');result.push(...data);if(data.length<1000)return result;
 }
}
function publicOrigin(){
 const configured=new URL(Deno.env.get('PUBLIC_SUPABASE_URL')??serviceUrl);
 if(configured.protocol==='https:'||(configured.protocol==='http:'&&['127.0.0.1','localhost'].includes(configured.hostname)))return configured.origin;
 throw Error('public-url-missing');
}
Deno.serve(async(request:Request)=>{
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='GET')return new Response(JSON.stringify({ok:false,code:'method-not-allowed'}),{status:405,headers});
 try{
  const [works,assets]=await Promise.all([publicRows('works'),publicRows('shared_assets')]);
  const owners=[...new Set([...works,...assets].map(row=>String(row.owner)))],nicknames=new Map();
  for(let start=0;start<owners.length;start+=100){
   const {data,error}=await reader.from('public_profiles').select('id,nickname').in('id',owners.slice(start,start+100));
   if(error)throw Error('read-failed');for(const profile of data)nicknames.set(profile.id,profile.nickname);
  }
  return new Response(JSON.stringify(await buildManifest(works,assets,nicknames,`${publicOrigin()}/storage/v1/object/public/blobs/`)),{headers});
 }catch{return new Response(JSON.stringify({ok:false,code:'unavailable',message:'공개 목록을 불러오지 못했어요.'}),{status:503,headers});}
});
