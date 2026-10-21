import test from 'node:test';
import assert from 'node:assert/strict';
let api;try{api=await import('../src/model/effect-playback.js');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
test('preview time isolates a selected element, frame or every occurrence of a skill name',()=>{
 const opts={timeSec:4,frozenTimeSec:1.2,playbackTarget:{elementId:'title'}};
 assert.equal(api.effectPlaybackTime(opts,{elementId:'title'}),4);assert.equal(api.effectPlaybackTime(opts,{elementId:'title',skillId:'skill'}),4);
 assert.equal(api.effectPlaybackTime(opts,{elementId:'art'}),1.2);assert.equal(api.effectPlaybackTime(opts,{elementId:null}),1.2);
 opts.playbackTarget={elementId:null};assert.equal(api.effectPlaybackTime(opts,{elementId:null}),4);assert.equal(api.effectPlaybackTime(opts,{elementId:'title'}),1.2);
 opts.playbackTarget={skillId:'skill',elementId:null};assert.equal(api.effectPlaybackTime(opts,{elementId:'a',skillId:'skill'}),4);assert.equal(api.effectPlaybackTime(opts,{elementId:'b',skillId:'skill'}),4);assert.equal(api.effectPlaybackTime(opts,{elementId:'a',skillId:'other'}),1.2);
 assert.equal(api.effectPlaybackTime({...opts,playbackTarget:null},{elementId:'title'}),4);
});

test('character playback follows the same range across title and skill-name mentions',()=>{
 const opts={timeSec:4,frozenTimeSec:1.2,playbackTarget:{elementId:'title',textRangeId:'chosen'}};
 assert.equal(api.effectPlaybackTime(opts,{elementId:'title',textRangeId:'chosen'}),4);
 assert.equal(api.effectPlaybackTime(opts,{elementId:'description',skillId:'skill',textRangeId:'chosen'}),4);
 assert.equal(api.effectPlaybackTime(opts,{elementId:'title',textRangeId:'other'}),1.2);
 assert.equal(api.effectPlaybackTime(opts,{elementId:'title'}),1.2);
});
