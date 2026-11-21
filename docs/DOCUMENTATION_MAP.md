# Documentation Map and AI-Agent Reading Order

> Reviewed against `master` on 21 November 2026. This is a **public repository**. Documentation must contain architecture, contracts and sanitised examples only, never private EPUB contents, access keys or personal notes.

## Read these in order for any coding session

| Order | Source | What it governs |
| --- | --- | --- |
| 1 | [`AGENTS.md`](../AGENTS.md) | Non-negotiable safety/approval boundaries, permitted routine merges, privacy and release policy |
| 2 | [Product vision, brainstorming and evolution](PRODUCT_VISION_AND_EVOLUTION.md) | Why the library exists; owner priorities, alternatives rejected, past incidents and lessons |
| 3 | [Current implementation state and roadmap](IMPLEMENTATION_STATUS_AND_ROADMAP.md) | Dated production vs draft ledger, Issue #34, sync blockers and prioritised next work |
| 4 | [AI Agent Playbook](AI_AGENT_PLAYBOOK.md) | Task workflow, module ownership and practical engineering rules |
| 5 | [UI/UX Behaviour Contract](UX_BEHAVIOUR_CONTRACT.md) | Six navigation destinations, theme/reader/covers/collections/rating/interaction invariants |
| 6 | [Architecture and Data Lifecycle](ARCHITECTURE_AND_DATA_LIFECYCLE.md) | Trust boundaries, file schema, data flows, identity and offline/cloud lifecycle |
| 7 | [Testing and Release Runbook](TESTING_RELEASE_RUNBOOK.md) | Required unit/browser/security/offline evidence and guarded Cloudflare deployment |
| 8 | [Operations, Decisions and Backlog](OPERATIONS_DECISIONS_AND_BACKLOG.md) | Incident response, rollbacks, owner decisions and risk ledger |
| 9 | [Session Handover Prompt](SESSION_HANDOVER_PROMPT.md) | Short working brief for another assistant; never substitutes for live SHA/CI inspection |

**Trust precedence:** actual `master` and deployed runtime > verified current workflow evidence > agent/UX/architecture contract > dated audit > older brainstorming, handovers or unmerged PRs. If a contract and current implementation disagree, document the discrepancy and resolve deliberately, not by silently rewriting history.

## Topic-specific operational and technical references

| Domain | Current guide |
| --- | --- |
| OAuth, public client metadata, protected Owner mode | [Access Gateway](ACCESS_GATEWAY.md) |
| PWA, offline shell and Cloudflare hosting | [Standalone PWA](STANDALONE_PWA.md) |
| Feature inventory and offline edge cases | [Capabilities](CAPABILITIES.md) (some historical sections need comparison with current UX contract) |
| Stable novel IDs, human-readable vs historical folder paths | [Readable Novel Folders](READABLE_NOVEL_FOLDERS.md), [Migration Sign-off](READABLE_FOLDER_MIGRATION_SIGNOFF_2026-11-14.md), [Reader Acceptance](READABLE_FOLDER_READER_ACCEPTANCE.md) |
| Local usage analytics and logo choices | [Analytics and Branding](LOCAL_USAGE_ANALYTICS_AND_BRANDING.md) |
| Repository/About settings vs source config | [Repository Settings](REPOSITORY_SETTINGS.md) |
| Shared Core, Hub, other media boundaries | [Ecosystem Architecture](ECOSYSTEM_ARCHITECTURE.md), [Data Contracts](ECOSYSTEM_DATA_CONTRACTS.md), [Decisions](ECOSYSTEM_DECISIONS.md), [Roadmap](ECOSYSTEM_ROADMAP.md), [Security](ECOSYSTEM_SECURITY.md), [Operations](ECOSYSTEM_OPERATIONS.md), [Testing](ECOSYSTEM_TESTING.md), [Integration](ECOSYSTEM_INTEGRATION.md) |
| Security/performance audit evidence | [20 November Repository Audit](COMPREHENSIVE_REPOSITORY_AUDIT_2026-11-20.md), [Readiness Audit](READINESS_AUDIT_2026-11.md) |
| GitHub release policy | [Root Workflow Guide](../GITHUB_WORKFLOW.md), [Release Runbook](TESTING_RELEASE_RUNBOOK.md) |
| AI assistant entry points | [`CLAUDE.md`](../CLAUDE.md), [Copilot instructions](../.github/copilot-instructions.md), [Contributing](../CONTRIBUTING.md) |
| Historical change log | [`CHANGELOG.md`](../CHANGELOG.md); recorded package versions are not approval for a GitHub Release |

## Historical evidence, not active instructions

- [`PROJECT_HANDOVER.md`](../PROJECT_HANDOVER.md), [`STAGING.md`](../STAGING.md) and historical portions of [`GITHUB_WORKFLOW.md`](../GITHUB_WORKFLOW.md) may describe retired HF Spaces and the old `dev` process. The maintained `GITHUB_WORKFLOW.md` and current CI YAML are authoritative for release today.
- [Older 17–18 November audits](AUDIT_VALIDATION_2026-11-17.md), [validation](VALIDATION_STATUS_2026-11-18.md), [historical layout](INTEGRATED_HYBRID_LAYOUT.md) and [artwork notes](NOVEL_DETAIL_ARTWORK.md) explain decisions and past findings; they do not override later fixed behaviour.
- Closed [sync PR #57](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/57) is unmerged. Open draft [PR #106](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/106) is superseded by draft [PR #110](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/110) for bulk and revision-safe personal state. Neither is live.
- A passing **disposable HF integration workflow** tests a temporary dataset, not production OAuth sync. The production **master SHA and actual final deploy job** determine what was shipped.

## How to keep this knowledge base accurate

1. First check open PRs/branches, latest master SHA and exact successful Verify, CodeQL and Deploy Application outcomes; reproduce the issue using current sources, not memory.
2. For user-visible changes update the UX contract. For file path, persistence, API or security changes update architecture, acceptance runbook and operation rollback notes.
3. For user-approved design shifts record the **old alternative, choice and why** in the vision/decision history. For completed roadmap work mark it deployed only after deployment evidence, with links.
4. For recurring incidents document root cause, exact triggering behaviour, how it was reproduced, fix PR and a regression test.
5. Keep all instructions consistent across `AGENTS.md`, `CLAUDE.md`, Copilot, README and the handover. No obsolete eight-tab descriptions, app-name variants or “manual deploy only” language.
6. Never place private sample book text, secret values or actual user reading/review data in tests or docs. Use fabricated fixtures and an isolated disposable private dataset for destructive/migration tests.
7. Documentation-only PRs are still subject to the normal branch → PR → checks → merge → verified automatic deployment policy, unless the owner explicitly says otherwise.

For current work, start from [Implementation State and Roadmap](IMPLEMENTATION_STATUS_AND_ROADMAP.md). Its dated status must be refreshed before any future agent declares something merged, deployed or manually accepted.
