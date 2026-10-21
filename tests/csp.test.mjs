import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCsp} from '../scripts/csp.mjs';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const hosts=['https://raw.githubusercontent.com','https://cdn.jsdelivr.net','https://huggingface.co'];
test('built html has csp meta with script hash matching inline script',()=>{
 const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];assert.ok(policy);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1],hash=createHash('sha256').update(script).digest('base64');assert.ok(policy.includes(`'sha256-${hash}'`));
 assert.ok(policy.includes("object-src 'none'"));assert.ok(policy.includes("base-uri 'none'"));assert.ok(!policy.includes("'unsafe-eval'"));
});
test('connect-src contains supabase https and wss and every host the app fetches',()=>{
 const policy=buildCsp('script',{url:'https://cloud-test.supabase.co'}),connect=policy.split(';').find(rule=>rule.trim().startsWith('connect-src')).trim().split(/\s+/);
 for(const host of [...hosts,'https://cloud-test.supabase.co','wss://cloud-test.supabase.co'])assert.ok(connect.includes(host),host);
 assert.ok(buildCsp('script',{url:'http://127.0.0.1:54321'}).includes('ws://127.0.0.1:54321'));
});
test('dist/index.html equals dist/card-print-studio.html',async()=>assert.equal(html,await readFile(new URL('../dist/card-print-studio.html',import.meta.url),'utf8')));
test('no secret key strings in src or dist',async()=>{
 async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())await scan(path);else{
  const source=await readFile(path,'utf8');assert.doesNotMatch(source,/sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY/,path.pathname);
  for(const candidate of source.match(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)??[]){let claims;try{claims=JSON.parse(Buffer.from(candidate.split('.')[1],'base64url'));}catch{continue;}assert.notEqual(claims.role,'service_role',path.pathname);}
 }}}
 await scan(new URL('../src/',import.meta.url));await scan(new URL('../dist/',import.meta.url));
});
