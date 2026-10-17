import test from 'node:test';
import assert from 'node:assert/strict';
import {elementAlignmentPositions} from '../src/ui/element-alignment.js';
const settings={cardWidthMm:63,cardHeightMm:88},e=(id,x,y,w,h)=>({id,rect:{x,y,w,h}});
const positions=(items,action,reference='selection')=>elementAlignmentPositions(items,action,reference,settings);
const apply=(items,changes)=>items.map(item=>({...item,rect:{...item.rect,...changes.find(p=>p.id===item.id)}}));

test('six alignment edges use selected bounds or card coordinates without rounding or resizing',()=>{
 const items=[e('a',7.123456789,12.4,10.2,8.6),e('b',28,25,8,11),e('c',43,45,12,10)],original=structuredClone(items),bounds={x:7.123456789,y:12.4,w:55-7.123456789,h:55-12.4};
 for(const reference of ['selection','card'])for(const action of ['left','hcenter','right','top','vcenter','bottom']){
  const changes=positions(items,action,reference),result=apply(items,changes),b=reference==='card'?{x:0,y:0,w:63,h:88}:bounds;
  for(const item of result){const r=item.rect;assert.equal(r.w,items.find(e=>e.id===item.id).rect.w);assert.equal(r.h,items.find(e=>e.id===item.id).rect.h);
   if(action==='left')assert.equal(r.x,b.x);if(action==='hcenter')assert.equal(r.x,b.x+(b.w-r.w)/2);if(action==='right')assert.equal(r.x,b.x+b.w-r.w);
   if(action==='top')assert.equal(r.y,b.y);if(action==='vcenter')assert.equal(r.y,b.y+(b.h-r.h)/2);if(action==='bottom')assert.equal(r.y,b.y+b.h-r.h);
  }
 }assert.deepEqual(items,original);
});

test('equal-gap distribution retains outside anchors with varying sizes and deterministic overlap order',()=>{
 for(const [axis,size,action] of [['x','w','distribute-horizontal'],['y','h','distribute-vertical']]){
  const items=[e('a',5,5,7,7),e('c',45,45,10,10),e('b',14,14,12,12)],result=apply(items,positions(items,action)),byId=Object.fromEntries(result.map(e=>[e.id,e.rect]));
  assert.equal(byId.a[axis],5);assert.equal(byId.c[axis],45);assert.equal(byId.b[axis],5+7+(55-5-29)/2);assert.equal(byId.b[axis]-byId.a[axis]-byId.a[size],byId.c[axis]-byId.b[axis]-byId.b[size]);
  const overlap=[e('a',5,5,20,20),e('b',8,8,30,30),e('c',25,25,15,15)],mixed=apply(overlap,positions(overlap,action));assert.equal(mixed[0].rect[axis],5);assert.equal(mixed[2].rect[axis],25);assert.equal(mixed[1].rect[axis],10);
  const ties=[e('a',0,0,3,3),e('b',0,0,3,3),e('c',9,9,3,3)];assert.deepEqual(positions(ties,action),positions(ties,action));assert.equal(apply(ties,positions(ties,action))[1].rect[axis],4.5);
 }
});

test('empty, unknown, already-aligned and insufficient selections create no position edits',()=>{
 assert.deepEqual(positions([],'left'),[]);assert.deepEqual(positions([e('a',0,0,10,10)],'left','card'),[]);assert.deepEqual(positions([e('a',2,3,10,10)],'left'),[]);
 assert.deepEqual(positions([e('a',2,3,10,10),e('b',20,20,10,10)],'distribute-horizontal'),[]);assert.deepEqual(positions([e('a',2,3,10,10)],'unknown'),[]);
 const repeated=[e('a',0,0,10,10),e('b',20,20,10,10),e('c',40,40,10,10)];assert.deepEqual(positions(repeated,'distribute-horizontal'),[]);
});

test('fully enclosing overlap cannot reorder the outside anchors through repeated distribution',()=>{
 const items=[e('wide',0,10,50,8),e('middle',10,30,5,8),e('last',20,50,5,8)],original=structuredClone(items);
 assert.throws(()=>positions(items,'distribute-horizontal'),/순서|겹쳐/);assert.deepEqual(items,original);
});
