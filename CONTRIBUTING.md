# Contributing and AI Agent Collaboration

## Project scope
This repository owns the production Novel Library application, its private-data gateway, CI/deployment integration, tests and documentation. Refer to `AGENTS.md` and all `docs/*.md` before editing. Other Taiyou repositories have independent owners and release processes.

## Canonical working documentation

Future AI agents must read the [end-to-end playbook](docs/AI_AGENT_PLAYBOOK.md), [UX contract](docs/UX_BEHAVIOUR_CONTRACT.md), [architecture and data](docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md), [testing/release](docs/TESTING_RELEASE_RUNBOOK.md) and [operations/backlog](docs/OPERATIONS_DECISIONS_AND_BACKLOG.md). The current code and exact CI SHA take precedence over historical notes; update relevant docs when behaviour changes.

## Starting a task
1. Inspect latest `master`, branches, open PRs and CI; identify whether a previous session is already modifying these files.
2. Read `README.md`, `AGENTS.md`, architecture, data contracts, security, roadmap and the dedicated session handover.
3. Reproduce the real issue, write precise acceptance criteria, estimate data/privacy/performance effects and identify affected users.
4. Create a short-lived branch from latest master. Keep the diff focused.
5. Implement with unit tests and appropriate browser/integration evidence; update docs as source contracts evolve.
6. Open a PR explaining problem, approach, tests, compatibility, security impact and rollback. Never claim unrun tests passed.
7. **Standing owner approval (19 November 2026):** merge routine PRs into `master` without another permission request once review and required checks pass, unless the owner instructs otherwise. Following a verified merge, Cloudflare deployment is automatic via `auto-deploy-verified-master.yml`, gated on successful `master` Verify, matching CodeQL and full deploy validation. Follow the actual deployment until success and report merge SHA and deployment separately. Destructive dataset changes, authorisation/security changes, private-data publication and release tags still require separate explicit approval.

## Local validation
Node 22+, run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`; preserve existing offline/PWA and Cloudflare security tests.

## Security and data
No private media, real personal records, credentials, OAuth tokens or owner passphrases in Git, log files, PR descriptions, screenshots or client-exposed environment variables. Don't bypass access restrictions. Destructive data operations require explicit owner approval and verified backup/revision protection.

## User experience
Mobile-first responsive layouts; correct keyboard focus, screen reader labels, legible contrast, meaningful empty/offline/error states and no fake functional controls. Preserve existing working application semantics. Benchmark potential bundle/network regressions.

## Cross-repo changes
Propose interfaces to the owning repo instead of editing sibling repos. Shared Core packages are currently experimental and not published. Keep all applications usable if the Personal Hub is offline.

## Reporting
Always distinguish scaffold from implemented product, unverified from tested, committed from merged, merged from deployed, and manual settings from programmatically applied settings. Include exact PR/workflow links and unaddressed issues.
