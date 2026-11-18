# Novel Library Architecture and Five-Repository Ecosystem

## Current production reality
This is a React/TypeScript/Vite novel catalogue and EPUB.js reader, with Cloudflare Pages frontend, Pages Functions for protected API/OAuth/owner controls, IndexedDB offline EPUB cache and private Hugging Face Dataset `AdityaSreevatsaK/Taiyous-Novels`. The repository's source is public and the app shell is public; the actual uploaded book files and selected personal documents are private.

```text
Browser (public Cloudflare Pages shell)
  ├─ Reader and catalogue React UI
  ├─ IndexedDB cached EPUBs/covers
  ├─ localStorage preferences and pending edits
  └─ same-origin /api/... Cloudflare Pages Functions
         ├─ OAuth (server cookie / authenticated fetch)
         ├─ Owner verification (sensitive operations)
         └─ Protected private dataset read/write
                  └─ Private Hugging Face Dataset
```
Do not copy this entire architecture into other media applications without separate requirements, licensing, storage and security analysis.

## Current Novel-owned components
- `src/App.tsx`: top-level route and reading/detail transitions.
- `LibraryDashboard.tsx`: shelf controls, search, collections, import, owner-facing actions.
- `Reader.tsx`: EPUB chapter reader and mobile/fullscreen navigation.
- `src/lib/cloud.ts`: private dataset API and catalogue handling.
- `src/lib/collections.ts`: nested collection memberships and optional cloud sync.
- `src/lib/reading-status.ts`, `ratings.ts`, `tags.ts`, `storage.ts`, `offline.ts`: media-specific status and local data.
- `functions/api`: authentication, owner and protected library API boundaries.
- `scripts/` and `.github/workflows/`: manual validated deployment and extensive browser/offline checks.

## New ecosystem topology
The owner chose five repositories:
1. Shared Core + optional Personal Hub, `Taiyous-Shared-Core`.
2. **This Novel Library**: remain independent, production-first.
3. Manga: future image/chapter reader.
4. Anime: future seasons/episodes tracker.
5. Movies & TV: future film/TV tracking in one app.

The Hub will link to known live app URLs, not host each app or own their private data. All media apps must continue to function if the hub or Shared Core repository is inaccessible. Shared packages are build-time only after versioned opt-in.

## Migration discipline
No mass 'move all common utilities' refactor. Begin with stateless UI tokens/components that have two genuine consumers, propose a minimal API, test a staged import in a NON-production consumer first, then consider Novel adoption on a short-lived PR. Preserve old behaviour and lockfile with easy rollback.

## Known technical debt
Some older docs and `PROJECT_HANDOVER.md` describe retired Hugging Face Spaces and former branch patterns; treat them as history. There are numerous single-purpose historical deployment workflows in `.github/workflows`; do not copy them into new repos or delete them without an audit. Closed, unmerged PR #57 proposed revision-aware personal sync; reassess its proposals rather than assuming they shipped.

## Decision boundary
The novel data contract, OAuth cookie scope, owner mode, chapter progress and local offline semantics are Novel Library-owned. Cross-media media identity and personal rating interfaces in Shared Core are experimental and MUST NOT override live novel schemas without an ADR and migration validation.
