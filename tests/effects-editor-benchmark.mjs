import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {VISUAL_EFFECT_PRESETS} from '../src/model/visual-effects.js';

const root=fileURLToPath(new URL('../',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const median=values=>values.toSorted((a,b)=>a-b)[Math.floor(values.length/2)];
const presetDefinitions=Object.fromEntries(['burningText','flame','burning'].map(id=>[id,VISUAL_EFFECT_PRESETS[id]]));
const cases=[['burningText','1','text'],['flame','3','text'],['burningText','3','text'],['burning','3','frame']].filter(([preset])=>!process.env.CARD_BENCH_PRESETS||process.env.CARD_BENCH_PRESETS.split(',').includes(preset));
const results=[];
try{
 const cdp=await browser.newBrowserCDPSession(),system=await cdp.send('SystemInfo.getInfo');await cdp.detach();
 for(const version of ['baseline','current']){
  const baseline=version==='baseline',gitFile=file=>execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
  const bundle=await build({absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,format:'iife',target:'es2022',write:false,loader:{'.woff2':'base64'},plugins:baseline?[{name:'frozen-head',setup(build){build.onLoad({filter:/[\\/]src[\\/].*\.js$/},args=>{const file=path.relative(root,args.path).replaceAll('\\','/');let contents=gitFile(file);if(file==='src/model/visual-effects.js')contents+='\nObject.assign(VISUAL_EFFECT_PRESETS,'+JSON.stringify(presetDefinitions)+');';return {contents,loader:'js'};});}}]:[]});
  for(const [preset,zoom,target] of cases){
   const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage();
   try{
    page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await context.route(/^https?:/,route=>route.abort());
    await page.goto(pathToFileURL(path.join(root,'src/index.html')).href);await page.addStyleTag({content:baseline?gitFile('src/styles.css'):await readFile(path.join(root,'src/styles.css'),'utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForSelector('[data-ready="true"]');
    await page.locator('#card-name').fill('불타는 글자');await page.locator('#card-name').press('Tab');await page.locator(target==='frame'?'#card-frame-effects':'#card-text-effects').click();await page.locator('#effect-start-preset').selectOption(preset);await page.locator('#effect-preview-zoom').selectOption(zoom);await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');
    await page.waitForTimeout(600);
    const paused=await page.locator('#effect-preview').evaluate(c=>({dpi:Number(c.dataset.previewDpi),size:[c.width,c.height]}));
    await page.evaluate(()=>{
     window.playbackSamples=[];const status=document.getElementById('effect-preview-status'),canvas=document.getElementById('effect-preview');
     window.playbackObserver=new MutationObserver(()=>{const match=status.textContent.match(/· (\d+)ms/);if(match&&document.getElementById('effect-play').getAttribute('aria-pressed')==='true')playbackSamples.push({at:performance.now(),durationMs:Number(match[1]),dpi:Number(canvas.dataset.previewDpi),size:[canvas.width,canvas.height],time:Number(document.getElementById('effect-time').value),effects:status.dataset.effectBackend,bloom:status.dataset.bloomBackend});});
     playbackObserver.observe(status,{childList:true,subtree:true,characterData:true});
    });
    await page.locator('#effect-play').click();await page.waitForTimeout(6500);await page.locator('#effect-play').click();await page.waitForFunction(()=>document.getElementById('effect-preview-status')?.dataset.busy==='false');
    const measured=await page.evaluate(()=>{playbackObserver.disconnect();const c=document.getElementById('effect-preview');return {samples:playbackSamples,restored:{dpi:Number(c.dataset.previewDpi),size:[c.width,c.height]},playing:document.getElementById('effect-play').getAttribute('aria-pressed'),frozen:document.getElementById('effect-frame-label').textContent};});
    const warmed=measured.samples.slice(2),deltas=warmed.slice(1).map((sample,i)=>sample.at-warmed[i].at),span=warmed.length?warmed.at(-1).at-warmed[0].at:0,summary={version,preset,zoom,target,paused,...measured,frames:measured.samples.length,medianDrawMs:median(warmed.map(sample=>sample.durationMs)),medianFrameMs:median(deltas),warmedFps:span?1000*(warmed.length-1)/span:0,activeDpis:[...new Set(measured.samples.map(sample=>sample.dpi))],errors};results.push(summary);
    console.log(JSON.stringify({...summary,samples:undefined}));
   }finally{await context.close();}
  }
 }
 await writeFile(path.join(root,process.env.CARD_BENCH_OUTPUT||'artifacts/qa/2026-10-21-effects-editor-playback.json'),JSON.stringify({baselineRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),recipeSource:'The same current preset definitions on the frozen HEAD engine and current engine',presetDefinitions,userAgent:await (await browser.newPage()).evaluate(()=>navigator.userAgent),gpuInfo:system.gpu,results},null,2));
}finally{await browser.close();}
