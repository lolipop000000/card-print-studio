import {createProject,createCard} from './model/project.js';
import {createStore} from './model/store.js';
import {newId,clone} from './model/types.js';
import {setElementSelection,selectedElements,groupDelta} from './ui/element-selection.js';
import {importAsset,loadAssets} from './model/assets.js';
import {applyTemplate,syncSkillElements} from './render/templates.js';
import {createVariant} from './model/variants.js';
import {remapSkillReferences} from './model/skill-references.js';
import {createVisualEffects} from './model/visual-effects.js';
import {openVisualEffectsEditor} from './ui/visual-effects.js';
import {ensureFont} from './render/font.js';
import {createPdf} from './printing/pdf.js';
import {printProject} from './printing/browser.js';
import {download} from './ui/files.js';
import {el,button,showMessage,typing} from './ui/dom.js';
import {renderCards} from './ui/cards.js';
import {openKeywordManager} from './ui/keywords.js';
import {renderInspector} from './ui/inspector.js';
import {mountCardCanvas} from './ui/canvas-editor.js';
import {CSS_MM} from './ui/view-zoom.js';
import {mountPaperView} from './ui/paper.js';
import {openPaintingEditor} from './ui/painting.js';
import {saveProjectFile,loadProjectFile,confirmReplacement} from './ui/files.js';
import {createWorkspaceControls} from './ui/workspace.js';
import {createCardFileControls} from './ui/card-files.js';
import {mountJsonFileDrop} from './ui/json-file-drop.js';
import {createUpdateControls} from './ui/updates.js';
import {createCardLibraryControls} from './ui/card-library.js';
import {createCardTemplateControls} from './ui/card-templates.js';
import {createRecoveryControls} from './ui/recovery.js';
import {createAssetLibraryControls} from './ui/asset-library.js';
import {openImageCropper} from './ui/image-crop.js';
import {placeImageAsset} from './model/asset-placement.js';
import {textRangeOwners,remapTextRanges} from './model/text-ranges.js';
import {mountMobileWorkspace} from './ui/mobile-workspace.js';
import {createThemeControl} from './ui/theme.js';
import {createCloudClient} from './cloud/client.js';
import {createBlobStore} from './cloud/blobs.js';
import {createCloudSession} from './cloud/session.js';
import {createCloudAccountControls} from './ui/cloud-account.js';
import {createCloudAssetControls} from './ui/cloud-assets.js';
import {openCloudImport} from './ui/cloud-import.js';

export function mountEditor(root,store,{cloudClient=createCloudClient()}={}){
 const themeControl=createThemeControl();
 let ignoreOutputWarnings=false;try{ignoreOutputWarnings=localStorage.getItem('card-print-studio:ignore-output-warnings:v1')==='true';}catch{}
 const state={ignoreOutputWarnings,activeCardId:store.getProject().cards[0]?.id,selectedElementId:null,selectedElementIds:[],back:false,mode:'card',cardScale:5.3,paintOpen:false,effectOpen:false};
 let generation=0,viewingPublic=false;
 const originalMutations={edit:store.edit,undo:store.undo,redo:store.redo};
 const viewNotice=()=>showMessage(ctx.cloudAccount?.canWrite()?'사본을 만들어 편집하세요.':'보기만 가능해요.');
 for(const name of Object.keys(originalMutations))store[name]=(...args)=>{if(viewingPublic){viewNotice();return false;}return originalMutations[name](...args);};
 const ctx={store,state,cloudClient,assets:new Map(),card:()=>store.getProject().cards.find(c=>c.id===state.activeCardId),
  target:()=>state.back?store.getProject().back:ctx.card(),
  edit(label,change){try{store.edit(label,change);}catch(e){showMessage(e.message);refresh();}},
  editTarget(label,fn){ctx.edit(label,d=>{const target=state.back?d.back:d.cards.find(c=>c.id===state.activeCardId);if(target)fn(target);});},
  renderInspector:()=>renderInspector(inspector,ctx),
  selectCard(id){state.activeCardId=id;state.back=false;state.mode='card';setElementSelection(state,[]);refresh();},
  openPainting:null,
  onPdf:null,
  onPrint:null,
  onPaper:null
 };
 root.replaceChildren();root.className='studio';
 async function importProjectFile(file,isCurrent=()=>true){
  // loadProjectFile checks staleness before committing; successful load changes the context.
  if(!await loadProjectFile(file,store,{save:()=>save(),isCurrent}))return false;
  workspaceFiles.storage.unbind();ctx.closeVisualEffects?.({force:true});cardCanvas.resetTime();state.activeCardId=store.getProject().cards[0]?.id;state.back=false;setElementSelection(state,[]);ctx.cardLibrary?.reset();refresh();showMessage('프로젝트를 불러왔어요.','success');return true;
 }
 const projectFile=el('input',{id:'project-file',type:'file',accept:'.json,.card-project.json',hidden:true,onchange:async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{await importProjectFile(file);}catch(error){showMessage(error.message);}}});
 const artFile=el('input',{id:'art-file',type:'file',accept:'image/png,image/jpeg,image/webp',hidden:true,onchange:async event=>{
  const file=event.target.files[0],pending=ctx.pendingImage;event.target.value='';if(!file||!pending)return;
  try{const asset=await importAsset(file);ctx.edit('그림 가져오기',d=>{d.assets[asset.id]=asset;const t=pending.back?d.back:d.cards.find(c=>c.id===pending.cardId);if(!t)throw new Error('그림을 넣을 카드가 없어요.');const e=t.elements.find(e=>e.id===pending.elementId);if(!pending.elementId||e?.binding?.field==='art')t.artAssetId=asset.id;else if(e)e.assetId=asset.id;});}catch(e){showMessage(e.message);}
 }});
 ctx.onPrint=async()=>{
  if(!ctx.canExport()){viewNotice();return;}
  const action=document.getElementById('print-direct');if(action.disabled)return;if(typing(document.activeElement))document.activeElement.blur();action.disabled=true;action.textContent='인쇄 준비 중…';
  try{const p=store.getProject();showMessage('인쇄 설정에서 실제 크기 100%, 머리글·바닥글 끄기를 선택하세요.'+(p.print.duplex?' 양면은 '+(p.print.flip==='long'?'긴 쪽':'짧은 쪽')+' 넘김으로 설정하세요.':''),'success');await printProject(p);}
  catch(e){const first=e.problems?.find(p=>p.cardId);if(first)ctx.selectCard(first.cardId);else if(e.problems?.some(p=>p.elementId)){state.back=true;state.mode='card';refresh();}showMessage(e.message);}
  finally{action.disabled=false;action.textContent='바로 인쇄';}
 };
 ctx.onPdf=async()=>{
  if(!ctx.canExport()){viewNotice();return;}
  const action=document.getElementById('export-pdf');action.disabled=true;action.textContent='PDF 만드는 중…';
  try{const p=store.getProject(),bytes=await createPdf(p);download(bytes,(p.name||'카드 덱')+'.pdf','application/pdf');showMessage('PDF를 만들었어요. 인쇄는 실제 크기 100%로, 양면은 선택한 뒤집기 방향으로 설정하세요.','success');}
  catch(e){const first=e.problems?.find(p=>p.cardId);if(first)ctx.selectCard(first.cardId);else if(e.problems?.some(p=>p.elementId)){state.back=true;state.mode='card';refresh();}showMessage(e.message);}
  finally{action.disabled=false;action.textContent='PDF 만들기';}
 };
 ctx.openPainting=async()=>{const card=ctx.card();if(state.paintOpen||!card)return;state.paintOpen=true;cardCanvas.setActive(false);try{await openPaintingEditor(root,store,card.id);}catch(e){showMessage(e.message);}finally{state.paintOpen=false;refresh();}};
 ctx.onEffectsClosed=()=>{state.effectOpen=false;ctx.closeVisualEffects=null;cardCanvas.setActive(state.mode==='card'&&!state.paintOpen);};
 ctx.openVisualEffects=target=>{
  if(state.effectOpen)return;state.effectOpen=true;cardCanvas.setActive(false);
  try{ctx.closeVisualEffects=openVisualEffectsEditor(ctx,target);}catch(e){ctx.onEffectsClosed();showMessage(e.message);}
 };
 ctx.openKeywords=()=>{ctx.closeKeywords=openKeywordManager(ctx);};
 ctx.pickImage=elementId=>{ctx.pendingImage={elementId,cardId:state.activeCardId,back:state.back};artFile.click();};
 const deckName=el('input',{id:'deck-name',value:store.getProject().name,'aria-label':'덱 이름',onchange:event=>ctx.edit('덱 이름',d=>d.name=event.target.value)});
 const workspaceFiles=createWorkspaceControls(store,()=>{ctx.closeVisualEffects?.({force:true});cardCanvas.resetTime();state.activeCardId=store.getProject().cards[0]?.id;state.back=false;setElementSelection(state,[]);ctx.cardLibrary?.reset();refresh();},()=>projectFile.click());
 const assetLibrary=createAssetLibraryControls(ctx,{workspace:workspaceFiles.storage});
 ctx.openAssetLibrary=options=>assetLibrary.open(options);
 const imageDestination=(mode,elementId)=>({mode,elementId,cardId:state.activeCardId,back:state.back,documentId:store.getDocumentId()});
 ctx.applyLibraryAsset=(asset,options={})=>{
  if(viewingPublic){viewNotice();return false;}
  const destination=options.documentId===undefined?imageDestination(options.mode||'art',options.elementId):options;
  try{
   if(destination.documentId!==store.getDocumentId())throw Error('그림을 고르는 동안 덱이 바뀌었어요. 적용할 카드를 다시 선택하세요.');
   let elementId;store.edit('보관함 그림 적용',p=>{elementId=placeImageAsset(p,asset,destination);});
   if(state.back===destination.back&&(state.back||state.activeCardId===destination.cardId))setElementSelection(state,[elementId],ctx.target());
   refresh();return true;
  }catch(error){showMessage(error.message);return false;}
 };
 ctx.pickLibraryImage=async(mode='art',elementId=null)=>{
  const destination=imageDestination(mode,elementId);
  try{const asset=await assetLibrary.open({pick:true,title:'사용할 그림 고르기'});if(asset)ctx.applyLibraryAsset(asset,destination);}catch(error){showMessage(error.message);}
 };
 ctx.cropImage=async(elementId=null)=>{
  const destination=imageDestination(elementId?'replace':'art',elementId),target=ctx.target(),element=target?.elements.find(e=>e.id===elementId);
  const id=!elementId||element?.binding?.field==='art'?target?.artAssetId:element?.assetId,asset=store.getProject().assets[id];
  if(!asset){showMessage('자를 그림이 없어요. 그림을 먼저 가져오세요.');return;}
  cardCanvas.setActive(false);
  try{
   const pieces=await openImageCropper({asset,name:ctx.card()?.name||'그림'});if(!pieces?.length)return;
   if(!await assetLibrary.addAssets(pieces))return;
   if(pieces.length===1){if(ctx.applyLibraryAsset(pieces[0].asset,destination))showMessage('자른 그림을 적용하고 보관함에도 저장했어요.','success');}
   else showMessage(pieces.length+'개 조각을 에셋 보관함에 저장했어요.','success');
  }catch(error){showMessage(error.message);}finally{refresh();}
 };
 const cardFiles=createCardFileControls({store,workspaceFiles,card:()=>ctx.card(),onAdded:id=>ctx.selectCard(id),canExport:()=>ctx.canExport()});
 const updates=createUpdateControls({store,onOpen:()=>cardCanvas.setActive(false),onClose:()=>refresh()});
 const cloudBlobs=createBlobStore({client:cloudClient,publicBaseUrl:(cloudClient.config?.url??'')+'/storage/v1/object/public/blobs'});
 const cloudSession=createCloudSession({store,client:cloudClient,blobs:cloudBlobs});
 const cloudAccount=createCloudAccountControls(ctx,{client:cloudClient,session:cloudSession});
 Object.assign(ctx,{cloudSession,cloudAccount,cloudBlobs,workspaceFiles,assetLibrary});
 const cloudAssetControls=createCloudAssetControls(ctx,{client:cloudClient,blobs:cloudBlobs,account:cloudAccount,assetLibrary});
 ctx.openCloudImport=()=>{ctx.closeCloudPanel?.();return openCloudImport(ctx,{client:cloudClient,blobs:cloudBlobs,workspace:ctx.workspaceFiles.storage,assetLibrary:ctx.assetLibrary});};
 ctx.canExport=()=>!viewingPublic||cloudAccount.canWrite();
 ctx.canApplyLibraryAsset=()=>!viewingPublic;
 const librarySaveStatus=button('',()=>{void ctx.openAssetLibrary({account:true});},{id:'library-save-status',class:'library-save-status',hidden:true});
 const updateView=()=>{
  const status=cloudSession.state();viewingPublic=status.viewing;for(const node of root.querySelectorAll('[data-cloud-export]'))node.hidden=!ctx.canExport();
  const mobileSave=root.querySelector('#mobile-save');if(mobileSave)mobileSave.disabled=viewingPublic;
  librarySaveStatus.textContent=({'draft-saving':'클라우드 저장 중',saving:'클라우드 저장 중','draft-saved':'초안 저장됨',saved:'클라우드 저장됨',error:'저장 실패 · 계정 열기',conflict:'저장 충돌 · 해결하기','read-only':'클라우드 읽기 전용'})[status.status]??'';
  librarySaveStatus.hidden=!librarySaveStatus.textContent;librarySaveStatus.dataset.state=status.status;librarySaveStatus.title=status.error?.message??'내 계정과 저장 상태 열기';
 };
 const stopCloudView=cloudSession.onChange(updateView);
 const readonlyClick=event=>{if(!viewingPublic)return;const node=event.target.closest('button');if(node&&['card-templates','keyword-manager','load-card','work-recovery'].includes(node.id)){event.preventDefault();event.stopImmediatePropagation();viewNotice();}};
 root.addEventListener('click',readonlyClick,true);
 const save=async()=>{
  if(typing(document.activeElement))document.activeElement.blur();
  if(viewingPublic){viewNotice();return false;}
  if(cloudAccount.isCloudSaveActive()){
   try{await cloudSession.save();return !store.isDirty();}catch(error){showMessage(error.message);return false;}
  }
  cloudAccount.notifyLocalSave();return workspaceFiles.save();
 };
 ctx.save=save;
 const cardTemplates=createCardTemplateControls(ctx);
 const recovery=createRecoveryControls({store,save,onRestored:()=>{workspaceFiles.storage.unbind();ctx.closeVisualEffects?.({force:true});cardCanvas.resetTime();state.activeCardId=store.getProject().cards[0]?.id;state.back=false;setElementSelection(state,[]);ctx.cardLibrary?.reset();refresh();}});
 const exportProject=()=>{if(!ctx.canExport()){viewNotice();return;}return saveProjectFile(store,{markSaved:!workspaceFiles.storage.getState().folderName}).catch(e=>showMessage(e.message));};
 const top=el('header',{class:'topbar'},
  el('div',{class:'brand'},el('span',{class:'brand-symbol'},'▤'),el('div',{},el('strong',{},'PP Monster'),el('small',{},'내가 만든 카드, 내가 그린 그림'))),
  el('div',{class:'deck-heading'},deckName,el('span',{id:'save-state',class:'save-state'},'저장됨'),workspaceFiles.status,recovery.status,librarySaveStatus),
  el('div',{class:'top-actions'},
   themeControl,updates.button,
   recovery.button,cardTemplates.button,assetLibrary.button,
   button('키워드 관리',()=>ctx.openKeywords(),{id:'keyword-manager'}),
   button('새 덱',async()=>{if(await confirmReplacement(store,{save})){workspaceFiles.storage.unbind();ctx.closeVisualEffects?.({force:true});const p=createProject();p.cards[0]=applyTemplate(p.cards[0],p.settings,'monster-standard');state.activeCardId=p.cards[0].id;setElementSelection(state,[]);state.back=false;store.load(p);ctx.cardLibrary?.reset();cardCanvas.resetTime();}}, {'aria-label':'새 덱'}),
   button('저장',save,{'aria-label':'프로젝트 저장'}),
   button('불러오기',()=>workspaceFiles.load(),{'aria-label':'프로젝트 불러오기'}),
   button('저장 폴더',()=>workspaceFiles.connect(),{id:'workspace-folder',title:'HTML이 있는 폴더를 선택하세요.'}),
   button('JSON 내보내기',exportProject,{'aria-label':'프로젝트 파일 내보내기','data-cloud-export':true}),
   button('JSON 가져오기',()=>projectFile.click(),{'aria-label':'프로젝트 파일 가져오기'}),
   button('↶',()=>store.undo(),{id:'undo','aria-label':'실행 취소',title:'Ctrl+Z'}),
   button('↷',()=>store.redo(),{id:'redo','aria-label':'다시 실행',title:'Ctrl+Shift+Z'}),
   el('label',{class:'ignore-output-warnings',title:'글자 넘침·작은 글자·카드와 이펙트의 배치 경고를 숨겨요.'},el('input',{id:'ignore-output-warnings',type:'checkbox',checked:state.ignoreOutputWarnings,onchange:event=>{state.ignoreOutputWarnings=event.target.checked;try{localStorage.setItem('card-print-studio:ignore-output-warnings:v1',String(state.ignoreOutputWarnings));}catch{}refresh();}}),'경고 무시'),
   button('PDF 만들기',()=>ctx.onPdf(),{id:'export-pdf','data-cloud-export':true}),
   button('바로 인쇄',()=>ctx.onPrint(),{id:'print-direct',class:'primary',title:'Ctrl+P','data-cloud-export':true})
  ));
 const cardList=el('div',{id:'card-list',class:'card-list'});
 const cardLibrary=createCardLibraryControls(ctx);
 const addCard=kind=>{const c=applyTemplate(createCard(kind,store.getProject()),store.getProject().settings,kind==='monster'?'monster-standard':'item',store.getProject().keywords||[]);state.activeCardId=c.id;state.back=false;setElementSelection(state,[]);ctx.edit('카드 추가',d=>d.cards.push(c));};
 ctx.addVariant=()=>{const old=ctx.card();if(!old)return;const c=createVariant(store.getProject(),old.id);state.activeCardId=c.id;state.back=false;setElementSelection(state,[]);ctx.edit('Variant 추가',d=>d.cards.push(c));};
 const sidebar=el('aside',{class:'library'},el('div',{class:'library-title'},el('h2',{},'카드 목록'),el('span',{id:'card-count'})),
  el('div',{class:'library-add'},button('+ 몬스터',()=>addCard('monster'),{id:'add-monster'}),button('+ 아이템',()=>addCard('item'),{id:'add-item'})),cardLibrary.node,cardList,
  el('div',{class:'library-bottom'},button('카드 복제',()=>{
   const old=ctx.card();if(!old)return;const c=clone(old),mapping=new Map();c.id=newId();delete c.variant;c.name+=' 복사';
   for(const sk of [...c.passives||[],...c.actives||[]]){const previous=sk.id;sk.id=newId();mapping.set(previous,sk.id);}
   for(const sk of [...c.passives||[],...c.actives||[]])remapSkillReferences(sk,id=>mapping.get(id)??id,()=>newId());
   for(const e of c.elements){e.id=newId();if(e.binding?.skillId)e.binding.skillId=mapping.get(e.binding.skillId);}
   for(const owner of textRangeOwners(c))remapTextRanges(owner,()=>newId());
   state.activeCardId=c.id;state.back=false;setElementSelection(state,[]);ctx.edit('카드 복제',d=>d.cards.push(c));
  },{id:'duplicate-card'}),button('카드 삭제',()=>{const id=state.activeCardId;ctx.edit('카드 삭제',d=>{d.cards=d.cards.filter(c=>c.id!==id);});setElementSelection(state,[]);refresh();},{id:'delete-card',class:'danger'})),
  el('div',{class:'library-bottom'},button('카드만 저장',()=>cardFiles.save(),{id:'save-card','data-cloud-export':true}),button('카드 불러오기',()=>cardFiles.open(),{id:'load-card'})),
  el('div',{class:'library-note'},'그림 원본과 레이어까지\n프로젝트 파일 하나에 담아요.'));
 const cardTab=button('카드 편집',()=>{state.mode='card';refresh();},{id:'card-tab'});
 const paperTab=button('A4 용지 보기',()=>{state.mode='paper';refresh();},{id:'paper-tab'});
 const frontTab=button('앞면',()=>{state.back=false;setElementSelection(state,[]);refresh();},{id:'front-tab'});
 const backTab=button('공통 뒷면',()=>{state.back=true;setElementSelection(state,[]);refresh();},{id:'back-tab'});
 const zoom=el('input',{id:'card-zoom',type:'range',min:CSS_MM*.25,max:CSS_MM*8,step:'any',value:state.cardScale,'aria-label':'카드 확대 배율',oninput:event=>cardCanvas.setZoom(Number(event.target.value))});
 const zoomControls=el('div',{class:'view-zoom-controls'},
  button('−',()=>cardCanvas.setZoom(state.cardScale/1.2),{id:'card-zoom-out','aria-label':'카드 축소'}),zoom,
  button('＋',()=>cardCanvas.setZoom(state.cardScale*1.2),{id:'card-zoom-in','aria-label':'카드 확대'}),
  el('output',{id:'card-zoom-value',htmlFor:'card-zoom'},Math.round(state.cardScale/CSS_MM*100)+'%'),
  button('100%',()=>cardCanvas.setZoom(CSS_MM),{id:'card-zoom-reset','aria-label':'카드 배율 100%'}),
  button('맞춤',()=>cardCanvas.fit(),{id:'card-zoom-fit'}));
 const canvasHost=el('div',{id:'canvas-host',class:'canvas-host'});
 const cardArea=el('div',{id:'card-area',class:'card-area'},el('div',{class:'canvas-scroll'},canvasHost),
  el('div',{id:'card-warnings',class:'card-warnings'}),
  el('div',{class:'card-effect-transport'},
   button('재생',()=>{},{id:'card-effect-play','aria-pressed':false}),
   el('input',{id:'card-effect-time',type:'range',min:0,max:6,step:.01,value:1.2,'aria-label':'카드 미리보기 시간 (초)'}),
   el('output',{id:'card-effect-seconds',htmlFor:'card-effect-time'},'1.20초'),
   el('details',{id:'card-preview-options',class:'preview-options'},el('summary',{},'설정'),el('div',{class:'preview-options-body'},
    el('div',{id:'card-preview-settings'}),
    button('현재 장면을 인쇄 프레임으로',()=>{},{id:'card-effect-freeze'}),
    button('인쇄 장면 보기',()=>{},{id:'card-effect-print-frame'})))),
  el('footer',{class:'canvas-footer'},el('span',{id:'canvas-size'}),el('span',{},'Ctrl+휠 확대·축소 · 빈 곳 드래그 / Shift+클릭 다중 선택'),zoomControls));
 const paperRoot=el('div',{id:'paper-view',hidden:true,class:'paper-view'},el('p',{class:'empty-note'},'용지 미리보기를 준비하고 있어요.'));
 const center=el('main',{class:'workspace'},el('nav',{class:'workspace-tabs'},el('div',{class:'tab-group'},cardTab,paperTab),el('div',{class:'tab-group'},frontTab,backTab)),cardArea,paperRoot);
 const inspector=el('aside',{id:'inspector',class:'inspector'});
 const message=el('div',{id:'message',hidden:true,role:'alert',class:'message'},el('span',{}),button('×',()=>message.hidden=true,{'aria-label':'메시지 닫기'}));
 root.append(top,el('div',{id:'library-account-home',hidden:true},cloudAccount.node),recovery.notice,el('div',{class:'workspace-grid'},sidebar,center,inspector),message,projectFile,artFile,cardFiles.input);
 const cardCanvas=mountCardCanvas(canvasHost,ctx);ctx.cardCanvas=cardCanvas;ctx.paperRoot=paperRoot;
 const paperView=mountPaperView(paperRoot,store);ctx.onPaper=()=>{if(state.mode==='paper')paperView.refresh();};
 let phoneFitted=false;
 const mobileWorkspace=mountMobileWorkspace(root,{save,openLibrary:()=>{void ctx.openAssetLibrary();},onChange:()=>{refresh();if(mobileWorkspace.isPhone()&&mobileWorkspace.isPreviewVisible()&&!phoneFitted){cardCanvas.fit();phoneFitted=true;}}});
 const phoneFitFrame=requestAnimationFrame(()=>{if(mobileWorkspace.isPhone()&&mobileWorkspace.isPreviewVisible()){cardCanvas.fit();phoneFitted=true;}});
 const fileDrop=mountJsonFileDrop(root,{getContext:()=>store.getProject(),onProject:importProjectFile,onCard:(file,isCurrent)=>cardFiles.importFile(file,isCurrent),onError:message=>showMessage(message)});
 ctx.addElement=type=>{
  const id=newId(),s=store.getProject().settings;
  ctx.editTarget('요소 추가',t=>{t.elements.push({id,type,rect:{x:4,y:Math.min(50,s.cardHeightMm-12),w:Math.min(40,s.cardWidthMm-8),h:['image','effect'].includes(type)?24:type==='dice'?8.3:8},binding:null,style:{fontPt:Math.max(9,s.minFontPt),fontWeight:400,color:'#253d32',fill:type==='image'?'transparent':'#eef0e8',fit:'contain',cropX:.5,cropY:.5,align:'left'},...(type==='effect'?{style:{visualEffects:createVisualEffects()}}:type==='text'?{content:'새 텍스트'}:type==='dice'?{dice:{faces:[4,5,6],text:'성공',color:'#427963'}}:{})});if(t.kind)t.template='custom';});
  setElementSelection(state,[id],ctx.target());refresh();if(type==='image')ctx.pickImage(id);if(type==='effect')ctx.openVisualEffects({cardId:state.activeCardId,back:state.back,elementId:id});
 };
 ctx.selectElements=ids=>{setElementSelection(state,ids,ctx.target());ctx.renderInspector();cardCanvas.refresh();};
 ctx.moveElements=(dx,dy)=>{
  const selected=selectedElements(state,ctx.target()),delta=groupDelta(selected,dx,dy,store.getProject().settings);if(!selected.length||!delta.dx&&!delta.dy)return;
  const ids=new Set(selected.map(e=>e.id));ctx.editTarget('요소 묶음 이동',t=>{const moved=t.elements.filter(e=>ids.has(e.id));for(const e of moved){e.rect.x+=delta.dx;e.rect.y+=delta.dy;}if(t.kind){t.template='custom';if(moved.some(e=>e.binding?.skillId||e.binding?.field?.startsWith('item.')))t.autoSkillLayout=false;}});
 };
 ctx.duplicateElement=()=>{
  const selected=selectedElements(state,ctx.target());if(!selected.length)return;const delta=groupDelta(selected,2,2,store.getProject().settings),copies=selected.map(element=>{const copy=clone(element);copy.id=newId();remapTextRanges(copy,()=>newId());copy.rect.x+=delta.dx;copy.rect.y+=delta.dy;return copy;});
  ctx.editTarget('요소 복제',t=>{t.elements.push(...copies);if(t.kind){t.template='custom';if(copies.some(e=>e.binding?.skillId||e.binding?.field?.startsWith('item.')))t.autoSkillLayout=false;}});setElementSelection(state,copies.map(e=>e.id),ctx.target());refresh();
 };
 ctx.deleteElement=()=>{
  const ids=new Set(selectedElements(state,ctx.target()).map(e=>e.id));if(!ids.size)return;
  ctx.editTarget('요소 삭제',t=>{const bound=t.elements.some(e=>ids.has(e.id)&&(e.binding?.skillId||e.binding?.field?.startsWith('item.')));t.elements=t.elements.filter(e=>!ids.has(e.id));if(t.kind){t.template='custom';if(bound)t.autoSkillLayout=false;}});setElementSelection(state,[]);refresh();
 };
 ctx.reorderElement=delta=>ctx.editTarget('요소 순서',t=>{const i=t.elements.findIndex(e=>e.id===state.selectedElementId),j=i+delta;if(i<0||j<0||j>=t.elements.length)return;const e=t.elements.splice(i,1)[0];t.elements.splice(j,0,e);if(t.kind)t.template='custom';});
 function refresh(){
  const p=store.getProject();if(!p.cards.some(c=>c.id===state.activeCardId))state.activeCardId=p.cards[0]?.id;
  setElementSelection(state,state.selectedElementIds,ctx.target());
  deckName.value=p.name;document.getElementById('save-state').textContent=store.isDirty()?'미저장':'저장됨';
  document.getElementById('undo').disabled=!store.canUndo();document.getElementById('redo').disabled=!store.canRedo();
  for(const [node,active] of [[cardTab,state.mode==='card'],[paperTab,state.mode==='paper'],[frontTab,!state.back],[backTab,state.back]]){node.classList.toggle('active',active);node.setAttribute('aria-pressed',active);}
  cardArea.hidden=state.mode!=='card';paperRoot.hidden=state.mode!=='paper';
  cardCanvas.setActive(state.mode==='card'&&mobileWorkspace.isPreviewVisible()&&!state.paintOpen&&!state.effectOpen&&!document.querySelector('dialog[open]'));
  cardTemplates.refresh?.();cardLibrary.refresh();renderCards(cardList,ctx);ctx.renderInspector();cardCanvas.refresh();ctx.onPaper?.();
  const tick=++generation;loadAssets(p).then(cache=>{if(tick!==generation)return;ctx.assets=cache;ctx.refreshVisualEffects?.();renderCards(cardList,ctx);cardCanvas.refresh();ctx.onPaper?.();}).catch(e=>showMessage(e.message));
 }
 const unsubscribe=store.subscribe(refresh);ctx.refresh=refresh;
 const key=event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(document.querySelector('dialog[open]'))showMessage('편집 창을 닫은 뒤 저장을 눌러주세요.');else save();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();if(document.querySelector('dialog[open]'))showMessage('편집 창을 닫은 뒤 바로 인쇄를 눌러주세요.');else ctx.onPrint();return;}
  if(typing(event.target)||document.querySelector('dialog[open]'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?store.redo():store.undo();}
  else if(state.mode==='card'&&event.key==='Escape'){event.preventDefault();if(!cardCanvas.cancelGesture())ctx.selectElements([]);}
  else if(state.mode==='card'&&event.key==='Delete'){event.preventDefault();ctx.deleteElement();}
  else if(state.mode==='card'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&state.selectedElementId){event.preventDefault();const step=(25.4/300)*(event.shiftKey?10:1);ctx.moveElements(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);}
 };
 const unload=event=>{if(store.isDirty()||document.querySelector('[data-paint-dirty="true"],[data-effect-dirty="true"]')){event.preventDefault();event.returnValue='';}};
 window.addEventListener('keydown',key);window.addEventListener('beforeunload',unload);
 refresh();root.dataset.ready='true';updates.checkAtStartup();
 return Object.assign(ctx,{getActiveCardId:()=>state.activeCardId,destroy(){ctx.closeCloudImport?.();ctx.closeCloudPanel?.();cloudAssetControls.destroy();stopCloudView();root.removeEventListener('click',readonlyClick,true);Object.assign(store,originalMutations);cloudAccount.destroy();cloudSession.dispose();cancelAnimationFrame(phoneFitFrame);mobileWorkspace.destroy();assetLibrary.destroy();recovery.destroy();cardTemplates.destroy();cardLibrary.destroy();updates.destroy();fileDrop.destroy();cardFiles.destroy();workspaceFiles.destroy();ctx.closeVisualEffects?.({force:true});ctx.closeKeywords?.();unsubscribe();window.removeEventListener('keydown',key);window.removeEventListener('beforeunload',unload);cardCanvas.destroy();paperView.destroy();root.replaceChildren();}});
}
async function boot(){const root=document.getElementById('app');if(!root)return;try{await ensureFont();const p=createProject();p.cards[0]=applyTemplate(p.cards[0],p.settings,'monster-standard');mountEditor(root,createStore(p,{prepare:d=>{d.cards=d.cards.map(c=>c.variant&&c.autoSkillLayout?syncSkillElements(c,d.settings,d.keywords||[]):c);}}));}catch(e){root.textContent='작업실을 열지 못했어요: '+e.message;}}
boot();
