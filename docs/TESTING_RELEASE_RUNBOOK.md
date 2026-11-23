# Testing and Release Runbook

Last reconciled: 21 November 2026. Confirm current workflow files and latest run conclusions before each release.

## Local development

CI uses Node.js 22. Install from the lockfile and use package.json scripts:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

Build performs TypeScript project compilation, Vite production bundling, icon generation and offline asset generation. Avoid casually rewriting the lockfile.

## Verification workflow

.github/workflows/verify.yml runs on PRs to master and pushes to master. Inspect the live workflow for exact steps. It currently includes TypeScript/Vitest, production build and privacy checks, OAuth metadata and fail-closed API checks, Pages Functions compilation, CSP/security headers, production dependency audit, Chromium desktop/mobile/offline smoke, simulated two-context sync/conflict checks, CSP and hostile EPUB security checks, and public OAuth metadata diagnostics.

CodeQL is separate. A green Verify alone does not mean CodeQL passed.

### Automated isolated OAuth browser acceptance (mock provider)

The normal Verify workflow executes `node scripts/isolated_oauth_browser_acceptance.mjs` against **shipping Cloudflare Pages Functions** running in a temporary local Wrangler Pages HTTPS environment. A narrowly pinned, short-lived self-signed certificate is trusted only by its isolated browser. The temporary test copy replaces only the public origin, private dataset identifier, Hugging Face token API base URL and authorisation redirect target, all verified by exact-string guards. The permanent application source, production Cloudflare environment and private novel Dataset are untouched.

Chromium follows the shipping `/api/oauth/login` redirect across browser origins to a **temporary certificate-pinned HTTPS mock consent provider** on loopback, in place of the real HF authorisation service. A separate loopback-only HTTP token/identity fixture validates one-time authorisation codes, PKCE S256 verifier/challenge matching and client/redirect identity, then simulates access token, whoami and private-dataset responses. Positive coverage checks the encrypted Secure/HttpOnly session and protected `action=session`, reload persistence, CSRF-resistant logout and sign-out. Negative coverage checks mismatched state, denied consent, invalid PKCE, missing scope, unrelated owner and inaccessible synthetic dataset. No production HF token, novel, or data migration is involved.

**Evidence boundary:** this is a genuine browser + Pages Functions protocol test with a *simulated HF provider*. It does **not** exercise the external Hugging Face live consent application, registration/CIMD acceptance, real authorisation-code exchange, or a credentialed production login. Those remain a separate owner-driven, non-destructive manual acceptance gate. Do not report a green simulated test as full provider-interactive OAuth acceptance.

## Personal-state integration acceptance

PR #110 merged on 21 November 2026. It added bulk personal-state retrieval and revision-safe PATCH. Coverage includes:
- One bulk personal GET for a large catalogue, with no speculative per-ID personal GET waterfall.
- Non-destructive immutable-revision bootstrap from existing v1 sidecars.
- Preservation of legacy records and complete paginated enumeration.
- Payload validation, selective PATCH, stale revision rejection and compare-and-set races.
- Two isolated authenticated browser contexts against shipping Pages Functions locally over HTTPS and a disposable private HF dataset.

Opt-in workflow: .github/workflows/verify-hf-disposable.yml. It requires a dedicated HF_DISPOSABLE_TEST_TOKEN permitted to create/delete disposable private datasets. Never substitute the production dataset token. The helper creates a unique dataset and deletes only that dataset. Inspect the workflow and scripts before execution; a green run is not evidence if the token was absent or the integration step skipped.

Evidence recorded for PR #110:
- [Verify/browser suite](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301096)
- [CodeQL](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301039)
- [Disposable private HF integration](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074)
- [Two-browser acceptance](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44924684751)

The two-browser acceptance did not exercise Hugging Face interactive consent/PKCE redirect. It validates the authenticated-session boundary after two independent encrypted sessions were established. Keep this distinction explicit.

## Release process

1. Work from a short-lived branch based on latest master.
2. Run relevant local tests and review the full diff.
3. Open a PR; require Verify and CodeQL success on the proposed change.
4. Routine verified merges/deployments are covered by standing owner authorisation. Merge only after required checks pass.
5. After merge, verify current master SHA and push-based Verify and CodeQL runs for that exact SHA.
6. Confirm auto-deploy-verified-master.yml dispatched the guarded deployment for the same SHA.
7. Confirm the final Deploy Application workflow completed successfully. Dispatch, build or merge alone is not deployment proof.
8. Where possible, inspect the public app and OAuth metadata. Record sign-in or real-device paths not manually exercised.

Never force-push, bypass checks or create one-shot release workflows. Do not publish a version tag/GitHub Release without explicit owner approval.

## High-risk operation boundaries

Routine code/documentation PRs and verified deployments are pre-authorised. This does not authorise production HF dataset/catalogue/sidecar mutation or migration, bulk source EPUB/cover deletion, OAuth/Owner permission changes, publication of private data, release tags/GitHub Releases or sibling-repository changes. Obtain explicit approval, verify independent backup and test in non-production first.

## Manual acceptance matrix

| Area | Checks |
| --- | --- |
| Anonymous | Public shell loads; private APIs/data remain denied |
| Authenticated | Session and private catalogue load; no token in browser bundle/logs |
| Reader desktop/mobile | Correct chapter, theme, typography, controls, end marker and no clipping |
| Home | Current featured cover and latest-three reading shelf |
| Tags/collections | Add/remove semantics, alphabetical tags, nested membership and reload persistence |
| Offline | PWA cold start and cached EPUB after disconnect; do not remove only copy |
| Sync | Competing edits, explicit conflict resolution, offline reconnect and second-device recovery |
| OAuth | Automated mock-provider browser redirect/callback/state/PKCE/session/logout plus separate real Hugging Face consent, owner permission and protected catalogue login on a non-destructive manual path |

## Failure triage

- Type/build/test: fix root cause; never disable regression.
- Browser: inspect assertion, viewport, URL, console/network and artefacts; do not paper over real behaviour.
- OAuth metadata: check status, Content-Type, client ID, redirect URI, Pages routing and Cloudflare Access.
- CodeQL/dependency: inspect advisory and dependency path; keep gates fail-closed.
- Offline: distinguish service-worker shell cache from IndexedDB EPUB cache and remote API.
- Deploy: inspect exact SHA, final deploy job and public endpoint; failed/unknown deploy is not a release.
- HF inconsistency: stop writes, inspect immutable revision/tree, preserve copies and obtain approval before repair mutations.

See docs/ISOLATED_TWO_BROWSER_ACCEPTANCE.md and docs/HF_DISPOSABLE_INTEGRATION.md for provider test detail.
