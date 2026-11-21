# AI Agent Playbook: Taiyou's Personal Library

**Status:** Maintainer guide; state last reconciled 21 November 2026. Follow the dynamic preflight in root AGENTS.md before acting. **Applies to the existing production Novel Library**, not the other Taiyou applications.

**Start here:** [Root AGENTS rules](../AGENTS.md) | [README](../README.md) | [UX contract](UX_BEHAVIOUR_CONTRACT.md) | [Architecture](ARCHITECTURE_AND_DATA_LIFECYCLE.md) | [Testing and release](TESTING_RELEASE_RUNBOOK.md) | [Operations and decisions](OPERATIONS_DECISIONS_AND_BACKLOG.md).

> The repository source and Cloudflare app shell are public. The real novels and selected personal files are private. Protecting those private assets, the owner's reading progress, and offline reading outranks refactoring, visual polish or ecosystem unification.

## 1. Project identity and purpose

**Repository:** https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library  
**Production:** https://taiyous-personal-library.pages.dev  
**Source branch:** `master`  
**Hosting:** Cloudflare Pages and Pages Functions  
**Private storage:** Hugging Face Dataset `AdityaSreevatsaK/Taiyous-Novels`  
**Local storage:** IndexedDB for EPUBs, covers and novel records; localStorage for several preferences, collections and local usage analytics.  
**Stack:** React 18, TypeScript, Vite, EPUB.js, JSZip, idb, Vitest, Playwright-driven browser smoke, Cloudflare Functions, Hugging Face Hub.

The app is a personal, installable, responsive EPUB/ZIP library for Chinese and other web novels. Readers can maintain a catalogue, browse metadata and collections, track progress, read full EPUB chapters in vertical-scroll mode, cache copies offline, and synchronise selected personal state. The product is designed around **novels**, not manga pages, anime episodes or a generic database.

The owner cares deeply about **design consistency, readable long-form text, true cover art, accurate status semantics, reversible low-risk actions, explicit confirmation for destructive actions, offline safety, privacy and a dependable production app**. Avoid visual redesigns that change approved functionality or styling without a real reason.

## 2. Mandatory preparation for every new session

1. Identify the precise user request, intended repo and whether it is documentation, UI, state, authentication, dataset or deployment work. Do not act in another Taiyou repository without separate authorisation.
2. Fetch live master SHA, working-tree status if local, recent commits, pending PRs, relevant issues, branch heads, latest Verify/CodeQL/auto-deploy/deploy runs and exact affected source. Never assume a prior chat or handover is current. If a PR for the same change exists, review it before branching.
3. Read `AGENTS.md`, this playbook, the UX contract, architecture/data guide, release guide and the topic-specific docs. Read historical handovers only as historical evidence.
4. Inspect the actual implementation and tests; check both desktop and mobile. Use the browser smoke suites for regressions involving real layout, offline operation or in-iframe EPUB display.
5. Record current behaviour and the proposed acceptance checks. Use a small branch off latest `master`, not a stale feature branch.
6. For normal changes, implement, add regression coverage, review your own diff, open a PR, await required green checks, merge to `master` under the owner's standing routine approval, then verify **the deployment job** actually completed successfully.
7. For privileged security changes, schema migrations, destruction of production data or releasing version tags, STOP that operation and obtain the owner's explicit approval. A routine merge authorisation does not include those operations.
8. Give a precise final report: PR, commit, verified tests, merge, production deployment and remaining limitations. Do not claim a workflow is deployed merely because it was dispatched.

### Sources of truth, in order

1. The current checked-in code and relevant tests.
2. The current production workflow run and actual environment, for live behaviour.
3. Root `AGENTS.md` and these maintained docs for policy and intended contracts.
4. Historical migration notes, old PRs and handovers for background only.

When docs contradict code, do not silently invent reconciliation. Verify the correct contract, fix the code or docs and explain the difference. For private Hugging Face data that is inaccessible, state the missing evidence rather than pretending to have checked it.

## 3. Repository orientation

| Location | Main responsibility |
| --- | --- |
| `src/App.tsx` | Main state/orchestration, routing, cloud/session operations, progress, collections, import and owner actions |
| `src/types.ts` | `LibraryBook` and reader settings contracts |
| `src/components/LibraryDashboard.tsx` | Main shell, navigation, shelf filtering, search, import UI, catalogue |
| `src/components/EditorialHome.tsx` | Hero, random cover display, last-three reading desk, discovery and journal |
| `src/lib/home-curation.ts` | Testable curation, recency and cover selection logic |
| `src/components/BookDetails.tsx` | Book metadata, read links, personal tags, collection membership, progress and management |
| `src/components/Reader.tsx` | EPUB.js lifecycle, iframe appearance, chapter navigation, URL progress and scroll |
| `src/components/QuickNavigation.tsx` | Reusable Home/Library/Currently Reading/collection navigation |
| `src/components/NovelCollectionPicker.tsx` | Explicit Add/Remove membership and nested collection selection |
| `src/components/MasterControls.tsx` | Privileged maintenance, metadata, publication status, tags and offline cache controls |
| `src/components/AppDialogs.tsx` | Reusable app-owned confirmation/prompt UI rather than browser alert/confirm |
| `src/components/PublicationCornerRibbon.tsx` | Compact publication-state ribbon separate from reading completion |
| `src/lib/routes.ts`, `src/lib/library-routes.ts`, `src/lib/page-titles.ts` | Human-readable URLs, deep links, tab title conventions |
| `src/lib/storage.ts`, `src/lib/offline.ts` | IndexedDB, local files, service-worker-related/offline behaviours |
| `src/lib/cloud.ts`, `src/lib/novel-paths.ts` | Private Hub interactions, catalogue and safe novel asset paths |
| `src/lib/collections.ts`, `src/lib/tags.ts` | Collection hierarchy, membership/merge, tag normalisation/sorting |
| `src/lib/reading-status.ts`, `src/lib/publication-status.ts` | Critical distinction between reading and publication status |
| `src/lib/usage-analytics.ts`, `src/components/UsageDashboard.tsx` | Local-only active-usage metrics |
| `functions/api/library.ts`, `functions/api/oauth/[action].ts`, `functions/api/owner.ts` | Same-origin private API, OAuth and privileged actions |
| `functions/_lib/catalogue.ts`, `functions/_lib/oauth.ts` | Server-side catalogue validation and session/security utilities |
| `src/styles.css`, `src/theme-palettes.css`, component CSS | Design tokens and responsive styling |
| `public/branding/` | Approved Sun logo, favicon and PWA artwork |
| `scripts/browser_smoke.mjs`, `scripts/csp_browser_smoke.mjs`, `scripts/epub_security_smoke.mjs` | Real browser, CSP and hostile EPUB regressions |
| `tests/` and `src/lib/*.test.ts` | Pure data/domain and security contract tests |
| `.github/workflows/` | Verify, CodeQL, guarded automatic deployment, manual fallback and disposable dataset checks |

Always inspect the imports and newest code before asserting a component's ownership. Older docs may describe previous design iterations.

## 4. Non-negotiable architectural invariants

- **No lost books:** Do not delete, recreate, bulk-rewrite or migrate the owner's live Hugging Face Dataset as part of a reader/frontend change.
- **Stable identity:** Novel IDs are 24-character lowercase hexadecimal values. A novel's title, slug and displayed folder label are not its primary key.
- **Compatible paths:** Both legacy ID-only and readable `<id> - <sanitised title>` folder forms are supported. Keep recorded `epubPath` and sidecars, do not derive the storage folder afresh on a title rename.
- **Public shell, private content:** No novels, EPUB excerpts, personal comments, dataset credentials, OAuth token or owner passphrase in Git, PR logs, public bundles or fixtures.
- **Cloud is not the cache:** EPUB binaries and covers can exist in private remote storage and in the browser's IndexedDB independently. Offline cache deletion must never delete a cloud novel.
- **Owner is distinct from OAuth login:** Server-validated Owner mode protects whole-novel and collection deletion and privileged corrections. Do not substitute a mere frontend toggle.
- **Reading completion is not publication status:** A source novel can be Story Complete even when the owner has not finished reading; an Updating novel at 100% is merely caught up.
- **Collections are reversible:** Adding or removing one membership must not delete the novel or collection; nesting is structural and does not imply inherited membership.
- **Mobile and offline are first-class:** User preference changes must not break small screens, direct/legacy links, keyboard navigation, PWA cold start or EPUB scrolling.
- **Do not change four sibling repositories:** Shared Core/Hub, Manga, Anime and Movies/TV remain separate. Shared packages are not currently a runtime dependency.

## 5. Rules for user-facing changes

- Follow [UX behaviour contract](UX_BEHAVIOUR_CONTRACT.md). It records approved layouts and exact prior regressions.
- Preserve the eight navigation destinations, the approved Sun brand, six themes, theme-specific contrast, mobile defaults, reader right-hand controls, and the bottom Previous / chapter picker / Next navigation.
- Make functionality visible. A selected collection must have a real **Remove** action, not an ambiguous **Added** button.
- Prefer small themed app-owned dialogs and stacked toasts over browser-native confirmation boxes and giant overlays.
- Existing imported genres and personal tags appear identically, alphabetically; the novel page is **add-only** for personal tags. Removal is in Master Controls, not via an accidental cross.
- Keep publication ribbons subtle and labelled `Story Complete`, `Updating`, `On Hiatus`, `Dropped`, never confusing their meaning with the Finished shelf.
- Randomised Home hero and covers remain stable during ordinary React rerenders but can vary on a new Home visit. Home's reading desk previews only the **three latest** in-progress novels, with a View all link.
- The reading iframe is separate DOM. Changes to book chapter typography, heading bands, full-width high-contrast rules and end-of-chapter whitespace belong in `Reader.tsx` EPUB styling/hooks, not just outer CSS.
- Do not add needless tooltips when the full title is already visible. Preserve real cover images and sensible fallback behaviour, and do not replace them with fake generated covers.
- Maintain accessible contrast, focus, labels, keyboard access and predictable hover. Test desktop, a mid-size layout and narrow mobile.

## 6. Data and sync boundaries

Read [Architecture and data lifecycle](ARCHITECTURE_AND_DATA_LIFECYCLE.md) before writing any persistence code.

- Cloud catalogue and EPUB/ZIP/cover assets: private HF Dataset.
- Per-book reading progress, notes/reviews and collections: selected synced private documents, also locally available/cached.
- Personal tags, custom synopsis, reader settings and local usage analytics: **device-local** according to the current contract.
- PR #110 merged on 21 November 2026 (commit d774b9121999c15d233b144e522fee5959305cd1) and implements bulk progress/review/collection retrieval, revision-bound sidecar bootstrap, selective PATCH and conflict handling. See Architecture, Testing/Release and Project State docs.
- The disposable private-HF and two-browser Pages acceptance passed for PR #110. It did not exercise interactive Hugging Face consent/PKCE redirect; do not claim full sign-in E2E coverage.
- Device-local tags, custom summaries and reader preferences are not automatically covered by PR #110. Inspect current persistence code before promising cross-device sync.

## 7. Engineering task matrix

| Change | Minimum evidence |
| --- | --- |
| Visible UI / copy / CSS | Inspect both theme variants and mobile; browser smoke for layout/regression |
| Home curation, sorting or filters | Pure unit tests for deterministic ordering, empty cases and full-shelf invariants |
| Chapter layout, EPUB processing or links | Real compiled-browser smoke with synthetic EPUB, CFI/deep links, CSP and offline tests |
| Tags, collections or personal state | Unit tests, draft/save/reopen/reload tests and pending-sync safety |
| Cover or catalogue paths | Path validation, legacy and readable folder tests, archive safety, no wrong-book asset |
| Cloud gateway or auth | Server-side validation tests, negative unauthorised requests, no credentials in bundles |
| Whole-novel deletion/migration | Separate owner approval, verified backup, correct revision, isolated real-cloud acceptance |
| Release changes | Exact SHA, Verify+CodeQL, guarded deploy, real deployed endpoint verification |

No test should modify the production dataset. Synthetic fixtures are preferred. Use deliberate real-cloud tests only against a disposable dataset, with separate explicit authorisation where needed.

## 8. Local setup and workflow

Node.js 22 is the version used by GitHub Actions. Windows without WSL is supported; install Node/npm and a trusted local checkout.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

View the local Vite address shown by the command; `npm run preview` serves a production build. Browser scripts additionally require Playwright/Chromium and local test fixtures. Prefer the repository workflow commands to ad hoc changes in CI dependencies.

**Branch sequence:** latest master -> short-lived feature branch -> targeted implementation and tests -> PR and diff review -> required green Verify and CodeQL -> merge routine change -> verify exact master push tests -> automatic guarded deployment -> confirm final Deploy Application run and public site. Never force-push production, bypass tests, silently downgrade dependencies or push raw user data.

Standing approval for routine verified PR merges and deployment is recorded in root `AGENTS.md` (19 November 2026). It explicitly excludes privileged/security changes, destructive HF operations, version tags, public content exposure and cross-repo work.

## 9. Troubleshooting principles

- **Control in wrong corner:** Check CSS grid direct children and breakpoint rules, not merely colour variables. Previously reader controls slipped to a second left-hand row because a three-column grid had four children. Regression checks must measure geometry.
- **Tags reorder only after refresh:** Sort the merged display, not the stored source list, and rerender immediately after draft additions and after confirmed save.
- **Cannot remove collection membership:** Distinguish passive `✓ Added` state from clickable `Remove`; verify persistence after reload.
- **Chapter divider missing or end cramped:** EPUB.js `scrolled-doc` measures real DOM Range children. CSS `body::after` or bottom padding alone can be **invisible to EPUB.js sizing**, despite passing computed-style checks. The chapter needs one inert last-child `data-taiyou-chapter-end` element, without moving/removing source text or changing existing CFI paths. Scroll the **real `.epub-container` to its actual end** and verify the last paragraph is comfortably above the footer, with the full-width divider visible. Test all themes, mobile and long chapters.
- **Wrong book after rename:** Inspect canonical ID and slug collisions. Legacy `/book/<id>` still works; old title-only slugs do not have a universal historical alias table.
- **Offline launch fails:** Verify the same-origin service-worker cache, source origin, IndexedDB EPUB and a real cold launch. A green build alone does not prove offline reading.
- **Sync data seems stale:** Check local pending state, remote revision, sign-in, and conflicts. Do not overwrite the remote copy to make an error disappear.
- **Deployment red after merge:** Diagnose workflow logs. A stale commit refusal is intended protection if master advanced; evaluate the newest master run and deployment rather than disabling the guard.

## 10. Stop conditions and reporting template

Stop only the unsafe action and request explicit authorisation when the task requires actual production dataset deletion or migration, releasing secrets, permission model changes, exposing content, disabling security guards, or creating version tags/releases. Routine code and docs do not need repeated approval.

Report in this structure:
1. **Implemented:** precise files/features, what changed and what intentionally did not.
2. **Verified:** unit/build/browser/offline/CodeQL status, exact SHA and evidence links.
3. **Released:** PR merged? Production deployment completed? Separate those states.
4. **Risks:** real account/device/dataset acceptance still unverified and follow-up issues.
5. **User action:** only tasks genuinely requiring user-only secrets, permissions or real-device checks.

## 11. Further reading

- [UX behaviour contract](UX_BEHAVIOUR_CONTRACT.md)
- [Architecture and data lifecycle](ARCHITECTURE_AND_DATA_LIFECYCLE.md)
- [Testing and release runbook](TESTING_RELEASE_RUNBOOK.md)
- [Operations, decisions and backlog](OPERATIONS_DECISIONS_AND_BACKLOG.md)
- [Capabilities](CAPABILITIES.md), [Standalone PWA](STANDALONE_PWA.md), [OAuth and owner mode](ACCESS_GATEWAY.md)
- [Readable folder rules](READABLE_NOVEL_FOLDERS.md)
- [Ecosystem integration](ECOSYSTEM_ARCHITECTURE.md), [cross-media contracts](ECOSYSTEM_DATA_CONTRACTS.md)
- [Fresh-session handover prompt](SESSION_HANDOVER_PROMPT.md)

**Historical only:** `PROJECT_HANDOVER.md`, `STAGING.md`, `GITHUB_WORKFLOW.md` older revisions and old Hugging Face Spaces notes. They are not current production authority.
