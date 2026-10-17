import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const presetImport=existsSync(path.join(root,'src/painting/brush-presets.js'))?"import * as presets from './src/painting/brush-presets.js';":"const presets={};";
const bundle=await build({absWorkingDir:root,stdin:{contents:`import * as painting from './src/painting/document.js';import * as tools from './src/painting/tools.js';import * as strokes from './src/painting/strokes.js';import {createPaintHistory} from './src/painting/history.js';${presetImport}window.paintEnhance={...painting,...tools,...strokes,...presets,createPaintHistory};`,resolveDir:root},bundle:true,format:'iife',target:'es2022',write:false});
async function openPainter(){
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CARD_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,route=>route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{
   const a=paintEnhance;
   const session=()=>({width:64,height:64,layers:[{id:'paint-layer',name:'그림',visible:true,locked:false,opacity:1,blendMode:'source-over',canvas:a.newCanvas(64,64)}],activeLayerId:'paint-layer',history:a.createPaintHistory(),busy:false});
   const data=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   const pixel=(c,x,y)=>Array.from(c.getContext('2d').getImageData(x,y,1,1).data);
   const rawHash=c=>{let h=2166136261;for(const v of data(c))h=Math.imul(h^v,16777619);return h>>>0;};
   // GPU and CPU unpremultiplication can differ by 1 even across reads of an unchanged canvas.
   // Compare the stored premultiplied 8-bit colors and exact alpha; keep legacy raw goldens separately.
   const hash=c=>{let h=2166136261;const pixels=data(c);for(let i=0;i<pixels.length;i++){const v=i%4===3?pixels[i]:Math.round(pixels[i]*pixels[i-i%4+3]/255);h=Math.imul(h^v,16777619);}return h>>>0;};
   async function draw(s,options={},points=[{x:24,y:24,p:1}],selection=null){
    const t=a.createPaintTools(s);t.setOptions(options);if(selection)t.select(selection);t.begin(points[0],points[0].p??1);for(const point of points.slice(1))t.move(point,point.p??1);
    const preview=t.getPreview()?hash(t.getPreview()):null;await t.end();return {preview,committed:hash(s.layers[0].canvas),history:s.history.count()};
   }
   window.paintCheck={...a,session,data,pixel,hash,rawHash,draw};
  });return {browser,page,errors};
 }catch(e){await browser.close();throw e;}
}

test('legacy brush eraser fill and shape committed pixels retain their pre-enhancement golden hashes',async t=>{
 const {browser,page,errors}=await openPainter();try{
  const hashes=await page.evaluate(async()=>{
   const a=paintCheck,out=[];
   for(const [name,options] of [['default brush',{}],['soft pressure',{hardness:0,size:12,opacity:.4,smoothing:.6,pressureSize:true}],['eraser',{tool:'eraser'}],['fill',{tool:'fill'}],['rectangle',{tool:'rect',shapeFill:true}]]){
    const s=a.session(),ctx=s.layers[0].canvas.getContext('2d');ctx.fillStyle='rgba(45,127,183,.45)';ctx.fillRect(8,8,36,40);
    await a.draw(s,options,[{x:10.25,y:20.5,p:.2},{x:30.5,y:35.2,p:.8},{x:40.8,y:15.5,p:1}]);out.push({name,hash:a.rawHash(s.layers[0].canvas)});
   }return out;
  });assert.deepEqual(hashes,[{name:'default brush',hash:548502534},{name:'soft pressure',hash:3223245146},{name:'eraser',hash:1905056451},{name:'fill',hash:4244396997},{name:'rectangle',hash:2894409985}]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('five brush presets expose isolated real engine settings with snapping reset outside the pixel preset',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(()=>{
   const a=paintCheck;if(!Array.isArray(a.BRUSH_PRESETS)||typeof a.brushPresetOptions!=='function')return {missing:true};
   const values=a.BRUSH_PRESETS.map(({id,label})=>({id,label,options:a.brushPresetOptions(id)})),copy=a.brushPresetOptions('pen');copy.size=999;
   return {values,isolated:a.brushPresetOptions('pen').size!==999,unknown:a.brushPresetOptions('absent')};
  });assert.equal(result.missing,undefined,'The brush preset catalogue must exist');assert.deepEqual(result.values.map(v=>v.id),['pen','pencil','marker','airbrush','pixel']);
  for(const {id,label,options} of result.values){assert.ok(label);assert.equal(options.tool,'brush');assert.equal(options.pixelSnap,id==='pixel');assert.equal(options.pressureSize,false);for(const key of ['size','hardness','opacity','smoothing'])assert.equal(typeof options[key],'number',id+' '+key);assert.ok(['round','square'].includes(options.brushTip));assert.equal('flow' in options,false);}
  assert.equal(result.isolated,true);assert.equal(result.unknown,null);
 }finally{await browser.close();}
});

test('square brush tips paint real corners and soft square tips feather independently of round tips',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(async()=>{
   const a=paintCheck,out={};for(const [name,brushTip,hardness] of [['round','round',1],['square','square',1],['soft','square',.5]]){
    const s=a.session();await a.draw(s,{size:12,brushTip,hardness,smoothing:0});out[name]={corner:a.pixel(s.layers[0].canvas,18,18),center:a.pixel(s.layers[0].canvas,24,24),edge:a.pixel(s.layers[0].canvas,18,24)};
   }return out;
  });assert.equal(result.round.corner[3],0);assert.equal(result.square.corner[3],255);assert.equal(result.square.edge[3],255);assert.equal(result.soft.center[3],255);assert.ok(result.soft.edge[3]>0&&result.soft.edge[3]<255,JSON.stringify(result));
 }finally{await browser.close();}
});

test('mirrored soft strokes match maximum reflected coverage without center buildup and commit as one undo action',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(async()=>{
   const a=paintCheck,points=[{x:32,y:32,p:.3},{x:25,y:18,p:.65},{x:19,y:12,p:1}],base=a.session(),mirror=a.session(),options={size:18,hardness:.3,opacity:.45,smoothing:.45,pressureSize:true,color:'#c54f32'};
   await a.draw(base,options,points);const original=a.data(base.layers[0].canvas),blank=a.hash(mirror.layers[0].canvas),record=await a.draw(mirror,{...options,mirrorX:true,mirrorY:true},points),actual=a.data(mirror.layers[0].canvas);let errors=0;
   for(let y=0;y<64;y++)for(let x=0;x<64;x++){const alpha=Math.max(...[[x,y],[63-x,y],[x,63-y],[63-x,63-y]].map(([xx,yy])=>original[(yy*64+xx)*4+3]));if(actual[(y*64+x)*4+3]!==alpha)errors++;}
   await mirror.history.undo();const undo=a.hash(mirror.layers[0].canvas)===blank;await mirror.history.redo();const redo=a.hash(mirror.layers[0].canvas)===record.committed;
   return {...record,errors,undo,redo,center:a.pixel(mirror.layers[0].canvas,32,32)[3],originalCenter:a.pixel(base.layers[0].canvas,32,32)[3]};
  });assert.equal(result.errors,0,JSON.stringify(result));assert.equal(result.preview,result.committed);assert.equal(result.history,1);assert.equal(result.undo,true);assert.equal(result.redo,true);assert.equal(result.center,result.originalCenter);
 }finally{await browser.close();}
});

test('mirrors obey selection even when the original point lies outside it and erasers keep pressure sizing',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(async()=>{
   const a=paintCheck,s=a.session(),ctx=s.layers[0].canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,64,64);
   const record=await a.draw(s,{tool:'eraser',size:16,hardness:1,pressureSize:true,mirrorX:true,mirrorY:true,preserveAlpha:true,smoothing:0},[{x:48,y:16,p:.5}],{x:0,y:0,w:32,h:32});
   return {...record,selected:a.pixel(s.layers[0].canvas,16,16),original:a.pixel(s.layers[0].canvas,48,16),lower:a.pixel(s.layers[0].canvas,16,48),outsidePressure:a.pixel(s.layers[0].canvas,22,16)};
  });assert.equal(result.selected[3],0);assert.equal(result.original[3],255);assert.equal(result.lower[3],255);assert.equal(result.outsidePressure[3],255);assert.equal(result.preview,result.committed);assert.equal(result.history,1);
 }finally{await browser.close();}
});

test('preserving alpha recolors brush and shape pixels exactly without filling transparent holes',async()=>{
 const {browser,page}=await openPainter();try{
  const results=await page.evaluate(async()=>{
   const a=paintCheck,out=[];for(const tool of ['brush','rect','line','ellipse']){
    const s=a.session(),ctx=s.layers[0].canvas.getContext('2d'),source=ctx.createImageData(64,64),levels=[1,64,128,255];for(let y=8;y<48;y++)for(let band=0;band<4;band++)for(let x=8+12*band;x<18+12*band;x++){const i=(y*64+x)*4;source.data[i+2]=255;source.data[i+3]=levels[band];}ctx.putImageData(source,0,0);const before=a.data(s.layers[0].canvas);
    const record=await a.draw(s,{tool,size:64,brushTip:'square',opacity:.6,color:'#f02020',preserveAlpha:true,shapeFill:true,smoothing:0},[{x:0,y:32},{x:64,y:32}]),after=a.data(s.layers[0].canvas);let alphaErrors=0;for(let i=3;i<before.length;i+=4)if(before[i]!==after[i])alphaErrors++;
    out.push({tool,...record,alphaErrors,changed:a.pixel(s.layers[0].canvas,16,32)[0]>before[(32*64+16)*4],transparent:a.pixel(s.layers[0].canvas,30,32),levels:[10,22,34,46].map(x=>a.pixel(s.layers[0].canvas,x,32)[3])});
   }return out;
  });for(const result of results){assert.equal(result.alphaErrors,0,JSON.stringify(result));assert.equal(result.changed,true,JSON.stringify(result));assert.equal(result.transparent[3],0);assert.deepEqual(result.levels,[1,64,128,255]);assert.equal(result.preview,result.committed);assert.equal(result.history,1);}
 }finally{await browser.close();}
});

test('linear and radial gradient previews match independent native Canvas references then undo and redo in one action',async()=>{
 const {browser,page}=await openPainter();try{
  const results=await page.evaluate(async()=>{
   const a=paintCheck,out=[];
   for(const gradientType of ['linear','radial'])for(const preserveAlpha of [false,true]){
    const s=a.session(),layer=s.layers[0],ctx=layer.canvas.getContext('2d');ctx.fillStyle='rgba(30,70,180,.4)';ctx.fillRect(0,0,64,32);ctx.fillStyle='#1e46b4';ctx.fillRect(0,40,64,24);const initial=a.hash(layer.canvas),before=a.data(layer.canvas),expected=a.copyCanvas(layer.canvas),ec=expected.getContext('2d'),selection={x:8,y:8,w:48,h:48};
    ec.beginPath();ec.rect(selection.x,selection.y,selection.w,selection.h);ec.clip();ec.globalAlpha=.6;if(preserveAlpha)ec.globalCompositeOperation='source-atop';
    const gradient=gradientType==='linear'?ec.createLinearGradient(12,24,52,24):ec.createRadialGradient(12,24,0,12,24,40);gradient.addColorStop(0,'#ee4028');gradient.addColorStop(1,'#287ad8');ec.fillStyle=gradient;ec.fillRect(0,0,64,64);
    const t=a.createPaintTools(s);t.setOptions({tool:'gradient',gradientType,preserveAlpha,color:'#ee4028',gradientColor:'#287ad8',opacity:.6});t.select(selection);t.begin({x:12,y:24});t.move({x:52,y:24});const preview=a.hash(t.getPreview()),uncommitted=a.hash(layer.canvas)===initial;await t.end();
    const committed=a.hash(layer.canvas),alpha=a.data(layer.canvas);let alphaErrors=0;if(preserveAlpha)for(let i=3;i<before.length;i+=4)if(before[i]!==alpha[i])alphaErrors++;
    const count=s.history.count();await s.history.undo();const undo=a.hash(layer.canvas)===initial;await s.history.redo();out.push({gradientType,preserveAlpha,preview,committed,expected:a.hash(expected),count,uncommitted,undo,redo:a.hash(layer.canvas)===committed,alphaErrors});
   }return out;
  });for(const result of results){assert.equal(result.preview,result.expected,JSON.stringify(result));assert.equal(result.committed,result.expected,JSON.stringify(result));assert.equal(result.count,1);assert.equal(result.uncommitted,true);assert.equal(result.undo,true);assert.equal(result.redo,true);assert.equal(result.alphaErrors,0);}
 }finally{await browser.close();}
});

test('gradient cancellation zero distance and locked layers preserve pixels and history',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(async()=>{
   const a=paintCheck,s=a.session(),t=a.createPaintTools(s),blank=a.hash(s.layers[0].canvas);t.setOptions({tool:'gradient'});t.begin({x:12,y:12});t.move({x:48,y:48});const preview=!!t.getPreview();t.cancel();await t.end();const cancelled=a.hash(s.layers[0].canvas)===blank&&s.history.count()===0;
   t.begin({x:12,y:12});await t.end();const noDistance=a.hash(s.layers[0].canvas)===blank&&s.history.count()===0;s.layers[0].locked=true;let locked=false;try{t.begin({x:12,y:12});}catch{locked=true;}
   return {preview,cancelled,noDistance,locked,unchanged:a.hash(s.layers[0].canvas)===blank,history:s.history.count()};
  });assert.equal(result.preview,true);assert.equal(result.cancelled,true);assert.equal(result.noDistance,true);assert.equal(result.locked,true);assert.equal(result.unchanged,true);assert.equal(result.history,0);
 }finally{await browser.close();}
});

test('merged fill uses visible separate lineart boundaries while committing only active layer pixels',async()=>{
 const {browser,page}=await openPainter();try{
  const results=await page.evaluate(async()=>{
   const a=paintCheck,out=[];for(const visible of [true,false]){
    const s=a.session(),line={id:'lineart',name:'선화',visible,locked:true,opacity:1,blendMode:'source-over',canvas:a.newCanvas(64,64)},lc=line.canvas.getContext('2d');lc.strokeStyle='#111';lc.lineWidth=2;lc.strokeRect(8,8,48,48);s.layers.push(line);const lineHash=a.hash(line.canvas);
    const record=await a.draw(s,{tool:'fill',sampleMerged:true,color:'#ee4028',opacity:.5,tolerance:0},[{x:24,y:24}]);out.push({visible,...record,inside:a.pixel(s.layers[0].canvas,24,24),outside:a.pixel(s.layers[0].canvas,2,2),lineUnchanged:a.hash(line.canvas)===lineHash});
   }return out;
  });for(const result of results){assert.equal(result.inside[3],128);assert.equal(result.outside[3],result.visible?0:128,JSON.stringify(result));assert.equal(result.lineUnchanged,true);assert.equal(result.history,1);}
 }finally{await browser.close();}
});

test('merged fill respects selection tolerance exact stored alpha and active layer locks',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(async()=>{
   const a=paintCheck,s=a.session(),layer=s.layers[0],ctx=layer.canvas.getContext('2d');ctx.fillStyle='rgba(20,20,20,.4)';ctx.fillRect(0,0,32,64);ctx.fillStyle='rgba(24,24,24,.4)';ctx.fillRect(32,0,32,64);const initial=a.data(layer.canvas),t=a.createPaintTools(s);t.select({x:8,y:8,w:48,h:48});t.setOptions({tool:'fill',sampleMerged:true,preserveAlpha:true,tolerance:5,color:'#ef3020',opacity:.6});t.begin({x:16,y:16});await t.end();
   const actual=a.data(layer.canvas);let alphaErrors=0;for(let i=3;i<initial.length;i+=4)if(actual[i]!==initial[i])alphaErrors++;const before=a.hash(layer.canvas);layer.locked=true;let locked=false;try{t.begin({x:16,y:16});await t.end();}catch{locked=true;}
   return {alphaErrors,left:a.pixel(layer.canvas,16,16),right:a.pixel(layer.canvas,40,16),outside:a.pixel(layer.canvas,2,2),locked,unchanged:a.hash(layer.canvas)===before,history:s.history.count()};
  });assert.equal(result.alphaErrors,0);assert.ok(result.left[0]>100);assert.ok(result.right[0]>100,JSON.stringify(result));assert.ok(result.outside[0]<30);assert.equal(result.locked,true);assert.equal(result.unchanged,true);assert.equal(result.history,1);
 }finally{await browser.close();}
});

test('new options normalize safely and zero-opacity gradients do not create history on painted layers',async()=>{
 const {browser,page}=await openPainter();try{
  const result=await page.evaluate(async()=>{
   const a=paintCheck,s=a.session(),ctx=s.layers[0].canvas.getContext('2d');ctx.fillStyle='rgba(30,70,180,.4)';ctx.fillRect(0,0,64,64);const t=a.createPaintTools(s);t.setOptions({brushTip:'absent',gradientType:'absent',gradientColor:'invalid color',mirrorX:1,mirrorY:'yes',preserveAlpha:null,sampleMerged:'true'});const normalized=t.getOptions(),initial=a.hash(s.layers[0].canvas);
   t.setOptions({tool:'gradient',opacity:0});t.begin({x:8,y:8});t.move({x:56,y:56});await t.end();const zeroOpacity=s.history.count()===0&&a.hash(s.layers[0].canvas)===initial;
   t.setOptions({opacity:1});t.begin({x:8,y:8});await t.end();return {normalized,zeroOpacity,zeroDistance:s.history.count()===0&&a.hash(s.layers[0].canvas)===initial};
  });assert.equal(result.normalized.brushTip,'round');assert.equal(result.normalized.gradientType,'linear');assert.equal(result.normalized.gradientColor,'#ffffff');for(const key of ['mirrorX','mirrorY','preserveAlpha','sampleMerged'])assert.equal(result.normalized[key],false);assert.equal(result.zeroOpacity,true);assert.equal(result.zeroDistance,true);
 }finally{await browser.close();}
});

test('horizontal and vertical symmetry can be used independently with pixel tips',async()=>{
 const {browser,page}=await openPainter();try{
  const results=await page.evaluate(async()=>{
   const a=paintCheck,out=[];for(const [mirrorX,mirrorY] of [[true,false],[false,true]]){
    const s=a.session(),record=await a.draw(s,{size:1,hardness:1,opacity:1,pixelSnap:true,brushTip:'square',mirrorX,mirrorY},[{x:18,y:14}]),data=a.data(s.layers[0].canvas),painted=[];
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(data[(y*64+x)*4+3])painted.push([x,y]);out.push({mirrorX,mirrorY,...record,painted});
   }return out;
  });assert.deepEqual(results[0].painted,[[18,14],[45,14]]);assert.deepEqual(results[1].painted,[[18,14],[18,49]]);for(const result of results){assert.equal(result.preview,result.committed);assert.equal(result.history,1);}
 }finally{await browser.close();}
});

test('gradients and merged fills preserve alpha 1 64 128 and 255 while recoloring the active layer',async()=>{
 const {browser,page}=await openPainter();try{
  const results=await page.evaluate(async()=>{
   const a=paintCheck,out=[];for(const tool of ['gradient','fill']){
    const s=a.session(),ctx=s.layers[0].canvas.getContext('2d'),source=ctx.createImageData(64,64),levels=[1,64,128,255];for(let y=8;y<48;y++)for(let band=0;band<4;band++)for(let x=8+12*band;x<18+12*band;x++){const i=(y*64+x)*4;source.data[i+2]=255;source.data[i+3]=levels[band];}ctx.putImageData(source,0,0);const before=a.data(s.layers[0].canvas);
    if(tool==='fill'){const line={id:'uniform-reference',name:'참고',visible:true,locked:true,opacity:1,blendMode:'source-over',canvas:a.newCanvas(64,64)};line.canvas.getContext('2d').fillRect(0,0,64,64);s.layers.push(line);}
    const record=await a.draw(s,{tool,color:'#ff0000',gradientColor:'#0000ff',opacity:1,preserveAlpha:true,sampleMerged:true,tolerance:0},[{x:8,y:24},{x:64,y:24}],{x:4,y:4,w:56,h:56}),after=a.data(s.layers[0].canvas);let alphaErrors=0;for(let i=3;i<before.length;i+=4)if(before[i]!==after[i])alphaErrors++;
    out.push({tool,...record,alphaErrors,levels:[10,22,34,46].map(x=>a.pixel(s.layers[0].canvas,x,24)[3]),red:[10,22,34,46].map(x=>a.pixel(s.layers[0].canvas,x,24)[0]),hole:a.pixel(s.layers[0].canvas,30,24)[3]});
   }return out;
  });for(const result of results){assert.equal(result.alphaErrors,0,JSON.stringify(result));assert.deepEqual(result.levels,[1,64,128,255]);assert.ok(result.red.every(red=>red>0),JSON.stringify(result));assert.equal(result.hole,0);assert.equal(result.history,1);if(result.tool==='gradient')assert.equal(result.preview,result.committed);}
 }finally{await browser.close();}
});

test('1200px drawing keeps the default path free of pixel reads and symmetry reads only bounded stroke rectangles',async t=>{
 const {browser,page}=await openPainter();try{
  const results=await page.evaluate(async()=>{
   const a=paintCheck,out=[],prototype=CanvasRenderingContext2D.prototype,native=prototype.getImageData;
   for(const symmetry of [false,true]){
    const s=a.session();s.width=s.height=1200;s.layers[0].canvas=a.newCanvas(1200,1200);const tools=a.createPaintTools(s),display=a.newCanvas(1200,1200),view=display.getContext('2d');tools.setOptions({size:24,hardness:.4,opacity:.5,smoothing:.3,mirrorX:symmetry,mirrorY:symmetry});let reads=0,maxReadPixels=0;
    prototype.getImageData=function(x,y,w,h,...rest){reads++;maxReadPixels=Math.max(maxReadPixels,w*h);return native.call(this,x,y,w,h,...rest);};
    const start=performance.now();try{tools.begin({x:220,y:240});for(let i=1;i<=12;i++){tools.move({x:220+i*8,y:240+i*3});view.clearRect(0,0,1200,1200);view.drawImage(tools.getPreview(),0,0);}}finally{prototype.getImageData=native;}
    const elapsed=performance.now()-start;await tools.end();out.push({symmetry,moves:12,elapsedMs:Math.round(elapsed*10)/10,perMoveMs:Math.round(elapsed/12*10)/10,reads,maxReadPixels,history:s.history.count()});
   }return out;
  });t.diagnostic(JSON.stringify(results));assert.equal(results[0].reads,0);assert.ok(results[1].reads>0);assert.ok(results[1].maxReadPixels<1200*1200/10,JSON.stringify(results));for(const result of results)assert.equal(result.history,1);
 }finally{await browser.close();}
});
