// Adversarial browser regression: untrusted EPUB XHTML must not execute script
// or inline event handlers. Uses a synthetic browser-only book, never private data.
import { chromium } from 'playwright';
import JSZip from 'jszip';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:8791';
const id = 'edededededededededededed';
const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
zip.file('META-INF/container.xml',
  '<?xml version="1.0"?><container version="1.0" '+
  'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'+
  '<rootfiles><rootfile full-path="OEBPS/content.opf" '+
  'media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file('OEBPS/content.opf',
  '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" '+
  'version="3.0" unique-identifier="uid"><metadata '+
  'xmlns:dc="http://purl.org/dc/elements/1.1/">'+
  '<dc:identifier id="uid">urn:taiyou:security:fixture</dc:identifier>'+
  '<dc:title>EPUB Security Fixture</dc:title><dc:language>en</dc:language>'+
  '</metadata><manifest><item id="chapter" href="chapter.xhtml" '+
  'media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" '+
  'media-type="application/xhtml+xml" properties="nav"/></manifest>'+
  '<spine><itemref idref="chapter"/></spine></package>');
zip.file('OEBPS/nav.xhtml',
  '<html xmlns="http://www.w3.org/1999/xhtml" '+
  'xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc">'+
  '<ol><li><a href="chapter.xhtml">Chapter 1</a></li></ol></nav></body></html>');
zip.file('OEBPS/chapter.xhtml',
  '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+
  '<title>Security fixture</title></head><body>'+
  '<h2>Chapter 1</h2><p>Safe chapter text remains readable.</p>'+
  '<script>document.documentElement.setAttribute("data-injected-script","yes")</script>'+
  '<img src="data:image/png;base64,invalid" '+
  'onerror="document.documentElement.setAttribute(&quot;data-injected-event&quot;,&quot;yes&quot;)" />'+
  '</body></html>');
const epubData = Array.from(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
const browser = await chromium.launch({headless:true});
try {
  for (const viewport of [{width:1366,height:768},{width:390,height:844}]) {
    const context = await browser.newContext({viewport,serviceWorkers:'block'});
    await context.route('**/api/library?**', route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({connected:false}),
    }));
    await context.route('**/api/owner?**', route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({configured:false,unlocked:false}),
    }));
    const page = await context.newPage();
    const response = await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:35000});
    if (!response?.ok()) throw new Error('EPUB safety app did not load');
    await page.locator('.app-shell').waitFor();
    await page.evaluate(async ({id,epubData}) => {
      const request=indexedDB.open('folio-personal-library-v1',3);
      const db=await new Promise((resolve,reject)=>{
        request.onupgradeneeded=()=>{
          const database=request.result;
          for(const name of ['books','files','covers']) {
            if(!database.objectStoreNames.contains(name))
              database.createObjectStore(name,{keyPath:'id'});
          }
        };
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      const tx=db.transaction(['books','files'],'readwrite');
      tx.objectStore('books').put({
        id,title:'EPUB Security Fixture',author:'Fixture Author',
        originalFileName:'security.epub',importedAt:Date.now(),
        progress:0,size:epubData.length,metadataScanned:true,sourceTags:['Safety'],
      });
      tx.objectStore('files').put({
        id,epub:new Blob([new Uint8Array(epubData)],{type:'application/epub+zip'}),
      });
      await new Promise((resolve,reject)=>{
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      db.close();
    },{id,epubData});
    await page.goto(base+'/library',{waitUntil:'domcontentloaded',timeout:35000});
    await page.getByRole('button',{name:'View details for EPUB Security Fixture'})
      .click({timeout:15000});
    await page.getByRole('heading',{name:'EPUB Security Fixture'}).waitFor();
    await page.getByRole('button',{name:/^(Start reading|Continue reading)$/}).click();
    await page.waitForFunction(() => {
      const frame=document.querySelector('.reader-page iframe');
      return Boolean(frame?.contentDocument?.body?.textContent
        ?.includes('Safe chapter text remains readable.'));
    },null,{timeout:20000});
    await page.waitForTimeout(300);
    const safety=await page.evaluate(() => {
      const frame=document.querySelector('.reader-page iframe');
      const doc=frame?.contentDocument;
      return {
        sandbox:frame?.getAttribute('sandbox'),
        loaded:doc?.body?.textContent?.includes('Safe chapter text remains readable.'),
        script:doc?.documentElement?.getAttribute('data-injected-script'),
        handler:doc?.documentElement?.getAttribute('data-injected-event'),
      };
    });
    if (!safety.loaded || safety.sandbox===null ||
        safety.sandbox?.split(/\s+/).includes('allow-scripts') ||
        safety.script || safety.handler) {
      throw new Error('Untrusted EPUB executed active content or lost sandbox: '+
        JSON.stringify(safety));
    }
    await context.close();
    console.log('EPUB inline-script/event-handler blocked at '+viewport.width+'px');
  }
} finally {
  await browser.close();
}
