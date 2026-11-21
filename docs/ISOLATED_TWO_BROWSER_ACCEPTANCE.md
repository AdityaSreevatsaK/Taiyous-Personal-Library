# Isolated two-browser Cloudflare + Hugging Face acceptance

The two-session acceptance suite lives on the PR #110 branch. It is an **opt-in real integration test**, not a replacement for routine synthetic unit or browser smoke checks.

## What is real, and what is isolated

- The GitHub workflow creates a **unique, private, disposable Hugging Face dataset** under a restricted test token and guarantees only that uniquely named dataset is eligible for deletion in the Python `finally` block. The test cannot select the live `Taiyous-Novels` dataset.
- The normal TypeScript Cloudflare Pages Functions and production-built React client run via **local Wrangler Pages** under self-signed **HTTPS**, not the public production domain. Only a **temporary copy** of two server constants is changed, to set its local origin and exact disposable dataset ID. Source files checked into Git remain unmodified.
- Each of two separate Playwright browser contexts gets a **distinct, AES-GCM-encrypted, HttpOnly, Secure, host-only session cookie** backed by the real restricted HF test token. The **shipping** Pages Functions decrypt, validate owner identity and server-side privacy, read the dataset and perform checked HF commits. A third, anonymous context must receive HTTP 401.
- The browser test performs an actual disconnected IndexedDB edit, reconnect, real PATCH from device B after device A observes its older revision, the server's rejection of an unseen competing update, explicit second approval, selective progress/review/collection conflict resolution, and reload on device B. It asserts that the bulk API is used and that no speculative per-ID GET waterfall appears at start.
- All test catalogue entries and personal data are **fabricated**. The workflow never downloads or accesses original EPUBs or personal notes from production. Never print session values, access tokens or live data in logs. The local temporary Pages directory, including its generated session-key file, is removed after the run.

## Limitations of this evidence

The suite exercises **real signed owner sessions and real HF** at the shipping API boundary. It deliberately **does not drive Hugging Face's interactive browser consent, authorisation-code/PKCE redirect, or token-exchange flow**. Signing into the public production application remains a separate integration concern; no claim of provider-interactive OAuth coverage may be made on the basis of this test. The test also does not provide permission for production dataset migration or destructive operations.

## Reproducing safely

Only the opt-in [Verify Disposable Hugging Face Dataset](../.github/workflows/verify-hf-disposable.yml) workflow may run this integration with the restricted GitHub repository secret `HF_DISPOSABLE_TEST_TOKEN`. It performs `npm ci`, `npm run build`, installs Wrangler and Playwright Chromium, then runs `scripts/hf_disposable_integration.py`, which seeds the temporary dataset and invokes `scripts/isolated_two_browser_acceptance.mjs` before cleanup.

For a failing test, check the exact CI job step, fix the issue on the feature branch, and rerun against a **fresh** disposable dataset. Do not paper over a failure by skipping a conflict assertion, mocking the private API in this real test, weakening Secure cookies, disabling owner checks or repointing production OAuth.

### Important real defect this test exposed

In November 2026, a second browser sometimes retained progress 79 despite Hugging Face having freshly accepted progress 80. The local timestamp (9300) was greater than the legitimate remote timestamp (1700), and `reconcileCompletedCloudRefresh` incorrectly treated it as newer despite an updated **remote content revision**. The fix gives a new checked cloud revision priority over older, fully-synchronised local timestamps while still preserving genuinely concurrent local edits. Both the real browser test and a focused clock-skew unit test guard against regression.

Use [Implementation Status and Roadmap](IMPLEMENTATION_STATUS_AND_ROADMAP.md) for the currently approved release gate, and inspect fresh workflow conclusions before stating that testing passed or production changed.
