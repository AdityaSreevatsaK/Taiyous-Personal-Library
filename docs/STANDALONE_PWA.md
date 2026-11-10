# Standalone Cloudflare PWA — production operations

Taiyou's Personal Library runs as a public static **app shell** on Cloudflare Pages and uses the **private** Hugging Face Dataset `AdityaSreevatsaK/Taiyous-Novels` for novels and selected synced personal metadata.

## Current configuration (10 November 2026)

- **Permanent application URL:** https://taiyous-personal-library.pages.dev
- **Cloudflare Pages project:** `taiyous-personal-library`
- **Cloudflare production branch:** `master`. Updated from `main` through the Pages API; production build published successfully on 10 November 2026.
- **GitHub source:** `AdityaSreevatsaK/Taiyous-Personal-Library`, single active branch `master`; former GitHub `dev` branch deleted.
- **Manual deployment:** GitHub Actions → [Build and optionally deploy standalone PWA](../.github/workflows/deploy-standalone.yml) → select `master` → check **Publish** → run.
- **GitHub environment:** `standalone-staging` is an inherited environment *name* retaining the Cloudflare secrets. It still deploys production from `master`.
- **CI:** `.github/workflows/verify.yml` validates pushes to master; standalone publishing additionally verifies types, tests, dependency audit, package privacy and synthetic EPUB offline browser cold-start before uploading.
- **Retired hosting:** The HF production and staging Spaces are redundant legacy deployments. No HF Space deploy workflow remains on master. The HF Dataset is **essential** and must never be deleted as part of Space cleanup.

## Release workflow

1. Implement changes on `master`; review the **Verify novel reader** CI result.
2. Manually trigger the standalone PWA workflow from the `master` branch with **Publish** checked.
3. Validation uploads the generated `dist/` artifact. Deploy uses restricted GitHub environment secrets `CF_ACCOUNT_ID`, `CF_API_TOKEN` and variable `CF_PAGES_PROJECT`.
4. The production deployment command is `npx wrangler@4 pages deploy dist --project-name "$CF_PAGES_PROJECT" --branch master --commit-hash <sha>`. It publishes to the root hostname rather than a preview branch.
5. Check `https://taiyous-personal-library.pages.dev` on desktop and phone, then verify offline startup and cached EPUB reading on the installed PWA.

The one-time automatic migration trigger and Cloudflare API production-branch patch have already been removed from the normal deployment workflow. Future production releases remain manually gated.

## Transition from the old URL

The former application URL `https://dev.taiyous-personal-library.pages.dev` is a historical Cloudflare preview. The user accepted losing device-local EPUB downloads, unsynchronised ratings/notes and local preferences to simplify migration.

**Browser storage does not follow a hostname change**: IndexedDB, Cache Storage and service workers are origin-specific. Open the permanent URL online, connect the private Dataset, save novels for offline reading again, and install the PWA from the new hostname. Removing the *old* PWA does not delete cloud novels in the Dataset. If old local information matters, export it before uninstalling or clearing old site data.

## Privacy

The public deployment contains the compiled app shell, public OAuth client metadata and private Cloudflare Pages Function code (executed on the server, not sent to readers). The novel Dataset remains private. Once configured, a Hugging Face OAuth login establishes an encrypted, Secure, HttpOnly session cookie; the OAuth access token is never exposed to frontend JavaScript. The earlier manually entered fine-grained dataset token remains an optional in-memory fallback. No credentials are embedded in public assets.

Any person who can access an already-unlocked local browser profile may read its local cached novels, so protect the device. Browser caches may be evicted; keep independent EPUB/ZIP backups.

## Remaining limitations

- First-time private Dataset connection and novel downloads require internet access and Hugging Face sign-in, or the legacy manual dataset token.
- Cloud sync of some personal metadata requires a connected session. Local-only tags, custom summaries and display preferences are not automatically synced across devices.
- Concurrent edits on different devices use timestamp reconciliation, not transactional conflict resolution.
- Bulk offline caching currently lacks cancellation and robust storage quota handling.
