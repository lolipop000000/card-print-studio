import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import postgres from 'npm:postgres@3.4.7';
import {runMaintenance} from '../_shared/maintenance.js';
import {createMaintenanceRepo} from '../_shared/maintenance-repo.js';
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
  const result=await runMaintenance({repo:createMaintenanceRepo(sql),storage:{async remove(hash:string){const {error}=await admin.storage.from('blobs').remove([hash]);if(error)throw Error('storage-unavailable');}}});
  return new Response(JSON.stringify({ok:true,result}),{headers});
 }catch{return new Response(JSON.stringify({ok:false,code:'maintenance-failed'}),{status:503,headers});}
});
