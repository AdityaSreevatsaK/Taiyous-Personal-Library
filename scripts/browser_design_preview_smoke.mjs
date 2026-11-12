// Browser acceptance for the exact VITE_DESIGN_PREVIEW=true production build.
// Synthetic books are seeded into this preview origin only. No private API,
// user library, credentials or Hugging Face content is involved.
import { chromium } from 'playwright';

const url = process.env.SMOKE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless: true});
try {
  for (const viewport of [{width: 1366, height: 768}, {width: 390, height: 844}]) {
    const context = await browser.newContext({viewport});
    const privateWrites = [];
    await context.route('**/api/**', route => {
      if (route.request().method() !== 'GET') privateWrites.push(route.request().url());
      return route.fulfill({status: 401, contentType: 'application/json',
        body: JSON.stringify({connected: false, error: 'Preview has no private API'})});
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});

    await page.locator('.design-preview-pill').waitFor({state: 'visible', timeout: 20000});
    if (await page.locator('.topbar > .cloud-connect').count()) {
      throw new Error('Preview exposed real Hugging Face login/Cloud connection controls');
    }
    await page.getByRole('button', {name: 'View details for The Jade Ascendant'})
      .waitFor({state: 'visible', timeout: 30000});
    if (await page.locator('.book-grid .book-tile').count() < 6) {
      throw new Error('Synthetic preview shelf failed to load sufficient books');
    }
    if (viewport.width < 900) await page.getByRole('button', {name: 'Open menu'}).click();
    const appearance = page.getByRole('group', {name: 'Appearance theme'});
    await appearance.getByRole('button', {name: 'Use Paper & Ink theme'}).click();
    if (!await page.locator('.app-shell').evaluate(node => node.classList.contains('theme-light'))) {
      throw new Error('Preview could not switch to Paper & Ink');
    }
    await appearance.getByRole('button', {name: 'Use Sepia theme'}).click();
    if (viewport.width < 900) await page.mouse.click(viewport.width - 20, 100);
    await page.getByRole('button', {name: 'View details for The Jade Ascendant'}).click();
    await page.getByRole('heading', {name: 'The Jade Ascendant'}).waitFor();
    await page.getByRole('button', {name: /Start reading|Continue reading/}).click();
    await page.locator('.reader-page iframe').first().waitFor({state: 'visible', timeout: 25000});
    const text = await page.locator('.reader-page iframe').first().evaluate(frame =>
      frame.contentDocument?.body?.textContent || '');
    if (!text.includes('A cool breeze') && !text.includes('The first light')) {
      throw new Error('Fictional EPUB chapter text is missing from the live reader');
    }
    await page.getByRole('button', {name: 'Go to library home'}).click();
    await page.getByRole('navigation', {name: 'Library sections'}).waitFor();
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByRole('button', {name: 'View details for The Jade Ascendant'}).waitFor();
    if (!await page.locator('.app-shell').evaluate(node => node.classList.contains('theme-sepia'))) {
      throw new Error('Preview Sepia preference did not persist across reload');
    }
    const count = await page.evaluate(async () => {
      const req = indexedDB.open('folio-personal-library-v1', 2);
      const db = await new Promise((resolve, reject) => {
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      const tx = db.transaction('files', 'readonly');
      const value = await new Promise((resolve, reject) => {
        const q = tx.objectStore('files').count();
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      db.close(); return value;
    });
    if (count !== 8) throw new Error('Expected eight browser-only sample EPUBs, received ' + count);
    if (privateWrites.length) throw new Error('Preview attempted a private API mutation');
    if (errors.length) throw new Error('Preview browser error: ' + errors.join(' | '));
    console.log('Design preview passed: ' + viewport.width + 'x' + viewport.height +
      ', 8 isolated EPUBs, real reader, no private API');

    // Each visual concept must be a REAL, substantially distinct React layout,
    // not the existing dashboard with an alternative colour palette.
    await page.goto(url + '/layouts#grand', {waitUntil:'domcontentloaded'});
    const labNav = page.getByRole('navigation', {name:'Design concept navigation'});
    await labNav.waitFor({state:'visible'});
    const concepts = [
      ['grand', '.grand-banner', '.grand-book-tile'],
      ['desk', '.desk-workspace', '.desk-row'],
      ['shelves', '.shelves-board', '.shelves-standing'],
      ['atlas', '.atlas-map', '.atlas-region'],
      ['journal', '.journal-masthead', '.journal-index-row'],
    ];
    for (const [id, structure, items] of concepts) {
      await labNav.locator('a[href="#' + id + '"]').click();
      await page.locator(structure).first().waitFor({state:'visible'});
      if (!await page.locator(items).count()) throw new Error('Empty layout: ' + id);
      const size = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth, viewport: window.innerWidth,
      }));
      if (size.page > size.viewport + 4) {
        throw new Error('Horizontal document overflow in ' + id + ': ' + JSON.stringify(size));
      }
      if (await page.locator('.topbar > .cloud-connect').count())
        throw new Error('Lab exposed live private data connection in ' + id);
    }
    const labTheme = page.getByRole('group', {name:'Design lab palette'});
    await labTheme.getByRole('button', {name:'Jade'}).click();
    if (!await page.locator('.layout-lab').evaluate(el=>el.getAttribute('data-theme')==='dark'))
      throw new Error('Gallery could not switch to Jade Archive');
    await labTheme.getByRole('button', {name:'Sepia'}).click();

    await labNav.locator('a[href="#grand"]').click();
    await page.locator('.grand-book-tile').first().click();
    await page.getByRole('dialog', {name:/Details for/}).waitFor();
    await page.getByRole('button', {name:'Return to collection'}).click();

    await labNav.locator('a[href="#desk"]').click();
    await page.locator('.desk-row').nth(1).click();
    await page.locator('.desk-inspector-info h2').waitFor({state:'visible'});

    await labNav.locator('a[href="#shelves"]').click();
    await page.locator('.shelves-standing').first().click();
    await page.getByRole('dialog', {name:/Selected book/}).waitFor();
    await page.getByRole('button', {name:'Return to collection'}).click();

    await labNav.locator('a[href="#atlas"]').click();
    await page.getByRole('button', {name:/Explore Immortal Peaks/}).click();
    if (await page.locator('.atlas-mosaic-card').count() !== 3)
      throw new Error('Atlas regional filtering should show three cultivation books');

    await labNav.locator('a[href="#journal"]').click();
    await page.locator('.journal-index-row').nth(4).click();
    await page.getByRole('heading', {name:'The Immortal Archivist'}).waitFor();
    await page.locator('.journal-actions .lab-action').click();
    await page.locator('.reader-shell').waitFor({state:'visible', timeout:30000});
    if (privateWrites.length) throw new Error('Layout lab attempted a private API mutation');
    if (errors.length) throw new Error('Layout lab browser exceptions: ' + errors.join(' | '));
    console.log('Five-layout gallery passed: ' + viewport.width + 'x' + viewport.height +
      ', all concept structures, filters, novel details and EPUB reader');

    await context.close();
  }
} finally {
  await browser.close();
}
