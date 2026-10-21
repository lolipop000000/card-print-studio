export async function installCloud(page,options={}){
 await page.evaluate(options=>{
  const fixture={loggedIn:options.loggedIn??true,profile:{id:'u',nickname:options.nickname===undefined?'친구':options.nickname,status:options.status??'member'},calls:[],auth:new Set(),feed:new Set(),works:[],assets:[],blobs:new Map(),usage:{cards:0,blob_bytes:0}};
  const client={availability:{available:true,reason:null},config:{url:'https://example.supabase.co',anonKey:'public',pagesOrigin:'https://lolipop000000.github.io'},
   async session(){return fixture.loggedIn?{user:{id:'u'},accessToken:'test'}:null;},async myProfile(){return fixture.loggedIn?structuredClone(fixture.profile):null;},
   onAuthChange(fn){fixture.auth.add(fn);return ()=>fixture.auth.delete(fn);},async signIn(){fixture.loggedIn=true;for(const fn of fixture.auth)fn();},async signOut(){fixture.loggedIn=false;for(const fn of fixture.auth)fn();},
   async select(table,query={}){const rows=table==='works'?fixture.works:table==='shared_assets'?fixture.assets:table==='work_drafts'?[]:table==='tier_limits'?[{tier:'trial',max_cards:10,max_blob_bytes:15728640},{tier:'member',max_cards:120,max_blob_bytes:157286400}]:[];const selected=rows.filter(row=>Object.entries(query.eq??{}).every(([key,value])=>row[key]===value)&&Object.entries(query.is??{}).every(([key,value])=>row[key]===value));return structuredClone(query.single?selected[0]??null:selected);},
   async usage(){return {...fixture.usage};},subscribeFeed(fn){fixture.feed.add(fn);return ()=>fixture.feed.delete(fn);},
   async call(action,payload){fixture.calls.push({action,payload:structuredClone(payload)});
    if(fixture.profile.status==='revoked'||fixture.profile.status==='pending')throw Object.assign(new Error('관리자 승인 후 저장과 공유를 쓸 수 있어요.'),{status:403,code:'not-member'});
    if(action==='profile.setNickname'){fixture.profile.nickname=payload.nickname;return {nickname:payload.nickname};}
    if(action==='blob.missing')return {missing:payload.hashes.filter(hash=>!fixture.blobs.has(hash))};
    if(action==='work.create'){const row={id:crypto.randomUUID(),owner:'u',title:payload.title,data:structuredClone(payload.data),version:1,visibility:'private',deleted_at:null,updated_at:new Date().toISOString()};fixture.works.push(row);return {id:row.id,version:1};}
    if(action==='work.save'){const row=fixture.works.find(row=>row.id===payload.id);row.data=structuredClone(payload.data);return {version:++row.version};}
    if(action==='work.saveDraft')return {savedAt:new Date().toISOString()};
    throw Error('Fake action not implemented: '+action);
   },async uploadBlob(hash,bytes){fixture.blobs.set(hash,new Uint8Array(bytes));}
  };
  fixture.client=client;window.__cloudFixture=fixture;
  window.showDirectoryPicker=undefined;
  window.__cloudTest.install(client);
 },options);
 await page.waitForSelector('#cloud-account[data-refreshed="true"]');
}
