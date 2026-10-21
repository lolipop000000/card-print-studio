import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import postgres from 'npm:postgres@3.4.7';
import {runMaintenance} from '../_shared/maintenance.js';
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,admin=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,connect_timeout:10,idle_timeout:20});
async function authorized(request:Request){
 const supplied=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!supplied||supplied.length>16384)return false;
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(supplied),digest(key)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
Deno.serve(async(request:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 if(!await authorized(request))return new Response(JSON.stringify({ok:false,code:'unauthorized'}),{status:401,headers});
 if(request.method!=='POST')return new Response(JSON.stringify({ok:false,code:'method-not-allowed'}),{status:405,headers});
 try{
  const result=await sql.begin(async db=>{
   await db`set local lock_timeout = '10s'`;
   // Freeze reference writes until storage deletion and metadata cleanup finish.
   await db`lock table public.works, public.work_drafts, public.work_versions, public.shared_assets, public.blobs in share row exclusive mode`;
   const repo={async runExclusive(fn:()=>unknown){return fn();},async purgeTrash(before:string){const works=await db`delete from public.works where deleted_at < ${before} returning id`,assets=await db`delete from public.shared_assets where deleted_at < ${before} returning id`;return works.length+assets.length;},async orphanBlobs(before:string){
    const rows=await db`select sha256 from public.blobs b where created_at < ${before} and not exists (select 1 from (select unnest(blob_refs) as sha from public.works union all select unnest(blob_refs) from public.work_drafts union all select unnest(blob_refs) from public.work_versions union all select unnest(blob_refs) from public.shared_assets) refs where refs.sha = b.sha256)`;return rows.map(row=>row.sha256);
   },async deleteBlob(hash:string){await db`delete from public.blobs where sha256=${hash}`;},async purgeAudit(before:string){const rows=await db`delete from public.audit_log where created_at < ${before} returning id`;return rows.length;}};
   return runMaintenance({repo,storage:{async remove(hash:string){const {error}=await admin.storage.from('blobs').remove([hash]);if(error)throw Error('storage-unavailable');}}});
  });
  return new Response(JSON.stringify({ok:true,result}),{headers});
 }catch{return new Response(JSON.stringify({ok:false,code:'maintenance-failed'}),{status:503,headers});}
});
