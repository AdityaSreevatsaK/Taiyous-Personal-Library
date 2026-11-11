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
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:taiyou:test:smoke</dc:identifier><dc:title>Sample Library Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/><itemref idref="chapter-two"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li><li><a href="chapter-two.xhtml">Chapter 2</a></li></ol></nav></body></html>`);
  const paragraphs = Array.from({ length: 90 }, (_, i) =>
    `<p>Paragraph ${i + 1}: This original sample text tests natural vertical chapter scrolling without a horizontal scrollbar.</p>`).join('');
  zip.file('OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h2 style="text-align:left">Chapter 1</h2>${paragraphs}</body></html>`);
  zip.file('OEBPS/chapter-two.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title></head><body>
<p style="text-align:left">Chapter 2: The Next Step</p>
<p>A new chapter for the reader navigation smoke test.</p></body></html>`);
  return Array.from(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}
const epubBytes = await makeTestEpub();

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    // Vite preview serves static assets only; the Pages Function is tested
    // separately. Simulate an unconfigured gateway so the legacy offline and
    // local-book fallback is exercised without spurious static-server 404s.
    await context.route('**/api/library?**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ connected: false }),
    }));
    const page = await context.newPage();
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
    const installManifest = await page.evaluate(async () => {
      const response = await fetch(new URL('manifest.webmanifest', document.baseURI));
      if (!response.ok) throw new Error('No standalone PWA manifest');
      const manifest = await response.json();
      const results = await Promise.all([192, 512].map(async size => {
        const entry = manifest.icons?.find(icon => icon.sizes === `${size}x${size}` && icon.type === 'image/png');
        if (!entry) throw new Error(`Missing ${size}x${size} PWA install icon`);
        const image = await fetch(new URL(entry.src, document.baseURI));
        if (!image.ok || image.headers.get('content-type')?.includes('html')) throw new Error(`Missing ${size}x${size} PNG`);
        const data = new Uint8Array(await image.arrayBuffer());
        if (data.length < 16 || data[0] !== 137 || data[1] !== 80 || data[2] !== 78 || data[3] !== 71) throw new Error('Invalid PNG signature');
        return size;
      }));
      return { name: manifest.name, display: manifest.display, results };
    });
    if (!installManifest.name?.includes('Taiyou') || installManifest.display !== 'standalone') {
      throw new Error('Invalid installable PWA manifest');
    }

    await page.locator('#root').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(1000);
    const rootText = (await page.locator('#root').innerText()).trim();
    if (rootText.length < 20) throw new Error('Compiled React app did not visibly render');
    // Assert the real library dashboard rendered, rather than a long error message.
    await page.locator('.app-shell').waitFor({ state: 'visible' });
    await page.getByRole('navigation', { name: 'Library sections' }).waitFor({ state: 'attached' });
    if (await page.locator('.sort-field select').inputValue() !== 'title') {
      throw new Error('Library should default to alphabetical Title A–Z sorting');
    }
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
      const request = indexedDB.open('folio-personal-library-v1', 2);
      const db = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('files')) database.createObjectStore('files', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('covers')) database.createObjectStore('covers', { keyPath: 'id' });
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
    // Dedicated advanced search must work with loaded novels on desktop and mobile.
    await page.locator('.advanced-search-launch').click();
    await page.getByRole('region', { name: 'Advanced novel search' }).waitFor();
    await page.getByRole('textbox', { name: 'Search by novel name or author' }).fill('Sample Library');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('textbox', { name: 'Search by novel name or author' }).fill('No such book');
    await page.getByRole('heading', { name: 'No matching books' }).waitFor();
    await page.getByRole('button', { name: 'Back to shelf' }).click();
    // Local EPUBs must be listed on the Offline tab without requiring a cloud token.
    await page.locator('.filter-tabs').getByRole('button', { name: 'Offline' }).click();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.locator('.filter-tabs').getByRole('button', { name: 'All', exact: true }).click();
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
    // Reader navigation belongs in the bottom strip, outside the hosting overlay.
    const footer = page.getByRole('navigation', { name: 'Chapter navigation' });
    await footer.waitFor({ state: 'visible' });
    const prevChapter = footer.getByRole('button', { name: 'Previous chapter' });
    const nextChapter = footer.getByRole('button', { name: 'Next chapter' });
    await prevChapter.waitFor({ state: 'visible' });
    await nextChapter.waitFor({ state: 'visible' });
    if (await page.locator('.reader-header').getByRole('button', { name: 'Next chapter' }).count()) {
      throw new Error('Next chapter control must no longer be in the top header');
    }
    const prevBox = await prevChapter.boundingBox();
    const nextBox = await nextChapter.boundingBox();
    const footerBox = await footer.boundingBox();
    if (!prevBox || !nextBox || !footerBox || prevBox.x >= nextBox.x ||
        Math.abs(prevBox.y - nextBox.y) > 12 ||
        footerBox.y < viewport.height - 120 || nextBox.x + nextBox.width > viewport.width + 1) {
      throw new Error('Chapter controls must be visible at bottom left and bottom right');
    }
    await page.getByRole('button', { name: 'Go to Sample Library Book details' }).waitFor();
    const headerBox = await page.locator('.reader-header').boundingBox();
    const titleBox = await page.locator('.reader-head-center').boundingBox();
    if (!headerBox || !titleBox || Math.abs(titleBox.x + titleBox.width / 2 - (headerBox.x + headerBox.width / 2)) > 2) {
      throw new Error('Novel title is not geometrically centred in the reader header');
    }
    if (await page.locator('.reader-home-link').getByText("Taiyou's Personal Library").count()) {
      throw new Error('Reader home control should use the symbol alone');
    }
    const chapterJump = footer.getByRole('combobox', { name: 'Jump to chapter' });
    await chapterJump.waitFor({ state: 'visible' });
    if (await chapterJump.locator('option').count() !== 3) {
      throw new Error('Bottom chapter selector must contain the complete chapter list');
    }
    await page.locator('.reader-page iframe').first().waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => {
      const frame = document.querySelector('.reader-page iframe');
      return frame?.contentDocument?.querySelector('h2') != null;
    });
    const headingAligned = await page.locator('.reader-page iframe').first().evaluate(frame => {
      const heading = frame.contentDocument?.querySelector('h2');
      return heading ? frame.contentWindow?.getComputedStyle(heading).textAlign : '';
    });
    if (headingAligned !== 'center') throw new Error('EPUB h2 chapter heading not centred');
    await chapterJump.selectOption('chapter-two.xhtml');
    await page.getByText('Chapter 2 of 2').waitFor();
    const paragraphAligned = await page.locator('.reader-page iframe').first().evaluate(frame => {
      const paragraph = Array.from(frame.contentDocument?.querySelectorAll('p') || [])
        .find(el => el.textContent?.includes('Chapter 2: The Next Step'));
      return paragraph ? frame.contentWindow?.getComputedStyle(paragraph).textAlign : '';
    });
    if (paragraphAligned !== 'center') throw new Error('EPUB paragraph chapter heading not centred');
    await chapterJump.selectOption('chapter.xhtml');
    await page.getByText('Chapter 1 of 2').waitFor();
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
    // Verify a true offline *reload* of the compiled app, then open/read the
    // already-cached synthetic EPUB without any network or HF credentials.
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Browser lacks service worker support');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Offline shell did not take control')), 12000);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
    });
    await page.context().setOffline(true);
    try {
      const offlineResponse = await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.locator('.app-shell').waitFor({ state: 'attached', timeout: 7000 }).catch(() => undefined);
      const appVisible = await page.locator('.app-shell').count();
      if (!appVisible) {
        const diagnostic = await page.evaluate(async () => ({
          url: location.href,
          title: document.title,
          root: document.querySelector('#root')?.textContent?.slice(0, 300) || '(missing root)',
          controller: navigator.serviceWorker?.controller?.scriptURL || '(none)',
          caches: await caches.keys(),
          scripts: [...document.querySelectorAll('script')].map(s => s.src),
          cachedAssets: await Promise.all((await caches.keys()).map(async name => {
            const cache = await caches.open(name);
            return { name, assets: (await cache.keys()).map(k => k.url) };
          })),
          scriptStatus: await Promise.all([...document.querySelectorAll('script[src]')].map(async script => ({
            url: script.src, cached: Boolean(await caches.match(script.src)),
            fetch: await fetch(script.src).then(r => ({ status: r.status, type: r.headers.get('content-type') })).catch(e => String(e)),
          }))),
          cssStatus: await Promise.all([...document.querySelectorAll('link[rel=stylesheet]')].filter(x => x.href.startsWith(location.origin)).map(async link => ({
            url: link.href, cached: Boolean(await caches.match(link.href)),
            fetch: await fetch(link.href).then(r => r.status).catch(e => String(e)),
          }))),
          document: document.querySelector('#root')?.outerHTML.slice(0, 500),
          readyState: document.readyState,
          failedAssets: performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('assets/')).slice(0, 12),
        }));
        throw new Error(`Offline reload did not bootstrap React: HTTP ${offlineResponse?.status()}; ${JSON.stringify(diagnostic)}; scriptErrors=${JSON.stringify(errors)}; failedRequests=${JSON.stringify(failedAssets)}`);
      }
      await page.locator('nav[aria-label="Library sections"]').waitFor({ state: 'attached' });
      await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
      await page.getByRole('button', { name: 'Start reading' }).click();
      await page.locator('.reader-page iframe').first().waitFor({ state: 'visible', timeout: 20000 });
      await page.getByRole('button', { name: 'Go to library home' }).click();
      await page.locator('nav[aria-label="Library sections"]').waitFor({ state: 'attached' });
      await page.getByText('Available offline').first().waitFor();
    } finally {
      await page.context().setOffline(false);
    }
    if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
    if (failedAssets.length) throw new Error(`Failed local assets: ${failedAssets.join(' | ')}`);
    // Reproduce an actual offline cold launch, not merely a reload of an open
    // tab. The service worker must handle navigation to the site's root.
    await page.close();
    await context.setOffline(true);
    try {
      const freshPage = await context.newPage();
      try {
        const startup = await freshPage.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!startup?.ok()) throw new Error('Offline cold launch returned HTTP ' + startup?.status());
        await freshPage.locator('.app-shell').waitFor({ state: 'visible', timeout: 10000 });
        await freshPage.locator('.filter-tabs button.selected').getByText('Offline').waitFor();
        await freshPage.getByRole('button', { name: 'View details for Sample Library Book' }).click();
        await freshPage.getByRole('button', { name: /^(Start|Continue) reading$/ }).click();
        await freshPage.locator('.reader-page iframe').first().waitFor({ state: 'visible', timeout: 20000 });
      } finally {
        await freshPage.close();
      }
    } finally {
      await context.setOffline(false);
      await context.close();
    }
    console.log(`Browser render and offline cold launch passed at ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
}
