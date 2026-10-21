import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard} from '../src/model/project.js';
import {createVisualEffects} from '../src/model/visual-effects.js';

const model=await import('../supabase/functions/_shared/model.bundle.js');
const a='a'.repeat(64),b='b'.repeat(64),ref=hash=>'blob:sha256:'+hash;
const image=(id,hash)=>({id,mime:'image/png',dataUrl:ref(hash),width:1,height:1,paintingId:null});
const work=()=>{const p=createProject();p.cards.push(createCard('monster',p),createCard('item',p));p.assets={a:image('a',a),b:image('b',b)};return p;};
const invalid=fn=>assert.throws(fn,error=>error.code==='invalid-work');

test('bundle imports without DOM globals',()=>{assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');assert.equal(typeof model.validateCloudWork,'function');});
test('validateCloudWork counts cards and refs',()=>{assert.deepEqual(model.validateCloudWork(work()),{cardCount:3,blobRefs:[a,b]});});
test('rejects prototype keys and depth 65',()=>{
 for(const key of ['__proto__','constructor','prototype']){const p=work();p.extra=JSON.parse('{"'+key+'":{}}');invalid(()=>model.validateCloudWork(p));}
 const p=work();let cursor=p;for(let i=0;i<65;i++){cursor.extra={};cursor=cursor.extra;}invalid(()=>model.validateCloudWork(p));
 const cycle=work();cycle.extra=cycle;invalid(()=>model.validateCloudWork(cycle));
});
test('rejects 8 MiB + 1 byte JSON',()=>{
 const p=work();p.padding='';const length=new TextEncoder().encode(JSON.stringify(p)).length;
 p.padding='a'.repeat(8*1024*1024-length);assert.equal(new TextEncoder().encode(JSON.stringify(p)).length,8*1024*1024);model.validateCloudWork(p);
 p.padding+='a';invalid(()=>model.validateCloudWork(p));
 const korean=work();korean.padding='가'.repeat(3*1024*1024);invalid(()=>model.validateCloudWork(korean));
});
test('malformed nested image structures return invalid-work rather than raw exceptions',()=>{
 for(const patch of [{assets:null},{paintings:{bad:{layers:3}}},{cardTemplates:4}])invalid(()=>model.validateCloudWork(Object.assign(work(),patch)));
});
test('sniffImage recognizes raster signatures without accepting text or GIF',()=>{
 const png=Uint8Array.from([137,80,78,71,13,10,26,10]),jpeg=new Uint8Array([255,216,255,224]);
 const webp=new TextEncoder().encode('RIFF1234WEBPVP8 ');
 for(const [bytes,mime] of [[png,'image/png'],[jpeg,'image/jpeg'],[webp,'image/webp'],[new TextEncoder().encode('<svg/>'),null],[new TextEncoder().encode('GIF89a'),null],[new TextEncoder().encode('<html/>'),null],[new Uint8Array(),null],[new Uint8Array([...png,...new TextEncoder().encode('<html>bad</html>')]),'image/png']])assert.equal(model.sniffImage(bytes),mime);
});
test('validates each shared asset kind and dependency list rather than trusting the envelope',()=>{
 const keyword={id:'kw',name:'불',description:'설명',color:'#ff5500',iconAssetId:'a'};
 assert.deepEqual(model.validateCloudAsset('keyword',{kind:'keyword',item:keyword,assets:{a:image('a',a)},blobs:[a]}),{blobRefs:[a]});
 const effect={id:'fx',name:'불꽃',recipe:createVisualEffects('burning')};
 assert.deepEqual(model.validateCloudAsset('effect_template',{kind:'effect_template',item:effect,blobs:[]}),{blobRefs:[]});
 const template={id:'ct',name:'서식',kind:'monster',recipe:{widthMm:63,heightMm:88,autoSkillLayout:true,elements:[{type:'image',rect:{x:1,y:1,w:5,h:5},style:{},binding:null,assetId:'a'}],skillStyles:[]},assets:{a:image('a',a)},paintings:{}};
 assert.deepEqual(model.validateCloudAsset('card_template',{kind:'card_template',item:template,blobs:[a]}),{blobRefs:[a]});
 const entry={id:'entry',name:'그림',createdAt:1,asset:image('a',a)};
 assert.deepEqual(model.validateCloudAsset('image',{kind:'image',item:entry,blobs:[a]}),{blobRefs:[a]});
 for(const bad of [{kind:'image',item:entry,blobs:[]},{kind:'keyword',item:{...keyword,name:''},blobs:[]},{kind:'effect_template',item:{...effect,recipe:{}},blobs:[]},{kind:'image',item:{...entry,createdAt:-1},blobs:[a]},{kind:'image',item:{...entry,asset:{...entry.asset,dataUrl:'data:image/png;base64,AAAA'}},blobs:[]}])assert.throws(()=>model.validateCloudAsset(bad.kind,bad));
});
