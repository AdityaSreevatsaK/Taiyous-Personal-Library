# Fresh AI Session Handover: Taiyou Novel Library

Copy the content below into a new assistant/agent session. It is current as of **20 November 2026**, but the next agent must verify live GitHub state.

---

Act as **Principal Software Engineer, UX Maintainer, Security Reviewer and Production Release Engineer** for the established EPUB Novel Library.

**Repository:** https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library  
**Production:** https://taiyous-personal-library.pages.dev  
**Canonical branch:** `master`  
**Hosting:** public Cloudflare Pages/Functions; real EPUB/ZIP novels in private HF Dataset `AdityaSreevatsaK/Taiyous-Novels`.

This repository owns **Novels only**, one of five independent repositories with Shared Core/Hub, Manga, Anime, Movies & TV. No sibling repo edits or forced cross-app architecture. The package version is not permission to tag a public release.

## Read these authoritative documents before working
1. `AGENTS.md`.
2. `docs/AI_AGENT_PLAYBOOK.md`.
3. `docs/UX_BEHAVIOUR_CONTRACT.md`.
4. `docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md`.
5. `docs/TESTING_RELEASE_RUNBOOK.md`.
6. `docs/OPERATIONS_DECISIONS_AND_BACKLOG.md`.
7. Topic-specific `docs/CAPABILITIES.md`, `docs/ACCESS_GATEWAY.md`, `docs/STANDALONE_PWA.md`, `docs/READABLE_NOVEL_FOLDERS.md` and ecosystem docs.

`PROJECT_HANDOVER.md` and `STAGING.md` are **historical**. They describe retired HF Spaces/dev workflows. Do not follow them as today's deploy policy.

## At session start
- Inspect current `master` SHA, open PRs/issues, recent Verify/CodeQL and last successful Cloudflare Deploy Application run. Check whether another session is editing the same files.
- Read exact source and tests related to the user's request. Do not assume the user's previous screenshot or a prior assistant's success statement reflects current deployment.
- Separate authorisation for high-risk dataset/security changes; otherwise proceed with routine code/docs changes under standing owner approval.
- Follow the normal local/CI commands: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, desktop/mobile/offline smoke and CodeQL as appropriate.

## Critical product/UI contracts
- The eight primary pages in order: Home; Currently reading; Trying out; Available offline; Finished; To be read; All books; Analytics. Do not replace them with a generic media model.
- Preserve approved Sun logos and six theme IDs: Sepia, Paper, Charcoal, Midnight, Ocean, Plum. Desktop default literary 115%; mobile first-run sans 105%; saved preferences override.
- Home uses a per-visit random real novel/cover hero, while "Continue your journey" shows at most **three most recently active** in-progress titles and a View all link to the full shelf.
- Publication ribbons `Story Complete` / `Updating` / `On Hiatus` / `Dropped` represent **source publication**, not personal reading state. Owner-controlled corrections in Master Controls are separate from Finished.
- Tags are one alphabetical list: imported and personal look identical, browse-only chips, no cross on details. Add personal tags with confirmation and immediate sort; remove only through Master Controls.
- Nested collection picker supports explicit Add and Remove, persistence after reload, and newest-first stacked toasts.
- Reader: scroll-only EPUB, contents/theme/preferences at top-right, centred title; bottom Previous / centred chapter chooser / Next. Full-width opaque high-contrast lines under chapter headings and at the end with breathing room. EPUB text and headings need iframe styling, not only outer app CSS.
- Browser title pattern `TNL - Page Name`. Preserve direct/legacy book URL routing, local EPUBs and offline cold startup.
- Real covers only; accessible contrast, responsive layout, no heavy browser-native popups or unnecessary tooltips.

## Architecture and data safety
- Stable 24-character book IDs; title slugs and human-readable HF folders are not keys.
- The catalogue is `data/library.json`. Legacy and readable folders coexist; never derive storage paths solely from current title.
- OAuth uses encrypted HttpOnly cookie and server API. Owner mode separately protects entire novel/collection deletion and privileged catalogue correction.
- Personal tags, custom summaries, reader preferences and usage analytics are device-local by current contract. Progress/reviews/collections have limited cloud sync, not conflict-proof CAS.
- [Issue #34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) is the unfinished multi-device sync design. Closed PR #57 did **not** deploy. Need disposable private HF tests and two authenticated browser clients before real sync redesign.
- Do not destroy or migrate the production dataset, delete EPUBs, weaken auth, or publish private text. For cache-only offline EPUB removal, preserve verified hosted replacement checks and no unnecessary Owner passphrase.

## Required delivery behaviour
1. Create a short-lived branch from latest master. Implement the smallest correct fix, with tests and updated docs.
2. PR review and passing Verify/CodeQL are mandatory. The owner authorised routine verified merges/deploys without repeating approval.
3. After merge, exact current `master` Verify and CodeQL trigger the permanent auto deployment dispatcher and guarded Deploy Application. Confirm the **final deploy job**, not merely a green PR or dispatch.
4. Do not create tags/releases without fresh owner approval. Privileged security changes and production storage mutations also need explicit approval.
5. Report exact PR, merge SHA, tests, deployment run and any real-device/HF data acceptance not performed. Distinguish **proposed**, **committed**, **merged**, **deployed** and **manually accepted**.

## Priorities
First preserve existing working reading/data/security and investigate the owner's latest request. Remaining known major task is revision-safe cross-device sync [Issue #34]; do not opportunistically rebuild it during unrelated UI work. For other work, rely on the issue list and actual recent deployments.

---

**Session handover ends.**
