import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import postgres from 'npm:postgres@3.4.7';
import {runMaintenance} from '../_shared/maintenance.js';
import {createMaintenanceRepo} from '../_shared/maintenance-repo.js';
import {authorizeMaintenance} from '../_shared/maintenance-auth.js';
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,admin=createClient(Deno.env.get('SUPABASE_URL')!,key,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,connect_timeout:10,idle_timeout:20});
Deno.serve(async(request:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 if(!await authorizeMaintenance(request,{legacyKey:key,secretKeys:Deno.env.get('SUPABASE_SECRET_KEYS')}))return new Response(JSON.stringify({ok:false,code:'unauthorized'}),{status:401,headers});
 if(request.method!=='POST')return new Response(JSON.stringify({ok:false,code:'method-not-allowed'}),{status:405,headers});
 try{
  const result=await runMaintenance({repo:createMaintenanceRepo(sql),storage:{async remove(hash:string){const {error}=await admin.storage.from('blobs').remove([hash]);if(error)throw Error('storage-unavailable');}}});
  return new Response(JSON.stringify({ok:true,result}),{headers});
 }catch{return new Response(JSON.stringify({ok:false,code:'maintenance-failed'}),{status:503,headers});}
});
