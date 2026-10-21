import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localTestConfig} from './cloud/helpers.mjs';

const env={CLOUD_TEST_URL:'http://127.0.0.1:54321',CLOUD_TEST_ANON_KEY:'test-public',CLOUD_TEST_SERVICE_KEY:'test-admin',CLOUD_TEST_DB_URL:'postgresql://postgres:local-password@127.0.0.1:54322/postgres'};
test('cloud integration setup accepts only explicit local HTTP and database endpoints',()=>{
 for(const host of ['127.0.0.1','localhost'])assert.equal(new URL(localTestConfig({...env,CLOUD_TEST_URL:`http://${host}:54321`}).url).hostname,host);
 for(const url of ['https://example.supabase.co','http://127.0.0.1.example.com','http://user:pass@localhost:54321','http://localhost:54321/remote','http://localhost:54321?token=unsafe','file:///localhost','http://2130706433:54321','http://127.1:54321']){
  assert.throws(()=>localTestConfig({...env,CLOUD_TEST_URL:url}),/로컬/);
 }
 assert.throws(()=>localTestConfig({...env,CLOUD_TEST_DB_URL:'postgresql://user:password@example.com/postgres'}),/로컬/);
 assert.throws(()=>localTestConfig({...env,CLOUD_TEST_SERVICE_KEY:''}),/CLOUD_TEST_SERVICE_KEY/);
});

test('cloud migrations preserve Appendix A SQL verbatim',async()=>{
 const plan=await readFile(new URL('../docs/superpowers/plans/2026-10-21-cloud-sharing.md',import.meta.url),'utf8');
 const appendix=plan.slice(plan.indexOf('## 부록 A.'));
 const blocks=[...appendix.matchAll(/```sql\r?\n([\s\S]*?)\r?\n```/g)].map(match=>match[1].replaceAll('\r\n','\n'));
 assert.equal(blocks.length,3);
 for(const [index,name]of ['cloud_schema','cloud_policies','my_usage'].entries()){
  const sql=await readFile(new URL(`../supabase/migrations/2026102100000${index+1}_${name}.sql`,import.meta.url),'utf8');
  assert.equal(sql.replaceAll('\r\n','\n').trimEnd(),blocks[index].trimEnd());
 }
});
