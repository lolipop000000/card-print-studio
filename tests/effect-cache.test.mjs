import test from 'node:test';
import assert from 'node:assert/strict';
import {createEffectCache} from '../src/render/effects/composite.js';

const result=(width=256,height=256)=>({surface:{canvas:{width,height}},report:{problems:[]},geometry:[]});
test('frozen outputs survive temporary-mask churn and invalidate with source changes',()=>{
 const cache=createEffectCache(),project={},target={},assets=new Map();cache.prepare(project,target,assets);let renders=0;
 const render=()=>{renders++;return result();},first=cache.memoOutput('frozen-effect:art',render);
 for(let i=0;i<80;i++)cache.memo('temporary-mask:'+i,()=>({}));
 assert.equal(cache.memoOutput('frozen-effect:art',render),first);assert.equal(renders,1);
 assets.set('art',{});cache.prepare(project,target,assets);assert.notEqual(cache.memoOutput('frozen-effect:art',render),first);assert.equal(renders,2);
 cache.clear();cache.memoOutput('frozen-effect:art',render);assert.equal(renders,3);
});
test('frozen output memory is bounded and recent outputs are retained',()=>{
 const cache=createEffectCache();let renders=0;const render=()=>{renders++;return result(2048,2048);};
 for(let i=0;i<4;i++)cache.memoOutput('frozen-effect:'+i,render);
 cache.memoOutput('frozen-effect:0',render);assert.equal(renders,4);
 cache.memoOutput('frozen-effect:4',render);assert.equal(renders,5);
 cache.memoOutput('frozen-effect:0',render);assert.equal(renders,5,'the recently displayed result should remain available');
 cache.memoOutput('frozen-effect:1',render);assert.equal(renders,6,'the oldest output should be evicted at the memory budget');
});
test('an oversized frozen output is rendered without being retained',()=>{
 const cache=createEffectCache();let renders=0;const render=()=>{renders++;return result(8192,8192);};
 cache.memoOutput('frozen-effect:large',render);cache.memoOutput('frozen-effect:large',render);assert.equal(renders,2);
});
