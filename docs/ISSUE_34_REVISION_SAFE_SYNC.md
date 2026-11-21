# Issue #34: Revision-safe personal data synchronisation

**Status:** Bulk state and revision-safe sync integrated on draft [PR #110](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/110), superseding the prior [PR #106](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/106); **not merged or deployed**. The production application and private `Taiyous-Novels` dataset remain untouched by these changes.

## Implemented on current master baseline

- `functions/_lib/personal.ts` and `/api/library?action=personal` enforce OAuth-authorised, private-dataset, allowlisted version-1 JSON reads and compare-and-set (CAS) writes.
- Per-document SHA-256 revisions and Hugging Face `parentCommit` prevent two devices from overwriting an unobserved update. Stale writes return 409 with the current record, while ambiguous failures leave edits pending.
- `src/lib/personal-sync.ts` and `collections-sync.ts` reconcile progress, explicit Finished status, ratings, notes, Trying Out and nested collections without cross-device wall-clock ordering.
- Preserve local and remote versions, expose a side-by-side comparison in Cloud Settings, and require explicit user confirmation before choosing a winning version. A third-device revision arriving during the decision prevents an unseen overwrite.
- Retain current reader layouts, catalogue paths, immutable IDs, offline EPUBs, Owner actions and the live refresh/in-flight edit protection. Raw-token mode is read-only, and the old unrevisioned sidecar-upload route refuses writes.
- Automated synthetic gateway/unit tests, local refresh race tests, and a two-browser simulation are included in normal `Verify novel reader` CI. They use fabricated data and no private credentials.
- `.github/workflows/verify-hf-disposable.yml` can be dispatched explicitly on this draft branch for the separate real-HF parent-commit check; it must report **BLOCKED** rather than claim success when its dedicated secret is missing.

## Mandatory acceptance before merging

1. **Real Hugging Face check:** Use only a distinct, short-lived token and the automatic `taiyou-disposable-sync-*` private dataset created by `scripts/hf_disposable_integration.py`. Confirm expected writes, 409/412 stale-parent rejection, privacy and cleanup. No production token or data.
2. **Real OAuth integration:** Test two genuinely authenticated browser sessions through an **isolated Cloudflare OAuth gateway configured for a disposable dataset**, not the fixed production endpoint. Include a third-device write, concurrent notes/progress/collections edits, offline reconnect, conflict comparison and selective resolution. The current production-origin and fixed-dataset restrictions must **not** be bypassed to force a green result.
3. **Release safety:** Re-run current-sha Verify and CodeQL, mobile/desktop/offline regressions, production auth/Owner denial tests, backup restoration checks and rollback review.
4. **No merge, deployment or release tag** before all gates have documented passing evidence. A green simulated CI run alone is insufficient.

## Required owner action for the HF test

1. Create a separate Hugging Face test token with the minimum privileges needed to create and delete a **new private test dataset**. Do not reuse or broaden the production novel-storage token.
2. In GitHub repository **Settings > Secrets and variables > Actions**, add the token as `HF_DISPOSABLE_TEST_TOKEN`. Never paste it into chat, an issue, a PR or logs.
3. In **Actions > Verify Disposable Hugging Face Dataset > Run workflow**, choose the branch `fix/revision-safe-personal-sync-current-master-20261121`. Run and inspect the result. The helper creates its own uniquely named dataset and deletes only that dataset afterwards; no manual dataset creation is required.
4. The real two-browser OAuth acceptance needs a separately isolated preview and authorisation. This is **not** permission to repoint the live application to a test dataset.

## Rollback and preservation

- The draft PR is never merged while the real acceptance gate is blocked. Closing it leaves live code and remote data unchanged.
- Before any future deployment, export independent progress, review and collection recovery records and confirm an independent dataset backup. Do not delete or replace any production catalogue or EPUB.
- On a conflict/error, preserve both local records and remote snapshots, leave pending flags set and allow a later explicit retry.

## Bulk personal-state extension (PR #110)

- Initial refresh loads all owner-private personal records in one
  `personal-bulk` GET, with one `library.json` catalogue GET.
- The first authenticated access migrates existing **present** v1 sidecars
  into a private materialised `data/personal/state.json` index using a
  compare-and-set bootstrap. Existing sidecars are never deleted.
- Subsequent selective PATCH commits the sidecar and its indexed version
  atomically. Stale updates retain both device/cloud versions for explicit
  conflict resolution.
- Browser regression uses 352 catalogue novels, 351 with absent progress/
  reviews, and asserts zero speculative ID-specific GETs.
- The real provider gates **still apply**: isolated HF bootstrap/PATCH and
  two authenticated OAuth browser clients. Keep this in draft until passed.
