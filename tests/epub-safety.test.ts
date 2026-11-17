import { describe, expect, it } from 'vitest';
import { unsafeEpubLink } from '../src/lib/epub-safety';

describe('EPUB active link defences', () => {
  it('rejects script, HTML data, file and VBScript URI schemes', () => {
    for (const href of [
      'javascript:alert(1)', ' JAVASCRIPT:alert(1)',
      'java\nscript:alert(1)', '\tjava\rscript:alert(1)',
      'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
    ]) expect(unsafeEpubLink(href)).toBe(true);
  });
  it('keeps legitimate internal chapters, anchors, HTTPS and relative links', () => {
    for (const href of [
      '#chapter-3', '../chapter4.xhtml', 'chapter.xhtml#section-2',
      'https://example.org/novel', 'mailto:reader@example.org',
    ]) expect(unsafeEpubLink(href)).toBe(false);
  });
});
