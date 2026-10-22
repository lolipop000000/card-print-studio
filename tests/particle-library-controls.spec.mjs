import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {openHarness} from './helpers/browser.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:"import {createProject} from './src/model/project.js';import {createStore} from './src/model/store.js';import {createVisualEffects,makeVisualEffectLayer} from './src/model/visual-effects.js';import {createParticleLibrary,serializeParticleLibrary} from './src/model/particle-library.js';import {createParticleLibraryControls} from './src/ui/particle-library.js';import {openVisualEffectsEditor} from './src/ui/visual-effects.js';window.particleControls={createProject,createStore,createVisualEffects,makeVisualEffectLayer,createParticleLibrary,serializeParticleLibrary,createParticleLibraryControls,openVisualEffectsEditor};",resolveDir:root},bundle:true,format:'iife',write:false});

test('saving an isolated particle editor blocks later edits and Esc until the captured recipe is saved',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>{
   const a=window.particleControls,p=a.createProject(),card=p.cards[0],element={id:'save-probe',type:'text',binding:null,content:'파티클',rect:{x:8,y:24,w:45,h:18},style:{fontPt:18,fontWeight:700,color:'#253d32'}};
   card.elements=[element];card.autoSkillLayout=false;card.template='custom';
   element.style.visualEffects={...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('smoke')]};
   a.openVisualEffectsEditor({store:a.createStore(p),assets:new Map(),state:{}},{cardId:card.id,elementId:element.id},{onApply:value=>{window.savedParticle=value;return new Promise(resolve=>window.finishParticleSave=resolve);}});
  });
  const before=await page.locator('#effect-param-count').inputValue();await page.locator('#effect-apply').click();
  assert.equal(await page.locator('#effect-param-count').isDisabled(),true,'the captured draft cannot be edited while saving');
  assert.equal(await page.locator('#effect-editor').evaluate(node=>node.inert),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#effect-editor').isVisible(),true);
  assert.equal(await page.evaluate(()=>String(window.savedParticle.recipe.layers[0].params.count)),before);
  await page.evaluate(()=>window.finishParticleSave());await page.waitForSelector('#effect-editor',{state:'detached'});assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});

test('a failed folder write remains in the library controller and retry writes the same draft',async()=>{
 const {browser,page,pageErrors}=await openHarness();try{
  await page.addScriptTag({content:bundle.outputFiles[0].text});const failure=await page.evaluate(async()=>{
   const a=window.particleControls,root={isSameEntry:async()=>true};let attempts=0;
   const workspace={getState:()=>({connected:true,connectionId:'retry-folder',assetsPath:'data/에셋/asset-library.json'}),subscribe:()=>()=>{},getAssetLibraryRoot:()=>root,
    readAssetLibrary:async()=>({library:a.createParticleLibrary(),text:null,location:'data/에셋/particle-library.json'}),
    writeAssetLibrary:async library=>{if(++attempts===1)throw Error('시험용 폴더 쓰기 실패');window.retriedParticle=library;return {text:a.serializeParticleLibrary(library),location:'data/에셋/particle-library.json'};}};
   const manager=a.createParticleLibraryControls({}, {workspace}),recipe={...a.createVisualEffects(),layers:[a.makeVisualEffectLayer('smoke')]};let message='';
   try{await manager.save('재시도할 연기',recipe,{});}catch(error){message=error.message;}
   const pane=manager.mount({onClose:()=>{}});pane.node.hidden=false;document.body.append(pane.node);return message;
  });
  assert.match(failure,/쓰기 실패/);assert.equal(await page.locator('[data-particle-entry]').count(),1);
  await page.locator('#particle-retry').click();await page.waitForFunction(()=>window.retriedParticle);
  assert.deepEqual(await page.evaluate(()=>window.retriedParticle.entries.map(entry=>entry.name)),['재시도할 연기']);assert.deepEqual(pageErrors,[]);
 }finally{await browser.close();}
});
