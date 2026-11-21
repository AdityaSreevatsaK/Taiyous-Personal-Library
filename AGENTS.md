# AI Agent Rules: Taiyou's Personal Library (Production Novels)

> **Canonical maintainer handbook (20 November 2026).** Before writing code, read
> [AI Agent Playbook](docs/AI_AGENT_PLAYBOOK.md),
> [UX Behaviour Contract](docs/UX_BEHAVIOUR_CONTRACT.md),
> [Architecture and Data Lifecycle](docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md),
> [Testing and Release Runbook](docs/TESTING_RELEASE_RUNBOOK.md), and
> [Operations, Decisions and Backlog](docs/OPERATIONS_DECISIONS_AND_BACKLOG.md).
> These maintained documents supplement the hard rules below. The current
> `master` implementation and verified deployment runs take precedence over
> contradictory historical notes. Do **not** treat `PROJECT_HANDOVER.md`,
> `STAGING.md` or an old draft PR as the current production plan.


**Scope:** this is the established EPUB/ZIP Novel Library, not an experimental scaffold. Its source repo is PUBLIC; its Hugging Face dataset is PRIVATE. The app runs at https://taiyous-personal-library.pages.dev with automatic, verification-gated Cloudflare deployment after each successful merge to `master`. Other sessions own the Shared Core/Hub, Manga, Anime and Movies & TV repositories.

## Highest-priority invariant: never lose books or regress reading
The Novel Library contains real private data, reading progress, collections, reviews, covers and offline caches. Do not migrate, delete, rename or reupload live dataset files as part of ecosystem work. A code refactor is NOT worth an unverified catalogue change. No forced rewrite of the 24-character book IDs, human-readable novel folders, existing EPUB paths or personal sync documents. Owner-mode deletion, legacy compatibility and offline reading must remain functional.

## Mandatory start and sources of truth
1. Inspect the CURRENT GitHub `master`, open PRs, workflow status, branches and recent merge/deploy history. Do not trust older README/HANDOVER claims without verification.
2. Read this AGENTS file, `README.md`, `docs/CAPABILITIES.md`, `docs/STANDALONE_PWA.md`, `docs/ACCESS_GATEWAY.md`, `docs/READABLE_NOVEL_FOLDERS.md` and **all relevant ecosystem docs**.
3. Inspect current implementation in `src/App.tsx`, `src/components/LibraryDashboard.tsx`, `src/components/Reader.tsx`, `src/lib/cloud.ts`, `collections.ts`, `offline.ts`, `storage.ts`, `owner.ts`, `functions/api`, workflows and tests.
4. Run `npm ci`, `npm run typecheck`, `npm test` and `npm run build` in a trusted checkout.
5. Compare actual behaviour on desktop/mobile, offline and private-cloud paths. Record differences between docs and code, and repair docs only after verification.

## Strict ownership boundaries
- Novel Library owns EPUB import/export, reader navigation, real cover handling, chapter progress, collection membership and private novel dataset storage.
- Shared Core is an experimental build-time source-code package plus optional parent Hub. **Do not import its unpublished 0.0.0 workspaces into this production app** or make the Novel Library call its live URL at runtime.
- Manga, Anime and Movies & TV have different progress semantics. Never redesign novel progress to fit a one-size-fits-all media model.
- Any reusable UI extraction must be opt-in, tested by at least two consumers, version-pinned and rollback-safe. No bulk move to a new repository.

## Security rules
Never expose HF tokens, owner passphrases, private book text/files, personal notes or dataset paths through public GitHub, Vite variables, frontend bundles, logs or screenshots. OAuth has an encrypted Secure HttpOnly session via Cloudflare Functions, scoped to this app origin, not cross-app SSO. Server-side authorisation is mandatory for whole-novel deletion. Local offline-copy removal must not be incorrectly owner-restricted. Use revision checks, exact confirmation and verified backup on destructive operations; reject unsafe archive inputs and catalogue overwrites.

## Engineering and UX
TypeScript strict, React 18, Vite, EPUB.js, IndexedDB and Cloudflare Pages Functions. Preserve mobile/desktop accessibility and immersive reading. Maintain existing light/dark/sepia and other active design themes, real covers only, 1–10 rating semantics, personal notes and tags. Minimise network calls, latency and bundle growth. Show clear empty/offline/loading/conflict states. Never represent temporary user edits as persisted cloud writes without verification.

## Standing owner authorisation for routine PRs and deployment (19 November 2026)
- **The owner explicitly authorises agents to merge routine Novel Library PRs and deploy each successfully merged change without seeking permission again.** This supersedes the former per-merge/per-deployment approval policy. Do not ask reflexively whether to merge or deploy.
- Default execution: implement on a short-lived feature branch; open a focused PR; review the exact diff; await required passing unit/type/build/browser/CodeQL checks; **merge to `master`; automatically deploy to Cloudflare after `master` Verify and CodeQL succeed**; verify the production run; report merge SHA, workflow and deployed state.
- `master` remains the protected production source. Do not force-push, weaken branch rules or bypass failing CI/CodeQL. If CI fails, repair and rerun; do not deploy an unverified commit.
- Permanent `.github/workflows/auto-deploy-verified-master.yml` triggers only after a **successful push-based Verify workflow on `master`**, confirms the exact current SHA and the corresponding successful CodeQL run, then dispatches existing guarded `deploy-standalone.yml` with `publish=true`. The existing deploy workflow independently rebuilds, tests, checks offline reading, audits production dependencies, checks private-data exposure and verifies public OAuth metadata.
- A failed deployment is **not** a successful release. Investigate, repair and repeat verification; if the owner says *do not deploy*, honour that explicit instruction.
- Keep the manual dispatch pathway for recovery, but it is **not required** for normal merges. Do not create temporary one-shot dispatch workflows for routine releases.
- Never assume a workflow request means the site is deployed; check the actual deployment job and public endpoint.
- The standing authorisation **does not** approve destructive Hugging Face Dataset/catalogue mutations, bulk EPUB deletion or migration, changes to owner/auth/permission security, publication of private content, release tags/GitHub Releases (including v1.0), or changes in sibling repos. For these high-risk operations obtain separate explicit owner consent, preserving existing backups and safeguards.
- An outstanding development-dependency advisory must be tracked honestly, not masked by disabling tests or weakening production dependency checks.
- Report exact PR, SHA, workflow/deployment outcome and remaining unverified cases.

## Ecosystem responsibilities
Review `docs/ECOSYSTEM_*.md` and `docs/SESSION_HANDOVER_PROMPT.md`. Propose small stable stateless components and pure search/rating primitives, but do NOT change existing data/schema/auth automatically. Send proposals to the Shared Core agent with API, tests, expected consumers, compatibility, performance and rollback. All other repo changes are out of scope unless owner separately authorises.

## Hard stops
Never delete/recreate the HF dataset; never remove source EPUBs, downgrade owner security, make private data public, bypass content access controls, disable backup/version checks, rewrite master history, or publish GitHub releases/tags without separate explicit approval. The owner has already approved routine verified code merges and Cloudflare deployments as described above; that approval does not cover destructive or security-sensitive operations. Pause only the risky operation and ask for specific consent.

## Acceptance
The user's existing library and progress remain readable on desktop and mobile; deep links, collections, offline reading and Cloudflare OAuth still work; no increased private-data exposure. A green CI alone is not a substitute for real acceptance.


## Mandatory owner-approved UX invariants (20 November 2026)

- **Six primary navigation destinations** in order: Home; Currently Reading; Trying Out; Available Offline; Finished; All Books. Remove To Be Read from primary navigation (keep the old URL valid). Put password-free Analytics inside Master Controls, with protected Library management under a separate internal choice; preserve legacy `/analytics` URLs. Keep collections, tags and search accessible. Browser tabs use `TNL - Page Name`, including the actual novel title.
- **Home:** select the featured novel and real cover gallery afresh on each Home visit, not every rerender; show only the **three most recent in-progress** novels in "Continue your journey" and provide a link to the full Currently Reading shelf. Never truncate persisted progress or the full shelf.
- **Reading status vs publication:** source ribbons stay slim/muted (`Story Complete`, `Updating`, `On Hiatus`, `Dropped`). A source `Completed` correction is not a personal `Finished` action. Privileged publication corrections belong in Master Controls.
- **Tags:** all imported/personal tags appear as visually identical A–Z browse chips on novel details; add personal tags with confirmation and **re-sort immediately**. There are **no inline removal crosses**. Remove personal tags only in Master Controls and preserve imported genres. Details save is add-only.
- **Collections:** nested collections, direct memberships, real **Add** and **Remove** buttons, persistence after close/reload, newest-first stacked notifications. Removing one membership never deletes a novel/collection.
- **Reader:** vertically scrolling EPUB chapters. Back/home controls left, title centred, contents/Library/theme/preferences **top-right**; do not let them wrap to the far left. The bottom bar retains Previous at left, centred chapter chooser, Next at right.
- **Reader chapter boundaries:** apply appearance **inside EPUB iframe**. Header, title band and body visually differ; full-width opaque 2px black/white line below chapter heading and again after the last paragraph, with meaningful space above/below the end marker. Preserve text, CFIs and offline use.
- **Visual language:** six existing themes and saved IDs; Sepia first-run, mobile sans font 105%, desktop literary 115% unless user settings are stored. Approved Sun branding, readable hover/focus contrast, real cover art, subtle ribbons, lightweight app dialogs. For bulk offline cache cleanup, use compact copyable `REMOVE DOWNLOADS` chip with the existing two-step confirmation.
- **Test the original mistakes:** desktop 1366px/1650px geometry, ~390px mobile, all six themes, reopening collection pickers, instant tag ordering, offline cold start and in-iframe chapter separators. See the UX contract.

## Documentation maintenance rules

- Update the appropriate maintained handbook when changing a contract. The root AGENTS entry point must not become stale.
- Do not copy historical Space/dev instructions into active CI or deploy processes.
- Keep actual code/CI evidence separate from intentions and user feedback. A passed workflow on an older SHA does not prove the new master deployment.
- Preserve the differences among: local cache save, pending cloud sync, confirmed cloud save, personal reading completion and a novel's publication status.

