import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {openApp,qa} from './helpers/browser.mjs';
import {saveProject,downloadClick} from './helpers/flows.mjs';

test('PP Monster branding appears in the editor, updates and PDF while project files remain compatible',async()=>{
 const app=await openApp();try{const {page}=app;
  assert.equal(await page.title(),'PP Monster');
  assert.equal(await page.locator('.brand strong').innerText(),'PP Monster');
  await page.locator('#studio-updates').click();
  assert.equal(await page.locator('.update-heading small').innerText(),'PP Monster');
  await page.locator('#updates-close').click();
  const project=await saveProject(page,'pp-monster-branding.card-project.json');
  assert.equal(project.format,'card-print-studio');
  await page.locator('#project-file').setInputFiles(path.join(qa,'pp-monster-branding.card-project.json'));
  await page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('프로젝트를 불러왔어요.'));
  assert.deepEqual(await saveProject(page,'pp-monster-branding-restored.card-project.json'),project);
  await page.locator('#paper-tab').click();
  await downloadClick(page,'#export-pdf','pp-monster-branding.pdf');
  assert.match((await readFile(path.join(qa,'pp-monster-branding.pdf'))).toString('latin1'),/\/Creator \(PP Monster\)/);
  assert.deepEqual(app.pageErrors,[]);assert.deepEqual(app.httpRequests,[]);
 }finally{await app.browser.close();}
});
