# Architecture and Data Lifecycle: Taiyou Novel Library

**Status:** Current implementation guide, reviewed against `master` on 20 November 2026. For rules, read [AGENTS](../AGENTS.md) and the [AI agent playbook](AI_AGENT_PLAYBOOK.md). The catalogue/data schema is controlled by code, not this prose.

## System overview

```text
User's desktop or mobile browser
  |
  +-- public Cloudflare Pages origin (taiyous-personal-library.pages.dev)
  |     React 18 + TypeScript + Vite app shell
  |     Home, shelves, search, book details, EPUB.js reader, Master Controls
  |     IndexedDB: books, cached EPUBs, covers, progress/pending edits
  |     localStorage: reader preferences, collections, usage analytics, related state
  |     Service worker: compiled shell and offline navigation (NOT private API)
  |
  +-- same-origin /api/* Cloudflare Pages Functions
        /api/oauth/[action] -> Hugging Face OAuth 2.0 + PKCE
        /api/library       -> authenticated private dataset operations
        /api/owner         -> separate privileged authorisation
        functions/_lib     -> session and catalogue validation
                |
                v
        Private HF Dataset: AdityaSreevatsaK/Taiyous-Novels
          data/library.json (canonical catalogue)
          data/novels/<immutable-id> - <safe-name>/source.epub
          data/novels/<immutable-id> - <safe-name>/original.zip (optional)
          data/novels/<immutable-id> - <safe-name>/cover.jpg/png/webp (optional)
          data/personal/progress/<immutable-id>.json
          data/personal/reviews/<immutable-id>.json
          data/personal/collections.json
```

**Security boundary:** The Pages app shell is deliberately public. HF OAuth identity and access tokens, owner authorisation, privileged requests and the actual book files remain private/server-enforced. The frontend must never expose access tokens or owner secrets as part of the compiled JS. The same-origin API rejects unexpected paths and unauthorised access.

## Major modules and responsibilities

| Area | Files | Notes |
| --- | --- | --- |
| App lifecycle and routing | `src/App.tsx` | Orchestrates page, reader, book metadata, cloud session, notifications and actions |
| Page and tab routes | `src/lib/routes.ts`, `src/lib/library-routes.ts`, `src/lib/page-titles.ts` | Canonical title slugs; tab titles start `TNL - ` |
| Catalogue parsing / imports | `src/lib/catalog.ts`, `src/lib/importer.ts`, `src/lib/stale-archive.ts` | ZIP/EPUB reading, metadata, safe local records |
| Book storage | `src/lib/storage.ts`, `src/lib/offline.ts` | Local persistence, cached assets and offline-safe removal |
| Private HF client | `src/lib/cloud.ts`, `src/lib/novel-paths.ts` | Authenticated catalogue, file access and upload planning |
| Server APIs | `functions/api/*`, `functions/_lib/*` | OAuth, owner grants, path allowlists, revision checks |
| Reader | `src/components/Reader.tsx`, `src/lib/chapters.ts`, `src/lib/chapter-virtual.ts` | Vertical EPUB reading, CFI, chapter navigation, theme styling inside iframe |
| Book metadata | `src/components/BookDetails.tsx`, `src/components/MasterControls.tsx` | Read-only imported genres vs personal edits, protected metadata changes |
| Collections | `src/lib/collections.ts`, `src/components/NovelCollectionPicker.tsx` | Nested tree, direct memberships, local/cloud merge |
| Publication and reading | `src/lib/publication-status.ts`, `src/lib/reading-status.ts` | These are distinct domains and must not be conflated |
| Home curation | `src/lib/home-curation.ts`, `src/components/EditorialHome.tsx` | Per-visit randomised featured book and recent-three active preview |
| Reviews and time | `src/lib/ratings.ts`, `src/lib/usage-analytics.ts` | Personal rating, comments and local usage statistics |
| Appearance and branding | `src/types.ts`, `src/lib/themes.ts`, `src/theme-palettes.css`, `public/branding/` | Six stable themes, Sun logo, font settings |

## Identity, files and migration compatibility

The **immutable novel ID** is a 24-character lowercase hexadecimal string. A title rename must not change the ID, cloud folder or sidecar keys. Source catalogue records own the actual EPUB path. Never infer an existing storage directory solely from its current title or URL.

Supported layouts include both:
- `data/novels/aaaaaaaaaaaaaaaaaaaaaaaa/source.epub` (legacy).
- `data/novels/bbbbbbbbbbbbbbbbbbbb - Martial World/source.epub` (readable label).

The readable label is a sanitised human aid, not a new identity. The app supports mixed catalogues after a historical migration (89 folders as of 14 November 2026). Neither a reader UI update nor an ecosystem extraction should perform another live migration. All path operations must pass the validator in `src/lib/novel-paths.ts` and backend catalogue policy; paths must not traverse between book folders, accept arbitrary extensions or bypass source-file ownership.

Additional assets can include original ZIP and cover images. Cover retrieval must validate safe paths, image type and file signatures, and cache real art. Never use external scraped art or fabricate a cover and claim it is source artwork.

**URL identity differs from storage identity:**
- `/`: editorial Home.
- `/library`: complete catalogue.
- `/currently-reading`, `/trying-out`, `/offline`, `/finished`, `/to-be-read`, `/analytics`: shelves/analytics.
- `/novels/<slug>`: book details.
- `/novels/<slug>/read` and `/novels/<slug>/read/chapter-N`: reader with optional explicit chapter.
- `/book/<id>` and `/book/<id>/read[/chapter-N]`: legacy aliases resolved to canonical modern routes.
- `/tags/<tag>`, `/authors/<author>`, `/collections/<id>`: scoped browsing (including permitted shelf subpaths).
- `/master-controls`: privileged maintenance entry.

Slugs are derived from the title and duplicate names use a stable short ID suffix. Current code does not provide a complete historical old-title slug registry after a rename. Do not promise old title-only links survive an arbitrary rename across new devices. ID-based legacy links remain the durable fallback.

## Book metadata contract

The canonical TS type is `LibraryBook` in `src/types.ts`. Key fields and semantics:

| Field | Meaning |
| --- | --- |
| `id` | Immutable primary key |
| `title`, `author`, `language`, `description` | Imported/source metadata |
| `chapterCount`, `originalFileName`, `sourceUrl`, `importedAt`, `size` | Source import context |
| `sourceTags` | Imported source genres, not directly deletable from novel details |
| `personalTags`, `userDescription` | User additions/override, currently device-local |
| `status` | Source **publication** status (Completed/Ongoing/Hiatus/Dropped) |
| `personalRating`, `personalReview`, `personalReviewUpdatedAt` | Personal review state, optionally synced |
| `shelfStatus` | Optional Trying Out marker |
| `progress`, `lastCfi`, `currentChapterNumber`, `currentChapterIndex`, `lastOpenedAt`, `currentChapter` | Reading cursor and activity |
| `completedAt` | Durable *personal* finished state, independent of publication |
| `progressUpdatedAt`, `pendingProgressSync`, `pendingReviewSync` | Timestamped/pending personal sync |
| `cloud` | Hosted book indicator |
| `coverPath` | Safe catalogue-declared private cover path |

### The two meanings of "complete"

1. **Publication status:** `Completed`, `Ongoing`, `Hiatus`, `Dropped`, set by source metadata or corrected in Owner-authenticated Master Controls. A completed publication is labelled **Story Complete** on the cover ribbon.
2. **Personal reading status:** Not started, Trying Out, Currently Reading, Caught up, Finished. Depends on progress, completed marker and publication rules. A serialised/paused novel at 100% may be *Caught up* rather than Finished.

The app deliberately prevents an ongoing/hiatus/dropped publication at the latest available chapter from silently being treated as a completed story. Inspect `isFinished`, `isCurrentlyReading`, `readingProgressLabel`, `withUpdatedReadingPosition` before changing shelf logic. A user marking the story's publication status as Completed does not mean they personally finished reading it.

## Storage and synchronisation boundaries

| Record | Remote private Dataset | Browser state | Guarantee |
| --- | --- | --- | --- |
| Catalogue metadata | `data/library.json` | Local book records / cache | Revision-aware protection for catalogue operations; not a reason to rewrite unrelated entries |
| EPUB, original ZIP, cover | Validated book directory | IndexedDB EPUB and cover caches | Download/cache independently of cloud master; ZIP not automatically cached |
| Reading cursor and progress | `data/personal/progress/<id>.json` | Book metadata, local pending flag | Timestamp reconciliation, offline retry; **not** fully transaction-safe cross-device conflict resolution |
| Rating, notes, Trying Out | `data/personal/reviews/<id>.json` | Locally saved and pending when offline | Limited timestamp reconciliation; edit conflicts still possible |
| Collections and hierarchy | `data/personal/collections.json` | `taiyou.personal-collections.v1` plus pending flag | Version-1 validated document, timestamp merge with tombstones; no guaranteed atomic multi-device merge |
| Personal tags and user summary | Not guaranteed synced by current deployed contract | IndexedDB book metadata | Device-local |
| Reader theme, typography | No normal cloud sync | Local preference store | Device-local |
| Usage analytics | No | `taiyou.usage-analytics.v1` | Device-local, estimated activity; no analytics server |

**Important:** A connected cloud indicator does not prove pending writes are safely committed. Check pending state, revision checks, error handling and any explicit confirmation. An automatic local retry must not silently discard another browser's changes.

**Unfinished sync project:** [Issue #34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) requests revision-safe personal-data concurrency. Closed PR #57 is **not merged**. Its design may be examined, but do not cherry-pick stale app files. Acceptance requires a **dedicated disposable** private dataset and two authenticated OAuth browser sessions, including stale-write rejection, selective recovery and backup verification.


## Bulk personal-state retrieval and migration (draft PR #110)

The hosted **novel catalogue** is `data/library.json`; it contains the full list and
basic metadata of every novel. Never perform N independent GET requests just to
display the All Novels shelf. The private, owner-only **personal state** consists
of reading progress, Finished markers, comments, ratings, Trying Out and
nested collections.

The previous startup code read `progress/<bookId>.json` and
`reviews/<bookId>.json` for every catalogue entry, generating two browser
requests per novel, including large numbers of ordinary 404s for unpublished
optional records. With 352 novels that was up to **704 speculative GETs**
in addition to the catalogue, covers and other operations.

The replacement, pending real-provider acceptance, uses:

1. **One catalogue GET:** `GET /api/library?action=file&path=data%2Flibrary.json`.
2. **One personal-state GET:** `GET /api/library?action=personal-bulk`.
   Response `{version:1, materialised:true, records:{<path>:{value,revision}}}`.
   Only existing sidecars are indexed, so missing IDs are not probed.
3. **Legacy migration once:** If `data/personal/state.json` is missing, the
   authenticated API enumerates the actual private HF tree at a *pinned dataset
   revision* and reads only existing v1 progress/review/collection documents.
   It validates every document, calculates opaque SHA-256 content revisions
   and returns a complete in-memory index. A separate same-origin
   `POST /api/library?action=personal-bulk` with
   `{"operation":"bootstrap"}` makes a parent-commit-checked addition of
   `data/personal/state.json`. No existing sidecar is deleted or rewritten.
4. **Selective personal updates:** `PATCH /api/library?action=personal` takes
   a whitelisted personal path, `baseRevision` and one validated v1 value.
   The server compares the observed revision, then commits the new sidecar
   **and index in the same HF parent-commit transaction**. Same-record racing
   edits receive 409 with the competing copy for review. An unrelated
   catalogue/record commit may be retried with a fresh pinned snapshot.
5. **No automatic content downloads:** Novel details use catalogue metadata;
   chapter/EPUB data loads on demand. A read-only EPUB fetch remains
   temporary in memory unless the user explicitly requests offline storage.

The aggregate is an **owner-private materialised view**, not a new public
catalogue, not a separate source of book identity, and not a replacement for
recoverable per-file sidecars. The API enforces authenticated OAuth, dataset
privacy, strict path allowlists, same-origin write headers, bounded document
and index sizes, immutable HF revision checks and no-store response headers.
Manual-token mode cannot safely write.

**Fail closed:** Invalid legacy documents, an incomplete HF tree listing,
oversized files, absent privacy checks, ambiguous commits and stale base
revisions stop migration/writes. Do not quietly drop records or mark pending
edits saved. The existing browser IndexedDB data and original sidecars remain
available for recovery.

This change shares Issue #34's two-device CAS and recovery release gates. Do
not deploy before the real disposable-dataset and isolated OAuth-browser
tests have passed; the simulated 352-title browser test alone does not
authorise production migration.

## OAuth and Owner authorisation

1. The user chooses Hugging Face sign-in from the Cloudflare app.
2. The official provider handles OAuth PKCE redirect and returns to `/api/oauth/callback`.
3. Pages Functions validate state and identify the authorised dataset owner (and private dataset), then seal tokens in an encrypted Secure/HttpOnly cookie.
4. The browser uses a same-origin session endpoint and `/api/library` for authenticated data calls. Do not expose the HF access token to React or browser storage.
5. Owner actions require an additional configured secret (`TAIYOU_OWNER_PASSPHRASE`), a time-limited privileged grant and server-side action checks. An Owner cookie is not the same as a generic HF OAuth login.
6. Ordinary reading, caching, personal collection membership and local cached-EPUB removal do not require the Owner passphrase.
7. Whole novel/collection deletion and privileged hosted corrections require the appropriate Owner checks and confirmation. Confirm before any production mutation.

Environment setup is described in [ACCESS_GATEWAY.md](ACCESS_GATEWAY.md). Never ask the owner to paste secrets into PRs, chats or unprotected workflows.

## Reader and offline lifecycle

1. On first use, an authenticated hosted EPUB or user-imported local file is loaded into the browser.
2. IndexedDB keeps the cached EPUB, cover and reading metadata. It is not the same as Cache Storage.
3. EPUB.js produces a chapter view in an iframe. The themed CSS and scrolling adjustments **must be registered inside that iframe**. Outer React CSS alone cannot change chapter text layout.
4. Progress records a CFI/chapter state; explicit chapter URLs take precedence over saved position when directly navigated.
5. Chapter Previous and Next controls belong at the bottom corners, with a centre chapter chooser and no paging-mode reader.
6. The generated service worker precaches the compiled public shell and supports same-origin offline launch once registered. **It must bypass private API and book fetches.**
7. A stored EPUB can be read without the network. New hosted downloads, remote metadata and original ZIP retrieval need connectivity and valid auth.
8. Clearing browser storage, browser eviction or changing hostname can remove offline books and local-only settings. It does **not** mean HF has lost the novel.
9. An offline EPUB can be cleared only when the backend verifies a hosted replacement; local-only or unverified copies must be retained. Whole-novel deletion follows an entirely different Owner-protected path.

Synthetic browser tests cover offline reload, cold launch and EPUB reading. They do not authenticate against the owner's real HF account, so avoid overclaiming their coverage.

## Private dataset safety and operations

- Read the catalogue revision before any hosted metadata update. Reject unexpected changes; do not force-write a stale catalogue.
- Avoid accidental duplicate IDs/titles and filename/path collisions; validate archive contents.
- Keep complete backups outside browser storage. HF Git history is not a substitute for a tested backup.
- Use the separate Novel Storage Controller for large bulk archives, backups and deliberate migrations; do not invent controller command names based solely on the library repo.
- Changes to public JS, Cloudflare deployment or the Hub must never add private EPUB files to build artifacts.
- Only a dedicated disposable HF Dataset may be used for destructive/concurrency acceptance tests.
- Never delete/recreate the owner's actual dataset. It was previously accidentally removed and restored; treat data loss prevention as the overriding operational requirement.

## Cross-repository relationships

The five planned application/source areas are Shared Core/Hub, Novels, Manga, Anime, and Movies & TV. The novel reader is the existing independent production service; experimental Shared Core components are not imported as a runtime dependency. Do not introduce shared authentication or storage because a sibling repo has a similar screen. Novel progress is chapter/CFI-based and cannot be repurposed as manga page number or video timestamp.

Any future extraction needs two proven consumers, a stable typed interface, standalone tests, a compatibility plan and a rollback. Never change this dataset's schema to match an unfinished Hub proposal.

## When source and documentation conflict

1. Check exact code and test at current `master`.
2. Check CI/deployment and any actual browser/device repro.
3. Explicitly record verified vs inferred findings.
4. Correct the stale document or implementation in a focused PR.
5. Retain historical records as historical, do not silently erase useful incident evidence.

See [Testing and release](TESTING_RELEASE_RUNBOOK.md) and [Operations and decisions](OPERATIONS_DECISIONS_AND_BACKLOG.md).
