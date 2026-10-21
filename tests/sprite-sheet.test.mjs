import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const moduleUrl=new URL('../src/model/sprite-sheet.js',import.meta.url);
const api=existsSync(moduleUrl)?await import(moduleUrl.href):{};
const asset={id:'one',mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=',width:1,height:1,paintingId:null};
const frame=(overrides={})=>({asset:{...asset,...overrides},name:'한 컷',sourceRect:{x:0,y:0,width:1,height:1}});
function packing(){assert.equal(typeof api.packSpriteSheet,'function','Sprite sheet packing must expose its public helper');return api.packSpriteSheet;}

test('a single cropped frame keeps the exact original asset identity and dimensions',async()=>{
 const source=frame(),before=structuredClone(source),result=await packing()([source],{columns:4});
 assert.equal(result.asset,source.asset);assert.deepEqual(result,{asset:source.asset,sheetColumns:1,sheetRows:1,frameCount:1});assert.deepEqual(source,before);
});

test('sheet packing rejects missing frames, excessive frame counts and invalid column preferences',async()=>{
 const pack=packing();
 for(const results of [undefined,null,{},[],Array.from({length:257},()=>frame())])await assert.rejects(()=>pack(results),/그림|프레임|256/);
 for(const columns of [0,-1,17,1.5,NaN,'2'])await assert.rejects(()=>pack([frame(),frame()],{columns}),/열|정수/);
});

test('sheet packing validates source dimensions and image formats before creating a canvas',async()=>{
 const pack=packing();
 for(const source of [{},frame({width:0}),frame({height:1.2}),frame({width:16385}),frame({width:8000,height:8000}),frame({dataUrl:'https://example.test/photo.png'}),frame({dataUrl:'data:image/svg+xml;base64,AAAA',mime:'image/svg+xml'})])await assert.rejects(()=>pack([source]),/그림|픽셀|크기|PNG|JPEG|WebP/);
});

test('sheet packing rejects combined pixel and dimension budgets before image decoding or allocation',async()=>{
 const pack=packing(),wide=frame({width:10000,height:2000});
 await assert.rejects(()=>pack([wide,wide],{columns:2}),/크기|픽셀/);
 await assert.rejects(()=>pack([wide,wide],{columns:1}),/크기|픽셀/);
});
