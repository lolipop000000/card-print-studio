import test from 'node:test';
import assert from 'node:assert/strict';

// Losing the second-finger handoff would let a view gesture commit a card move or brush stroke.
const module=await import('../src/ui/touch-viewport.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const touch=(id,x,y)=>({pointerType:'touch',pointerId:id,clientX:x,clientY:y});
function gesture(options={}){assert.equal(typeof module.createTouchGesture,'function','two-finger view gestures must have an edit-safe handoff');return module.createTouchGesture(options);}

test('the second touch starts navigation and consumes all remaining fingers until they are lifted',()=>{
 let starts=0,ends=0;const g=gesture({onStart:()=>starts++,onEnd:()=>ends++});
 assert.equal(g.down(touch(1,20,40)),false,'one finger remains available for editing');
 assert.equal(g.down(touch(2,80,40)),true);assert.equal(starts,1);
 assert.equal(g.up(touch(2,80,40)),true);
 assert.equal(g.move(touch(1,50,60)),true,'the surviving finger must not resume editing');
 assert.equal(g.up(touch(1,50,60)),true);assert.equal(ends,1);
 assert.equal(g.down(touch(3,20,40)),false,'a fresh one-finger edit can start');
});

test('pinch reports incremental scale and midpoint motion in screen pixels',()=>{
 const changes=[],g=gesture({onChange:value=>changes.push(value)});
 g.down(touch(1,0,0));g.down(touch(2,100,0));g.move(touch(2,200,0));
 assert.deepEqual(changes[0],{factor:2,from:{x:50,y:0},to:{x:100,y:0}});
 g.move(touch(1,20,0));g.move(touch(2,220,0));
 assert.equal(changes.at(-1).to.x,120);
 assert.ok(Math.abs(changes.reduce((scale,change)=>scale*change.factor,1)-2)<1e-10);
});

test('a cancelled or replaced pair never jumps and mouse or pen input stays outside navigation',()=>{
 const changes=[],g=gesture({onChange:value=>changes.push(value)});
 assert.equal(g.down({...touch(1,0,0),pointerType:'pen'}),false);
 assert.equal(g.down({...touch(2,0,0),pointerType:'mouse'}),false);
 g.down(touch(1,10,10));g.down(touch(2,10,10));g.move(touch(2,30,10));
 assert.ok(changes.every(change=>Number.isFinite(change.factor)),'overlapping contacts must not produce infinite zoom');
 g.down(touch(3,80,10));g.up(touch(1,10,10));const count=changes.length;
 g.move(touch(3,100,10));assert.equal(changes.length,count+1);assert.equal(changes.at(-1).factor,1.4);
 g.cancel();assert.equal(g.move(touch(3,120,10)),false);assert.equal(g.down(touch(4,0,0)),false);
});
