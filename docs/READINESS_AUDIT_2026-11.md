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

## PL-01 clock-skew remediation candidate — awaiting staging acceptance

**Draft PR #2: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/2**

The implementation keeps existing **version-1 progress, reviews and collections documents** readable and unchanged on the private dataset. It introduces a server-side content revision (SHA-256 of the exact JSON bytes) for each personal document, read at the private Hugging Face dataset's immutable revision, followed by a `parentCommit`-checked compare-and-set write. This avoids ordering changes by device-generated `updatedAt` values; those remain for local display/compatibility.

Browser IndexedDB retains the last observed revision per book and both copies when offline changes conflict. Collections retain an analogous revision/conflict in localStorage. Cloud Settings shows the competing notes, ratings, progress or collection memberships and requires an explicit choice of **latest cloud copy** or **this device's copy**, confirmed before any overwrite. An in-flight remote acknowledgement no longer clears unrelated edits made on this device.

**Compatibility constraint:** Older raw-token connections may still read private personal data but cannot safely publish personal edits using the new CAS protocol; the supported write path is the authenticated Cloudflare OAuth gateway. The ordinary upload endpoint now rejects unguarded personal sidecar writes. This is a deliberate fail-closed change; the reader can still operate offline and retains locally pending edits until OAuth is available.

**Verification:** `tests/personal-sync-gateway.test.ts`, `src/lib/revision-sync.test.ts` and `src/lib/personal-sync.test.ts` exercise 5-minute clock offsets, two competing devices, legacy version-1 migration, remote revision conflicts, intentionally choosing versions, and failed reads. The existing import/catalogue, PWA and browser smoke suites continue as release gates.

**Status: not yet accepted for production.** Source-level tests and the PR CI do not substitute for testing the server/real Hugging Face integration against a **disposable private dataset** with two separate browsers (one online and one offline), verifying recovery of an existing v1 note, then exercising conflict resolution for progress, reviews, and collections. Confirm a data backup first. Do not touch the owner's real collection during destructive/failure-injection exercises. Do not deploy this PR or create a v1.0 release without explicit authorisation.

## Deployment and release gates

- Development changes are committed to `master` and verified in CI; this document does not authorise production deployment.
- Test OAuth login, hosted additions, offline retrieval, cloud conflict/retry messages, and Owner-protected deletion against a **disposable private dataset**, never the real user's full novel collection, before applying destructive changes.
- Preserve offline EPUBs and local metadata throughout migrations.
- **No v1.0 tag or GitHub Release without explicit approval from the owner**, irrespective of successful CI.
