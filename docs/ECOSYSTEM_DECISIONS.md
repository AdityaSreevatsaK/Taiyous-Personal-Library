# Novel Library Ecosystem Architecture Decisions

**ADR-E01: Keep existing Novels independent.** Accepted. Working EPUB app, schema, auth and private HF dataset remain in this repo. No monorepo migration.

**ADR-E02: Parent Hub is navigation-only.** Accepted initial design. It can link to the Novel app; it does not proxy the dataset or dictate login or reader state.

**ADR-E03: Separate media progress.** Accepted. EPUB chapter/scroll and completion cannot be replaced with manga page, anime episode or film watched status without loss of meaning.

**ADR-E04: Shared code adoption requires demonstrated reuse.** Accepted. No import of unpublished Shared Core 0.0.0 packages and no broad extraction before two real consumers.

**ADR-E05: Never weaken OAuth or Owner mode.** Accepted. No cross-origin cookie reuse, frontend token exposure or client-only delete authorisation.

**ADR-E06: Preserve production release gate.** Accepted. Novel `master` and manual Cloudflare deployment remain independent of scaffold apps. No automatic tag.

## Open for explicit owner decision
Should source Novel repo visibility change from public to private? Current source is public and private novel data is separately protected. Decide independently; do not change from docs-only work.
When a verified Hub URL exists, should a Back-to-Hub link appear in details/home/reader?
Which two components genuinely justify extraction to versioned Shared Core?
Is central SSO worth the additional security/operational complexity?

## Proposal template
For each new decision write context, options, threat model, affected actual files, data migrations, test plan, rollback, consumer impact and owner approval in an ADR. Do not silently reinterpret previous accepted boundaries.
