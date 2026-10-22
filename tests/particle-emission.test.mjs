import test from 'node:test';
import assert from 'node:assert/strict';
import {createParticleEmission,sampleParticleEmission,sampleLifetimeCurve} from '../src/model/particle-emission.js';
import {makeVisualEffectLayer,validateVisualEffects} from '../src/model/visual-effects.js';
import {createParticleEntry,createParticleLibrary,parseParticleLibrary,serializeParticleLibrary,instantiateParticle} from '../src/model/particle-library.js';
import {validateCloudAsset} from '../src/cloud/server-model.js';
import {effectRandom} from '../src/render/effects/random.js';

const random=(index,salt)=>effectRandom(42,'fixture',index,salt);
const schedule=patch=>({...createParticleEmission({life:1,count:10}),rate:0,delay:0,duration:2,loops:1,loopDelay:0,prewarm:0,lifeMin:1,lifeMax:1,bursts:[],...patch});
const sample=(emission,time)=>sampleParticleEmission(emission,time,random);
const births=particles=>particles.map(p=>Number(p.birth.toFixed(6))).sort((a,b)=>a-b);

test('reusing a particle recipe shares identical image pixels already present in the deck',()=>{
 const asset={id:'source',mime:'image/png',width:1,height:1,paintingId:null,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII='};
 const entry=createParticleEntry('공유 이미지',{version:2,seed:1,layers:[makeVisualEffectLayer('sprite',{params:{shape:'image',assetId:asset.id}})]},{[asset.id]:asset});
 const existing={...asset,id:'already-here'},copy=instantiateParticle(entry,{[existing.id]:existing});
 assert.equal(copy.recipe.layers[0].params.assetId,existing.id);assert.deepEqual(copy.assets,{});assert.equal(existing.id,'already-here');
 const different={...existing,dataUrl:existing.dataUrl+'different'},fresh=instantiateParticle(entry,{[different.id]:different});assert.equal(Object.keys(fresh.assets).length,1);
});

test('particle overlap order is stable by birth even when lifetimes vary',()=>{
 const e=schedule({rate:5,lifeMin:.3,lifeMax:2});
 const front=sample({...e,drawOrder:'newerFront'},1),back=sample({...e,drawOrder:'olderFront'},1);
 assert.deepEqual(back,[...front].reverse());assert.ok(front.every((p,i)=>!i||p.birth>=front[i-1].birth));
 assert.ok(validateVisualEffects({version:2,seed:1,layers:[makeVisualEffectLayer('sprite',{emission:{...e,drawOrder:'invalid'}})]}).length);
});

test('continuous generation respects delay, duration and surviving particle lifetimes',()=>{
 const e=schedule({rate:4,delay:.5,duration:1});
 assert.deepEqual(sample(e,.49),[]);
 assert.deepEqual(births(sample(e,1.49)),[.75,1,1.25]);
 assert.deepEqual(births(sample(e,1.6)),[.75,1,1.25,1.5]);
 assert.deepEqual(births(sample(e,2.3)),[1.5]);
 assert.deepEqual(sample(e,2.5),[]);
});

test('bursts honor their own time, quantity, repeat interval and emitter loop gaps',()=>{
 const e=schedule({duration:1,loops:2,loopDelay:.5,lifeMin:.4,lifeMax:.4,bursts:[{time:.2,countMin:2,countMax:2,cycles:3,interval:.3,probability:1}]});
 assert.deepEqual(sample(e,.19),[]);
 assert.deepEqual(births(sample(e,.55)),[.2,.2,.5,.5]);
 assert.deepEqual(births(sample(e,1.1)),[.8,.8]);
 assert.deepEqual(sample(e,1.4),[]);
 assert.deepEqual(births(sample(e,1.71)),[1.7,1.7]);
 assert.deepEqual(sample(e,3.2),[],'finite loops never restart');
});

test('continuous emission and multiple bursts coexist including a burst at the end of the duration',()=>{
 const e=schedule({rate:2,duration:1,bursts:[{time:0,countMin:3,countMax:3,cycles:1,interval:0,probability:1},{time:1,countMin:2,countMax:2,cycles:1,interval:0,probability:1}]});
 assert.deepEqual(births(sample(e,.6)),[0,0,0,.5]);
 assert.deepEqual(births(sample(e,1)),[.5,1,1,1]);
});

test('rate curves integrate their area and distribute births within linear segments',()=>{
 const e=schedule({duration:2,lifeMin:3,lifeMax:3,rateCurve:[{at:0,rate:0},{at:.5,rate:4},{at:1,rate:0}]});
 const result=sample(e,2);assert.equal(result.length,4);
 const times=births(result);assert.ok(Math.abs(times[0]-Math.SQRT1_2)<1e-6);assert.equal(times[1],1);
 assert.ok(Math.abs(times[2]-(2-Math.SQRT1_2))<1e-6);assert.equal(times[3],2);
});

test('prewarm, random bursts and lifetime ranges reproduce when seeking backwards',()=>{
 const e=schedule({duration:1,loops:0,prewarm:2,rate:7,lifeMin:.4,lifeMax:1.3,bursts:[{time:.1,countMin:2,countMax:6,cycles:2,interval:.3,probability:.7}]});
 assert.ok(sample(e,0).length);const before=sample(e,.37);sample(e,10);assert.deepEqual(sample(e,.37),before);
 assert.ok(before.every(p=>p.life>=.4&&p.life<=1.3&&p.age>=0&&p.phase>=0&&p.phase<1));
 const off=schedule({bursts:[{time:0,countMin:5,countMax:5,cycles:1,interval:0,probability:0}]});assert.deepEqual(sample(off,.1),[]);
});

test('large seek times stay bounded and prefer the most recent live particles',()=>{
 const e=schedule({duration:.1,loops:0,rate:500,lifeMin:10,lifeMax:10,maxAlive:16});
 const result=sample(e,1e7);assert.equal(result.length,16);assert.ok(result.every(p=>p.age<.05));
 assert.deepEqual(sample(e,1e7),result);
});

test('a full display cap retains the newest births across interleaved continuous emission and burst repeats',()=>{
 const e=schedule({rate:1,duration:10,lifeMin:10,lifeMax:10,maxAlive:4,bursts:[{time:3.5,countMin:1,countMax:1,cycles:2,interval:1,probability:1}]});
 assert.deepEqual(births(sample(e,5)),[3.5,4,4.5,5]);
});

test('zero-probability bursts do no random or repeat work, even with a long prewarmed history',()=>{
 const e=schedule({rate:0,duration:.05,loops:0,lifeMin:30,lifeMax:30,maxAlive:32,bursts:Array.from({length:32},()=>({time:0,countMin:1024,countMax:1024,cycles:1000,interval:.00005,probability:0}))});
 let calls=0;assert.deepEqual(sampleParticleEmission(e,30,()=>{calls++;return .5;}),[]);assert.equal(calls,0);
});

test('a capped burst still finds living slots when newer slots have shorter randomized lives',()=>{
 const e=schedule({duration:1,lifeMin:.1,lifeMax:1,maxAlive:3,bursts:[{time:0,countMin:3,countMax:3,cycles:1,interval:0,probability:1}]}),seeded=(index,salt)=>effectRandom(0,'review',index,salt);
 const all=sampleParticleEmission(e,.5,seeded);assert.equal(all.length,1);assert.equal(all[0].slot,1);
 assert.deepEqual(sampleParticleEmission({...e,maxAlive:1},.5,seeded),all);
});

test('lifetime size and opacity curves interpolate endpoints and intermediate points independently',()=>{
 const size=[{at:0,value:.2},{at:.25,value:2},{at:1,value:0}],alpha=[{at:0,value:0},{at:.1,value:1},{at:1,value:0}];
 assert.equal(sampleLifetimeCurve(size,0),.2);assert.equal(sampleLifetimeCurve(size,.25),2);assert.equal(sampleLifetimeCurve(size,1),0);
 assert.ok(Math.abs(sampleLifetimeCurve(size,.625)-1)<1e-9);assert.equal(sampleLifetimeCurve(alpha,.1),1);
 const e=schedule({sizeCurve:size,alphaCurve:alpha,bursts:[{time:0,countMin:1,countMax:1,cycles:1,interval:0,probability:1}]});
 const [p]=sample(e,.25);assert.equal(p.sizeScale,2);assert.ok(Math.abs(p.alpha-5/6)<1e-9);
 assert.deepEqual(validateVisualEffects({version:2,seed:1,layers:[makeVisualEffectLayer('sprite',{emission:e})]}),[]);
});

test('legacy recipes are unchanged while schedules survive portable storage and cloud validation',()=>{
 const old=makeVisualEffectLayer('sprite'),before=structuredClone(old);assert.deepEqual(validateVisualEffects({version:2,seed:1,layers:[old]}),[]);assert.deepEqual(old,before);assert.equal(old.emission,undefined);
 const emission=schedule({bursts:[{time:1,countMin:2,countMax:5,cycles:2,interval:.2,probability:.8}]}),recipe={version:2,seed:1,layers:[{...old,emission}]};
 assert.deepEqual(validateVisualEffects(recipe),[]);
 const entry=createParticleEntry('생성 시간표',recipe,{}),library={...createParticleLibrary(),entries:[entry]};
 assert.deepEqual(parseParticleLibrary(serializeParticleLibrary(library)).entries[0].recipe,recipe);
 assert.doesNotThrow(()=>validateCloudAsset('effect_template',{kind:'effect_template',item:{id:'timed',name:'생성 시간표',target:'any',recipe},blobs:[]}));
});

test('invalid schedules fail with the actual setting identified',()=>{
 for(const [field,value] of [['rate',-1],['duration',0],['delay',Infinity],['maxAlive',1.5],['loops',-1],['lifeMin',0],['lifeMax',31]]){
  const layer=makeVisualEffectLayer('sprite',{emission:schedule({[field]:value})});assert.ok(validateVisualEffects({version:2,seed:1,layers:[layer]}).length,field);
 }
 for(const patch of [{lifeMin:2,lifeMax:1},{rateCurve:[{at:0,rate:1},{at:0,rate:2}]},{bursts:[{time:3,countMin:1,countMax:1,cycles:1,interval:0,probability:1}]},{bursts:[{time:0,countMin:5,countMax:2,cycles:1,interval:0,probability:1}]},{bursts:[{time:0,countMin:2,countMax:2,cycles:2,interval:0,probability:1}]}]){
  assert.ok(validateVisualEffects({version:2,seed:1,layers:[makeVisualEffectLayer('sprite',{emission:schedule(patch)})]}).length,JSON.stringify(patch));
 }
 assert.ok(validateVisualEffects({version:2,seed:1,layers:[makeVisualEffectLayer('bloom',{emission:schedule({})})]}).length);
});
