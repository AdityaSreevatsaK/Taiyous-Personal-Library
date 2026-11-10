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

- **Cloudflare Pages:** https://taiyous-personal-library.pages.dev
- GitHub Actions: [Build and optionally deploy standalone PWA](.github/workflows/deploy-standalone.yml)
- Private Hugging Face **Dataset:** `AdityaSreevatsaK/Taiyous-Novels` (novels, optional ZIP originals, catalogue and selected personal metadata)

**Permanent URL:** Cloudflare Pages is now configured with production branch `master`. The former `dev.taiyous-personal-library.pages.dev` address is a historical preview alias. Moving to the permanent hostname creates fresh browser storage; locally cached EPUBs and unsynchronised personal settings do not transfer automatically. Reconnect the private Dataset and save offline copies again on the new address.

The public Cloudflare app shell contains **no private novels or dataset credentials**. Connection to the user's private Hugging Face Dataset requires a repository-scoped token entered directly into the browser, held in memory only. Offline EPUBs remain in the browser's IndexedDB. Anyone who can access an unlocked browser profile can access its local books.

## Features

- Responsive desktop/mobile library, compact book-first layout, dedicated offline shelf (auto-selected offline), advanced search across title/author, personal comments, ratings and tags with union/intersection logic, independent named collections
- Real novel cover images from the **private Hugging Face Dataset**, with on-demand fetching, offline cover caching and existing decorative covers as fallback. Dataset `data/library.json` entries supply `coverPath: data/novels/<existing-id>/cover.jpg`; no changes to EPUBs, novel IDs or original ZIPs.
- EPUB.js vertical-scrolling reader with centred chapter headings, chapter navigation, chapter selection and resume
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
4. The job publishes Cloudflare's **production branch `master`** at `https://taiyous-personal-library.pages.dev`. See [Standalone operation](docs/STANDALONE_PWA.md).
5. The previous Hugging Face **Space** build/deployment workflow has been retired from `master`. Both HF Spaces are historical deployments; the **private HF Dataset must not be deleted**.

**Offline note:** Android offline cold launching and reading were validated on the previous Cloudflare `dev.` alias on 10 November 2026. Repeat the offline test after installing from the permanent hostname. Browser storage may still be cleared/evicted by the operating system, so keep independent EPUB backups.

## Authentication and security

- **Hugging Face OAuth** is implemented on `master` as an encrypted server-side session via Cloudflare Pages Functions. The React app redirects to HF for PKCE sign-in, checks the private dataset owner and reconnects automatically on reload. The HF OAuth bearer token is never exposed in JavaScript.
- **One required Cloudflare secret:** `HF_OAUTH_SESSION_KEY` (a fresh random 64-character hex key). The app publishes a public HF OAuth Client ID Metadata Document at `/.well-known/oauth-cimd`, so no Cloudflare Zero Trust account or additional hosting service is needed.
- The HF OAuth integration is **not live until** this secret is configured on Cloudflare Pages and a user-approved `master` deployment is published and verified. The existing manual fine-grained HF token fallback remains available.
- **Permission trade-off:** OAuth's `write-repos` scope includes personal repositories, not only the novel dataset; the backend itself is restricted to `AdityaSreevatsaK/Taiyous-Novels`. For narrower token permissions use the legacy manual fine-grained token.
- CI runs the full and production npm security audits, blocks on high/critical advisories, compiles the Pages Functions and tests the OAuth flow with synthetic credentials (never real book or auth data).

See [Hugging Face OAuth setup](docs/ACCESS_GATEWAY.md).

## Data and sync limitations

- Cloud actions and cross-device sync need connectivity and an active dataset token; after a refresh, reconnect with the token.
- Personal tags, custom summaries and typography settings are local rather than cloud-synced.
- Concurrent edits across devices are timestamp-based, not transactionally conflict-free.
- The new permanent hostname has separate browser storage from the former `dev.` alias. The user approved resetting locally cached data during the transition; download EPUBs again on the new hostname for offline access.
