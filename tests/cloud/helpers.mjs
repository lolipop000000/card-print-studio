import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

export function localTestConfig(env=process.env){
 for(const key of ['CLOUD_TEST_URL','CLOUD_TEST_ANON_KEY','CLOUD_TEST_SERVICE_KEY','CLOUD_TEST_DB_URL'])if(!env[key]?.trim())throw Error(`${key} 설정이 필요해요.`);
 const url=env.CLOUD_TEST_URL.trim();
 if(!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/i.test(url))throw Error('통합 테스트는 명시적인 로컬 HTTP 주소에서만 실행할 수 있어요.');
 let db;try{db=new URL(env.CLOUD_TEST_DB_URL);}catch{throw Error('로컬 DB 주소가 올바르지 않아요.');}
 if(!['postgres:','postgresql:'].includes(db.protocol)||!['127.0.0.1','localhost'].includes(db.hostname))throw Error('통합 테스트 DB도 로컬 주소여야 해요.');
 return {url:new URL(url).origin,anonKey:env.CLOUD_TEST_ANON_KEY,serviceKey:env.CLOUD_TEST_SERVICE_KEY,dbUrl:env.CLOUD_TEST_DB_URL};
}

export function must(result,label='local Supabase request'){
 if(result.error)throw Error(`${label} 실패 (${result.error.code??result.error.statusCode??result.status??'unknown'})`);
 return result.data;
}

export async function waitUntil(predicate,label,{timeout=10000}={}){
 const end=Date.now()+timeout;
 while(Date.now()<end){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}
 throw Error(`${label}: 제한 시간 안에 결과를 받지 못했어요.`);
}

export function localClients(env=process.env){
 const config=localTestConfig(env);
 const localFetch=(input,init={})=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.origin!==config.url)throw Error('로컬 테스트에서 외부 요청을 차단했어요.');
  return fetch(input,{...init,redirect:'error',signal:init.signal??AbortSignal.timeout(20000)});
 };
 const client=key=>createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}});
 return {config,admin:client(config.serviceKey),anon:client(config.anonKey),newClient:()=>client(config.anonKey)};
}

export async function createTestUser(clients,status='pending'){
 const email=`cloud-${randomUUID()}@example.test`,password=randomUUID()+randomUUID();
 const {user}=must(await clients.admin.auth.admin.createUser({email,password,email_confirm:true}),'create test user');
 const initial=must(await clients.admin.from('profiles').select('status').eq('id',user.id).single(),'new profile');
 const client=clients.newClient();
 try{
  if(status!=='pending')must(await clients.admin.from('profiles').update({status}).eq('id',user.id),'set test role');
  const session=must(await client.auth.signInWithPassword({email,password}),'password login').session;
  return {id:user.id,client,session,name:status,initialStatus:initial.status};
 }catch(error){await clients.admin.auth.admin.deleteUser(user.id);throw error;}
}

export async function cloudFixture(){
 const clients=localClients(),{admin,anon}=clients,users=[],hashes=[],extraFeed=[];
 async function dispose(){
  await Promise.all([admin,anon,...users.map(user=>user.client)].map(client=>client.removeAllChannels()));
  if(hashes.length)must(await admin.from('blobs').delete().in('sha256',hashes),'clean test blobs');
  if(extraFeed.length)must(await admin.from('public_feed').delete().in('item_id',extraFeed),'clean test feed');
  if(users.length)must(await admin.from('audit_log').delete().in('actor',users.map(user=>user.id)),'clean test audit');
  for(const user of users)must(await admin.auth.admin.deleteUser(user.id),'clean test user');
 }
 try{
  for(const role of ['pending','revoked','trial','member'])users.push(await createTestUser(clients,role));
  const roles=[...users],source=await createTestUser(clients,'member');users.push(source);
  const userIds=users.map(user=>user.id);
  const blank=await createTestUser(clients);users.push(blank);
  must(await admin.from('profiles').delete().eq('id',blank.id),'empty profile slot');
  hashes.push(...[0,1,2].map(()=>randomUUID().replaceAll('-','').repeat(2)));
  must(await admin.from('blobs').insert(hashes.map((sha256,index)=>({sha256,mime:'image/png',bytes:[100,50,700][index],uploader:source.id}))),'seed blob metadata');
  const work=async(owner,title,card_count=0,extra={})=>must(await admin.from('works').insert({owner,title,data:{secret:title},card_count,...extra}).select().single(),'seed work');
  const draft=async(w,card_count,blob_refs=[])=>must(await admin.from('work_drafts').insert({work_id:w.id,owner:w.owner,data:{secret:'非公開 draft'},card_count,blob_refs}),'seed draft');
  const version=async w=>must(await admin.from('work_versions').insert({work_id:w.id,version:1,data:{secret:'private version'},blob_refs:[]}),'seed version');
  const publicWork=await work(source.id,'공개 작업',2,{visibility:'public',blob_refs:[hashes[0]]}),privateWork=await work(source.id,'비공개 작업',1,{blob_refs:[hashes[0]]});
  await draft(publicWork,4,[hashes[1]]);await draft(privateWork,3,[hashes[0]]);await version(privateWork);
  const own={};for(const role of roles){own[role.name]=await work(role.id,`내 ${role.name} 작업`,1);await draft(own[role.name],1);await version(own[role.name]);}
  const emptyWork=await work(source.id,'초안 없는 작업'),feedWork=await work(source.id,'피드 검사'),realtimeWork=await work(source.id,'실시간 검사');
  await work(source.id,'삭제한 작업',100,{deleted_at:new Date().toISOString(),blob_refs:[hashes[2]]});
  const asset=async(title,extra={})=>must(await admin.from('shared_assets').insert({owner:source.id,kind:'image',title,data:{secret:title},...extra}).select().single(),'seed asset');
  const publicAsset=await asset('공개 그림',{visibility:'public',blob_refs:[hashes[1]]}),privateAsset=await asset('비공개 그림',{blob_refs:[hashes[0]]}),feedAsset=await asset('피드 그림');
  await asset('삭제한 그림',{deleted_at:new Date().toISOString(),blob_refs:[hashes[2]]});
  const auditId=must(await admin.from('audit_log').insert({actor:source.id,action:'test-seed',ok:true}).select('id').single(),'seed audit').id;
  const importId=must(await admin.from('import_runs').insert({owner:source.id,token:randomUUID(),expires_at:new Date(Date.now()+60000).toISOString()}).select('id').single(),'seed import').id;
  return {...clients,roles,source,userIds,initialStatus:users[0].initialStatus,own,publicWork,privateWork,emptyWork,publicAsset,privateAsset,feedWork,feedAsset,realtimeWork,hashes,auditId,importId,emptyProfileId:blank.id,png:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=','base64'),dispose};
 }catch(error){await dispose();throw error;}
}
