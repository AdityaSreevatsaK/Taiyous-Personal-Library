// Smoke-test the exact compiled Vite app through Chromium, not a synthetic HTML fixture.
import { chromium } from 'playwright';
import JSZip from 'jszip';

// A valid, original EPUB fixture lets Chromium exercise epub.js and real scrolling.
async function makeTestEpub() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:taiyou:test:smoke</dc:identifier><dc:title>Sample Library Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li></ol></nav></body></html>`);
  const paragraphs = Array.from({ length: 90 }, (_, i) =>
    `<p>Paragraph ${i + 1}: This original sample text tests natural vertical chapter scrolling without a horizontal scrollbar.</p>`).join('');
  zip.file('OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1>${paragraphs}</body></html>`);
  return Array.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
const epubBytes = await makeTestEpub();

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const failedAssets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      // Chromium logs this benign Permissions-Policy message when epub.js replaces an iframe.
      if (/Permissions policy violation: unload is not allowed in this document/i.test(message.text())) return;
      if (message.type() === 'error' && (!message.location().url || message.location().url.startsWith(baseUrl))) errors.push(message.text());
    });
    page.on('response', response => {
      if (response.url().startsWith(baseUrl) && response.status() >= 400) {
        failedAssets.push(`${response.status()} ${response.url()}`);
      }
    });
    const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    if (!response?.ok()) throw new Error(`App returned HTTP ${response?.status()}`);
    await page.locator('#root').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1000);
    const rootText = (await page.locator('#root').innerText()).trim();
    if (rootText.length < 20) throw new Error('Compiled React app did not visibly render');
    // Assert the real library dashboard rendered, rather than a long error message.
    await page.locator('.app-shell').waitFor({ state: 'visible' });
    await page.getByRole('navigation', { name: 'Library sections' }).waitFor({ state: 'attached' });
    if (!rootText.includes('Personal Library') || !rootText.includes('YOUR SHELVES')) {
      throw new Error('Expected library dashboard content is missing');
    }
    // Cloud connection must not dominate the bookshelf by default, but remain accessible.
    const cloudSettings = page.getByRole('button', { name: 'Settings', exact: true });
    await cloudSettings.waitFor();
    if (!(await page.locator('.connection-badge').count())) throw new Error('Cloud status pill missing');
    if (await page.locator('.cloud-connect-body').count()) {
      throw new Error('Cloud settings should be collapsed by default');
    }
    await cloudSettings.click();
    await page.getByRole('textbox', { name: 'Private dataset repository' }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    if (await page.locator('.cloud-connect-body').count()) {
      throw new Error('Cloud settings did not collapse');
    }
    if (await page.locator('.empty-feature').count()) {
      throw new Error('Oversized empty-state hero must not obscure the bookshelf');
    }
    // Seed a synthetic, local-only book so CI tests details without accessing the real dataset.
    await page.evaluate(async (epubData) => {
      const request = indexedDB.open('folio-personal-library-v1', 1);
      const db = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(['books', 'files'], 'readwrite');
      transaction.objectStore('books').put({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: 'Sample Library Book', author: 'Test Author',
        originalFileName: 'sample.epub', importedAt: Date.now(),
        progress: 0, size: 128, metadataScanned: true, sourceTags: ['Fantasy'],
      });
      transaction.objectStore('files').put({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', epub: new Blob([new Uint8Array(epubData)], { type: 'application/epub+zip' }) });
      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, epubBytes);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'Rate 8 out of 10' }).click();
    await page.getByRole('button', { name: 'Save rating' }).click();
    await page.getByText('Saved on this device. Connect your private cloud library to synchronise across devices.').waitFor();
    await page.locator('.details-hero').getByText('8/10').waitFor();
    // A real browser download should be offered in novel details, distinct from opening to read.
    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download EPUB' }).click();
    const download = await downloadStarted;
    if (!download.suggestedFilename().endsWith('.epub')) throw new Error('Missing EPUB download filename');
    await page.getByLabel('My comments / reading notes').fill('Local test note');
    await page.getByRole('button', { name: 'Save comments' }).click();
    const aside = await page.locator('.details-aside').boundingBox();
    const mainColumn = await page.locator('.details-main-column').boundingBox();
    if (viewport.width > 900 && (!aside || !mainColumn || aside.x >= mainColumn.x)) {
      throw new Error('Progress and details must appear to the left of the synopsis on desktop');
    }
    if (await page.locator('.details-review-card .rating-choices').count()) {
      throw new Error('Rating controls must live in title panel, not comments card');
    }
    await page.getByRole('button', { name: 'Browse novels tagged Fantasy' }).first().click();
    await page.getByRole('heading', { name: /Fantasy/ }).first().waitFor();
    await page.getByRole('textbox', { name: 'Search within current list' }).fill('unmatched');
    if (await page.getByRole('button', { name: 'View details for Sample Library Book' }).count()) {
      throw new Error('Tag-local search failed to limit results');
    }
    await page.getByRole('textbox', { name: 'Search within current list' }).fill('Sample');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('textbox', { name: 'Search all novels' }).fill('Test Author');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'Clear global search' }).click();
    await page.getByRole('button', { name: 'Show all novels' }).click();
    // Collections are independent from tags, work offline and survive reload.
    if (viewport.width <= 900) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: 'Create collection' }).click();
    await page.getByRole('textbox', { name: 'Collection name' }).fill('Example Series');
    await page.getByRole('button', { name: 'Save new collection' }).click();
    await page.getByRole('button', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('combobox', { name: 'Add Sample Library Book to collection' }).selectOption({ label: 'Example Series' });
    if (viewport.width <= 900) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: 'Open collection Example Series' }).click();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    if (viewport.width <= 900) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('button', { name: 'Open collection Example Series' }).click();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    // The current novel title returns to details; the library brand goes home.
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.getByRole('button', { name: 'Start reading' }).click();
    await page.getByRole('button', { name: 'Go to Sample Library Book details' }).waitFor();
    await page.locator('.reader-page iframe').first().waitFor({ state: 'visible', timeout: 20000 });
    const hasContentOverflow = await page.locator('.reader-page iframe').first().evaluate((frame) => {
      const doc = frame.contentDocument;
      return doc ? doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 3 : false;
    });
    if (hasContentOverflow) throw new Error('EPUB itself caused horizontal overflow');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (overflow) throw new Error('Reader produced horizontal page overflow');
    await page.getByRole('button', { name: 'Go to Sample Library Book details' }).click();
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'Start reading' }).click();
    await page.getByRole('button', { name: 'Go to library home' }).click();
    await page.getByRole('navigation', { name: 'Library sections' }).waitFor();
    await page.locator('.book-rating-pill').getByText('8/10').waitFor();
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
    if (failedAssets.length) throw new Error(`Failed local assets: ${failedAssets.join(' | ')}`);
    console.log(`Browser render passed at ${viewport.width}x${viewport.height}`);
    await page.close();
  }
} finally {
  await browser.close();
}
