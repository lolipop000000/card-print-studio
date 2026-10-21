import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const script=new URL('../scripts/maintenance-request.mjs',import.meta.url);
const key='test-only-admin-key';

async function run(t,handler,env={}){
 const directory=await mkdtemp(path.join(tmpdir(),'maintenance-report-'));
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  const relative=path.relative(path.resolve(tmpdir()),path.resolve(directory));
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  await rm(directory,{recursive:true,force:true});
 });
 const reportFile=path.join(directory,'result.json');
 const child=spawn(process.execPath,[fileURLToPath(script)],{
  env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,SUPABASE_SERVICE_ROLE_KEY:key,MAINTENANCE_REPORT_FILE:reportFile,...env},
  stdio:['ignore','pipe','pipe'],windowsHide:true
 });
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>output+=bytes.toString());
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 assert.ok(existsSync(reportFile),'CLI must write a bounded maintenance result');
 const report=JSON.parse(await readFile(reportFile,'utf8'));
 assert.ok(!output.includes(key));
 assert.ok(!JSON.stringify(report).includes(key));
 return {exitCode,output,report};
}

test('successful maintenance reports only HTTP status and verified counters',async t=>{
 const result=await run(t,(request,response)=>{
  assert.equal(request.method,'POST');assert.equal(request.url,'/functions/v1/maintenance');
  assert.equal(request.headers.authorization,`Bearer ${key}`);
  response.end(JSON.stringify({ok:true,result:{trashed:2,blobs:3,audits:4},secret:key}));
 });
 assert.equal(result.exitCode,0);
 assert.deepEqual(result.report,{ok:true,status:200,code:'ok',result:{trashed:2,blobs:3,audits:4}});
});

test('failed maintenance keeps a known error code and excludes response secrets',async t=>{
 const result=await run(t,(_request,response)=>{
  response.writeHead(503);response.end(JSON.stringify({ok:false,code:'maintenance-failed',message:key,stack:'postgresql://secret'}));
 });
 assert.equal(result.exitCode,1);
 assert.deepEqual(result.report,{ok:false,status:503,code:'maintenance-failed'});
 assert.ok(!result.output.includes('postgresql://secret'));
});

test('unknown errors and invalid success payloads never become diagnostic content',async t=>{
 for(const [status,body] of [[401,{ok:false,code:key}],[200,{ok:true,result:{trashed:-1,blobs:0,audits:0}}]]){
  const result=await run(t,(_request,response)=>{response.writeHead(status);response.end(JSON.stringify(body));});
  assert.equal(result.exitCode,1);
  assert.deepEqual(result.report,{ok:false,status,code:'unexpected-response'});
 }
});

test('redirects never forward the administrative header',async t=>{
 let redirected=false;
 const result=await run(t,(request,response)=>{
  if(request.url==='/other'){redirected=true;response.end('{}');return;}
  response.writeHead(302,{Location:'/other'});response.end(key);
 });
 assert.equal(redirected,false);assert.equal(result.exitCode,1);
 assert.deepEqual(result.report,{ok:false,status:0,code:'request-failed'});
});

test('network failures do not expose exception strings or connection details',async t=>{
 const result=await run(t,(request)=>request.socket.destroy());
 assert.equal(result.exitCode,1);
 assert.deepEqual(result.report,{ok:false,status:0,code:'request-failed'});
 assert.ok(!result.output.includes('127.0.0.1'));
});

test('missing credentials stop before contacting the server',async t=>{
 let contacted=false;
 const result=await run(t,(_request,response)=>{contacted=true;response.end('{}');},{SUPABASE_SERVICE_ROLE_KEY:''});
 assert.equal(contacted,false);assert.equal(result.exitCode,1);
 assert.deepEqual(result.report,{ok:false,status:0,code:'configuration-missing'});
});
