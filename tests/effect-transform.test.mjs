import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {makeVisualEffectLayer,createVisualEffects,validateVisualEffects} from '../src/model/visual-effects.js';
const api=existsSync(new URL('../src/ui/effect-transform.js',import.meta.url))?await import('../src/ui/effect-transform.js'):{};
const context={rect:{x:10,y:20,w:40,h:30},sizeHeightMm:10,timeSec:2,image:{width:80,height:40}};
const generator=()=>makeVisualEffectLayer('flame',{origin:{x:.1,y:.2,w:.3,h:.4},rotationDeg:0});
const decoration=()=>makeVisualEffectLayer('sprite',{origin:{x:.1,y:.2,w:.3,h:.4},rotationDeg:20,params:{shape:'image',renderMode:'single',cropLeft:.25,cropRight:.25,scaleX:1.5,scaleY:.5,anchorX:.2,anchorY:.8,mirror:'x',sizeStart:.3,rotation:10,spin:0},motion:{enabled:false,speed:1}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' vs '+b);

test('effect geometry distinguishes a selected origin from a cropped mirrored anchored decoration',()=>{
 assert.equal(typeof api.effectTransformGeometry,'function','transform geometry must exist');
 const area=api.effectTransformGeometry(generator(),context);assert.deepEqual(area.center,{x:20,y:32});assert.equal(area.width,12);assert.equal(area.height,12);
 const image=api.effectTransformGeometry(decoration(),context);assert.deepEqual(image.center,{x:20,y:32});assert.equal(image.width,9);assert.equal(image.height,3);assert.equal(image.rotationDeg,30);assert.equal(image.mirrorX,-1);assert.equal(image.anchorX,.2);
});
test('moving a selected effect clamps valid ratios without rewriting its source or other fields',()=>{
 const layer=generator(),before=structuredClone(layer),g=api.effectTransformGeometry(layer,context);
 const moved=api.transformEffectLayer(layer,g,'move',{x:0,y:0},{x:4,y:3});near(moved.origin.x,.2);near(moved.origin.y,.3);assert.deepEqual(layer,before);assert.deepEqual(moved.params,before.params);
 const limited=api.transformEffectLayer(layer,g,'move',{x:0,y:0},{x:-1000,y:1000});assert.equal(limited.origin.x,-1);assert.equal(limited.origin.y,5);const r=createVisualEffects();r.layers=[limited];assert.deepEqual(validateVisualEffects(r,'effect'),[]);
});
test('resizing mirrored rotated decoration preserves the opposite corner and source crop',()=>{
 const layer=decoration(),g=api.effectTransformGeometry(layer,context),opposite=g.corners[0],active=g.corners[2];
 const pointer={x:opposite.x+(active.x-opposite.x)*1.5,y:opposite.y+(active.y-opposite.y)*1.5};
 const resized=api.transformEffectLayer(layer,g,'se',active,pointer,{shiftKey:true}),next=api.effectTransformGeometry(resized,context);
 near(next.width,13.5);near(next.height,4.5);near(next.corners[0].x,opposite.x);near(next.corners[0].y,opposite.y);near(resized.params.sizeStart,.45);assert.equal(resized.params.cropLeft,.25);assert.equal(resized.params.scaleX,1.5);
});
test('a side handle changes only its own image axis and keeps the opposite side fixed',()=>{
 const layer=decoration(),g=api.effectTransformGeometry(layer,context),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),left=mid(g.corners[0],g.corners[3]),right=mid(g.corners[1],g.corners[2]);
 const resized=api.transformEffectLayer(layer,g,'e',right,{x:left.x+(right.x-left.x)*2,y:left.y+(right.y-left.y)*2}),next=api.effectTransformGeometry(resized,context);
 near(next.width,18);near(next.height,3);near(next.corners[0].x,g.corners[0].x);near(next.corners[0].y,g.corners[0].y);near(resized.params.scaleX,3);near(resized.params.scaleY,.5);
});
test('rotation wraps model degrees and Shift snaps while preserving the anchor position',()=>{
 const layer=generator(),g=api.effectTransformGeometry(layer,context),next=api.transformEffectLayer(layer,g,'rotate',{x:20,y:22},{x:30,y:32},{shiftKey:true});assert.equal(next.rotationDeg,90);assert.deepEqual(next.origin,layer.origin);
});
test('alignment uses rotated visual bounds and print-pixel nudges are independent of zoom',()=>{
 const layer=decoration(),g=api.effectTransformGeometry(layer,context),right=api.alignEffectLayer(layer,g,'right'),aligned=api.effectTransformGeometry(right,context);
 near(Math.max(...aligned.corners.map(p=>p.x)),50);const nudge=api.nudgeEffectLayer(layer,g,1,0);near((nudge.origin.x-layer.origin.x)*40,25.4/300);assert.deepEqual(nudge.params,layer.params);
});
test('filters cannot acquire target-moving transform geometry',()=>{
 const g=api.effectTransformGeometry(makeVisualEffectLayer('outline'),context);assert.equal(g.supported,false);assert.match(g.reason,/필터|발생 영역/);
});


test('zero-distance gestures and repeating alignment preserve exact values without a history-worthy edit',()=>{
 const layer=generator();layer.origin={x:.13,y:.27,w:.37,h:.41};layer.rotationDeg=27.2;const rect={x:10.3,y:20.7,w:40.9,h:30.6},g=api.effectTransformGeometry(layer,{...context,rect});
 assert.deepEqual(api.transformEffectLayer(layer,g,'move',{x:0,y:0},{x:0,y:0}),layer);
 const point={x:g.center.x,y:g.center.y-10};assert.deepEqual(api.transformEffectLayer(layer,g,'rotate',point,point),layer);
 const aligned=api.alignEffectLayer(layer,g,'right'),next=api.effectTransformGeometry(aligned,{...context,rect});assert.deepEqual(api.alignEffectLayer(aligned,next,'right'),aligned);
});
