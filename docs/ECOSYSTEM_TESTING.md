# Novel App Quality Gates for Ecosystem Evolution

## Existing checks
The live repo contains unit tests, a committed npm lockfile, `npm run build` (TypeScript + Vite + icons/offline), browser smoke under `scripts/`, Cloudflare CSP checks, package privacy checks and CodeQL. `verify.yml` and `deploy-standalone.yml` are authoritative CI/deploy definitions. Check current workflow status rather than assuming green.

## Invariants for every Novel PR
1. Book metadata: old/new EPUB paths, duplicates, missing summaries, real cover fallback.
2. Reading: chapter URLs, scroll-only reader, next/previous, mobile typography, menu/dialog layout, resumed position and fullscreen.
3. Progress: durable completed status, trying-out, reading/unread/finished shelves and cross-device pending changes.
4. Library: tags, 1–10 ratings, comments, nested collections and direct membership, search/filter semantics and correct active tabs.
5. Offline: cold start with no network, cached EPUB reading, rehydration and delete-offline without owner mode.
6. Cloud/OAuth: token never exposed, private data not embedded in dist, expired sessions, owner confirmations and revision-safe import.
7. Accessibility: keyboard, 320px mobile, 390px mobile, tablet and desktop, no overlapping icons or off-screen menus.
8. CSP/headers, no public data leak, no extra paid CI API requests.

## Extra gates for Shared Core adoption
- App runs normally when hub host fails.
- Shared UI theme CSS is scoped and does not affect EPUB contents.
- Package is pinned, independently versioned and tested with current React/Vite.
- Shared types do not replace live novel IDs, progress, collections or HF schema.
- Actual before/after bundle sizes and latency recorded, revert tested.
- No new calls to private HF storage on mere navigation/render.

## Manual acceptance
Owner should verify at least one real offline phone and one desktop, including authentication and all destructive settings in non-production if possible. Never claim a real private-dataset integration test passed if it was skipped due to missing disposable credentials.

## Release status
Documentation-only ecosystem changes should NOT trigger a novel deployment unless truly necessary. A green PR build does not mean the website has deployed.
