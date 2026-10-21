import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=fileURLToPath(new URL('../',import.meta.url));
const code=existsSync(new URL('../src/model/sprite-sheet.js',import.meta.url))?"import {packSpriteSheet} from './src/model/sprite-sheet.js';window.sheetApi={packSpriteSheet};":'window.sheetApi={};';
const bundle=await build({absWorkingDir:root,stdin:{contents:code,resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022'});
async function start(){
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setContent('<!doctype html><meta charset="utf-8"><title>Sprite sheet packing</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  assert.equal(await page.evaluate(()=>typeof window.sheetApi.packSpriteSheet),'function','Sprite sheet packing must expose its public helper');
  await page.evaluate(()=>{
   window.sheetFrame=(width,height,color,alpha=1,index=0)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fillRect(0,0,width,height);return {asset:{id:'source-'+index,mime:'image/png',dataUrl:canvas.toDataURL(),width,height,paintingId:'kept-'+index},name:'그림 '+index,sourceRect:{x:1,y:2,width,height}};};
   window.sheetPixels=async asset=>{const image=new Image();image.src=asset.dataUrl;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {size:[image.width,image.height],pixels:[...ctx.getImageData(0,0,image.width,image.height).data]};};
  });return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}

test('unequal frames pack without scaling, keep alpha and leave transparent cell and final-row padding',async()=>{
 const {browser,page,errors}=await start();try{
  const actual=await page.evaluate(async()=>{
   const frames=[window.sheetFrame(2,1,'#ff0000',1,0),window.sheetFrame(1,2,'#00ff00',.5,1),window.sheetFrame(1,1,'#0000ff',1,2)],before=JSON.stringify(frames);
   const result=await window.sheetApi.packSpriteSheet(frames,{columns:2}),decoded=await window.sheetPixels(result.asset);
   return {...result,asset:{id:result.asset.id,mime:result.asset.mime,width:result.asset.width,height:result.asset.height,paintingId:result.asset.paintingId},...decoded,unchanged:JSON.stringify(frames)===before,newId:frames.every(frame=>frame.asset.id!==result.asset.id)};
  });
  assert.equal(actual.sheetColumns,2);assert.equal(actual.sheetRows,2);assert.equal(actual.frameCount,3);assert.deepEqual(actual.size,[4,4]);assert.equal(actual.asset.mime,'image/png');assert.equal(actual.asset.paintingId,null);assert.equal(actual.newId,true);assert.equal(actual.unchanged,true);
  assert.deepEqual(actual.pixels,[
   255,0,0,255, 255,0,0,255, 0,255,0,128, 0,0,0,0,
   0,0,0,0, 0,0,0,0, 0,255,0,128, 0,0,0,0,
   0,0,255,255, 0,0,0,0, 0,0,0,0, 0,0,0,0,
   0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0
  ]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('sheet columns honor preferences, fit all 256 frames and keep row counts within 16',async()=>{
 const {browser,page}=await start();try{
  const actual=await page.evaluate(async()=>{
   const cases=[{count:5,columns:undefined},{count:17,columns:1},{count:33,columns:2},{count:256,columns:1},{count:2,columns:4}],results=[];
   for(const entry of cases){const source=window.sheetFrame(1,1,'#336699'),result=await window.sheetApi.packSpriteSheet(Array.from({length:entry.count},()=>source),{columns:entry.columns});results.push([result.sheetColumns,result.sheetRows,result.frameCount,result.asset.width,result.asset.height]);}return results;
  });assert.deepEqual(actual,[[3,2,5,3,2],[2,9,17,2,9],[3,11,33,3,11],[16,16,256,16,16],[4,1,2,4,1]]);
 }finally{await browser.close();}
});

test('packing rejects damaged or mismatched source bitmaps without altering them',async()=>{
 const {browser,page}=await start();try{
  const actual=await page.evaluate(async()=>{
   const good=window.sheetFrame(2,2,'#f00'),wrong=window.sheetFrame(2,2,'#0f0');wrong.asset.width=3;const broken=window.sheetFrame(1,1,'#00f');broken.asset.dataUrl='data:image/png;base64,AAAA';
   const before=JSON.stringify([good,wrong,broken]),errors=[];
   for(const frames of [[good,wrong],[good,broken]])try{await window.sheetApi.packSpriteSheet(frames);}catch(error){errors.push(error.message);}
   return {errors,unchanged:JSON.stringify([good,wrong,broken])===before};
  });assert.equal(actual.errors.length,2);assert.match(actual.errors[0],/실제|크기/);assert.match(actual.errors[1],/그림|PNG|원본/);assert.equal(actual.unchanged,true);
 }finally{await browser.close();}
});
