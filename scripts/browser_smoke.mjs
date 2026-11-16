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
    // A deterministic, person-free landscape fixture avoids relying on an
    // external CDN during CI while proving the real hero img element renders.
    await context.route('https://images.unsplash.com/**', route => route.fulfill({
      status:200,contentType:'image/svg+xml',body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="750">'+
        '<rect width="1600" height="750" fill="#7899af"/>'+
        '<path d="M0 610L330 220L630 650L1040 190L1600 660V750H0Z" fill="#344a6c"/>'+
        '</svg>',
    }));
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
    const sunLogo = page.locator('.taiyou-brand-mark');
    await sunLogo.waitFor({ state:'visible' });
    if (!(await sunLogo.getAttribute('src'))?.includes('/branding/sun-light.webp')) {
      throw new Error('Sepia must show the approved blue-and-gold Sun mark');
    }
    if (!await sunLogo.evaluate(el => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0)) {
      throw new Error('Approved Sun logo did not load in the header');
    }
    if (!(await page.locator('link#taiyou-favicon').getAttribute('href'))?.includes('favicon-transparent-light.svg')) {
      throw new Error('Favicon does not match current light reading theme');
    }
    // Six palette swatches change the entire app in ONE click, and persist.
    const palettes = ['Sepia', 'Paper', 'Charcoal', 'Midnight', 'Ocean', 'Plum'];
    for (const name of palettes) {
      await page.getByRole('button', { name: 'Use ' + name + ' theme' }).click();
      const id = { Sepia: 'sepia', Paper: 'light', Charcoal: 'dark',
        Midnight: 'midnight', Ocean: 'ocean', Plum: 'plum' }[name];
      await page.locator('.app-shell.theme-' + id).waitFor({ state: 'visible' });
      // Connection label and Settings must meet readable contrast in every
      // theme. Simulate CSS state only, not a Hugging Face login.
      const cloudContrast = await page.evaluate(() => {
        const pill = document.querySelector('.topbar .cloud-connect-head .connection-badge');
        const button = document.querySelector('.topbar .cloud-connect-head > .secondary-button');
        if (!pill || !button) return null;
        pill.classList.add('is-connected');
        const dot = document.createElement('span');
        dot.className = 'cloud-connected-dot';
        pill.prepend(dot);
        const rgb = color => (color.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);
        const luminance = color => rgb(color).map(value => {
          const x = value / 255;
          return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const ratio = (a,b) => {
          const x = luminance(a), y = luminance(b);
          return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
        };
        const badgeStyle = getComputedStyle(pill), buttonStyle = getComputedStyle(button),
          dotStyle = getComputedStyle(dot);
        const metrics = {
          badge:ratio(badgeStyle.color,badgeStyle.backgroundColor),
          settings:ratio(buttonStyle.color,buttonStyle.backgroundColor),
          dot:ratio(dotStyle.backgroundColor,badgeStyle.backgroundColor),
        };
        dot.remove();
        pill.classList.remove('is-connected');
        return metrics;
      });
      if (!cloudContrast || cloudContrast.settings < 4.5 ||
          (viewport.width > 700 && cloudContrast.badge < 4.5) ||
          cloudContrast.dot < 3) {
        throw new Error('Cloud connection contrast fails in ' + name + ': ' + JSON.stringify(cloudContrast));
      }
      const expectedLogo = ['Sepia','Paper','Ocean'].includes(name) ? 'sun-light.webp' : 'sun-dark.webp';
      await page.locator('.taiyou-brand-mark[src$="' + expectedLogo + '"]').waitFor();
      const expectedFavicon = ['Sepia','Paper','Ocean'].includes(name) ? 'favicon-transparent-light.svg' : 'favicon-transparent-dark.svg';
      if (!(await page.locator('link#taiyou-favicon').getAttribute('href'))?.includes(expectedFavicon)) {
        throw new Error('Favicon did not update with selected theme: ' + name);
      }
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
    const navigateShelf = async (name, filter) => {
      if (viewport.width <= 700) {
        if (['reading','trying','offline'].includes(filter)) {
          await nav.locator('.mobile-shelf-nav').getByRole('button', {
            name: filter === 'reading' ? 'Reading' : filter === 'trying' ? 'Trying' : 'Offline',
          }).click();
        } else {
          await nav.getByRole('combobox', { name: 'More library shelves' }).selectOption(filter);
        }
      } else {
        await nav.getByRole('button', { name }).click();
      }
    };
    await page.getByRole('button', { name: 'Advanced search' }).click();
    await page.waitForURL('**/advanced-search');
    await page.getByRole('button', { name: 'Back to shelf' }).click();
    await page.waitForURL('**/library');
    await navigateShelf('Analytics', 'analytics');
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
    const analyticsBars = await page.locator('.usage-chart-track').evaluateAll(items =>
      items.map(item => {
        const children = [...item.children];
        return {
          separate:children.length === 2 &&
            children[0].classList.contains('usage-chart-app') &&
            children[1].classList.contains('usage-chart-reading'),
          colors:children.map(child=>getComputedStyle(child).backgroundColor),
        };
      }));
    if (analyticsBars.length !== 14 || analyticsBars.some(item =>
      !item.separate || item.colors[0] === item.colors[1])) {
      throw new Error('Last 14 days must display two adjacent, differently coloured bars');
    }
    await navigateShelf(/All books/, 'all');
    await page.waitForURL('**/library');
    for (const [name, path, heading] of [
      [/Trying out/, '/trying-out', /Trying out/],
      [/Currently reading/, '/currently-reading', /Currently reading/],
      [/To be read/, '/to-be-read', /To be read/],
      [/Finished/, '/finished', /Finished/],
      [/Available offline/, '/offline', /Available offline/],
    ]) {
      await navigateShelf(name, path === '/trying-out' ? 'trying' : path === '/currently-reading' ? 'reading' : path === '/to-be-read' ? 'unread' : path === '/finished' ? 'finished' : 'offline');
      await page.waitForURL('**' + path);
      await page.getByRole('heading', { name: heading }).first().waitFor();
    }
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/finished');
    await page.goForward({ waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/offline');
    await navigateShelf(/All books/, 'all');
    await page.waitForURL('**/library');

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
    // Direct access to Master Controls must never reveal record editing until
    // Owner mode is authenticated by the production server.
    await page.getByRole('button', { name: 'Open Master Controls' }).click();
    await page.waitForURL('**/master-controls');
    await page.getByRole('heading', { name: 'Master Controls' }).waitFor();
    if (await page.locator('.master-controls table').count()) {
      throw new Error('Master Controls exposed private management tools without Owner unlock');
    }
    await page.getByRole('button', { name: 'Back to library' }).click();
    await page.waitForURL('**/library');
    // Seed a synthetic, local-only book so CI tests details without accessing the real dataset.
    await page.evaluate(async (epubData) => {
      const request = indexedDB.open('folio-personal-library-v1', 3);
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
    // Seeded catalogue was opened on /library; return to the separately addressable Home.
    await page.getByRole('button', { name: "Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.reload({ waitUntil: 'networkidle' });
    // The integrated redesign uses the REAL IndexedDB books, not design fixtures.
    // Its new cover-led home and editorial index must work on desktop and mobile.
    const grand = page.locator('.editorial-grand');
    await grand.waitFor({ state: 'visible' });
    await page.locator('.editorial-journal').waitFor({ state: 'visible' });
    await page.locator('.editorial-index-row').first().waitFor();
    await page.getByText('Keep the story close.', {exact:true}).waitFor({state:'visible'});
    await page.getByText('Make room for a different world. Your chapters, notes and reading history remain where you left them.', {exact:true}).waitFor({state:'visible'});
    if(await page.locator('.top-nav-link').evaluateAll(nodes =>
      nodes.some(node => {
        const small=node.querySelector('small');
        return small && getComputedStyle(node).fontSize !== getComputedStyle(small).fontSize;
      }))) throw new Error('Top navigation count and label sizes must be consistent');
    // Sidebar stats are actual shelf navigation. Hover must visibly change the
    // background, unlike the old transparent-white treatment.
    const stat = page.locator('.editorial-margin-stats > button').first();
    const statBefore = await stat.evaluate(el => getComputedStyle(el).backgroundColor);
    await stat.hover();
    await page.waitForTimeout(225);
    const statAfter = await stat.evaluate(el => getComputedStyle(el).backgroundColor);
    if (statBefore === statAfter) throw new Error('Reading-statistics hover has no contrasting background');
    await page.evaluate(() => window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
    await page.waitForFunction(() => window.scrollY > 420, {timeout:10000});
    const backToTop = page.getByRole('button',{name:'Back to top'});
    await backToTop.waitFor({state:'visible'});
    await backToTop.click();
    await page.waitForFunction(() => window.scrollY < 10, {timeout:10000});
    if (await backToTop.count()) throw new Error('Back to top control did not disappear at page top');
    if (await page.locator('#library-full-catalogue, .book-grid').count()) {
      throw new Error('Homepage must NOT render the entire catalogue below the Literary Journal');
    }
    if (await page.locator('.editorial-index-row').count() > 6 ||
        await page.locator('.editorial-shelf-card').count() > 4) {
      throw new Error('Curated home exceeded its small, bounded selections');
    }
    await page.getByRole('button', { name: 'Browse tag Fantasy' }).waitFor();
    if (await page.locator('.editorial-grand-ledger button').count() !== 4 ||
        await page.locator('.editorial-margin-stats button').count() !== 4) {
      throw new Error('Clickable reading counters, including Finished, must exist in both home summaries');
    }
    if (await page.locator('.editorial-shelf-card .cover').count()) {
      throw new Error('Genre shelves may not display a fake cover when no real cover artwork exists');
    }
    if (await page.getByText('GENRE & TAG', { exact: true }).count()) {
      throw new Error('Home genre cards must not repeat the redundant genre/tag caption');
    }
    await mkdir('artifacts/design-screenshots', { recursive: true });
    await page.screenshot({ path: `artifacts/design-screenshots/editorial-home-${viewport.width}.png`, fullPage: true });
    if (!(await grand.getByRole('heading', { name: /Where worlds unfold/ }).count())) {
      throw new Error('Grand Library title is absent');
    }
    await page.locator('.editorial-browse-all').click();
    await page.waitForURL('**/library');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    const catalogueCaption = await page.locator('.book-tile').first().evaluate(tile => ({
      title: getComputedStyle(tile.querySelector('.tile-title')).textAlign,
      author: getComputedStyle(tile.querySelector('.tile-author-link')).textAlign,
      tags: getComputedStyle(tile.querySelector('.tile-tags')).justifyContent,
    }));
    if (catalogueCaption.title !== 'center' || catalogueCaption.author !== 'center' ||
        catalogueCaption.tags !== 'center') {
      throw new Error('Novel names, authors and tags must be centred below the cover: ' + JSON.stringify(catalogueCaption));
    }
    if (await page.locator('.editorial-journal').count()) throw new Error('Journal must not duplicate on the catalogue page');
    if (await page.locator('.sort-field select').inputValue() !== 'title') {
      throw new Error('Complete catalogue must retain alphabetical sorting');
    }
    await page.getByRole('button', { name: 'View novels by Test Author' }).click();
    await page.waitForURL('**/authors/Test%20Author');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'All authors' }).click();
    await page.waitForURL('**/library');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForURL('**/library');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    // Author deep-link navigation adds a history entry. Explicit Home remains
    // the stable way to return to the curated front page from any catalogue.
    await page.getByRole('button', { name: "Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.locator('.editorial-grand').waitFor();
    await page.getByRole('button', { name: 'Browse tag Fantasy' }).click();
    await page.waitForURL('**/tags/fantasy');
    if (await page.locator('.tag-collection-head:not(.collection-heading)').count()) {
      throw new Error('Filtered tag page repeats the selected tag in an unnecessary full-width bar');
    }
    await page.getByRole('button', { name: 'Show all novels' }).waitFor();
    await page.getByText('1 novel in this category').waitFor();
    if (await page.locator('.filter-tabs').count()) {
      throw new Error('Tag pages must not duplicate the main shelf navigation');
    }
    await page.getByRole('button', { name: "Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.getByRole('button', { name: 'Featured cover for Sample Library Book' }).click();
    // The existing detail action first resolves EPUB availability asynchronously.
    await page.waitForURL('**/novels/sample-library-book');
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    const naturePhoto = page.locator('.details-hero-backdrop');
    await naturePhoto.waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const img=document.querySelector('.details-hero-backdrop');
      return img?.complete && img?.naturalWidth > 0;
    });
    const natureStyle=await naturePhoto.evaluate(el => ({
      source:el.getAttribute('src'),
      referrer:el.getAttribute('referrerpolicy'),
      opacity:Number(getComputedStyle(el).opacity),
      fit:getComputedStyle(el).objectFit,
      filter:getComputedStyle(el).filter,
      mask:getComputedStyle(el).maskImage,
      webkitMask:getComputedStyle(el).webkitMaskImage,
      background:getComputedStyle(el.parentElement).backgroundImage,
      overlay:getComputedStyle(el.parentElement,'::before').content,
    }));
    if(!natureStyle.source?.startsWith('https://images.unsplash.com/photo-') ||
       natureStyle.referrer!=='no-referrer' || natureStyle.fit!=='cover' ||
       natureStyle.opacity!==1 || natureStyle.filter!=='none' ||
       natureStyle.mask!=='none' || natureStyle.webkitMask!=='none' ||
       natureStyle.background!=='none' || natureStyle.overlay!=='none') {
      throw new Error('The nature photo must be full-strength without wash, tint or mask: '+JSON.stringify(natureStyle));
    }
    const detailsOrder = await page.locator('.details-aside > .details-card').evaluateAll(nodes =>
      nodes.map(node => [...node.classList].find(value => /details-(tags|review|management)-card/.test(value))).filter(Boolean));
    if (detailsOrder.join(',') !== 'details-tags-card,details-review-card,details-management-card') {
      throw new Error('Novel management order must be Tags, Comments, Manage: ' + detailsOrder.join(','));
    }
    // Tag suggestions must reuse existing imported genres regardless of case.
    const tagInput = page.getByRole('textbox', {name:'New personal tag'});
    await tagInput.fill('fanta');
    await page.getByRole('group',{name:'Suggested existing tags'})
      .getByRole('button',{name:/Fantasy/}).waitFor();
    const existing = page.getByRole('group',{name:'Suggested existing tags'})
      .getByRole('button',{name:/Fantasy/});
    if(!(await existing.isDisabled())) throw new Error('An existing imported genre must not be added twice');
    // Unknown personal tags are normalised to Title Case before saving.
    await tagInput.fill('sLOW bURN');
    await page.getByRole('button',{name:'Add tag'}).click();
    await page.getByRole('button',{name:'Browse novels tagged Slow Burn'}).waitFor();
    await page.getByRole('link', { name: "Taiyou's Personal Library home" }).click();
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
    await navigateShelf(/Available offline/, 'offline');
    await page.locator('.offline-management-bar').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    if (await page.getByRole('button', { name: 'Remove offline EPUB for Sample Library Book' }).count()) {
      throw new Error('Must not allow removing the only local-only EPUB with no verified cloud copy');
    }
    await navigateShelf(/All books/, 'all');
    if (await page.locator('.offline-health').count()) throw new Error('Offline status shown outside Offline tab');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.waitForURL('**/novels/sample-library-book');
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    // Existing ID-based bookmarks must land on the identical book and replace
    // their URL with the title slug without losing any local IndexedDB data.
    await page.goto(baseUrl + '/book/aaaaaaaaaaaaaaaaaaaaaaaa', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.waitForURL('**/novels/sample-library-book');
    const libraryTitle = page.getByRole('link', { name: "Taiyou's Personal Library home" });
    if (await libraryTitle.getAttribute('href') !== '/') {
      throw new Error('Sun wordmark must link to the Library homepage');
    }
    if (await libraryTitle.locator('img.taiyou-brand-mark').count() !== 1 ||
        await page.locator('.details-topbar .details-top-read, .details-topbar .details-back').count() !== 0) {
      throw new Error('Details header must contain a Sun home link, no duplicate Back or Read action');
    }
    if (await page.locator('.details-top-controls button').count() !== 1 ||
        await page.locator('.details-top-controls .theme-next-button').count() !== 1) {
      throw new Error('The theme picker must be the sole right-hand header control');
    }
    const headerGeometry = await page.evaluate(() => {
      const a = document.querySelector('.details-brand-link')?.getBoundingClientRect();
      const b = document.querySelector('.details-top-controls')?.getBoundingClientRect();
      return { separate:!!a && !!b && a.right < b.left,
        visible:!!a && a.width >= 105 && a.height >= 25 };
    });
    if (!headerGeometry.separate || !headerGeometry.visible) {
      throw new Error('Sun brand link and theme picker overlap: ' + JSON.stringify(headerGeometry));
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    if (viewport.width <= 700) {
      // The long brand link is hidden on narrow screens; use the visible home button.
      await page.getByRole('link', { name: "Taiyou's Personal Library home" }).click();
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
    if (viewport.width <= 700) {
      // A compact native 1-10 picker replaces ten cramped buttons on phones.
      await page.getByRole('combobox', { name: 'Rate this novel' }).selectOption('8');
    } else {
      await page.getByRole('button', { name: 'Rate 8 out of 10' }).click();
    }
    await page.getByRole('button', { name: 'Save rating' }).click();
    await page.getByText('Saved on this device. Connect your private cloud library to synchronise across devices.').waitFor();
    await page.locator(viewport.width <= 700 ? '.details-mobile-rating' : '.details-hero')
      .getByText('8/10').waitFor();
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
      await page.getByRole('link', { name: "Taiyou's Personal Library home" }).click();
    } else {
      await libraryTitle.click();
    }
    await navigateShelf(/Trying out/, 'trying');
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'View details for Sample Library Book' }).click();
    await page.getByRole('button', { name: 'Move to regular library' }).click();
    await page.getByRole('button', { name: 'Add to Trying out' }).waitFor();
    if (viewport.width <= 700) {
      // Layout, not merely DOM order, must be reading-first on a narrow phone.
      const design = await page.evaluate(() => {
        const item = selector => document.querySelector(selector)?.getBoundingClientRect();
        const selectors = [
          '.details-hero', '.details-progress-card', '.details-description',
          '.details-mobile-rating', '.chapter-browser', '.details-info-card',
          '.details-tags-card', '.details-review-card', '.details-management-card',
        ];
        const boxes = selectors.map(item);
        const hero = document.querySelector('.details-hero');
        const title = item('.details-hero-heading');
        const trial = item('.details-hero-actions .details-trial-toggle');
        const epub = item('.details-hero-actions .details-download:not(.details-download-archive-header)');
        const start = item('.details-hero-actions .details-start');
        return {
          selectors, tops:boxes.map(box => box?.top ?? null),
          progressHeight:boxes[1]?.height, ratingHeight:boxes[3]?.height,
          titleOffset:title && hero ? Math.abs(title.x + title.width / 2 -
            (hero.getBoundingClientRect().x + hero.getBoundingClientRect().width / 2)) : null,
          pairedActions:trial && epub && Math.abs(trial.top - epub.top) <= 2,
          primaryAbove:start && trial && start.top < trial.top,
          mobileRatingVisible:getComputedStyle(document.querySelector('.details-mobile-rating')).display !== 'none',
          desktopRatingHidden:getComputedStyle(document.querySelector('.hero-rating')).display === 'none',
          progressReadDuplicateHidden:getComputedStyle(document.querySelector('.details-resume')).display === 'none',
        };
      });
      if (design.tops.some(top => top === null) ||
          design.tops.some((top, i) => i && top <= design.tops[i-1]) ||
          design.progressHeight > 150 || design.ratingHeight > 115 ||
          design.titleOffset > 3 || !design.pairedActions || !design.primaryAbove ||
          !design.mobileRatingVisible || !design.desktopRatingHidden ||
          !design.progressReadDuplicateHidden) {
        throw new Error('Mobile novel details order/spacing regressed: ' + JSON.stringify(design));
      }
      if (await page.locator('.details-download-archive-header').isVisible().catch(() => false)) {
        throw new Error('Archive backup must be with novel management, not mobile primary reading actions');
      }
      await mkdir('artifacts/design-screenshots', { recursive:true });
      await page.screenshot({path:'artifacts/design-screenshots/mobile-novel-details.png',fullPage:true});
    } else if (await page.locator('.details-mobile-rating').isVisible()) {
      throw new Error('Mobile-only rating strip leaked into the desktop details layout');
    }
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
    await page.waitForURL('**/library');
    // Collections are independent from tags, work offline and survive reload.
    await page.getByText('Collections', { exact: true }).click();
    await page.getByRole('button', { name: 'Create collection' }).click();
    await page.getByRole('textbox', { name: 'Collection name' }).fill('Example Series');
    await page.getByRole('button', { name: 'Save new collection' }).click();
    await page.getByRole('button', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('combobox', { name: 'Add Sample Library Book to collection' }).selectOption({ label: 'Example Series' });
    await page.getByRole('button', { name: 'Open collection Example Series' }).click();
    await page.waitForURL(/\/collections\/[A-Za-z0-9_-]{8,100}$/);
    if (await page.locator('.filter-tabs').count()) throw new Error('Collection pages must not duplicate main shelf navigation');
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
    if (viewport.width <= 700) await page.getByRole('button', { name: 'Start reading' }).hover();
    else await page.getByRole('button', { name: 'Begin this novel' }).hover();
    const heroAction = await page.locator(viewport.width <= 700 ? '.details-start' : '.details-resume').evaluate(el => ({
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
    await navigateShelf(/All books/, 'all');
    await page.waitForURL('**/library');
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
      await (viewport.width <= 700
        ? page.locator('.mobile-shelf-nav').getByRole('button', { name: 'Offline' })
        : page.getByText('Available offline').first()).waitFor();
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
        if (viewport.width <= 700) {
          await freshPage.locator('.mobile-shelf-nav button.selected').getByText('Offline').waitFor();
        } else {
          await freshPage.locator('.top-nav-link.active').getByText('Available offline').waitFor();
        }
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
        await fastPage.goto(baseUrl + '/library', { waitUntil: 'networkidle' });
        await fastPage.evaluate(async () => {
          const request = indexedDB.open('folio-personal-library-v1', 3);
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
        await fastPage.locator('.chapter-browser').waitFor();
        if (await fastPage.getByRole('button', { name: 'Load chapter list' }).count()) {
          throw new Error('Chapter list must be prepared automatically, not require a button');
        }
        if (await fastPage.getByText(/Unable to open novel/).count()) {
          throw new Error('Details incorrectly required a downloaded EPUB');
        }
        const colour = await fastPage.locator('.details-hero').evaluate(el =>
          getComputedStyle(el).getPropertyValue('--novel-hero-shadow').trim());
        if (!/^#[0-9a-f]{6}$/i.test(colour)) throw new Error('Novel hero colour is not derived from its immutable ID');
        console.log('Uncached novel details navigated without EPUB in ' + detailLatencyMs + ' ms');

        // Reproduce the owner's varied card heights: long/short titles, tags
        // that used to wrap '+N' to a second line, ratings and progress states.
        await fastPage.evaluate(async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('folio-personal-library-v1', 3);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const transaction = db.transaction('books', 'readwrite');
          const cases = [
            { id:'cccccccccccccccccccccccc', title:'Long Cultivation: My Augmented Statuses Have Unlimited Duration', author:'Long Author Name and Another Name',
              progress:0, sourceTags:['Action','Adventure','Fantasy','System','Martial Arts'], personalRating:8 },
            { id:'dddddddddddddddddddddddd', title:'Short Tale', author:'Writer', progress:46,
              sourceTags:['Action','Fantasy'] },
            { id:'eeeeeeeeeeeeeeeeeeeeeeee', title:'A Novel Under Consideration', author:'Another Author',
              progress:0, sourceTags:['Adventure'], shelfStatus:'trying' },
            { id:'ffffffffffffffffffffffff', title:'Novel With No Tags', author:'Longish Writer Name', progress:92,
              sourceTags:[], personalRating:9 },
          ];
          for (const [index, book] of cases.entries()) transaction.objectStore('books').put({
            originalFileName:'mock-not-downloaded.epub', importedAt:Date.now() + index,
            size:0, cloud:true, metadataScanned:true, ...book,
          });
          await new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
          db.close();
        });
        await fastPage.goto(baseUrl + '/library', { waitUntil:'networkidle' });
        await fastPage.getByRole('button', { name:'View details for Long Cultivation: My Augmented Statuses Have Unlimited Duration' }).waitFor();
        await fastPage.locator('.tile-trying-status').waitFor();
        await fastPage.locator('.tile-progress-value').first().waitFor();
        const fiveTagTile = fastPage.locator('.book-tile').filter({hasText:'Long Cultivation: My Augmented Statuses'});
        if (await fiveTagTile.locator('.tile-tags button').count() !== 5 ||
            await fastPage.getByText('NOT STARTED', {exact:true}).count()) {
          throw new Error('Catalogue must show five tags and omit Not Started labels');
        }
        const metrics = await fastPage.locator('.book-grid .book-tile').evaluateAll(cards => cards.map(card => {
          const box = card.getBoundingClientRect();
          const cover = card.querySelector('.cover-button > .cover').getBoundingClientRect();
          const tags = card.querySelector('.tile-tags');
          const footer = card.querySelector('.tile-bottom');
          const chips = [...tags.children].map(chip => chip.getBoundingClientRect().top);
          const tagRect = tags.getBoundingClientRect();
          return {
            cardTop: box.top, coverHeight:cover.height, coverRatio:cover.width/cover.height,
            tagsTop: tagRect.top, tagsHeight: tagRect.height,
            footerTop: getComputedStyle(footer).display === 'none' ? null : footer.getBoundingClientRect().top,
            chipRows: chips.length === 0 ? 1 : new Set(chips.map(top => Math.round(top))).size,
            chipCount: chips.length,
            titleAlignment: getComputedStyle(card.querySelector('.tile-title')).textAlign,
            authorAlignment: getComputedStyle(card.querySelector('.tile-author-link')).textAlign,
          };
        }));
        const firstRow = metrics.filter(item => Math.abs(item.cardTop - metrics[0].cardTop) < 2);
        const footerBaseline = firstRow.find(item => item.footerTop !== null)?.footerTop;
        if (firstRow.length < 2 ||
            firstRow.some(item => Math.abs(item.coverHeight - firstRow[0].coverHeight) > 2 ||
              Math.abs(item.coverRatio - 2/3) > .025 ||
              Math.abs(item.tagsTop - firstRow[0].tagsTop) > 2 ||
              (item.footerTop !== null && footerBaseline !== undefined &&
                Math.abs(item.footerTop - footerBaseline) > 2) ||
              item.tagsHeight > 80 || item.chipRows > 3 ||
              item.chipCount > 6 || item.titleAlignment !== 'center' || item.authorAlignment !== 'center')) {
          throw new Error('Catalogue metadata rows no longer align: ' + JSON.stringify({ viewport, firstRow }));
        }
        await fastPage.screenshot({path:`artifacts/design-screenshots/catalogue-tiles-${viewport.width}.png`,fullPage:true});
      } finally {
        await fastPage.close();
      }
      // Synthetic unlocked Owner session: prove expandable management controls
      // render and remain keyboard-accessible. No privileged cloud mutation.
      const adminPage = await context.newPage();
      try {
        await adminPage.route('**/api/owner?**', route => route.fulfill({
          status:200,contentType:'application/json',
          body:JSON.stringify({configured:true,unlocked:true,expiresAt:Date.now()+600000}),
        }));
        await adminPage.goto(baseUrl + '/master-controls', { waitUntil:'domcontentloaded' });
        await adminPage.locator('.master-controls table').waitFor({state:'visible',timeout:15000});
        const manage = adminPage.getByRole('button', {name:'Manage novel'}).first();
        await manage.click();
        const expandedControl = adminPage.locator('.master-record-active').first()
          .getByRole('button', {name:'Close controls'});
        await expandedControl.waitFor();
        if (await expandedControl.getAttribute('aria-expanded') !== 'true') {
          throw new Error('Master novel record did not expand accessibly');
        }
        for (const name of ['Title and author','Personal rating and notes','Tags','Synopsis','Reading progress']) {
          await adminPage.getByRole('heading', {name,exact:true}).waitFor();
        }
        await adminPage.getByRole('button', {name:'Reset progress'}).waitFor();
        await adminPage.getByRole('button', {name:'Mark as completed'}).waitFor();
        await adminPage.getByRole('button', {name:'Export EPUB backup'}).waitFor();
        await adminPage.getByRole('button', {name:'Close controls'}).click();
        if (await adminPage.locator('.master-expanded-row').count()) {
          throw new Error('Closing Master record failed to remove its edit panel');
        }
        // Regression: 25 records first, then batches of 25 when item 15
        // approaches the viewport. No next/previous pagination buttons.
        await adminPage.evaluate(async () => {
          const request=indexedDB.open('folio-personal-library-v1',3);
          const db=await new Promise((resolve,reject)=>{
            request.onsuccess=()=>resolve(request.result);
            request.onerror=()=>reject(request.error);
          });
          const tx=db.transaction('books','readwrite');
          for(let i=1;i<=65;i++){
            const id=i.toString(16).padStart(24,'0');
            tx.objectStore('books').put({id,title:'Bulk CI Novel '+String(i).padStart(3,'0'),
              author:'Synthetic Writer',originalFileName:'bulk.epub',importedAt:1,
              progress:0,size:0});
          }
          // Different immutable IDs, identical title and author, one hosted
          // and one local-only. The test NEVER submits a destructive action.
          for(const [id, cloud] of [
            ['aaaaaaaaaaaaaaaaaaaaaaaa',false],
            ['bbbbbbbbbbbbbbbbbbbbbbbb',true],
          ]) tx.objectStore('books').put({id,cloud,title:'Shared Duplicate',
            author:'Same Writer',originalFileName:'shared.epub',
            importedAt:1,progress:2,size:1024});
          await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
          db.close();
        });
        await adminPage.reload({waitUntil:'domcontentloaded'});
        await adminPage.locator('.master-controls table').waitFor();
        let shown=await adminPage.getByRole('button',{name:'Manage novel'}).count();
        if(shown!==25)throw new Error('Master must initially render 25 records, got '+shown);
        if(await adminPage.locator('.master-pages').getByRole('button',{name:'Next'}).count())
          throw new Error('Master must no longer require page navigation');
        await adminPage.getByRole('button',{name:'Manage novel'}).nth(14).scrollIntoViewIfNeeded();
        await adminPage.waitForFunction(() =>
          document.querySelectorAll('.master-controls .master-manage').length>=50,{timeout:10000});
        shown=await adminPage.getByRole('button',{name:'Manage novel'}).count();
        if(shown<50)throw new Error('Master lazy-load did not fetch the next 25');
        await adminPage.getByRole('button',{name:'Manage novel'}).nth(39).scrollIntoViewIfNeeded();
        await adminPage.waitForFunction(() =>
          document.querySelectorAll('.master-controls .master-manage').length>=65,{timeout:10000});
        console.log('Master lazy-loading passed: '+await adminPage.getByRole('button',{name:'Manage novel'}).count()+' records');
        // Delete copy must OPEN a visible Owner dialogue, not report a hidden
        // prerequisite under a collapsed book. No real files or data deleted.
        const duplicateDelete = adminPage.getByRole('button',{name:'Delete copy…'}).first();
        await duplicateDelete.click();
        const confirmDialog = adminPage.getByRole('dialog',{name:/Remove local novel|Delete cloud-hosted novel/});
        await confirmDialog.waitFor({timeout:10000});
        await confirmDialog.getByRole('button',{name:'Export EPUB backup'}).waitFor();
        await confirmDialog.getByLabel('Confirm title').fill('Shared Duplicate');
        await confirmDialog.getByRole('checkbox').check();
        const dangerous = confirmDialog.getByRole('button',{name:/Delete local novel|Delete novel from cloud/});
        if(!(await dangerous.isDisabled())) throw new Error('Deletion must be blocked until EPUB export succeeds');
        await confirmDialog.getByRole('button',{name:'Cancel',exact:true}).click();
        if(await adminPage.getByRole('dialog').count()) throw new Error('Owner deletion modal failed to close');
        // Also check the journal's Plum hover and a genuinely contrasting
        // Settings capsule without altering stored theme preferences.
        await adminPage.goto(baseUrl+'/',{waitUntil:'domcontentloaded'});
        const journalRow=adminPage.locator('.editorial-index-row').first();
        await journalRow.waitFor({state:'visible',timeout:12000});
        await adminPage.evaluate(()=>{
          const app=document.querySelector('.app-shell');
          if(!app)throw new Error('App shell missing');
          for(const name of ['theme-sepia','theme-light','theme-dark','theme-midnight','theme-ocean','theme-plum'])
            app.classList.remove(name);
          app.classList.add('theme-plum');
        });
        const before=await journalRow.evaluate(el=>getComputedStyle(el).backgroundColor);
        await journalRow.hover();
        await adminPage.waitForTimeout(240);
        const after=await journalRow.evaluate(el=>getComputedStyle(el).backgroundColor);
        if(before===after)throw new Error('Journal row hover has no contrasting visual state in Plum theme');
        const settings=adminPage.getByRole('button',{name:'Settings',exact:true});
        const contrast=await settings.evaluate(el=>{
          const cs=getComputedStyle(el);
          const rgb=color=>[...(color.match(/\d+(?:\.\d+)?/g)||[])].slice(0,3).map(Number);
          const luminance=(color)=>{
            const [r,g,b]=rgb(color).map(v=>{const s=v/255;return s<=0.04045?s/12.92:Math.pow((s+0.055)/1.055,2.4)});
            return 0.2126*r+0.7152*g+0.0722*b;
          };
          const a=luminance(cs.color),b=luminance(cs.backgroundColor);
          return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
        });
        if(contrast<4.5)throw new Error('Plum Settings button text contrast failed: '+contrast.toFixed(2)+':1');
        console.log('Owner deletion preflight and Plum hover/contrast checks passed');

      } finally {
        await adminPage.close();
        await context.close();
      }
    }
    console.log(`Browser render and offline cold launch passed at ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
}
