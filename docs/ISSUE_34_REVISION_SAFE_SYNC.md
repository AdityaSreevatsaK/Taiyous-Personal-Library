# Issue #34: Revision-safe personal data synchronisation

**Status:** Implemented and merged through [PR #110](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/110) on 21 November 2026. Merge commit: d774b9121999c15d233b144e522fee5959305cd1.

This document is retained as the implementation/acceptance record. It is no longer a pre-merge checklist. Recheck current master and workflow runs before treating this as current operational status.

## Delivered

- Authenticated GET /api/library?action=personal-bulk returns a validated index of existing progress, reviews and collections in one request.
- First-use migration enumerates existing version-1 sidecars at a pinned HF revision and non-destructively materialises data/personal/state.json using compare-and-set. Legacy sidecars remain recovery copies.
- Selective PATCH updates an individual personal record and aggregate index atomically under an expected content revision.
- Stale writes return conflict information; clients preserve competing copies and support explicit resolution.
- Normal catalogue refresh does not fan out into speculative per-book personal GETs.
- Offline edits/reconnection and client clock-skew reconciliation have regression coverage.

## Acceptance evidence

- [Verify/browser suite](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301096)
- [CodeQL](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301039)
- [Disposable private HF integration](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074)
- [Two-browser Cloudflare Pages + HF acceptance](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44924684751)

The isolated acceptance ran the shipping Pages Functions locally over HTTPS, using two distinct encrypted HttpOnly browser sessions and a uniquely disposable private HF dataset. It tested offline edits/reconnect, competing revisions, conflict approval and second-browser recovery. The temporary dataset was deleted. No production novel dataset was used.

## Explicit limitation

The acceptance did **not** drive Hugging Face's interactive consent/authorisation redirect or PKCE token-exchange flow. It validated authenticated sessions after they had been established. Interactive OAuth end-to-end coverage remains a separate follow-up.

## Compatibility and safety

- Existing v1 progress, review and collection documents remain supported.
- Existing sidecars are retained during index materialisation; do not delete them as routine cleanup.
- The materialised index is private data and must never be published in the app bundle or repository.
- The production dataset was not the disposable test target.
- Any future schema migration or destructive production operation requires a separately approved backup/rollback plan.

See docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md, docs/ISOLATED_TWO_BROWSER_ACCEPTANCE.md and docs/TESTING_RELEASE_RUNBOOK.md for current implementation and reproducible checks.
