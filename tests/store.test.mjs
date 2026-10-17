import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
test('undo and redo restore manual HP and saved state',()=>{const store=createStore(createProject());store.markSaved();store.edit('강화',d=>{d.cards[0].hpReduction=25;d.cards[0].name='물방울';});assert.equal(store.getProject().cards[0].hpReduction,25);assert.equal(store.isDirty(),true);assert.equal(store.undo(),true);assert.equal(store.isDirty(),false);assert.equal(store.getProject().cards[0].hpReduction,0);store.redo();assert.equal(store.getProject().cards[0].name,'물방울');});
test('failed edits leave project and undo history intact',()=>{const s=createStore(createProject()),before=structuredClone(s.getProject());assert.throws(()=>s.edit('bad',d=>{d.cards[0].hpReduction=200;}));assert.deepEqual(s.getProject(),before);assert.equal(s.undo(),false);});
