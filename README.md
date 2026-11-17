# Taiyou's Personal Library

A responsive, installable EPUB reader and personal novel library for desktop and mobile. The **application shell is public**, but the novels and selected synchronised personal data live in a **private Hugging Face Dataset**. EPUBs saved for offline reading stay in the browser's IndexedDB.

**Application:** https://taiyous-personal-library.pages.dev  
**Source:** [GitHub repository](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library)  
**Private storage:** `AdityaSreevatsaK/Taiyous-Novels` (not included in this repository)

## Development and release status

- **`master`** is the production source branch. Deployment is **manual**, not automatic on push.
- Short-lived feature/fix branches may open pull requests against `master`. The former long-lived `dev` branch was merged and deleted.
- **[Draft PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57)** is the current-master implementation of revision-safe personal-data sync and explicit conflict handling. Its automated tests include simulated two-browser conflicts, but **it has not been merged or deployed**; the real disposable-HF and authenticated browser release gates remain.
- There is **no published GitHub Release or version tag**. A package version is not a release announcement. **Do not create a `v1.0` tag or GitHub Release without the owner's explicit approval and acceptance testing.**

## Features

- **Library:** responsive bookshelf, alphabetic browsing, global/advanced search, imported and personal tags, independent named collections, and a **Trying out** shelf.
- **Novel details:** synopsis, chapter list and jump-to-chapter, progress, optional private-dataset covers, 1–10 ratings, comments and source metadata. Personal synopsis and tag edits require confirmation.
- **Reading:** EPUB.js vertical chapter scrolling, previous/next chapter controls, resume, sepia/light/dark themes, typography and reading-width controls.
- **Files:** import EPUB or supported novel ZIP files; download EPUBs and original ZIPs where available.
- **Offline:** installable PWA, local bookshelf management and **Save all offline**. A downloaded EPUB can be removed with ordinary confirmation only after the hosted replacement is verified.
- **Private cloud:** Hugging Face OAuth for novel imports, covers, reading progress, personal reviews and collections. Personal tags, custom summaries and reader settings remain device-local.

For complete behaviour, see [Capabilities and offline behaviour](docs/CAPABILITIES.md). A migration converted **89 existing novel folders** to human-readable names while preserving their IDs and personal sidecar paths. The live library can contain more novels than that historical migration count. See [migration compatibility sign-off](docs/READABLE_FOLDER_MIGRATION_SIGNOFF_2026-11-14.md).

## Storage, authentication and safety

| Location | Data |
| --- | --- |
| Private Hugging Face Dataset | `data/library.json` catalogue, `data/novels/<id> - <sanitised-title>/source.epub` (historical ID-only folders remain supported), optional ZIPs/covers, and `data/personal/` progress, reviews and collections |
| Browser IndexedDB | Cached EPUBs/covers, book metadata, progress and pending local edits |
| Browser localStorage | Collections and device-local preferences |
| GitHub / Cloudflare Pages | Source and public app shell; **no private novels or Hugging Face credentials** |

**Sign-in:** Hugging Face OAuth establishes an encrypted, Secure, HttpOnly server-side session; the HF token is not exposed to React. A fine-grained token entered manually is an **in-memory legacy fallback**, not the recommended method for editing cloud data. Draft PR #57 makes legacy token mode read-only for private dataset writes; revision-safe editing requires OAuth. This behaviour is **not deployed**.

**Owner mode:** Deleting an *entire novel* or named collection requires a fresh owner session, separate Owner passphrase and exact-title confirmation. Removing just a locally downloaded EPUB **does not** require Owner mode. Full deletion remains disabled without the Owner secret.

**Novel catalogue integrity:** The production code already guards imports with revision-checked commits and refuses unsafe catalogue overwrites. The web upload limit is about **70 MiB per file / 75 MiB per request**; use the separate Storage Controller for larger archives.

**Personal sync:** The deployed `master` code still has timestamp-based cross-device reconciliation limitations. [Draft PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57) introduces content revisions, preserves competing copies and requires explicit resolution for conflicting progress, reviews and collections. These improvements **are not live yet**. The disposable HF test workflow currently **skips the real integration test** because this repository has no `HF_DISPOSABLE_TEST_TOKEN` secret; two authenticated, isolated-dataset browser tests are also required.

**Backups:** Browser storage can be cleared or evicted. Keep EPUB/ZIP backups separately. Offline storage from the historical `dev.taiyous-personal-library.pages.dev` hostname does not transfer automatically to the permanent URL.

## Development and automated tests

GitHub Actions uses Node.js 22.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview
```

The [Verify novel reader](.github/workflows/verify.yml) workflow runs TypeScript/build checks, cloud gateway tests, dependency audits and Chromium desktop/mobile/offline smoke tests. Monthly Dependabot updates cover npm packages and pinned GitHub Actions. The browser suites are in `scripts/browser_smoke.mjs`, `scripts/csp_browser_smoke.mjs` and `scripts/epub_security_smoke.mjs`. The last specifically checks that crafted EPUB scripts and event handlers cannot execute. CI uses **synthetic EPUBs and simulated cloud data**, never the owner's real novel collection or private credentials. Passing CI does not replace real OAuth/Hugging Face integration testing.

## Production deployment

1. Merge approved code into `master` after completing the required checks.
2. Open GitHub Actions → [Deploy Application](.github/workflows/deploy-standalone.yml), select `master` and enable **Publish** only for an intentional production deployment.
3. The workflow validates the app and deploys the static PWA **and** private Cloudflare Pages Functions to https://taiyous-personal-library.pages.dev.
4. After deployment, verify OAuth sign-in, private dataset access, desktop/mobile reading and offline PWA startup.

The workflow uses Cloudflare secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN` plus variable `CF_PAGES_PROJECT` in the inherited GitHub environment `standalone-staging` (**despite that name, this workflow publishes production**). OAuth and Owner mode need `HF_OAUTH_SESSION_KEY` and `TAIYOU_OWNER_PASSPHRASE` as documented. The previous Hugging Face Spaces are historical app deployments; **do not delete the private Hugging Face Dataset**.

Further reading: [Cloudflare operations](docs/STANDALONE_PWA.md) · [OAuth and Owner mode](docs/ACCESS_GATEWAY.md) · [Production-readiness audit](docs/READINESS_AUDIT_2026-11.md).

Additional audit notes: [Evidence-based validation of the 17 November report](docs/AUDIT_VALIDATION_2026-11-17.md).

## Remaining manual security gates

- **Protect `master`:** in GitHub repository **Settings → Rules → Rulesets**, create an active branch ruleset targeting `master`, require pull requests and successful `verify` and `CodeQL JavaScript and TypeScript` checks before merging, and restrict bypass permissions. The repository's `CODEOWNERS` file names the owner, but does **not** enforce reviews until branch protection is configured.
- **Disposable sync acceptance:** configure `HF_DISPOSABLE_TEST_TOKEN` as a repository Actions secret using a short-lived, dedicated Hugging Face test account/token with **no access to production novels**. The [isolated test workflow](.github/workflows/verify-hf-disposable.yml) creates and deletes only a randomly named disposable private dataset. Its green status when the secret is missing is **not** a completed HF integration test. Separately test two authenticated OAuth browsers against a non-production dataset before merging [draft PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57).
