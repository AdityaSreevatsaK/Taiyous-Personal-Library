# Comprehensive Repository Audit and Remediation

**Repository:** AdityaSreevatsaK/Taiyous-Personal-Library  
**Audit baseline:** `master` at `e640ef9929b2b97771d1fc0b5f19fd105cd64599`, 20 November 2026.  
**Scope:** Production Novel Library application, same-origin Cloudflare Pages Functions, private Hugging Face gateway, local IndexedDB, EPUB/ZIP import, browser/offline behaviour, GitHub Actions, security rules, tests and operations.

> **Method and limitations.** This is a source-code/CI audit, not a penetration test or live-user performance benchmark. The private production dataset, OAuth secrets and actual user browsers were **not** inspected or mutated. Findings were classified only after examining implementation code and adding synthetic regression tests. Runtime latency reductions described below are architectural (fewer requests, fewer write transactions), **not measured production milliseconds**. Preserve user data before any future migration.

## Executive assessment

The existing repository has a comparatively strong security and reliability baseline: private Hugging Face content behind production-only authenticated Cloudflare Functions, encrypted HttpOnly OAuth sessions, separate Owner grants for destructive operations, allowlisted book file paths, revision-guarded catalogue mutations, CSP/HSTS, restrictive EPUB script sandbox, safe offline EPUB deletion, TypeScript/Vitest, hostile-EPUB browser smoke, CodeQL and verified automatic releases. Replacing that architecture or inventing a new database would create more risk than benefit.

This audit identified concrete, fixable gaps in **private personal-data write protection, repeated network round-trips, cover caching, cover request concurrency, local progress consistency, ZIP decompression bounds, streamed file sizes, hostile hosted EPUB responses and bulk IndexedDB writes**. They were addressed in focused PRs with tests. Existing broader **cross-device revision-safe personal-data synchronisation remains unfinished** under Issue #34 and cannot be declared fixed by ordinary synthetic CI.

## Confirmed findings and changes

| Priority | Code/evidence | Verified failure mode | Fix / verification |
| --- | --- | --- | --- |
| High | `functions/api/library.ts` `upload` | Personal sidecars were accepted without independently verifying the dataset remained private at the backend write boundary. UI preflight did not protect direct callers or a visibility change between pages. | PR #102: fail closed using server `isPrivateDataset` before all personal uploads; tests for public and unavailable dataset. |
| High | `src/App.tsx` `refreshCloud` | Multi-minute per-book note/progress retrieval could replace `booksRef.current` with stale entries and lose the owner's changes made while the refresh ran. | PR #102: `reconcileCompletedCloudRefresh` merges newly edited local progress, tags, summaries/reviews and pending state, keeps fresh imports and excludes removals; deterministic race tests. Cross-device CAS is separate. |
| Medium | `src/lib/storage.ts` `cacheCover` | Cover cache rejected valid PNG/WebP. The viewer downloaded them each time and those covers could disappear offline. | PR #102: accept only signature-verified JPEG, PNG and WebP within 8 MiB; retain old IndexedDB field and preexisting cached JPEG data. |
| Medium | `src/components/useCoverArt.ts` | Simultaneously entering view many cover tiles could launch an unbounded burst of remote private fetches. | PR #102: four-slot FIFO limiter for remote cover downloads; local cache hits bypass queue. Tests for 40 concurrent jobs and failure/recovery. |
| Medium | `src/lib/cloud.ts` `fetchCloudCatalog`, save progress/reviews; `src/lib/collections.ts` | OAuth clients made redundant dataset visibility requests before operations whose same-origin gateway already checks privacy, increasing remote round trips. | PR #102: avoid redundant OAuth preflight, keep direct-token checks and enforce the real gateway write-boundary guard. Mock proves catalogue needs one frontend network call. |
| High | `src/lib/importer.ts` `prepareImport` / `extractEpubMetadata` | Compressed input ZIP size was bounded, **inflated** EPUB and metadata sizes were checked only after JSZip expansion (or not at all), enabling excessive memory use from a tiny compressed archive. | PR #103: reject oversized entry declarations, count entries, stop streaming inflation at explicit limits; per-XML/JSON caps and raw EPUB size precheck. Synthetic actual ZIP tests include false length metadata. |
| Medium | `src/lib/cloud.ts` `fetchCloudCover` | `Response.blob()` downloaded/buffered an arbitrary upstream image before the 8 MiB validation. | PR #103: bound body streaming, validate even when Content-Length is absent/misreported, preserve cover signature checks. |
| Medium | `src/lib/cloud.ts` `fetchCloudEpub` | A successful HTTP 200 with HTML or wrong upstream bytes could be saved to durable offline storage as an EPUB; declared size was checked after buffering. | PR #104: bound actual download stream at 120 MiB, reject non-ZIP magic before the caller stores it; tests for valid bytes, HTML and oversized reply. |
| Medium | `src/App.tsx`, `src/lib/storage.ts` | Refresh persisted hundreds of cloud books through a separate IndexedDB readwrite transaction for each record. | PR #104: one atomic `books` readwrite transaction and short-circuit empty batch; mocked 300-record transaction regression. |

**Safety:** These PRs do not write production HF contents, change owner access/scope, alter immutable IDs, rename novel folders, migrate browser database versions or create a GitHub release tag. The web reader still uses real EPUBs, vertical scrolling, CFI bookmarks, six themes and independently cached offline books.

## Area-by-area assessment

### Security and privacy
- **Verified controls worth retaining:** OAuth PKCE and encrypted `__Host-` HttpOnly cookies in `functions/_lib/oauth.ts`; production-origin checks; fixed private dataset; distinct ten-minute Owner passphrase grant; same-origin and custom header checks for mutations; path allowlists and revision checks; CSP/HSTS; EPUB sandbox `allowScriptedContent: false`.
- **Fixed in audit:** Backend dataset-private check for every sidecar write; hostile ZIP/cover/EPUB byte bounds; wrong-EPUB-body rejection.
- **Do not assume:** Validity of remote Cloudflare/HF secrets, DNS settings, Cloudflare WAF/rate limits, provider OAuth token rotation, actual permission scopes after user account changes. Check these directly in provider administration when authorised.
- **Outstanding hardening consideration:** Multipart upload parsing still uses `request.formData()`. Cloudflare request-body limits provide an outer bound, but an app-specific streaming bound before multipart decoding was not implemented in this audit because it could double-allocate large uploads or break supported chunked clients without careful integration testing. Keep the existing 75 MiB app-side per-upload checks and provider limits.

### Performance
- **Removed structural overhead:** One redundant OAuth catalogue visibility hop and similar save checks; re-fetching PNG/WebP; unlimited parallel cover downloads; hundreds of independent cloud metadata IndexedDB transactions.
- **Existing sound choices:** EPUB parser lazily loaded; visible-cover IntersectionObserver; chapter TOC cached; capped cloud refresh pool of five; browser-saved EPUBs used offline.
- **Remaining bottleneck:** `src/App.tsx` loads personal review and reading position individually for each hosted book, with two serial bounded passes. Hundreds of real remote requests can take time. A future **versioned server batch endpoint** or safe bulk personal-data manifest could be a major improvement, but requires end-to-end private HF design and revision-safe testing; no blind increase in parallel network load.
- **Measurement still needed:** Browser Navigation Timing, network waterfall and devtools performance samples from a real library (first load, repeat load, cached/offline, reader cold start, 300+ novels) on desktop/mobile. No invented latency reduction percentages or bundle size claims are made.

### Reliability and data correctness
- **Preserved:** Cloud catalogue is authoritative for hosted books; local cached EPUBs and archived records survive temporary remote missing catalogue; safe revision-conditional catalogue writes; no false Finished status from an ongoing novel; local offline deletion requires verified hosted replacement; progress still persisted during reading.
- **Fixed:** Live progress/review edits surviving concurrent refresh; no cached fake hosted EPUB; PNG/WebP offline cover persistence.
- **Known limitation:** Per-book progress/review/collections currently use timestamp merge and independent writes. Two devices can still race and lose later-but-stale edits. [Issue #34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) requires revision-safe CAS and an isolated disposable private dataset plus **two actual authenticated browser sessions**. Do not merge a speculative sync change without that evidence.
- **Recovery:** Keep independent backups before destructive operations. Existing permission for routine code PR merges is **not** permission to delete or rewrite the real HF dataset.

### Architecture and maintainability
- `src/App.tsx` (~79 KiB source) combines routing, cloud sync, offline cache, reading progress and owner actions. The new pure `cloud-refresh-merge.ts` is one example of extracting testable state logic without a wholesale rewrite.
- `src/styles.css` and `scripts/browser_smoke.mjs` are large and historically contain related incremental fixes. A future **nonfunctional** modularisation should be small, covered by visual geometry and real offline smoke; do not lose working theme overrides by concatenation-order changes.
- The novel app intentionally has no runtime dependency on the experimental Shared Core/Hub and sibling Manga/Anime/Movies & TV repositories. Preserve isolated auth and storage.

### Dependencies, tests and CI
- The repository already uses pinned workflow actions, Node 22 `npm ci`, TypeScript checks, Vitest, Vite build, package privacy scan, production and development dependency audit, Playwright-style Chromium desktop/mobile/offline checks, CSP and malicious EPUB tests, CodeQL and verified exact-commit Cloudflare deploy. **Do not weaken or bypass** these gates.
- This audit added focused regression tests for each confirmed bug, not just documentation assertions. Source is public but test fixtures are synthetic and should never contain personal novels or OAuth bearer tokens.
- Normal acceptance: PR Verify and CodeQL green on exact head, merge, then matching `master` Verify and CodeQL, guarded dispatcher and completed **Deploy Application** job. A PR green or dispatched release alone is not production success.
- Tests do not equal a real live-user penetration test, actual HF/OAuth two-browser CAS test, mobile browser memory profile or backup restoration drill.

## Prioritised remaining work

| Priority | Activity | Required proof / consent |
| --- | --- | --- |
| High | Issue #34: multi-device, revision-safe personal-data merges | Disposable private HF dataset, two real OAuth browsers, stale-write rejection, recovery tests, explicit approval for any production schema/permission changes |
| Medium | Real-library latency and memory profiling | Repeatable benchmark, browser network waterfall; proposed change must outperform baseline before major network architectural change |
| Medium | Verify live Cloudflare WAF, secret scopes, key rotation and rate limits | Provider-admin review, never print secret values or modify security policy without approval |
| Medium | Refactor oversized UI/orchestration files in bounded PRs | No visual regression in six themes and desktop/mobile/offline/browser CI; no functional changes |
| Medium | Restore-test backups and document incident drills | Independent backup, test-only environment, no destructive operation against real dataset |
| Low | Triage browser-storage eviction/quota messaging for very large offline collections | Measured mobile storage, non-destructive failure handling and user confirmation |

## How to repeat the review

1. Fetch newest `master` SHA, open issues, PRs and final deploy run.
2. Read [AGENTS](../AGENTS.md) and [AI Agent Playbook](AI_AGENT_PLAYBOOK.md).
3. Audit diffs, source paths and tests; use the exact commit under examination.
4. Re-run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, desktop/mobile browser, offline cold start, CSP/malicious EPUB, CodeQL and dependency audit.
5. Validate private HF account and provider settings only in the separately authorised, secure environment.
6. Keep confirmed defects, risk assumptions and unverified checks explicitly separate. Do not claim a complete absence of vulnerabilities or that all production latency is resolved.
