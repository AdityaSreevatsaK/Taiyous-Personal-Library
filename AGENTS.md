# AI Agent Instructions: Taiyou's Novel Library

These rules apply only to this repository, the production EPUB/novel library. They do not authorise changes to Manga, Shared Core, Anime, Movies & TV, or Storage Controller repositories.

## Mandatory dynamic project-state preflight

Before every substantial task, inspect the live repository. Historical notes, previous assistant messages, old PR descriptions and this file are not live telemetry.

1. Confirm repository identity, default branch, current master SHA, working-tree status in any local checkout, and whether uncommitted/untracked changes exist. Never overwrite user work.
2. Inspect recent commits and changed paths, open PRs, relevant issues, branch heads, and latest Verify, CodeQL, auto-deploy and Deploy Application workflow runs. Check conclusions and exact SHAs, not just run names.
3. Read this file and README, then relevant maintained docs in docs/. Core references: AI Agent Playbook, Architecture and Data Lifecycle, UX Behaviour Contract, Testing and Release Runbook, Operations/Decisions/Backlog.
4. Inspect actual implementation, imports/call sites, tests, configuration, workflows and deployment settings governing the requested behaviour. Do not infer implementation from filenames or docs alone.
5. Classify relevant features as Implemented, Partially implemented, Planned, Deprecated/historical, or Unknown/unverified. Cite current code/tests or dated workflow evidence.
6. Compare current production deployment with current branch. A merged commit is not proof of deployment; a successful deployment is not proof of manual OAuth/device acceptance.
7. Only then make changes. Update relevant docs in the same PR. Record evidence and uncertainty, not assumptions.

If GitHub, local runtime, secrets, private HF data or Cloudflare telemetry cannot be accessed, state exactly what could not be inspected. Never claim to have checked a working tree, live deployment, private dataset or credentialed path without doing so.

## Project identity and boundaries

- Repository: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library
- Production: https://taiyous-personal-library.pages.dev
- Production source branch: master.
- App shell/source: public. Novel data: private HF Dataset AdityaSreevatsaK/Taiyous-Novels.
- Hosting: Cloudflare Pages + Pages Functions. HF Spaces are historical, not production hosting.
- This is a novel/EPUB product, not a manga-page reader or generic media app.
- Novel data, immutable IDs, EPUB/ZIP assets, progress, reviews, collections and offline copies are valuable user data.

## Product vision and durable requirements

Provide a polished, responsive, installable personal web-novel library with a real EPUB reading experience, reliable chapter/progress navigation, metadata and cover discovery, collections, personal ratings/reviews, offline reading and private cloud access.

Preserve these principles:
- Reading and publication status are different. A user's Finished state must never be inferred from Story Complete. On Hiatus, Updating or Dropped must not become Finished automatically.
- Stable 24-character novel IDs are identity. Human-readable folders/slugs are not identity; legacy ID-only folders remain supported.
- Local offline EPUBs, cloud EPUBs, public app-shell cache and private HF data are separate stores with separate deletion rules.
- Actions should be explicit and reversible where possible. Distinguish pending from confirmed persistence.
- Protect long-form reading, real covers, responsive layouts, accessibility, active theme IDs and user preferences.
- Keep catalogue and personal-state loading efficient. Do not issue speculative per-novel requests when a bulk snapshot is available.

See docs/UX_BEHAVIOUR_CONTRACT.md for detailed UI rules.

## Architecture and stack

The app uses React 18, TypeScript, Vite, EPUB.js, JSZip, idb/IndexedDB, Hugging Face Hub APIs, Cloudflare Pages Functions and Vitest. CI uses Node.js 22. package.json and package-lock.json are authoritative for exact versions.

Main areas: src/App.tsx (orchestration); src/components/ (UI); src/lib/ (routing, catalogue/import, EPUB chapters, storage/offline, cloud, personal sync, collections, tags and status logic); functions/api/ (same-origin APIs); functions/_lib/ (server-side OAuth, validation, personal state); public/ (PWA assets); scripts/ and tests/ (build and regression harnesses); .github/workflows/ (verification, security, deployment and disposable integration).

The app shell is public. OAuth tokens and owner credentials remain server-side. HF dataset access is authenticated and server-enforced. Owner authorisation is separate from ordinary sign-in.

## Current personal-state implementation: PR #110

PR #110, “Bulk personal state and revision-safe PATCH migration”, merged to master on 21 November 2026. Merge commit: d774b9121999c15d233b144e522fee5959305cd1. The current master was checked against that SHA and was identical at the time of this documentation update.

Implemented:
- One authenticated bulk personal-state GET for existing progress, reviews and collections, replacing speculative per-novel GETs.
- First-use, revision-bound, non-destructive migration of existing v1 sidecars to data/personal/state.json. Legacy files remain as recovery copies.
- Selective PATCH with content revisions and compare-and-set conflict handling.
- Explicit reconciliation of competing edits, offline recovery and protection against client clock skew.
- Tests for bulk loading, migration, malformed input, races and two isolated authenticated browser contexts.

The isolated acceptance exercised shipping Pages Functions locally over HTTPS, two separate encrypted HttpOnly browser sessions, a disposable private HF dataset, offline edits/reconnection, conflicting writes, conflict approval and second-browser recovery. The test dataset was deleted. See docs/ISOLATED_TWO_BROWSER_ACCEPTANCE.md and the release runbook.

Known boundary: the test did not drive Hugging Face's interactive consent/authorisation redirect and PKCE token-exchange journey. Do not describe the complete interactive sign-in journey as end-to-end tested. No production dataset mutation was part of the acceptance.

## Data and security invariants

- Never expose HF tokens, OAuth refresh material, session keys, owner passphrases, private novel content or personal notes in frontend bundles, public files, logs, screenshots or fixtures.
- Never use production HF credentials for disposable tests. The test must create/delete only its uniquely named private dataset.
- Never delete/recreate production dataset, bulk-delete EPUBs, rewrite catalogue identities, or migrate/delete production records without separate explicit owner approval and a verified independent backup.
- Do not weaken owner checks, OAuth state/PKCE, cookie flags, path allowlists, revision checks, upload validation, CSP or security gates.
- Preserve legacy folder and sidecar compatibility. Missing catalogue plus other data files is a recovery condition, not an empty library.
- Keep cloud personal records distinct from device-local preferences/tags/summaries where code defines them separately. Inspect current state logic before promising sync scope.
- Cache-only offline EPUB removal is not whole-novel deletion. Verify hosted replacement before deleting the only local copy.
- Use synthetic records. Never put real private book data in public CI artefacts.

## Development and delivery

Typical commands, subject to package.json:
npm ci
npm run typecheck
npm test
npm run build
npm run preview

Use Node.js 22. Add focused regression tests. For UI/reader changes test desktop/mobile, all six themes, deep links, offline cold start and EPUB iframe rendering as applicable. For sync changes test revisions, conflicts, offline recovery, request counts and disposable HF/two-browser workflow. For security changes inspect server-side enforcement.

Routine delivery:
1. Branch from latest master.
2. Make a focused change, update relevant docs, inspect full diff and run checks.
3. Open PR against master and review its diff and required checks.
4. Standing owner authorisation covers routine code/docs merges and verified Cloudflare deployments. Merge after required checks pass; do not ask again for routine approval.
5. Verify exact master SHA, Verify and CodeQL, auto-deploy dispatcher and final Deploy Application job. Check public endpoint where possible.
6. Report PR, SHA, checks actually run, deployment outcome and manual/real-provider gaps.

Never force-push master, bypass failing checks, weaken branch protections or create one-off deployment workflows. A failed deployment is not a release.

Standing authorisation excludes destructive production data operations, bulk asset migration/deletion, security/permission changes, private-data publication, release tags/GitHub Releases and sibling-repository changes. Obtain explicit approval for those.

## Documentation maintenance

- Keep this file concise; link to topic-specific docs.
- Update architecture, UX, testing, operations or status docs in the same PR when implementation/decisions change.
- Date and identify historical evidence with PR/SHA. Do not phrase old plans as current truth.
- Avoid duplicated long descriptions. Maintain one canonical explanation and link elsewhere.
- Keep a current-state document with last-verified SHA/date and explicit implemented/partial/planned/deprecated/unverified labels.
- Never claim private data, OAuth, mobile hardware or production behaviour was tested unless evidence covers it.
