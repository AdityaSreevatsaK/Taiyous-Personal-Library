# Standalone offline reader deployment (dev only)

This is the setup for **Taiyou's Personal Library as an installed PWA**, separate from the Hugging Face Space wrapper. It keeps Hugging Face as the **private novel dataset backend**. No EPUBs, API tokens, ratings or comments are committed to GitHub or deployed as static Pages assets.

## Current status

- Source: GitHub `dev` branch.
- Build: `npm run build` generates `dist/index.html`, `sw.js`, `manifest.webmanifest`, and original 192/512 PNG install icons. The service worker precaches only same-origin compiled assets.
- Browser CI: synthetic EPUB, desktop/mobile navigation, EPUB download, offline reload and reading with the network disabled.
- Standalone deploy: **not live until the Cloudflare account and GitHub deployment environment are connected.** The Pages app shell is intentionally public; the Hugging Face dataset remains private. This is distinct from the Hugging Face staging deployment, which remains active.
- Existing HF production Space and GitHub `master`: unchanged.

## Why use a separate URL?

The HF private Space is wrapped in an authenticated Hugging Face page and iframe, which can require internet even when our reader shell is cached. A standalone `https://` Pages origin lets the service worker control the entire installed app, rather than only its embedded portion.

Cloudflare Pages serves a **public application shell**, not your novels. Anyone can load the UI, but a fresh browser has no cloud catalogue or books without the owner's private Hugging Face dataset token. Local EPUBs and reading data remain on the same browser/device after disconnect so offline reading works. This is **not account-based UI sign-in**: anyone using an already-unlocked browser profile can see its locally stored books. Use a private device/browser profile and protect the device with a screen lock.

## One-time setup: public app shell, private novel dataset

The user explicitly approved public access to the **app shell only**. **You do not need Zero Trust or payment-card details** to set up this hosting approach. The novel dataset remains private under Hugging Face permissions.

1. Create a Cloudflare Pages **Direct Upload** project named `taiyous-personal-library`. The initial placeholder page may remain public. **Do not add EPUB files or tokens to Cloudflare**.
2. In the GitHub repository go to **Settings → Environments** and create `standalone-staging`. Restrict it to the `dev` branch if that setting is available, and optionally require your own approval for publishing.
3. Under that environment's **Secrets**, set `CF_ACCOUNT_ID` to the Cloudflare account ID and `CF_API_TOKEN` to a **restricted Cloudflare Pages deployment token**. Under **Variables**, set `CF_PAGES_PROJECT` to `taiyous-personal-library`. These are Cloudflare **deployment** credentials; never put the private Hugging Face novel token in GitHub secrets, Pages project settings or code.
4. In **Actions → Build and optionally deploy standalone PWA**, choose branch `dev` and run the workflow with **publish unchecked** to verify the build. Then run it with **publish checked** to update the public app shell only. There is no Access checkbox requirement.
5. Visit the Pages URL (typically `https://dev.taiyous-personal-library.pages.dev`) in a fresh browser profile. It should show an **empty/unconnected library** until you explicitly connect to your private dataset. A separate person cannot retrieve private novels without their own authorised dataset token. **Do not place a token in the address bar or share one with others.**
6. After confirming the shell works, use the browser's **Install app** or **Add to Home Screen** option. Test installation and offline startup on Windows/mobile.

**Security boundary:** Public source code and UI are not encrypted or restricted. The Hugging Face dataset itself enforces private data access. Authentication is the **private dataset token** entered directly into the app and kept only in memory. A person with access to the same browser's IndexedDB may see previously downloaded EPUBs without re-entering the token; this is necessary for offline reading. Avoid shared-device profiles. Cloudflare Pages is not a place to store real user data or passwords.

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

The workflow `.github/workflows/deploy-standalone.yml` only runs manually on `dev`. All checks must pass before the separate deploy job runs. The single `publish` checkbox is the operator's explicit approval to publish **public UI assets**; the private Hugging Face dataset is never included.

The job publishes a static `dist/` with standalone-only security headers. It does not add any Cloudflare Access paywall. Never add user EPUBs, Hugging Face tokens or Cloudflare credentials to the repository or CI artifact.

The existing HF staging workflow remains separate. Nothing in this workflow promotes `dev` to `master` or deploys the production HF Space.
