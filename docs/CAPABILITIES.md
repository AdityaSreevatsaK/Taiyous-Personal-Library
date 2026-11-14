# Capabilities and offline behaviour — `master` (Cloudflare standalone PWA)

**Scope:** This file describes the current `master` code deployed as a standalone PWA on Cloudflare Pages. The Hugging Face Spaces are legacy application deployments; the private Hugging Face Dataset remains the book/metadata backend. Use `.github/workflows/deploy-standalone.yml` for manual Cloudflare publication after checks.

## Features in master

| Area | Behaviour |
| --- | --- |
| Library and search | Compact responsive bookshelf; All, Trying out, Reading, Unread and Finished; global search spanning all novels; scoped search within shelves, tags and collections; alphabetical tag/collection results |
| Novel tags | Click imported or personal tags to open a list of novels with that tag; tags are not collections |
| Named collections | Create, rename and delete collections; assign/remove novels without deleting books; series grouping such as *Harry Potter*; local state plus optional private-dataset sync |
| Details | Synopsis and metadata; reading progress; original source links; chapters; personal tags and summary; comments below information in left column. Synopsis saves prompt for confirmation; personal tags are batched as a draft and confirmed once. |
| Rating and comments | Personal 1–10 rating in the green novel header, and separate reading notes. Locally cached; when connected for a hosted book, written to separate private per-book JSON documents and reloaded from cloud |
| Reading | EPUB.js vertical chapter scroll; chapter selection/search; local reading progress and resume; chapter navigation at bottom-left (**Previous**) and bottom-right (**Next**); keyboard arrow shortcuts; header navigation to novel details and library. Bookmarkable `/novels/<title-slug>` and `/novels/<title-slug>/read` routes support direct links and browser history; legacy `/book/<id>` links are resolved and rewritten to the name-based route. Duplicate titles receive a short ID suffix to prevent ambiguity. Internal storage and progress remain keyed by immutable ID. |
| Appearance | Sepia/light/dark themes, fonts, line height, font size and reading width |
| Novel cover artwork | Real JPEG covers are loaded from the private Hugging Face Dataset when catalogue entries contain `coverPath: data/novels/<existing-id>/cover.jpg`. Images appear on the bookshelf, advanced search results and novel details, are cached in a new IndexedDB `covers` store for offline reuse, and fall back to generated covers when missing or unavailable. Existing EPUBs, ZIPs and novel IDs are unchanged. |
| EPUB and ZIP download | **Download EPUB** saves a real `.epub` file through the browser. Uses a cached EPUB, or obtains one from the authorised private dataset if missing. **Original ZIP** is offered only when a hosted archive exists and requires a network fetch |
| Book imports | Local EPUB/ZIP imports and IndexedDB caching. When connected, may publish EPUB, ZIP (when provided) and catalogue to the separate private dataset |
| Cloud session | Hugging Face OAuth with encrypted HttpOnly cookie and automatic reconnection (after the production secret is configured and the updated app deployed); the manual fine-grained HF token remains available in memory as a fallback |
| Standalone PWA deployment | Production Cloudflare Pages workflow on `master`, with manually gated publish. The Pages app shell is deliberately **public**, while novels, reading progress and personal notes remain protected by the **private Hugging Face dataset token**. **Live, with manual master-branch deployments.** |
| Offline library management | Offline tab holds download count, PWA readiness and **Save all offline**. The Novel Details storage card manages individual downloads. A cached EPUB can be removed with a normal confirmation (no Owner passphrase), but only after the private server confirms the hosted replacement exists. Local-only EPUBs cannot be cleared this way. |
| Protected Owner mode | Additional Cloudflare passphrase Secret, independent of HF OAuth; 10-minute encrypted HttpOnly owner cookie, exact-title confirmation for deleting any entire local/hosted novel or a collection. The hosted deletion is an exact-novel, revision-guarded HF commit (catalogue plus book folder and private notes). No arbitrary-path deletion is exposed. |
| Bulk offline library | **Save all offline** downloads missing EPUBs sequentially with progress and per-book failure reporting |
| Reading-position sync | Per-book private progress JSON, local pending queue and timestamp-based restore/retry when connected |
| Build/deploy | TypeScript, Vitest, Vite build, production dependency audit, browser smoke tests and manually approved deployment to **Cloudflare Pages** from `master` |

### Storage map

- **Browser IndexedDB:** cached EPUB binaries and optional JPEG cover artwork, book metadata, reading position and progress, ratings/comments as locally available metadata.
- **Browser localStorage:** display preferences, private dataset repository ID, named collections and other local UI state. The Hugging Face token is not persisted.
- **Private Hugging Face Dataset:** `data/library.json` catalogue and `data/novels/<book-id>/source.epub`; optional `original.zip`; per-book notes at `data/personal/reviews/<book-id>.json`; per-book reading positions at `data/personal/progress/<book-id>.json`; collections at `data/personal/collections.json`.
- **GitHub repository/Cloudflare Pages:** source code and built UI only; **never** the private novel dataset or user tokens.

**Sync limitations:** Reading progress/last position, ratings/comments and collections use private cloud files when connected. Offline edits remain locally pending until a successful authorised retry. Personal tags, custom summaries and typography remain local to each browser. **Trying out** shelf state is recorded with private per-book reading notes and synchronised between devices when connected. Avoid simultaneous edits from multiple devices: collections use timestamp-based merging rather than transactional multi-writer guarantees; cloud notes also lack conflict-proof concurrent editing. A passing CI run does not replace testing with the actual private dataset.

### Name-based deep-link behaviour

- Novel details: `/novels/emperors-domination`; reader: `/novels/emperors-domination/read`.
- The visible URL is a slug derived from the saved novel title. A duplicate title is disambiguated with a short stable ID suffix, without changing the underlying novel identity.
- Historical `/book/<24-character-id>` and `/book/<id>/read` bookmarks still load, then the browser URL is canonicalised to the name-based path once the local or private cloud catalogue loads.
- Browser Back/Forward, direct reloads and offline entry use the same app-shell routing logic. The private EPUB and personal metadata never appear in URL query parameters.
- **Limit:** if a novel title is renamed, an *old title-only* bookmark cannot be resolved on a fresh device without a persistent alias catalogue. Historical ID-based links remain durable. Adding global old-title redirects is a separate, data-model-backed follow-up; do not guess which book an ambiguous slug means.

## Offline-first PWA behaviour (standalone hosting)

The `master` build now generates a versioned **same-origin service worker** (`dist/sw.js`) and **web app manifest**; the worker precaches exactly the compiled HTML/JS/CSS/icon assets and provides a cached page fallback for offline navigation. Book contents are **not** stored in Cache Storage or precached by the worker; EPUBs remain in IndexedDB, and the OAuth session stays in a secure HttpOnly cookie (or in memory for manual-token fallback). **Private dataset network responses must never be cached by the service worker.**

The dedicated **Offline tab** displays connectivity, downloaded EPUB count, PWA readiness, bulk download actions and per-book removal controls. The general bookshelf omits repetitive offline labels. Novel Details provides per-book storage management, including saving EPUBs locally. Removing a downloaded EPUB needs only a normal confirmation; the app first verifies that the hosted EPUB actually exists and keeps the local copy if verification fails. Entire novel deletion still requires Owner mode. Browser persistent storage may be requested when saving, but the browser can decline.

| Situation | Expected behaviour |
| --- | --- |
| App already open and EPUB cached | Read and move between chapters; save local progress; export **Download EPUB** without internet |
| App shell successfully controlled by the service worker | The app shell **can** reload offline at that same origin if the browser retains the service-worker cache, and the already-cached EPUB is available |
| App loaded through the private Hugging Face Space wrapper | The surrounding Hugging Face page or iframe may still need an internet connection and may restrict service-worker registration/installation. **An offline launch from the HF Space page is not guaranteed** |
| Hosted book not cached | First-time **Save offline**, EPUB download or open requires access to the private dataset while connected |
| Hosted original ZIP download | Requires internet and dataset authentication; the ZIP is not cached merely by caching the EPUB |
| Offline edits to personal ratings/comments | Saved locally with a persisted pending flag. They are retried when online with a still-active cloud session or when the private dataset is reconnected, provided the app can reach the cloud. Newer remote notes are not overwritten by older local edits |
| Offline collection edits | Stored locally, marked pending and merged with private cloud collections during the next successful authorised refresh. Timestamp-based merging is **not** a transactional conflict-resolution service |
| Offline progress | Locally saved with a pending-sync marker and uploaded to separate private progress files after reconnection and authorisation; simultaneous edits use timestamps and are not transactionally conflict-proof |
| Personal tags and custom summaries | Local to that browser, not synchronised across devices |

### Prepare to read without internet

1. While online, open the Cloudflare app and connect the private dataset.
2. Open the **Offline** tab and select **Save all offline** to download uncached novels one at a time. For one novel, open **Novel Details → Manage this novel**. Check the downloaded list in the Offline tab.
3. Confirm the Offline tab displays **App ready for offline reading**. If it does not, the application shell may not have completed caching on this device.
4. Where supported, install/add the web app from the browser's PWA menu while online, and test a fresh offline launch **before** relying on it. Private HF wrapper limitations may prevent installing it; in that case export the EPUB and use an independent offline EPUB reader.
5. For the most dependable independent backup, use **Download EPUB** to save actual files outside the browser's IndexedDB. Keep the original ZIP separately.

**Important:** Browser storage can be evicted or cleared; private browsing, origin changes and browser resets may remove both EPUBs and app-shell caches. After a refresh, the fine-grained private dataset token must be re-entered before cloud sync can resume. “Online” is based on browser connectivity status and is not proof that Hugging Face is reachable.

### Standalone installation

The standalone production Cloudflare PWA is deployed at https://taiyous-personal-library.pages.dev (production branch `master`). The previous `dev`-prefixed address is a retired preview origin. The user validated Android offline cold startup and reading on that older origin on 10 November 2026; fresh offline validation is recommended after installing the permanent hostname. Publishing is manually gated from GitHub `master`. See [Standalone operations](STANDALONE_PWA.md).

### Outstanding offline work

Test actual cross-device private Dataset sync and reconnection using authorised credentials; handle simultaneous multi-device edits with explicit conflict UI/transactional revision checks; add bulk-download cancellation/storage-quota management and an independent metadata backup/restore flow. Offline launch was manually validated on Android on 10 November 2026. Browser CI exercises a synthetic EPUB; it never contains private novel content or tokens.

## Release and production safety

- `master` is the only active source branch. Pushes run `.github/workflows/verify.yml`; the standalone Cloudflare workflow must be run manually with Publish enabled.
- The historic Hugging Face Space staging deployment workflow is retired from `master`; the private Dataset is retained.
- Validate cross-device collections/reviews and novel reading before major releases.
- Never write real book files or the private dataset as part of CI smoke tests.
