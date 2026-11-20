# Testing, CI, Deployment and Acceptance Runbook

**Current as of 20 November 2026.** Read [AGENTS.md](../AGENTS.md), [AI agent playbook](AI_AGENT_PLAYBOOK.md), [Architecture](ARCHITECTURE_AND_DATA_LIFECYCLE.md) and [UX contract](UX_BEHAVIOUR_CONTRACT.md). This document describes the current GitHub/Cloudflare flow, not retired Hugging Face Spaces staging.

## 1. Production vs test data

- **Production source**: GitHub `master`.
- **Production app**: `https://taiyous-personal-library.pages.dev`, Cloudflare Pages project `taiyous-personal-library`.
- **Production novel data**: private Hugging Face Dataset `AdityaSreevatsaK/Taiyous-Novels`. Do not write/delete this dataset in CI, smoke scripts or code examples.
- **Synthetic CI**: In-memory/mock data and generated EPUB samples; explicitly not the owner's private library.
- **Disposable real-cloud acceptance**: Requires a separate private test dataset and properly scoped, short-lived credentials with no rights to production. This is a separate gate, not evidence implied by ordinary CI.

The package's current `version` value is `1.0.4`, but the owner has **not** approved a public `v1.0` tag or GitHub Release. Never infer a release from the package version.

## 2. Local development baseline

GitHub Actions uses Node.js 22 and Ubuntu 24.04. Windows with a normal local Node/npm installation works for normal app development; a WSL environment is not required by the app.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Optional production preview after building:

```sh
npm run preview
```

`npm run build` runs the TypeScript project build, Vite, approved icon checks/build and offline service-worker build. The output is `dist/`. Do not hand-edit compiled assets. The private Cloudflare Functions live in `functions/` and need separate compilation for complete deployment.

For changes affecting real browser behaviour, reproduce using the browser smoke suites and test on an actual mobile/desktop browser where possible. The GitHub Actions workflow installs Playwright and Chromium without committing its temporary browser tooling. Do not introduce paid external services or credentials into CI.

## 3. Verification map

| What it protects | Canonical command/file | Required outcome |
| --- | --- | --- |
| Type contracts | `npm run typecheck` | Strict TS build is green |
| Domain logic | `npm test` | Vitest passes, including new regression tests |
| Static PWA | `npm run build` | Generates compiled assets, offline worker and icons |
| Deployment privacy | `python scripts/check_deployment_package.py` | No leaked private data/credentials in `dist/` |
| Production dependencies | `npm audit --omit=dev --audit-level=high` | No unsafe production advisories |
| Development advisories | `node scripts/check_dev_audit.cjs` with JSON input, plus `check_dev_audit.test.cjs` | Unexpected HIGH/CRITICAL fails closed |
| Browser workflow | `scripts/browser_smoke.mjs` | Desktop, mobile, novel reading, Home, links, offline cold start and advanced search |
| Actual Cloudflare CSP | `scripts/csp_browser_smoke.mjs` | CSP-protected deployment-like Pages runtime works |
| Malicious EPUB | `scripts/epub_security_smoke.mjs` | Crafted EPUB content cannot run arbitrary scripts/event handlers |
| Private API | `tests/access-gateway.test.ts` and gateway suites | Auth/path/owner cases deny by default |
| Storage compatibility | `tests/readable-folder-*.test.ts` | Legacy and readable paths, safe folder ownership |
| Synced personal state | `src/lib/*sync*.test.ts`, collection tests | Existing timestamp and pending behaviours remain correct |
| Static source scanning | `.github/workflows/codeql.yml` | CodeQL JavaScript/TypeScript passes |

Do not treat unit-test success as proof of real OAuth or actual two-device conflict handling.

### Browser cases that must not regress

- All eight primary routes plus Home, tag, author, collection, Master Controls, and legacy book route.
- Browser title naming: `TNL - Page Name`.
- Real cover and fallback, tile sorting, muted publication ribbon.
- Home: random hero and distinct floating covers, preview of **three latest in-progress**, View all goes to full shelf.
- Novel details: tags in A–Z, immediate newly added tag placement, no delete crosses on details, save with confirmation.
- Collection picker: explicit Add/Remove, saved nested membership persists after reload, new-to-old toast stacking.
- Reader header: contents/theme/preferences stay top-right, title centred, mobile collision-free.
- EPUB iframe: correct body width, themed chapter title band, full-width 2px black/white heading rule and an actual range-measurable end marker (not a CSS-only pseudo-element). Scroll to the maximum **actual `.epub-container` scrollTop** and check the real last paragraph clears the fixed footer, with the end divider visible and space below it on desktop/mobile.
- Reader: Previous left, centred chapter chooser, Next right, direct chapter URL, Back/Forward, CFI restore and no horizontal overflow.
- Offline: downloaded EPUB can be read with network disabled; public app shell cold launches after service worker registration; local-only copies cannot be accidentally bulk removed.
- Cloud denied state, public OAuth JSON, CSP headers, no secrets in assets.

When adding a bug fix, add the exact regression that was previously missed. For layout, assert measurable geometry. For user-state changes, persist, reload and verify.

## 4. GitHub workflow anatomy

### Verify novel reader (`.github/workflows/verify.yml`)

Trigger: PRs targeting `master` and pushes to `master`.

Runs:
1. Checkout pinned action, Node 22 and deterministic `npm ci`.
2. Vitest unit tests, production build and package privacy scan.
3. OAuth client metadata validation.
4. Local Wrangler Pages checks for restrictive CSP/security headers and real public client metadata JSON, not a fallback HTML page.
5. Private Pages Function compilation and "unauthorised request fails closed" API test.
6. Production dependency audit.
7. Browser smoke with synthetic EPUB at desktop/mobile including offline cold start, and CSP/EPUB security browser suites.
8. Development advisory inventory with fail-closed exception logic.

Do not bypass any failed step, use `|| true` to mask an unexpected security issue, or declare green based only on early successful steps.

### CodeQL security analysis (`.github/workflows/codeql.yml`)

Runs on PR, master push, manual dispatch and weekly schedule. Extended JavaScript/TypeScript queries. Match the exact SHA when declaring a commit verified.

### Auto deploy verified master (`.github/workflows/auto-deploy-verified-master.yml`)

After a successful **push-based** Verify workflow on `master`:
- Confirm the verified SHA equals **current** master.
- Wait for the **CodeQL push scan of that exact SHA** to succeed.
- Refuse superseded or failed commits.
- Dispatch existing `deploy-standalone.yml` with `publish=true`.
- Its own success only means it **requested a deploy**, not that the site changed.

**Expected stale-run refusal:** When two PRs merge near each other, the older verified commit can be refused because master has advanced. This is a good guard, not proof the application is broken. Check whether the latest current SHA completed its own deployment.

### Deploy Application (`.github/workflows/deploy-standalone.yml`)

Manual workflow_dispatch also used by the dispatcher; requires `master`. With `publish=true` it:
- Re-checks TS, unit tests, production audit, PWA build, private-data packaging and real offline browser boot.
- Uploads a validated `dist` artifact and stages production security headers.
- Compiles Cloudflare Pages Functions.
- Deploys exact `master` commit with Wrangler to Cloudflare Pages, including same-origin private API.
- Confirms public `/oauth-client.json` returns a small JSON object without Cloudflare Access interception.

The job runs in GitHub environment **`standalone-staging`**, but that historical environment name is **production** for the current workflow. Do not deploy a test build there assuming it is a harmless preview.

The Cloudflare environment needs restricted `CF_ACCOUNT_ID`, `CF_API_TOKEN` and `CF_PAGES_PROJECT`, plus production Cloudflare secrets for OAuth and Owner mode. The secrets should be configured in the provider UI, never printed or written to Git.

## 5. Normal implementation and release procedure

1. Verify current `master`, existing PRs and the user's constraints.
2. Create a short-lived feature/fix/docs branch from current master.
3. Make the smallest correct change; preserve public contracts and user data.
4. Add regression tests for the reported behaviour; run as much validation as the environment permits.
5. Inspect the exact diff: no bundled novel files, secrets, unrelated refactors or accidental deletion.
6. Open a clear PR: problem, exact change, risks, tests, data/security impact and rollback. Cite related issue if appropriate.
7. Wait for **required PR Verify and CodeQL** on that PR head SHA. Diagnose failures rather than ignoring them.
8. Under standing owner approval, **merge routine, verified changes** (unless the user tells you to pause). No further prompt is required for routine merges.
9. Wait for successful matching `master` Verify and CodeQL, auto dispatcher and complete **Deploy Application** run. If master advances, evaluate the latest commit rather than deploying stale code.
10. Verify production hostname and OAuth public metadata; for UI or reader fixes use manual/actual-device checks where possible. Never claim a real private account check unless you performed it.
11. Report links, SHA, merged/released state and outstanding limitations. **Do not create GitHub release tags** absent explicit owner approval.

### Routine merge vs approval-required actions

Routine approval includes code and documentation PRs with checked safety and verified automatic Cloudflare deployment.

**Separate explicit owner consent is required for:**
- Production private HF Dataset deletion, bulk rewrite, schema migration, EPUB move/rename, unverified novel deletion.
- Changes to authentication policy, OAuth scopes, Owner mode, passphrase protections, public/private access model or secrets.
- Releasing actual private content, changing repository/dataset visibility, or publishing personal data.
- Disabling test/security checks, bypassing branch safety, force-pushing master.
- New version tags / GitHub Releases, especially `v1.0`, or unrelated sibling-repo changes.

When an approval-gated operation is needed, stop only that operation. Continue harmless analysis or isolated testing where appropriate.

## 6. Manual acceptance matrix

| Scenario | Minimum safe manual checks |
| --- | --- |
| Anonymous visitor | Shell can load, private dataset/API does not leak |
| Owner logged in | Cloud badge/session, remote catalogue loads, exact title/cover available |
| Reader desktop | Chapter correct, themes readable, header/footers positioned, end whitespace |
| Reader mobile | No clipping, readable width/font, chapter selector, offline cached reading |
| Home | Three latest active, correct View all, random featured cover choices |
| Personal tags | Add, immediate A–Z, confirm and reload, remove only in Master Controls |
| Collection | Add/remove, nested path, reload, notifications, no accidental book deletion |
| Metadata correction | Owner auth, specific field changes; EPUB and progress unchanged |
| Offline | Cold launch and cached EPUB after disconnect; no unverified offline-file deletion |
| Security | Private endpoints denied without session; no token in JS or logs |
| Cross-device | If required, two actual authorised browsers and disposable backend; **not covered by routine CI** |

A human owner may validate personal taste or real-device appearance, but automated agents should not imply that action was taken when only CI passed.

## 7. Disposable HF integration and outstanding gap

`.github/workflows/verify-hf-disposable.yml` is the test-only workflow intended for a dedicated, short-lived HF token; it is **not** a normal production pipeline. If `HF_DISPOSABLE_TEST_TOKEN` is missing, the workflow records a **blocked/skipped real test** even if the overall run appears green. It references an immutable historical test helper commit for PR #57 and must be reviewed before adopting in a new sync project.

[Issue #34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) requires a current-master revision-safe sync implementation with:
- Real disposable private dataset read/write and conflict/CAS tests.
- Two authenticated browser sessions via Cloudflare OAuth against an isolated dataset.
- Concurrent edit, stale write, no data loss, backup recovery, security and offline verification.
- No production novel dataset or real owner secrets in test fixtures.

**Do not merge an old proposed sync PR based on simulated success alone.**

## 8. Failure triage and recovery

- **Unit/type/build fail:** Find the first meaningful error and fix source or test assumption. Never disable the test. Check whether a changed import is unused or a fixture uses a stale slug.
- **Browser smoke fail:** Read the exact failing step, browser size, URL, timeout, network mode and screenshot/artifacts if present. Identify whether failure is functional or a brittle test assumption; only adjust an assertion when the intended behaviour is independently verified.
- **OAuth metadata fail:** Inspect public `/oauth-client.json`, Content-Type, client ID, allowed redirect, unwanted Access 302 and Pages Functions. Do not weaken OAuth validation.
- **CodeQL or dependency fail:** Inspect real advisory and path. Do not use forced upgrades or disable gates. Withdrawn advisories can be documented and closed only after fresh audit evidence.
- **Offline cold launch fail:** Check origin, installed worker and cached shell and EPUB; verify both online prime and offline new page.
- **Stale deploy failure:** If SHA mismatch, let new master run supersede; do not bypass the exact-commit guard.
- **Cloudflare upload succeeded but verify failed:** Treat deployment as **not confirmed**, inspect the public endpoint, correct, and release again only through safe gates.
- **Private dataset inconsistency:** Stop mutating operations, take non-destructive inventory/backup, identify catalogue vs files vs cached browser state, preserve history and seek consent for recovery mutations.

## 9. Traceability and audit trail

For each PR, record:
- What the owner asked for, how it maps to an explicit acceptance criterion.
- Which files and contracts changed.
- Which tests were **actually run** and what their limits are.
- Any known pending HF/OAuth manual integration verification.
- Merge SHA, master Verify, CodeQL, dispatcher, Deploy Application outcome.
- Whether public production was manually checked.
- Any security, storage migration, PWA or revert/rollback considerations.

Do not use generic "done" language when the work is only committed, a PR is merely open, or the release is still verifying.

**Related:** [Operations runbook](OPERATIONS_DECISIONS_AND_BACKLOG.md) | [Access gateway](ACCESS_GATEWAY.md) | [Standalone PWA](STANDALONE_PWA.md).
