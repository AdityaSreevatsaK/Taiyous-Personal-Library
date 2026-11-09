# Capabilities and offline behaviour — `dev` (staging)

**Scope:** This file describes the current development code intended for the private staging Hugging Face Space. It is **not** a claim that the same features exist in `master` or in the production Space. Deployment is handled by `.github/workflows/deploy-staging.yml` after validation.

## Features in the dev code

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
| Build/deploy | TypeScript, Vitest, Vite build, production dependency audit, browser smoke tests and deployment to the **staging Space only** from `dev` |

### Storage map

- **Browser IndexedDB:** cached EPUB binaries, book metadata, reading position and progress, ratings/comments as locally available metadata.
- **Browser localStorage:** display preferences, private dataset repository ID, named collections and other local UI state. The Hugging Face token is not persisted.
- **Private Hugging Face Dataset:** `data/library.json` catalogue and `data/novels/<book-id>/source.epub`; optional `original.zip`; per-book notes at `data/personal/reviews/<book-id>.json`; collections at `data/personal/collections.json`.
- **GitHub repository/Space:** source code and built UI only; **never** the private novel dataset or user tokens.

**Sync limitations:** Reading progress, last position, personal tags, personal summaries and typography are still local to each browser. Ratings/comments and collections use private cloud files when connected; writes made offline remain local until successfully published or manually retried. Avoid simultaneous edits from multiple devices: collections use timestamp-based merging rather than transactional multi-writer guarantees; cloud notes also lack conflict-proof concurrent editing. A passing CI run does not replace testing with the actual private dataset.

## Offline operation: current behaviour, not a PWA guarantee

| Situation | Supported behaviour |
| --- | --- |
| App already open and book already cached | Read EPUB offline, turn chapters and update local progress; **Download EPUB** exports the cached binary without network |
| App already open, novel not yet cached | The first open/EPUB download needs a cloud fetch; no internet means it cannot finish |
| App first opened or refreshed with no internet | **Not reliably supported**: no service worker, precache manifest, offline app shell or installable PWA lifecycle |
| Original ZIP download | Fetches from the private hosted dataset; requires internet and authorisation. Original ZIP is **not** cached merely because the EPUB was cached |
| Existing EPUB downloaded to the device | Can be read separately in an offline-capable EPUB reader regardless of whether the web app can launch |
| Rating, comments, collections, progress updated offline | Local updates can be made while the app is running; cloud sync cannot happen until network and dataset authentication are available. **Do not assume every offline update is automatically replayed later.** |

**Practical offline preparation:** While online, open each novel to cause its EPUB to be cached, then use **Download EPUB** to save an independent file. Downloading a file is the most reliable choice for reading without connectivity: a browser can evict IndexedDB and an offline reload of this Static Space may fail. Clearing site data, changing browser/site origin or using private/incognito windows can lose locally stored books/metadata. Fonts may fall back to system faces offline.

### Recommended future work (not implemented)

Add a properly tested service-worker-backed PWA for offline app loading; explicit cache/pre-download management; durable sync queue with conflict resolution and offline indicators; independent data backup/export; and end-to-end authenticated private-dataset tests.

## Release and production safety

- `dev` pushes run `.github/workflows/deploy-staging.yml` and update the **private staging Space only** after successful checks.
- `master` is a separate older baseline; no automatic production promotion occurs.
- Test real private hosted EPUB reading, download, chapter navigation and cross-device collections/reviews before promoting any changes.
- Never write production Space contents, real book files or the private dataset as part of CI smoke tests.
