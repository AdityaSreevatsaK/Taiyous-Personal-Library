# Standalone Cloudflare PWA — single-master operations

Taiyou's Personal Library is hosted as a public **application shell** on Cloudflare Pages. The private Hugging Face **Dataset** `AdityaSreevatsaK/Taiyous-Novels` holds novels and selected synchronised reading metadata. The two legacy Hugging Face **Spaces** are not used for serving the Cloudflare application.

## Current configuration (10 November 2026)

- **Source branch:** GitHub `master` only; `dev` was merged and retired from active development.
- **Current installed app address:** https://dev.taiyous-personal-library.pages.dev
- **Production Pages root:** https://taiyous-personal-library.pages.dev — hostname migration not yet performed.
- **Why the old `dev` address remains:** The original installed PWA stores its EPUBs, reading positions and preferences under that exact browser origin. Changing the hostname without a data transfer would mean an initially empty library and a new install. The GitHub source is `master` even while the Cloudflare alias remains `dev`.
- **GitHub environment:** `standalone-staging` is an older environment name retained solely for its working Cloudflare deployment secrets; it does not imply that another app or branch is being maintained.
- **Manual release:** GitHub Actions → `Build and optionally deploy standalone PWA` → branch `master` → enable **Publish**.
- **Automated checks:** `.github/workflows/verify.yml` on pushes to `master`. The manual deploy workflow also performs type-check, unit/security tests, build, package scan, and a synthetic-EPUB browser offline cold-launch test before publishing.
- **Legacy HF Space deployment:** `.github/workflows/deploy-staging.yml` is removed from master. No application deployments to Hugging Face Spaces remain in the master workflow.

## Security and privacy

Only built HTML, JavaScript, CSS, service-worker assets and icons are uploaded to Cloudflare. No EPUBs, ZIPs, private notes or Hugging Face dataset credentials are placed in the public build.

The user connects directly to the **private** HF Dataset using a dataset-scoped token entered into the browser. The token is retained in React memory only and must be re-entered after refresh. Never put the token in Cloudflare environment variables, GitHub secrets, URLs or screenshots.

Novels and local notes cached on an installed browser profile remain available to anyone with access to that unlocked profile. Protect the device and keep backups; browser storage can be cleared or evicted.

## Deploying from master

1. Develop and commit on `master`; review the `Verify novel reader` run.
2. Open `https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/workflows/deploy-standalone.yml`.
3. Select branch `master`, tick **Publish**, then run.
4. The workflow uses existing GitHub environment secrets `CF_ACCOUNT_ID`, `CF_API_TOKEN`, and variable `CF_PAGES_PROJECT=taiyous-personal-library`.
5. The `wrangler pages deploy` command currently specifies `--branch dev` **only to preserve the exact user-facing Cloudflare origin**. Do not change the target branch without an intentional hostname/data migration.
6. Verify the live app online, saved EPUB reading, and a fresh offline startup on the device.

## Safely moving to a permanent Cloudflare hostname

Changing `dev.taiyous-personal-library.pages.dev` to `taiyous-personal-library.pages.dev` creates a **different browser origin**. IndexedDB, Cache Storage, service workers, saved EPUBs, and local-only tags, custom summaries and settings do not migrate automatically.

Before changing the Pages production branch or deploying only to a different hostname:

1. On each device, connect online and let pending cloud reading progress, reviews and collection edits synchronise. Back up any local-only personal tags, summaries and preferences manually, and download EPUBs/original ZIPs to an independent backup where needed.
2. Keep the old installed app intact. Change Cloudflare Pages Direct Upload project's **production branch** to `master` via Cloudflare's Update Project API; Direct Upload projects do **not** expose this as a standard production-branch selector in dashboard settings. Only perform this with the user's Cloudflare deployment token in a controlled GitHub Action or another authenticated client; never share the token.
3. Update the master workflow to deploy `--branch master`, publishing the app at the Pages root URL.
4. Open the new hostname online, connect the private dataset and verify the catalogue, reading progress, ratings and collections. Use **Save all offline** again because the EPUB cache is origin-specific.
5. Install the PWA from the new hostname and test offline cold startup and a novel.
6. Only after confirming this works, retire the old PWA shortcut and its locally cached data. If preserving old URLs, optionally leave the old preview deployment accessible during the transition.

The retired GitHub `dev` branch can be deleted after verifying the `master` deployment workflow; deleting that Git branch does **not** erase the separate Cloudflare `dev.` alias or its existing browser storage. Do **not** clear the old origin's browser data or uninstall its PWA until the new hostname is proven.

## Hugging Face cleanup

The two historical Spaces `Taiyous-Personal-Library` and `Taiyous-Personal-Library-Staging` can be deleted **after** confirming no user workflow still opens them and ensuring the private Dataset and an independent novel backup are present. Deleting a Space must not delete or modify the separate **`Taiyous-Novels` Dataset**. Space deletion is irreversible unless backed up. The Cloudflare application does not need either HF Space.

## Known limitations

- Reading without network requires an already-cached EPUB and installed shell; first-time cloud novel downloads require connectivity.
- Reading progress, reviews and collections sync only with a valid private HF token and connectivity. Local edits may queue for retry.
- Personal tags, custom summaries, display preferences, and local book files are not automatically synced across devices.
- Concurrent edits are last-timestamp-based, not transactionally conflict-free.
- Browser storage can be evicted. Keep independent EPUB exports and ZIP backups.
