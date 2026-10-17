import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model/project.js';
import {planSheets} from '../src/printing/layout.js';
import {cropMarks} from '../src/printing/marks.js';
function deck(quantity,print={}){const p=createProject();p.cards[0].quantity=quantity;Object.assign(p.print,print);return p;}
test('A4 quantity expands to centered 3 by 3 grids and preserves partial duplex slots',()=>{
 const plan=planSheets(deck(10,{duplex:true}));assert.deepEqual([plan.widthMm,plan.heightMm,plan.columns,plan.rows,plan.capacity],[210,297,3,3,9]);
 assert.deepEqual(plan.pages.map(p=>p.side),['front','back','front','back']);assert.equal(plan.pages[2].cells.filter(c=>c.cardId).length,1);assert.equal(plan.pages[3].cells.filter(c=>c.cardId).length,1);
 assert.equal(plan.pages[0].cells[0].xMm,6.5);assert.equal(plan.pages[0].cells[0].yMm,12.5);
 for(let i=0;i<9;i++){const a=plan.pages[2].cells[i],b=plan.pages[3].cells[i];assert.equal(b.cardId,a.cardId);assert.equal(b.xMm,210-a.xMm-63);assert.equal(b.yMm,a.yMm);}
});
test('both paper directions and both flip edges reflect only positions about the physical axis',()=>{
 for(const orientation of ['portrait','landscape'])for(const flip of ['long','short']){
  const plan=planSheets(deck(1,{orientation,flip,duplex:true,backOffsetXmm:.4,backOffsetYmm:-.3}));
  const a=plan.pages[0].cells[0],b=plan.pages[1].cells[0],mirrorX=(orientation==='portrait')===(flip==='long');
  assert.equal(b.xMm,(mirrorX?plan.widthMm-a.xMm-63:a.xMm)+.4);assert.equal(b.yMm,(mirrorX?a.yMm:plan.heightMm-a.yMm-88)-.3);
 }
 const letter=planSheets(deck(1,{paper:'Letter',orientation:'landscape'}));assert.equal(letter.widthMm,279.4);assert.equal(letter.heightMm,215.9);
});
test('impossible card geometry and back correction outside the paper are rejected',()=>{
 const p=deck(1);p.settings.cardWidthMm=p.settings.maxWidthMm=220;assert.throws(()=>planSheets(p),/들어가지/);
 assert.throws(()=>planSheets(deck(1,{duplex:true,backOffsetXmm:30})),/용지 밖/);
});
test('crop marks never cross any card including tightly packed neighboring slots',()=>{
 for(const gapMm of [0,.4,4]){
  const p=deck(9,{gapMm,duplex:true});const plan=planSheets(p);
  for(const page of plan.pages)for(const l of cropMarks(page,plan)){
   assert.ok(Math.min(l.x1,l.x2)>=0&&Math.max(l.x1,l.x2)<=plan.widthMm);
   assert.ok(Math.min(l.y1,l.y2)>=0&&Math.max(l.y1,l.y2)<=plan.heightMm);
   for(const c of page.cells){const overlaps=l.y1===l.y2?
    l.y1>=c.yMm&&l.y1<=c.yMm+c.heightMm&&Math.max(l.x1,l.x2)>c.xMm&&Math.min(l.x1,l.x2)<c.xMm+c.widthMm:
    l.x1>=c.xMm&&l.x1<=c.xMm+c.widthMm&&Math.max(l.y1,l.y2)>c.yMm&&Math.min(l.y1,l.y2)<c.yMm+c.heightMm;
    assert.equal(overlaps,false);
   }
  }
 }
});
