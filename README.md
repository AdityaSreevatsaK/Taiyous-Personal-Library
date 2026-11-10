---
title: Taiyou's Personal Library
emoji: 📖
colorFrom: green
colorTo: yellow
sdk: static
app_file: dist/index.html
fullWidth: true
header: mini
short_description: Personal offline-capable novel library with private cloud storage
---

# Taiyou's Personal Library

A responsive EPUB/ZIP reader and installable offline-capable Progressive Web App (PWA).

**One development branch:** `master`. The former `dev` branch was merged on 10 November 2026 and is no longer an active release channel.

## Live application

- **Cloudflare Pages:** https://dev.taiyous-personal-library.pages.dev
- GitHub Actions: [Build and optionally deploy standalone PWA](.github/workflows/deploy-standalone.yml)
- Private Hugging Face **Dataset:** `AdityaSreevatsaK/Taiyous-Novels` (novels, optional ZIP originals, catalogue and selected personal metadata)

**Why the URL still begins with `dev.`:** This is a Cloudflare branch alias, **not** an active GitHub development branch. Existing installed PWAs and cached EPUBs use this origin. We deliberately preserve it until the user has safely migrated data to the permanent Pages hostname.

The public Cloudflare app shell contains **no private novels or dataset credentials**. Connection to the user's private Hugging Face Dataset requires a repository-scoped token entered directly into the browser, held in memory only. Offline EPUBs remain in the browser's IndexedDB. Anyone who can access an unlocked browser profile can access its local books.

## Features

- Responsive desktop/mobile library, search, shelves, tags and independent named collections
- EPUB.js vertical-scrolling reader with chapter navigation, chapter selection and resume
- Sepia, light and dark themes; typography and reading-width controls
- Personal ratings and comments, original ZIP download where available, and EPUB export
- Individual **Save offline** and **Save all offline** actions
- Service-worker-cached PWA shell, installed/offline restart and offline reading
- Private-dataset synchronization for reviews, collections and per-book reading progress

For details and limits, read [Capabilities and offline behaviour](docs/CAPABILITIES.md).

## Local development

```sh
npm install
npm run typecheck
npm test
npm run build
```

For browser smoke tests, see `scripts/browser_smoke.mjs` and the GitHub workflow. CI uses synthetic EPUBs; no user novels or paid LLM/API calls are required.

## Deployments and release safety

1. Commit changes to `master`. The `Verify novel reader` workflow checks tests, build and audit.
2. Run [Build and optionally deploy standalone PWA](.github/workflows/deploy-standalone.yml) from `master` with **Publish** enabled. The job validates the built app and deploys only the `dist/` files.
3. Deploys use the existing `standalone-staging` GitHub environment secrets `CF_ACCOUNT_ID`, `CF_API_TOKEN` and variable `CF_PAGES_PROJECT`. The environment's historical name is retained to avoid changing working secrets.
4. The job currently publishes to the Cloudflare **`dev` URL alias intentionally**, preserving the established PWA/IndexedDB origin. See [Standalone operation and URL migration](docs/STANDALONE_PWA.md) before changing this.
5. The previous Hugging Face **Space** build/deployment workflow has been retired from `master`. Both HF Spaces are historical deployments; the **private HF Dataset must not be deleted**.

**Offline note:** The user validated offline cold launching and offline reading on Android on 10 November 2026. Browser storage may still be cleared/evicted by the operating system, so keep independent EPUB backups.

## Data and sync limitations

- Cloud actions and cross-device sync need connectivity and an active dataset token; after a refresh, reconnect with the token.
- Personal tags, custom summaries and typography settings are local rather than cloud-synced.
- Concurrent edits across devices are timestamp-based, not transactionally conflict-free.
- Installing the PWA on a **different hostname** creates separate browser storage. Do not uninstall, clear site data, or discard the old PWA before exporting/backing up unsynchronised changes and caching novels on the new origin.
