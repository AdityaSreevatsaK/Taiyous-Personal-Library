// Smoke-test the exact compiled Vite app through Chromium, not a synthetic HTML fixture.
import { chromium } from 'playwright';
import JSZip from 'jszip';
import { mkdir } from 'node:fs/promises';

// A valid, original EPUB fixture lets Chromium exercise epub.js and real scrolling.
async function makeTestEpub() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:taiyou:test:smoke</dc:identifier><dc:title>Sample Library Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/><itemref idref="chapter-two"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li><li><a href="chapter-two.xhtml">Chapter 2: The Next Step</a></li></ol></nav></body></html>`);
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
    // Owner mode must never silently grant deletion in a static/offline preview.
    await context.route('**/api/owner?**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ configured: false, unlocked: false, expiresAt: null }),
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
    await page.locator('.topbar > .cloud-connect').waitFor({ state: 'visible' });
    const cloudBox = await page.locator('.topbar > .cloud-connect').boundingBox();
    const topbarBox = await page.locator('.topbar').boundingBox();
    if (!cloudBox || !topbarBox || cloudBox.x < -1 ||
        cloudBox.x + cloudBox.width > viewport.width + 1 ||
        topbarBox.x + topbarBox.width > viewport.width + 1) {
      throw new Error('Cloud connection pill overflows the responsive header');
    }
    if (await page.locator('.breadcrumbs').count()) throw new Error('Redundant My Library / All Books breadcrumb still visible');
    if (await page.locator('.offline-health').count()) throw new Error('Offline status must be restricted to Offline tab');
    if (await page.locator('.book-grid .tile-delete').count()) throw new Error('One-click novel deletion must not appear on shelf');
    if (await page.locator('.sort-field select').inputValue() !== 'title') {
      throw new Error('Library should default to alphabetical Title A–Z sorting');
    }
    if (!rootText.includes('TAIYOU') || !rootText.includes('PERSONAL LIBRARY')) {
      throw new Error('Top navigation brand is absent from the library shell');
    }
    if (await page.locator('.sidebar').count()) {
      throw new Error('The new full-width library must not render a permanent sidebar');
    }
    await page.locator('.primary-top-nav').waitFor({ state: 'visible' });
    // Six palette swatches change the entire app in ONE click, and persist.
    const palettes = ['Sepia', 'Paper', 'Charcoal', 'Midnight', 'Ocean', 'Plum'];
    for (const name of palettes) {
      await page.getByRole('button', { name: 'Use ' + name + ' theme' }).click();
      const id = { Sepia: 'sepia', Paper: 'light', Charcoal: 'dark',
        Midnight: 'midnight', Ocean: 'ocean', Plum: 'plum' }[name];
      await page.locator('.app-shell.theme-' + id).waitFor({ state: 'visible' });
      if ((await page.getByRole('button', { name: 'Use ' + name + ' theme' }).getAttribute('aria-pressed')) !== 'true') {
        throw new Error('Palette selection must be accessible: ' + name);
      }
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.app-shell.theme-plum').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Use Sepia theme' }).click();
    await page.locator('.app-shell.theme-sepia').waitFor({ state: 'visible' });
    // Local private analytics must be usable and switchable without a server.
    const nav = page.getByRole('navigation', { name: 'Library sections' });
    await page.getByRole('button', { name: 'Advanced search' }).click();
    await page.waitForURL('**/advanced-search');
    await page.getByRole('button', { name: 'Close advanced search' }).click();
    await page.waitForURL('**/');
    await nav.getByRole('button', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics');
    await page.getByRole('heading', { name: 'Reading analytics' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Reading analytics' }).waitFor();
    if (new URL(page.url()).pathname !== '/analytics') throw new Error('Analytics deep link lost on reload');
    await page.getByText('Private and on-device').waitFor();
    const recordToggle = page.getByRole('checkbox', { name: 'Record analytics on this device' });
    await recordToggle.uncheck();
    if (await recordToggle.isChecked()) throw new Error('Analytics opt-out does not work');
    await recordToggle.check();
    await page.getByRole('button', { name: 'Clear analytics' }).waitFor();
    await nav.getByRole('button', { name: /All books/ }).click();
    await page.waitForURL('**/');
    for (const [name, path, heading] of [
      [/Trying out/, '/trying-out', /Trying out/],
      [/Currently reading/, '/currently-reading', /Your library/],
      [/To be read/, '/to-be-read', /Your library/],
      [/Finished/, '/finished', /Your library/],
      [/Available offline/, '/offline', /Offline library/],
    ]) {
      await nav.getByRole('button', { name }).click();
      await page.waitForURL('**' + path);
      await page.getByRole('heading', { name: heading }).first().waitFor();
    }
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/finished');
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/offline');
    await nav.getByRole('button', { name: /All books/ }).click();
    await page.waitForURL('**/');

    // Cloud connection must not dominate the bookshelf by default, but remain accessible.
    const cloudSettings = page.getByRole('button', { name: 'Settings', exact: true });
    await cloudSettings.waitFor();
    if (!(await page.locator('.connection-badge').count())) throw new Error('Cloud status pill missing');
    if (await page.locator('.cloud-connected-dot').count()) throw new Error('Disconnected dataset must NOT show a green connection dot');
    if (await page.locator('.cloud-connect-body').count()) {
      throw new Error('Cloud settings should be collapsed by default');
    }
    await cloudSettings.click();
    await page.getByRole('textbox', { name: 'Private dataset repository' }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    if (await page.locator('.cloud-connect-body').count()) {
      throw new Error('Cloud settings did not collapse');
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('.cloud-connect-body').waitFor({ state: 'visible' });
    await page.getByRole('textbox', { name: 'Search all novels' }).click();
    await page.locator('.cloud-connect-body').waitFor({ state: 'detached' });
    if (await page.locator('.cloud-status').count()) {
      throw new Error('Persistent cloud status obscures the bookshelf');
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
    // The integrated redesign uses the REAL IndexedDB books, not design fixtures.
    // Its new cover-led home and editorial index must work on desktop and mobile.
    const grand = page.locator('.editorial-grand');
    await grand.waitFor({ state: 'visible' });
    await page.locator('.editorial-journal').waitFor({ state: 'visible' });
    await page.locator('.editorial-index-row').first().waitFor();
    await mkdir('artifacts/design-screenshots', { recursive: true });
    await page.screenshot({ path: `artifacts/design-screenshots/editorial-home-${viewport.width}.png`, fullPage: true });
    if (!(await grand.getByRole('heading', { name: /Where worlds unfold/ }).count())) {
      throw new Error('Grand Library title is absent');
    }
    await page.getByRole('button', { name: 'Featured cover for Sample Library Book' }).click();
    // The existing detail action first resolves EPUB availability asynchronously.
    await page.waitForURL('**/novels/sample-library-book');
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'My library' }).click();
    await page.locator('.editorial-grand').waitFor({ state: 'visible' });
    // Dedicated advanced search must work with loaded novels on desktop and mobile.
    await page.locator('.advanced-search-launch').click();
    await page.getByRole('region', { name: 'Advanced novel search' }).waitFor();
    await page.getByRole('textbox', { name: 'Search by novel name or author' }).fill('Sample Library');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    if (await page.getByText('Unrated', { exact: true }).count()) throw new Error('Unrated should not be repeated across search results');
    await page.getByRole('textbox', { name: 'Search by novel name or author' }).fill('No such book');
    await page.getByRole('heading', { name: 'No matching books' }).waitFor();
    await page.getByRole('button', { name: 'Back to shelf' }).click();
    // Local EPUBs must be listed on the Offline tab without requiring a cloud token.
    await page.locator('.filter-tabs').getByRole('button', { name: 'Offline' }).click();
    await page.locator('.offline-management-bar').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    if (await page.getByRole('button', { name: 'Remove offline EPUB for Sample Library Book' }).count()) {
      throw new Error('Must not allow removing the only local-only EPUB with no verified cloud copy');
    }
    await page.locator('.filter-tabs').getByRole('button', { name: 'All', exact: true }).click();
    if (await page.locator('.offline-health').count()) throw new Error('Offline status shown outside Offline tab');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.waitForURL('**/novels/sample-library-book');
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    // Existing ID-based bookmarks must land on the identical book and replace
    // their URL with the title slug without losing any local IndexedDB data.
    await page.goto(baseUrl + '/book/aaaaaaaaaaaaaaaaaaaaaaaa', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.waitForURL('**/novels/sample-library-book');
    const libraryTitle = page.locator('a.details-top-title');
    if (await libraryTitle.getAttribute('href') !== '/') {
      throw new Error('Taiyou library title must be an actual hyperlink');
    }
    if (viewport.width > 700 &&
        !(await libraryTitle.evaluate(element => getComputedStyle(element).textDecorationLine))
          .includes('underline')) {
      throw new Error('Library home link must be visually identifiable without hovering');
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    if (viewport.width <= 700) {
      // The long brand link is hidden on narrow screens; use the visible home button.
      await page.getByRole('button', { name: 'My library' }).click();
    } else {
      await libraryTitle.click();
    }
    await page.getByRole('navigation', { name: 'Library sections' }).waitFor();
    if (new URL(page.url()).pathname !== '/') throw new Error('Home hyperlink did not navigate to /');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'Remove local novel (Owner mode)' }).click();
    await page.getByRole('dialog', { name: 'Remove local novel' }).waitFor();
    await page.getByText(/Owner mode is not configured/).waitFor();
    const ownerColour = await page.locator('.owner-dialog').evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element).color,
      theme: getComputedStyle(element).getPropertyValue('--surface'),
    }));
    if (!ownerColour.theme.trim() ||
        ownerColour.background === 'transparent' ||
        ownerColour.background === 'rgba(0, 0, 0, 0)' ||
        !ownerColour.text || ownerColour.text === 'transparent') {
      throw new Error('Owner dialog has no opaque theme-aware background: ' + JSON.stringify(ownerColour));
    }
    if (await page.getByRole('button', { name: 'Delete local novel' }).count()) {
      throw new Error('Destructive action bypasses the special owner sign-in');
    }
    await page.getByRole('button', { name: 'Cancel owner action' }).click();
    await page.getByRole('dialog', { name: 'Remove local novel' }).waitFor({ state: 'detached' });
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

    // Synopsis edits must prompt before committing.
    await page.getByRole('button', { name: 'Edit summary' }).click();
    await page.locator('#summary-editor').fill('My confirmed synopsis');
    page.once('dialog', dialog => void dialog.dismiss());
    await page.getByRole('button', { name: 'Save summary' }).click();
    await page.locator('#summary-editor').waitFor();
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Save summary' }).click();
    await page.getByText('My confirmed synopsis').waitFor();

    // Tags must be staged; multiple changes are confirmed in one batch.
    await page.getByRole('textbox', { name: 'New personal tag' }).fill('Worth a try');
    await page.getByRole('button', { name: 'Add tag' }).click();
    await page.getByText('Unsaved tag changes').waitFor();
    page.once('dialog', dialog => void dialog.dismiss());
    await page.getByRole('button', { name: 'Review & save tags' }).click();
    await page.getByText('Unsaved tag changes').waitFor();
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Review & save tags' }).click();
    await page.getByText('Your tags are saved').waitFor();

    // Trial shelf changes are explicit, and do not alter genre tags.
    await page.getByRole('button', { name: 'Add to Trying out' }).click();
    await page.getByRole('button', { name: 'Move to regular library' }).waitFor();
    if (viewport.width <= 700) {
      // The long brand link is hidden on narrow screens; use the visible home button.
      await page.getByRole('button', { name: 'My library' }).click();
    } else {
      await libraryTitle.click();
    }
    await page.getByRole('navigation', { name: 'Library sections' }).getByRole('button', { name: /Trying out/ }).click();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.getByRole('button', { name: 'Move to regular library' }).click();
    await page.getByRole('button', { name: 'Add to Trying out' }).waitFor();
    const aside = await page.locator('.details-aside').boundingBox();
    const mainColumn = await page.locator('.details-main-column').boundingBox();
    if (viewport.width > 900 && (!aside || !mainColumn || aside.x >= mainColumn.x)) {
      throw new Error('Progress and details must appear to the left of the synopsis on desktop');
    }
    if (await page.locator('.details-review-card .rating-choices').count()) {
      throw new Error('Rating controls must live in title panel, not comments card');
    }
    await page.getByRole('button', { name: 'Browse novels tagged Fantasy' }).first().click();
    await page.waitForURL('**/tags/fantasy');
    if (await page.locator('.reading-resume-strip').count()) {
      throw new Error('Filtered tag page must not show unrelated Continue Reading ribbon');
    }
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
    await page.waitForURL('**/');
    // Collections are independent from tags, work offline and survive reload.
    await page.getByText('Collections', { exact: true }).click();
    await page.getByRole('button', { name: 'Create collection' }).click();
    await page.getByRole('textbox', { name: 'Collection name' }).fill('Example Series');
    await page.getByRole('button', { name: 'Save new collection' }).click();
    await page.getByRole('button', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('combobox', { name: 'Add Sample Library Book to collection' }).selectOption({ label: 'Example Series' });
    await page.getByRole('button', { name: 'Open collection Example Series' }).click();
    await page.waitForURL(/\/collections\/[A-Za-z0-9_-]{8,100}$/);
    const collectionUrl = new URL(page.url()).pathname;
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    if (new URL(page.url()).pathname !== collectionUrl) throw new Error('Collection deep link not preserved');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByText('Collections', { exact: true }).click();
    await page.getByRole('button', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('button', { name: 'Open collection Example Series' }).click();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    // The current novel title returns to details; the library brand goes home.
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    if (await page.evaluate(() => window.scrollY) > 8) throw new Error('Novel details inherited old library scroll offset');
    const previousTheme = await page.locator('.details-shell').getAttribute('class');
    await page.getByRole('button', { name: /Choose colour theme, currently/ }).click();
    if (await page.locator('.details-shell').getAttribute('class') !== previousTheme) {
      throw new Error('Opening colour options should not cycle theme');
    }
    await page.getByRole('group', { name: 'Choose reading colour theme' })
      .getByRole('button', { name: 'Use Plum theme' }).click();
    await page.locator('.details-shell.theme-plum').waitFor();
    await page.getByRole('button', { name: 'Begin this novel' }).hover();
    const heroAction = await page.locator('.details-resume').evaluate(el => ({
      background:getComputedStyle(el).backgroundColor,
      ink:getComputedStyle(el).color,
    }));
    if (heroAction.background === 'rgb(35, 65, 47)' || heroAction.background === heroAction.ink) {
      throw new Error('Reading action retains old green or has illegible hover contrast');
    }
    await page.getByRole('button', { name: 'Start reading' }).click();
    // EPUB loading is asynchronous: verify the URL after the read action commits.
    await page.waitForURL('**/novels/sample-library-book/read/chapter-1');
    if (new URL(page.url()).pathname !== '/novels/sample-library-book/read/chapter-1') {
      throw new Error('Reader URL must use the title slug AND actual chapter number');
    }
    await page.reload({ waitUntil: 'networkidle' });
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
    const chapterJump = footer.getByRole('button', { name: 'Jump to chapter' });
    await chapterJump.waitFor({ state: 'visible' });
    const jumpBox = await chapterJump.boundingBox();
    if (!jumpBox || Math.abs(jumpBox.x + jumpBox.width / 2 - viewport.width / 2) > 3) {
      throw new Error('Bottom chapter control is not geometrically centred');
    }
    if (await footer.locator('select').count()) {
      throw new Error('Native chapter select should not produce oversized OS menus');
    }
    await chapterJump.click();
    const chapterDialog = page.getByRole('dialog', { name: 'Choose chapter' });
    await chapterDialog.waitFor({ state: 'visible' });
    const popupBox = await chapterDialog.boundingBox();
    if (!popupBox || Math.abs(popupBox.x + popupBox.width / 2 - viewport.width / 2) > 3) {
      throw new Error('Chapter chooser is not centred in the viewport');
    }
    await chapterDialog.getByRole('searchbox', { name: 'Search chapter titles' }).fill('Next Step');
    await chapterDialog.getByRole('button', { name: /Chapter 2: The Next Step/ }).waitFor();
    await chapterDialog.getByRole('searchbox', { name: 'Search chapter titles' }).fill('');
    await chapterDialog.getByRole('spinbutton', { name: 'Chapter number' }).fill('2');
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
    await chapterDialog.getByRole('button', { name: 'Go', exact: true }).click();
    await chapterDialog.waitFor({ state: 'detached' });
    await page.getByText('Chapter 2 of 2').waitFor();
    await page.waitForURL('**/novels/sample-library-book/read/chapter-2');
    const paragraphAligned = await page.locator('.reader-page iframe').first().evaluate(frame => {
      const paragraph = Array.from(frame.contentDocument?.querySelectorAll('p') || [])
        .find(el => el.textContent?.includes('Chapter 2: The Next Step'));
      return paragraph ? frame.contentWindow?.getComputedStyle(paragraph).textAlign : '';
    });
    if (paragraphAligned !== 'center') throw new Error('EPUB paragraph chapter heading not centred');
    await chapterJump.click();
    await page.getByRole('dialog', { name: 'Choose chapter' }).getByRole('spinbutton', { name: 'Chapter number' }).fill('1');
    await page.getByRole('dialog', { name: 'Choose chapter' }).getByRole('button', { name: 'Go', exact: true }).click();
    await page.getByText('Chapter 1 of 2').waitFor();
    await page.waitForURL('**/novels/sample-library-book/read/chapter-1');

    // The URL must select an explicit chapter even when the stored CFI
    // points to chapter 1. Verify direct links, reload and browser history.
    await page.goto(baseUrl + '/novels/sample-library-book/read/chapter-2', {waitUntil:'networkidle'});
    await page.getByText('Chapter 2 of 2').waitFor();
    await page.waitForURL('**/novels/sample-library-book/read/chapter-2');
    await page.reload({waitUntil:'networkidle'});
    await page.getByText('Chapter 2 of 2').waitFor();
    await page.goto(baseUrl + '/book/aaaaaaaaaaaaaaaaaaaaaaaa/read/chapter-1', {waitUntil:'networkidle'});
    await page.waitForURL('**/novels/sample-library-book/read/chapter-1');
    await page.getByText('Chapter 1 of 2').waitFor();
    await page.goto(baseUrl + '/novels/sample-library-book/read', {waitUntil:'networkidle'});
    await page.waitForURL(/\/novels\/sample-library-book\/read\/chapter-[12]$/);
    await page.getByText(/Chapter [12] of 2/).first().waitFor();

    const hasContentOverflow = await page.locator('.reader-page iframe').first().evaluate((frame) => {
      const doc = frame.contentDocument;
      return doc ? doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 3 : false;
    });
    if (hasContentOverflow) throw new Error('EPUB itself caused horizontal overflow');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (overflow) throw new Error('Reader produced horizontal page overflow');
    await page.getByRole('button', { name: 'Go to Sample Library Book details' }).click();
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    // Reloading a deep link can persist real progress, legitimately changing
    // this action's label from Start reading to Continue reading.
    await page.getByRole('button', { name: /^(Start reading|Continue reading)$/ }).click();
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
      await page.getByRole('button', { name: /^(Start|Continue) reading$/ }).click();
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

      // Performance regression: a cloud catalogue entry with no cached EPUB
      // must navigate directly to its details. The old implementation waited
      // for an entire remote EPUB and failed without a connected cloud.
      const fastPage = await context.newPage();
      try {
        await fastPage.goto(baseUrl + '/', { waitUntil: 'networkidle' });
        await fastPage.evaluate(async () => {
          const request = indexedDB.open('folio-personal-library-v1', 2);
          const db = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const transaction = db.transaction(['books'], 'readwrite');
          transaction.objectStore('books').put({
            id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            title: 'Cloud Metadata Only', author: 'Synthetic Test Author',
            importedAt: Date.now(), progress: 0, chapterCount: 2686,
            metadataScanned: true, sourceTags: ['Mystery'], cloud: true,
            originalFileName: 'not-downloaded.epub', size: 0,
          });
          await new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
          db.close();
        });
        await fastPage.reload({ waitUntil: 'networkidle' });
        const began = Date.now();
        await fastPage.getByRole('button', { name: 'View details for Cloud Metadata Only' }).click();
        await fastPage.waitForURL('**/novels/cloud-metadata-only', { timeout: 3500 });
        await fastPage.locator('.details-hero').getByRole('heading', { name: 'Cloud Metadata Only' }).waitFor();
        const detailLatencyMs = Date.now() - began;
        if (detailLatencyMs > 2800) throw new Error('Uncached details navigation regressed: ' + detailLatencyMs + ' ms');
        await fastPage.getByRole('button', { name: 'Load chapter list' }).waitFor();
        if (await fastPage.getByText(/Unable to open novel/).count()) {
          throw new Error('Details incorrectly required a downloaded EPUB');
        }
        const colour = await fastPage.locator('.details-hero').evaluate(el =>
          getComputedStyle(el).getPropertyValue('--novel-hero-shadow').trim());
        if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error('Novel hero colour is not derived from its immutable ID');
        console.log('Uncached novel details navigated without EPUB in ' + detailLatencyMs + ' ms');
      } finally {
        await fastPage.close();
        await context.close();
      }
    }
    console.log(`Browser render and offline cold launch passed at ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
}
