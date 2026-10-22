import test from 'node:test';
import assert from 'node:assert/strict';
import {effectPreviewDpi} from '../src/ui/effect-preview.js';

test('manual DPI renders at the requested density while keeping oversized cards within a bounded surface',()=>{
 assert.equal(effectPreviewDpi({widthMm:63,heightMm:88,displayWidth:315,dpi:600}),600);
 assert.equal(effectPreviewDpi({widthMm:63,heightMm:88,displayWidth:2000,dpi:150}),150);
 const dpi=effectPreviewDpi({widthMm:200,heightMm:280,dpi:600});assert.ok(dpi<600&&dpi>200);
 assert.ok((224*dpi/25.4)*(304*dpi/25.4)<=16_000_000);
});

test('effect preview covers enlarged display pixels and high density screens',()=>{
 for(const [displayWidth,pixelRatio] of [[315,1],[945,1],[630,2]]){
  const dpi=effectPreviewDpi({widthMm:63,heightMm:88,displayWidth,pixelRatio});
  assert.ok(63*dpi/25.4>=displayWidth*pixelRatio);
 }
 assert.equal(effectPreviewDpi({widthMm:63,heightMm:88,displayWidth:315,printQuality:true}),300);
});

test('preview allocation includes the effect margin and stays bounded for large cards',()=>{
 for(const [widthMm,heightMm] of [[20,30],[63,88],[200,280]]){
  const dpi=effectPreviewDpi({widthMm,heightMm,displayWidth:2520,pixelRatio:3});
  assert.ok(dpi>0&&dpi<=600);
  const pixels=(widthMm+24)*dpi/25.4*(heightMm+24)*dpi/25.4;
  assert.ok(pixels<=4_000_000,'budget must count the surface outside card edges');
 }
});

test('missing or invalid screen density preserves a usable preview',()=>{
 const defaults={widthMm:63,heightMm:88,displayWidth:315};
 for(const pixelRatio of [0,-1,NaN,Infinity])assert.equal(effectPreviewDpi({...defaults,pixelRatio}),effectPreviewDpi(defaults));
});
