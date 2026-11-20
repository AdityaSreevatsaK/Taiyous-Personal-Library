# GitHub Copilot instructions: Taiyou Novel Library

This is a **real production EPUB Novel Library**, not a demo or the Shared Core/Hub project. Before editing, read the repo-root [AGENTS.md](../AGENTS.md), the [AI agent playbook](../docs/AI_AGENT_PLAYBOOK.md), [UI contract](../docs/UX_BEHAVIOUR_CONTRACT.md), [architecture](../docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md) and [release guide](../docs/TESTING_RELEASE_RUNBOOK.md).

**Non-negotiable:** Immutable 24-character novel IDs; public Cloudflare shell and private HF Dataset; protect OAuth, Owner mode, real EPUBs/covers, progress, tags, nested collections, offline reading and personal data. Do not migrate or delete production dataset assets, expose credentials, disable CI/security checks, change auth/security policy, or create version tags without separately authorised consent.

**Current UX:** Eight ordered destinations; six themes; Sun mark; Home featured novel randomised per visit and last-three in-progress preview; browse-only alphabetically sorted tag chips, add on details and remove in Master Controls; explicit Add/Remove collection membership; subtle publication ribbons distinct from Finished; top-right reader actions; bottom chapter navigation and themed in-iframe full-width high-contrast chapter rules.

Work on a short-lived branch from current master, add targeted regression tests, open a PR, wait for Verify+CodeQL, merge routine approved changes, then verify the final guarded Cloudflare deployment. See root AGENTS for approval boundaries. Distinguish code committed, PR merged, release dispatched and production published.
