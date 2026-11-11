# Personal Library production-readiness remediation (11 November 2026)

Scope: **only** `AdityaSreevatsaK/Taiyous-Personal-Library`. This follows the two uploaded deep-research reports, but compares their findings against the current repository rather than assuming the reports' historical snapshots are unchanged. No changes to the Storage Controller or Novel_Library repositories are part of this work.

## Implemented and CI regression-tested

| Finding | Library-side action | Verification |
| --- | --- | --- |
| Production-readiness PL-01 (ordinary catalogue replacement bypasses Owner mode) | Generic authenticated upload can only **add** a canonical novel or attach its first missing ZIP. It rejects arbitrary replacement/removal of catalogue entries, novel-file overwrites and unlisted paths. Normal imports do not need Owner mode; full deletion uses the existing separate Owner-verified route. Legacy manually entered tokens cannot publish novel/catalogue changes through this UI. | `tests/catalogue-safety.test.ts`, `tests/catalogue-upload-gateway.test.ts`, `tests/hosted-delete-gateway.test.ts` |
| Production-readiness PL-02 (lost update on catalogue writes) | Read the exact HF dataset revision and catalogue snapshot. A guarded `commit` uses `parentCommit`; conflicting or stale writes return HTTP 409. The server constructs the new listing from its snapshot, never trusts a client-provided wholesale replacement. | `tests/catalogue-upload-gateway.test.ts` |
| Production-readiness PL-03 (missing catalogue treated as empty) | Empty catalogue is accepted only when an authenticated, revision-pinned tree probe proves no `data/` content exists. Orphaned files and malformed catalogue JSON are recovery errors; manual-token fallback performs an equivalent tree probe. | `tests/catalogue-upload-gateway.test.ts`, `tests/cloud.test.ts` |
| Adversarial PL-02 (unbounded cloud refresh fan-out) | 5-request worker pool for per-book notes/progress, preserving return order; bounded retry on transient read failures only. | `src/lib/network-pool.test.ts` (1,000-item test) |
| Adversarial PL-03 (silent background progress failures) | Show a Needs sync status, preserve pending flags and display the last progress error in Cloud Settings. Refresh cloud remains the manual retry action. | Existing browser/CI checks; add targeted failure-injection browser coverage before v1.0 |
| Adversarial PL-04 (offline persistence overstatement) | Await browser `storage.persist()`; distinguish persistent storage from best-effort cache and advise independent backups. | `src/lib/offline.test.ts` |
| Production-readiness PL-04 (upload-size mismatch) | Preflight 70 MiB/file and approximately 75 MiB/request, with guidance to use the Storage Controller when larger. | `tests/cloud-upload-limits.test.ts` |
| Production-readiness PL-05 (unlocked JS dependencies) | Commit npm `package-lock.json`, use `npm ci` in verification and deployment. | GitHub Actions Verify novel reader |
| Production-readiness XR-01 (mutable GitHub Actions tags) | Pin checkout, setup-node, setup-python and artifact actions to immutable SHAs observed in successful runs. | GitHub Actions Verify novel reader |

## High-priority unresolved issue

**Adversarial PL-01 — cross-device clock skew.** The current Version 1 personal progress, review and collection documents contain `updatedAt` values originating on devices. Source-level merge decisions are still timestamp-based and can therefore choose stale data when device clocks differ or when two offline clients edit simultaneously.

**Do not claim this issue fixed merely by limiting refresh concurrency or improving retry visibility.** A proper fix should use a backward-compatible server-revision/compare-and-set protocol, track each device's last seen per-record revision, preserve conflicting versions instead of discarding them, and present a deliberate choice when offline edits conflict. Add tests with two simulated devices skewed by at least five minutes and concurrent writes; validate recovery of existing version-1 notes before deployment.

## Deployment and release gates

- Development changes are committed to `master` and verified in CI; this document does not authorise production deployment.
- Test OAuth login, hosted additions, offline retrieval, cloud conflict/retry messages, and Owner-protected deletion against a **disposable private dataset**, never the real user's full novel collection, before applying destructive changes.
- Preserve offline EPUBs and local metadata throughout migrations.
- **No v1.0 tag or GitHub Release without explicit approval from the owner**, irrespective of successful CI.
