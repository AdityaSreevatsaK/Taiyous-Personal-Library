// Focused CSP acceptance test against the actual Cloudflare Pages static headers.
// The full synthetic library/offline regression already runs separately.
import { chromium } from 'playwright';
import JSZip from 'jszip';

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:8790';
const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:nc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`.replace('urn:oasis:nc:', 'urn:oasis:names:tc:'));
zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:taiyou:test:csp</dc:identifier><dc:title>CSP Smoke Novel</dc:title><dc:language>en</dc:language></metadata>
<manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>
<spine><itemref idref="chapter"/></spine></package>`);
zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li></ol></nav></body></html>`);
zip.file('OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h2>Chapter 1</h2><p>This chapter is visible under the CSP.</p></body></html>`);
const epubBytes = Array.from(await zip.generateAsync({ type: 'uint8array' }));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route('**/api/library?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"connected":false}',
  }));
  await context.route('**/api/owner?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"configured":false,"unlocked":false}',
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' &&
        (!message.location().url || message.location().url.startsWith(baseUrl)) &&
        !/Permissions policy violation: unload is not allowed/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!response?.ok()) throw new Error('Cloudflare Pages shell failed to load');
  const policy = response.headers()['content-security-policy'] || '';
  if (!policy.includes("script-src 'self'") || !policy.includes("frame-ancestors 'none'")) {
    throw new Error('Actual Pages response is missing the restrictive CSP');
  }
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout: 15000 });

  await page.evaluate(async bytes => {
    const request = indexedDB.open('folio-personal-library-v1', 2);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of ['books', 'files', 'covers']) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['books', 'files'], 'readwrite');
    const id = 'cccccccccccccccccccccccc';
    transaction.objectStore('books').put({
      id, title: 'CSP Smoke Novel', author: 'Test Author',
      originalFileName: 'csp.epub', importedAt: Date.now(),
      progress: 0, size: 128, metadataScanned: true,
    });
    transaction.objectStore('files').put({
      id, epub: new Blob([new Uint8Array(bytes)], { type: 'application/epub+zip' }),
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, epubBytes);
  await page.goto(baseUrl + '/library', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.getByRole('button', { name: 'View details for CSP Smoke Novel' }).click({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start reading' }).click({ timeout: 15000 });
  await page.locator('.reader-page iframe').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForFunction(() => {
    const frame = document.querySelector('.reader-page iframe');
    return frame?.contentDocument?.body?.textContent?.includes('This chapter is visible under the CSP.');
  }, { timeout: 20000 });
  if (errors.length) throw new Error('Browser errors under CSP: ' + errors.join(' | '));
  await context.close();
  console.log('Cloudflare Pages CSP: shell, lazy reader chunk and EPUB iframe passed');
} finally {
  await browser.close();
}
