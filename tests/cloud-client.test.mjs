import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudAvailability} from '../src/cloud/config.js';
import {createCloudClient,CloudError} from '../src/cloud/client.js';
import {createBlobStore} from '../src/cloud/blobs.js';
import {sha256Hex} from '../src/cloud/cloud-format.js';
import {readFile,readdir} from 'node:fs/promises';
const config={url:'https://example.supabase.co',anonKey:'public-test-key',pagesOrigin:'https://lolipop000000.github.io'};
const location={protocol:'https:',origin:config.pagesOrigin,pathname:'/card-print-studio/',search:'?code=abc',hash:''};
function fakeSdk(){
 const calls=[],sdk={auth:{async getSession(){return {data:{session:{user:{id:'u'},access_token:'old'}}};},async refreshSession(){calls.push('refresh');return {data:{session:{user:{id:'u'},access_token:'new'}}};},async signInWithOAuth(value){calls.push(value);return {data:{},error:null};},async signOut(){calls.push('sign-out');return {error:null};},onAuthStateChange(fn){sdk.authCallback=fn;return {data:{subscription:{unsubscribe(){calls.push('unsubscribe');}}}};}},
  from(table){calls.push({table});const query={select(columns){calls.push({columns});return query;},eq(key,value){calls.push({eq:[key,value]});return query;},is(key,value){calls.push({is:[key,value]});return query;},order(key,value){calls.push({order:[key,value]});return query;},limit(value){calls.push({limit:value});return query;},range(start,end){calls.push({range:[start,end]});return query;},maybeSingle(){return Promise.resolve({data:{id:'u',nickname:'카드',status:'member'},error:null});},then(resolve,reject){return Promise.resolve({data:[{id:'row'}],error:null}).then(resolve,reject);}};return query;},
  channel(name){calls.push({channel:name});const channel={on(type,filter,fn){calls.push({type,filter});sdk.feedCallback=fn;return channel;},subscribe(){calls.push('subscribe');return channel;}};return channel;},removeChannel(){calls.push('remove-channel');}
 };return {sdk,calls,createSupabase:(url,key,options)=>{calls.push({url,key,options});return sdk;}};
}
const response=(status,result,code='unauthenticated')=>new Response(JSON.stringify(status===200?{ok:true,result}:{ok:false,code,message:'안내'}),{status,headers:{'Content-Type':'application/json'}});
test('collection reads use stable pages beyond the REST 1000 row cap',async()=>{
 const rows=Array.from({length:2003},(_,i)=>({id:String(i).padStart(5,'0')})),ranges=[],orders=[];
 const client=createCloudClient({config,location,createSupabase:()=>({from(){let start=0,end=999;const q={select(){return q;},order(key){orders.push(key);return q;},range(a,b){ranges.push([a,b]);start=a;end=b;return q;},then(resolve,reject){return Promise.resolve({data:rows.slice(start,end+1),error:null}).then(resolve,reject);}};return q;}})});
 const found=await client.select('shared_assets');assert.equal(found.length,2003);assert.equal(found.at(-1).id,'02002');assert.deepEqual(ranges,[[0,999],[1000,1999],[2000,2999]]);assert.ok(orders.every(key=>key==='id'));
});
test('file protocol and empty config are unavailable with reasons',()=>{
 assert.deepEqual(cloudAvailability({protocol:'file:'},config),{available:false,reason:'file'});
 assert.deepEqual(cloudAvailability(location,{url:'',anonKey:''}),{available:false,reason:'unconfigured'});
 assert.deepEqual(cloudAvailability(location,config),{available:true,reason:null});
});
test('call retries once after refreshing an expired session and never loops',async()=>{
 const fake=fakeSdk(),requests=[],client=createCloudClient({config,location,createSupabase:fake.createSupabase,fetchImpl:async(url,init)=>{requests.push({url,init});return response(requests.length===1?401:200,{version:2});}});
 assert.deepEqual(await client.call('work.save',{id:'w',baseVersion:1}),{version:2});
 assert.deepEqual(requests.map(r=>r.init.headers.Authorization),['Bearer old','Bearer new']);assert.equal(fake.calls.filter(c=>c==='refresh').length,1);
 assert.equal(requests[0].init.headers.apikey,config.anonKey);assert.equal(requests[0].url,config.url+'/functions/v1/api');
 const denied=fakeSdk();let attempts=0;const bad=createCloudClient({config,location,createSupabase:denied.createSupabase,fetchImpl:async()=>{attempts++;return response(401);}});
 await assert.rejects(bad.call('work.save',{}),e=>e instanceof CloudError&&e.status===401);assert.equal(attempts,2);assert.equal(denied.calls.filter(c=>c==='refresh').length,1);
});
test('an expired request never retries its private body under another refreshed account',async()=>{
 const fake=fakeSdk();let requests=0;fake.sdk.auth.refreshSession=async()=>({data:{session:{user:{id:'other'},access_token:'other-token'}}});
 const client=createCloudClient({config,location,createSupabase:fake.createSupabase,fetchImpl:async()=>{requests++;return response(401);}});
 await assert.rejects(client.call('work.create',{data:{private:'A'}},{expectedUserId:'u'}),e=>e.code==='account-changed');assert.equal(requests,1);
});
test('call surfaces not-member without retry and network errors are actionable',async()=>{
 const fake=fakeSdk();let attempts=0;const client=createCloudClient({config,location,createSupabase:fake.createSupabase,fetchImpl:async()=>{attempts++;return response(403,null,'not-member');}});
 await assert.rejects(client.call('work.create',{}),e=>e.code==='not-member'&&e.message==='안내');assert.equal(attempts,1);assert.ok(!fake.calls.includes('refresh'));
 const offline=createCloudClient({config,location,createSupabase:fake.createSupabase,fetchImpl:async()=>{throw Error('fetch failed');}});await assert.rejects(offline.call('work.save',{}),e=>e.code==='network'&&e.status===0);
});
test('PKCE Google login, normalized session, readonly selection and feed cleanup use the SDK contract',async()=>{
 const fake=fakeSdk(),client=createCloudClient({config,location,createSupabase:fake.createSupabase});await client.signIn();
 assert.equal(fake.calls[0].options.auth.flowType,'pkce');assert.equal(fake.calls[0].options.auth.detectSessionInUrl,true);
 assert.deepEqual(fake.calls.find(c=>c?.provider),{provider:'google',options:{redirectTo:location.origin+location.pathname}});
 assert.deepEqual(await client.session(),{user:{id:'u'},accessToken:'old'});assert.equal((await client.myProfile()).nickname,'카드');
 assert.deepEqual(await client.select('works',{eq:{visibility:'public'},limit:10}),[{id:'row'}]);
 await assert.rejects(client.select('works',{insert:{owner:'forged'}}),e=>e.code==='invalid');
 const events=[],stop=client.subscribeFeed(e=>events.push(e));fake.sdk.feedCallback({eventType:'INSERT',new:{item_id:'x'}});fake.sdk.feedCallback({eventType:'DELETE',old:{item_id:'x'}});stop();
 assert.deepEqual(events,[{type:'upsert',row:{item_id:'x'}},{type:'delete',row:{item_id:'x'}}]);
 assert.ok(fake.calls.some(c=>c?.filter?.table==='public_feed'));assert.ok(fake.calls.includes('remove-channel'));
 await client.signOut();assert.ok(fake.calls.includes('sign-out'));
});
test('unconfigured and file clients never create the SDK or make a request',async()=>{
 const createSupabase=()=>{throw Error('must stay offline');};const client=createCloudClient({config:{url:'',anonKey:''},location,createSupabase});
 assert.equal(await client.session(),null);assert.equal(await client.myProfile(),null);await assert.rejects(client.signIn(),e=>e.code==='unavailable');
 const local=createCloudClient({config,location:{...location,protocol:'file:'},createSupabase});await assert.rejects(local.call('work.save',{}),e=>e.code==='unavailable');
});
test('ensureUploaded uploads only missing hashes and reports progress',async()=>{
 const one=new Uint8Array([1]),two=new Uint8Array([2]),a=await sha256Hex(one),b=await sha256Hex(two),calls=[],progress=[];
 const client={async call(action,payload){calls.push({action,payload});return {missing:[b]};},async uploadBlob(hash,bytes,mime,options){calls.push({hash,bytes,mime,options});}};
 const store=createBlobStore({client,publicBaseUrl:'https://example.test/blobs'});
 await store.ensureUploaded(new Map([[a,{mime:'image/png',bytes:one}],[b,{mime:'image/png',bytes:two}]]),{onProgress:value=>progress.push(value),importToken:'import-token'});
 assert.equal(calls.filter(c=>c.hash).length,1);assert.equal(calls[1].hash,b);assert.deepEqual(calls[1].bytes,two);assert.equal(calls[1].options.importToken,'import-token');
 assert.deepEqual(progress.map(p=>[p.done,p.total]),[[1,2],[2,2]]);
});
test('fetch rejects bytes whose hash differs and checks cached bytes too',async()=>{
 const bytes=new Uint8Array([10,20,30]),hash=await sha256Hex(bytes),cache=new Map(),urls=[];
 const store=createBlobStore({client:{},publicBaseUrl:'https://example.test/blobs/',cache,fetchImpl:async url=>{urls.push(url);return new Response(bytes);}});
 assert.deepEqual(await store.fetch(hash),bytes);assert.equal(urls[0],'https://example.test/blobs/'+hash);
 const fetched=await store.fetch(hash);fetched[0]=99;assert.deepEqual(await store.fetch(hash),bytes);assert.equal(urls.length,1);
 cache.set(hash,new Uint8Array([1]));await assert.rejects(store.fetch(hash),/그림 데이터가 손상/);
 const bad=createBlobStore({client:{},publicBaseUrl:'https://example.test/blobs',fetchImpl:async()=>new Response(new Uint8Array([1]))});await assert.rejects(bad.fetch(hash),/그림 데이터가 손상/);
});
test('no secret key strings in src or dist, and both HTML entry points carry SDK licenses',async()=>{
 async function check(folder){for(const entry of await readdir(new URL('../'+folder+'/',import.meta.url),{withFileTypes:true})){const path=folder+'/'+entry.name;if(entry.isDirectory())await check(path);else if(/\.(js|html|json|css|txt)$/.test(path)){const text=await readFile(new URL('../'+path,import.meta.url),'utf8');assert.ok(!/sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY/.test(text),path);}}}
 await check('src');await check('dist');
 const html=await readFile(new URL('../dist/card-print-studio.html',import.meta.url),'utf8');assert.equal(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),html);
 assert.ok(html.includes('@supabase/supabase-js 2.118.0'));
});
