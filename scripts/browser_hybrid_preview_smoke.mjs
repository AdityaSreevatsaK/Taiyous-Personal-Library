// Interactive preview of the REAL hybrid layout with fictional local EPUBs only.
import { chromium } from 'playwright';

const baseUrl = process.env.SMOKE_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const badRequests = [];
    page.on('request', request => {
      if (/huggingface\.co|\/(?:api\/oauth|api\/library)/i.test(request.url())) badRequests.push(request.url().split('?')[0]);
    });
    const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response?.ok()) throw new Error('Preview did not return HTTP 200');
    await page.locator('.hybrid-demo-notice').waitFor({ state: 'visible' });
    await page.locator('.editorial-grand').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('.editorial-journal').waitFor({ state: 'visible' });
    await page.locator('.editorial-index-row').first().waitFor();
    await page.getByRole('button', { name: 'Featured cover for The Jade Ascendant' }).waitFor();
    if (await page.locator('.topbar>.cloud-connect').isVisible()) {
      throw new Error('Private cloud sign-in must be hidden in preview');
    }
    await page.getByRole('button', { name: 'Featured cover for The Jade Ascendant' }).click();
    await page.waitForURL('**/novels/the-jade-ascendant', { timeout: 15000 });
    await page.locator('.details-hero h1').getByText('The Jade Ascendant').waitFor();
    if (badRequests.length) throw new Error('Fictional preview contacted a real private API: ' + badRequests.join(', '));
    console.log('Private-data-free preview passed at ' + viewport.width + 'x' + viewport.height);
    await context.close();
  }
} finally {
  await browser.close();
}
