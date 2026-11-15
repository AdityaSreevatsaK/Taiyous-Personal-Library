# November 2026 audit remediation and verification

Scope: the uploaded six-page Executive Summary report and the **current** `master` source. The report is partly a checklist of hypothetical risks, not a file-and-line-level proof that every vulnerability exists. Do not downgrade existing safeguards or delete novels to satisfy a speculative finding.

## Confirmed improvements in this pull request

| Area | Change | Verification |
| --- | --- | --- |
| Static shell CSP | `scripts/standalone-headers.txt` now restricts scripts, framing, embedding, form targets and remote connections. EPUB iframe CSS and bundled assets retain the narrowly needed blob/data allowances. | `tests/security-headers.test.ts`, Cloudflare Pages header assertion and Chromium EPUB smoke under Pages CSP in `.github/workflows/verify.yml` |
| Low-contrast secondary labels | Adjusted light, sepia and ocean `--subtext` colours to meet at least 4.5:1 against common surface backgrounds. | `tests/theme-contrast.test.ts` checks all six themes |
| Cover memory growth | `useCoverArt` now shares pending Blob downloads but revokes each component's object URL on cleanup. | Type-check, browser smoke and review of URL ownership |
| Initial JavaScript cost | Novel details and EPUB reader are lazy-loaded; epub.js is no longer required for initial bookshelf rendering. | Vite production build and desktop/mobile browser smoke |
| Offline updates | Keep the most recent previous app shell and serve current assets first, so open tabs can request their old hashed assets during an update. | Generated service worker and offline browser smoke |
| Transient network stalls | Bound OAuth and small JSON metadata reads; retry idempotent catalogue and collection reads without retrying destructive writes or timing out large EPUB streams. | Gateway tests and cloud/offline browser smoke |

## Audit assertions already addressed in the existing repository

- **No confirmed client secret exposure.** `functions/_lib/oauth.ts` and `functions/api/oauth/[action].ts` use server-only encrypted Secure HttpOnly cookies and PKCE. `public/oauth-client.json` is deliberately public OAuth client **metadata**, not a secret. Cloudflare production secret values cannot be inspected from this repository.
- **No confirmed raw HTML insertion defect.** React components render external metadata as text, not via `dangerouslySetInnerHTML`. The EPUB renderer is an iframe with `allowScriptedContent: false` and `allowPopups: false`. Test hostile EPUBs separately before accepting untrusted archives.
- **Browser token persistence is already avoided.** `src/lib/cloud.ts` keeps legacy manually supplied tokens in memory, clears the obsolete sessionStorage key and uses the server-side OAuth gateway by default. IndexedDB stores offline EPUBs and progress, not OAuth credentials.
- **Cover loading is already lazy.** `src/components/LibraryDashboard.tsx` uses IntersectionObserver and `loading="lazy"` for off-screen covers; above-the-fold feature covers remain eager.
- **Build and CI safeguards already exist.** Vite builds minified production assets with sourcemaps disabled by default; `.github/workflows/verify.yml` uses SHA-pinned actions, `npm ci`, `npm audit`, TypeScript checks and browser smoke. The repository has a real setup guide in `README.md` and detailed documentation under `docs/`.
- **Same-title local/hosted aliases are already handled non-destructively.** `src/lib/local-backups.ts` and its tests move unambiguous local aliases to an accessible backup section. Different cloud IDs must not be silently merged or deleted solely because titles match.
- **Private API writes already have guards.** `functions/api/library.ts` validates paths, limits uploads, verifies the private dataset, checks same-origin requests, pins catalogue revisions and requires a separate Owner grant for destructive operations.

## Outstanding verification and release gates

1. **Cross-device conflict resolution:** existing draft PR #2 contains a revision-safe implementation, but its real isolated Hugging Face OAuth/disposable-dataset integration gate has not passed. Do not merge or deploy it to the owner's private dataset without that acceptance test. The deployed `master` sync remains timestamp-based.
2. **Production secrets and headers:** inspect the actual Cloudflare configuration and live response headers after an explicitly authorised deployment. This PR does not read secret values or deploy.
3. **Hostile EPUB and cross-browser testing:** synthetic Chromium EPUB tests exist. Safari/Firefox and adversarial EPUB payloads need a separate test environment; do not assume the EPUB renderer is a general-purpose HTML sanitiser.
4. **Real duplicate catalogue records:** the private dataset is not in this public repository. Verify book IDs, authors and source hashes before consolidating any hosted records. Preserve all EPUBs, notes and reading positions.
5. **Third-party and analytics privacy:** do a production network trace to confirm no novel contents or private notes leave the intended API; no third-party error-reporting service has been added because it could transmit sensitive reading data.
6. **Release process:** merge only after CI and manual acceptance; deploy through the existing explicit manual production workflow. No production data changes, merges or releases were performed by this remediation.

The report's speculative **Critical** secret and **High** HTML injection findings must not be described as verified vulnerabilities without a source-level reproduction. This document records the distinction and the tests still required.
