import test from 'node:test';
import assert from 'node:assert/strict';
import {createEffectTimeline} from '../src/ui/effect-timeline.js';
function clock(){
 let ms=0,id=0;const callbacks=new Map();
 return {now:()=>ms,requestFrame:fn=>{callbacks.set(++id,fn);return id;},cancelFrame:key=>callbacks.delete(key),
  step(delta){ms+=delta;const pending=[...callbacks.values()];callbacks.clear();pending.forEach(fn=>fn(ms));},
  pending:()=>callbacks.size};
}
test('preview starts paused, seeks any finite nonnegative printable time without playing',()=>{
 const c=clock(),frames=[],t=createEffectTimeline({...c,onFrame:v=>frames.push(v)});
 assert.equal(t.getTime(),1.2);assert.equal(t.isPlaying(),false);assert.equal(c.pending(),0);
 t.seek(2.35);t.pause();assert.equal(t.getTime(),2.35);assert.equal(t.isPlaying(),false);
 t.seek(8);assert.equal(t.getTime(),8);t.seek(-1);assert.equal(t.getTime(),0);
 t.seek(NaN);assert.equal(t.getTime(),0);assert.deepEqual(frames,[2.35,8,0]);t.destroy();
});
test('playback respects 24 fps, continues by elapsed time and never mutates a project',()=>{
 const c=clock(),frames=[],project={print:{effectFrameSec:2.35}},before=JSON.stringify(project);
 const t=createEffectTimeline({...c,initialSec:5.5,onFrame:v=>frames.push(v)});
 t.play();for(let i=0;i<60;i++)c.step(1000/60);
 assert.ok(frames.length>=20&&frames.length<=24,frames.length);assert.ok(Math.abs(t.getTime()-6.5)<.001);
 t.pause();const value=t.getTime(),count=frames.length;for(let i=0;i<60;i++)c.step(1000/60);
 assert.equal(t.getTime(),value);assert.equal(frames.length,count);assert.equal(c.pending(),0);assert.equal(JSON.stringify(project),before);t.destroy();
});
test('inactive and destroyed timelines cancel callbacks and cannot leak into a new editor',()=>{
 const c=clock(),frames=[],t=createEffectTimeline({...c,onFrame:v=>frames.push(v),reducedMotion:true});
 assert.equal(c.pending(),0);t.play();assert.equal(c.pending(),1);c.step(50);assert.equal(frames.length,1);
 t.setActive(false);const count=frames.length;assert.equal(t.isPlaying(),false);assert.equal(c.pending(),0);t.play();c.step(50);assert.equal(frames.length,count);
 t.setActive(true);t.play();t.destroy();t.play();t.seek(3);c.step(100);assert.equal(frames.length,count);assert.equal(c.pending(),0);
 const fresh=createEffectTimeline({...c,onFrame:v=>frames.push(v)});fresh.play();c.step(50);assert.equal(frames.length,count+1);fresh.destroy();
});
