# Operations, Decisions and Backlog

Last reconciled: 23 November 2026, against master commit d774b9121999c15d233b144e522fee5959305cd1 and PR #111 documentation review. Recheck live issues, workflows and code before acting; this is not live telemetry.

## Operational invariants

- Production source is master; app is Cloudflare Pages + Pages Functions.
- Public app shell; private HF Dataset AdityaSreevatsaK/Taiyous-Novels.
- Routine verified PR merge/deployment is pre-authorised. Destructive data changes, security/permission changes, tags/releases and sibling-repo changes are not.
- Merge, green CI, deployment dispatch and completed production deployment are different states. Verify exact SHA and run.
- Preserve immutable 24-character IDs, readable and legacy folder compatibility, EPUBs, personal sidecars and offline copies.

## Decision log

| Period | Decision | Rationale |
| --- | --- | --- |
| 10 Nov 2026 | Cloudflare Pages + Functions replaces HF Spaces hosting | Public PWA shell, server-side OAuth, offline support |
| 10-14 Nov | Keep private HF Dataset and immutable IDs; introduce readable folder names compatibly | Improve legibility without breaking old paths |
| 14 Nov | Sun branding and six persistent reader theme IDs | Consistent identity without preference migration |
| 18-19 Nov | Keep Novel Library independent from experimental Shared Core/Hub | Protect production service and data ownership |
| 19 Nov | Standing approval for routine verified merges/deployments | Reduce repetitive approval while retaining safeguards |
| 19-21 Nov | Separate publication ribbons from reading state; improve Home, collections, tags and reader | Accurate semantics and safer controls |
| 21 Nov | Bulk personal-state snapshot and revision-safe PATCH (PR #110) | Avoid request waterfalls and stale cross-device overwrites |

## Current implementation state

| Area | State | Evidence / boundary |
| --- | --- | --- |
| Novel catalogue, EPUB import/read, metadata and covers | Implemented | Current source and regression suite; private HF data not audited here |
| PWA/offline shell and local EPUB cache | Implemented | Verify browser/offline checks; device quota varies |
| OAuth gateway and owner-only operations | Implemented | Pages Functions and gateway tests; interactive provider consent redirect not covered by isolated two-browser test |
| Bulk personal-state GET | Implemented | PR #110 merged; one bulk snapshot replaces speculative per-ID GETs |
| Legacy sidecar bootstrap | Implemented | Revision-bound, non-destructive index; old sidecars retained |
| Revision-safe PATCH and conflict handling | Implemented | PR #110 merged; disposable HF two-browser acceptance passed |
| Real Hugging Face hosted OAuth consent/PKCE E2E | Unverified | PR #112 now covers mock-provider browser redirects and PKCE; real hosted consent and owner account sign-in still require manual acceptance |
| Sync of every local preference | Not implemented by this change | Verify current code; do not promise universal sync |
| Real-device mobile acceptance | Unverified | Synthetic viewports are not physical-device acceptance |
| Dataset-wide independent backup and local restore drill | Local read-only capture and synthetic integrity checks delivered in this workstream; live production backup remains unverified | Independent encrypted production archive and verified restore drill required before destructive migration/deletion |
| Historical HF Spaces/staging docs | Deprecated | Retain as history only |

## PR #110 and Issue #34 outcome

PR #110 merged on 21 November 2026 at 16:43 UTC. Merge commit: d774b9121999c15d233b144e522fee5959305cd1.

Implemented: one authenticated bulk personal-state snapshot; first-use materialised private index at data/personal/state.json bootstrapped from existing v1 sidecars at immutable HF revisions; old sidecars retained; selective revision-checked PATCH and compare-and-set conflict responses; explicit conflict resolution, offline recovery and clock-skew regression coverage.

Recorded passing evidence:
- [Verify/browser suite](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301096)
- [CodeQL](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301039)
- [Disposable private HF integration](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074)
- [Two-browser Cloudflare + HF acceptance](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44924684751)

The isolated acceptance used shipping Pages Functions locally, two distinct encrypted HttpOnly sessions, a uniquely disposable private HF dataset, offline edits, competing revisions, explicit conflict approval and second-browser recovery. The temporary dataset was deleted. It did not test interactive HF consent/PKCE redirect. These links are evidence for the tested commit, not future commits.

## Lessons from incidents

- Missing library.json does not prove an empty dataset. Inspect immutable dataset tree before bootstrap/upload.
- Pin reads to immutable provider revisions for CAS; never use mutable main/latest as write base.
- Client timestamps are not concurrency control. Clock skew can make stale data appear newer.
- HF tree enumeration is paginated. Incomplete listings must never become authoritative migration indexes.
- Do not probe each catalogue ID for absent personal records. Bulk retrieval avoids request waterfalls and speculative 404s.
- An upload success is not deployment health. Check workflow and public endpoint.
- IndexedDB, service-worker app-shell cache and private HF files are distinct stores.
- Keep secrets, private text and real user data out of CI artefacts/logs.

## Incident history and actionable recovery

The production private HF Dataset was previously deleted and recreated, disrupting catalogue/EPUB access. Consult [Private Dataset Backup and Recovery](PRIVATE_DATA_BACKUP_AND_RECOVERY.md) for safe local integrity checks and drills. Never treat a missing catalogue or a 404 as permission to initialise an empty replacement dataset: preserve cached originals, inspect the private dataset revision and tree, then check an independently restorable backup. The retired HF Spaces deployment is not the private Dataset.

Cloudflare Access previously redirected the public `/oauth-client.json` metadata URL and broke HF OAuth. Keep that metadata anonymously accessible while protecting private content through same-origin server sessions. Do not restore a blanket Access gate over that URL without a verified alternative.

### Missing book, cover or catalogue

1. Identify whether the missing item is a catalogue entry, dataset asset, IndexedDB record or offline-only EPUB; do not conflate these stores.
2. Check the authenticated `/api/library?action=session` response without logging credentials or private payloads.
3. Inspect the catalogue-declared immutable ID, `epubPath`, `coverPath` and validated readable or legacy directory. Use only authorised exact-path HEAD/GET requests.
4. If the browser still has an EPUB, preserve/export an independent copy before any recovery experiment. Do not delete local files to force a refresh.
5. If `data/library.json` is missing, **stop writes** and inspect a pinned HF revision, file tree, history and independent backup before considering any restoration. Destructive or migration-like recovery needs separate owner approval.
6. Report whether one cover, one EPUB, catalogue metadata or the entire collection is affected.

### OAuth session or cloud connection failure

1. Check that public `/oauth-client.json` returns HTTP 200, the expected small JSON body and correct client ID/redirect URI rather than HTML or a Cloudflare Access redirect.
2. Compare the callback to `/api/oauth/callback`; inspect state/PKCE and server errors without logging secrets or private responses.
3. Distinguish expired OAuth/Owner cookies, missing encryption configuration, unauthorised HF identity or missing dataset permission.
4. Do not change scopes, allowed owner, cookie flags or keys as a convenience. Rotating the session encryption key intentionally signs out existing sessions; see [Access Gateway](ACCESS_GATEWAY.md).
5. Cached offline EPUBs should remain readable when disconnected. Never put a raw HF token into persistent frontend storage as a workaround.

### Reader or layout regression

1. Identify viewport, theme, novel/chapter and whether the failure is outer React layout or EPUB content inside its iframe.
2. Reproduce with a synthetic EPUB, including narrow mobile and desktop geometry, chapter links, CFI restoration and first/last chapter.
3. For misplaced controls inspect CSS grid direct children, breakpoints and actual positions. For chapter title/end dividers inspect `Reader.tsx` iframe appearance hooks rather than only outer CSS.
4. Confirm the full-width divider and real end marker appear at maximum actual EPUB scroll, with the final paragraph clear of the fixed footer.
5. Retest all six theme IDs, focus/hover contrast and offline cached reading. Never alter EPUB source text or invalidate stored CFI paths to fix styling.

### Collection membership not persisting

1. Check the exact collection `bookIds`, tombstones and parent/child structure. Nesting does not imply inherited membership.
2. Confirm the UI shows a separate **Remove** action for an included book and **Add** for an absent one; test close/reopen and page reload.
3. Inspect local pending state and current remote collection content revision after authorised refresh.
4. If another device changed membership, preserve both copies and show explicit conflict resolution. Do not use cross-device timestamps as write authority or overwrite unrelated members.

### Unable to remove a downloaded EPUB

1. Confirm the operation is a device-local IndexedDB copy, not a hosted-novel deletion. No Owner passphrase is required for removing only a verified cache.
2. Verify an authenticated hosted EPUB replacement exists before clearing the cached copy; if not provable, **retain the offline EPUB**.
3. For bulk removal, retain the two-stage confirmation and copyable `REMOVE DOWNLOADS` instruction specified in [UX Behaviour Contract](UX_BEHAVIOUR_CONTRACT.md).
4. Distinguish EPUB IndexedDB, service-worker public shell cache and the private HF Dataset. Clearing one does not safely clear the others.

### CI, CodeQL or deployment failure

1. Check exact branch, commit SHA and first failing step; a green PR Verify is not a production deployment.
2. Investigate typed/unit/build, Chromium viewport/offline/CSP, CodeQL and dependency-audit failures without weakening checks or masking failures.
3. A stale verified SHA may be deliberately refused when master advances: verify the newest master push Verify and matching CodeQL, not the superseded commit.
4. Follow the auto-deploy dispatcher into the separate **Deploy Application** workflow. Confirm successful `deploy` job, exact deployed SHA and public OAuth metadata, not merely dispatch.
5. The inherited GitHub environment `standalone-staging` **deploys production**. Never use it as a harmless preview. See [Standalone PWA](STANDALONE_PWA.md).
6. Do not create bypass workflows, deploy unverified commits, force-push master or publish release tags without approval.

### Cross-device progress, review or collection conflict

1. Preserve the current local record, pending marker, last observed content revision and both competing remote values.
2. Determine whether the affected field is sync-supported progress/CFI/Finished, review/notes/Trying out or collections. Personal tags, custom synopsis, typography and usage analytics remain device-local.
3. Refresh the authenticated snapshot and compare opaque **content revisions**, not clocks. An unseen third-device write must require a fresh comparison.
4. Resolve through the app's explicit **cloud** or **device** choice. Keep edits pending if a write fails or the result is ambiguous; never reset a revision to force a successful save.
5. Use a disposable private dataset for concurrency/failure injection. PR #110's isolated test establishes the shipping API boundary, not interactive provider consent or live production state.

### Irreversible-action safety checklist

Before any destructive request, identify its exact scope: local cached EPUB, one personal document, named collection, whole hosted novel or full private dataset. Verify **all** of the following before proceeding:

- An independent, restorable backup exists for affected data and a rollback procedure has been tested.
- The caller has the correct current Owner grant where required, and this particular high-risk production operation has explicit approval.
- Immutable book ID, exact catalogue-owned stored path, expected current HF revision and the human-readable target are independently confirmed.
- The operation cannot delete unrelated EPUBs, ZIPs, covers, notes, progress, tags or nested collection membership.
- Actual private data never enters public repository files, CI logs, browser bundles or screenshots.

**If any answer is unknown, stop the mutation and continue read-only diagnosis.** Routine verified PR merges and application deployments are authorised separately from destructive private-data changes.

## Backlog and follow-up

1. High: perform real-provider interactive HF consent, callback and owner-session acceptance in the user's browser. Isolated mock-provider browser checks already pass (PR #112); do not use production data for destructive tests.
2. Medium: owner-device acceptance for mobile layout, offline launch and real reading/storage behaviour.
3. Medium: document and verify independent production dataset backup/restore before destructive operations.
4. Medium: reassess local-only preferences/metadata sync only if requested; do not silently expand scope.
5. Low: continue reconciling stale historical documentation. Recheck open issues and current code before claiming an item remains open.

## Troubleshooting

- Catalogue missing/corrupt: stop writes; inspect immutable HF revision/tree; preserve sidecars; do not initialise empty state over existing files.
- Stale conflict: preserve local and remote copies/revisions; never choose by wall-clock timestamp alone.
- Offline issue: distinguish service-worker shell cache, IndexedDB EPUB cache, network and private API. Never delete the only verified copy.
- OAuth issue: inspect same-origin Pages Functions, state/PKCE, cookie attributes and provider metadata. Do not relax validation.
- CI/deploy issue: inspect exact SHA and first failing job. A dispatch is not a completed deployment.
