> **Historical document (before 10 November 2026):** This file describes the former dev/master and Hugging Face Spaces setup. The active source is now GitHub `master`, the app is hosted on Cloudflare Pages, and the private Hugging Face Dataset remains in use. See [README](README.md) and [Standalone PWA operations](docs/STANDALONE_PWA.md) for current instructions.

# Project handover: Taiyou's Personal Library
Updated: 2026-11-08. Source of truth for current GitHub state: inspect remote repo, not this document alone.

## Mission
Build a private, beautiful, responsive web EPUB/ZIP novel reader with private Hugging Face-hosted book storage, then establish a reliable, tested CI/CD path from GitHub `dev` to private staging and controlled promotion from `master` to private production. Preserve the restored working production app at all costs. No automatic production deployment on ordinary pushes.

## Links and current state
- Private GitHub repository: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library
- Private production HF Static Space: https://huggingface.co/spaces/AdityaSreevatsaK/Taiyous-Personal-Library
- Private staging HF Static Space: https://huggingface.co/spaces/AdityaSreevatsaK/Taiyous-Personal-Library-Staging
- Separate private novel dataset: https://huggingface.co/datasets/AdityaSreevatsaK/Taiyous-Novels
- `master`: restored working v1.0.4 source; HEAD was `ba879cc9f908dde658a74404948e36cf5b5a84ce` before this document was saved.
- `dev`: same baseline + `STAGING.md` and a staging-targeted `scripts/deploy_prebuilt.py`; HEAD was `0f7d582ac42f464ed3984c8b1a51fc1e2a20fc8d` before this document was saved.
- GitHub repo visibility verified **private**, default branch `master`. Source imported with identical Git tree checksums: master `6db715501f944b857ec197f6fb98d27a8d47f618`, dev `52708cf66ed5e9f1236e6c24c5be22ba26350265` (before this document).
- Production website was rolled back through HF Space commit history to **v1.0.4**, HF revision prefix `9d146d8876`, and user explicitly confirmed **site is back to working**.
- Four novels are safely stored in the separate private HF dataset: The World Online (1356), She Is From The Countryside (624), True Martial World (1710), I Can Track Everything (907). Never touch/reupload them unnecessarily.

## Crucial CI/CD status (do not misrepresent)
- Only existing GitHub workflow as of last inspection: `.github/workflows/verify.yml`, running `npm install`, `npm test`, `npm run build`, and `npm audit --omit=dev --audit-level=high` for pushes/PRs on `master` and `dev`.
- The initial Actions runs both **failed before test steps ran**, and jobs showed no assigned runner/steps. References: master https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/42500697631 and dev https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/42500728610. Cause not definitively confirmed. Investigate account billing, Actions runner eligibility/settings and GitHub run UI before relying on CI.
- **NO deployment workflow has yet been committed**, and no working GitHub Actions -> HF automatic deployment has been verified. In preceding chat assistant discussed/reported drafting a Trusted Publisher-based pipeline and 20 offline regression checks; that work was **not visible in remote GitHub**. Treat it as an idea, not completed setup.
- Desired workflow: `dev` changes -> tests/build/security + real compiled-browser checks -> automatically deploy only to **private staging** after green checks. Production: explicit manual dispatch from `master`, review/confirmation and a successful verification gate; ideally promote exactly staging-tested artefacts, with rollback available. Strict branch and HF Space ID allowlists; protect against dev->prod deployment. HF Hugging Face Trusted Publishers / OIDC may avoid long-lived secrets; independently verify support and configure user-side trust settings if available. Do not place HF tokens in GitHub source. Never target the novel dataset from CI.
- Current `dev/scripts/deploy_prebuilt.py` is staging-specific and refuses deployment unless target ends in `-Staging` and is private. It uploads README and compiled `dist/`. Preserve this defence and add tests.

## Technical context
- React 18 + TypeScript + Vite + Vitest, EPUB.js, JSZip, idb and Hugging Face Hub browser API; default static HF Space build/hosting, separate HF dataset for book files.
- The restored v1.0.4 website supports private cloud library/catalogue and on-demand EPUB loading, local reading position/tags/settings. Reading data remains browser-local (IndexedDB); do not clear site data or assume it syncs.
- Later v1.2.x sources contained UI improvements (compact bookshelf, notes/search, 1-10 ratings, backup/restore, improved cloud reading), but they were **not successfully deployed** and should NOT be copied wholesale without review/testing.
- For no paid HF build credits, build the React app on GitHub or local machine and upload prebuilt static assets to Space. Private Spaces may reject external script/styles through 401 when viewed embedded. Previously working v1.0.4 asset-loading behaviour is the recovery baseline; investigate and test actual HF private Space context before changing packaging.
- Failed v1.2.3–v1.2.6 attempts inlined 800+ KiB JS into HTML, causing HTML-parser corruption, `SyntaxError: missing ) after argument list`, giant JS text printed as page content, external asset 401s, and validator false positives that interpreted strings in bundled JS as HTML tags. Automated tests passing did **not** imply real browser success. Do not repeat this packaging design without full compiled-browser tests. Never deploy to production as an experiment.

## Privacy & security
- Everything remains private: GitHub, production and staging Spaces, novel dataset. HF production deploy token was named `Taiyou-Personal-Library-Deploy`; dataset token named `Taiyou-Novels-Storage`. Tokens are local to user; never request, expose, hardcode, commit or copy them. If CI requires auth, prefer HF Trusted Publishers/OIDC or a strictly scoped staging-only credential, with appropriately protected environments. Production permissions separate.
- Do not commit EPUB, ZIP novels, credentials, .env, browser backups, personal reading data or node_modules.
- Staging should initially use an HF dataset **read-only** token and avoid book uploads; no mutating tests against the real dataset.
- Need protection against accidental public status and against deployment to the wrong Space. Keep verifiable rollback to prior working HF commit.

## Working style and acceptance criteria
- User is understandably frustrated by repeated failed releases. Do not say 'fully tested' unless the final exact build passed real browser rendering, bundle/network validation, app smoke tests, TypeScript/test/security checks, and staging deployment; distinguish tests done locally from tests requiring HF credentials.
- Prefer minimal manual intervention, concise practical instructions, production-safe defaults, CI automation and logs, and direct GitHub changes when permitted.
- Don't change production Space or `master` while working on staging improvements unless explicitly approved.
- User has Windows + Node/npm, Python, Hugging Face CLI and GitHub connection.

## Immediate next actions
1. Read current GitHub `master`/`dev` contents/branches and Action runs. Check the private staging Space still exists and is private.
2. Diagnose runner-less GitHub Actions failures. Do not merely retry without inspecting GitHub UI/account Actions/billing or documented limits.
3. Design, implement and commit staged GitHub Actions workflows and unit tests on `dev`, including Hugging Face auth/trust configuration instructions. Exclude production deployment automation until it is demonstrably safe.
4. Validate exact compiled website in a browser, including private HF auth/static JS loading, catalogue, opening actual privately held EPUB only with authorised user-provided credentials, chapter navigation and local progress.
5. Deploy only to staging once prerequisites and verification are green, collect user confirmation; promote to `master`/production only with explicit manual approval.
6. Re-introduce selected v1.2 improvements one at a time with independent tests and staging review.

Use this document as working context, but **verify live repository state**; it may have changed since it was written.
