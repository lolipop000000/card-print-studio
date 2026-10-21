import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import {drawSpriteEmitter} from './src/render/effects/sprite-emitter.js';import {effectRandom} from './src/render/effects/random.js';window.randomFrameApi={drawSpriteEmitter,effectRandom};",resolveDir:root},bundle:true,format:'iife',write:false,target:'es2022'});
async function start(){
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<!doctype html><meta charset="utf-8"><title>Sprite random frames</title>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{
   window.renderRandomFrames=({mode='random',time=.1,seed=41,start=0,count=0,rate=2,single=false,motion=true}={})=>{
    const atlas=document.createElement('canvas');atlas.width=16;atlas.height=16;const a=atlas.getContext('2d');
    ['#ff0000','#00ff00','#0000ff','#ffff00'].forEach((color,index)=>{a.fillStyle=color;a.fillRect(index%2*8,Math.floor(index/2)*8,8,8);});
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=32;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const params={shape:'image',tint:'original',renderMode:single?'single':'particles',sheetColumns:2,sheetRows:2,frameMode:mode,frameStart:start,frameCount:count,frameRate:rate,count:4,life:12,sizeStart:.5,sizeEnd:.5,travel:0,spread:0,spin:0,rotation:0,gravity:0,fadeIn:0,fadeOut:0,alphaStart:1,alphaEnd:1,drift:0,randomness:0};
    window.randomFrameApi.drawSpriteEmitter(ctx,{kind:'sprite',params,motion:{enabled:motion}},{time,height:10,center:{x:16,y:16},point:index=>({x:16+index*32,y:16}),random:(index,salt)=>window.randomFrameApi.effectRandom(seed,'random-sheet',index,salt),include:()=>{},image:atlas});
    const samples=Array.from({length:single?1:4},(_,index)=>[...ctx.getImageData(16+index*32,16,1,1).data]);
    let hash=2166136261;for(const value of ctx.getImageData(0,0,160,32).data)hash=Math.imul(hash^value,16777619);
    return {samples,hash:hash>>>0};
   };
  });return {browser,page,errors};
 }catch(error){await browser.close();throw error;}
}
const render=(page,options)=>page.evaluate(options=>window.renderRandomFrames(options),options);

test('random birth frames differ between particles and stay fixed throughout each lifetime',async()=>{
 const {browser,page,errors}=await start();try{
  const first=await render(page,{}),later=await render(page,{time:.8});
  assert.ok(new Set(first.samples.map(String)).size>1,'Each particle chooses its own frame');
  assert.deepEqual(later,first,'A birth choice stays unchanged while its particle ages');
  const next=await render(page,{time:12.1});assert.notDeepEqual(next.samples,first.samples,'The next generation chooses fresh frames');
  assert.deepEqual(await render(page,{}),first,'Re-rendering a frozen frame is exact');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('random playback changes at the configured rate and respects the selected frame interval',async()=>{
 const {browser,page}=await start();try{
  const frames=[];for(const time of [.1,.2,.6,1.1,1.6])frames.push(await render(page,{mode:'randomLoop',start:1,count:2,time}));
  assert.deepEqual(frames[0],frames[1],'Frames do not change between playback ticks');
  assert.ok(new Set(frames.map(frame=>frame.hash)).size>1,'Playback changes selected cuts');
  for(const frame of frames)for(const sample of frame.samples)assert.ok(['0,255,0,255','0,0,255,255'].includes(String(sample)),'Only frames 1 and 2 may appear: '+sample);
  const again=await render(page,{mode:'randomLoop',start:1,count:2,time:1.1});assert.deepEqual(again,frames[3]);
 }finally{await browser.close();}
});

test('random image choices depend on the seed and paused decorations keep the same chosen cut',async()=>{
 const {browser,page}=await start();try{
  const a=await render(page,{seed:41}),b=await render(page,{seed:97});assert.notDeepEqual(a.samples,b.samples);
  const paused={mode:'randomLoop',single:true,motion:false};
  assert.deepEqual(await render(page,{...paused,time:.1}),await render(page,{...paused,time:32}));
  const one={mode:'randomLoop',start:3,count:1,time:8};assert.deepEqual((await render(page,one)).samples,Array(4).fill([255,255,0,255]));
 }finally{await browser.close();}
});
