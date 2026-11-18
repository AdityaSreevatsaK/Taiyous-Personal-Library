# Integration Contract for Novels with Personal Hub

## Today
**The Novel Library does not depend on Shared Core or Personal Hub.** Its existing live URL is https://taiyous-personal-library.pages.dev. Shared Core's hub may link to this URL as a verified navigation destination; it may not read novel catalogue data, progress, ratings, notes or cookies merely by linking.

## Permitted immediate integration
- Hub tile labelled 'Novels' with verified URL, accessible link and no token-bearing parameters.
- Optional later 'Back to Hub' link in Novel UI only after a real hub HTTPS URL exists, owner approves the UX and it is tested in reading/fullscreen/offline scenarios.
- Documentation and cross-team architecture proposals.

## Prohibited integration without an ADR
- Copying or expanding Novel Library's same-origin Cloudflare OAuth cookies across other `pages.dev` hosts.
- Exporting the private HF catalogue or raw EPUBs to Shared Core.
- Runtime calls from Novel Library to Hub to determine auth, routing, progress or UI availability.
- Requiring Shared Core to be online for offline reading.
- Rewriting novel IDs or replacing existing collection and progress schema with generic media records.
- Direct imports from unpublished Shared Core workspaces via relative paths or floating Git branches.

## Future opt-in API
If cross-media collections/search becomes a real request, develop an explicit server-side permissioned interface returning minimal approved metadata. Include a namespaced identity map, versioned schema, consent, auth/CSRF, privacy redaction, rate limits, cache lifecycle and remote outage fallback. This must not expose private EPUB text or raw personal notes without explicit user intent.

## Compatibility verification
Any optional Shared Core package adoption needs pinned release, lockfile, API review, bundle-size measurement, React/CSS isolation, keyboard/mobile/reader regression checks and rollback. Test EPUB renderer, chapter deep links, cover authenticity, nested collections, owner deletion, offline cold launch, two-browser cloud conflicts and production CSP before merge.

## Team protocol
The Novel session reports candidate reusable pieces to the Shared Core owner; Shared Core creates experimental exports and tests; other media apps opt in independently; Novel imports only after successful non-production consumer validation and owner acceptance.
