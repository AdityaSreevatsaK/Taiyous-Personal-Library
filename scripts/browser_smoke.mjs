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
    // Only new mobile readers default to Inter 105%; desktops retain Literata 115%.
    const initialReadingSettings = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('folio.reader-settings.v1') || '{}'));
    const wantedFont = viewport.width <= 700 ? 'sans' : 'literary';
    const wantedSize = viewport.width <= 700 ? 105 : 115;
    if (initialReadingSettings.font !== wantedFont || initialReadingSettings.fontSize !== wantedSize) {
      throw new Error('Incorrect first-run reader font defaults: ' + JSON.stringify(initialReadingSettings));
    }
    await page.getByRole('navigation', { name: 'Library sections' }).waitFor({ state: 'attached' });
    await page.locator('.topbar > .cloud-connect').waitFor({ state: 'visible' });
    const cloudBox = await page.locator('.topbar > .cloud-connect').boundingBox();
    const topbarBox = await page.locator('.topbar').boundingBox();
    if (!cloudBox || !topbarBox || cloudBox.x < -1 ||
        cloudBox.x + cloudBox.width > viewport.width + 1 ||
        topbarBox.x + topbarBox.width > viewport.width + 1) {
      throw new Error('Cloud status icon overflows the responsive header');
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
      // One cloud icon. Simulate the alternate state without a cloud login.
      const iconState = await page.evaluate(() => {
        const toggle = document.querySelector('.topbar .cloud-status-toggle');
        const dot = toggle?.querySelector('.cloud-status-dot');
        const svg = toggle?.querySelector('svg');
        const header = document.querySelector('.topbar');
        if (!toggle || !dot || !svg || !header) return null;
        const red = getComputedStyle(dot).backgroundColor;
        dot.classList.replace('is-disconnected','is-connected');
        const green = getComputedStyle(dot).backgroundColor;
        dot.classList.replace('is-connected','is-disconnected');
        const d = dot.getBoundingClientRect(), i = svg.getBoundingClientRect(),
          b = toggle.getBoundingClientRect();
        const rgb = c => (c.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
        const luminance = c => rgb(c).map(x=>{
          const v=x/255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
        }).reduce((t,x,n)=>t+x*[.2126,.7152,.0722][n],0);
        const a=luminance(getComputedStyle(toggle).color),
          bg=luminance(getComputedStyle(header).backgroundColor);
        return {
          red,green,contrast:(Math.max(a,bg)+.05)/(Math.min(a,bg)+.05),
          touch:b.width>=40&&b.height>=40,
          inside:d.left>i.left+i.width*.25&&d.right<i.right-i.width*.25&&
            d.top>i.top+i.height*.25&&d.bottom<i.bottom-i.height*.19,
        };
      });
      if(!iconState||iconState.red===iconState.green||!iconState.touch||
         !iconState.inside||iconState.contrast<4.5) {
        throw new Error('Two-state cloud icon not readable in '+name+': '+JSON.stringify(iconState));
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
    const navLinks = await nav.locator('.top-nav-links > a[href]').count();
    if (navLinks !== 8) {
      throw new Error('Home and all seven desktop shelf tabs must be real links: ' + navLinks);
    }
    if (await page.getByRole('link', { name: 'Advanced search' }).getAttribute('href') !== '/advanced-search') {
      throw new Error('Advanced search must have a copyable, new-tab URL');
    }
    if (await nav.getByRole('link', { name: 'Open Master Controls' }).getAttribute('href') !== '/master-controls') {
      throw new Error('Master Controls must have a real deep link');
    }

    // Logo and shelf tabs are real hyperlinks; Ctrl-click opens a new tab.
    const openInNewTab = async (locator, expectedPath) => {
      const href = await locator.getAttribute('href');
      if (href !== expectedPath) {
        throw new Error('Navigation is not a canonical hyperlink: ' + href);
      }
      const popupPromise = page.context().waitForEvent('page');
      await locator.click({ modifiers: ['Control'] });
      const popup = await popupPromise;
      await popup.waitForLoadState('domcontentloaded');
      if (new URL(popup.url()).pathname !== expectedPath) {
        throw new Error('Ctrl-click did not open new tab at ' + expectedPath);
      }
      await popup.close();
      if (new URL(page.url()).pathname !== '/') {
        throw new Error('Ctrl-click unexpectedly replaced the current library tab');
      }
    };
    await openInNewTab(
      page.getByRole('link', { name: "Taiyou's Personal Library home" }), '/');
    await openInNewTab(
      viewport.width <= 700
        ? nav.locator('.mobile-shelf-nav').getByRole('link', { name: 'Trying' })
        : nav.getByRole('link', { name: /Trying out/ }), '/trying-out');

    const navigateShelf = async (name, filter) => {
      if (viewport.width <= 700) {
        if (['reading','trying','offline'].includes(filter)) {
          await nav.locator('.mobile-shelf-nav').getByRole('link', {
            name: filter === 'reading' ? 'Reading' : filter === 'trying' ? 'Trying' : 'Offline',
          }).click();
        } else {
          await nav.getByRole('combobox', { name: 'More library shelves' }).selectOption(filter);
        }
      } else {
        await nav.getByRole('link', { name }).click();
      }
    };
    await page.getByRole('link', { name: 'Advanced search' }).click();
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

    // Both statuses are represented by one dot INSIDE a single cloud button.
    const cloudSettings = page.getByRole('button',{name:'Cloud settings, disconnected',exact:true});
    await cloudSettings.waitFor();
    if (await page.locator('.topbar .cloud-status-dot.is-disconnected').count()!==1 ||
        await page.locator('.topbar .cloud-status-dot.is-connected').count() ||
        await page.locator('.connection-badge,.cloud-connected-dot,.oauth-header-login').count()) {
      throw new Error('Cloud has an extra status badge or lacks its red dot');
    }
    if (await cloudSettings.getAttribute('aria-expanded')!=='false'||
        await page.locator('.cloud-connect-body').count()) {
      throw new Error('Cloud settings must be collapsed by default');
    }
    await cloudSettings.click();
    await page.getByRole('textbox',{name:'Private dataset repository'}).waitFor();
    await page.getByText('Connection: Disconnected').waitFor();
    if(await cloudSettings.getAttribute('aria-expanded')!=='true') {
      throw new Error('Cloud toggle must expose its expanded state');
    }
    await cloudSettings.click();
    if(await page.locator('.cloud-connect-body').count()) {
      throw new Error('Cloud settings did not close from the same icon');
    }
    await cloudSettings.click();
    const popup=await page.locator('.cloud-connect-body').boundingBox();
    if(!popup||popup.x< -1||popup.x+popup.width>viewport.width+1) {
      throw new Error('Cloud settings panel is outside the viewport');
    }
    await page.getByRole('textbox',{name:'Search all novels'}).click();
    await page.locator('.cloud-connect-body').waitFor({state:'detached'});
    if (await page.locator('.cloud-status').count()) {
      throw new Error('Persistent cloud status obscures the bookshelf');
    }
    if (await page.locator('.empty-feature').count()) {
      throw new Error('Oversized empty-state hero must not obscure the bookshelf');
    }
    // Direct access to Master Controls must never reveal record editing until
    // Owner mode is authenticated by the production server.
    await page.getByRole('link', { name: 'Open Master Controls' }).click();
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
        progress: 0, size: 128, metadataScanned: true, sourceTags: ['Fantasy', 'Action', 'Adventure', 'Martial Arts', 'Romance'],
      });
      transaction.objectStore('files').put({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', epub: new Blob([new Uint8Array(epubData)], { type: 'application/epub+zip' }) });
      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, epubBytes);
    // Seeded catalogue was opened on /library; return to the separately addressable Home.
    await page.getByRole('link', { name: "Taiyou's Personal Library home" }).click();
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
    const statsHover = await stat.evaluate(el => ({
      background:getComputedStyle(el).backgroundColor,
      stripe:getComputedStyle(el).boxShadow,
      text:getComputedStyle(el.querySelector('span')).color,
    }));
    if (statBefore === statsHover.background) {
      throw new Error('Reading-statistics hover has no contrasting background');
    }
    // The reading-record controls on the right must use the SAME background,
    // inset accent stripe, and secondary text contrast as rows on the left.
    const journalEntry = page.locator('.editorial-index-row').first();
    await journalEntry.hover();
    await page.waitForTimeout(225);
    const journalHover = await journalEntry.evaluate(el => ({
      background:getComputedStyle(el).backgroundColor,
      stripe:getComputedStyle(el).boxShadow,
      text:getComputedStyle(el.querySelector('.editorial-index-name small')).color,
    }));
    if (statsHover.background !== journalHover.background ||
        statsHover.stripe !== journalHover.stripe ||
        statsHover.text !== journalHover.text) {
      throw new Error('Reading-record contrast must match the journal on this theme: '+
        JSON.stringify({statsHover,journalHover}));
    }
    if (viewport.width <= 660) {
      const recordButtons=await page.locator('.editorial-margin-stats > button')
        .evaluateAll(buttons => buttons.map(button => ({
          r:button.getBoundingClientRect().toJSON(),
          border:getComputedStyle(button).borderTopWidth,
          arrow:button.querySelector('.editorial-stat-arrow') !== null,
        })));
      if (recordButtons.length!==4 || recordButtons.some(x => x.border==='0px'||!x.arrow) ||
          Math.abs(recordButtons[0].r.top-recordButtons[1].r.top)>2 ||
          Math.abs(recordButtons[2].r.top-recordButtons[3].r.top)>2 ||
          recordButtons[2].r.top<=recordButtons[0].r.bottom) {
        throw new Error('Mobile reading statistics need an obvious bordered 2x2 button grid: '+
          JSON.stringify(recordButtons));
      }
    }
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
    // Discovery shelves vary per visit; any genuine non-empty shelf is valid.
    await page.locator('.editorial-shelf-card').first().waitFor();
    // Tags and their counts must BOTH fit in the mobile viewport. Previously
    // the absolute menu opened to the left of the small header Tags button.
    const tagsMenu = page.locator('.top-nav-menu[aria-label="Novel tags"]');
    await tagsMenu.locator('summary').click();
    const tagMenuRect = await tagsMenu.locator('.top-nav-dropdown').evaluate(panel => {
      const b = panel.getBoundingClientRect();
      const item = panel.querySelector('.top-nav-dropdown-item');
      const label = item?.querySelector('span')?.getBoundingClientRect();
      const count = item?.querySelector('small')?.getBoundingClientRect();
      return { left:b.left,right:b.right,viewport:innerWidth,
        labelLeft:label?.left,labelRight:label?.right,
        countLeft:count?.left,countRight:count?.right };
    });
    if(tagMenuRect.left<0 || tagMenuRect.right>tagMenuRect.viewport+1 ||
       tagMenuRect.labelLeft<tagMenuRect.left ||
       tagMenuRect.labelRight>tagMenuRect.right ||
       tagMenuRect.countLeft<tagMenuRect.left ||
       tagMenuRect.countRight>tagMenuRect.right) {
      throw new Error('The Tags dropdown is clipped off-screen: '+JSON.stringify(tagMenuRect));
    }
    await tagsMenu.locator('summary').click();
    if (await page.locator('.editorial-grand-ledger button').count() !== 4 ||
        await page.locator('.editorial-margin-stats button').count() !== 4) {
      throw new Error('Clickable reading counters, including Finished, must exist in both home summaries');
    }
    // One actual book cannot supply four DISTINCT shelf covers. Temporarily
    // clone DOM cards to exercise the real responsive grid without adding
    // invented catalogue records, then restore the original DOM.
    const shelfGrid = page.locator('.editorial-shelf-grid');
    await shelfGrid.waitFor();
    await shelfGrid.evaluate(grid => {
      const first = grid.querySelector('.editorial-shelf-card');
      if (!first) throw new Error('Home shelf card is missing');
      for (let i = grid.children.length; i < 4; i++) {
        const clone = first.cloneNode(true);
        clone.setAttribute('data-layout-fixture', 'true');
        clone.querySelector('.editorial-shelf-details strong').textContent =
          ['Action', 'Fantasy', 'Adventure', 'Martial Arts'][i];
        grid.appendChild(clone);
      }
    });
    const shelfGeometry = await shelfGrid.evaluate(grid => {
      const cards = [...grid.querySelectorAll('.editorial-shelf-card')];
      const bounds = cards.map(card => card.getBoundingClientRect());
      const area = grid.getBoundingClientRect();
      return {
        mobile:matchMedia('(max-width:660px)').matches,
        display:getComputedStyle(grid).display,
        scrollWidth:grid.scrollWidth, clientWidth:grid.clientWidth,
        inside:bounds.every(b => b.left>=area.left-1 && b.right<=area.right+1),
        topAligned:Math.abs(bounds[0].top-bounds[1].top)<2 &&
          Math.abs(bounds[2].top-bounds[3].top)<2,
        twoRows:bounds[2].top>bounds[0].top+20,
        columnAligned:Math.abs(bounds[0].left-bounds[2].left)<2 &&
          Math.abs(bounds[1].left-bounds[3].left)<2,
      };
    });
    await shelfGrid.locator('[data-layout-fixture="true"]').evaluateAll(nodes =>
      nodes.forEach(node => node.remove()));
    if (shelfGeometry.mobile && (shelfGeometry.display!=='grid' || !shelfGeometry.inside ||
        shelfGeometry.scrollWidth>shelfGeometry.clientWidth+1 ||
        !shelfGeometry.topAligned || !shelfGeometry.twoRows || !shelfGeometry.columnAligned)) {
      throw new Error('All four mobile shelves must fit in 2x2 without horizontal scrolling: '+
        JSON.stringify(shelfGeometry));
    }
    const genreJackets=page.locator('.editorial-shelf-card .cover-generated-artwork');
    if (!(await genreJackets.count())) {
      throw new Error('Genre shelves must show a designed fallback jacket for uncovered novels');
    }
    // The homepage floating gallery must NEVER show the generated book
    // jackets used elsewhere. This fixture has no real cover at all.
    if (await page.locator('.editorial-grand-gallery .editorial-art-book:visible').count() ||
        await page.locator('.editorial-grand-gallery .cover-generated-artwork').count()) {
      throw new Error('Homepage floating gallery exposed an unverified/generated cover');
    }
    if (await page.getByText('Cover unavailable').count()) {
      throw new Error('Blank unavailable-cover placeholders must not appear');
    }
    await page.locator('.site-credit-footer').getByText(/Created by Taiyou/).waitFor();
    const shelfHeading = await page.locator('.editorial-shelves > .editorial-section-heading').evaluate(header => {
      const title=header.querySelector('h2').getBoundingClientRect();
      const aside=header.querySelector('.editorial-section-aside').getBoundingClientRect();
      return {mobile:matchMedia('(max-width:660px)').matches,title,aside};
    });
    if (shelfHeading.mobile && (shelfHeading.aside.top < shelfHeading.title.bottom-1 ||
        Math.abs(shelfHeading.aside.left-shelfHeading.title.left)>2)) {
      throw new Error('The shelf explanation must align underneath its heading on mobile: '+JSON.stringify(shelfHeading));
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
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    // True anchors expose a browser-native Open in new tab action. A normal
    // click still uses the app router, while Ctrl-click opens a second tab.
    const sampleLink = page.getByRole('link', { name: 'View details for Sample Library Book' });
    const sampleHref = await sampleLink.getAttribute('href');
    if (!sampleHref?.startsWith('/novels/')) throw new Error('Novel cover is not a canonical link');
    if (await sampleLink.getAttribute('title') !== null) throw new Error('Full cover hover label must not duplicate the visible novel title');
    const openedTab = page.context().waitForEvent('page');
    await sampleLink.click({ modifiers: ['Control'] });
    const secondTab = await openedTab;
    await secondTab.waitForLoadState('domcontentloaded');
    if (new URL(secondTab.url()).pathname !== sampleHref) {
      throw new Error('Ctrl-click did not open the requested novel in a new tab');
    }
    await secondTab.close();
    if (await page.locator('.cover-hover-title').count()) {
      throw new Error('Novel cover should not duplicate its title in a hover overlay');
    }
    // Show the native full-title tooltip ONLY when a caption is actually cut off.
    const titleLink = page.locator('.book-tile .tile-title').first();
    if (await titleLink.getAttribute('title') !== null) {
      throw new Error('Novel title should not have a redundant default tooltip');
    }
    await titleLink.evaluate(element => { element.style.maxWidth = '48px'; });
    await titleLink.hover();
    await page.waitForFunction(() => {
      const element = document.querySelector('.book-tile .tile-title');
      return element?.getAttribute('title') === 'Sample Library Book';
    }, null, {timeout: 7000});
    await titleLink.evaluate(element => { element.style.maxWidth = ''; });

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
    if (await page.locator('.reading-resume-strip').count()) {
      throw new Error('The All Books page duplicates the dedicated Continue Reading shelf');
    }
    if (await page.locator('.sort-field select').inputValue() !== 'title') {
      throw new Error('Complete catalogue must retain alphabetical sorting');
    }
    await page.getByRole('button', { name: 'View novels by Test Author' }).click();
    await page.waitForURL('**/authors/Test%20Author');
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'All authors' }).click();
    await page.waitForURL('**/library');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForURL('**/library');
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    // Author deep-link navigation adds a history entry. Explicit Home remains
    // the stable way to return to the curated front page from any catalogue.
    await page.getByRole('link', { name: "Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.locator('.editorial-grand').waitFor();
    // Navigate to a known tag through persistent navigation instead of
    // assuming a randomly selected discovery card contains the Action tag.
    const tagNav = page.locator('.top-nav-menu[aria-label="Novel tags"]');
    await tagNav.locator('summary').click();
    await tagNav.getByRole('link', { name: 'Browse novels tagged Action' }).click();
    await page.waitForURL('**/tags/action');
    if (await page.locator('.tag-collection-head:not(.collection-heading)').count()) {
      throw new Error('Filtered tag page repeats the selected tag in an unnecessary full-width bar');
    }
    await page.getByRole('button', { name: 'Show all novels' }).waitFor();
    await page.getByText('1 novel in this category').waitFor();
    if (viewport.width <= 700) {
      const tagHeader = await page.locator('.page-head-compact').evaluate(header => {
        const heading = header.querySelector('h1');
        const button = header.querySelector('.tag-clear-link');
        const first = heading?.firstChild;
        if (!heading || !button || !first) return null;
        const original = first.textContent;
        first.textContent = 'Martial Arts';
        const range = document.createRange();
        range.selectNodeContents(first);
        const lines = range.getClientRects().length;
        const titleRect = heading.getBoundingClientRect();
        const actionRect = button.getBoundingClientRect();
        const parentRect = header.getBoundingClientRect();
        first.textContent = original;
        return {lines,actionBelow:actionRect.top >= titleRect.bottom - 1,
          titleWidth:titleRect.width,parentWidth:parentRect.width};
      });
      if (!tagHeader || tagHeader.lines !== 1 || !tagHeader.actionBelow ||
          tagHeader.titleWidth < tagHeader.parentWidth - 3) {
        throw new Error('Mobile tag heading must use full width without folding Martial Arts: '+
          JSON.stringify(tagHeader));
      }
    }
    if (await page.locator('.filter-tabs').count()) {
      throw new Error('Tag pages must not duplicate the main shelf navigation');
    }
    await page.getByRole('link', { name: "Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.getByRole('link', { name: 'Explore this novel' }).click();
    // The existing detail action first resolves EPUB availability asynchronously.
    await page.waitForURL('**/novels/sample-library-book');
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();
    await page.locator('.site-credit-footer').getByText(/Created by Taiyou/).waitFor();
    const readingPosition = await page.locator('.details-progress-card .details-location').innerText();
    if (/Under The Starry Night|Exploded\?|Chapter 1\s*-/i.test(readingPosition)) {
      throw new Error('Compact reading progress must not repeat full EPUB chapter titles');
    }
    // Only the photographic hero spans the desktop viewport. The main
    // synopsis/management content below remains in its narrow reading column.
    if (viewport.width >= 1000) {
      const bounds = await page.locator('.details-hero').boundingBox();
      const cover = await page.locator('.details-hero .details-cover-wrap').boundingBox();
      if (!bounds || bounds.x > 40 || bounds.x + bounds.width < viewport.width - 40 ||
          !cover || cover.width < 220) {
        throw new Error('Novel details hero is not full bleed with a larger cover: ' +
          JSON.stringify({ bounds, cover }));
      }
      const hasOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > window.innerWidth + 2);
      if (hasOverflow) throw new Error('Full-bleed hero caused horizontal page overflow');
    }
    // All imported genres must remain visible, even on narrow mobile widths.
    // The old stylesheet hid everything after the first three tags.
    const heroTags = page.locator('.details-hero .details-hero-tags button');
    if (await heroTags.count()!==5) throw new Error('Hero must render all five imported genres');
    for (const tag of ['Fantasy','Action','Adventure','Martial Arts','Romance']) {
      const choice = heroTags.filter({hasText:tag});
      if (await choice.count()!==1 || !(await choice.isVisible())) {
        throw new Error('Hero tag hidden on mobile: '+tag);
      }
    }
    if (viewport.width<=700) {
      const regions=await page.evaluate(() => {
        const rect = selector =>
          document.querySelector('.details-hero '+selector).getBoundingClientRect();
        return {
          cover:rect('.details-cover-wrap'),meta:rect('.details-meta-row'),
          tags:rect('.details-hero-tags'),actions:rect('.details-hero-actions'),
          hero:document.querySelector('.details-hero').getBoundingClientRect(),
          display:getComputedStyle(document.querySelector('.details-hero-facts')).display,
        };
      });
      if (regions.display!=='flex' || regions.meta.left<regions.cover.right-2 ||
          regions.tags.left<regions.cover.right-2 ||
          regions.tags.top<regions.meta.bottom-2 ||
          regions.actions.top<Math.max(regions.tags.bottom,regions.cover.bottom)-2 ||
          regions.tags.right>regions.hero.right+1 ||
          regions.cover.width<130) {
        throw new Error('Mobile hero must enlarge artwork and use adjacent space for facts/tags: '+JSON.stringify(regions));
      }
    }
    // Validate the advanced ZIP disclosure styling even in the local EPUB
    // fixture, where no original ZIP exists, using a transient test element.
    const backup = await page.locator('.details-management-actions').evaluate(container => {
      const existing=container.querySelector('.details-archive-tools');
      const details=existing||document.createElement('details');
      if (!existing) {
        details.className='details-archive-tools';
        const summary=document.createElement('summary');
        summary.textContent='Original ZIP backup (advanced)';
        details.append(summary);
        container.append(details);
      }
      const summary=details.querySelector('summary');
      const height=summary.getBoundingClientRect().height;
      const fontSize=parseFloat(getComputedStyle(summary).fontSize);
      const column=getComputedStyle(details).gridColumnStart;
      if (!existing) details.remove();
      return {height,fontSize,column};
    });
    if (backup.fontSize>13 || backup.height>52 ||
        (viewport.width<=700 && backup.column!=='1')) {
      throw new Error('Advanced ZIP should be compact and full-width on mobile: '+
        JSON.stringify(backup));
    }
    // The test novel has no image. Its generated jacket and an independent
    // atmospheric photo must still render without pretending to be real art.
    const photoHero=page.locator('.details-hero-photographic');
    await photoHero.waitFor({state:'visible'});
    await page.locator('.details-cover-wrap .cover-generated-artwork').waitFor({state:'visible'});
    const landscapePhoto=page.locator('.details-hero-backdrop');
    await landscapePhoto.waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const img=document.querySelector('.details-hero-backdrop');
      return Boolean(img?.complete && img.naturalWidth > 0);
    });
    const photoStyle=await landscapePhoto.evaluate(el => ({
      source:el.getAttribute('src'),opacity:getComputedStyle(el).opacity,
      filter:getComputedStyle(el).filter,fit:getComputedStyle(el).objectFit,
    }));
    if (!photoStyle.source?.startsWith('https://images.unsplash.com/photo-') ||
        photoStyle.opacity!=='1' || photoStyle.filter!=='none' || photoStyle.fit!=='cover') {
      throw new Error('Decorative photography must remain visible behind novel details: '+
        JSON.stringify(photoStyle));
    }
    // Desktop: no giant blackout over the entire book information area.
    // Mobile: grid children must have their OWN stacking context because the
    // flattened display:contents parent does not create one; otherwise the
    // photo paints above the title, chapter facts and buttons.
    const readability = await page.evaluate(() => {
      const hero=document.querySelector('.details-hero');
      const photo=hero.querySelector('.details-hero-backdrop');
      const wrapper=hero.querySelector('.details-hero-content');
      const heading=hero.querySelector('.details-hero-heading');
      const facts=hero.querySelector('.details-hero-facts');
      const meta=hero.querySelector('.details-meta-row');
      const actions=hero.querySelector('.details-hero-actions');
      const cover=hero.querySelector('.details-cover-wrap');
      const backgroundAlpha = element => {
        const value=getComputedStyle(element).backgroundColor;
        const rgba=/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(value);
        return rgba ? Number(rgba[1]) : (value === 'rgba(0, 0, 0, 0)' ? 0 : 1);
      };
      const inFrontOfImage=element => {
        const box=element.getBoundingClientRect();
        if(box.width===0 || box.height===0)return false;
        // Mobile actions may be below the first viewport. Their positioned
        // stacking context must still be above the decorative image.
        const style=getComputedStyle(element);
        if(Number(style.zIndex)<2) return false;
        if(box.top>=innerHeight || box.bottom<=0) return true;
        const x=Math.min(innerWidth-1,Math.max(1,box.left+box.width/2));
        const y=Math.min(innerHeight-1,Math.max(1,box.top+box.height/2));
        const stack=document.elementsFromPoint(x,y);
        const elIndex=stack.findIndex(node => node===element||element.contains(node));
        const photoIndex=stack.indexOf(photo);
        return elIndex>=0 && (photoIndex<0 || elIndex<photoIndex);
      };
      return {
        mobile:matchMedia('(max-width:700px)').matches,
        wrapperDisplay:getComputedStyle(wrapper).display,
        wrapperAlpha:backgroundAlpha(wrapper),
        headingAlpha:backgroundAlpha(heading),
        headingVisible:inFrontOfImage(heading),
        factsAlpha:backgroundAlpha(facts),
        metaAlpha:backgroundAlpha(meta),
        factsVisible:inFrontOfImage(meta),
        actionsVisible:inFrontOfImage(actions),
        coverVisible:inFrontOfImage(cover),
        title:getComputedStyle(hero.querySelector('h1')).color,
        author:getComputedStyle(hero.querySelector('.details-author-link')).color,
        chapters:getComputedStyle(meta).color,
        photoOpacity:photo ? getComputedStyle(photo).opacity : 'absent',
        photoFilter:photo ? getComputedStyle(photo).filter : 'absent',
      };
    });
    if(readability.wrapperAlpha!==0 || readability.headingAlpha<.50 ||
       readability.headingAlpha>.70 || readability.factsAlpha!==0 ||
       readability.metaAlpha<.50 || readability.metaAlpha>.70 ||
       !readability.headingVisible || !readability.factsVisible ||
       !readability.actionsVisible || !readability.coverVisible ||
       (readability.mobile && readability.wrapperDisplay!=='contents') ||
       [readability.title,readability.author,readability.chapters]
         .some(colour=>colour!=='rgb(255, 255, 255)') ||
       readability.photoOpacity!=='1' || readability.photoFilter!=='none') {
      throw new Error('Hero must keep title, facts and actions above real scenery: '+JSON.stringify(readability));
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
    // Both search boxes must represent ONE live query. Previously the header
    // could say "Martial World" while Advanced Search misleadingly showed all books.
    const globalSearchInput = page.getByRole('textbox', { name:'Search all novels' });
    await globalSearchInput.fill('Sample Library');
    await page.locator('.advanced-search-launch').click();
    await page.waitForURL('**/advanced-search');
    await page.getByRole('region', { name: 'Advanced novel search' }).waitFor();
    const advancedNameInput = page.getByRole('textbox', { name: 'Search by novel name or author' });
    const minimumRating = page.getByRole('combobox', { name: 'Minimum rating' });
    const maximumRating = page.getByRole('combobox', { name: 'Maximum rating' });
    if ((await minimumRating.locator('option[value="10"]').textContent()) !== '10/10 · Masterpiece' ||
        (await minimumRating.locator('option[value="9"]').textContent()) !== '9/10 · Excellent' ||
        (await maximumRating.locator('option[value="5"]').textContent()) !== '5/10 · Average' ||
        await maximumRating.locator('option[value="0"]').count()) {
      throw new Error('Advanced rating filters must explain each score and exclude invalid 0/10 maximum');
    }
    await page.getByText('Genres and labels attached to novels.', { exact: false }).waitFor();
    await minimumRating.selectOption('10');
    if (await maximumRating.inputValue() !== '10') {
      throw new Error('Minimum rating of 10 must cap at the Masterpiece rating');
    }
    await minimumRating.selectOption('0');
    await page.getByText('All novels, including unrated ones', { exact: false }).waitFor();
    if (await advancedNameInput.inputValue() !== 'Sample Library') {
      throw new Error('Advanced search ignored the global query when opened');
    }
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await globalSearchInput.fill('No such book');
    await page.getByRole('heading', { name: 'No matching books' }).waitFor();
    if (await advancedNameInput.inputValue() !== 'No such book') {
      throw new Error('Advanced search did not respond to a changed header query');
    }
    await advancedNameInput.fill('Sample Library');
    if (await globalSearchInput.inputValue() !== 'Sample Library') {
      throw new Error('Header query did not respond to a changed advanced search field');
    }
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    if (await page.getByText('Unrated', { exact: true }).count()) {
      throw new Error('Unrated should not be repeated across search results');
    }
    await page.getByRole('button', { name: 'Clear global search' }).click();
    if (await advancedNameInput.inputValue() !== '') {
      throw new Error('Clear global search left a hidden advanced name filter');
    }
    await advancedNameInput.fill('No such book');
    await page.getByRole('heading', { name: 'No matching books' }).waitFor();
    await page.getByRole('button', { name:'Reset filters' }).click();
    if (await globalSearchInput.inputValue() !== '' || await advancedNameInput.inputValue() !== '') {
      throw new Error('Reset filters left a stale header or advanced query');
    }
    await advancedNameInput.fill('No such book');
    await page.getByRole('heading', { name: 'No matching books' }).waitFor();
    await page.getByRole('button', { name:'Clear all' }).click();
    if (await globalSearchInput.inputValue() !== '' || await advancedNameInput.inputValue() !== '') {
      throw new Error('Clear all left a stale header or advanced query');
    }
    await page.getByRole('button', { name: 'Back to shelf' }).click();
    // Home from a search must always be the curated Home, never an old result or shelf.
    await page.getByRole('textbox', { name:'Search all novels' }).fill('Sample Library');
    await page.getByRole('link', { name:"Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.locator('.editorial-grand').waitFor({ state:'visible' });
    if (await page.getByRole('textbox', { name:'Search all novels' }).inputValue() !== '') {
      throw new Error('Clicking the brand should clear the old search before showing Home');
    }
    const activeHomeNav = page.locator('.top-nav-links .top-nav-link[aria-current="page"]');
    if (await activeHomeNav.count() !== 1 ||
        (await activeHomeNav.first().textContent())?.trim() !== 'Home' ||
        await page.locator('.top-nav-links .top-nav-link.active').count() !== 1) {
      throw new Error('Home and another shelf both appear selected simultaneously');
    }
    // A shelf has its own single selected tab, and the brand always goes Home.
    await navigateShelf(/All books/, 'all');
    await page.waitForURL('**/library');
    if (await page.locator('.top-nav-links .top-nav-link[aria-current="page"]').count() !== 1 ||
        await page.locator('.top-nav-links .top-nav-link.active').count() !== 1) {
      throw new Error('Shelf navigation has duplicate selected tabs');
    }
    await page.getByRole('link', { name:"Taiyou's Personal Library home" }).click();
    await page.waitForURL('**/');
    await page.locator('.editorial-grand').waitFor({ state:'visible' });
    // Local EPUBs must be listed on the Offline tab without requiring a cloud token.
    await navigateShelf(/Available offline/, 'offline');
    await page.locator('.offline-management-bar').waitFor({ state: 'visible' });
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    if (await page.getByRole('button', { name: 'Remove offline EPUB for Sample Library Book' }).count()) {
      throw new Error('Must not allow removing the only local-only EPUB with no verified cloud copy');
    }
    await navigateShelf(/All books/, 'all');
    if (await page.locator('.offline-health').count()) throw new Error('Offline status shown outside Offline tab');
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).click();
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
    const detailsQuickNav = page.locator('.details-topbar .quick-nav');
    await detailsQuickNav.waitFor({ state: 'visible' });
    const quickNavToggle = viewport.width <= 1080
      ? detailsQuickNav.getByRole('button', { name: 'Open library navigation' })
      : detailsQuickNav.locator('.quick-nav-dropdown-host summary');
    // Native details/summary menus do not require a fetch when opened.
    if (viewport.width <= 1080) {
      await detailsQuickNav.locator('.quick-nav-mobile summary').click();
      await detailsQuickNav.getByRole('link', { name: 'Currently reading' }).waitFor();
      await detailsQuickNav.locator('.quick-nav-mobile summary').click();
    } else {
      if (await detailsQuickNav.getByRole('link', { name: 'Currently reading' }).getAttribute('href') !== '/currently-reading') {
        throw new Error('Quick navigation must use an ordinary, bookmarkable shelf link');
      }
      await quickNavToggle.click();
      await detailsQuickNav.getByRole('group', { name: 'Collections and subcollections' }).waitFor();
      await quickNavToggle.click();
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
      // All ten mobile options show the same meaningful labels as desktop
      // and Master Controls, rather than numbers only.
      const mobileRating = page.getByRole('combobox', { name: 'Rate this novel' });
      const labels = await mobileRating.locator('option').allTextContents();
      const expectedLabels = [
        'Unrated', '1/10 · Terrible', '2/10 · Very Poor',
        '3/10 · Poor', '4/10 · Below Average', '5/10 · Average',
        '6/10 · Decent', '7/10 · Good', '8/10 · Very Good',
        '9/10 · Excellent', '10/10 · Masterpiece',
      ];
      if (JSON.stringify(labels) !== JSON.stringify(expectedLabels)) {
        throw new Error('The mobile rating picker has lost the descriptive rating labels: ' + JSON.stringify(labels));
      }
      await mobileRating.selectOption('8');
      await page.locator('.details-mobile-rating-label').getByText('8/10 · Very Good').waitFor();
      const mobileRatingLayout = await page.locator('.details-mobile-rating').evaluate(element => {
        const select = element.querySelector('select');
        const button = element.querySelector('button[type="submit"]');
        const area = element.getBoundingClientRect();
        const selectRect = select.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        return {selectWidth:selectRect.width, withinCard:selectRect.left>=area.left &&
          buttonRect.right<=area.right+1, aligned:Math.abs(selectRect.top-buttonRect.top)<=2};
      });
      if (!mobileRatingLayout.withinCard || !mobileRatingLayout.aligned || mobileRatingLayout.selectWidth<115) {
        throw new Error('The descriptive mobile rating picker is cramped or overflows: '+JSON.stringify(mobileRatingLayout));
      }
    } else {
      await page.getByRole('button', { name: 'Rate 8 out of 10' }).click();
    }
    await page.getByRole('button', { name: 'Save rating' }).click();
    await page.getByText('Saved on this device. Connect your private cloud library to synchronise across devices.').waitFor();
    if (viewport.width <= 700) {
      // Scope to the visible selected-rating preview, not a second matching
      // text node inside the native option list.
      await page.locator('.details-mobile-rating-label strong')
        .getByText('8/10 · Very Good', {exact:true}).waitFor();
    } else {
      await page.locator('.details-hero .hero-rating-saved').getByText('· 8/10 · Very Good', { exact: true }).waitFor();
    }
    // A real browser download should be offered in novel details, distinct from opening to read.
    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download EPUB' }).click();
    const download = await downloadStarted;
    if (!download.suggestedFilename().endsWith('.epub')) throw new Error('Missing EPUB download filename');
    await page.getByLabel('My comments / reading notes').fill('Local test note');
    await page.getByRole('button', { name: 'Save comments' }).click();

    // Confirmations use the app's accessible, themed dialog, not browser prompts.
    await page.getByRole('button', { name: 'Edit summary' }).click();
    // The screenshot regression: both bottom actions share one baseline and height.
    const summaryActions = await page.locator('.summary-form-actions').evaluate(row => {
      const buttons = [...row.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      return {count:buttons.length,deltaTop:Math.abs(buttons[0].top-buttons[1].top),
        deltaHeight:Math.abs(buttons[0].height-buttons[1].height),
        rightGap:Math.abs(row.getBoundingClientRect().right-buttons[1].right)};
    });
    if (summaryActions.count!==2 || summaryActions.deltaTop>1 ||
        summaryActions.deltaHeight>1 || summaryActions.rightGap>2) {
      throw new Error('Summary form actions must align flush and match heights: '+
        JSON.stringify(summaryActions));
    }
    await page.locator('#summary-editor').fill('My confirmed synopsis');
    await page.getByRole('button', { name: 'Save summary' }).click();
    const synopsisDialog = page.getByRole('dialog', { name: 'Save revised synopsis?' });
    await synopsisDialog.waitFor();
    await synopsisDialog.getByRole('button', { name: 'Cancel' }).click();
    await synopsisDialog.waitFor({ state: 'detached' });
    await page.locator('#summary-editor').waitFor();
    await page.getByRole('button', { name: 'Save summary' }).click();
    await page.getByRole('dialog', { name: 'Save revised synopsis?' })
      .getByRole('button', { name: 'Save synopsis' }).click();
    await page.getByText('My confirmed synopsis').waitFor();
    // A genuinely lengthy synopsis must scroll inside its card, while chapter
    // browsing remains directly below it. Short synopses need no inner scroll.
    const longSynopsis = Array.from({ length: 75 }, (_, i) =>
      `A long but readable synopsis, paragraph ${i + 1}. The traveller opens a new chapter.`).join('\n');
    await page.getByRole('button', { name: 'Edit summary' }).click();
    await page.locator('#summary-editor').fill(longSynopsis);
    await page.getByRole('button', { name: 'Save summary' }).click();
    await page.getByRole('dialog', { name: 'Save revised synopsis?' })
      .getByRole('button', { name: 'Save synopsis' }).click();
    const synopsis = page.locator('.details-synopsis');
    await page.waitForFunction(() => {
      const element = document.querySelector('.details-synopsis');
      return element && element.scrollHeight > element.clientHeight + 50;
    });
    const innerScroll = await synopsis.evaluate(element => {
      const max = element.scrollHeight-element.clientHeight;
      element.scrollTop=max;
      return {height:element.clientHeight,available:max,scrollTop:element.scrollTop,
        overflow:getComputedStyle(element).overflowY,focusable:element.tabIndex};
    });
    if (innerScroll.available<50 || innerScroll.scrollTop<30 ||
        innerScroll.height>Math.min(window.innerHeight * .6,440) ||
        innerScroll.overflow!=='auto' || innerScroll.focusable!==0) {
      throw new Error('Long synopsis must have bounded keyboard-scrollable text: '+
        JSON.stringify(innerScroll));
    }
    await page.locator('.chapter-browser').waitFor();
    await page.evaluate(() => window.scrollTo({top:500,behavior:'instant'}));
    await page.waitForFunction(() => Number(document.querySelector('.details-page-scroll-meter')?.dataset.progress) > 0);
    const pageMeter = await page.locator('.details-page-scroll-meter').evaluate(el => ({
      percentage:Number(el.dataset.progress),visible:getComputedStyle(el).opacity,
    }));
    if (pageMeter.percentage<=0 || pageMeter.visible==='0') {
      throw new Error('Details page scroll progress indicator did not move: '+JSON.stringify(pageMeter));
    }
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));

    // Personal tags stay in draft after cancel and save on explicit confirmation.
    await page.getByRole('textbox', { name: 'New personal tag' }).fill('Worth a try');
    await page.getByRole('button', { name: 'Add tag' }).click();
    await page.getByText('Unsaved tag changes').waitFor();
    await page.getByRole('button', { name: 'Review & save tags' }).click();
    const tagsDialog = page.getByRole('dialog', { name: 'Save tag changes?' });
    await tagsDialog.waitFor();
    await tagsDialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByText('Unsaved tag changes').waitFor();
    await page.getByRole('button', { name: 'Review & save tags' }).click();
    await page.getByRole('dialog', { name: 'Save tag changes?' })
      .getByRole('button', { name: 'Save tags' }).click();
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
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).click();
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
    if (await page.getByRole('link', { name: 'View details for Sample Library Book' }).count()) {
      throw new Error('Tag-local search failed to limit results');
    }
    await page.getByRole('textbox', { name: 'Search within current list' }).fill('Sample');
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('textbox', { name: 'Search all novels' }).fill('Test Author');
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'Clear global search' }).click();
    await page.getByRole('button', { name: 'Show all novels' }).click();
    await page.waitForURL('**/library');
    // Collections are independent from tags, work offline and survive reload.
    await page.getByText('Collections', { exact: true }).click();
    await page.getByRole('button', { name: 'Create collection' }).click();
    await page.getByRole('textbox', { name: 'Collection name' }).fill('Example Series');
    await page.getByRole('button', { name: 'Save new collection' }).click();
    await page.getByRole('link', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('combobox', { name: 'Add Sample Library Book to collection' }).selectOption({ label: 'Example Series' });
    await page.getByRole('link', { name: 'Open collection Example Series' }).click();
    await page.waitForURL(/\/collections\/[A-Za-z0-9_-]{8,100}$/);
    if (await page.locator('.filter-tabs').count()) throw new Error('Collection pages must not duplicate main shelf navigation');
    const collectionUrl = new URL(page.url()).pathname;
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    if (new URL(page.url()).pathname !== collectionUrl) throw new Error('Collection deep link not preserved');
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    const collectionLayout = await page.locator('.collection-view').evaluate(section => {
      const header = section.querySelector('.collection-heading');
      const summary = section.querySelector('.collection-heading-summary')?.getBoundingClientRect();
      const actions = section.querySelector('.collection-actions')?.getBoundingClientRect();
      const quickAdd = section.querySelector('.collection-quick-add')?.getBoundingClientRect();
      const inputs = Array.from(section.querySelectorAll('.collection-quick-add-field')).map(node => node.getBoundingClientRect());
      const bounds = section.getBoundingClientRect();
      const aligned = summary && actions && (window.innerWidth > 1180
        ? Math.abs((summary.top + summary.bottom) / 2 - (actions.top + actions.bottom) / 2) < 24
        : summary.bottom <= actions.top + 2);
      const inputsAligned = inputs.length === 2 && (window.innerWidth > 780
        ? Math.abs(inputs[0].top-inputs[1].top) < 3
        : inputs[0].bottom <= inputs[1].top);
      return {
        aligned:!!aligned,inputsAligned,
        inside:!!quickAdd && quickAdd.right <= bounds.right + 2,
        headingVisible:!!header && getComputedStyle(header).display !== 'none',
      };
    });
    if (Object.values(collectionLayout).some(ok => !ok)) {
      throw new Error('Collection typography or actions/search alignment regressed: ' +
        JSON.stringify(collectionLayout));
    }
    await page.getByText('Collections', { exact: true }).click();
    await page.getByRole('link', { name: 'Open collection Example Series' }).waitFor();
    await page.getByRole('link', { name: 'Open collection Example Series' }).click();
    // Direct collection management searches the local catalogue and creates nested folders.
    const addPanel = page.getByRole('region', { name:'Add to Example Series' });
    const findNovel = addPanel.getByRole('searchbox', { name:'Find novels to add' });
    await findNovel.fill('Sample Library');
    if (await addPanel.getByRole('button', {
      name:'Add Sample Library Book to Example Series',
    }).count()) {
      throw new Error('Quick add should not offer books already directly in this collection');
    }
    const findFolder = addPanel.getByRole('searchbox', { name:'Find collections to move here' });
    await findFolder.fill('Volume One');
    await addPanel.getByRole('button', { name:'Create subcollection Volume One' }).click();
    const volumeLink = page.getByRole('link', { name: 'Open subcollection Volume One' });
    await volumeLink.waitFor();
    const volumeHref = await volumeLink.getAttribute('href');
    if (!volumeHref?.startsWith('/collections/')) throw new Error('Subcollection requires a stable deep link');
    const volumeId = volumeHref.split('/').pop();
    await volumeLink.click();
    await page.waitForURL('**' + volumeHref);
    const addToVolume = page.getByRole('region', { name:'Add to Volume One' });
    await addToVolume.getByRole('searchbox', { name:'Find novels to add' }).fill('Sample Library');
    await addToVolume.getByRole('button', { name:'Add Sample Library Book to Volume One' }).click();
    await page.getByRole('link', { name:'View details for Sample Library Book' }).waitFor();
    await page.getByRole('button', { name: 'Create subcollection in Volume One' }).click();
    await page.getByRole('textbox', { name: 'New subcollection inside Volume One' }).fill('Arc A');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('link', { name: 'Open subcollection Arc A' }).click();
    const arcUrl = new URL(page.url()).pathname;
    const arcParent = page.getByRole('combobox', { name: 'Parent collection for Arc A' });
    if (await arcParent.inputValue() !== volumeId)
      throw new Error('New grandchild was not attached to its requested parent');
    await arcParent.selectOption('');
    await page.waitForFunction(() => {
      const trail = document.querySelector('[aria-label="Collection hierarchy"]');
      return !!trail && !trail.textContent.includes('Volume One');
    });
    await arcParent.selectOption(volumeId);
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Collection hierarchy"]')?.textContent.includes('Volume One'));
    await page.reload({ waitUntil: 'networkidle' });
    if (new URL(page.url()).pathname !== arcUrl ||
        !(await page.getByRole('navigation', { name: 'Collection hierarchy' }).getByText('Volume One').count())) {
      throw new Error('Nested collection path did not survive a reload');
    }
    await page.getByRole('navigation', { name: 'Collection hierarchy' })
      .getByRole('link', { name: 'Example Series' }).click();
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).waitFor();
    // Add the novel to a nested collection as well, without removing its parent membership.
    await page.getByRole('combobox', { name: 'Add Sample Library Book to collection' })
      .selectOption({ label:'Arc A' });
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).click();
    await page.getByRole('heading', { name: 'Sample Library Book' }).waitFor();

    // The top-right membership chips must show direct membership with full nested paths.
    const membershipNav = page.getByRole('navigation', { name: 'Collections containing this novel' });
    await membershipNav.getByRole('link', { name: 'Open collection Example Series', exact:true }).waitFor();
    const nestedMembership = membershipNav.getByRole('link', {
      name: 'Open collection Example Series / Volume One / Arc A',
    });
    await nestedMembership.waitFor();
    if (await nestedMembership.getAttribute('href') !== arcUrl) {
      throw new Error('Nested membership does not target its stable collection URL');
    }
    const membershipLayout = await page.locator('.details-hero').evaluate(hero => {
      const badge = hero.querySelector('.details-hero-memberships')?.getBoundingClientRect();
      const heading = hero.querySelector('.details-hero-heading')?.getBoundingClientRect();
      const cover = hero.querySelector('.details-cover-wrap')?.getBoundingClientRect();
      const bounds = hero.getBoundingClientRect();
      const overlaps = (a,b) => !!a && !!b && a.left < b.right - 1 && a.right > b.left + 1 &&
        a.top < b.bottom - 1 && a.bottom > b.top + 1;
      return {
        visible:!!badge && badge.width > 0 && badge.height > 0,
        inside:!!badge && badge.left >= bounds.left && badge.right <= bounds.right + 1,
        rightAligned:!!badge && badge.right >= bounds.right - 95,
        titleClear:!overlaps(badge,heading),
        coverClear:!overlaps(badge,cover),
      };
    });
    if (Object.values(membershipLayout).some(value => !value)) {
      throw new Error('Collection chips are not visible at top-right or overlap the hero: '
        + JSON.stringify(membershipLayout));
    }
    // Collection links remain functional without fetching a new catalogue.
    await nestedMembership.click();
    await page.waitForURL('**' + arcUrl);
    await page.getByRole('link', { name: 'View details for Sample Library Book' }).click();
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
    if (viewport.width <= 700) await page.getByRole('link', { name: 'Start reading' }).hover();
    else await page.getByRole('link', { name: 'Begin this novel' }).hover();
    const heroAction = await page.locator(viewport.width <= 700 ? '.details-start' : '.details-resume').evaluate(el => ({
      background:getComputedStyle(el).backgroundColor,
      ink:getComputedStyle(el).color,
    }));
    if (heroAction.background === 'rgb(35, 65, 47)' || heroAction.background === heroAction.ink) {
      throw new Error('Reading action retains old green or has illegible hover contrast');
    }
    await page.getByRole('link', { name: 'Start reading' }).click();
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
    if (viewport.width <= 700) {
      const layout = await page.locator('.reader-header').evaluate(header => {
        const title = header.querySelector('.reader-head-center')?.getBoundingClientRect();
        const elements = Array.from(header.querySelectorAll(
          '.reader-head-left button:not([hidden]), .quick-nav-mobile summary, .reader-head-right button:not([hidden])'
        )).filter(el => getComputedStyle(el).display !== 'none' &&
          getComputedStyle(el).visibility !== 'hidden');
        const boxes = elements.map(el => el.getBoundingClientRect());
        const collision = boxes.some((a,i) => boxes.slice(i+1).some(b =>
          a.left < b.right - 1 && a.right > b.left + 1 &&
          a.top < b.bottom - 1 && a.bottom > b.top + 1));
        return {
          titleBelow:!!title && boxes.every(b => title.top >= b.bottom - 2),
          collision, visibleTitle:!!title && title.width > 80,
          inside:boxes.every(b => b.left >= -1 && b.right <= window.innerWidth + 1),
        };
      });
      if (!layout.titleBelow || layout.collision || !layout.visibleTitle || !layout.inside) {
        throw new Error('Reader mobile header controls collide with the title: ' + JSON.stringify(layout));
      }
      const menuToggle = page.locator('.reader-header .quick-nav-mobile summary');
      await menuToggle.click();
      const libraryMenu = page.getByRole('group', { name:'Library shortcuts' });
      await libraryMenu.waitFor({ state:'visible' });
      await libraryMenu.getByRole('link', { name:'Currently reading' }).waitFor();
      const menuGeometry = await libraryMenu.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const firstLink = element.querySelector('a')?.getBoundingClientRect();
        return { inside:rect.left >= -1 && rect.right <= window.innerWidth + 1,
          textInside:!!firstLink && firstLink.left >= rect.left && firstLink.right <= rect.right,
          width:rect.width };
      });
      if (!menuGeometry.inside || !menuGeometry.textInside || menuGeometry.width < 180) {
        throw new Error('Reader library menu is clipped off the mobile screen: '
          + JSON.stringify(menuGeometry));
      }
      await menuToggle.click();
      // The bottom chapter chooser replaces the duplicate top TOC button.
      if (await page.getByRole('button', { name:'Table of contents' }).isVisible()) {
        throw new Error('Mobile header still has duplicate chapter navigation');
      }
    }
    await page.getByRole('button', { name:'Reading preferences' }).click();
    const fontSelect = page.locator('#font-family-select');
    if (await fontSelect.inputValue() !== wantedFont ||
        !(await page.locator('.font-stepper span').innerText()).includes(String(wantedSize))) {
      throw new Error('Reader preferences do not match the responsive default font');
    }
    await page.locator('.reader-panel .panel-header').getByRole('button', { name:'Close panel' }).click();

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
    if (viewport.width <= 700) {
      const geometry = await chapterDialog.evaluate(dialog => {
        const list = dialog.querySelector('.reader-chapter-picker-list')?.getBoundingClientRect();
        const bounds = dialog.getBoundingClientRect();
        return { listHeight:list?.height ?? 0, dialogHeight:bounds.height,
          inside:bounds.left >= -1 && bounds.right <= window.innerWidth + 1,
          title:dialog.querySelector('h2')?.textContent?.trim(),
        };
      });
      if (!geometry.inside || geometry.title !== 'Chapter navigation' ||
          geometry.listHeight < geometry.dialogHeight * .55) {
        throw new Error('Mobile chapter list does not dominate the chooser: ' +
          JSON.stringify(geometry));
      }
    }
    const numericSearch = chapterDialog.getByRole('searchbox', { name: 'Search chapter number' });
    await numericSearch.fill('2');
    await chapterDialog.getByRole('button', { name: /Chapter 2: The Next Step/ }).waitFor();
    if (await chapterDialog.getByRole('button', { name: /Chapter 1/ }).count()) {
      throw new Error('Number-only chapter search must exclude other chapters');
    }
    // Enter and clicking a result both navigate, without a second Go field.
    if (await chapterDialog.locator('input').count() !== 1 ||
        await chapterDialog.getByRole('button', { name:'Go', exact:true }).count()) {
      throw new Error('The chapter picker still has redundant search/Go controls');
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
    await numericSearch.press('Enter');
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
    await page.getByRole('dialog', { name: 'Choose chapter' })
      .getByRole('searchbox', { name:'Search chapter number' }).fill('1');
    await page.getByRole('dialog', { name: 'Choose chapter' })
      .getByRole('button', { name:/Chapter 1/ }).click();
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
    await page.getByRole('link', { name: /^(Start reading|Continue reading)$/ }).click();
    if (viewport.width <= 700) {
      await page.locator('.reader-header .quick-nav-mobile summary').click();
      await page.getByRole('group', { name:'Library shortcuts' })
        .getByRole('link', { name:'Home', exact:true }).click();
    } else {
      await page.getByRole('button', { name: 'Go to library home' }).click();
    }
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
      await page.getByRole('link', { name: 'View details for Sample Library Book' }).click();
      await page.getByRole('link', { name: /^(Start|Continue) reading$/ }).click();
      await page.locator('.reader-page iframe').first().waitFor({ state: 'visible', timeout: 20000 });
      if (viewport.width <= 700) {
        await page.locator('.reader-header .quick-nav-mobile summary').click();
        await page.getByRole('group', { name:'Library shortcuts' })
          .getByRole('link', { name:'Home', exact:true }).click();
      } else {
        await page.getByRole('button', { name: 'Go to library home' }).click();
      }
      await page.locator('nav[aria-label="Library sections"]').waitFor({ state: 'attached' });
      await (viewport.width <= 700
        ? page.locator('.mobile-shelf-nav').getByRole('link', { name: 'Offline' })
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
          await freshPage.locator('.mobile-shelf-nav a.selected').getByText('Offline').waitFor();
        } else {
          await freshPage.locator('.top-nav-link.active').getByText('Available offline').waitFor();
        }
        await freshPage.getByRole('link', { name: 'View details for Sample Library Book' }).click();
        await freshPage.getByRole('link', { name: /^(Start|Continue) reading$/ }).click();
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
        await fastPage.getByRole('link', { name: 'View details for Cloud Metadata Only' }).click();
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
        const heroFallback = await fastPage.locator('.details-hero').evaluate(el => ({
          image:getComputedStyle(el).backgroundImage,
          colour:getComputedStyle(el).backgroundColor,
        }));
        if (!heroFallback.image.includes('radial-gradient') ||
            !(await fastPage.locator('.details-cover-wrap .cover-generated-artwork').count()) ||
            !(await fastPage.locator('.details-hero-backdrop').count())) {
          throw new Error('Metadata-only novels need generated jackets and atmospheric backdrops: '+JSON.stringify(heroFallback));
        }
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
        await fastPage.getByRole('link', { name:'View details for Long Cultivation: My Augmented Statuses Have Unlimited Duration' }).waitFor();
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
        // Fixed desktop column counts replace cramped auto-fill. Exercise the
        // actual compiled stylesheet at wide desktop, laptop, tablet and phone.
        for (const { width, columns } of [
          { width:1828, columns:6 },
          { width:1366, columns:5 },
          { width:1024, columns:4 },
          { width:800, columns:3 },
          { width:390, columns:2 },
        ]) {
          await fastPage.setViewportSize({ width, height:900 });
          const layout = await fastPage.locator('.book-grid').evaluate(grid => {
            const style = getComputedStyle(grid);
            const tracks = style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
            const rect = grid.getBoundingClientRect();
            const firstCover = grid.querySelector('.book-tile .cover-button > .cover')?.getBoundingClientRect();
            return {
              columns:tracks.length,
              gap:parseFloat(style.columnGap),
              width:rect.width,
              viewport:window.innerWidth,
              coverRatio:firstCover ? firstCover.width/firstCover.height : null,
              maxWidth:parseFloat(style.maxWidth),
            };
          });
          if (layout.columns !== columns ||
              (width > 700 && (layout.gap < 21 || layout.width > 1761)) ||
              (layout.coverRatio !== null && Math.abs(layout.coverRatio - 2/3) > 0.025)) {
            throw new Error('Responsive catalogue grid regressed at ' + width + ': ' + JSON.stringify(layout));
          }
        }
        await fastPage.setViewportSize(viewport);

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
        // Cloud icon without altering stored theme preferences.
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
        const cloudButton=adminPage.getByRole('button',{name:/Cloud settings, (connected|disconnected)/});
        const contrast=await cloudButton.evaluate(el=>{
          const foreground=getComputedStyle(el).color;
          const background=getComputedStyle(document.querySelector('.topbar')).backgroundColor;
          const rgb=c=>(c.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
          const luminance=c=>rgb(c).map(x=>{
            const v=x/255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
          }).reduce((t,x,n)=>t+x*[.2126,.7152,.0722][n],0);
          const a=luminance(foreground),b=luminance(background);
          return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        });
        if(contrast<4.5)throw new Error('Plum cloud icon contrast failed: '+contrast.toFixed(2)+':1');
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
