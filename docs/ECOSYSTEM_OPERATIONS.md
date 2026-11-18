# Novel Library Development and Controlled Release Checklist

## Development environment
Node.js 22+, npm, Git and Chromium for browser checks. From a trusted clone:

~~~powershell
git clone https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library.git
cd Taiyous-Personal-Library
npm ci --no-fund
npm run typecheck
npm test
npm run build
~~~

`npm ci` uses the existing committed lockfile. The build also generates PWA/offline assets. Do not replace current CI with generic scaffold CI.

## Source and branch control
Use latest `master` and short-lived feature branches. Review PR diff and security effects; no force pushes, no automatic release tags, and no product changes solely to suit other apps. Closed/unmerged proposals like PR #57 must not be treated as deployed.

## Production release
`.github/workflows/deploy-standalone.yml` is a manual `workflow_dispatch` with `publish` boolean and master-only gate. It validates types, unit tests, prod dependency audit, synthetic offline browser cold-start, security header packaging and private-data exclusions before deploying to Cloudflare Pages. Cloudflare credentials reside in restricted GitHub environments; never copy them to other apps or hardcode secrets.

**Release sequence**
1. Approve scope and test on a feature branch, open PR.
2. Verify CI, mobile/desktop, EPUB read/resume, offline start, imports and protected owner operations.
3. Merge to `master` only after passing required checks.
4. Run the manual workflow from `master` with Publish enabled **only after owner approval**.
5. Verify live Cloudflare URL, actual stored offline reader path and private session on at least one mobile and one desktop browser.
6. Record commit, deployment run URL, scope and rollback procedure.

## Backup and rollback
Source code rollback through revert/last good deploy; user data rollback through validated private dataset revision/backup, never through deleting the dataset. Test imports and two-device conflict behaviour with disposable datasets; do not use real novel records in test jobs.

## Operational boundaries during new ecosystem build
No need to redeploy Novel Library when the Shared Core hub or other media repositories change. Hub integration is optional and link-only initially. Never add a dependency requiring hub uptime to read an offline EPUB. Do not change Cloudflare Pages settings/privacy without owner permission.

## Observability and honesty
Measure request volume and bundle growth; minimise redundant HF calls and avoid background retries against blocked sources. Report missing real-HF integration gates, unavailable secrets, staged-only work and dependency advisories honestly. Update `docs/CAPABILITIES.md` if actual functionality changes.
