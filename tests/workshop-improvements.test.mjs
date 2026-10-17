import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,createCard,parseProject,serializeProject,validateProject} from '../src/model/project.js';
import * as layout from '../src/printing/layout.js';

test('items preserve valid granted legacy attributes and remain unassigned when none was saved',()=>{
 const p=createProject();
 for(const attribute of ['water','fire','grass','neutral','dark','light']){const c=createCard('item',p);c.attribute=attribute;c.effect=attribute+'의 효과';p.cards.push(c);}
 assert.equal(createCard('item',p).attribute,undefined);assert.deepEqual(validateProject(p),[]);
 const loaded=parseProject(serializeProject(p));
 for(const [index,item] of loaded.cards.slice(1).entries()){assert.equal(item.attribute,p.cards[index+1].attribute);assert.equal(item.attributes,undefined);assert.equal(item.effect,p.cards[index+1].effect);assert.equal(item.elements.filter(e=>e.type==='attribute').length,1);}
 const legacy=structuredClone(p);delete legacy.cards[1].attribute;assert.equal(parseProject(JSON.stringify(legacy)).cards[1].attribute,undefined);
});

test('dense A4 preserves physical card size, quantities and duplex corrections',()=>{
 assert.equal(typeof layout.denseA4Print,'function','Dense A4 should be available without resizing cards');
 const p=createProject();p.cards[0].quantity=10;p.print={...p.print,paper:'Letter',orientation:'landscape',duplex:true,backOffsetXmm:.2};
 const settings=structuredClone(p.settings),cards=structuredClone(p.cards);
 p.print=layout.denseA4Print(p);const plan=layout.planSheets(p);
 assert.deepEqual(p.settings,settings);assert.deepEqual(p.cards,cards);
 assert.equal(p.print.paper,'A4');assert.equal(p.print.gapMm,0);assert.ok(p.print.marginMm<=5);
 assert.equal(p.print.orientation,'portrait');assert.equal(p.print.backOffsetXmm,.2);
 assert.deepEqual(plan.pages.map(page=>page.cells.filter(c=>c.cardId).length),[9,9,1,1]);
 const [a,b]=plan.pages[0].cells;assert.equal(b.xMm,a.xMm+a.widthMm);
 assert.equal(a.widthMm,63);assert.equal(a.heightMm,88);
 p.settings.cardWidthMm=p.settings.maxWidthMm=88;p.settings.cardHeightMm=63;
 p.print=layout.denseA4Print(p);assert.equal(p.print.orientation,'landscape');assert.equal(layout.planSheets(p).capacity,9);
});

test('dense A4 reduces margins only when necessary for maximum capacity',()=>{
 for(const [width,height,margin] of [[63,88,5],[67,88,4.5],[70,99,0]]){
  const p=createProject();p.settings.cardWidthMm=p.settings.maxWidthMm=width;p.settings.cardHeightMm=p.settings.maxHeightMm=height;
  p.print=layout.denseA4Print(p);assert.equal(layout.planSheets(p).capacity,9);assert.equal(p.print.marginMm,margin);
  assert.equal(p.settings.cardWidthMm,width);assert.equal(p.settings.cardHeightMm,height);
 }
 const p=createProject();p.print.marginMm=2;p.print=layout.denseA4Print(p);assert.equal(p.print.marginMm,2);
});
