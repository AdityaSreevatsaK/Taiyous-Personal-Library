# Issue #34: Safe multi-device personal synchronisation

**Status: development-only draft. NOT deployed.**

Scope: `AdityaSreevatsaK/Taiyous-Personal-Library` on the current `master` baseline. Do not touch, re-upload, delete or migrate the production Hugging Face dataset. The existing `version: 1` progress, review and collection documents remain supported.

## Problem

Personal progress, reviews and collections currently reconcile mainly by timestamps. Device-clock skew or simultaneous edits can overwrite unobserved changes. A green simulation alone cannot validate the Hugging Face commit or OAuth browser path.

## Development in this draft

- Isolated `src/lib/revision-sync.ts` makes upload/adopt/conflict decisions from **observed content revisions**, not remote timestamps.
- Isolated `functions/_lib/personal.ts` implements allowlisted progress/review/collection JSON reads and compare-and-set writes using a verified private Hugging Face dataset, immutable SHA snapshot, SHA-256 content revision and Hugging Face `parentCommit`.
- Synthetic tests cover stale writes, clock skew, v1 reading, rejected malformed/unauthorised requests and non-private dataset refusal.
- **These foundations are not yet connected to the deployed App, Cloudflare gateway or UI.** Nothing here changes live personal-data writes.

## Next integration work, before merge

1. Port the current-master transport and browser state integration from historical closed draft PR #57, not its entire old App/Reader/UI. Add **per-record saved revision**, retained local and remote conflict snapshots, pending flags and explicit user choices. Protect Finished, Trying Out, ratings, notes, collections and offline EPUBs.
2. Integrate via the same-origin OAuth Cloudflare gateway. Forbid unrevisioned writes and token-based bypasses without an independently reviewed migration. Do not enable production writes until backend tests, threat modelling and rollback are approved.
3. Test absent files, independent concurrent edits, rapid reopen, offline/reconnect, failed/ambiguous writes, competing unseen third-device change and stale UI acknowledgement. Preserve other sidecars and immutable IDs.
4. Run normal Verify, CodeQL, actual desktop/mobile/offline browser regressions and master-equivalent build.

## Non-negotiable real-world acceptance

1. The owner creates a separate disposable **private** Hugging Face dataset, a short-lived fine-grained credential, and adds it as the GitHub Actions secret `HF_DISPOSABLE_TEST_TOKEN`. The production dataset and its token must never be used for tests. Secrets never appear in logs or chat.
2. Execute an actual private-Hub parent-commit CAS test proving both a successful write and a rejected stale update.
3. Exercise **two independently authenticated browser clients through the Cloudflare OAuth gateway**, against the isolated dataset. Verify simultaneous progress, review and collection edits, explicit conflict choices, unseen third-device writes and recovery.
4. Demonstrate backward compatibility, offline reading, Owner-mode restrictions, backup and rollback. Document exact passing runs and accepted behaviour.

**Release gate:** Leave Issue #34 open and this PR in draft until *all* tests above have been observed. Green synthetic CI is insufficient. Do not publish a release/tag or claim production synchronisation is resolved.
