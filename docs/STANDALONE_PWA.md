# Standalone offline reader deployment (dev only)

This is the setup for **Taiyou's Personal Library as an installed PWA**, separate from the Hugging Face Space wrapper. It keeps Hugging Face as the **private novel dataset backend**. No EPUBs, API tokens, ratings or comments are committed to GitHub or deployed as static Pages assets.

## Current status

- Source: GitHub `dev` branch.
- Build: `npm run build` generates `dist/index.html`, `sw.js`, `manifest.webmanifest`, and original 192/512 PNG install icons. The service worker precaches only same-origin compiled assets.
- Browser CI: synthetic EPUB, desktop/mobile navigation, EPUB download, offline reload and reading with the network disabled.
- Standalone deploy: **not configured or live until the Cloudflare account, protected Pages project and GitHub environment are connected.** This is distinct from the Hugging Face staging deployment, which remains active.
- Existing HF production Space and GitHub `master`: unchanged.

## Why use a separate URL?

The HF private Space is wrapped in an authenticated Hugging Face page and iframe, which can require internet even when our reader shell is cached. A standalone `https://` Pages origin lets the service worker control the entire installed app, rather than only its embedded portion.

Cloudflare Pages serves the **application shell**, not your novels. A public static shell alone does not expose the private dataset, but we still recommend Cloudflare Access so nobody else can open the library UI.

## One-time setup in your Cloudflare account

1. In Cloudflare Workers & Pages, create a new **Pages / Direct Upload** project. Pick a project name; keep a record of it. Do not use Git integration for this project because the provided workflow publishes prevalidated GitHub artifacts through Wrangler.
2. Set up **Cloudflare Zero Trust → Access** and an Allow policy restricted to **your own email/account**, with an explicit Deny for everyone else.
3. Protect the main `<project>.pages.dev` hostname **and** the branch/commit preview URLs `*.<project>.pages.dev`. The Pages setting **Enable access policy** protects previews only by default. For the main `pages.dev` hostname follow the Cloudflare Pages *Known issues → Enable Access on your pages.dev domain* procedure: enable preview Access, Manage the Access app, remove the wildcard from its subdomain field, save, then enable preview Access again. Configure any custom domain with its own Access app.
4. Open the root and preview URLs in a **private/incognito browser** and check they cannot display the app without the authorised login. Repeat after deployment. Access configuration is your responsibility; CI cannot create a guarantee from a checkbox.
5. Create a **GitHub Actions environment** named `standalone-staging`; configure required reviewers (you), and restrict deployments to the `dev` branch. Set its secrets `CF_ACCOUNT_ID` (Cloudflare account ID) and `CF_API_TOKEN` (a Cloudflare API token limited to Pages deployment privileges). Set the environment variable `CF_PAGES_PROJECT` to the exact Pages project name. Do not store these values in code or chat.
6. Open **Actions → Build and optionally deploy standalone PWA → Run workflow**, select branch `dev`. First run with **publish unchecked** to build, validate and retain a clean artifact. After verifying your Access policy, rerun with **publish** and **access_protected** checked, and approve the GitHub environment if prompted.
7. Use the stable branch preview address (typically `https://dev.<project>.pages.dev`) on Windows/Android to install via the browser's install/app menu; iOS may use **Share → Add to Home Screen**. Confirm the actual address and its Access policy before use.

**Access limitation:** Browser/PWA installation and offline launch under Cloudflare Access still require real-device testing: a cached shell can load without internet once installed, but a fresh device needs an online Access login. Never treat a service-worker cache as a substitute for access control; browser storage is not encrypted by this app.

## Preparing novels and transferring from the existing HF Space

**Browser storage is partitioned by origin.** EPUBs cached under Hugging Face will not automatically appear at the new Pages origin. While online on the new standalone URL:

1. Connect using your existing *private dataset repository ID* and a fine-grained HF token entered directly into the app. Tokens remain in memory for the current browser session.
2. Refresh the cloud catalogue to retrieve the titles, personal notes, named collections and per-book reading progress.
3. Press **Save all offline**. The app downloads any uncached EPUBs in sequence and marks them **Available offline**; avoid clearing browser storage.
4. Install/add the standalone web app and verify it reloads with networking disabled. Open a cached book and check chapter navigation, themes and local reading-position updates.
5. For a true independent file backup, press **Download EPUB** in each novel's details page. It saves an actual file you can import elsewhere; the PWA's Save offline feature instead stores the EPUB in IndexedDB.

## Synchronisation and limitations

- Online, the app fetches EPUBs and data from the **private** HF dataset. No novel bytes or tokens enter Cloudflare Pages deployment assets.
- Personal reviews: `data/personal/reviews/<book-id>.json`.
- Named collections: `data/personal/collections.json`.
- Reading progress: `data/personal/progress/<book-id>.json`, with last-write-timestamp conflict checks; offline edits remain pending locally and are retried with connectivity and a current dataset token. Progress uploads are throttled to avoid saving on every scroll.
- Personal tags and custom summaries remain browser-local until a separate sync migration is implemented.
- Offline sessions cannot authenticate or fetch uncached content; reconnection requires the dataset token if the app was reloaded.
- Multiple devices editing the same book at the same time are not transactionally conflict-proof; the latest timestamp normally wins.
- Internet availability is inferred from browser connectivity; an HF outage can still interrupt cloud operations.
- Local IndexedDB, app shell cache and install can be evicted or cleared. Keep independent EPUB exports.
- CORS and authorisation for the actual private HF dataset from the new Pages origin need **live browser validation**; CI deliberately never uses production novels/tokens.

## Security and release controls

The workflow `.github/workflows/deploy-standalone.yml` only runs manually on `dev`. All checks must pass before the separate deploy job runs. The two deployment checkbox inputs are an operator acknowledgement, **not automated proof** that Cloudflare Access is configured.

The job publishes a static `dist/` with standalone-only security headers. Never add user EPUBs, Hugging Face tokens or Cloudflare credentials to the repository or CI artifact.

The existing HF staging workflow remains separate. Nothing in this workflow promotes `dev` to `master` or deploys the production HF Space.
