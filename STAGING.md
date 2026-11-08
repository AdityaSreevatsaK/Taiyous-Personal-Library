# Staging CI/CD setup

This branch is separate from the restored production v1.0.4 baseline. No workflow in this branch deploys to production or writes to the novel dataset.

## What is committed

- `.github/workflows/deploy-staging.yml` triggers on `dev` pushes and manual dispatches from `dev`.
- `validate` runs TypeScript checks, unit tests, production dependency audit, a Vite build, package checks and a Chromium smoke test of compiled desktop/mobile views.
- `deploy` runs only after `validate` succeeds; it reuses its uploaded dist artifact and authenticates solely to the staging Space through Hugging Face Trusted Publishers.
- `scripts/deploy_prebuilt.py` checks that the staging Space is private, then uploads only README and dist content. It does not touch the separate novel dataset.
- No automatic production deployment exists.

## Required one-time setup

1. **Fix GitHub Actions runner eligibility:** In GitHub repository Settings > Actions > General, ensure Actions and GitHub-hosted runners are allowed. Check account Settings > Billing and licensing > Actions usage, billing/payment and spending limits. Earlier runs 42500697631 and 42500728610 failed before getting a runner; the exact cause is not established by the job metadata.
2. **Add a Hugging Face Trusted Publisher:** Open the *private staging Space* Settings > Trusted Publishers and add GitHub Actions with:
   - Repository: `AdityaSreevatsaK/Taiyous-Personal-Library`
   - Branch: `dev`
   - Workflow: `deploy-staging.yml`
   - Write capability (NOT the read-only option)
   - **Do not** add this trust configuration to production Space or dataset.
3. In GitHub Settings > Environments create `staging`. No long-lived HF token is required. Keep `staging` limited to the `dev` branch if branch restrictions are available.
4. Trigger the `Verify and deploy private staging` workflow from `dev` (or push a change to `dev`).
5. Check both jobs complete and inspect the live private staging Space through the authenticated HF app page. The local browser test cannot validate authenticated HF asset delivery or private novel access.

## Release and recovery

- Do **not** merge `dev` to `master` or deploy production based solely on a passing local Chromium smoke test.
- A staging release requires live browser verification: no missing asset requests or 401 errors, cloud catalogue connection with a read-only dataset token, opening an existing EPUB, chapter navigation and preserved reading progress. Do not change or upload real novels during these checks.
- Keep the last-good staging Space commit ID. If a staging build fails live verification, roll back the staging Space using its Hugging Face commit history. Preserve the production v1.0.4 Space commit `9d146d8876`.
- GitHub workflow artifacts are retained 14 days. The publication step copies the exact tested `dist/` artifact; it does not rebuild it.

## Limitations

- The original repository did not contain `package-lock.json`. Current npm installation therefore does not yet have fully reproducible dependency resolution. Add a reviewed lockfile and switch to `npm ci` after generating it with working npm registry access.
- Playwright does not currently test private HF authentication, EPUB interactions or browser-local progress persistence. Those still need additional dedicated integration tests and live staging validation.
- There is no production deployment workflow; this is intentionally a staging-only CI/CD change.

## CI retry

A new push to `dev` was requested on 2026-11-08 to re-test GitHub-hosted runner availability. No production promotion is implied by a successful staging run.
