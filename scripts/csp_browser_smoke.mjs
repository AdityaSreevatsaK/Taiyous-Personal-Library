// Isolated CSP smoke: the complete offline, responsive and reader journeys run
// independently in browser_smoke.mjs against the production Vite build.
import { chromium } from 'playwright';
import JSZip from 'jszip';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:8791';
const zip = new JSZip();
zip.file('mimetype', 'application/epub+zip', { compression:'STORE' });
zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:taiyou:csp:fixture</dc:identifier><dc:title>CSP Test Novel</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file('OEBPS/nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li></ol></nav></body></html>');
zip.file('OEBPS/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter 1</h1><p>Original CSP-protected offline EPUB test content.</p></body></html>');
const bytes = Array.from(await zip.generateAsync({ type:'uint8array', compression:'DEFLATE' }));
const browser = await chromium.launch({headless:true});
try {
  for (const viewport of [{width:1366,height:768},{width:390,height:844}]) {
    const context = await browser.newContext({viewport,serviceWorkers:'block'});
    // Simulated unauthenticated private API, without any production dataset or token.
    await context.route('**/api/library?**', route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({connected:false}),
    }));
    await context.route('**/api/owner?**', route => route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({configured:false,unlocked:false}),
    }));
    // No novel hero image should trigger a third-party stock photo request.
    await context.route('https://images.unsplash.com/**', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push('JavaScript: '+error.message));
    page.on('console', message => {
      if (message.type()==='error' && /content security policy|refused to load|violates the following|unsafe-eval/i.test(message.text())) {
        errors.push('CSP: '+message.text());
      }
    });
    const response = await page.goto(base+'/', {waitUntil:'domcontentloaded',timeout:35000});
    if (!response?.ok()) throw new Error('CSP app returned HTTP '+response?.status());
    const policy = response.headers()['content-security-policy'] || '';
    if (!policy.includes("script-src 'self'") || !policy.includes("object-src 'none'") ||
        policy.includes("'unsafe-eval'") ||
        !policy.includes("img-src 'self' blob: data:") ||
        policy.includes('images.unsplash.com')) {
      throw new Error('CSP header must restrict cover images to safe local sources');
    }
    await page.locator('.app-shell').waitFor({state:'visible',timeout:12000});
    await page.locator('nav[aria-label="Library sections"]').waitFor();
    // Inject a synthetic novel into browser IndexedDB, not private HF storage.
    await page.evaluate(async epubData => {
      const request=indexedDB.open('folio-personal-library-v1',3);
      const db=await new Promise((resolve,reject)=>{
        request.onupgradeneeded=()=>{const d=request.result;
          for(const store of ['books','files','covers'])
            if(!d.objectStoreNames.contains(store))d.createObjectStore(store,{keyPath:'id'});};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      // A synthetic JPEG fixture stays in this browser's IndexedDB. The real
      // application only uses the artwork saved for the corresponding novel.
      const canvas=document.createElement('canvas');
      canvas.width=80;canvas.height=120;
      const ctx=canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable for cover fixture');
      ctx.fillStyle='#405b8d';ctx.fillRect(0,0,80,120);
      ctx.fillStyle='#d1b278';ctx.fillRect(12,18,56,84);
      const jpeg=await new Promise((resolve,reject)=>
        canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error('JPEG fixture failed')),
          'image/jpeg',.9));
      const tx=db.transaction(['books','files','covers'],'readwrite');
      tx.objectStore('books').put({id:'abababababababababababab',title:'CSP Test Novel',
        author:'Synthetic Author',originalFileName:'test.epub',importedAt:Date.now(),
        progress:0,size:epubData.length,metadataScanned:true,sourceTags:['Fantasy'],
        coverPath:'data/novels/abababababababababababab/cover.jpg'});
      tx.objectStore('covers').put({id:'abababababababababababab',jpeg});
      tx.objectStore('files').put({id:'abababababababababababab',
        epub:new Blob([new Uint8Array(epubData)],{type:'application/epub+zip'})});
      await new Promise((resolve,reject)=>{
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      db.close();
    }, bytes);
    await page.goto(base+'/library',{waitUntil:'domcontentloaded',timeout:35000});
    await page.getByRole('button',{name:'View details for CSP Test Novel'}).waitFor({timeout:15000});
    await page.getByRole('button',{name:'View details for CSP Test Novel'}).click();
    await page.getByRole('heading',{name:'CSP Test Novel'}).waitFor();
    await page.locator('.details-hero-cover-backdrop').waitFor({state:'visible'});
    await page.waitForFunction(() => {
      const img=document.querySelector('.details-hero-cover-backdrop');
      return Boolean(img?.complete && img.naturalWidth > 0 &&
        img.src.startsWith('blob:') &&
        getComputedStyle(img).filter.includes('blur') &&
        img.parentElement?.classList.contains('cover-backdrop-ready'));
    }, null, {timeout:12000});
    if (await page.locator('.details-hero-cover-backdrop').count() !== 1) {
      throw new Error('The novel hero must use exactly its own cached cover');
    }
    await page.getByRole('button',{name:/^(Start reading|Continue reading)$/}).click();
    await page.locator('.reader-page iframe').first().waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(() => {
      const frame=document.querySelector('.reader-page iframe');
      return Boolean(frame?.contentDocument?.body?.innerText?.includes('Chapter 1'));
    }, {timeout:20000});
    if(errors.length)throw new Error(errors.join(' | '));
    await context.close();
    console.log('CSP browser and real EPUB iframe passed at '+viewport.width+'x'+viewport.height);
  }
}finally{await browser.close();}
