import test from 'node:test';import assert from 'node:assert/strict';import {screenToPixel,zoomAt} from '../src/painting/viewport.js';
test('painting coordinates survive pan, zoom and a CSS-offset viewport',()=>{
 const v={scale:2,panX:40,panY:20};assert.deepEqual(screenToPixel({x:140,y:100},{left:0,top:0},v),{x:50,y:40});
 const anchor={x:170,y:130},before=screenToPixel(anchor,{left:0,top:0},v),next=zoomAt(v,anchor,5);
 assert.deepEqual(screenToPixel(anchor,{left:0,top:0},next),before);assert.deepEqual(screenToPixel({x:190,y:130},{left:50,top:30},v),{x:50,y:40});
 assert.equal(zoomAt(v,anchor,100).scale,16);assert.equal(zoomAt(v,anchor,.001).scale,.125);
});
