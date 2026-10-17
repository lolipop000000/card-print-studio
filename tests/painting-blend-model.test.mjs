import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import {exportCardFile,parseCardFile,importCardFile} from '../src/model/card-file.js';

const modes=['source-over','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity','lighter','source-in','source-out','source-atop','destination-over','destination-in','destination-out','destination-atop','copy','xor'];
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7xkAAAAASUVORK5CYII=';
function fixture(prefix='source'){
 const p=createProject(),paintingId=prefix+'-painting',layerId=prefix+'-layer',assetId=prefix+'-asset',keywordId=prefix+'-keyword';
 p.paintings[paintingId]={id:paintingId,width:64,height:64,activeLayerId:layerId,layers:[{id:layerId,name:'채색',visible:true,locked:false,opacity:.65,png:pixel}]};
 p.assets[assetId]={id:assetId,mime:'image/png',dataUrl:pixel,width:1,height:1,paintingId};
 p.keywords=[{id:keywordId,name:'화상',description:'지속 효과',color:'#ab5312',iconAssetId:assetId}];
 p.cards[0].passives=[{id:prefix+'-skill',name:'열기',effect:'화상',dice:null,keywords:[{keywordId,display:'both'}]}];
 return p;
}
const layer=p=>Object.values(p.paintings)[0].layers[0];

test('all 26 layer modes and legacy omitted mode survive deck and standalone card round trips',()=>{
 for(const mode of [undefined,...modes]){
  const p=fixture();if(mode!==undefined)layer(p).blendMode=mode;
  assert.deepEqual(validateProject(p),[]);
  assert.deepEqual(parseProject(serializeProject(p)).paintings,p.paintings);
  assert.deepEqual(parseCardFile(exportCardFile(p,p.cards[0].id)).paintings,p.paintings);
 }
});

test('unknown or malformed layer modes report the exact painting and layer and reject import atomically',()=>{
 for(const mode of ['normal','MULTIPLY','made-up','__proto__','',null,0,{},[]]){
  const p=fixture();layer(p).blendMode=mode;
  const problems=validateProject(p),problem=problems.find(p=>p.code==='layer'&&/혼합 모드/.test(p.message));
  assert.ok(problem,'reject mode '+JSON.stringify(mode));
  assert.match(problem.message,/source-painting/);assert.match(problem.message,/채색/);assert.match(problem.message,/지원/);
  assert.throws(()=>parseProject(JSON.stringify(p)),/혼합 모드/);
  const target=createProject(),before=serializeProject(target);
  assert.throws(()=>importCardFile(target,JSON.stringify({format:'card-print-studio-card',version:1,project:p})),/혼합 모드/);
  assert.equal(serializeProject(target),before);
 }
});

test('standalone imports cannot silently reuse keyword originals with different layer blending',()=>{
 const source=fixture(),target=fixture('target');layer(source).blendMode='multiply';layer(target).blendMode='screen';
 const before=serializeProject(target);
 assert.throws(()=>importCardFile(target,exportCardFile(source,source.cards[0].id)),/키워드.*화상|화상.*키워드/);
 assert.equal(serializeProject(target),before);
});

test('legacy omitted normal and explicit source-over keyword originals remain compatible',()=>{
 const source=fixture(),target=fixture('target');layer(target).blendMode='source-over';
 const imported=importCardFile(target,exportCardFile(source,source.cards[0].id));
 assert.equal(target.keywords.length,1);assert.equal(imported.passives[0].keywords[0].keywordId,'target-keyword');
 assert.equal(layer(target).blendMode,'source-over');assert.deepEqual(validateProject(target),[]);
});

test('matching blended keyword originals retain their modes while imported art remains independent',()=>{
 const source=fixture(),target=fixture('target');layer(source).blendMode='color-dodge';layer(target).blendMode='color-dodge';
 source.cards[0].artAssetId='source-asset';
 const imported=importCardFile(target,exportCardFile(source,source.cards[0].id));
 assert.equal(target.keywords.length,1);assert.equal(imported.passives[0].keywords[0].keywordId,'target-keyword');
 const saved=target.paintings[target.assets[imported.artAssetId].paintingId];
 assert.equal(saved.layers[0].blendMode,'color-dodge');assert.notEqual(saved.id,'target-painting');
 saved.layers[0].blendMode='difference';assert.equal(target.paintings['target-painting'].layers[0].blendMode,'color-dodge');
 assert.deepEqual(validateProject(target),[]);
});
