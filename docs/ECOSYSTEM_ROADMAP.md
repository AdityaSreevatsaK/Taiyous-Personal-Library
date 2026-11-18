# Novel Library Ecosystem Adoption Roadmap

## Phase 0: protect production (now)
- [x] Keep live Novel Library independent, on `master` with manually controlled Cloudflare deployments.
- [x] Keep private HF dataset separate from public app shell/source.
- [x] Add specialised agent instructions and ecosystem boundary documents.
- [ ] Reconcile historical README notes with live branch/PR state where stale.
- [ ] Verify baseline CI and private/offline reader behaviour on current master.
- [ ] Inventory unused deployment workflows; cleanup only in a separate approved PR.

## Phase 1: optional navigation
- [ ] Shared Core agent builds Hub; waits for verified HTTPS URL.
- [ ] Owner approves whether Novel Library needs a Back-to-Hub control.
- [ ] If approved, add a pure external link without sharing session tokens.
- [ ] Preserve offline navigation when hub is unavailable.

## Phase 2: low-risk component reuse
- [ ] Identify 1–2 stateless components with a second real consumer.
- [ ] RFC: API, accessibility, CSS isolation, package distribution, rollback.
- [ ] Test first in Manga/Anime/Hub; only then consider Novel adoption.
- [ ] Benchmark bundle, latency and mobile reading before acceptance.

## Phase 3: advanced ecosystem features (not committed)
- [ ] Consider cross-media search/collections only after auth, identity/provenance and consent ADRs.
- [ ] Do not replace existing novel cloud or per-app reading state.
- [ ] If SSO is truly desired, design explicit trusted identity provider; no cookie-copy shortcuts.

## Technical debt independent of ecosystem
- [ ] Reevaluate closed PR #57 proposal and authenticated two-device sync test coverage.
- [ ] Review dev-dependency advisories and update safely without weakening CI.
- [ ] Audit old one-shot workflows and stale historical handovers.
- [ ] Continue measured accessibility/performance improvements.

## Definition of done
Existing EPUB library remains usable, private data safe, imports and offline unaffected, any shared code fully reversible, and all new features have matching tests and documentation.
