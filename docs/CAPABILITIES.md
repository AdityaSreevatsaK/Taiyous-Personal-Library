# Capabilities and offline behaviour — `master` (Cloudflare standalone PWA)

**Scope:** This file describes the current `master` code deployed as a standalone PWA on Cloudflare Pages. The Hugging Face Spaces are legacy application deployments; the private Hugging Face Dataset remains the book/metadata backend. Use `.github/workflows/deploy-standalone.yml` for manual Cloudflare publication after checks.

## Features in master

| Area | Behaviour |
| --- | --- |
| Library and search | Compact responsive bookshelf; All, Reading, Unread and Finished; global search spanning all novels; scoped search within shelves, tags and collections; alphabetical tag/collection results |
| Novel tags | Click imported or personal tags to open a list of novels with that tag; tags are not collections |
| Named collections | Create, rename and delete collections; assign/remove novels without deleting books; series grouping such as *Harry Potter*; local state plus optional private-dataset sync |
| Details | Synopsis and metadata; reading progress; original source links; chapters; personal tags and summary; comments below information in left column |
| Rating and comments | Personal 1–10 rating in the green novel header, and separate reading notes. Locally cached; when connected for a hosted book, written to separate private per-book JSON documents and reloaded from cloud |
| Reading | EPUB.js vertical chapter scroll; chapter selection/search; local reading progress and resume; chapter navigation at bottom-left (**Previous**) and bottom-right (**Next**); keyboard arrow shortcuts; header navigation to novel details and library |
| Appearance | Sepia/light/dark themes, fonts, line height, font size and reading width |
| EPUB and ZIP download | **Download EPUB** saves a real `.epub` file through the browser. Uses a cached EPUB, or obtains one from the authorised private dataset if missing. **Original ZIP** is offered only when a hosted archive exists and requires a network fetch |
| Book imports | Local EPUB/ZIP imports and IndexedDB caching. When connected, may publish EPUB, ZIP (when provided) and catalogue to the separate private dataset |
| Cloud session | Connect a private dataset using a fine-grained HF token in memory; the token is not persisted and must be re-entered after refresh |
| Standalone PWA deployment | Prepared independent Cloudflare Pages preview workflow on `master`, with manually gated publish. The Pages app shell is deliberately **public**, while novels, reading progress and personal notes remain protected by the **private Hugging Face dataset token**. **Live, with manual master-branch deployments.** |
| Bulk offline library | **Save all offline** downloads missing EPUBs sequentially with progress and per-book failure reporting |
| Reading-position sync | Per-book private progress JSON, local pending queue and timestamp-based restore/retry when connected |
| Build/deploy | TypeScript, Vitest, Vite build, production dependency audit, browser smoke tests and manually approved deployment to **Cloudflare Pages** from `master` |

### Storage map

- **Browser IndexedDB:** cached EPUB binaries, book metadata, reading position and progress, ratings/comments as locally available metadata.
- **Browser localStorage:** display preferences, private dataset repository ID, named collections and other local UI state. The Hugging Face token is not persisted.
- **Private Hugging Face Dataset:** `data/library.json` catalogue and `data/novels/<book-id>/source.epub`; optional `original.zip`; per-book notes at `data/personal/reviews/<book-id>.json`; per-book reading positions at `data/personal/progress/<book-id>.json`; collections at `data/personal/collections.json`.
- **GitHub repository/Cloudflare Pages:** source code and built UI only; **never** the private novel dataset or user tokens.

**Sync limitations:** Reading progress/last position, ratings/comments and collections use private cloud files when connected. Offline edits remain locally pending until a successful authorised retry. Personal tags, custom summaries and typography remain local to each browser. Avoid simultaneous edits from multiple devices: collections use timestamp-based merging rather than transactional multi-writer guarantees; cloud notes also lack conflict-proof concurrent editing. A passing CI run does not replace testing with the actual private dataset.

## Offline-first PWA behaviour (standalone hosting)

The `master` build now generates a versioned **same-origin service worker** (`dist/sw.js`) and **web app manifest**; the worker precaches exactly the compiled HTML/JS/CSS/icon assets and provides a cached page fallback for offline navigation. Book contents are **not** stored in Cache Storage or precached by the worker; EPUBs remain in IndexedDB, and HF credentials remain in memory only. **Private dataset network responses must never be cached by the service worker.**

The bookshelf displays browser connectivity, the count of EPUBs downloaded locally, a per-novel **Available offline** indicator or **Save offline** button, and pending review/collection sync status. Clicking Save offline fetches and stores that novel's EPUB in IndexedDB; the browser is also asked to allow persistent storage, but can decline.

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
2. Select **Save all offline** to download uncached novels one at a time, or use an individual **Save offline** button. Wait for **Available offline** on each novel.
3. Confirm the app displays **Offline app assets cached**. If it does not, the application shell may not have completed caching on this device.
4. Where supported, install/add the web app from the browser's PWA menu while online, and test a fresh offline launch **before** relying on it. Private HF wrapper limitations may prevent installing it; in that case export the EPUB and use an independent offline EPUB reader.
5. For the most dependable independent backup, use **Download EPUB** to save actual files outside the browser's IndexedDB. Keep the original ZIP separately.

**Important:** Browser storage can be evicted or cleared; private browsing, origin changes and browser resets may remove both EPUBs and app-shell caches. After a refresh, the fine-grained private dataset token must be re-entered before cloud sync can resume. “Online” is based on browser connectivity status and is not proof that Hugging Face is reachable.

### Standalone installation

The standalone Cloudflare PWA is live at https://dev.taiyous-personal-library.pages.dev. The user validated offline cold startup and reading on Android on 10 November 2026. Publishing is manually gated from GitHub `master`, and the `dev` hostname is currently retained to preserve existing local IndexedDB storage. See [Standalone operation and URL migration](STANDALONE_PWA.md).

### Outstanding offline work

Test actual cross-device private Dataset sync and reconnection using authorised credentials; handle simultaneous multi-device edits with explicit conflict UI/transactional revision checks; add bulk-download cancellation/storage-quota management and an independent metadata backup/restore flow. Offline launch was manually validated on Android on 10 November 2026. Browser CI exercises a synthetic EPUB; it never contains private novel content or tokens.

## Release and production safety

- `master` is the only active source branch. Pushes run `.github/workflows/verify.yml`; the standalone Cloudflare workflow must be run manually with Publish enabled.
- The historic Hugging Face Space staging deployment workflow is retired from `master`; the private Dataset is retained.
- Validate cross-device collections/reviews and novel reading before major releases.
- Never write real book files or the private dataset as part of CI smoke tests.
