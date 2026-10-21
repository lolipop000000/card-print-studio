import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import postgres from 'npm:postgres@3.4.7';
import {createApi,ApiError} from '../_shared/handlers.js';
import {createSupabaseRepo} from '../_shared/supabase-repo.js';

const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:3,connect_timeout:10,idle_timeout:20});
const origins=new Set((Deno.env.get('ALLOWED_ORIGINS')??'').split(',').map(value=>value.trim()).filter(Boolean));
const JSON_LIMIT=8.5*1024*1024,BLOB_LIMIT=20*1024*1024;

async function bytes(request:Request,limit:number){
 const length=Number(request.headers.get('Content-Length'));if(length>limit)throw new ApiError(400,'invalid','요청 데이터가 허용 크기를 넘었어요.');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new ApiError(400,'invalid','요청 데이터가 허용 크기를 넘었어요.');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const output=new Uint8Array(size);let at=0;for(const part of parts){output.set(part,at);at+=part.length;}return output;
}

Deno.serve(async(request:Request)=>{
 const origin=request.headers.get('Origin'),headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 const allowed=origin===null||origins.has(origin);
 if(origin&&allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'});
 const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  if(!allowed)throw new ApiError(403,'forbidden','허용된 작업실 주소에서 요청하세요.');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')throw new ApiError(405,'invalid','POST 요청으로 저장하세요.');
  const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  const verified=token?await admin.auth.getUser(token):null,user=verified?.error?null:verified?.data.user??null;
  const repo=createSupabaseRepo(sql),storage={async put(sha:string,data:Uint8Array,mime:string){
   const {error}=await admin.storage.from('blobs').upload(sha,data,{contentType:mime,upsert:false});
   if(error&&!['409','400'].includes(String(error.statusCode)))throw Error('그림 저장소 연결에 실패했어요.');
   if(error&&String(error.statusCode)==='400'&&error.error!=='Duplicate')throw Error('그림을 저장하지 못했어요.');
  }};
  const api=createApi({repo,storage}),url=new URL(request.url);
  // Run authentication/approval even for malformed bodies, consistently with the matrix.
  if(!user)await api.handle(null,'request.denied',{});
  const profile=await repo.getProfile(user!.id);if(!profile||!['trial','member'].includes(profile.status))await api.handle(user,'request.denied',{});
  let result;
  if(url.searchParams.get('action')==='blob.upload')result=await api.uploadBlob(user,url.searchParams.get('sha'),await bytes(request,BLOB_LIMIT),{importToken:url.searchParams.get('importToken')??undefined});
  else{
   let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(request,JSON_LIMIT)));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(400,'invalid','JSON 요청을 읽을 수 없어요.');}
   if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.action!=='string')throw new ApiError(400,'invalid','요청 동작과 내용을 입력하세요.');
   result=await api.handle(user,body.action,body.payload);
  }
  return respond({ok:true,result});
 }catch(error){
  if(error instanceof ApiError)return respond({ok:false,code:error.code,message:error.message},error.status);
  // Logs contain only a bounded error code, never credentials, SQL or payloads.
  console.error('api request failed',typeof error?.code==='string'?error.code.slice(0,40):'internal');
  return respond({ok:false,code:'internal',message:'클라우드 저장에 실패했어요. 잠시 후 다시 시도하세요.'},500);
 }
});
