# Operations, Decisions and Backlog

Last reconciled: 21 November 2026, against master commit d774b9121999c15d233b144e522fee5959305cd1. Recheck live issues, workflows and code before acting; this is not live telemetry.

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
| Interactive OAuth consent/PKCE redirect E2E | Unverified | Isolated test injected authenticated sessions; did not run provider sign-in |
| Sync of every local preference | Not implemented by this change | Verify current code; do not promise universal sync |
| Real-device mobile acceptance | Unverified | Synthetic viewports are not physical-device acceptance |
| Dataset-wide backup/restore drill | Operational requirement; not evidenced by PR #110 | Required before destructive migration/deletion |
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

## Backlog and follow-up

1. High: dedicated end-to-end test for interactive HF OAuth consent, callback/state validation, PKCE exchange and session establishment in an isolated environment. Do not use production data for destructive tests.
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
