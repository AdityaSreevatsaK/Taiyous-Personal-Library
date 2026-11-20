# Claude Code / Other AI Agents: Start Here

This repository is **Taiyou's production Novel Library**. Its source is public, but the author's actual books and selected personal metadata are stored in a private Hugging Face Dataset. Do not treat it as a blank scaffold or a general-purpose manga/video app.

**Read these files in order before changing source:**
1. [AGENTS.md](AGENTS.md) for mandatory permissions and hard stops.
2. [AI Agent Playbook](docs/AI_AGENT_PLAYBOOK.md) for tasks, source ownership and workflows.
3. [UX Behaviour Contract](docs/UX_BEHAVIOUR_CONTRACT.md) for owner-approved layout/interaction decisions.
4. [Architecture and Data Lifecycle](docs/ARCHITECTURE_AND_DATA_LIFECYCLE.md) for storage and security boundaries.
5. [Testing and Release Runbook](docs/TESTING_RELEASE_RUNBOOK.md) for PRs, CI and verified Cloudflare deployment.
6. [Operations and Backlog](docs/OPERATIONS_DECISIONS_AND_BACKLOG.md) for incidents and outstanding sync work.

Always inspect current `master`, PRs and workflow status. Never use historical Hugging Face Spaces/dev deployment instructions as current policy. Never alter the private production Dataset for an ordinary UI or documentation task.

Routine, verified PR merges and guarded automatic deployment are owner-approved; deleting/migrating production data, changing auth/security policy, exposing private material and creating GitHub version tags are **not**. Verify actual deployment before reporting success.
