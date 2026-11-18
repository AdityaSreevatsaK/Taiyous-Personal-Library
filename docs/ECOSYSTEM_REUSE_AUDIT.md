# Reusability Assessment for Shared Core

**Do not copy entire components simply because they render a similar UI.** These suggestions were derived from actual `src` modules and user-facing behaviours; a fresh audit is required before extraction.

| Candidate | Potential | Conditions |
| --- | --- | --- |
| Typography/themes/CSS tokens | High | Semantic tokens, scoped to a consumer; don't inject global book-reader styles |
| Stateless card, icon button, badge, dialogue | High | Extract with accessible props, no auth/store/route imports |
| Search text normalisation, sort comparators | Medium/high | Pure functions only, no novel fields hardwired into generic API |
| Rating scale descriptions/visual tones | High | Preserve exact 1–10 meaning, ensure unrelated media can opt out |
| Personal tags list UI | Medium/high | Move presentation only; tag persistence and authorisation stay app-owned |
| Nested collection tree UI | Medium | Current `BookCollection` couples IDs and HF persistence; adapt to generic typed refs |
| Offline/PWA infrastructure | Medium | Concepts reusable; cache storage and integrity are media-format specific |
| Progress algorithms | Low | EPUB chapter scroll, manga page and watched episode set are not compatible |
| OAuth/owner mode | No direct copying | Requires deliberate separate app origin and security model |
| EPUB parsing, chapter virtualization, covers | Novel-only | Retain as Novel Library internal implementations |

## Extraction proposal template
1. List at least two independent consuming apps and exact user needs.
2. Name API, props, types, CSS token contract and accessibility behaviour.
3. Identify all transitive dependencies and existing novel coupling.
4. Add source/consumer unit tests, visual/mobile checks and performance budget.
5. Plan versioned private package distribution and rollback. `@taiyou/ui@0.0.0` is not published.
6. Make a small incremental change in Shared Core, then a consuming app PR, then optionally a Novel PR.
7. Never break current production UI or the reading progress/dataset format for an abstraction.

## No-go shortcuts
Git submodules, floating GitHub dependencies, global CSS copied from the novel app, browser-side credentials, a common mandatory backend, cross-origin OAuth token reuse or forced repointing of the novel private HF dataset.
