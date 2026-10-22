import test from 'node:test';
import assert from 'node:assert/strict';
import * as preview from '../src/ui/effect-preview.js';
import {createEffectTimeline} from '../src/ui/effect-timeline.js';

const display={widthMm:63,heightMm:88,displayWidth:945,pixelRatio:2};
test('manual quality stays sharp during playback and slow frames cannot override the chosen DPI',()=>{
 const quality=preview.createEffectPreviewQuality();
 for(let i=0;i<5;i++){assert.equal(quality.dpi({...display,active:true,dpi:300}),300);quality.record(800,300,{active:true,manual:true});}
 assert.equal(quality.dpi({...display,dpi:600}),600);assert.equal(quality.dpi({...display,active:true,dpi:150}),150);
});
test('expensive playback lowers its own raster work and pausing restores the full display resolution',()=>{
 assert.equal(typeof preview.createEffectPreviewQuality,'function');
 const quality=preview.createEffectPreviewQuality(),sharp=quality.dpi(display),first=quality.dpi({...display,active:true});
 assert.ok(first<=100&&first<sharp);
 quality.record(600,first,{active:true});
 const reduced=quality.dpi({...display,active:true});
 assert.ok(reduced<first&&reduced>=50);
 assert.equal(quality.dpi(display),sharp,'a slow animation must never lower the paused image');
 assert.equal(quality.dpi({...display,printQuality:true}),preview.effectPreviewDpi({...display,printQuality:true}));
});

test('preview quality ignores invalid timings and recovers gradually after sustained fast frames',()=>{
 assert.equal(typeof preview.createEffectPreviewQuality,'function');
 const quality=preview.createEffectPreviewQuality(),initial=quality.dpi({...display,active:true});
 for(const value of [0,-1,NaN,Infinity])quality.record(value,initial,{active:true});
 assert.equal(quality.dpi({...display,active:true}),initial);
 quality.record(600,initial,{active:false});assert.equal(quality.dpi({...display,active:true}),initial);
 quality.record(600,initial,{active:true});const reduced=quality.dpi({...display,active:true});
 for(let i=0;i<12;i++)quality.record(8,reduced,{active:true});
 const recovered=quality.dpi({...display,active:true});assert.ok(recovered>reduced&&recovered<=reduced+10);
});

test('one cold shader allocation does not force a blurrier steady playback image',()=>{
 const quality=preview.createEffectPreviewQuality(),initial=quality.dpi({...display,active:true});
 quality.record(100,initial,{active:true});
 assert.equal(quality.dpi({...display,active:true}),initial);
 quality.record(90,initial,{active:true});
 assert.ok(quality.dpi({...display,active:true})<initial,'sustained slow work must still reduce raster cost');
});

test('playback state notifications request a sharp paused image once while lifecycle disposal stays quiet',()=>{
 const states=[],scheduled=new Map();let id=0;
 const timeline=createEffectTimeline({onFrame:()=>{},onStateChange:state=>states.push(state),now:()=>0,requestFrame:fn=>{scheduled.set(++id,fn);return id;},cancelFrame:key=>scheduled.delete(key)});
 timeline.play();timeline.play();timeline.pause();timeline.pause();timeline.play();timeline.setActive(false);timeline.setActive(true);timeline.play();timeline.destroy();
 assert.deepEqual(states,[true,false,true,false,true]);
 assert.equal(scheduled.size,0);
});
