// Browser-level regression: two isolated devices against a deterministic,
// disposable private-dataset simulator. No HF credentials, remote files,
// destructive operations or production deployment are involved.
import { chromium } from 'playwright';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const rev = (digit) => digit.repeat(64);
const progressPath = 'data/personal/progress/' + id + '.json';
const reviewPath = 'data/personal/reviews/' + id + '.json';
const collectionsPath = 'data/personal/collections.json';
const localCollection = {
  id: 'collection_local1', name: 'Local series',
  bookIds: [id], updatedAt: 700_000,
};
const remoteCollection = {
  id: 'collection_cloud1', name: 'Cloud series',
  bookIds: [id], updatedAt: 1_300_000,
};
const progress = (position, updatedAt) => ({
  version: 1, bookId: id, progress: position,
  currentChapter: 'Chapter ' + position, currentChapterNumber: position,
  currentChapterIndex: position - 1, lastCfi: null,
  lastOpenedAt: updatedAt, updatedAt,
});
const review = (rating, comments, updatedAt) => ({
  version: 1, bookId: id, rating, comments,
  shelfStatus: 'trying', updatedAt,
});
const book = {
  id, title: 'Sync Regression Novel', author: 'Test Author',
  originalFileName: 'fixture.epub', importedAt: 1,
  progress: 0, size: 100, metadataScanned: true,
};
const catalog = { version: 1, books: [{
  id, metadata: book, epubPath: 'data/novels/' + id + '/source.epub',
}] };
const cloud = new Map([
  [progressPath, { value: progress(20, 1_300_000), revision: rev('b') }],
  [reviewPath, { value: review(6, 'Cloud notes with complete text', 1_300_000), revision: rev('b') }],
  [collectionsPath, { value: {version: 1, collections: [remoteCollection]}, revision: rev('b') }],
]);
const writes = [];
let revisionIndex = 12;
const json = (value) => JSON.stringify(value);
let connectedA = false;

async function attachMock(context, connected = () => true) {
  await context.route('**/api/library?**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    const path = url.searchParams.get('path');
    const answer = (status, value) => route.fulfill({
      status, contentType: 'application/json',
      headers: {'cache-control': 'no-store'}, body: json(value),
    });
    if (action === 'session') {
      return answer(200, connected()
        ? { connected: true, repo: 'AdityaSreevatsaK/Taiyous-Novels', username: 'Regression' }
        : { connected: false });
    }
    if (action === 'info') return answer(200, {private: true});
    if (action === 'file' && path === 'data/library.json') return answer(200, catalog);
    if (action === 'personal') {
      if (request.method() === 'GET') {
        return answer(200, cloud.get(path) ?? { value: null, revision: null });
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        if (!cloud.has(body.path)) return answer(409, { conflict: true, revision: null, value: null });
        const previous = cloud.get(body.path);
        if (body.baseRevision !== previous.revision) return answer(409, {
          conflict: true, revision: previous.revision, value: previous.value,
          error: 'Another device changed this record',
        });
        const next = { value: body.value, revision: revisionIndex.toString(16).padStart(1, '0').repeat(64) };
        revisionIndex += 1;
        cloud.set(body.path, next);
        writes.push({ path: body.path, value: body.value, baseRevision: body.baseRevision });
        return answer(200, { saved: true, ...next });
      }
    }
    // Tests must never write novel files or invoke privileged deletion.
    if (action === 'upload' || action === 'delete-novel') {
      throw new Error('Unexpected destructive write attempted by browser regression');
    }
    return answer(404, {error: 'Unsupported mocked endpoint: ' + action});
  });
  await context.route('**/api/owner?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: json({configured: false, unlocked: false, expiresAt: null}),
  }));
}

async function readBook(page) {
  return page.evaluate(async (targetId) => {
    const request = indexedDB.open('folio-personal-library-v1', 2);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('books', 'readonly');
    const result = await new Promise((resolve, reject) => {
      const get = tx.objectStore('books').get(targetId);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return result;
  }, id);
}

async function seedDeviceA(page) {
  await page.evaluate(({id, localCollection, localBook}) => {
    localStorage.setItem('taiyou.personal-collections.v1',
      JSON.stringify({version: 1, collections: [localCollection]}));
    localStorage.setItem('taiyou.personal-collections-pending.v1', 'yes');
    localStorage.setItem('taiyou.collections-cloud-revision.v2', JSON.stringify('a'.repeat(64)));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('folio-personal-library-v1', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', {keyPath: 'id'});
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', {keyPath: 'id'});
        if (!db.objectStoreNames.contains('covers')) db.createObjectStore('covers', {keyPath: 'id'});
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('books', 'readwrite');
        transaction.objectStore('books').put({...localBook, id});
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, {
    id, localCollection,
    localBook: { ...book, cloud: true,
      progress: 80, currentChapter: 'Chapter 80', currentChapterNumber: 80,
      currentChapterIndex: 79, progressUpdatedAt: 700_000, pendingProgressSync: true,
      progressCloudRevision: rev('a'),
      personalRating: 9, personalReview: 'Device A unsynced notes',
      personalReviewUpdatedAt: 700_000, pendingReviewSync: true,
      reviewCloudRevision: rev('a'), shelfStatus: 'trying' },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({headless: true});
try {
  const first = await browser.newContext({viewport: {width: 1366, height: 768}});
  await attachMock(first, () => connectedA);
  const pageA = await first.newPage();
  const errors = [];
  pageA.on('pageerror', error => errors.push('device A: ' + error.message));
  await pageA.goto(base, {waitUntil: 'domcontentloaded'});
  await pageA.locator('.app-shell').waitFor();
  await seedDeviceA(pageA);
  connectedA = true;
  await pageA.reload({waitUntil: 'domcontentloaded'});
  await pageA.waitForFunction(() =>
    document.querySelectorAll('.sync-conflict-item').length > 0, null, {timeout: 25000})
    .catch(() => undefined);
  await pageA.getByRole('button', {name: 'Settings', exact: true}).click();
  await pageA.waitForFunction(() =>
    document.querySelectorAll('.sync-conflict-item').length === 3, null, {timeout: 25000});
  const localBefore = await readBook(pageA);
  assert(localBefore.progress === 80, 'Offline reading position was lost on first cloud refresh');
  assert(localBefore.personalReview === 'Device A unsynced notes',
    'Offline review was lost on first cloud refresh');

  const progressRow = pageA.locator('.sync-conflict-item').filter({hasText: 'Reading position: Sync Regression Novel'});
  const reviewRow = pageA.locator('.sync-conflict-item').filter({hasText: 'Rating, comments or Trying shelf'});
  const collectionRow = pageA.locator('.sync-conflict-item').filter({hasText: 'Reading collections'});
  assert(await progressRow.count() === 1, 'Missing reading progress conflict');
  assert(await reviewRow.count() === 1, 'Missing personal review conflict');
  assert(await collectionRow.count() === 1, 'Missing collections conflict');
  await reviewRow.locator('summary').click();
  assert((await reviewRow.innerText()).includes('Device A unsynced notes'),
    'Review comparison omitted the complete local note');
  assert((await reviewRow.innerText()).includes('Cloud notes with complete text'),
    'Review comparison omitted the cloud note');

  // Simulate device C writing after device A had seen revision B.
  cloud.set(progressPath, {value: progress(30, 1_200_000), revision: rev('c')});
  pageA.on('dialog', dialog => void dialog.accept());
  await progressRow.getByRole('button', {name: 'Keep this device’s copy'}).click();
  await pageA.waitForFunction(() => [...document.querySelectorAll('.sync-conflict-item')]
    .some(item => item.textContent.includes('cloud: 30%')), null, {timeout: 15000});
  assert(writes.filter(w => w.path === progressPath).length === 0,
    'Keeping device position silently overwrote an unseen third-device edit');
  assert((await readBook(pageA)).progress === 80,
    'Third-device conflict unexpectedly discarded the local position');

  // Reviewing the newly displayed revision now authorises a protected write.
  await progressRow.getByRole('button', {name: 'Keep this device’s copy'}).click();
  await pageA.waitForFunction(() => document.querySelectorAll('.sync-conflict-item').length === 2,
    null, {timeout: 15000});
  assert(cloud.get(progressPath).value.progress === 80,
    'Explicitly retaining device progress failed to write the approved revision');
  assert(writes.filter(w => w.path === progressPath).length === 1,
    'Progress resolution wrote more than one record');

  // User chooses cloud notes, which must not write or touch reading progress.
  await reviewRow.getByRole('button', {name: 'Use latest cloud copy'}).click();
  await pageA.waitForFunction(() => document.querySelectorAll('.sync-conflict-item').length === 1,
    null, {timeout: 15000});
  assert((await readBook(pageA)).personalRating === 6, 'Choosing cloud notes did not restore rating');
  assert(cloud.get(progressPath).value.progress === 80, 'Review resolution rewrote the reading position');
  assert(writes.filter(w => w.path === reviewPath).length === 0,
    'Adopting cloud notes unexpectedly uploaded a review');

  // Collections must preserve all names/memberships and apply only chosen data.
  await collectionRow.locator('summary').click();
  assert((await collectionRow.innerText()).includes('Local series'), 'Local collection is not visible');
  assert((await collectionRow.innerText()).includes('Cloud series'), 'Cloud collection is not visible');
  await collectionRow.getByRole('button', {name: 'Keep this device’s copy'}).click();
  await pageA.waitForFunction(() => document.querySelectorAll('.sync-conflict-item').length === 0,
    null, {timeout: 15000});
  assert(cloud.get(collectionsPath).value.collections[0].name === 'Local series',
    'Chosen collection membership was not published');
  assert(writes.length === 2,
    'Expected only the explicitly approved progress and collection writes');

  // A completely separate browser must recover the now-synced data.
  const second = await browser.newContext({viewport: {width: 390, height: 844}});
  await attachMock(second);
  const pageB = await second.newPage();
  pageB.on('pageerror', error => errors.push('device B: ' + error.message));
  await pageB.goto(base, {waitUntil: 'domcontentloaded'});
  await pageB.waitForFunction(() =>
    document.querySelector('.book-rating-pill')?.textContent?.includes('6/10'),
    null, {timeout: 25000});
  await pageB.waitForFunction(() =>
    document.querySelector('.book-grid')?.textContent?.includes('80%'),
    null, {timeout: 15000});
  const persisted = await readBook(pageB);
  assert(persisted.progress === 80 && persisted.personalRating === 6,
    'Second device did not load the chosen progress and review');
  assert(persisted.shelfStatus === 'trying', 'Trying shelf status was not synchronised');
  assert(errors.length === 0, 'Browser console exceptions: ' + errors.join(' | '));
  console.log('Two-browser revision sync passed: 3 conflicts, third-device race, selective resolution, private data recovery, responsive device');
} finally {
  await browser.close();
}
