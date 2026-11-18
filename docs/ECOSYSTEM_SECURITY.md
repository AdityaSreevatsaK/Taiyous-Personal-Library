# Novel Library Security Boundaries in a Multi-App Ecosystem

## Public vs private
The Novel Library source repository and Cloudflare app shell are currently PUBLIC. The uploaded HF dataset `AdityaSreevatsaK/Taiyous-Novels` is PRIVATE. Four new repo scaffolds are PRIVATE. Source privacy alone is not a data access control, and private source does not imply a private deployed site.

## Protected data
Private novels (EPUB/ZIP), verified covers, personal progress/reviews/collections, HF OAuth sessions, Owner mode, local offline copies and cached metadata. Do not place any of these in Shared Core or parent Hub. Never embed private tokens or signed URLs in a static build or `VITE_*` variable.

## Authentication
Cloudflare Pages Functions implement same-origin OAuth/session and owner verification. Their Secure HttpOnly cookies do not work across different `pages.dev` app origins simply because both sites belong to the same person. No common SSO currently exists. Do not broad-scope cookies, weaken CSRF or expose session tokens to browsers for convenience.

## Owner/destructive operations
Server-verify owner rights for full-novel deletion. Require exact-title confirmation, validate cloud ownership, preserve a revision-safe backup and never delete the whole dataset. Offline-copy deletion remains separate from source deletion. Collection removal must not cascade to novels.

## Imports and external media
Reject dangerous EPUB/ZIP contents, path traversal, decompression bombs and malicious HTML/JS, and avoid public arbitrary fetch/proxy endpoints. Only user-authorised content; no paywall bypass or protected-site scraping. Covers must be genuine source media when represented as such.

## Operational risk
Existing `verify.yml` and manually triggered `deploy-standalone.yml` check build, offline behaviour, CSP and production privacy. Preserve these checks. Development-dependency advisories are separately tracked; do not disable safeguards to hide issues.

## Incident response
Stop writes, isolate the affected deployment, revoke/rotate secrets, inspect public build artifacts and git history, restore private data from verified backup, notify owner of exact scope and document postmortem. Do not force-rewrite production history without consent.

## Future cross-media service
An aggregator would need independent authorisation, least-privilege scopes, consent, audit trail, encrypted transport and minimal previews; do not assume access to the Novel HF dataset gives permission to copy it to Manga/Anime/Movies storage.
