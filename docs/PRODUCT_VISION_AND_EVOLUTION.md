# Product Vision, Brainstorming and Evolution

> **Owner-intent and decision history, reviewed 21 November 2026.** This is a narrative record, not a claim that every idea below has been implemented. Verify current behaviour against `master`, [the UX contract](UX_BEHAVIOUR_CONTRACT.md), and [the implementation status](IMPLEMENTATION_STATUS_AND_ROADMAP.md). The repository source is public: do not place private novels, personal notes, tokens or production data in this document.

## Original vision

**Taiyou's Novel Library** (formerly presented as “Taiyou's Personal Library”) is a **private-by-data, personal-first web-novel collection and EPUB reader**. Its owner wants one attractive, dependable home for books rather than a third-party reading website or a generic file browser.

The underlying product goals are:

1. **Library ownership and integrity.** Import, catalogue, read, organise, annotate and back up the owner's actual EPUB/ZIP novels. Preserve files, original metadata, covers, immutable identity and the ability to recover from mistakes.
2. **Immersive long-form reading.** Fast vertical-scroll chapters, reliable resume/Next/Previous, correct chapter order, legible typography and a consistent experience on Windows desktop and Android/mobile.
3. **An inviting, distinctly literary interface.** Approved Sun logo, refined editorial home, real cover artwork, calm theme palettes, subtle visual effects, hover/focus behaviour, six saved themes and no heavy or distracting UI.
4. **Useful personal organisation.** Currently Reading, Trying Out, Available Offline, Finished and All Books; case-insensitive tags and genres; independent named/nested collections; 1–10 ratings and comments; careful distinction between story publication status and personal reading completion.
5. **Offline and privacy as first-class needs.** Public installable PWA shell, private authenticated data store, deliberate offline EPUB saves, recovery-friendly local storage and no leaking private text or credentials.
6. **Owner agency and safety.** An Owner-protected control surface for destructive catalogue operations, explicit confirmations and recovery, with routine low-risk actions remaining easy to use.
7. **Maintainability.** Clear ownership boundaries, testable modules and documented rules so future engineers and AI agents can improve the application without repeating earlier failures.

The key design principle is **a cosy, useful reading library built around actual books**. The app must not invent cover images, confuse public source-code hosting with private books, or sacrifice a correct reader for an attractive homepage.

## Ideation, alternatives and decisions

| Discussion / alternative | Owner direction / current contract | Why |
| --- | --- | --- |
| Hugging Face Spaces vs separate browser app | Retire Spaces app hosting; deploy public Cloudflare Pages + same-origin Functions; keep books in a **private HF Dataset** | Reliable PWA shell, OAuth server boundary and offline startup without exposing data |
| Owner-maintained source catalogue vs querying each book on every shelf | `data/library.json` is the authoritative bulk catalogue; filter/sort existing metadata locally | Stable identity, responsive browsing, no hard-coded title list or speculative per-ID catalogue GETs |
| A long list of primary destinations | **Six primary destinations**: Home, Currently Reading, Trying Out, Available Offline, Finished, All Books; remove To Be Read from navigation and place Analytics inside Master Controls without requiring an Owner password merely to view it | Reduce visual clutter while preserving older routes and a complete All Books view |
| Static hero description vs independent/random cover carousel | Display three genuine covers; **the centre loaded cover is the default featured story**; hover/focus/tap previews another cover and updates title, author, synopsis and both links | Prevent the featured text describing an unrelated fourth novel; see merged [PR #107](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/107) |
| Loud “Completed” ribbon vs publication context | Soft diagonal **Story Complete / Updating / On Hiatus / Dropped** ribbons, independent of the user's Finished shelf | Avoid falsely implying that the owner has finished reading |
| “✓ Added” collection toggle vs explicit membership | Show passive state plus explicit **Add** and **Remove**; reversible, saved after reload; nested collections are supported | Predictable personal organisation without accidental deletion |
| Deleting tags on novel details vs separate maintenance | Browse-only combined imported/personal tag chips, case-insensitive A–Z; add personal tags on details, remove through Master Controls | Preserve source genres and avoid accidental tag loss |
| All active books on Home vs short reading desk | At most **three most recently active** in-progress books, with a link to the full shelf | Keep Home useful and uncluttered |
| Different per-screen branding vs consistent identity | Approved sapphire/gold Sun variants, and **Taiyou's Novel Library** wordmark; keep familiar theme identifiers | Strong identity across Home, details, reader and PWA |
| Thin inaccessible main scrollbar vs accessible grip | Wider desktop page scrollbar, compact internal scrollbars | Easier interaction without inflating dropdowns or chapter lists; merged [PR #108](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/108) |
| Reading automatically becomes permanent offline download | Ordinary read, bookmark reload and export fetch EPUB bytes **temporarily in memory**; permanent IndexedDB EPUB only from explicit Save Offline / Save All Offline / local import | Prevent unexpected disk growth and unexplained books in Available Offline; merged [PR #109](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/109) |
| Per-novel progress/review probes vs bulk state | Proposed `personal-bulk` snapshot plus revision-safe selective PATCH; **draft PR #110 is NOT deployed** | Avoid hundreds of optional-file 404s and preserve cross-device edits; see [status and roadmap](IMPLEMENTATION_STATUS_AND_ROADMAP.md) |
| Single shared app for novels, manga, anime and films | Keep **Novel Library independent**; optional Hub navigation and later validated, versioned, reversible shared UI | Each medium has different reading/completion data; avoid unnecessary coupling |

Some brainstorming was deliberately rejected or postponed: fake/generated cover substitutes, a heavy dashboard-style home, excessive neon/green controls, whole-book deletion without Owner confirmation, uncontrolled public API access, broad cross-app SSO, arbitrary data migrations, forced Shared Core adoption and making media libraries share one progress schema.

## Evolution and verified milestones

| Period | Significant progress and lesson |
| --- | --- |
| Initial library iterations, before November 2026 | Local EPUB/ZIP import, browser catalogue, reader, themed reading, collections/tags/ratings and device-local state shaped the personal library |
| 10 November 2026 | Cloudflare Pages + Functions PWA replaced historical HF Spaces deployment; origin-specific offline cache and public OAuth client metadata became critical |
| 10–14 November | Private HF Dataset recovery and readable-folder migration; **89 historical folders** adopted human-readable names without changing stable book IDs or historical ID-only compatibility |
| 17–20 November | Iterative polish: nested collections, publication ribbons, concise header/navigation, tags, verified download removal, page titles, smaller Home reading desk, reader chapter-end/divider fixes, security/performance review, cover-cache hardening and automatic verified production deployments |
| 20 November | Repository audit recorded bounded EPUB/ZIP handling, rate-limited cover fetches, guarded indexed updates and remaining real-world performance/security verification requirements |
| 21 November | [PR #107](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/107) aligned featured hero text with an actually displayed cover; [PR #108](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/108) updated novel-specific branding/scrollbar; [PR #109](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/109) stopped silent offline caching. All three merged to `master` and were deployed through the verified workflow |
| 21 November, **unreleased** | [Issue #34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) and [draft PR #110](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/110) integrate a versioned bulk personal-state snapshot and conflict-aware PATCH. Synthetic CI/CodeQL and a disposable **real HF integration test** passed ([run](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074)); two **genuinely authenticated, isolated OAuth browsers** remain unverified. Do not claim production uses the new protocol |

Timeline is an orientation, not an inventory of every PR. To establish exact deployment status, inspect the HEAD SHA, successful Verify/CodeQL runs and final Cloudflare Deploy Application run.

## Incidents and lessons learned

- **Private dataset accidentally deleted and restored.** Deployment infrastructure (an HF Space) is not the same thing as the **dataset**. Never clear/delete/recreate a live dataset during UI maintenance. Require independent backup and recovery evidence before any storage operation.
- **Cloudflare Access intercepted OAuth metadata.** OAuth's public client metadata must be anonymously retrievable as small valid JSON. Secure book APIs with server-side sessions instead; test the actual deployed route.
- **Speculative personal-file GETs caused large 404 waterfalls.** `master` correctly loads the book catalogue as a list but then probes absent progress/review files individually. Fixing only the visible errors is insufficient; the draft bulk-state migration addresses the topology and preserves original records.
- **Simultaneous device edits risk overwrites.** Timestamps alone do not establish authoritativeness under clock skew. Preserve both versions, use checked HF parent revisions and require explicit conflict selection; never silently discard pending local edits.
- **Reader layout changes regressed actual EPUB content.** EPUB.js measures its own iframe DOM. CSS pseudo-elements alone did not ensure bottom whitespace; test with real rendered long chapters and stable CFI content markers.
- **Over-caching changed user intent.** A reader fetch is not permission to save a full EPUB permanently. Separate transient reading, explicit offline storage, file export and user import in both code and documentation.
- **Frontend labels misrepresented source and personal state.** Story publication Complete does not mean personally Finished; a visual “Added” tag without Remove is not a reversible collection operation.
- **UI feedback is holistic.** Zoom, contrast, actual cover proportions, desktop/mobile parity, focus order, cloud indicator appearance and theme continuity matter as much as unit tests.
- **A green pull request is not a deployed site.** The guarded pipeline compares exact `master` SHA and CodeQL, rebuilds the public shell and private Functions, and verifies OAuth metadata. Report the last successful **deployment job**, not merely a merge or dispatch.

## Priorities and non-goals

The approved objective is **reliable reading and ownership**, not maximal feature count. Prioritise security, lossless data access, actual measured latency and accessible long-form reading. Keep the apps for manga, Hub, anime and films separate unless a deliberately scoped integration has evidence from real consumers. Do not add external commercial APIs, invent new cloud providers, or turn the app into a generic social reading platform without a new owner decision.

For actionable priorities and release blockers, use [Implementation Status and Roadmap](IMPLEMENTATION_STATUS_AND_ROADMAP.md), not this chronology. For source boundaries, use [Architecture and Data Lifecycle](ARCHITECTURE_AND_DATA_LIFECYCLE.md). For user-visible behaviour, use the [UX Contract](UX_BEHAVIOUR_CONTRACT.md).
