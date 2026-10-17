import test from 'node:test';
import assert from 'node:assert/strict';
import {openEditor,clickAt as click,dragAt as drag,currentProject as current,selectedIds as selected} from './object-list-helpers.mjs';

const open=()=>openEditor(()=>{const p=window.editorTestApi.createProject(),c=p.cards[0],shape=(id,x,y,locked)=>({id,type:'rect',binding:null,rect:{x,y,w:12,h:10},style:{fill:'#427963'},...(locked===undefined?{}:{locked})});p.name='요소 잠금 검증';c.template='custom';c.autoSkillLayout=false;c.elements=[shape('under',7,12),shape('locked',7,12,true),shape('free',30,12,false),shape('solo-lock',10,45,true)];p.back.elements=[shape('back-lock',10,12,true),shape('back-free',30,12)];return p;});

test('canvas click selects through locked foreground and marquee never acquires locked elements',async()=>{
 const s=await open();try{await click(s.page,10,16);assert.deepEqual(await selected(s.page),['under']);await click(s.page,12,48);assert.deepEqual(await selected(s.page),[]);await drag(s.page,3,7,46,60);assert.deepEqual(new Set(await selected(s.page)),new Set(['under','free']));assert.deepEqual(await current(s.page),s.project);assert.equal(await s.page.locator('#undo').isDisabled(),true);assert.deepEqual(s.errors,[]);}finally{await s.browser.close();}
});

test('previously list-selected locked elements have no canvas resize handles and cannot drag',async()=>{
 const s=await open();try{await s.page.evaluate(()=>window.editorCtx.selectElements(['solo-lock']));assert.equal(await s.page.locator('#selection-box .resize-handle:visible').count(),0);await drag(s.page,12,48,20,55);assert.deepEqual(await current(s.page),s.project);assert.equal(await s.page.locator('#undo').isDisabled(),true);assert.deepEqual(s.errors,[]);}finally{await s.browser.close();}
});

test('canvas mixed-selection drag moves only unlocked members and keyboard edits remain available',async()=>{
 const s=await open();try{const {page,project}=s;await page.evaluate(()=>window.editorCtx.selectElements(['solo-lock','free']));await drag(page,33,16,38,20);const moved=await current(page),before=project.cards[0].elements;assert.deepEqual(moved.cards[0].elements.find(e=>e.id==='solo-lock'),before.find(e=>e.id==='solo-lock'));const free=moved.cards[0].elements.find(e=>e.id==='free');assert.ok(Math.abs(free.rect.x-35)<.03);assert.ok(Math.abs(free.rect.y-16)<.03);await page.locator('#undo').click();assert.deepEqual(await current(page),project);
 await page.evaluate(()=>window.editorCtx.selectElements(['solo-lock']));await page.locator('.card-stage').focus();await page.keyboard.press('ArrowRight');const edited=await current(page);assert.ok(edited.cards[0].elements.find(e=>e.id==='solo-lock').rect.x>10);assert.equal(edited.cards[0].elements.find(e=>e.id==='solo-lock').locked,true);await page.locator('#undo').click();assert.deepEqual(await current(page),project);assert.deepEqual(s.errors,[]);}finally{await s.browser.close();}
});

test('common-back locked elements obey canvas pointer restrictions',async()=>{
 const s=await open();try{await s.page.locator('#back-tab').click();await click(s.page,12,16);assert.deepEqual(await selected(s.page),[]);await drag(s.page,5,7,46,30);assert.deepEqual(await selected(s.page),['back-free']);await s.page.evaluate(()=>window.editorCtx.selectElements(['back-lock']));assert.equal(await s.page.locator('#selection-box .resize-handle:visible').count(),0);assert.deepEqual(await current(s.page),s.project);assert.deepEqual(s.errors,[]);}finally{await s.browser.close();}
});
