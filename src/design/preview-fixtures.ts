import JSZip from 'jszip';
import { getBooks, saveBook } from '../lib/storage';
import type { LibraryBook } from '../types';

/** Fictional books and original sample chapters. No copyrighted novel text,
 * personal catalogue data, API token or hosted Hugging Face file is used.
 * Only included in a VITE_DESIGN_PREVIEW=true build. */
export const PREVIEW_BOOKS = [
  { id: '110000000000000000000001', title: 'The Jade Ascendant',
    author: 'Taiyou Studio · Fictional', tags: ['Cultivation', 'Xianxia'],
    description: 'A gifted but stubborn apprentice searches for a forgotten path to immortality.',
    progress: 46, rating: 9 },
  { id: '220000000000000000000002', title: 'The Ninefold Path',
    author: 'Taiyou Studio · Fictional', tags: ['Progression', 'Martial Arts'],
    description: 'Nine realms, nine impossible trials and an ordinary disciple who refuses to yield.',
    progress: 72, rating: 8 },
  { id: '330000000000000000000003', title: 'The Spirit Beast Chronicle',
    author: 'Taiyou Studio · Fictional', tags: ['Cultivation', 'Spirit Beasts'],
    description: 'An overlooked spirit-keeper and a mysterious scroll form an unlikely partnership.',
    progress: 18, rating: 8 },
  { id: '440000000000000000000004', title: 'A Thousand Years of Spring',
    author: 'Taiyou Studio · Fictional', tags: ['Romance', 'Fantasy'],
    description: 'Across centuries, two travellers leave messages in the same enchanted pavilion.',
    progress: 0, rating: undefined },
  { id: '550000000000000000000005', title: 'The Immortal Archivist',
    author: 'Taiyou Studio · Fictional', tags: ['Mystery', 'Xianxia'],
    description: 'Every forgotten scripture holds a secret, and some were hidden for good reason.',
    progress: 0, rating: undefined, trying: true },
  { id: '660000000000000000000006', title: 'Sword of the First Dawn',
    author: 'Taiyou Studio · Fictional', tags: ['Action', 'Cultivation'],
    description: 'On the morning of an ancient tournament, a swordsman inherits a broken blade.',
    progress: 0, rating: undefined, trying: true },
  { id: '770000000000000000000007', title: 'The Lotus and the Moon',
    author: 'Taiyou Studio · Fictional', tags: ['Romance', 'Xuanhuan'],
    description: 'The guardian of a moonlit garden must choose between duty and the wider world.',
    progress: 0, rating: undefined },
  { id: '880000000000000000000008', title: 'Embers of Eternity',
    author: 'Taiyou Studio · Fictional', tags: ['Fantasy', 'Progression'],
    description: 'A young alchemist discovers that even a dying spark can ignite a new age.',
    progress: 0, rating: undefined },
] as const;

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const chapterNames = [
  'The First Horizon', 'An Unwritten Promise',
  'The Valley Beyond the Clouds', 'A Path Forward',
] as const;

async function sampleEpub(title: string, author: string, id: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml',
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');

  const items = chapterNames.map((_, index) =>
    '<item id="chapter' + index + '" href="chapter' + (index + 1) +
    '.xhtml" media-type="application/xhtml+xml"/>').join('');
  const spine = chapterNames.map((_, index) =>
    '<itemref idref="chapter' + index + '"/>').join('');
  zip.file('OEBPS/content.opf',
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<package version="3.0" unique-identifier="bookid" xmlns="http://www.idpf.org/2007/opf">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:identifier id="bookid">urn:taiyou:fictional-preview:' + id + '</dc:identifier>' +
    '<dc:title>' + xml(title) + '</dc:title>' +
    '<dc:creator>' + xml(author) + '</dc:creator><dc:language>en</dc:language></metadata>' +
    '<manifest><item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
    items + '</manifest><spine>' + spine + '</spine></package>');

  zip.file('OEBPS/nav.xhtml',
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    '<head><title>Contents</title></head><body><nav epub:type="toc"><ol>' +
    chapterNames.map((name, index) =>
      '<li><a href="chapter' + (index + 1) + '.xhtml">Chapter ' +
      (index + 1) + ': ' + xml(name) + '</a></li>').join('') +
    '</ol></nav></body></html>');

  const originals = [
    'A cool breeze crossed the hillside. Below, the morning sun touched the distant rooftops, and an unfamiliar road stretched towards the mountains.',
    'He had spent years learning to recognise the smallest signs of change. Today, for the first time, the whole valley seemed to be waiting for him.',
    'A single page fluttered in his hand. It contained no promise of easy power, only a quiet instruction: begin again, and this time pay attention.',
    'Beyond the ancient bridge, the shadows of the cedars grew long. He gathered his thoughts and continued towards the place where the next chapter of his journey would begin.',
    'There was no shortcut through the old forest. Every milestone had to be reached, every lesson understood, and every friendship earned.',
    'As evening approached, lights appeared along the river. Somewhere ahead waited a new question, and perhaps the answer to one he had carried for years.',
  ];
  for (let chapter = 0; chapter < chapterNames.length; chapter++) {
    const paragraphs = Array.from({ length: 42 }, (_, index) =>
      '<p>' + originals[(index + chapter) % originals.length] + '</p>').join('');
    zip.file('OEBPS/chapter' + (chapter + 1) + '.xhtml',
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>' +
      xml(chapterNames[chapter]) + '</title></head><body><h2>Chapter ' + (chapter + 1) +
      ': ' + xml(chapterNames[chapter]) + '</h2>' + paragraphs + '</body></html>');
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes], { type: 'application/epub+zip' });
}

let seeding: Promise<void> | null = null;

/** Populate only a fresh, isolated preview origin; never replace local books.
 * React StrictMode can mount effects twice, hence the single-flight guard. */
export function seedPreviewBooks(): Promise<void> {
  if (import.meta.env.VITE_DESIGN_PREVIEW !== 'true') return Promise.resolve();
  if (!seeding) {
    seeding = (async () => {
      if ((await getBooks()).length) return;
      const now = Date.now();
      for (const [index, sample] of PREVIEW_BOOKS.entries()) {
        const epub = await sampleEpub(sample.title, sample.author, sample.id);
        const reading = sample.progress > 0;
        const metadata: LibraryBook = {
          id: sample.id, title: sample.title, author: sample.author,
          description: sample.description +
            ' This is fictional demonstration content for the isolated design preview.',
          sourceTags: [...sample.tags, 'Design sample'],
          language: 'en', chapterCount: chapterNames.length,
          originalFileName: 'taiyou-demo-' + (index + 1) + '.epub',
          importedAt: now - index * 86400_000,
          lastOpenedAt: reading ? now - index * 86400_000 : undefined,
          progress: sample.progress,
          currentChapter: reading ? 'Chapter 2: An Unwritten Promise' : undefined,
          currentChapterIndex: reading ? 1 : undefined,
          currentChapterNumber: reading ? 2 : undefined,
          metadataScanned: true,
          personalRating: sample.rating,
          shelfStatus: 'trying' in sample && sample.trying ? 'trying' : undefined,
          size: epub.size,
        };
        await saveBook(metadata, epub);
      }
    })().catch(error => { seeding = null; throw error; });
  }
  return seeding;
}
