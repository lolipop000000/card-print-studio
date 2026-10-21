import {createClient} from '@supabase/supabase-js';
import {cloudConfig,cloudAvailability} from './config.js';
export class CloudError extends Error{
 constructor(status,code,message){super(message);this.name='CloudError';this.status=status;this.code=code;}
}
const tables=new Set(['works','work_drafts','work_versions','shared_assets','profiles','public_profiles','public_feed','tier_limits']);
const unavailable=()=>{throw new CloudError(0,'unavailable','클라우드는 웹 주소에서 설정을 마친 뒤 사용할 수 있어요.');};
const sdkError=error=>new CloudError(error.status??400,error.code??'request-failed',error.message??'클라우드 요청을 완료하지 못했어요.');
const normalize=value=>value?{user:value.user,accessToken:value.access_token}:null;

export function createCloudClient({config=cloudConfig,createSupabase=createClient,fetchImpl=globalThis.fetch,location=globalThis.location}={}){
 const available=cloudAvailability(location,config).available;
 let sdk,refreshing,channelId=0;
 const get=()=>{if(!available)unavailable();return sdk??=createSupabase(config.url,config.anonKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true},global:{fetch:fetchImpl}});};
 async function session(){
  if(!available)return null;const {data,error}=await get().auth.getSession();if(error)throw sdkError(error);return normalize(data.session);
 }
 async function refresh(){
  if(!refreshing)refreshing=(async()=>{const {data,error}=await get().auth.refreshSession();if(error)throw sdkError(error);if(!data.session)throw new CloudError(401,'unauthenticated','로그인이 만료됐어요. 다시 로그인하세요.');return normalize(data.session);})().finally(()=>{refreshing=null;});
  return refreshing;
 }
 async function request(path,body,contentType){
  get();let current=await session();
  if(!current)throw new CloudError(401,'unauthenticated','로그인 후 다시 시도하세요.');
  for(let attempt=0;attempt<2;attempt++){
   let response;
   try{response=await fetchImpl(config.url.replace(/\/$/,'')+'/functions/v1/api'+path,{method:'POST',headers:{Authorization:'Bearer '+current.accessToken,apikey:config.anonKey,'Content-Type':contentType},body});}
   catch{throw new CloudError(0,'network','인터넷에 연결하지 못했어요. 편집 내용은 유지돼요. 다시 저장하세요.');}
   if(response.status===401&&attempt===0){current=await refresh();continue;}
   let envelope;try{envelope=await response.json();}catch{throw new CloudError(response.status,'invalid-response','서버 응답을 읽을 수 없어요. 다시 시도하세요.');}
   if(!response.ok||envelope.ok!==true)throw new CloudError(response.status,envelope.code??'request-failed',envelope.message??'클라우드 요청을 완료하지 못했어요.');
   return envelope.result;
  }
 }
 async function select(table,query={}){
  if(!tables.has(table)||!query||typeof query!=='object'||Object.keys(query).some(key=>!['columns','eq','is','in','order','limit','single'].includes(key)))throw new CloudError(400,'invalid','읽기 전용 조회 형식이 올바르지 않아요.');
  let builder=get().from(table).select(query.columns??'*');
  for(const method of ['eq','is','in'])for(const [key,value] of Object.entries(query[method]??{}))builder=builder[method](key,value);
  if(query.order)builder=builder.order(query.order.column,{ascending:query.order.ascending??false});
  if(query.limit!==undefined)builder=builder.limit(query.limit);
  const {data,error}=await (query.single?builder.maybeSingle():builder);if(error)throw sdkError(error);return data;
 }
 return {
  config,availability:cloudAvailability(location,config),session,select,
  async signIn(){const {error}=await get().auth.signInWithOAuth({provider:'google',options:{redirectTo:(location?.origin??config.pagesOrigin)+(location?.pathname??'/')}});if(error)throw sdkError(error);},
  async signOut(){if(!available)return;const {error}=await get().auth.signOut();if(error)throw sdkError(error);},
  onAuthChange(fn){
   if(!available)return ()=>{};let active=true;
   const {data}=get().auth.onAuthStateChange((event,value)=>{queueMicrotask(()=>{if(active)fn(normalize(value),event);});});
   return ()=>{active=false;data.subscription.unsubscribe();};
  },
  async myProfile(){const current=await session();return current?select('profiles',{columns:'id,nickname,status',eq:{id:current.user.id},single:true}):null;},
  call:(action,payload={})=>request('',JSON.stringify({action,payload}),'application/json'),
  uploadBlob:(hash,bytes,mime,{importToken}={})=>request('?action=blob.upload&sha='+encodeURIComponent(hash)+(importToken?'&importToken='+encodeURIComponent(importToken):''),bytes,mime),
  async usage(){const {data,error}=await get().rpc('my_usage');if(error)throw sdkError(error);return Array.isArray(data)?data[0]:data;},
  subscribeFeed(onChange){
   if(!available)return ()=>{};let active=true;
   const channel=get().channel('public-feed-'+(++channelId)).on('postgres_changes',{event:'*',schema:'public',table:'public_feed'},payload=>{
    if(active)onChange({type:payload.eventType==='DELETE'?'delete':'upsert',row:payload.eventType==='DELETE'?payload.old:payload.new});
   }).subscribe();
   return ()=>{active=false;get().removeChannel(channel);};
  }
 };
}
