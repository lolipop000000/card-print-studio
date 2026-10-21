import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {BACKGROUND_MODEL_RESOURCES} from '../src/storage/background-model.js';

const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=fileURLToPath(new URL('../',import.meta.url)),directory=path.join(root,'artifacts/background-removal'),fixtureDirectory=process.env.CARD_BG_MODEL_DIR||directory;
const files={runtime:'ort.min.js',wasm:'ort-wasm-simd.wasm',model:'u2netp.onnx'};
let hasRealModel=true;try{await Promise.all(Object.values(files).map(file=>access(path.join(fixtureDirectory,file))));}catch{hasRealModel=false;}
async function start(){
 const result=await build({absWorkingDir:root,stdin:{contents:"import * as foreground from './src/model/background-removal.js';import * as storage from './src/storage/background-model.js';window.backgroundTest={...foreground,...storage};",resolveDir:root},bundle:true,write:false,format:'iife',target:'es2022'});
 await mkdir(directory,{recursive:true});const harness=path.join(directory,'harness.html');
 await writeFile(harness,'<!doctype html><meta charset="utf-8"><title>Local foreground QA</title><body><script>'+result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body>');
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);await page.goto(pathToFileURL(harness).href);
  return {browser,context,page,errors};
 }catch(error){await browser.close();throw error;}
}

test('file editor can persist verified resources and reuse them offline; blocked storage explains recovery',async()=>{
 const e=await start();try{
  const result=await e.page.evaluate(async()=>{
   const {createBackgroundModelLoader,createBackgroundModelStorage}=window.backgroundTest,persistence=createBackgroundModelStorage(),bytes=new Uint8Array([9,8,7,6]);
   const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
   const resources=[{name:'fixture',size:4,type:'application/octet-stream',sha256,url:'https://example.test/fixture'}];
   await createBackgroundModelLoader({resources,persistence,fetch:async()=>new Response(bytes,{headers:{'content-type':'application/octet-stream'}})})();
   const offline=await createBackgroundModelLoader({resources,persistence,fetch:async()=>{throw Error('offline');}})();
   let blocked;try{await createBackgroundModelStorage({indexedDB:null}).get();}catch(error){blocked=error.message;}
   const controller=new AbortController();controller.abort();let cancellation;try{await window.backgroundTest.removeImageBackground(null,{signal:controller.signal});}catch(error){cancellation=error.name;}
   return {bytes:[...new Uint8Array(offline.fixture)],blocked,cancellation};
  });
  assert.deepEqual(result.bytes,[9,8,7,6]);assert.match(result.blocked,/저장소|허용/);assert.equal(result.cancellation,'AbortError');assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});

function drawFixture(){
 const canvas=document.createElement('canvas');canvas.width=400;canvas.height=320;const ctx=canvas.getContext('2d');
 const wall=ctx.createLinearGradient(0,0,0,320);wall.addColorStop(0,'#bcc6c8');wall.addColorStop(1,'#eddfc8');ctx.fillStyle=wall;ctx.fillRect(0,0,400,320);
 for(let y=0;y<320;y+=20)for(let x=0;x<400;x+=20){ctx.fillStyle=(x+y)%40?'#b6c4c125':'#9fa8b325';ctx.fillRect(x,y,20,20);}
 ctx.fillStyle='#322a211c';ctx.beginPath();ctx.ellipse(208,283,100,13,0,0,Math.PI*2);ctx.fill();
 const vase=ctx.createLinearGradient(120,0,280,0);vase.addColorStop(0,'#153e84');vase.addColorStop(.4,'#76b8f5');vase.addColorStop(.7,'#2468b7');vase.addColorStop(1,'#062852');ctx.fillStyle=vase;
 ctx.beginPath();ctx.moveTo(163,49);ctx.bezierCurveTo(171,90,150,112,130,145);ctx.bezierCurveTo(94,210,137,277,164,280);ctx.lineTo(237,280);ctx.bezierCurveTo(270,273,307,203,270,144);ctx.bezierCurveTo(248,110,231,89,239,49);ctx.closePath();ctx.fill();
 ctx.fillStyle='#0c2851';ctx.beginPath();ctx.ellipse(201,49,39,8,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#84baf4';ctx.lineWidth=3;ctx.stroke();
 ctx.fillStyle='#ffffff30';ctx.beginPath();ctx.ellipse(161,191,9,47,-.2,0,Math.PI*2);ctx.fill();
 const partial=ctx.getImageData(200,170,1,1);partial.data[3]=128;ctx.putImageData(partial,200,170);ctx.clearRect(200,180,1,1);
 window.bgSource=canvas;document.body.replaceChildren(canvas);
}

test('genuine U2NetP runs locally in a Worker, preserves alpha and dimensions, and runs after offline reload', {skip:!hasRealModel?'Set CARD_BG_MODEL_DIR to pinned ort.min.js, ort-wasm-simd.wasm and u2netp.onnx for real inference QA.':false,timeout:120000},async()=>{
 const e=await start();try{
  const requests=[];
  await e.context.route(/^https?:/,async route=>{
   requests.push({url:route.request().url(),method:route.request().method()});const resource=BACKGROUND_MODEL_RESOURCES.find(item=>item.url===route.request().url());
   if(!resource){await route.abort();return;}
   if(process.env.CARD_BG_LIVE_DOWNLOAD==='1'){await route.continue();return;}
   await route.fulfill({status:200,contentType:resource.type,body:await readFile(path.join(fixtureDirectory,files[resource.name]))});
  });
  await e.page.evaluate(drawFixture);
  const first=await e.page.evaluate(async()=>{
   const original=window.bgSource,before=original.toDataURL(),stages=[];const result=await window.backgroundTest.removeImageBackground(original,{onProgress:event=>stages.push(event.stage)});document.body.append(result);
   const pixels=result.getContext('2d'),alpha=(x,y)=>pixels.getImageData(x,y,1,1).data[3];
   return {size:[result.width,result.height],unchanged:before===original.toDataURL(),background:alpha(10,10),foreground:alpha(200,200),partial:alpha(200,170),transparent:alpha(200,180),stages,alpha:[...pixels.getImageData(0,0,400,320).data].filter((_,index)=>index%4===3)};
  });
  assert.deepEqual(first.size,[400,320]);assert.equal(first.unchanged,true);assert.ok(first.background<30,`background alpha ${first.background}`);assert.ok(first.foreground>200,`foreground alpha ${first.foreground}`);assert.ok(first.partial>50&&first.partial<=128);assert.equal(first.transparent,0);assert.ok(first.stages.includes('segment'));assert.equal(requests.length,3);assert.ok(requests.every(request=>request.method==='GET'));
  await e.page.screenshot({path:path.join(directory,'genuine-inference.png')});
  await e.context.setOffline(true);await e.page.reload();await e.page.evaluate(drawFixture);requests.length=0;
  const second=await e.page.evaluate(async()=>{
   const stages=[],result=await window.backgroundTest.removeImageBackground(window.bgSource,{onProgress:event=>stages.push(event.stage)});
   const controller=new AbortController();let cancellation;try{await window.backgroundTest.removeImageBackground(window.bgSource,{signal:controller.signal,onProgress:event=>{if(event.stage==='segment')controller.abort();}});}catch(error){cancellation=error.name;}
   return {alpha:[...result.getContext('2d').getImageData(0,0,400,320).data].filter((_,index)=>index%4===3),stages,cancellation};
  });
  // Canvas gradient/raster backends may round one alpha level differently after reload.
  const difference=second.alpha.map((value,index)=>Math.abs(value-first.alpha[index]));
  assert.ok(difference.reduce((max,value)=>Math.max(max,value),0)<=3);assert.ok(difference.reduce((sum,value)=>sum+value,0)/difference.length<.1);
  assert.ok(!second.stages.includes('download'));assert.equal(second.cancellation,'AbortError');assert.equal(requests.length,0);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});
