import test from 'node:test';
import assert from 'node:assert/strict';
import {effectRandom} from '../src/render/effects/random.js';

const api=await import('../src/render/effects/starlight.js').catch(error=>{
 if(error.code==='ERR_MODULE_NOT_FOUND')return {};
 throw error;
});

// Drawing commands are inspected here for bounds and state ownership; actual
// light profiles, transparency and time continuity use a browser canvas.
function context(){
 const commands=[],stack=[];
 const ctx={globalAlpha:.37,fillStyle:'#010203',commands};
 for(const name of ['translate','rotate','scale','beginPath','moveTo','bezierCurveTo','closePath','rect','clip','fillRect','fill'])ctx[name]=(...args)=>commands.push([name,...args]);
 ctx.save=()=>{stack.push({globalAlpha:ctx.globalAlpha,fillStyle:ctx.fillStyle});commands.push(['save']);};
 ctx.restore=()=>{Object.assign(ctx,stack.pop());commands.push(['restore']);};
 ctx.createRadialGradient=(...args)=>{const stops=[];commands.push(['gradient',...args,stops]);return {addColorStop:(...stop)=>stops.push(stop)};};
 ctx.getImageData=()=>{throw new Error('starlight must never read pixels');};
 ctx.canvas={ownerDocument:{createElement:()=>({width:1,height:1,getContext:()=>context()})}};
 ctx.drawImage=(canvas,...args)=>commands.push(['drawImage',canvas.width,canvas.height,...args]);
 return ctx;
}
function draw(ctx,layer={},options={}){
 assert.equal(typeof api.drawStarlight,'function','dedicated four-point starlight renderer is exported');
 const included=[];
 api.drawStarlight(ctx,{id:'four-points',params:{count:1,twinkle:0,spin:0,...layer.params},...layer},{height:100,time:1.2,point:()=>({x:7,y:11}),random:()=>.5,include:(...args)=>included.push(args),...options});
 return included;
}

test('starlight renders nothing for zero count and never manufactures absent emission points',()=>{
 for(const layer of [{params:{count:0}},{params:{count:-1}}]){
  const ctx=context(),included=draw(ctx,layer,{point:()=>{throw new Error('zero count consumed an emitter');}});
  assert.equal(included.length,0);assert.equal(ctx.commands.length,0);
 }
 const ctx=context(),included=draw(ctx,{}, {point:()=>null});
 assert.equal(included.length,0);assert.equal(ctx.commands.filter(([name])=>name==='fill').length,0);
});

test('starlight reports finite full-glow bounds and restores the caller alpha',()=>{
 const ctx=context(),included=draw(ctx,{params:{count:3,size:.2,stretch:4,glow:2,twinkle:0,spin:0}},{point:index=>index===0?{x:7,y:11}:index===1?null:{x:Infinity,y:1}});
 assert.equal(included.length,1);assert.deepEqual(included[0].slice(0,2),[7,11]);
 assert.ok(included[0][2]>=80,'bounds include vertically stretched tips and glow');
 assert.equal(ctx.globalAlpha,.37);assert.equal(ctx.fillStyle,'#010203');
 assert.ok(ctx.commands.filter(([name])=>name==='drawImage').length>0);
});

test('starlight caps malformed density and never emits nonfinite drawing coordinates',()=>{
 const ctx=context();let emitted=0;
 const included=draw(ctx,{params:{count:1e9,size:Infinity,stretch:NaN,glow:NaN,rotation:Infinity,spin:NaN}},{point:()=>{emitted++;return {x:7,y:11};}});
 assert.ok(emitted>0&&emitted<=160,'one layer cannot allocate unbounded stars');
 assert.equal(included.length,emitted);
 for(const command of ctx.commands)for(const value of command.slice(1))if(typeof value==='number')assert.ok(Number.isFinite(value),command[0]+' uses finite coordinates');
});

test('starlight seed and explicit time reproduce the same vector commands without mutating params',()=>{
 const layer={id:'seeded',params:{count:4,life:2.8,twinkle:1,spin:.1,randomness:1}},before=JSON.stringify(layer);
 const render=time=>{const ctx=context();draw(ctx,layer,{time,random:(index,salt)=>effectRandom(37,layer.id,index,salt),point:(index,cycle)=>({x:effectRandom(37,layer.id,index,cycle+':x')*100,y:effectRandom(37,layer.id,index,cycle+':y')*100})});return ctx.commands;};
 assert.deepEqual(render(9.345),render(9.345));
 assert.notDeepEqual(render(9.345),render(9.445));
 assert.equal(JSON.stringify(layer),before);
});
