/**
 * EPUB.js already disables scripted content in its sandboxed reader iframe.
 * This is a second, narrow defence against a reader manually following
 * active URI schemes. Do not rewrite chapter structure or text: that would
 * invalidate EPUB CFI bookmarks and is not required to disable scripts.
 */
export function unsafeEpubLink(value: string): boolean {
  // Browser URL parsers ignore embedded ASCII controls before the scheme.
  const candidate = value.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  return /^(?:javascript|vbscript|data|file):/.test(candidate);
}

export function disableActiveEpubLinks(doc: Document): void {
  for (const element of doc.querySelectorAll('a[href], area[href], svg a, form[action]')) {
    for (const attribute of ['href', 'xlink:href', 'action']) {
      const target = element.getAttribute(attribute);
      if (target !== null && unsafeEpubLink(target)) {
        element.removeAttribute(attribute);
        element.setAttribute('data-taiyou-blocked-link', '');
      }
    }
  }
}
