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
    await page.getByRole('button', {name: 'Start reading'}).click();
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
    await context.close();
  }
} finally {
  await browser.close();
}
