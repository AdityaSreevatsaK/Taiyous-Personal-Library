import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headers = readFileSync(new URL('../scripts/standalone-headers.txt', import.meta.url), 'utf8');
const csp = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m)?.[1] || '';

describe('production Cloudflare Pages security headers', () => {
  it('restricts script execution, framing and unsafe embedding', () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    const scriptDirective = csp.split(';').find(item => item.trim().startsWith('script-src')) || '';
    expect(scriptDirective).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
  });

  it('permits only the required font provider, local book resources and HF APIs', () => {
    // epub.js injects reader CSS into EPUB iframes, so inline *styles* are
    // necessary; no inline JavaScript is permitted.
    expect(csp).toContain("style-src 'self' 'unsafe-inline' blob: https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' blob: data: https://fonts.gstatic.com");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("connect-src 'self' https://huggingface.co");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('does not allow static assets or the shell to be cached without version checks', () => {
    expect(headers).toMatch(/\/sw\.js\s+Cache-Control: no-store/);
    expect(headers).toMatch(/\/index\.html\s+Cache-Control: no-store/);
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('X-Frame-Options: DENY');
  });
});
