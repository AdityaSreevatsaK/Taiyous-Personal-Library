# Taiyou's Personal Library

> **Five-repository ecosystem note (18 November 2026):** This repository remains the independent, working **Novel Library**. The optional [Taiyou Shared Core / Personal Hub](https://github.com/AdityaSreevatsaK/Taiyous-Shared-Core) is a separate private repo and is **not** a runtime dependency or a deployed replacement. See [AI-agent rules](AGENTS.md), [ecosystem architecture](docs/ECOSYSTEM_ARCHITECTURE.md), [integration contract](docs/ECOSYSTEM_INTEGRATION.md) and [agent handover](docs/SESSION_HANDOVER_PROMPT.md). The novel app source repository is currently **public**; the novel dataset is **private**. Four newly created ecosystem repos are private.

A responsive, installable EPUB reader and personal novel library for desktop and mobile. The **application shell is public**, but the novels and selected synchronised personal data live in a **private Hugging Face Dataset**. EPUBs saved for offline reading stay in the browser's IndexedDB.

**Application:** https://taiyous-personal-library.pages.dev  
**Source:** [GitHub repository](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library)  
**Private storage:** `AdityaSreevatsaK/Taiyous-Novels` (not included in this repository)


## Maintainers and AI agents: canonical documentation

**Start with [`AGENTS.md`](AGENTS.md)**, then use the documents below. They consolidate the implementation architecture, source/storage boundaries, owner-approved UI design, persistent production incidents, testing and operational policy. They were reviewed against `master` on **20 November 2026**.

| Document | Purpose |
| --- | --- |
| [AI Agent Playbook](docs/AI_AGENT_PLAYBOOK.md) | End-to-end orientation, ownership, guardrails, implementation and reporting workflow |
| [UI/UX Behaviour Contract](docs/UX_BEHAVIOUR_CONTRACT.md) | Six primary destinations, Analytics inside Master Controls, themes, Home, tags, collections, ribbons, reader layout and regressions |
| [Architecture and Data Lifecycle](docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md) | Code map, EPUB/Catalogue/IndexedDB/HF paths, authentication, sync and immutable identity |
| [Testing and Release Runbook](docs/TESTING_RELEASE_RUNBOOK.md) | Commands, verification matrix, exact automatic Cloudflare deployment and release gates |
| [Operations, Decisions and Backlog](docs/OPERATIONS_DECISIONS_AND_BACKLOG.md) | Recovery procedures, known incidents, decisions, pending cross-device sync work |
| [Comprehensive Repository Audit (20 November 2026)](docs/COMPREHENSIVE_REPOSITORY_AUDIT_2026-11-20.md) | Evidence-based security, performance and correctness findings, fixes, tests and remaining risks |
| [Session Handover Prompt](docs/SESSION_HANDOVER_PROMPT.md) | Copyable brief to initialise a fresh assistant session |

**Critical:** `PROJECT_HANDOVER.md` and `STAGING.md` describe retired deployment infrastructure and remain historical only. The current application is public Cloudflare Pages with a private Hugging Face **Dataset**, not an HF Space. New agents must verify the latest SHA, open PRs and workflow status, not assume this README is live telemetry.

## Development and release status

- **`master`** is the production source branch. Verified merges deploy **automatically** to Cloudflare after successful `master` Verify + CodeQL checks. The owner has granted standing approval for routine reviewed PR merges and releases (19 November 2026); see [AGENTS.md](AGENTS.md).
- Short-lived feature/fix branches may open pull requests against `master`. The former long-lived `dev` branch was merged and deleted.
- **[PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57)** was closed without merge. It proposed revision-safe personal sync and explicit conflict handling, but those proposed changes **must not be treated as deployed**. Reassess the current code and real authenticated two-device behaviour before reviving that design.
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

**Sign-in:** Hugging Face OAuth establishes an encrypted, Secure, HttpOnly server-side session; the HF token is not exposed to React. A fine-grained token entered manually is an **in-memory legacy fallback**, not the recommended method for editing cloud data. Closed, unmerged PR #57 proposed making legacy token mode read-only for private dataset writes. **This proposal was not deployed.** Do not claim that it is current behaviour.

**Owner mode:** Deleting an *entire novel* or named collection requires a fresh owner session, separate Owner passphrase and exact-title confirmation. Removing just a locally downloaded EPUB **does not** require Owner mode. Full deletion remains disabled without the Owner secret.

**Novel catalogue integrity:** The production code already guards imports with revision-checked commits and refuses unsafe catalogue overwrites. The web upload limit is about **70 MiB per file / 75 MiB per request**; use the separate Storage Controller for larger archives.

**Personal sync:** The deployed `master` code still has timestamp-based cross-device reconciliation limitations. [Closed, unmerged PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57) proposed content revisions, preservation of competing copies and explicit conflict resolution for progress, reviews and collections. **Those proposed changes were not merged or deployed**. The disposable HF test workflow currently **skips the real integration test** because this repository has no `HF_DISPOSABLE_TEST_TOKEN` secret; two authenticated, isolated-dataset browser tests are also required.

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

1. Agents implement on feature branches, open and review PRs, and **merge routine changes without asking again** once the required PR checks pass, unless the owner explicitly opts out.
2. After a successful `master` push-based [Verify novel reader](.github/workflows/verify.yml) run, [Auto deploy verified master](.github/workflows/auto-deploy-verified-master.yml) checks the exact current commit and successful CodeQL result, then dispatches [Deploy Application](.github/workflows/deploy-standalone.yml) with **Publish** enabled.
3. The existing guarded deployment workflow independently rechecks TypeScript, tests, production audit, build privacy and offline reader, deploys the static PWA **and** private Cloudflare Pages Functions, and verifies publicly accessible OAuth client metadata.
4. Check the **completed deployment job**, then verify OAuth sign-in, desktop/mobile reading and offline PWA startup at https://taiyous-personal-library.pages.dev. A green PR or merge alone is not proof of publishing.

A manual `master` deploy with Publish enabled remains available as a **recovery fallback**, not the normal release process. Destructive dataset changes, owner/auth/permission changes, public-data exposure, and version tags/releases still require separate explicit owner approval.

The workflow uses Cloudflare secrets `CF_ACCOUNT_ID` and `CF_API_TOKEN` plus variable `CF_PAGES_PROJECT` in the inherited GitHub environment `standalone-staging` (**despite that name, this workflow publishes production**). OAuth and Owner mode need `HF_OAUTH_SESSION_KEY` and `TAIYOU_OWNER_PASSPHRASE` as documented. The previous Hugging Face Spaces are historical app deployments; **do not delete the private Hugging Face Dataset**.

Further reading: [Cloudflare operations](docs/STANDALONE_PWA.md) · [OAuth and Owner mode](docs/ACCESS_GATEWAY.md) · [Production-readiness audit](docs/READINESS_AUDIT_2026-11.md).

Additional audit notes: [Evidence-based validation of the 17 November report](docs/AUDIT_VALIDATION_2026-11-17.md).

## Remaining manual security gates

- **Protect `master`:** in GitHub repository **Settings → Rules → Rulesets**, create an active branch ruleset targeting `master`, require pull requests and successful `verify` and `CodeQL JavaScript and TypeScript` checks before merging, and restrict bypass permissions. The repository's `CODEOWNERS` file names the owner, but does **not** enforce reviews until branch protection is configured.
- **Disposable sync acceptance:** configure `HF_DISPOSABLE_TEST_TOKEN` as a repository Actions secret using a short-lived, dedicated Hugging Face test account/token with **no access to production novels**. The [isolated test workflow](.github/workflows/verify-hf-disposable.yml) creates and deletes only a randomly named disposable private dataset. Its green status when the secret is missing is **not** a completed HF integration test. Separately test two authenticated OAuth browsers against a non-production dataset before merging [draft PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57).
