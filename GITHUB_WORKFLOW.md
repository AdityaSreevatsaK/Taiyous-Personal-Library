# GitHub Workflow and Release Policy: Taiyou's Personal Library

**Current production process: 20 November 2026.** This document replaces the retired manual-only/HF Spaces release instructions. Read [`AGENTS.md`](AGENTS.md) and the [full testing and release runbook](docs/TESTING_RELEASE_RUNBOOK.md).

## Repository and production
- GitHub: `AdityaSreevatsaK/Taiyous-Personal-Library`, source **public**, canonical `master`.
- Cloudflare Pages: `https://taiyous-personal-library.pages.dev`, project `taiyous-personal-library`.
- Backend: protected same-origin Cloudflare Pages Functions.
- Novel files: private HF Dataset `AdityaSreevatsaK/Taiyous-Novels`; no EPUB/ZIP or owner tokens in Git.
- Former `dev` branch and Hugging Face Spaces staging are retired. The Hugging Face **Dataset** is not retired.

## Everyday development
1. Verify latest master SHA, open PRs and ongoing Actions.
2. Create a focused short-lived branch, inspect affected implementation and docs.
3. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build` (Node 22) where possible.
4. Add focused regression coverage. UI changes need desktop/mobile/browser and offline checks.
5. Open and review a PR including security, data and rollback implications.
6. After passing required **PR Verify novel reader** and **CodeQL** checks, merge routine approved changes to `master` without repeated owner confirmation, unless the owner explicitly pauses deployment.

## Automatic production release
1. A `master` push starts [Verify novel reader](.github/workflows/verify.yml) and [CodeQL](.github/workflows/codeql.yml).
2. [Auto deploy verified master](.github/workflows/auto-deploy-verified-master.yml) reacts only to a successful push Verify run for the **current** master SHA and requires matching successful CodeQL.
3. It dispatches [Deploy Application](.github/workflows/deploy-standalone.yml) with Publish enabled.
4. Deploy Application independently revalidates build, dependencies, package privacy and offline reading, compiles Functions, publishes to Cloudflare and verifies public OAuth JSON.
5. A green dispatch is NOT proof of a successful deployment. Check the final deployment job and public site.
6. A stale-commit refusal after a newer merge is an intended safety guard. Never bypass it to deploy an older SHA.

The existing workflow's GitHub environment name is **`standalone-staging`**, but its guarded deployment publishes **production**, not staging.

## Emergency/manual fallback
The existing [Deploy Application](.github/workflows/deploy-standalone.yml) can be manually dispatched on `master` with Publish enabled for controlled recovery. All independent validation gates still apply. No temporary one-shot deployment workflow or unverified build is permitted.

## Approval boundary
The owner's standing approval (19 November 2026) covers **routine, tested code/docs PRs and verified production deployments**. It does not authorise destructive HF Dataset actions, security/auth/Owner mode changes, exposing content, changing visibility, bypassing checks or creating GitHub version tags/releases. Ask separately for these.

## Environment and secrets
- Restricted GitHub environment deploy credentials: `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_PAGES_PROJECT`.
- Cloudflare production encrypted secrets include `HF_OAUTH_SESSION_KEY` and `TAIYOU_OWNER_PASSPHRASE`.
- Public OAuth metadata `/oauth-client.json` must remain publicly accessible as small JSON.
- Do not share or log secret values. The app shell is public but private book access remains authenticated.
- Real disposable HF sync testing is separate from standard CI and must never use the production dataset.

## Before declaring "done"
Provide PR link, merged SHA, master Verify and CodeQL results, final Deploy Application success or failure, any manual acceptance remaining, and whether live private OAuth/data were actually tested.

For full procedures, see [AI agent playbook](docs/AI_AGENT_PLAYBOOK.md), [testing/release](docs/TESTING_RELEASE_RUNBOOK.md), [operations](docs/OPERATIONS_DECISIONS_AND_BACKLOG.md) and [Standalone PWA](docs/STANDALONE_PWA.md).
