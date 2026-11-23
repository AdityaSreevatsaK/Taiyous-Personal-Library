# Project State Snapshot

**Verified:** 21 November 2026  
**Repository:** AdityaSreevatsaK/Taiyous-Personal-Library  
**Default/production branch:** master  
**Verified master SHA:** d774b9121999c15d233b144e522fee5959305cd1  
**Production URL:** https://taiyous-personal-library.pages.dev

This is a dated evidence snapshot, not live telemetry. Future agents must repeat the dynamic preflight in AGENTS.md before relying on it.

## Status classification

| Capability | State | Evidence / qualification |
| --- | --- | --- |
| Public React/TypeScript/Vite app shell on Cloudflare Pages | Implemented | Current repo config and deployment workflow |
| Private HF novel catalogue/assets | Implemented | Runtime architecture; private dataset contents were not inspected during this documentation pass |
| EPUB reader, catalogue, import and metadata | Implemented | Current source, package scripts and existing test suites |
| PWA/offline shell and IndexedDB EPUB caching | Implemented | Build/Verify browser smoke; physical-device quota varies |
| OAuth gateway and separate Owner authorisation | Implemented | Current Pages Functions and gateway tests |
| Bulk progress/review/collection retrieval | Implemented | PR #110 merged to master |
| Non-destructive bootstrap to data/personal/state.json (later PATCHes update the sidecar and index) | Implemented | PR #110 code and isolated disposable HF acceptance |
| Revision-safe selective PATCH and conflict handling | Implemented | PR #110 code and two-browser disposable acceptance |
| Two isolated authenticated browser sessions against real Pages Functions + disposable HF | Implemented/tested | Run 44924684751; temporary dataset deleted |
| Browser OAuth redirect/PKCE/callback/session with an isolated mock HF provider | Test proposed in follow-up branch | Local HTTPS Pages Functions and mocked provider are distinct from real HF consent; must pass a fresh Verify run before marked tested |
| Real Hugging Face hosted consent/PKCE token exchange E2E | Unverified | Requires the account owner's credentialed, non-destructive interactive acceptance; PR #110 deliberately excluded it |
| Physical mobile-device acceptance | Unverified | CI uses browser viewports, not owner's physical device |
| Independent production dataset backup/restore drill | Unverified in this evidence set | Required before destructive production data operations |
| Historical HF Spaces/staging deployment paths | Deprecated | Not current hosting/deployment instructions |
| Universal cross-device sync for every preference/tag/custom summary | Not established | Inspect current persistence paths; PR #110 scope is progress, reviews and collections |

## PR #110 release evidence

PR #110 merged 21 November 2026 at 16:43 UTC. Its merge SHA is the verified master SHA above. The recorded successful runs are:
- Verify/browser suite: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301096
- CodeQL: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44919301039
- Disposable private HF integration: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44921602074
- Two-browser Pages/HF acceptance: https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/44924684751

The two-browser test exercised real shipping Pages Functions locally over HTTPS, two separate encrypted HttpOnly sessions, a disposable private HF dataset, offline edits/reconnect, competing revisions, explicit conflict approval and second-browser recovery. It did not exercise interactive HF consent/PKCE. The test dataset was deleted.

## Current priority

Run and review the isolated mock-provider OAuth browser acceptance on a current PR Verify, then carry out a separate real-provider consent sign-in without sharing secrets. Also complete owner-device mobile/offline acceptance and document a restorable production dataset backup process before any destructive migration.

## How to keep this file current

For each substantial documentation or implementation change:
1. Fetch current master SHA and inspect working-tree changes.
2. Inspect current code/tests and recent merged PRs/issues.
3. Inspect exact current Verify, CodeQL and deployment workflow conclusions.
4. Update classifications only with current evidence; use Unknown/unverified where evidence is unavailable.
5. Update the verified date/SHA and link the evidence. Never treat this snapshot as a substitute for live checks.
