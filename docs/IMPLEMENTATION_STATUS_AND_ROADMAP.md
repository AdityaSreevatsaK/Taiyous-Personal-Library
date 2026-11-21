# Implementation State, Active Work and Roadmap

> **Evidence snapshot: 21 November 2026.** This file is deliberately date-stamped. Do not infer that its PR status, production SHA, issue list or last deploy remain current. Re-fetch GitHub before changing anything. Never turn a proposed feature into a “shipped” capability simply because tests passed on a branch.

## Production and branch-of-truth ledger

| Subject | Verified status at snapshot |
| --- | --- |
| Production source | Public `AdityaSreevatsaK/Taiyous-Personal-Library`, branch `master` |
| Last checked production SHA | `d5555321987fa3d65ee9a2069883d02d6accd131` |
| Last completed Cloudflare deploy | [Deploy Application #44901311624](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44901311624), **success**, same exact SHA as `master` |
| Live URL | https://taiyous-personal-library.pages.dev/ |
| Private content store | HF Dataset `AdityaSreevatsaK/Taiyous-Novels` (not public repository contents) |
| Active unsolved sync issue | [#34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) |
| New bulk-state/cross-device candidate | [Draft PR #110](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/110), **not merged, not deployed** |
| Older sync foundation | [Draft PR #106](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/106), **not merged**; superseded by the integrated bulk work. Never accidentally merge both |
| Earlier proposal | [PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57), closed without merge; historical reference only |
| Production release tags | No owner-authorised `v1.0` GitHub release; package version `1.0.4` is not a shipped release tag |

### What is actually live

- The catalogue loads in bulk from **`data/library.json`**, then the UI filters/sorts existing metadata. There is no fixed list of novel titles in code.
- **Known performance defect:** `src/App.tsx` on `master` still loops over hosted novels and requests optional `reviews/<id>.json` and `progress/<id>.json` individually. On a 352-novel library this can mean up to **704 speculative personal-record GETs**, with ordinary 404s for absent sidecars. Concurrency is limited, but that does not remove round trips. **Do not say this was fixed in production.**
- Reading and direct reader bookmarks now use a transient verified EPUB Blob; they do **not** silently write to the permanent offline IndexedDB store. Local imports and explicit Save offline still persist. Historical auto-cached EPUBs remain preserved for safe removal by the owner.
- Homepage's centre **loaded** cover is the default featured novel; hovering/focusing another cover changes the author, title, synopsis and relevant links. The selected novel must always be pictured.
- Header is **Taiyou's Novel Library** (with approved Sun art). Main desktop scrollbar has a wider grip; nested controls remain compact.
- Six primary destinations in order: Home, Currently Reading, Trying Out, Available Offline, Finished, All Books. Analytics is accessed through Master Controls **without Owner password to view**; editing/deleting protected catalogue data still requires Owner authorisation.
- EPUB reading, status ribbons, nested collections, tags and local analytics follow the current [UX contract](UX_BEHAVIOUR_CONTRACT.md).
- Cloud progress/reviews/collections on `master` still have imperfect timestamp-based cross-device reconciliation. **Conflict-safe multi-device PATCH is not live.**

### Draft PR #110, what passed and what did not

**Implemented on branch `feature/bulk-personal-state-revision-sync-20261121`, not production:**

1. A versioned, private **bulk** `GET /api/library?action=personal-bulk` alongside the existing `data/library.json` catalogue.
2. First-access materialisation of an index from **existing** private sidecars, enumerated at a pinned HF commit, without deleting them. Later refreshes use that index, not hundreds of missing-ID probes.
3. Selective `PATCH /api/library?action=personal`, server-validated content revision and HF `parentCommit`, atomic legacy sidecar + index update, explicit 409 conflicts.
4. UI for comparing device/cloud copies, preserving unsynchronised progress/review/collection changes and deliberate conflict resolution.
5. Simulated unit/build, 352-title browser network regression, multi-browser conflict suite, offline and security verification.

**Real-provider evidence:** the dedicated disposable-HF integration run [#44921602074](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074) **passed** on the feature branch. It created a new private test dataset, verified privacy, migrated existing test records, tested stale-write rejection and selective PATCH, then deleted the temporary dataset. This is stronger than a synthetic test but **does not exercise two authenticated Cloudflare OAuth clients**.

**Still blocked before release:**

- Two genuinely authenticated browser sessions through an **isolated Cloudflare OAuth gateway** bound to the disposable/non-production HF dataset. Include a third-device competing edit, offline reconnect, existing Owner restrictions, pending progress/reviews/collections, save-retry ambiguity and explicit conflict choice.
- Confirm branch/production authority boundaries, backup and rollback drill, actual mobile/desktop behaviour and fresh exact-SHA Verify/CodeQL **after** any final fixes.
- Production schema/data migration or privilege/security changes need specific owner approval beyond standing approval to merge ordinary code. Do not repoint the live URL or substitute the production novel dataset for disposable acceptance.
- Keep draft PRs #106 and #110 unmerged until the remaining real acceptance requirements are satisfied. Avoid cherry-picking stale `App.tsx` wholesale.

## Prioritised roadmap

| Phase | Priority | Work | Acceptance / safety gate |
| --- | --- | --- | --- |
| A | P0 | Finish Issue #34 bulk state and revision-safe two-device sync | Real isolated OAuth + HF acceptance, no lost local/cloud edits, parent-CAS races, recovery, exact-SHA CI; only then separately approve production migration |
| B | P0 | Protect and verify independent **production** catalogue/EPUB/personal-state backups | Document actual restore drill, immutable IDs and expected book counts; never erase/overwrite source dataset as a “test” |
| C | P1 | Measure first-load request count, timing, cover bandwidth, reader cold start and memory on real 300+ title library | Baseline and after traces (mobile + desktop), record sample conditions; no invented percentage improvement |
| D | P1 | Audit server OAuth/Owner configuration, dataset privacy, storage limits and abuse protection after major changes | Negative gateway tests, CSP/OAuth metadata, current provider settings independently confirmed; no exposed tokens |
| E | P1 | Offline storage quota awareness, safe cancellation of Save all offline and recovery/export UX | Simulated quota errors, explicit opt-in, no automatic downloads or deletion of local-only copies |
| F | P2 | Incrementally split large `src/App.tsx` and `src/styles.css` orchestration/styles | Pure modules, same data and appearance, six-theme/mobile/offline/browser regressions |
| G | P2 | Old title-only slug aliasing and missing-cover/original-source provenance | Stable immutable-ID mapping, no ambiguous redirects and no invented sources |
| H | P2 | Accessibility and presentation refinements, reader/resume/browser history and empty/error states | Keyboard and touch, 200% zoom, contrast, real EPUB end marker, responsive controls |
| I | Optional | Cross-app Hub navigation or tested/versioned Shared Core UI | Separate owner choice; real second consumer and rollback; no shared novel/manga progress semantics |
| J | Optional, separately authorised | Wider personal metadata sync or global search across media | Privacy/security ADR, explicit data/consent boundary, migration and recovery plan |

Some work has already been partially addressed in earlier PRs; re-scope each phase against current GitHub issues and the actual code before starting. This is a prioritised **plan**, not a promise that every proposal was accepted or deployed.

## Delivery and maintenance rules

- **Normal:** current `master` → short-lived branch → focused tests/doc changes → PR → successful Verify and CodeQL → owner-authorised routine merge → *same SHA* `master` Verify + CodeQL → guarded automatic deploy → successful final Deploy Application job → production verification.
- **High risk:** explicit owner approval for destructive HF changes, private-data publication, security/Owner privileges and release tags. A feature-branch dry run is not production consent.
- **Network correctness:** Distinguish catalogue fetches, personal metadata, cover images, EPUB content and OAuth; report response counts, 404 causes, concurrency, cache policy and actual measured latency separately.
- **Agent reporting:** Exact branch, SHA, PR, tests, provider evidence, merge/deploy status, unverified real-device cases and next owner action. Never state “done in production” for an unmerged draft.

See [the product history](PRODUCT_VISION_AND_EVOLUTION.md), [architecture](ARCHITECTURE_AND_DATA_LIFECYCLE.md), [release tests](TESTING_RELEASE_RUNBOOK.md), [incident response](OPERATIONS_DECISIONS_AND_BACKLOG.md) and [documentation map](DOCUMENTATION_MAP.md).
