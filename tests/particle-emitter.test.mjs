import test from 'node:test';
import assert from 'node:assert/strict';
import {particlePathOffset,PARTICLE_PATHS} from '../src/model/particle-motion.js';
import {createVisualEffects,makeVisualEffectLayer,validateVisualEffects} from '../src/model/visual-effects.js';
import {createParticleEntry,createParticleLibrary,parseParticleLibrary,serializeParticleLibrary,instantiateParticle,particleRecipeTarget,particleRecipeForTarget} from '../src/model/particle-library.js';
import {createParticleLibraryStorage} from '../src/storage/particle-library.js';

const image={id:'source-image',mime:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5EE2cAAAAASUVORK5CYII=',width:1,height:1,paintingId:null};
const recipe=()=>({...createVisualEffects(),layers:[makeVisualEffectLayer('sprite',{params:{shape:'image',assetId:image.id,motionPattern:'spiral',pathDistance:.8,pathTurns:2,pathAmplitude:.3,sheetColumns:1}})]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('movement paths have predictable geometry, no default displacement, and closed orbit continuity',()=>{
 const sample=(pattern,phase,extra={})=>particlePathOffset({motionPattern:pattern,direction:0,pathDistance:2,pathTurns:1,pathAmplitude:.5,...extra},{phase,index:0,count:1});
 assert.deepEqual(sample('natural',.7),{x:0,y:0});
 near(sample('straight',.5).x,1);near(sample('straight',.5).y,0);
 near(sample('spiral',.5).x,-1);near(sample('spiral',.5).y,0);
 near(sample('vortex',.5).x,-1);near(sample('vortex',1).x,0);
 near(sample('wave',.25).x,.5);near(sample('wave',.25).y,.5);
 for(const axis of ['x','y'])near(sample('orbit',0)[axis],sample('orbit',1)[axis]);
 const left=particlePathOffset({motionPattern:'fan',direction:0,pathDistance:2,spread:1},{phase:1,index:0,count:3});
 const right=particlePathOffset({motionPattern:'fan',direction:0,pathDistance:2,spread:1},{phase:1,index:2,count:3});
 near(left.x,right.x);near(left.y,-right.y);assert.ok(left.y<0);
 assert.equal(PARTICLE_PATHS.length,7);
});

test('legacy recipes remain untouched and every emitter accepts validated movement controls',()=>{
 const old=makeVisualEffectLayer('flame'),before=structuredClone(old);assert.deepEqual(validateVisualEffects({version:2,seed:1,layers:[old]}),[]);assert.deepEqual(old,before);
 for(const kind of ['flame','smoke','sprite','starlight','petal','ripple']){
  const layer=makeVisualEffectLayer(kind,{params:{motionPattern:'orbit',pathDistance:.2,pathTurns:2,pathAmplitude:.1}});
  assert.deepEqual(validateVisualEffects({version:2,seed:1,layers:[layer]}),[],kind);
  layer.params.pathTurns=Infinity;assert.ok(validateVisualEffects({version:2,seed:1,layers:[layer]}).length,kind);
 }
});

test('portable particle recipes capture only referenced pixels and remap all IDs on every use',()=>{
 const source=recipe(),entry=createParticleEntry('나선 빛',source,{[image.id]:image,unused:{...image,id:'unused'}});
 const library={...createParticleLibrary(),entries:[entry]},loaded=parseParticleLibrary(serializeParticleLibrary(library));
 assert.deepEqual(loaded,library);assert.deepEqual(Object.keys(entry.assets),[image.id]);assert.equal(entry.assets[image.id].paintingId,null);
 source.layers[0].params.color='#000000';assert.notEqual(entry.recipe.layers[0].params.color,'#000000');
 const first=instantiateParticle(entry),second=instantiateParticle(entry);
 assert.notEqual(first.recipe.layers[0].id,entry.recipe.layers[0].id);assert.notEqual(first.recipe.layers[0].id,second.recipe.layers[0].id);
 assert.notEqual(first.recipe.layers[0].params.assetId,image.id);assert.ok(first.assets[first.recipe.layers[0].params.assetId]);
 assert.equal(first.recipe.layers[0].params.motionPattern,'spiral');assert.deepEqual(validateVisualEffects(first.recipe),[]);
 assert.throws(()=>createParticleEntry('손실',recipe(),{}),/그림/);
 const malformed=structuredClone(library);delete malformed.entries[0].assets[image.id];assert.throws(()=>parseParticleLibrary(JSON.stringify(malformed)),/그림/);
});

test('particle library survives controller restart independently of the image library cache',async()=>{
 const values=new Map(),persistence={get:async key=>values.get(key),set:async(key,value)=>values.set(key,structuredClone(value))};
 values.set('shared-library:v1','image-cache-unchanged');
 let storage=createParticleLibraryStorage({persistence});assert.deepEqual(await storage.load(),createParticleLibrary());
 const library={...createParticleLibrary(),entries:[createParticleEntry('보관한 빛',recipe(),{[image.id]:image})]};
 await storage.save(library);storage.destroy();storage=createParticleLibraryStorage({persistence});assert.deepEqual(await storage.load(),library);
 assert.equal(values.get('shared-library:v1'),'image-cache-unchanged');storage.destroy();
});

test('particle recipes preserve frame placement and restrict text distortion to compatible targets',()=>{
 const frame={...recipe(),frame:{scope:'full',bandMm:5}};assert.equal(particleRecipeTarget(frame),'frame');
 assert.deepEqual(particleRecipeForTarget(frame,'frame'),frame);assert.equal(particleRecipeForTarget(frame,'text').frame,undefined);assert.ok(frame.frame);
 const text={...recipe(),layers:[makeVisualEffectLayer('textWarp'),...recipe().layers]};assert.equal(particleRecipeTarget(text),'text');
 assert.deepEqual(particleRecipeForTarget(text,'text'),text);assert.throws(()=>particleRecipeForTarget(text,'image'),/글자/);
 const id='a'.repeat(128),asset={...image,id},fx=recipe();fx.layers[0].params.assetId=id;
 assert.ok(createParticleEntry('긴 그림 ID',fx,{[id]:asset}).assets[id]);
});
