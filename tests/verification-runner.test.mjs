import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const moduleUrl=new URL('../scripts/verify.mjs',import.meta.url);
async function api(){
 const present=await readFile(moduleUrl,'utf8').catch(()=>null);
 assert.ok(present,'The repeatable verification command must be kept in the repository');
 return import(moduleUrl);
}
async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'card-verification-'));
 for(const dir of ['src','scripts','tests','vendor','dist'])await mkdir(path.join(root,dir));
 await writeFile(path.join(root,'src','app.js'),'original source');
 for(const file of ['package.json','release.json'])await writeFile(path.join(root,file),JSON.stringify({type:'module',version:'1.2.3'}));
 await writeFile(path.join(root,'package-lock.json'),JSON.stringify({version:'1.2.3',packages:{'':{version:'1.2.3'}}}));
 await writeFile(path.join(root,'scripts','build.mjs'),"import {writeFile} from 'node:fs/promises';await writeFile('dist/card-print-studio.html','<!doctype html>verified card studio');await writeFile('dist/update.json',JSON.stringify({version:'1.2.3'}));");
 await writeFile(path.join(root,'scripts','build-harness.mjs'),"console.log('harness ready');");
 for(const file of ['model.test.mjs','offline.spec.mjs','updates.spec.mjs'])await writeFile(path.join(root,'tests',file),"import test from 'node:test';test('real passing check',()=>{});");
 return root;
}
async function withFixture(fn){const root=await fixture();try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}

test('verification profiles select existing checks once and reject missing or unknown coverage',async()=>{
 const {selectTests}=await api();
 const files=['tests/model.test.mjs','tests/offline.spec.mjs','tests/updates.spec.mjs','tests/effect-video.spec.mjs','tests/unused.spec.mjs'];
 assert.deepEqual(selectTests(files,'quick'),files.slice(0,3).sort());
 assert.deepEqual(selectTests(files,'full'),[...files].sort());
 assert.throws(()=>selectTests(files,'effects'),/preview-settings/);
 assert.throws(()=>selectTests(files.filter(f=>!f.includes('offline')),'quick'),/offline/);
 assert.throws(()=>selectTests(files,'typo'),/검사 종류/);
});

test('effects profile covers the replacement duration and DPI controls using existing test files',async()=>{
 const {selectTests}=await api(),files=(await readdir(new URL('.',import.meta.url))).map(name=>'tests/'+name),selected=selectTests(files,'effects');
 assert.ok(selected.includes('tests/preview-settings.spec.mjs'));assert.ok(selected.includes('tests/mobile-layout.spec.mjs'));assert.ok(!selected.includes('tests/effect-video-ui.spec.mjs'));
 assert.ok(selected.includes('tests/particle-emission-render.spec.mjs'));assert.ok(selected.includes('tests/particle-emission-ui.spec.mjs'));assert.ok(selected.includes('tests/particle-emitter-ui.spec.mjs'));
 for(const name of ['painting-usability','effects-gpu','effect-playback-cache','visual-effects-print'])assert.ok(selected.includes('tests/'+name+'.spec.mjs'));
});

test('a green report requires completed tests with no failures, skips, cancellations or todo',async()=>{
 const {summarizeTests}=await api();
 const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 assert.equal(summarizeTests(tap,0).status,'PASS');
 for(const [output,code] of [[tap,1],['',0],[tap.replace('# tests 2','# tests 0'),0],[tap.replace('# skipped 0','# skipped 1'),0],[tap.replace('# todo 0','# todo 1'),0],[tap.replace('# cancelled 0','# cancelled 1'),0]])assert.equal(summarizeTests(output,code).status,'FAIL');
 const failed=summarizeTests("not ok 1 - 저장 원본 보존\n  ---\n  location: 'tests/save.spec.mjs:7:1'\n  error: '원본 그림이 바뀜'\n  ...\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n",1);
 assert.match(JSON.stringify(failed),/저장 원본 보존/);assert.match(JSON.stringify(failed),/원본 그림이 바뀜/);assert.match(JSON.stringify(failed),/save.spec.mjs/);
});

test('one invocation builds fresh files, runs checks, records their hash and stores concise and detailed results',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  const report=await runVerification({root});
  assert.equal(report.status,'PASS',JSON.stringify(report)+'\n'+await readFile(path.join(path.dirname(report.report),'tests.log'),'utf8').catch(()=>''));assert.equal(report.tests.passed,3);assert.equal(report.version,'1.2.3');
  assert.match(report.html.sha256,/^[a-f0-9]{64}$/);assert.ok(report.html.bytes>0);assert.equal(report.profile,'quick');
  assert.equal(JSON.parse(await readFile(report.report,'utf8')).status,'PASS');
  assert.match(await readFile(path.join(path.dirname(report.report),'tests.log'),'utf8'),/real passing check/);
  assert.match(await readFile(path.join(path.dirname(report.report),'report.md'),'utf8'),/PASS/);
 });
});

test('a new failed check cannot reuse an old passing report and retains the exact error',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  const first=await runVerification({root});assert.equal(first.status,'PASS');
  await writeFile(path.join(root,'tests/model.test.mjs'),"import test from 'node:test';test('카드 저장 검사',()=>{throw Error('그림 누락');});");
  const second=await runVerification({root});assert.equal(second.status,'FAIL');assert.notEqual(first.report,second.report);
  assert.match(JSON.stringify(second.tests.failures),/카드 저장 검사/);assert.match(JSON.stringify(second.tests.failures),/그림 누락/);
 });
});

test('version mismatch and build failure stop before tests and persist a failure report',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  await writeFile(path.join(root,'release.json'),JSON.stringify({version:'9.9.9'}));
  const mismatch=await runVerification({root});assert.equal(mismatch.status,'FAIL');assert.match(mismatch.error,/버전/);assert.equal(mismatch.tests,null);
  await writeFile(path.join(root,'release.json'),JSON.stringify({version:'1.2.3'}));
  await writeFile(path.join(root,'scripts/build.mjs'),"throw Error('번들 생성 실패');");
  const failed=await runVerification({root});assert.equal(failed.status,'FAIL');assert.match(failed.error,/번들 생성 실패/);assert.equal(failed.tests,null);
 });
});

test('source edits during a run invalidate results instead of approving stale code',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  await writeFile(path.join(root,'tests/model.test.mjs'),"import test from 'node:test';import {writeFile} from 'node:fs/promises';test('concurrent edit',async()=>{await writeFile('src/app.js','edited during test');});");
  const report=await runVerification({root});assert.equal(report.status,'FAIL');assert.match(report.error,/검사 도중.*변경/);
 });
});

test('stalled commands time out and produce failure rather than an incomplete success',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  await writeFile(path.join(root,'scripts/build.mjs'),"setInterval(()=>{},1000);");
  const report=await runVerification({root,timeoutMs:250});assert.equal(report.status,'FAIL');assert.match(report.error,/시간.*초과/);
 });
});

test('a changed built update manifest invalidates otherwise passing tests',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  await writeFile(path.join(root,'tests/model.test.mjs'),"import test from 'node:test';import {writeFile} from 'node:fs/promises';test('manifest edit',async()=>{await writeFile('dist/update.json',JSON.stringify({version:'9.9.9'}));});");
  const report=await runVerification({root});assert.equal(report.status,'FAIL');assert.match(report.error,/버전/);
 });
});

test('split UTF-8 subprocess output preserves the exact Korean failure cause',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  await writeFile(path.join(root,'scripts/build.mjs'),"const text=Buffer.from('그림 누락');process.stdout.write(text.subarray(0,1));setTimeout(()=>{process.stdout.write(text.subarray(1));process.exitCode=1;},30);");
  const report=await runVerification({root});assert.equal(report.status,'FAIL');assert.match(report.error,/그림 누락/);
  assert.equal(await readFile(path.join(path.dirname(report.report),'build.log'),'utf8'),'그림 누락');
 });
});

test('interrupting the CLI records FAIL and preserves the current subprocess log',async()=>{
 await api();await withFixture(async root=>{
  await writeFile(path.join(root,'scripts/verify.mjs'),await readFile(moduleUrl));
  await writeFile(path.join(root,'scripts/build.mjs'),"console.log('진행 중인 검사');setTimeout(()=>{},1500);");
  const preload=path.join(root,'interrupt.mjs');await writeFile(preload,"setTimeout(()=>process.emit('SIGINT'),500).unref();");
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const child=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,'scripts/verify.mjs'],{cwd:root,env,encoding:'utf8',timeout:10000,windowsHide:true});
  assert.equal(child.status,1,'SIGINT must exit nonzero after writing a result: '+child.stdout+child.stderr);
  const summary=JSON.parse(child.stdout.trim());assert.equal(summary.status,'FAIL');assert.match(summary.error,/중단/);
  assert.equal(JSON.parse(await readFile(summary.report,'utf8')).status,'FAIL');
  assert.match(await readFile(path.join(path.dirname(summary.report),'build.log'),'utf8'),/진행 중인 검사/);
 });
});

test('an edit followed by restoration still invalidates checks that may have read temporary code',async()=>{
 const {runVerification}=await api();await withFixture(async root=>{
  await writeFile(path.join(root,'tests/model.test.mjs'),"import test from 'node:test';import {readFile,writeFile} from 'node:fs/promises';test('transient edit',async()=>{const old=await readFile('src/app.js');await writeFile('src/app.js','temporary source');await new Promise(r=>setTimeout(r,30));await writeFile('src/app.js',old);});");
  const report=await runVerification({root});assert.equal(report.status,'FAIL');assert.match(report.error,/검사 도중.*변경/);
 });
});
