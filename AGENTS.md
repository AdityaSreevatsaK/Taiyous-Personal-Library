# AI Agent Rules: Taiyou's Personal Library (Production Novels)

**Scope:** this is the established EPUB/ZIP Novel Library, not an experimental scaffold. Its source repo is PUBLIC; its Hugging Face dataset is PRIVATE. The app runs at https://taiyous-personal-library.pages.dev with manually gated production deployment. Other sessions own the Shared Core/Hub, Manga, Anime and Movies & TV repositories.

## Highest-priority invariant: never lose books or regress reading
The Novel Library contains real private data, reading progress, collections, reviews, covers and offline caches. Do not migrate, delete, rename or reupload live dataset files as part of ecosystem work. A code refactor is NOT worth an unverified catalogue change. No forced rewrite of the 24-character book IDs, human-readable novel folders, existing EPUB paths or personal sync documents. Owner-mode deletion, legacy compatibility and offline reading must remain functional.

## Mandatory start and sources of truth
1. Inspect the CURRENT GitHub `master`, open PRs, workflow status, branches and recent merge/deploy history. Do not trust older README/HANDOVER claims without verification.
2. Read this AGENTS file, `README.md`, `docs/CAPABILITIES.md`, `docs/STANDALONE_PWA.md`, `docs/ACCESS_GATEWAY.md`, `docs/READABLE_NOVEL_FOLDERS.md` and **all relevant ecosystem docs**.
3. Inspect current implementation in `src/App.tsx`, `src/components/LibraryDashboard.tsx`, `src/components/Reader.tsx`, `src/lib/cloud.ts`, `collections.ts`, `offline.ts`, `storage.ts`, `owner.ts`, `functions/api`, workflows and tests.
4. Run `npm ci`, `npm run typecheck`, `npm test` and `npm run build` in a trusted checkout.
5. Compare actual behaviour on desktop/mobile, offline and private-cloud paths. Record differences between docs and code, and repair docs only after verification.

## Strict ownership boundaries
- Novel Library owns EPUB import/export, reader navigation, real cover handling, chapter progress, collection membership and private novel dataset storage.
- Shared Core is an experimental build-time source-code package plus optional parent Hub. **Do not import its unpublished 0.0.0 workspaces into this production app** or make the Novel Library call its live URL at runtime.
- Manga, Anime and Movies & TV have different progress semantics. Never redesign novel progress to fit a one-size-fits-all media model.
- Any reusable UI extraction must be opt-in, tested by at least two consumers, version-pinned and rollback-safe. No bulk move to a new repository.

## Security rules
Never expose HF tokens, owner passphrases, private book text/files, personal notes or dataset paths through public GitHub, Vite variables, frontend bundles, logs or screenshots. OAuth has an encrypted Secure HttpOnly session via Cloudflare Functions, scoped to this app origin, not cross-app SSO. Server-side authorisation is mandatory for whole-novel deletion. Local offline-copy removal must not be incorrectly owner-restricted. Use revision checks, exact confirmation and verified backup on destructive operations; reject unsafe archive inputs and catalogue overwrites.

## Engineering and UX
TypeScript strict, React 18, Vite, EPUB.js, IndexedDB and Cloudflare Pages Functions. Preserve mobile/desktop accessibility and immersive reading. Maintain existing light/dark/sepia and other active design themes, real covers only, 1–10 rating semantics, personal notes and tags. Minimise network calls, latency and bundle growth. Show clear empty/offline/loading/conflict states. Never represent temporary user edits as persisted cloud writes without verification.

## Tests, deployment and releases
- `master` is the production source; use a feature branch and PR for changes.
- Verify with unit tests, typecheck, full build, offline cold-start browser smoke, security headers, disposable-data integration where appropriate and manually checked mobile behaviour.
- `.github/workflows/verify.yml` is quality CI; `deploy-standalone.yml` is **manually gated**. Do not turn on automatic production publication or invent a deploy URL.
- Do not create a GitHub release/tag (not even v1.0) without explicit owner confirmation.
- An outstanding development-dependency advisory must be tracked honestly, not masked by disabling tests or weakening production dependency checks.
- Report exact PR, SHA, workflow/deployment outcome and remaining unverified cases.

## Ecosystem responsibilities
Review `docs/ECOSYSTEM_*.md` and `docs/SESSION_HANDOVER_PROMPT.md`. Propose small stable stateless components and pure search/rating primitives, but do NOT change existing data/schema/auth automatically. Send proposals to the Shared Core agent with API, tests, expected consumers, compatibility, performance and rollback. All other repo changes are out of scope unless owner separately authorises.

## Hard stops
Never delete/recreate the HF dataset; never remove source EPUBs, downgrade owner security, make private data public, bypass content access controls, disable backup/version checks, rewrite master history or publish production without explicit approval. Pause the risky action and ask for owner consent instead.

## Acceptance
The user's existing library and progress remain readable on desktop and mobile; deep links, collections, offline reading and Cloudflare OAuth still work; no increased private-data exposure. A green CI alone is not a substitute for real acceptance.
