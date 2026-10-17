import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,normalizeSource,parseRelease,checkForUpdate} from '../src/updates/releases.js';
import * as releaseFiles from '../src/updates/releases.js';

const source='https://releases.example/update.json';
const manifest=(version='1.2.0',extra={})=>({format:'card-print-studio-update',version,releasedAt:'2026-10-17',notes:['새 브러시'],downloadUrl:'./card-print-studio.html',...extra});

test('semantic version ordering handles numeric components, prereleases and build metadata without lexical mistakes',()=>{
 for(const [a,b,want] of [['1.10.0','1.9.9',1],['v2.0.0','1.99.99',1],['1.0.0','1.0.0+newbuild',0],['1.0.0-beta.11','1.0.0-beta.2',1],['1.0.0-beta','1.0.0',-1],['1.0.0-1','1.0.0-beta',-1],['1.0.0-beta','1.0.0-beta.1',-1],['0.1.0','1.0.0',-1]])assert.equal(compareVersions(a,b),want,`${a} vs ${b}`);
 for(const value of ['1.2','1.2.3.4','01.2.3','1.2.3-01','latest','',null])assert.throws(()=>compareVersions(value,'1.0.0'),/버전/);
});

test('update sources reject executable, insecure, credential-bearing and fragment URLs',()=>{
 assert.equal(normalizeSource(' https://releases.example/update.json '),source);
 for(const value of ['',null,'javascript:alert(1)','data:application/json,{}','file:///C:/new.html','http://releases.example/update.json','https://name:secret@releases.example/a','https://releases.example/a#token'])assert.throws(()=>normalizeSource(value),/배포 주소/);
});

test('release files must identify this app and provide a valid version, date and safe download link',()=>{
 const parsed=parseRelease(manifest(),source);assert.equal(parsed.downloadUrl,'https://releases.example/card-print-studio.html');assert.deepEqual(parsed.notes,['새 브러시']);
 assert.deepEqual(parseRelease(manifest('v1.2.3',{notes:'첫째\n둘째',releasedAt:undefined}),source).notes,['첫째','둘째']);
 for(const [patch,pattern] of [[{format:'other-app'},/작업실/],[{version:'1.2'},/버전/],[{releasedAt:'2026-02-30'},/날짜/],[{downloadUrl:'javascript:alert(1)'},/다운로드 주소/],[{downloadUrl:'http://releases.example/new.html'},/다운로드 주소/],[{downloadUrl:'https://name:secret@releases.example/new.html'},/다운로드 주소/],[{notes:['정상',{}]},/변경사항/]])assert.throws(()=>parseRelease(manifest('1.2.3',patch),source),pattern);
 for(const value of [null,[],{},'text'])assert.throws(()=>parseRelease(value,source),/작업실/);
});

test('checking uses a read-only request with no credentials and resolves relative downloads against the final response URL',async()=>{
 let seen;const result=await checkForUpdate(source,{currentVersion:'1.1.0',fetchImpl:async(url,options)=>{
  seen={url,options};const response=new Response(JSON.stringify(manifest()),{headers:{'content-type':'application/json'}});Object.defineProperty(response,'url',{value:'https://cdn.example/folder/update.json'});return response;
 }});
 assert.equal(result.relation,'available');assert.equal(result.release.downloadUrl,'https://cdn.example/folder/card-print-studio.html');assert.equal(seen.url,source);assert.equal(seen.options.method,'GET');assert.equal(seen.options.credentials,'omit');assert.equal(seen.options.referrerPolicy,'no-referrer');assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.body,undefined);
 for(const [version,relation] of [['1.1.0','current'],['1.0.0','ahead']])assert.equal((await checkForUpdate(source,{currentVersion:'1.1.0',fetchImpl:async()=>new Response(JSON.stringify(manifest(version)))})).relation,relation);
});

test('HTTP failures, invalid JSON and oversized responses never become a false up-to-date result',async()=>{
 await assert.rejects(checkForUpdate(source,{currentVersion:'1.0.0',fetchImpl:async()=>new Response('',{status:404})}),/404/);
 await assert.rejects(checkForUpdate(source,{currentVersion:'1.0.0',fetchImpl:async()=>new Response('<html>oops</html>')}),/JSON/);
 await assert.rejects(checkForUpdate(source,{currentVersion:'1.0.0',fetchImpl:async()=>new Response(' '.repeat(262145))}),/256/);
 await assert.rejects(checkForUpdate(source,{currentVersion:'1.0.0',fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),/연결/);
});

test('slow checks time out, caller cancellation remains cancellation and no invalid source is requested',async()=>{
 const waitForAbort=async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
 await assert.rejects(checkForUpdate(source,{currentVersion:'1.0.0',timeoutMs:10,fetchImpl:waitForAbort}),/시간/);
 const control=new AbortController(),pending=checkForUpdate(source,{currentVersion:'1.0.0',signal:control.signal,fetchImpl:waitForAbort});control.abort();await assert.rejects(pending,error=>error.name==='AbortError');
 let calls=0;await assert.rejects(checkForUpdate('javascript:bad',{currentVersion:'1.0.0',fetchImpl:async()=>{calls++;}}),/배포 주소/);assert.equal(calls,0);
});

test('a declared oversized manifest cancels its response stream before reading the body',async()=>{
 let cancelled=false,reads=0;
 const body=new ReadableStream({pull(){reads++;},cancel(){cancelled=true;}},{highWaterMark:0});
 await assert.rejects(checkForUpdate(source,{currentVersion:'1.0.0',fetchImpl:async()=>new Response(body,{headers:{'content-length':'99999999'}})}),/256/);
 assert.equal(reads,0);assert.equal(cancelled,true,'Rejecting oversized data must also stop its network body');
});

test('update HTML is received as exact bytes without a server attachment header and rejects other content',async()=>{
 const html='<!doctype html><html lang="ko"><title>새 작업실</title></html>',bytes=new TextEncoder().encode(html);
 const blob=await releaseFiles.receiveUpdateFile({downloadUrl:'https://releases.example/new.html'},{fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'text/html'}})});
 assert.equal(blob.type,'text/html');assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes);
 await assert.rejects(releaseFiles.receiveUpdateFile({downloadUrl:'https://releases.example/new.html'},{fetchImpl:async()=>new Response('{"message":"missing"}')}),/HTML/);
 await assert.rejects(releaseFiles.receiveUpdateFile({downloadUrl:'https://releases.example/new.html'},{fetchImpl:async()=>new Response('',{status:403})}),/403/);
 await assert.rejects(releaseFiles.receiveUpdateFile({downloadUrl:'https://releases.example/new.html'},{fetchImpl:async()=>new Response(html,{headers:{'content-length':String(64*1024*1024+1)}})}),/64MB/);
});
