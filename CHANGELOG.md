# Changelog

## v1.0.4 — Private Space cloud connection compatibility

- Replaced OAuth redirects that require direct `.hf.space` access with a fine-grained private-dataset token prompt.
- The dataset token exists in memory only. No persistent browser token storage, backend or Space secret.
- Retained the private Space, private dataset, existing reader, local progress, novel ZIP/EPUB imports, and cloud catalogue.
- Uploads still require live verification on Hugging Face; this change removes the known private-Space login redirect blocker.

# Changelog

## v1.0.3 — Hugging Face OAuth redirect fix

- Removed the `window.open('', '_blank')` blank-popup sign-in approach, which can return `null` inside embedded Spaces even while a blank tab appears.
- In embedded mode, provide a real top-level link to the Space instead of attempting OAuth inside an iframe.
- In standalone mode, use a same-tab `oauthLoginUrl()` redirect, keeping the OAuth PKCE verifier and callback on the same origin.
- Keep all existing reading features, storage keys and cloud upload APIs unchanged.
- README updated for **free prebuilt Static Spaces** by removing the paid `app_build_command`.


## v1.0.2 — Scoped XML parser security remediation (candidate)

- Confirmed v1.0.1 passed 20 unit tests and built successfully on Windows.
- Added `overrides.epubjs.@xmldom/xmldom = 0.8.15` to avoid the reported vulnerabilities in older XML parsers, without forcing a breaking EPUB.js upgrade.
- The override requires fresh install, test, build, production audit, and real-browser EPUB reading smoke checks on Windows before publication.
- No application logic, browser storage keys, novel data, chapter navigation, or cloud integration code changed.


## v1.0.1 — Fix Vite/Vitest build configuration (candidate)

- Fixed the reported TypeScript TS2769 build error caused by `vite.config.ts` importing `defineConfig` from `vitest/config` while different Vite versions were present.
- The production build uses `defineConfig` from `vite`; Vitest has its own `vitest.config.ts`.
- No changes to library data, reader behaviour, cloud upload code or browser storage keys.
- **Pending validation:** Full `npm test`, `npm run build`, `npm audit` and live Hugging Face OAuth/upload checks on Windows.


## v1.0.0 — Private hosted novel catalogue (candidate)

- Introduced an optional private Hugging Face Dataset as the common `data/` folder.
- Added cloud repository configuration and OAuth PKCE sign-in on the library dashboard.
- Added persistent remote upload for ZIPs and their extracted EPUBs with an indexed `data/library.json` catalogue.
- Added catalog refresh and on-demand download of hosted EPUBs to local IndexedDB.
- Preserved all v0.7.0 reader features, local books, tags, appearance and progress.
- Prevented misleading hosted-book deletion; actual remote deletion is deferred.
- Added detailed instructions and privacy guidance.

**Status:** Source implementation is complete, but full build and live cloud testing remain pending.

## v0.7.0
- Dedicated searchable novel chapter list and direct chapter jumping.
- Previous reading-space, styling, metadata, genres, personal tags and empty-placeholder fixes retained.
