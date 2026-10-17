import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/model/project.js';
import {createStore} from '../src/model/store.js';
test('a completed async save moves the baseline to its snapshot after undo',()=>{
 const store=createStore(createProject());store.edit('name',p=>p.name='saved on disk');const writing=store.getProject();
 store.undo();assert.equal(store.isDirty(),false);store.markSaved(writing);
 assert.equal(store.isDirty(),true,'the older visible version differs from the completed write');
 store.redo();assert.equal(store.isDirty(),false);
});
test('async completion for an earlier loaded deck does not change the new deck baseline',()=>{
 const store=createStore(createProject());store.edit('name',p=>p.name='previous deck');const writing=store.getProject();
 store.load(createProject());store.markSaved(writing);assert.equal(store.isDirty(),false);
});
