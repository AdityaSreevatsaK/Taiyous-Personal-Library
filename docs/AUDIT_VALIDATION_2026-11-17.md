# Validation of uploaded “Executive Summary” audit, 17 November 2026

**Baseline inspected:** `master` at `004eb1216acf932ef113aa55c2dea4f3b9694f11`.
**Source:** the supplied 10-page audit PDF, which explicitly states the researcher
could not access the source code or establish a commit SHA. Its recommendations
are therefore hypotheses, not verified vulnerabilities in this application.

## Findings checked against the actual source

| Claim in PDF | Evidence in this repository | Decision |
| --- | --- | --- |
| High: EPUB XSS is present | `src/components/Reader.tsx` passes `allowScriptedContent: false`, `allowPopups: false` to EPUB.js, which disables scripted content by sandboxing its iframe. Static security headers also prohibit inline scripts. The cited CVE concerns **File Browser**, a different product; it does not establish an EPUB.js vulnerability. | **Not verified as a defect.** Add hostile-EPUB browser regression that asserts the sandbox and checks no script or event handler executes. Do not remove benign EPUB content or rewrite all books. |
| Medium: CSP/security headers missing | `scripts/standalone-headers.txt` already includes CSP, X-Frame-Options, nosniff, Referrer-Policy, COOP and restrictive permissions. `verify.yml` checks headers from an actual local Cloudflare Pages server, and `csp_browser_smoke.mjs` checks real rendering under CSP. | **False as stated.** Add missing explicit HSTS to static and Pages Functions responses, and test it. |
| High: hard-coded tokens | OAuth bearer tokens are encrypted with `HF_OAUTH_SESSION_KEY` into Secure HttpOnly cookies in `functions/_lib/oauth.ts`. Owner passphrase is a Cloudflare secret. The manual token fallback is kept in React memory, not persisted. No concrete exposed secret was identified in the report. | **Not verified.** No token rotation or destructive history rewrites without an actual credential. Cloudflare GitHub and HF secret values must still be checked outside source control. |
| Medium: no dependency audit | Committed `package-lock.json`, `npm ci`, `npm audit --omit=dev --audit-level=high` and a high/critical full-dependency audit gate are already present in `.github/workflows/verify.yml`. | **False as stated.** Add a low-noise Dependabot schedule for npm and GitHub Actions updates. |
| Medium: user input is unsanitised | `src/lib/importer.ts` normalises EPUB/ZIP summaries to plain text and checks source URL scheme. Most interface values use React JSX text interpolation, not raw HTML injection. | **No demonstrated exploitable sink.** Keep existing validation and browser sandbox. Avoid unnecessary content rewriting that could break EPUB bookmarks or novel formatting. |
| Low: error handling absent | `src/components/Reader.tsx` displays reading errors, while `src/App.tsx` exposes import/storage/cloud-sync errors and retains pending sync flags. | **False as stated.** Do not introduce third-party click/session recording into a private novel library by default. |
| Low: no tests or documentation | TypeScript build, Vitest unit tests, synthetic EPUB browser smoke suites, Cloudflare Pages integration checks and developer documentation already exist. | **False as stated.** Fix obsolete README references and add hostile-EPUB regression coverage. |
| Optional performance/modernisation | The app already uses React, TypeScript and Vite, lazily loads covers, and virtualises large chapter lists. | **No validated change requested.** Avoid broad rewrites without profiling evidence. |

## Safeguards introduced in this patch

1. Enforce and test HSTS for public static pages and for authenticated Pages Function responses. Cloudflare `_headers` applies only to static assets, so both layers must be handled.
2. Monthly, grouped dependency-update PRs with limited queue sizes; existing vulnerability gates remain unchanged.
3. Hostile EPUB browser smoke tests at desktop and mobile sizes. The test EPUB contains script and inline event-handler payloads and checks that the chapter is still readable but scripts are never executed.
4. Correct obsolete README front matter, historical migration count wording and stale browser-test filenames.

## Non-goals and verification

- No production EPUBs, Hugging Face dataset files, Cloudflare secrets or user reading records are touched.
- No library data migration or permission changes.
- The linked audit did not prove a specific XSS exploit, leaked credential or missing CSP in this repo. Those statements must not be reported as confirmed.
- Cloudflare deployment secret configuration, live owner login and a destructive integration test against a **disposable** private HF dataset remain separate operational verification tasks.
- Local network access may be unavailable; record GitHub CI's exact result before considering this patch verified.
- No release/tag or production deployment follows from this validation automatically.
