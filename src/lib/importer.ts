import JSZip from 'jszip';
import type { ImportedBook } from '../types';
import { normalizeTags } from './tags';

const MAX_INPUT_BYTES = 120 * 1024 * 1024;
const MAX_EPUB_BYTES = 120 * 1024 * 1024;

interface NovelZipMetadata {
  title?: unknown; author?: unknown; language?: unknown; chapter_count?: unknown;
  summary?: unknown; synopsis?: unknown; description?: unknown;
  tags?: unknown; genres?: unknown; genre?: unknown; categories?: unknown; keywords?: unknown;
  status?: unknown; source_url?: unknown;
}

export interface ExtractedMetadata {
  title?: string;
  author?: string;
  language?: string;
  description?: string;
  sourceTags: string[];
  status?: string;
  sourceUrl?: string;
  chapterCount?: number;
}

function textFromName(fileName: string): string {
  return fileName.split('/').pop()!.replace(/\.(epub|zip)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function localElements(xml: Document, localName: string): Element[] {
  return Array.from(xml.getElementsByTagName('*')).filter((element) => element.localName === localName);
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The EPUB metadata XML is invalid.');
  return doc;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function summaryText(value: unknown): string | undefined {
  const input = stringValue(value);
  if (!input) return undefined;
  const doc = new DOMParser().parseFromString(input, 'text/html');
  doc.body.querySelectorAll('script, style').forEach((element) => element.remove());
  doc.body.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  doc.body.querySelectorAll('p, div, li').forEach((element) => element.append('\n'));
  const text = (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  return text ? text.slice(0, 24000) : undefined;
}

function safeSourceUrl(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  try {
    const address = new URL(text);
    return (address.protocol === 'https:' || address.protocol === 'http:') ? address.href : undefined;
  } catch { return undefined; }
}

function extractedGenreList(values: unknown[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) result.push(...extractedGenreList(value));
    else if (typeof value === 'string') {
      for (const label of normalizeTags(value)) {
        // FanFicFare adds subjects such as Last Update and Completed. They're
        // not genres and shouldn't appear in the tag filter.
        if (!/^(last update|updated|completed|complete|ongoing|in progress|status:|language:)/i.test(label)) result.push(label);
      }
    }
  }
  return normalizeTags(result);
}

export async function extractEpubMetadata(blob: Blob | ArrayBuffer | Uint8Array): Promise<ExtractedMetadata> {
  const bytes = blob instanceof Blob ? await blob.arrayBuffer() : blob;
  const archive = await JSZip.loadAsync(bytes);
  if (!archive.file('mimetype') || !archive.file('META-INF/container.xml')) {
    throw new Error('This file is not a valid EPUB archive (missing required metadata).');
  }
  const container = parseXml(await archive.file('META-INF/container.xml')!.async('text'));
  const rootfile = localElements(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!rootfile) throw new Error('This EPUB is missing its package manifest.');
  const manifest = archive.file(rootfile);
  if (!manifest) throw new Error('This EPUB has an invalid package manifest path.');
  const opf = parseXml(await manifest.async('text'));
  const metadata = localElements(opf, 'metadata')[0];
  if (!metadata) throw new Error('This EPUB has no metadata section.');
  const all = (name: string) => Array.from(metadata.getElementsByTagName('*'))
    .filter((el) => el.localName === name).map((el) => el.textContent?.trim()).filter((s): s is string => !!s);
  const first = (name: string) => all(name)[0];
  const subjects = all('subject');
  const status = subjects.find((label) => /^(completed|complete|ongoing|in progress)$/i.test(label));
  // FanFicFare EPUBs include the exact chapter count in their title page,
  // while their OPF spine also contains a separate title-page item.
  const frontPage = Object.values(archive.files).find((entry) =>
    !entry.dir && /(^|\/)(title[_-]?page|titlepage)\.x?html$/i.test(entry.name));
  let titlePageCount: number | undefined;
  if (frontPage) {
    try {
      const text = await frontPage.async('text');
      const document = new DOMParser().parseFromString(text, 'application/xml');
      const match = document.documentElement?.textContent?.match(/Chapters?\s*:\s*([\d,]+)/i);
      const count = Number(match?.[1]?.replace(/,/g, ''));
      if (Number.isInteger(count) && count > 0 && count < 100000) titlePageCount = count;
    } catch { /* supplementary information only */ }
  }
  const spine = localElements(opf, 'spine')[0];
  const itemRefs = spine ? Array.from(spine.getElementsByTagName('*')).filter((el) => el.localName === 'itemref') : [];
  const manifestElement = localElements(opf, 'manifest')[0];
  const items = manifestElement ? Array.from(manifestElement.getElementsByTagName('*'))
    .filter((el) => el.localName === 'item') : [];
  const hrefById = new Map(items.map((el) => [el.getAttribute('id'), el.getAttribute('href') || '']));
  const spineHrefs = itemRefs.map((el) => hrefById.get(el.getAttribute('idref')) || '');
  let firstChapterIndex = 0;
  while (firstChapterIndex < spineHrefs.length - 1 &&
    /(^|\/)(title[_-]?page|titlepage|cover|toc|contents)\.x?html$/i.test(spineHrefs[firstChapterIndex])) {
    firstChapterIndex++;
  }
  const inferredChapterCount = Math.max(0, spineHrefs.length - firstChapterIndex);
  return {
    title: first('title'), author: first('creator'), language: first('language'),
    description: summaryText(first('description')),
    sourceTags: extractedGenreList(subjects),
    status: status ? (/^complete/i.test(status) ? 'Completed' : 'Ongoing') : undefined,
    sourceUrl: safeSourceUrl(first('source')),
    chapterCount: titlePageCount || inferredChapterCount || undefined,
  };
}

export async function prepareImport(file: File): Promise<ImportedBook> {
  if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name}: file exceeds the 120 MB limit.`);
  const lower = file.name.toLowerCase();
  let bytes: Uint8Array;
  let manifestMetadata: NovelZipMetadata = {};
  let chapterCount: number | undefined;
  if (lower.endsWith('.zip')) {
    const archive = await JSZip.loadAsync(await file.arrayBuffer());
    const source = Object.values(archive.files).find((entry) => !entry.dir && /(^|\/)source\.epub$/i.test(entry.name));
    if (!source) throw new Error(`${file.name}: no source.epub found. Import an EPUB or a novel ZIP containing source.epub.`);
    const metadataEntry = Object.values(archive.files).find((entry) => !entry.dir && /(^|\/)metadata\.json$/i.test(entry.name));
    if (metadataEntry) {
      try { manifestMetadata = JSON.parse(await metadataEntry.async('text')) as NovelZipMetadata; }
      catch { /* EPUB metadata remains the fallback */ }
    }
    const chaptersEntry = Object.values(archive.files).find((entry) => !entry.dir && /(^|\/)chapters\.json$/i.test(entry.name));
    if (chaptersEntry) {
      try {
        const chapterList: unknown = JSON.parse(await chaptersEntry.async('text'));
        if (Array.isArray(chapterList)) chapterCount = chapterList.length;
      } catch { /* optional metadata */ }
    }
    bytes = await source.async('uint8array');
  } else if (lower.endsWith('.epub')) {
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    throw new Error(`${file.name}: please choose a .epub or a supported .zip novel archive.`);
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_EPUB_BYTES) throw new Error(`${file.name}: EPUB is empty or exceeds 120 MB.`);

  const details = await extractEpubMetadata(bytes);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const now = Date.now();
  const epub = new Blob([new Uint8Array(bytes)], { type: 'application/epub+zip' });
  const countFromManifest = Number(manifestMetadata.chapter_count);
  return {
    metadata: {
      id,
      title: stringValue(manifestMetadata.title) || details.title || textFromName(file.name),
      author: stringValue(manifestMetadata.author) || details.author || 'Unknown author',
      language: stringValue(manifestMetadata.language) || details.language,
      chapterCount: chapterCount || (Number.isInteger(countFromManifest) && countFromManifest > 0 ? countFromManifest : undefined) || details.chapterCount,
      description: summaryText(manifestMetadata.summary) || summaryText(manifestMetadata.synopsis)
        || summaryText(manifestMetadata.description) || details.description,
      sourceTags: extractedGenreList([manifestMetadata.tags, manifestMetadata.genres, manifestMetadata.genre,
        manifestMetadata.categories, manifestMetadata.keywords, details.sourceTags]),
      personalTags: [],
      status: stringValue(manifestMetadata.status) || details.status,
      sourceUrl: safeSourceUrl(manifestMetadata.source_url) || details.sourceUrl,
      metadataScanned: true,
      originalFileName: file.name,
      importedAt: now,
      progress: 0,
      size: bytes.byteLength,
    },
    epub,
  };
}
