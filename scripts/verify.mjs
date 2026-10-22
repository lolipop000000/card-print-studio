import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {watch} from 'node:fs';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const core=['offline','updates'];
const profiles={
 quick:core,
 cloud:[...core,'cloud-card-upload','cloud-account','cloud-panel','cloud-import','library-hub','shared-assets','mobile-layout'],
 effects:[...core,'preview-settings','mobile-layout','visual-effects-card','visual-effects-history','effect-selected-playback','effect-playback-cache','effects-gpu','starlight','particle-emission-render','particle-emission-ui','particle-emitter-ui','painting-usability','visual-effects-print'],
 print:[...core,'native-print-app','browser-print','visual-effects-print','printing-tolerant','sprite-customization-print'],
 full:null
};

export function selectTests(files,profile){
 if(!Object.hasOwn(profiles,profile))throw Error('알 수 없는 검사 종류: '+profile+' (quick / cloud / effects / print / full)');
 const units=files.filter(f=>f.endsWith('.test.mjs'));
 const browser=profiles[profile]?.map(name=>'tests/'+name+'.spec.mjs')??files.filter(f=>f.endsWith('.spec.mjs'));
 for(const file of browser)if(!files.includes(file))throw Error('필수 검사 파일이 없습니다: '+file);
 if(!units.length||!browser.length)throw Error('기본 검사 또는 브라우저 검사가 비어 있습니다.');
 return [...new Set([...units,...browser])].sort();
}

export function summarizeTests(output,exitCode){
 const count=name=>{const match=output.match(new RegExp('^# '+name+' (\\d+)\\s*$','m'));return match?Number(match[1]):null;};
 const total=count('tests'),passed=count('pass'),failed=count('fail'),cancelled=count('cancelled'),skipped=count('skipped'),todo=count('todo');
 const failures=[...output.matchAll(/^\s*not ok \d+ - (.+)\r?\n([\s\S]*?)(?=^\s*\.\.\.|^# Subtest:|$(?![\s\S]))/gm)].map(m=>{
  const location=m[2].match(/^\s*location:\s*(.+)$/m)?.[1]?.trim()??null;
  const diagnostic=m[2].match(/^(\s*)error:\s*(.+)$/m);
  let error=diagnostic?.[2]?.trim()??'상세 원인은 tests.log에 기록했습니다.';
  if(diagnostic&&/^[|>][-+]?$/.test(error)){
   const rest=m[2].slice(diagnostic.index+diagnostic[0].length).split(/\r?\n/),body=[];
   for(const line of rest){if(line.trim()&&line.match(/^\s*/)[0].length<=diagnostic[1].length)break;body.push(line.trim());}
   error=body.join('\n').trim();
  }
  return {name:m[1].trim(),location,error};
 });
 const ok=exitCode===0&&total>0&&passed===total&&failed===0&&cancelled===0&&skipped===0&&todo===0;
 return {status:ok?'PASS':'FAIL',total,passed,failed,cancelled,skipped,todo,failures};
}

async function filesUnder(root,folder){
 const rows=await readdir(path.join(root,folder),{withFileTypes:true}),files=[];
 for(const row of rows.sort((a,b)=>a.name.localeCompare(b.name))){
  const file=folder+'/'+row.name;
  if(row.isDirectory())files.push(...await filesUnder(root,file));else if(row.isFile())files.push(file);
 }
 return files;
}
async function fingerprint(root){
 const files=['package.json','package-lock.json','release.json'];
 for(const dir of ['src','scripts','tests','vendor'])files.push(...await filesUnder(root,dir));
 const hash=createHash('sha256');
 for(const file of files.sort()){hash.update(file+'\0');hash.update(await readFile(path.join(root,file)));hash.update('\0');}
 return hash.digest('hex');
}
async function versions(root,built=false){
 const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
 const pkg=await json('package.json'),lock=await json('package-lock.json'),release=await json('release.json');
 const values=[pkg.version,lock.version,lock.packages?.['']?.version,release.version];
 if(built)values.push((await json('dist/update.json')).version);
 if(typeof values[0]!=='string'||values.some(v=>v!==values[0]))throw Error('버전이 일치하지 않습니다: '+JSON.stringify(values));
 return values[0];
}
function watchInputs(root){
 const state={changed:false,error:null,changes:[]},watchers=[];
 const listen=(target,options,accept=()=>true)=>{
  const watcher=watch(target,options,(event,file)=>{
   if(file&& !accept(String(file)))return;
   state.changed=true;
   const name=file?path.relative(root,path.join(target,String(file))).replaceAll('\\','/'):path.relative(root,target)+' (파일명 미제공)';
   if(state.changes.length<12&&!state.changes.some(change=>change.file===name))state.changes.push({file:name,event});
  });
  watcher.on('error',error=>{state.error=error.message;});watchers.push(watcher);
 };
 try{
  for(const dir of ['src','scripts','tests','vendor'])listen(path.join(root,dir),{recursive:true});
  listen(root,{},file=>['package.json','package-lock.json','release.json'].includes(file));
 }catch(error){for(const watcher of watchers)watcher.close();throw error;}
 return {state,close:()=>{for(const watcher of watchers)watcher.close();}};
}
async function command(root,args,log,timeoutMs,signal){
 if(signal?.aborted){await writeFile(log,'사용자가 검사를 중단했습니다.\n');return {code:1,output:'',error:'사용자가 검사를 중단했습니다.'};}
 return new Promise(resolve=>{
  let output='',error=null,timedOut=false,cancelled=false;
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
  child.on('error',cause=>{error=cause.message;});
  const stop=()=>{
   // Only terminate the process tree launched by this invocation.
   if(process.platform==='win32'&&child.pid)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
   else child.kill('SIGKILL');
  };
  const cancel=()=>{cancelled=true;stop();};signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
  if(signal?.aborted)cancel();
  child.on('close',async code=>{
   clearTimeout(timer);signal?.removeEventListener('abort',cancel);
   error=cancelled?'사용자가 검사를 중단했습니다.':timedOut?'검사 시간이 초과되었습니다.':error;
   try{await writeFile(log,output+(error?'\n'+error:''));resolve({code,output,error});}
   catch(cause){resolve({code:1,output,error:'검사 로그 저장 실패: '+cause.message});}
  });
 });
}

export async function runVerification({root=ROOT,profile='quick',timeoutMs=profile==='full'?3600000:900000,signal}={}){
 root=path.resolve(root);
 const startedAt=new Date().toISOString(),stamp=startedAt.replaceAll(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
 const directory=path.join(root,'artifacts','verification',stamp);
 await mkdir(directory,{recursive:true});
 const report={status:'FAIL',profile,startedAt,version:null,inputSha256:null,html:null,files:[],stages:[],tests:null,error:null,report:path.join(directory,'result.json')};
 const start=Date.now();
 let inputs;
 try{
  const files=await filesUnder(root,'tests');report.files=selectTests(files,profile);
  inputs=watchInputs(root);
  report.version=await versions(root);report.inputSha256=await fingerprint(root);
  for(const [name,args] of [['build',['scripts/build.mjs']],['harness',['scripts/build-harness.mjs']],['tests',['--test','--test-concurrency=1','--test-reporter=tap',...report.files]]]){
   const at=Date.now(),run=await command(root,args,path.join(directory,name+'.log'),timeoutMs,signal);
   if(name==='tests')report.tests=summarizeTests(run.output,run.code);
   const status=run.code===0&&!run.error&&(name!=='tests'||report.tests.status==='PASS')?'PASS':'FAIL';
   report.stages.push({name,status,durationMs:Date.now()-at});
   if(name==='build'){
    if(status==='PASS'){
     await versions(root,true);
     const html=await readFile(path.join(root,'dist/card-print-studio.html'));
     report.html={bytes:html.length,sha256:createHash('sha256').update(html).digest('hex')};
    }
   }
   if(status!=='PASS'){
    const failure=report.tests?.failures[0];
    throw Error(name+': '+(run.error||(failure?failure.name+': '+failure.error:name==='tests'?'실패·생략·중단된 검사 또는 완료 집계 누락이 있습니다.':run.output.trim().slice(-1200)||'검사가 비정상 종료됐습니다.')));
   }
  }
  const unchanged=report.inputSha256===await fingerprint(root);
  await new Promise(resolve=>setImmediate(resolve));
  if(inputs.state.error)throw Error('코드 변경 감시 실패: '+inputs.state.error);
  report.changedFiles=inputs.state.changes;
  if(inputs.state.changed||!unchanged)throw Error('검사 도중 코드가 변경되었습니다: '+(report.changedFiles.map(c=>c.file).join(', ')||'입력 해시 불일치')+'. 변경된 코드로 다시 검사해야 합니다.');
  await versions(root,true);
  const html=await readFile(path.join(root,'dist/card-print-studio.html'));
  if(createHash('sha256').update(html).digest('hex')!==report.html.sha256)throw Error('검사 도중 배포 HTML이 변경되었습니다. 다시 검사해야 합니다.');
  if(signal?.aborted)throw Error('사용자가 검사를 중단했습니다.');
  report.status='PASS';
 }catch(error){report.error=error.message;}finally{inputs?.close();}
 report.finishedAt=new Date().toISOString();report.durationMs=Date.now()-start;
 await writeFile(report.report,JSON.stringify(report,null,2)+'\n');
 const summary=[`# ${report.status} · ${profile}`,`버전: ${report.version??'확인 실패'}`,`검사: ${report.tests?.passed??0} / ${report.tests?.total??0}`,`소요: ${(report.durationMs/1000).toFixed(1)}초`,...report.stages.map(s=>`${s.name}: ${s.status}`)];
 if(report.error)summary.push('원인: '+report.error);
 for(const failure of report.tests?.failures??[])summary.push(`- ${failure.name} (${failure.location??'위치 미제공'}): ${failure.error}`);
 if(report.html)summary.push('HTML SHA256: '+report.html.sha256);
 await writeFile(path.join(directory,'report.md'),summary.join('\n\n')+'\n');
 return report;
}

async function main(){
 const args=process.argv.slice(2);
 if(args.includes('--help')){console.log('node scripts/verify.mjs [--profile quick|cloud|effects|print|full] [--list]\n빌드 → 버전 일치 → 순차 검사 → 요약/상세 로그 저장. 배포와 개인 파일 수정은 하지 않습니다.');return;}
 let profile='quick';
 for(let i=0;i<args.length;i++){
  if(args[i]==='--profile'&&args[i+1])profile=args[++i];else if(args[i]!=='--list')throw Error('알 수 없는 인수: '+args[i]);
 }
 if(args.includes('--list')){console.log(JSON.stringify({profile,files:selectTests(await filesUnder(ROOT,'tests'),profile)}));return;}
 const controller=new AbortController(),interrupt=()=>controller.abort();
 process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 let r;
 try{r=await runVerification({profile,signal:controller.signal});}finally{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);}
 console.log(JSON.stringify({status:r.status,profile:r.profile,version:r.version,passed:r.tests?.passed??0,total:r.tests?.total??0,failures:r.tests?.failures??[],error:r.error,seconds:Math.round(r.durationMs/1000),report:r.report}));
 process.exitCode=r.status==='PASS'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.log(JSON.stringify({status:'FAIL',error:error.message}));process.exitCode=1;});
