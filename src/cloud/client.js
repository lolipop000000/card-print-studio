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
 async function request(path,body,contentType,{expectedUserId}={}){
  get();let current=await session();
  if(!current)throw new CloudError(401,'unauthenticated','로그인 후 다시 시도하세요.');
  const owner=expectedUserId??current.user.id;
  for(let attempt=0;attempt<2;attempt++){
   if(current.user.id!==owner)throw new CloudError(0,'account-changed','계정이 바뀌어 이전 요청을 중단했어요.');
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
  if(query.limit!==undefined&&(!Number.isSafeInteger(query.limit)||query.limit<1))throw new CloudError(400,'invalid','조회 개수가 올바르지 않아요.');
  const key=({public_feed:'item_id',work_drafts:'work_id',tier_limits:'tier'})[table]??'id',rows=[],cap=query.limit??Infinity;
  for(let offset=0;;){
   let builder=get().from(table).select(query.columns??'*');
   for(const method of ['eq','is','in'])for(const [column,value] of Object.entries(query[method]??{}))builder=builder[method](column,value);
   if(query.order)builder=builder.order(query.order.column,{ascending:query.order.ascending??false});
   if(query.order?.column!==key)builder=builder.order(key,{ascending:true});
   const size=Math.min(1000,cap-offset);
   const {data,error}=await (query.single?builder.maybeSingle():builder.range(offset,offset+size-1));if(error)throw sdkError(error);
   if(query.single)return data;
   rows.push(...data);if(data.length<size||rows.length>=cap)return rows;offset+=data.length;
  }
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
  call:(action,payload={},options)=>request('',JSON.stringify({action,payload}),'application/json',options),
  uploadBlob:(hash,bytes,mime,{importToken,expectedUserId}={})=>request('?action=blob.upload&sha='+encodeURIComponent(hash)+(importToken?'&importToken='+encodeURIComponent(importToken):''),bytes,mime,{expectedUserId}),
  async usage(){const {data,error}=await get().rpc('my_usage');if(error)throw sdkError(error);return Array.isArray(data)?data[0]:data;},
  subscribeFeed(onChange,{onReady=()=>{}}={}){
   if(!available)return ()=>{};let active=true;
   const channel=get().channel('public-feed-'+(++channelId)).on('system',{},payload=>{if(active&&payload.extension==='postgres_changes'&&payload.status==='ok')onReady();}).on('postgres_changes',{event:'*',schema:'public',table:'public_feed'},payload=>{
    if(active)onChange({type:payload.eventType==='DELETE'?'delete':'upsert',row:payload.eventType==='DELETE'?payload.old:payload.new});
   }).subscribe();
   return ()=>{active=false;get().removeChannel(channel);};
  }
 };
}
