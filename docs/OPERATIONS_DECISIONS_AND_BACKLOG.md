# Operations, Decisions, Incidents and Remaining Work

**Novel Library maintainer runbook, 20 November 2026.** Applies to `AdityaSreevatsaK/Taiyous-Personal-Library` only. Read the [agent playbook](AI_AGENT_PLAYBOOK.md) and [testing and release guide](TESTING_RELEASE_RUNBOOK.md) first.

## 1. Environments and ownership

| Item | Current contract |
| --- | --- |
| Canonical source | GitHub `master`, public app-shell source |
| Production | `https://taiyous-personal-library.pages.dev` on Cloudflare Pages |
| Backend | Cloudflare Pages Functions at same origin `/api/*` |
| Novel storage | Private HF Dataset `AdityaSreevatsaK/Taiyous-Novels` |
| Authentication | HF OAuth PKCE and encrypted Secure/HttpOnly session cookie |
| Owner authorisation | Separate privileged grant/passphrase, server-enforced |
| Offline | IndexedDB EPUBs/covers + same-origin cached PWA shell |
| Normal deploy | Verified master -> matching CodeQL -> guarded dispatcher -> Deploy Application |
| Manual deploy | `.github/workflows/deploy-standalone.yml` with Publish enabled, fallback only |
| Release tags | None authorised; do not create `v1.0` |

The inherited GitHub environment `standalone-staging` deploys **production** despite its name. The retired Hugging Face Spaces and previous `dev` preview origin are historical deployment infrastructure. The separate HF **Dataset** remains essential and MUST NOT be deleted.

## 2. Known historical incidents and lessons

### Accidental dataset deletion/restoration

The private Hugging Face Dataset was previously deleted and recreated, disrupting catalogue and EPUB fetches. Always distinguish the live private dataset from discontinued HF Spaces. An entire dataset delete/recreate or bulk clear operation is never an acceptable "cleanup" for UI issues. The owner later removed the dataset-delete option from the separate Storage Controller. Verify backups before considering any storage migration. An empty/missing `data/library.json` can mean no completed initial upload or an incorrect dataset revision; do not assume novels are permanently lost from one 404 alone.

### Hugging Face Spaces staging retirement

Earlier app deployments used private HF Spaces and a separate `dev` branch. Those deployments are no longer the production workflow. Historical `PROJECT_HANDOVER.md` and `STAGING.md` describe the old setup and have explicit historical warnings. Never run their old deployment commands against production.

### Cloudflare Access blocked public OAuth metadata

An old Cloudflare Access layer redirected the app's public client metadata endpoint to a login screen, preventing HF OAuth from fetching its public CIMD JSON. `/oauth-client.json` must be anonymously reachable, small, valid JSON with the correct client ID and redirect URI. Keep novel/API data private via backend sessions instead. Do not restore Access to the public client metadata URL without a separately verified alternative.

### UI regressions caused by misleading state

- Publication ribbons used to say **Completed** and suggested the owner had personally finished reading. Approved revision: slim muted **Story Complete** instead; distinct reader Finished shelf.
- Novel tag chips showed removable crosses for personal tags and not imported genres. Accidentally deleting a saved personal tag was too easy. Current details UI: identical browse-only tags, **add-only**; removal via Master Controls.
- Collection picker used **✓ Added** as a toggle with no explicit remove affordance. Current UI: passive state and visible **Remove** action, reload-persistent.
- Reader's TOC/theme/preferences were once placed on the far left below the header because a three-column grid had four children. Current fix groups them top-right; test geometry at desktop and mobile.
- Plum reader lacked visual separation between header, chapter title and body. Current implementation uses themed chrome, chapter heading band, opaque high-contrast full-width rules and extra scrollable end padding.
- Home once showed every in-progress book. It now previews **three most recently active**, with a link to the full Currently Reading shelf.
- Browser tabs were long and all identical. Current naming starts `TNL - ` and follows route/book title.
- The owner repeatedly rejected heavy dialog/picker styling and confusing hover contrast. Reuse lightweight in-app components and real focus/hover testing.
- For "remove verified downloads", a tiny monospace `REMOVE DOWNLOADS` chip with Copy action is preferable to a huge instruction paragraph. Keep the confirmation safeguards.
- Notifications for multiple collection changes should stack with **newest first**, not overlay the prior toast.

See [UX behaviour contract](UX_BEHAVIOUR_CONTRACT.md) for acceptance.

### Source metadata discrepancies

Source sites such as NovelFull may mislabel a novel as ongoing although publication is complete. Owner-authenticated Master Controls can correct `status` without altering the reader's personal Finished state or EPUB. Do not mark novel reading completed when the user means publication Completed.

### Unmerged sync proposal

Closed [PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57) described revision-aware sync, but was not released. It is not a valid basis for claiming live conflict-safe progress/collections. [Issue #34](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) tracks new current-master integration with real disposable HF and two OAuth browsers.

### Dependency audit advisories

Former [Issue #71](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/71) tracked high severity development-dependency advisories later withdrawn by the upstream advisory database. A fresh audit reported no vulnerabilities and the issue was closed as obsolete. That resolution does not authorise disabling future dependency checks.

## 3. Incident runbooks

### A. Novel or cover missing in the browser

1. Identify whether the item is in the **catalogue**, private HF file tree, browser IndexedDB, or offline-only state. These are distinct.
2. Confirm owner sign-in and `/api/library?action=session` health. Do not print tokens or private responses in public logs.
3. Inspect catalogue-declared `epubPath`/`coverPath`, exact book ID and validated directory. Check both readable and legacy layouts.
4. Try an authorised remote HEAD/GET through the existing API; no arbitrary path construction.
5. If storage is absent but cache exists, preserve the cache and export an independent EPUB before experimenting.
6. If remote catalogue is missing, stop writes, check HF dataset revision/history and independent backup. Do **not** create an empty replacement catalogue over the production revision.
7. Report precise scope: one cover, one EPUB, a catalogue reference or all books. Recovery writes need approval if destructive or migration-like.

### B. Cloud login fails or disconnects

1. Confirm public `/oauth-client.json` returns correct JSON with HTTP 200, not Cloudflare Access login, HTML or redirect.
2. Confirm `/api/oauth/callback` matches published metadata. Check server side errors without logging credentials.
3. Distinguish expired OAuth/owner cookies, missing Cloudflare encryption secret and genuine HF permission failures.
4. Avoid changing OAuth scopes, allowed HF owner or encryption keys casually; rotating the session key invalidates existing sessions.
5. Cached offline EPUBs should still work while cloud is disconnected.
6. Never propose an unprotected direct client token in localStorage to "fix" OAuth.

### C. Reader is visually broken

1. Identify theme, viewport, specific novel/chapter and whether the issue is outer React chrome or the EPUB iframe.
2. Reproduce on a synthetic EPUB and one real authorised book only if the user can provide access safely.
3. For layout: inspect `src/styles.css` and `src/theme-palettes.css`, CSS grid children, breakpoints and geometry.
4. For EPUB chapter text/bands/rules: inspect `applyAppearance` and iframe hooks in `Reader.tsx`; outer CSS is not enough.
5. Check page scroll, full-width title/end rules, actual end spacing, contrast, chapter/footer alignment, direct chapters and CFI.
6. Test six themes, desktop and mobile, including first/last chapter and offline cached reading.

### D. A collection removal does not persist

1. Verify whether current membership is actually present in `BookCollection.bookIds` and the collection is not tombstoned.
2. The picker must show **Remove** for an included item and **Add** for absent membership.
3. Check `changeCollectionMembership` and timestamped local updates in `App.tsx`; it should remove only the one book ID.
4. Reopen picker, reload page, check local pending flag and remote collections when signed in.
5. If a second device restored an old membership, investigate timestamp conflict; do not indiscriminately replace remote collections with local state.
6. Preserve collection hierarchy and other member novels.

### E. An offline EPUB cannot be removed

1. Check whether the book is hosted and the backend can verify a remote replacement.
2. If not verified, **retain** local EPUB. This is intentional safety.
3. For bulk removal, preserve two-stage confirmation and copyable `REMOVE DOWNLOADS` prompt.
4. No Owner passphrase is needed for removing only a verified local cache copy; whole-novel deletion is different.
5. Do not conflate browser IndexedDB cache with Cloudflare's app-shell service worker cache or the private dataset.

### F. CI/CodeQL/deployment fails

1. Check the exact PR/commit SHA and the first failing workflow step, not just the dashboard icon.
2. For typed/compiled/test failures, repair source or a verifiably stale test assumption; do not mask a genuine regression.
3. For Playwright flakiness, check whether waiting for global `networkidle` is wrong for a client-routed app; wait for a grounded visible element/route only if behaviour actually works.
4. For CodeQL/audit failure, review the advisory and dependency chain, not just the alert count. Keep fail-closed gates.
5. For stale verified SHA mismatch, a new merge superseded the previous release: use the newest exact master run.
6. Check `Deploy Application` **deploy** job and public OAuth metadata. A successful dispatch alone is not success.
7. Do not manually deploy a failing or unverified SHA, rewrite master history or create a one-shot bypass workflow.

### G. Multi-device metadata conflict

1. Preserve both local and remote versions, timestamps, pending markers and any available HF revision.
2. Check whether the change was progress, review/notes, collection membership, personal tags or a local-only preference.
3. Do not assume all data is cloud synchronised; personal tags/custom summaries and typography currently remain local.
4. Do not silently pick one copy to overwrite the other. Ordinary timestamp merging is **not** a conflict-proof CAS protocol.
5. Plan resolution under Issue #34 with a disposable dataset and two authenticated browser sessions; confirm rollback before production migration.

## 4. Security and irreversible action checklist

Before handling any destructive request:
- Are we changing only a local **download**, a personal metadata record, a named **collection**, one **whole novel**, or the **entire dataset**? These require different permissions.
- Do we have a complete, independently restorable backup?
- Is the caller authenticated as the owner, with the correct short-lived privileged grant?
- Does the API enforce immutable book ID, exact stored path and a current dataset revision?
- Does a human-readable confirmation identify the exact target without relying on hover, ambiguous button text or source publication status?
- Will the action leave unrelated novels, tags, notes, progress and nested collections intact?
- Did the owner explicitly authorise this particular high-risk production mutation?

If any answer is unknown, do not execute the destructive mutation.

## 5. Decision log and rationale

| Date/period | Decision | Reason |
| --- | --- | --- |
| 10 November 2026 | Cloudflare Pages + Functions instead of HF Spaces | Reliable public PWA shell, server-side OAuth and offline capability |
| 10–14 November 2026 | Private HF Dataset retained, readable-folder compatibility | Keep novel files private and IDs immutable while improving path legibility |
| 14 November 2026 | Sun logo and six preserved reader themes | Consistent owner-approved brand without changing stored theme IDs |
| 18–19 November 2026 | Separate Novel app from experimental Shared Core/Hub | Preserve independent production service and data ownership |
| 19 November 2026 | Standing permission for verified routine PR merges/deploys | Reduce repeated manual approval while retaining high-risk safeguards |
| 19–20 November 2026 | Slim publication ribbons with clearer labels | Separate story publishing from personal reading status |
| 20 November 2026 | Nested collection Add/Remove and newest-first toasts | Reversible operations, predictable feedback |
| 20 November 2026 | Alphabetical merged tags; remove crosses from details | Reduce accidental deletion and inconsistent visual treatment |
| 20 November 2026 | `TNL - Page Name` browser tab titles | Faster tab identification |
| 20 November 2026 | Reader actions top-right; in-iframe high-contrast rules | Fix actual header layout and improve chapter boundaries |
| 20 November 2026 | Random Home hero/real covers and latest-three reading desk | Keep Home lively but compact; preserve full reading shelf |

These are implementation/owner decisions, not mandates to change sibling repositories.

## 6. Known limitations and backlog

| Priority | Area | Current state / necessary follow-up |
| --- | --- | --- |
| High | [Issue #34: revision-safe sync](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/issues/34) | Open. Fresh current-master design plus disposable HF CAS and two authenticated OAuth browsers required |
| High | Production dataset backup verification | Always required before any storage migration/deletion; no general permission to mutate owner data |
| Medium | Local-only preferences/metadata | Personal tags, custom synopsis, reader settings and usage analytics do not have the same cross-device guarantees as synced reviews/progress |
| Medium | Legacy title-only links after rename | No universal old-slug alias registry; ID bookmarks are durable |
| Medium | Offline quota/cancellation | Bulk Save all offline does not provide comprehensive cancellation/quota management |
| Medium | Real mobile acceptance | Synthetic browser checks cannot replace a final appearance/offline check on the owner's actual devices |
| Low | Old handovers | Historical files retained for context; refer agents to canonical docs instead |

Treat backlog as a starting point. A later session must check open issues, the latest master SHA and current deployment before declaring any item still outstanding.

## 7. Windows-friendly owner guidance

Use normal Windows Node.js 22/npm and a local clone when hands-on checks are needed; WSL is not required for the React app. Do not demand the owner run tests that the connected GitHub Actions can already run. Ask them for real-device appearance or credentials-dependent acceptance only when the agent cannot verify it safely. Never request secrets in chat.

## 8. Closeout protocol for each session

A handover or PR summary should explicitly record:
- Exact repository, branch/head SHA, related issue and pending PR.
- Changes made, files affected and intentionally untouched components/data.
- Unit/browser/offline/security evidence and a link to the relevant workflow.
- Whether merged, whether deployed, and whether public endpoint is verified.
- Local-only versus cloud-persisted behaviour and any unresolved multi-device risk.
- User decision needed, only if there is an actual privileged action.

Avoid repeating a previous session's success claim without re-verifying the current source. No speculative status, no fictional background work and no release tag without authorisation.

**References:** [Agent playbook](AI_AGENT_PLAYBOOK.md), [UX behaviour contract](UX_BEHAVIOUR_CONTRACT.md), [architecture](ARCHITECTURE_AND_DATA_LIFECYCLE.md), [testing/release](TESTING_RELEASE_RUNBOOK.md), [access gateway](ACCESS_GATEWAY.md), [standalone hosting](STANDALONE_PWA.md).
