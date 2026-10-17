import test from 'node:test';import assert from 'node:assert/strict';
import {createPaintHistory} from '../src/painting/history.js';
test('painting undo retains whole actions within step and actual byte budgets',async()=>{
 const h=createPaintHistory(),buffers=[];let value=0;
 for(let i=1;i<=45;i++){const bytes=new Uint8Array(10);buffers.push(bytes);value=i;const previous=i-1;assert.equal(h.push({byteLength:bytes.byteLength,undo:async()=>{value=previous;bytes[0]=0;},redo:async()=>{value=i;bytes[0]=1;}}),true);}
 assert.equal(h.count(),40);assert.equal(h.bytes(),400);for(let i=0;i<40;i++)assert.equal(await h.undo(),true);assert.equal(value,5);assert.equal(await h.undo(),false);
 assert.equal(await h.redo(),true);assert.equal(value,6);assert.equal(h.bytes(),400);
 const b=createPaintHistory({maxSteps:40,maxBytes:25});for(let i=0;i<3;i++)b.push({byteLength:10,undo:async()=>{},redo:async()=>{}});assert.equal(b.count(),2);assert.equal(b.bytes(),20);
 await b.undo();assert.equal(b.push({byteLength:30,undo:async()=>{},redo:async()=>{}}),false);assert.equal(b.count(),2);assert.equal(b.bytes(),20);assert.equal(await b.redo(),true);
});
test('failed undo and overlapping history commands cannot corrupt the stacks',async()=>{
 const h=createPaintHistory();h.push({byteLength:4,undo:async()=>{throw Error('decode failed');},redo:async()=>{}});await assert.rejects(h.undo(),/decode/);assert.equal(h.count(),1);assert.equal(h.canUndo(),true);
 let release;const gate=new Promise(resolve=>release=resolve),busy=createPaintHistory();busy.push({byteLength:1,undo:()=>gate,redo:async()=>{}});const first=busy.undo();assert.equal(await busy.undo(),false);assert.equal(busy.push({byteLength:1,undo:async()=>{},redo:async()=>{}}),false);release();assert.equal(await first,true);
});
