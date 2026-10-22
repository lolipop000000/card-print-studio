import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import {drawGenerator} from './src/render/effects/generators.js';import {makeVisualEffectLayer} from './src/model/visual-effects.js';import * as images from './src/render/particle-images.js';window.particleApi={drawGenerator,makeVisualEffectLayer,...images};",resolveDir:root},bundle:true,format:'iife',write:false});
test('built-in images are distinct transparent rasters and every generator actually renders its optional path deterministically',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
   const api=window.particleApi,hash=data=>{let h=2166136261;for(const n of data)h=Math.imul(h^n,16777619);return h>>>0;};
   const textures=[];for(const [key] of api.PARTICLE_IMAGES){const asset=api.createBuiltinParticleAsset(key),image=new Image();image.src=asset.dataUrl;await image.decode();const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.drawImage(image,0,0);const pixels=g.getImageData(0,0,128,128).data;textures.push({key,w:image.naturalWidth,h:image.naturalHeight,corner:pixels[3],hasInk:pixels.some((v,i)=>i%4===3&&v>0),hash:hash(pixels)});}
   const renders=[];for(const kind of ['sprite','flame','smoke','starlight','ripple','aura','petal','vortex']){
    const layer=api.makeVisualEffectLayer(kind,{id:'fixed-path-fixture',params:{count:8}});
    const render=pattern=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const g=canvas.getContext('2d');g.scale(8,8);const current=structuredClone(layer);if(pattern)Object.assign(current.params,{motionPattern:pattern,pathDistance:.35,pathTurns:1,pathAmplitude:.15});api.drawGenerator(g,current,{rect:{x:20,y:20,w:30,h:12},seed:31,timeSec:1.2,sizeHeightMm:12,assets:new Map()});const pixels=g.getImageData(0,0,640,480).data;return {hash:hash(pixels),ink:pixels.some((v,i)=>i%4===3&&v>0)};};
    renders.push({kind,legacy:render(),natural:render('natural'),orbit:render('orbit'),again:render('orbit')});
   }return {textures,renders};
  });
  assert.equal(new Set(result.textures.map(texture=>texture.hash)).size,result.textures.length);
  for(const texture of result.textures){assert.equal(texture.w,128);assert.equal(texture.h,128);assert.equal(texture.corner,0,texture.key);assert.ok(texture.hasInk,texture.key);}
  for(const render of result.renders){assert.ok(render.legacy.ink,render.kind);assert.deepEqual(render.legacy,render.natural,render.kind+' retains original output');assert.deepEqual(render.orbit,render.again,render.kind+' repeatable fixed frame');assert.notEqual(render.orbit.hash,render.legacy.hash,render.kind+' path changes rendered positions');}
  assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
