# Contributing to Taiyou's Personal Library

The application shell is public. The owner's private Hugging Face novel dataset, OAuth credentials, EPUBs, reading notes and production configuration are **not** part of this repository.

## Local development

Use Node.js 22 and a clean dependency install:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

The browser smoke suite runs in CI with Chromium and synthetic EPUB fixtures. It must never use real private novels or production credentials. See `README.md`, `docs/ACCESS_GATEWAY.md` and `docs/STANDALONE_PWA.md` for architecture and deployment details.

## Pull requests

- Branch from `master`, keep changes focused and explain user-visible behaviour, failure cases and any data migrations.
- Add regression tests for bug fixes, particularly authentication, catalogue integrity, offline reading and sync conflicts.
- Preserve immutable book IDs, locally cached EPUBs, notes and reading progress. Do not deduplicate by title alone or silently delete old records.
- Run `npm test`, `npm run typecheck`, `npm run build` and the dependency audit before requesting review.
- CI success is not permission to publish. Production deployment is a separate manual workflow requiring the owner's approval.
- Destructive Hugging Face integration tests must use a **separate disposable private dataset and separate short-lived test credentials**. Never point tests at the production dataset.

## Security and privacy

Never commit or paste OAuth tokens, Cloudflare secrets, private EPUBs, user notes or production data. Keep OAuth access tokens in server-side encrypted HttpOnly sessions; do not add credentials to browser storage or frontend environment variables. Avoid logging novel contents and personal notes. Report suspected vulnerabilities privately to the repository maintainer rather than posting exploitable details in a public issue.

The security and release gates are documented in `docs/AUDIT_REMEDIATION_2026-11-15.md`.
