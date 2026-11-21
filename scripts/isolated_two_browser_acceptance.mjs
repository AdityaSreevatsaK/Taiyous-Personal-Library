/**
 * Real two-browser session acceptance, run inside disposable HF integration.
 * Uses the actual Cloudflare Pages Functions, actual private HF snapshot and
 * CAS commits, and independent HttpOnly encrypted session cookies.
 * Does NOT test HF's interactive OAuth consent/PKCE code exchange.
 * Never uses or connects to the production origin or private novel dataset.
 */
import { chromium } from 'playwright';
import {
  origin, repo, assert, eventually, getApi, readBook, ownerContext,
  startIsolatedPages, stopIsolatedPages,
} from './isolated_hf_pages.mjs';

const id = 'a'.repeat(24);
const progressPath = 'data/personal/progress/' + id + '.json';
const reviewPath = 'data/personal/reviews/' + id + '.json';
const collectionsPath = 'data/personal/collections.json';
const ownNote = 'Device A offline note, preserved throughout conflict';
const errors = [];
let browser;
let initialBulkRequests = 0;
let personalGets = 0;

async function remoteState(page) {
  const reply = await getApi(page,'personal-bulk');
  assert(reply.status === 200 && reply.data?.version === 1 &&
    reply.data?.materialised === true, 'Real private bulk API unavailable');
  for (const path of [progressPath,reviewPath,collectionsPath])
    assert(reply.data.records[path]?.revision, 'Private migration lost '+path);
  return reply.data.records;
}
async function seedOfflineDevice(page) {
  await page.evaluate(async ({ id, ownNote }) => {
    const req = indexedDB.open('folio-personal-library-v1', 3);
    const db = await new Promise((ok, err) => {
      req.onsuccess=()=>ok(req.result);req.onerror=()=>err(req.error);
    });
    const tx = db.transaction('books','readwrite');
    const store=tx.objectStore('books');
    const q=store.get(id);
    const old=await new Promise((ok,err)=>{
      q.onsuccess=()=>ok(q.result);q.onerror=()=>err(q.error);
    });
    if(!old) throw Error('Browser had no real hosted book to edit');
    store.put({
      ...old, progress:80, currentChapter:'Chapter 80',
      currentChapterIndex:79,currentChapterNumber:80,
      progressUpdatedAt:1700,pendingProgressSync:true,
      progressCloudRevision:'a'.repeat(64),
      personalRating:9,personalReview:ownNote,
      personalReviewUpdatedAt:1700,pendingReviewSync:true,
      reviewCloudRevision:'a'.repeat(64),shelfStatus:'trying',
    });
    await new Promise((ok,err)=>{
      tx.oncomplete=ok;tx.onerror=()=>err(tx.error);
    });
    db.close();
    localStorage.setItem('taiyou.personal-collections.v1',JSON.stringify({
      version:1, collections:[{
        id:'collection_local1',name:'Device A offline series',
        bookIds:[id],updatedAt:1700,
      }],
    }));
    localStorage.setItem('taiyou.personal-collections-pending.v1','yes');
    localStorage.setItem('taiyou.collections-cloud-revision.v2',
      JSON.stringify('a'.repeat(64)));
  },{id,ownNote});
}
async function clickDecision(page,row,label,confirmLabel) {
  await row.getByRole('button',{name:label}).click({timeout:20000});
  await page.getByRole('dialog',{name:'Resolve private sync conflict?'})
    .getByRole('button',{name:confirmLabel}).click({timeout:20000});
}

try {
  await startIsolatedPages();
  browser=await chromium.launch({headless:true});
  const anon=await browser.newContext({ignoreHTTPSErrors:true});
  const anonPage=await anon.newPage();
  await anonPage.goto(origin,{waitUntil:'domcontentloaded'});
  assert((await getApi(anonPage,'session')).status===401,'Unauthenticated user obtained session');
  assert((await getApi(anonPage,'personal-bulk')).status===401,
    'Unauthenticated user accessed private progress');
  await anon.close();

  const a=await ownerContext(browser,{width:1366,height:800});
  const b=await ownerContext(browser,{width:390,height:844});
  const pageA=await a.newPage();
  const pageB=await b.newPage();
  for(const [tag,page]of [['A',pageA],['B',pageB]]){
    page.on('pageerror',e=>errors.push(tag+': '+e.message));
    page.on('request',req=>{
      if(!req.url().includes('/api/library?'))return;
      const url=new URL(req.url()),action=url.searchParams.get('action');
      if(action==='personal-bulk') initialBulkRequests++;
      if(action==='personal'&&req.method()==='GET')personalGets++;
    });
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('.app-shell').waitFor({timeout:25000});
    const session=await getApi(page,'session');
    assert(session.status===200&&session.data?.repo===repo&&session.data?.connected,
      'Real Pages session not authenticated to exact disposable dataset ('+tag+')');
    await eventually('real hosted novel on '+tag,async()=>!!await readBook(page));
    const state=await remoteState(page);
    assert(Object.keys(state).length>=3,'Missing personal state on '+tag);
  }
  assert(personalGets===0,'Startup made speculative per-novel personal GETs: '+personalGets);
  assert(initialBulkRequests<=4,
    'Browser requested excessive initial personal indexes: '+initialBulkRequests);

  // Device A edits offline, entirely within local IndexedDB/storage.
  await a.setOffline(true);
  await seedOfflineDevice(pageA);
  await a.setOffline(false);
  await pageA.reload({waitUntil:'domcontentloaded'});
  await pageA.getByRole('button',{name:/Cloud settings, connected/})
    .click({timeout:25000});
  await pageA.waitForFunction(()=>
    document.querySelectorAll('.sync-conflict-item').length===3,null,
    {timeout:30000});
  assert((await readBook(pageA)).progress===80,'Offline reading position lost');
  assert((await readBook(pageA)).personalReview===ownNote,'Offline notes lost');
  const progressRow=pageA.locator('.sync-conflict-item')
    .filter({hasText:'Reading position:'});
  const reviewRow=pageA.locator('.sync-conflict-item')
    .filter({hasText:'Rating, comments or Trying shelf'});
  const collectionsRow=pageA.locator('.sync-conflict-item')
    .filter({hasText:'Reading collections'});
  assert(await progressRow.count()===1&&await reviewRow.count()===1&&
    await collectionsRow.count()===1,'Missing progress/review/collections comparison');

  // Device B applies a real PATCH to an HF commit after A reviewed its
  // previous revision. A must NOT overwrite that unseen update.
  const stateB=await remoteState(pageB);
  const original=stateB[progressPath];
  const candidate={
    ...original.value,progress:88,currentChapter:'Chapter 88',
    currentChapterNumber:88,currentChapterIndex:87,updatedAt:2000,
  };
  const write=await getApi(pageB,'personal',{
    method:'PATCH',
    headers:{'Content-Type':'application/json','X-Taiyou-Request':'personal-sync'},
    body:JSON.stringify({path:progressPath,baseRevision:original.revision,value:candidate}),
  });
  assert(write.status===200,'Device B authenticated PATCH did not commit to real HF');
  await clickDecision(pageA,progressRow,'Keep this device’s copy','Use device copy');
  await eventually('third-device conflict from real HF',async()=>{
    if(await progressRow.count()!==1)return false;
    return(await progressRow.innerText()).includes('88');
  });
  assert((await readBook(pageA)).progress===80,
    'Device A overwrote its unsynchronised reading position');
  assert((await remoteState(pageB))[progressPath].value.progress===88,
    'First approval overwrote an unseen update without asking again');

  await clickDecision(pageA,progressRow,'Keep this device’s copy','Use device copy');
  await pageA.waitForFunction(()=>
    document.querySelectorAll('.sync-conflict-item').length===2,null,
    {timeout:30000});
  await clickDecision(pageA,reviewRow,'Use latest cloud copy','Use cloud copy');
  await pageA.waitForFunction(()=>
    document.querySelectorAll('.sync-conflict-item').length===1,null,
    {timeout:30000});
  await clickDecision(pageA,collectionsRow,'Keep this device’s copy','Use device copy');
  await pageA.waitForFunction(()=>
    document.querySelectorAll('.sync-conflict-item').length===0,null,
    {timeout:30000});
  const done=await remoteState(pageA);
  assert(done[progressPath].value.progress===80,'Approved progress did not save');
  assert(done[reviewPath].value.comments==='Disposable sample note 1',
    'Accepting cloud note incorrectly overwrote real HF review');
  assert(done[collectionsPath].value.collections[0].name==='Device A offline series',
    'Approved collections did not save');
  await pageB.reload({waitUntil:'domcontentloaded'});
  await eventually('second real browser recovered chosen data',async()=>{
    const book=await readBook(pageB);
    return book?.progress===80&&book?.personalRating===7;
  },100);
  assert(errors.length===0,'Actual browser errors: '+errors.join('; '));
  console.log('PASS: real isolated Cloudflare Pages Functions, two independently authenticated browsers');
  console.log('PASS: authenticated HF bulk GET, private session denial, no per-ID startup waterfall');
  console.log('PASS: offline edits, competing HF PATCH, double confirmation, notes and collections recovery');
  await a.close();await b.close();
} finally {
  if(browser)await browser.close();
  await stopIsolatedPages();
}
