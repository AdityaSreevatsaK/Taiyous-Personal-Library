# Capabilities and offline behaviour — `master` (production baseline)

**Scope:** This file describes the code on `master`, the restored v1.0.4 production baseline. It is not a description of staged `dev` features. The production Space is deployed separately from GitHub and must not be updated by a documentation change.

## Available in master

| Area | Behaviour |
| --- | --- |
| Library | Responsive bookshelf; All books, Currently reading, To be read and Finished; local shelf search/filtering and tags |
| Imports | Import EPUB or supported novel ZIP; extracts the EPUB and catalogues metadata; duplicate detection |
| Reading | EPUB.js vertical chapter reading, table-of-contents search and chapter selection, next/previous chapter in the **top reader toolbar** |
| Reading preferences | Sepia, light and dark themes; typography, font size, line height and width controls |
| Book details | Title, author, synopsis, source metadata, tags, chapter navigation and locally editable personal tags/summary |
| Local state | EPUB blobs and book metadata in browser **IndexedDB**; reading position/progress in local metadata; settings in browser storage |
| Private hosted library | Optional Hugging Face **private dataset** connection using a fine-grained dataset token held in application memory; private catalogue and EPUB retrieval; EPUBs cached locally on first access |
| Shared data | Hosted catalogue and EPUBs; original ZIP uploaded when supplied during import |
| Deployment | Static React/Vite app hosted as a private HF Space; prebuilt `dist/` assets, separate from the private book dataset |

The dataset repository is **separate** from the GitHub source repository and the Space. Do not put books or credentials in either code branch or the Space repository.

## Not in master

These capabilities are implemented or under evaluation on `dev`, **not available in the master baseline**: personal 1–10 ratings with private cloud notes, named collections and their cloud sync, dedicated EPUB/ZIP download controls, bottom chapter navigation, the compact cloud status pill and the newer collection/global search interface. Do not describe them as shipped to production until the code is promoted and the production Space is separately deployed.

Reading progress, position, editable personal tags and summaries are browser-local; there is no cross-device progress synchronisation.

## Offline and downloads

- **Already-open app + EPUB previously cached:** the reader can use the stored EPUB blob and save progress locally, without contacting Hugging Face, provided its running JavaScript/assets remain loaded.
- **Uncached hosted EPUB:** requires an internet connection and an authenticated private-dataset session before it can be opened and cached.
- **Cold start or browser reload without internet:** **not guaranteed to work.** The app has no dedicated offline service worker or precache/PWA installation mechanism; incidental browser caching is not a supported offline-launch contract.
- **Dedicated Download EPUB/Original ZIP buttons:** **not implemented in master.** The automatic private EPUB fetch is for browser caching, not a file-download/export feature. You can download your original EPUB/ZIP through other authorised means outside this version.
- **Cloud catalogue, imports/uploads and syncing between devices:** require internet and the dataset-scoped token. Browser-local data cannot automatically sync while offline.
- Browser storage can be cleared, evicted or blocked by private browsing settings. Keep independent copies of your EPUBs and original ZIPs.

## Access and change control

GitHub `master` maps to the approved production baseline, but merging code is **not** identical to deploying the live production HF Space. Do not merge `dev` or change the production Space until staged functionality is verified. See the branch-specific README and `dev/docs/CAPABILITIES.md` for staged features.
