import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openApp,openHarness,qa} from './helpers/browser.mjs';
import {saveProject} from './helpers/flows.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const python=process.env.CARD_PYTHON_PATH||'C:/Users/hyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
async function fixture(){
 const {browser,page}=await openHarness();try{return await page.evaluate(async()=>{
  const a=window.testApi;await a.ensureFont();const p=a.createProject(),c=p.cards[0];
  p.name='이펙트 인쇄 검증';c.name='화염의 수호자';c.quantity=4;c.rank='A';c.baseHp=340;c.attribute='fire';
  const art=document.createElement('canvas');art.width=128;art.height=160;const g=art.getContext('2d');g.strokeStyle='#254c46';g.lineWidth=4;g.beginPath();g.ellipse(64,83,37,55,0,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(38,43);g.lineTo(31,19);g.lineTo(53,30);g.moveTo(76,30);g.lineTo(100,17);g.lineTo(91,46);g.stroke();g.fillStyle='#254c46';g.fillRect(45,66,5,8);g.fillRect(79,66,5,8);
  const png=art.toDataURL();p.assets.ink={id:'ink',mime:'image/png',width:128,height:160,dataUrl:png,paintingId:'ink-doc'};
  p.paintings['ink-doc']={id:'ink-doc',width:128,height:160,activeLayerId:'ink-layer',layers:[{id:'ink-layer',name:'투명 선화',visible:true,locked:false,opacity:1,png}]};
  const icon=document.createElement('canvas');icon.width=icon.height=20;icon.getContext('2d').fillStyle='#b64adb';icon.getContext('2d').fillRect(3,3,14,14);p.assets.icon={id:'icon',mime:'image/png',width:20,height:20,dataUrl:icon.toDataURL(),paintingId:null};
  p.keywords=[{id:'heal',name:'회복',description:'체력을 되찾는다.',color:'#dc355e',iconAssetId:'icon'}];
  c.artAssetId='ink';c.passives=[{id:'regen',name:'불씨의 재생',effect:'불꽃 일격 이후 매 턴 체력을 10 회복 한다. 🙂',skillReferences:[{id:'print-skill-reference',skillId:'flare',start:0,end:5}],dice:null,keywords:[{keywordId:'heal',display:'inline'}]}];
  c.actives=[{id:'flare',name:'불꽃 일격',effect:'대미지 40. 성공하면 추가 피해 10.',dice:{faces:[5,6],text:'추가 피해',color:'#b85e32'},keywords:[]}];
  c.actives[0].nameStyle={color:'#cc3544',visualEffects:a.createVisualEffects('flame',{seed:971})};Object.assign(c.actives[0].nameStyle.visualEffects.layers[0].params,{height:.08,width:.02,count:8});
  p.cards[0]=a.applyTemplate(c,p.settings,'monster-standard',p.keywords);const card=p.cards[0];card.template='custom';
  card.visualEffects=a.createVisualEffects('burning',{seed:72});for(const l of card.visualEffects.layers){if(l.kind==='flame')Object.assign(l.params,{height:.12,width:.05,count:18});if(l.kind==='smoke')Object.assign(l.params,{density:.15,size:.1});if(l.kind==='glow')l.params.radius=.55;}
  const image=card.elements.find(e=>e.type==='image');image.style.visualEffects=a.createVisualEffects('flame',{seed:11});Object.assign(image.style.visualEffects.layers[0],{emit:{face:'all',openOnly:true},placement:'behind'});Object.assign(image.style.visualEffects.layers[0].params,{height:.2,width:.025,count:16});image.style.visualEffects.layers.push(a.makeVisualEffectLayer('glow',{params:{radius:.6},scope:'outside'}));
  const text=card.elements.find(e=>e.binding?.field==='skill.effect');text.style.visualEffects={version:2,seed:4,layers:[a.makeVisualEffectLayer('textWarp',{params:{arc:.08,wave:.08,skewDeg:4,scaleY:1.1}}),a.makeVisualEffectLayer('gradient',{params:{color:'#284d45',color2:'#4d6ca1'}})]};
  const title=card.elements.find(e=>e.binding?.field==='name');title.style.visualEffects=a.createVisualEffects('roseGold',{seed:9});title.style.visualEffects.layers.unshift(a.makeVisualEffectLayer('textWarp',{params:{arc:.12,skewDeg:3,scaleY:1.1}}));
  // Cover every new particle in the shared frozen-frame PDF path, at print-safe density.
  const addParticles=(effect,kinds)=>{for(const kind of kinds)effect.layers.push(a.makeVisualEffectLayer(kind,{emit:{face:'all',openOnly:true},opacity:.65,params:{count:5,size:.02,travel:.22,spread:.35}}));};
  addParticles(title.style.visualEffects,['petal']);title.style.visualEffects.layers.push(a.makeVisualEffectLayer('ripple',{params:{count:2,width:.1,start:.1,end:.7,fade:2}}),a.makeVisualEffectLayer('outline',{scope:'outside',opacity:.5,params:{width:.08,color:'#53788e'}}));
  addParticles(image.style.visualEffects,['leaf','snowflake','crystal','firefly']);
  image.style.visualEffects.layers.push(a.makeVisualEffectLayer('sprite',{placement:'front',params:{shape:'image',assetId:'ink',count:4,sizeStart:.012,sizeEnd:.025,travel:.1,randomness:0}}),a.makeVisualEffectLayer('bloom',{params:{threshold:.4,radius:.4,strength:.5}}),a.makeVisualEffectLayer('directionalBlur',{params:{distance:.15,samples:3,strength:.25}}),a.makeVisualEffectLayer('displacement',{params:{amount:.04,wavelength:4}}));
  const smoke=a.createVisualEffects('smoke',{seed:6});smoke.layers[0].opacity=.4;Object.assign(smoke.layers[0].params,{density:.35,size:.2});card.elements.push({id:'floating-smoke',type:'effect',binding:null,rect:{x:48,y:27,w:10,h:18},style:{visualEffects:smoke}});
  const warning=a.createVisualEffects('smoke',{seed:5});warning.layers[0].origin.x=-.8;card.elements.push({id:'clipped-decoration',type:'effect',binding:null,rect:{x:0,y:22,w:5,h:12},style:{visualEffects:warning}});
  const child=a.createVariant(p,card.id);child.quantity=4;child.variant.label='하위 카드';p.cards.push(child);
  let item=a.createCard('item',p);Object.assign(item,{name:'별빛 양초',attribute:'light',quantity:2,effect:'사용하면 체력을 20 회복 한다.',artAssetId:'ink',keywords:[{keywordId:'heal',display:'inline'}]});item=a.applyTemplate(item,p.settings,'item',p.keywords);item.visualEffects=a.createVisualEffects('starlight',{seed:21});item.visualEffects.layers[0].params.size=.012;item.elements.find(e=>e.binding?.field==='name').style.visualEffects=a.createVisualEffects('cyberGlitch',{seed:22});addParticles(item.visualEffects,['comet','rain','dust','confetti']);p.cards.push(item);
  p.back.elements=[{id:'back-title',type:'text',binding:null,content:'우리의 카드게임',rect:{x:5,y:38,w:53,h:14},style:{fontPt:19,fontWeight:700,align:'center',visualEffects:a.createVisualEffects('goldTitle',{seed:50})}},{id:'back-stars',type:'effect',binding:null,rect:{x:10,y:10,w:43,h:60},style:{visualEffects:a.createVisualEffects('starlight',{seed:51})}}];
  p.back.elements[1].style.visualEffects.layers[0].params.size=.02;
  p.back.elements[0].style.visualEffects.layers.splice(3,0,a.makeVisualEffectLayer('holographic',{id:'print-holographic',scope:'inside',opacity:.45}));
  addParticles(p.back.elements[0].style.visualEffects,['rune','vortex','bubble']);
  p.print={...a.denseA4Print(p),duplex:true,effectFrameSec:12.35};return p;
 });}finally{await browser.close();}
}
async function load(page,p){
 await page.locator('#project-file').setInputFiles({name:'effects-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await page.waitForFunction(name=>document.getElementById('deck-name').value===name&&document.getElementById('save-state').textContent==='저장됨',p.name);
}
async function references(p){
 const {browser,page}=await openHarness();try{return await page.evaluate(async p=>{
  const a=window.testApi;await a.ensureFont();const assets=await a.loadAssets(p),plan=a.planSheets(p),refs={},paper={},reports=[];
  for(const [key,card] of [...p.cards.map(c=>[c.id,c]),['back',p.back]]){
   const c=document.createElement('canvas');reports.push(...a.renderCard(c.getContext('2d',{willReadFrequently:true}),p,card,assets,300).problems);refs[key]=c.toDataURL();
   a.renderCard(c.getContext('2d',{willReadFrequently:true}),p,card,assets,105);paper[key]=c.toDataURL();
  }
  const art=assets.get('ink'),c=document.createElement('canvas');c.width=art.width;c.height=art.height;c.getContext('2d').drawImage(art,0,0);
  return {refs,paper,plan,reports,transparent:c.getContext('2d').getImageData(64,83,1,1).data[3]};
 },p);}finally{await browser.close();}
}
test('playing preview exports the identical saved frame into real A4 duplex PDF image pixels twice',async()=>{
 const p=await fixture(),{browser,page,pageErrors,httpRequests}=await openApp();page.setDefaultTimeout(60000);try{
  await load(page,p);const saved=await saveProject(page,'visual-effects-print-project.json');assert.deepEqual(saved.assets,p.assets);assert.deepEqual(saved.paintings,p.paintings);
  const r=await references(saved);assert.equal(r.transparent,0);assert.ok(r.reports.some(p=>p.code==='effect-clipped'));assert.ok(!r.reports.some(p=>p.severity!=='warning'));
  for(const [key,data] of Object.entries(r.refs))await writeFile(path.join(qa,'effects-ref-'+key+'.png'),Buffer.from(data.split(',')[1],'base64'));
  const manifest={pages:r.plan.pages.map(page=>({...page,cells:page.cells.filter(c=>c.cardId).map(c=>({...c,reference:'effects-ref-'+(page.side==='back'?'back':c.cardId)+'.png'}))}))};
  await writeFile(path.join(qa,'effects-references.json'),JSON.stringify(manifest,null,2));
  await page.locator('#paper-tab').click();await page.waitForFunction(()=>document.querySelectorAll('.paper-cell img').length===20);
  const cells=await page.locator('.paper-sheet').evaluateAll(sheets=>sheets.flatMap(sheet=>[...sheet.querySelectorAll('.paper-cell img')].map(img=>({key:sheet.dataset.side==='back'?'back':img.parentElement.dataset.cardId,src:img.src}))));
  assert.ok(cells.every(c=>c.src===r.paper[c.key]));await page.screenshot({path:path.join(qa,'visual-effects-a4.png'),fullPage:true});
  await page.locator('#card-tab').click();await page.locator('#card-effect-play').click();const time=await page.locator('#card-effect-time').inputValue();await page.waitForFunction(v=>document.getElementById('card-effect-time').value!==v,time);
  const reports=[];
  for(let i=1;i<=2;i++){
   // The full effect stack takes 12–29s here while the 200dpi preview keeps playing.
   const download=page.waitForEvent('download',{timeout:60000});await page.locator('#export-pdf').click({timeout:60000});const file=await download,filePath=path.join(qa,'visual-effects-'+i+'.pdf');await file.saveAs(filePath);await page.waitForFunction(()=>!document.getElementById('export-pdf').disabled);
   assert.equal(await page.locator('#card-effect-play').getAttribute('aria-pressed'),'true');
   const output=execFileSync(python,[path.join(root,'scripts/verify-effects-pdf.py'),filePath,'--references',path.join(qa,'effects-references.json')],{encoding:'utf8'});await writeFile(path.join(qa,'effects-pixels-'+i+'.json'),output);reports.push(JSON.parse(output));
   const physical=execFileSync(python,[path.join(root,'scripts/verify-pdf.py'),filePath],{encoding:'utf8'});await writeFile(path.join(qa,'effects-physical-'+i+'.json'),physical);
  }
  assert.equal(reports[0].status,'PASS');assert.deepEqual(reports[0].pages,reports[1].pages);assert.deepEqual(reports[0].cardsPerPage,[9,9,1,1]);
  const wrong=structuredClone(manifest);execFileSync(python,['-c','from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); im.putpixel((0,0),(255,0,255)); im.save(sys.argv[2])',path.join(qa,wrong.pages[0].cells[0].reference),path.join(qa,'effects-wrong-reference.png')]);
  wrong.pages[0].cells[0].reference='effects-wrong-reference.png';await writeFile(path.join(qa,'effects-wrong-references.json'),JSON.stringify(wrong));
  assert.throws(()=>execFileSync(python,[path.join(root,'scripts/verify-effects-pdf.py'),path.join(qa,'visual-effects-1.pdf'),'--references',path.join(qa,'effects-wrong-references.json')],{stdio:'pipe'}),error=>error.status!==0&&error.stderr.toString().includes('Wrong frozen pixels'));

  assert.deepEqual(pageErrors,[]);assert.deepEqual(httpRequests,[]);
 }finally{await browser.close();}
});
test('compressed and overfull effect text keeps concrete warnings and exports unmodified PDFs',async()=>{
 const p=await fixture(),env=await openApp(),{browser,page}=env;try{
  // Keep this policy check to one front; the preceding test verifies full duplex pixels.
  p.cards=[p.cards[0]];p.cards[0].quantity=1;p.print.duplex=false;
  p.cards[0].autoSkillLayout=false;const text=p.cards[0].elements.find(e=>e.binding?.field==='skill.effect');text.style.fontPt=7;text.style.visualEffects.layers[0].params.scaleY=.5;
  p.name='작은 왜곡 글자 검사';
  async function check(name,warning){
   await load(page,p);const before=await saveProject(page,name+'-before.json');
   assert.match(await page.locator('#card-warnings').textContent(),warning);
   const download=page.waitForEvent('download',{timeout:60000});await page.locator('#export-pdf').click({timeout:60000});
   const file=path.join(qa,name+'.pdf');await(await download).saveAs(file);assert.equal((await readFile(file)).subarray(0,5).toString(),'%PDF-');
   await page.waitForFunction(()=>!document.getElementById('export-pdf').disabled);
   assert.match(await page.locator('#card-warnings').textContent(),warning);assert.deepEqual(await saveProject(page,name+'-after.json'),before);
  }
  await check('compressed-effect-allowed',/글자 세로 압축 후 3\.50pt로 최소 7pt보다 작습니다/);
  p.name='긴 본문 검사';text.style.visualEffects.layers[0].params.scaleY=1;text.rect.h=3;p.cards[0].passives[0].effect='한글효과반드시보존🙂'.repeat(200);delete p.cards[0].passives[0].skillReferences;
  await check('overfull-effect-allowed',/7pt로 줄여도 [1-9]\d+줄이 필요합니다\. 필요한 높이 [0-9.]+mm, 현재 영역 [0-9.]+ × 3mm입니다/);
  assert.deepEqual(env.pageErrors,[]);assert.deepEqual(env.httpRequests,[]);
 }finally{await browser.close();}
});
