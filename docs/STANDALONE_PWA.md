# Standalone Cloudflare PWA — production operations

Taiyou's Personal Library runs as a public static **app shell** on Cloudflare Pages and uses the **private** Hugging Face Dataset `AdityaSreevatsaK/Taiyous-Novels` for novels and selected synced personal metadata.

## Current configuration (19 November 2026)

- **Permanent application URL:** https://taiyous-personal-library.pages.dev
- **Cloudflare Pages project:** `taiyous-personal-library`
- **Cloudflare production branch:** `master`. Updated from `main` through the Pages API; production build published successfully on 10 November 2026.
- **GitHub source:** `AdityaSreevatsaK/Taiyous-Personal-Library`, single active branch `master`; former GitHub `dev` branch deleted.
- **Automatic deployment after merge:** [Auto deploy verified master](../.github/workflows/auto-deploy-verified-master.yml) runs when a push-based Verify workflow on `master` succeeds, checks the same commit's CodeQL result and that the commit is still current, then dispatches [Deploy Application](../.github/workflows/deploy-standalone.yml) with Publish enabled. Manual dispatch remains a fallback.
- **GitHub environment:** `standalone-staging` is an inherited environment *name* retaining the Cloudflare secrets. It still deploys production from `master`.
- **CI:** `.github/workflows/verify.yml` validates pushes to master; standalone publishing additionally verifies types, tests, dependency audit, package privacy and synthetic EPUB offline browser cold-start before uploading.
- **Retired hosting:** The HF production and staging Spaces are redundant legacy deployments. No HF Space deploy workflow remains on master. The HF Dataset is **essential** and must never be deleted as part of Space cleanup.

## Release workflow

1. Implement changes on a short-lived branch, review the PR and merge after required PR checks pass. The owner has authorised routine merges and production releases without repeat permission requests; agents should proceed by default.
2. The `master` push starts **Verify novel reader** and **CodeQL**. When Verify finishes successfully, the permanent **Auto deploy verified master** workflow waits for the exact commit's successful CodeQL result, confirms the head of `master` remains unchanged, and dispatches **Deploy Application** with Publish enabled. It never deploys failed or superseded commits.
3. The existing deployment workflow **revalidates** the app, production dependency audit, package privacy, offline EPUB reader, and build, then uses restricted GitHub environment secrets `CF_ACCOUNT_ID`, `CF_API_TOKEN` and variable `CF_PAGES_PROJECT`.
4. The production deployment command is `npx wrangler@4 pages deploy dist --project-name "$CF_PAGES_PROJECT" --branch master --commit-hash <sha>`. It publishes to the production hostname.
5. Confirm the deployment job succeeded and public OAuth JSON remains accessible. Check `https://taiyous-personal-library.pages.dev` on desktop and mobile, and verify offline startup/cached EPUB reading where possible.

**Fallback:** GitHub Actions → [Deploy Application](../.github/workflows/deploy-standalone.yml) → `master` → Publish, for deliberate recovery/retries. The `standalone-staging` environment's approval/secrets protections remain intact. Do not create temporary one-shot deployment workflows.

**Not covered by standing approval:** destructive production Hugging Face dataset operations, security/owner bypasses, publishing private data or creating version tags/releases. These require separate explicit authorisation.

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
