import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,mkdtemp} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {localClients,createTestUser,must} from './helpers.mjs';

const clients=localClients(),{admin,config}=clients,qa=path.resolve('artifacts/qa'),directory=path.join(qa,'cloud-ui-dist'),contexts=[],users=[],errors=[],socketEvents=[];
await mkdir(directory,{recursive:true});
const configFile=path.join(qa,'cloud-ui-config.json');
await writeFile(configFile,JSON.stringify({url:config.url,anonKey:config.anonKey,pagesOrigin:'http://localhost:4173'}));
await promisify(execFile)(process.execPath,['scripts/build.mjs'],{env:{...process.env,STUDIO_CLOUD_CONFIG_FILE:configFile,STUDIO_DIST_DIR:directory}});
const server=createServer(async(req,res)=>{
 try{const name=new URL(req.url,'http://localhost').pathname;if(!['/','/index.html','/card-print-studio.html'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(path.join(directory,'index.html')));}catch{res.writeHead(500).end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4173,'127.0.0.1',resolve);});
async function open(user){
 const profile=await mkdtemp(path.join(qa,'cloud-edge-profile-'));
 const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',viewport:{width:1440,height:1000}});contexts.push(context);
 await context.route(/^https?:/,route=>new URL(route.request().url()).hostname.match(/^(localhost|127\.0\.0\.1)$/)?route.continue():route.abort());
 const storageKey='sb-'+new URL(config.url).hostname.split('.')[0]+'-auth-token';
 await context.addInitScript(({key,session})=>{localStorage.setItem(key,JSON.stringify(session));},{key:storageKey,session:user.session});
 const page=context.pages()[0]??await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://localhost:4173');await page.locator('[data-ready=true]').waitFor();await page.waitForFunction(()=>document.getElementById('cloud-account-status')?.textContent.includes('멤버'));return page;
}
try{
 for(const label of ['A','B']){const user=await createTestUser(clients,'member');users.push(user);must(await admin.from('profiles').update({nickname:'검증'+label+randomUUID().slice(0,6)}).eq('id',user.id),'browser nickname');}
 const a=await open(users[0]),b=await open(users[1]);
 const realtimeReady=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Browser PostgreSQL subscription was not ready: '+JSON.stringify(socketEvents))),15000);
  b.on('websocket',socket=>socket.on('framereceived',frame=>{try{const parsed=JSON.parse(String(frame.payload)),message=Array.isArray(parsed)?{event:parsed[3],payload:parsed[4]}:parsed;socketEvents.push({event:message.event,status:message.payload?.status});if(message.event==='system'&&message.payload?.status==='ok'){clearTimeout(timer);resolve();}}catch{}}));
 });
 realtimeReady.catch(()=>{});
 await b.locator('#cloud-open').click();await b.locator('#cloud-tab-public').click();await realtimeReady;
 await a.locator('#card-name').fill('실제 브라우저 공유 확인');await a.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await a.waitForFunction(()=>document.getElementById('cloud-save-state')?.dataset.state==='saved');
 const aWork=must(await admin.from('works').select('id').eq('owner',users[0].id).single(),'browser A saved work');
 await a.locator('#cloud-open').click();await a.locator(`[data-cloud-item="${aWork.id}"] [data-cloud-action=visibility]`).click();
 const publicRow=b.locator(`[data-cloud-item="${aWork.id}"]`);await publicRow.waitFor({timeout:15000});await b.screenshot({path:path.join(qa,'cloud-live-public.png'),fullPage:true});
 await publicRow.locator('[data-cloud-action=copy]').click();await b.locator('#cloud-panel').waitFor({state:'detached'});await b.waitForFunction(()=>document.getElementById('cloud-save-state')?.dataset.state==='saved');
 const copy=must(await admin.from('works').select('id,source_work_id').eq('owner',users[1].id).single(),'browser B copy');assert.equal(copy.source_work_id,aWork.id);
 must(await admin.from('profiles').update({status:'trial'}).eq('id',users[1].id),'browser trial role');await b.locator('#cloud-account-refresh').click();await b.waitForFunction(()=>document.getElementById('cloud-account-status')?.textContent.includes('준멤버'));
 for(let i=0;i<9;i++)await b.locator('#add-monster').click();await b.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await b.waitForFunction(()=>document.getElementById('cloud-save-state')?.dataset.state==='saved');
 await b.locator('#add-monster').click();await b.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await b.waitForFunction(()=>document.getElementById('cloud-save-state')?.dataset.state==='error');assert.match(await b.locator('#message').innerText(),/최대 10장/);await b.screenshot({path:path.join(qa,'cloud-trial-limit.png'),fullPage:true});
 must(await admin.from('profiles').update({status:'revoked'}).eq('id',users[1].id),'browser revoke role');await b.getByRole('button',{name:'프로젝트 저장',exact:true}).click();await b.waitForFunction(()=>document.getElementById('cloud-save-state')?.dataset.state==='read-only');await b.screenshot({path:path.join(qa,'cloud-revoked-write.png'),fullPage:true});
 const saved=must(await admin.from('works').select('card_count').eq('id',copy.id).single(),'unchanged server after denials');assert.equal(saved.card_count,10);assert.deepEqual(errors,[]);
 const report={checkedAt:new Date().toISOString(),distinctEdgeProfiles:2,realLocalAuth:true,realLocalApi:true,realtimePublish:true,copy:true,trialEleventhDenied:true,revokedNextWriteDenied:true,pageErrors:errors};await writeFile(path.join(qa,'cloud-browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){for(let i=0;i<contexts.length;i++)await contexts[i].pages()[0]?.screenshot({path:path.join(qa,`cloud-browser-failure-${i}.png`),fullPage:true}).catch(()=>{});throw error;}
finally{await Promise.all(contexts.map(context=>context.close()));await new Promise(resolve=>server.close(resolve));for(const user of users){must(await admin.from('audit_log').delete().eq('actor',user.id),'clean browser audit');must(await admin.auth.admin.deleteUser(user.id),'clean browser user');}}
