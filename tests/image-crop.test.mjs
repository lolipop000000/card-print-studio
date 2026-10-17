import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImageSize,validateCropRect,cropRectFromPoints,sourcePointFromClient,createSpriteGrid,validateCropBatch} from '../src/model/image-crop.js';

test('crop rectangles preserve integer source pixels and reject empty or overflowing regions',()=>{
 assert.deepEqual(validateCropRect({x:2,y:3,width:4,height:5},{width:9,height:10}),{x:2,y:3,width:4,height:5});
 for(const rect of [{x:0,y:0,width:0,height:1},{x:-1,y:0,width:1,height:1},{x:8,y:0,width:2,height:1},{x:0,y:0,width:1.2,height:1}])assert.throws(()=>validateCropRect(rect,{width:9,height:10}),/픽셀|범위|영역/);
});

test('reversed fractional drags cover the same bounded source pixels',()=>{
 assert.deepEqual(cropRectFromPoints({x:8.2,y:7.6},{x:2.1,y:3.2},{width:10,height:9}),{x:2,y:3,width:7,height:5});
 assert.deepEqual(cropRectFromPoints({x:-2,y:12},{x:3,y:2},{width:10,height:9}),{x:0,y:2,width:3,height:7});
 assert.equal(cropRectFromPoints({x:4,y:2},{x:4,y:2},{width:10,height:9}),null);
});

test('floating point noise at an exact zoomed pixel edge never adds an extra column',()=>{
 assert.deepEqual(cropRectFromPoints({x:2-Number.EPSILON,y:3},{x:8+Number.EPSILON*8,y:7.999999999999999},{width:10,height:9}),{x:2,y:3,width:6,height:5});
});

test('client coordinates use the displayed bounds after zoom and scrolling',()=>{
 assert.deepEqual(sourcePointFromClient({x:150,y:110},{left:-50,top:-90,width:1000,height:800},{width:500,height:400}),{x:100,y:100});
 assert.deepEqual(sourcePointFromClient({x:-100,y:900},{left:-50,top:-90,width:1000,height:800},{width:500,height:400}),{x:0,y:400});
});

test('sprite counts derive whole cells with offsets and gutters',()=>{
 const cells=createSpriteGrid({width:14,height:13},{rows:2,columns:3,offsetX:2,offsetY:3,gapX:1,gapY:2});
 assert.deepEqual(cells.map(({row,column,rect})=>({row,column,rect})),[
  {row:0,column:0,rect:{x:2,y:3,width:3,height:4}},
  {row:0,column:1,rect:{x:6,y:3,width:3,height:4}},
  {row:0,column:2,rect:{x:10,y:3,width:3,height:4}},
  {row:1,column:0,rect:{x:2,y:9,width:3,height:4}},
  {row:1,column:1,rect:{x:6,y:9,width:3,height:4}},
  {row:1,column:2,rect:{x:10,y:9,width:3,height:4}}
 ]);
});

test('explicit sprite cell sizes reject overflow, empty cells and excessive grids before extraction',()=>{
 assert.deepEqual(createSpriteGrid({width:20,height:12},{rows:2,columns:2,cellWidth:4,cellHeight:3,offsetX:1,offsetY:2,gapX:2,gapY:1}).at(-1).rect,{x:7,y:6,width:4,height:3});
 for(const options of [{rows:0,columns:2},{rows:2,columns:2,cellWidth:11,cellHeight:2},{rows:257,columns:1},{rows:2,columns:30},{rows:1,columns:2,gapX:-1}])assert.throws(()=>createSpriteGrid({width:20,height:12},options),/행|열|셀|간격|픽셀|범위/);
});

test('image and batch budgets reject unusable allocations and empty selections',()=>{
 assert.deepEqual(validateImageSize({width:100,height:200}),{width:100,height:200});
 for(const size of [{width:0,height:1},{width:20000,height:1},{width:10000,height:10000}])assert.throws(()=>validateImageSize(size),/크기|픽셀/);
 assert.throws(()=>validateCropBatch({width:10,height:10},[]),/선택|영역/);
 assert.throws(()=>validateCropBatch({width:10,height:10},Array.from({length:257},()=>({rect:{x:0,y:0,width:1,height:1}}))),/256|개/);
 assert.throws(()=>validateCropBatch({width:4096,height:4096},[{rect:{x:0,y:0,width:4096,height:4096}},{rect:{x:0,y:0,width:4096,height:4096}},{rect:{x:0,y:0,width:4096,height:4096}}]),/픽셀|나누/);
});
