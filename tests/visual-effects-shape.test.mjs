import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/render/effects/shape.js').catch(error => {
 if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
 throw error;
});
const analyze = (alpha,w,h,options) => {
 assert.equal(typeof api.analyzeAlpha,'function','pure shape analysis is available');
 return api.analyzeAlpha(alpha,w,h,options);
};
function mask(w,h,rectangles){const a=new Uint8Array(w*h);for(const [x,y,rw,rh,value=255] of rectangles)for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++)a[yy*w+xx]=value;return a;}

test('shape analysis fills enclosed glyph counters without joining separated glyphs',()=>{
 const alpha=mask(25,15,[[2,2,8,10],[5,5,2,4,0],[15,3,6,9]]);
 const s=analyze(alpha,25,15,{scale:2,work:{x:-2,y:5,w:12.5,h:7.5}});
 assert.equal(s.solid[6*25+5],1,'enclosed counter is filled');
 assert.equal(s.solid[6*25+12],0,'gap between glyphs remains air');
 assert.deepEqual(s.boundsMm,{x:-1,y:6,w:9.5,h:5});
 assert.ok(s.points.some(p=>p.x<3));assert.ok(s.points.some(p=>p.x>5));
 assert.ok(s.points.every(p=>Math.abs(Math.hypot(p.nx,p.ny)-1)<.0001));
});

test('up emission contains no lower faces and openOnly rejects a covered stroke',()=>{
 const s=analyze(mask(50,45,[[10,5,25,8],[10,18,25,10]]),50,45,{scale:5});
 assert.equal(typeof api.selectEmissionPoints,'function');
 const allUp=api.selectEmissionPoints(s,{face:'up',openOnly:false});
 const openUp=api.selectEmissionPoints(s,{face:'up',openOnly:true});
 assert.ok(allUp.some(p=>p.y>3.5),'lower stroke initially contributes upward face');
 assert.ok(openUp.length>0);assert.ok(openUp.every(p=>p.ny<-.45));
 assert.equal(openUp.filter(p=>p.y>3.5&&p.x>2.7&&p.x<6.3).length,0,'1mm gap is blocked within 1.2mm clearance');
 assert.ok(api.selectEmissionPoints(s,{face:'down',openOnly:false}).every(p=>p.ny>.45));
 assert.ok(api.selectEmissionPoints(s,{face:'side',openOnly:false}).every(p=>Math.abs(p.nx)>.7));
});

test('signed distance uses Euclidean millimeters and preserves the work origin',()=>{
 const s=analyze(mask(12,12,[[4,4,4,4]]),12,12,{scale:2,work:{x:10,y:-3,w:6,h:6}});
 assert.equal(s.distance[5*12+5],-1);
 assert.equal(s.distance[4*12+1],1.5);
 assert.ok(Math.abs(s.distance[1*12+1]-Math.sqrt(18)/2)<1e-5);
 assert.ok(s.points.every(p=>p.x>=12&&p.y>=-1));
 assert.ok(s.inside.length>0);
});

test('empty and below-threshold alpha never manufacture emitters',()=>{
 const s=analyze(mask(10,10,[[3,3,4,4,25]]),10,10,{scale:1});
 assert.equal(s.boundsMm,null);assert.equal(s.points.length,0);assert.equal(s.inside.length,0);
 assert.equal(s.solid.some(Boolean),false);assert.ok(s.distance.every(v=>v===Infinity));
 assert.deepEqual(api.selectEmissionPoints(s,{face:'all',openOnly:false}),[]);
});
