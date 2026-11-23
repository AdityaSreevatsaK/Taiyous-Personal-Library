# Architecture and Data Lifecycle

Last reconciled: 21 November 2026. Current code and tests are authoritative for schemas and behaviour.

## System topology

```text
Browser (desktop/mobile)
  ├─ Public Cloudflare Pages app shell
  │   ├─ React 18 + TypeScript + Vite
  │   ├─ EPUB.js reader and application UI
  │   ├─ IndexedDB: cached EPUBs, covers, local book data and pending state
  │   ├─ localStorage: device preferences and other local state (verify per key)
  │   └─ Service worker: app shell/offline navigation
  └─ Same-origin Cloudflare Pages Functions (/api/*)
      ├─ OAuth/session endpoints: Hugging Face OAuth, state and PKCE
      ├─ Library API: private dataset operations and personal state
      └─ Owner API: separately authorised privileged operations
             │
             ▼
       Private HF Dataset: AdityaSreevatsaK/Taiyous-Novels
         ├─ data/library.json (canonical novel catalogue)
         ├─ data/novels/<24-char-id> - <safe-title>/ (readable folders)
         ├─ legacy ID-only novel folders (still supported)
         └─ data/personal/
             ├─ progress/<id>.json and reviews/<id>.json
             ├─ collections.json
             └─ state.json (materialised bulk index)
```

The app shell is public; novel assets and personal documents are private. Frontend bundles must not contain HF tokens, OAuth secrets, session encryption keys or Owner credentials.

## Technology

Exact versions are in package.json and package-lock.json. Current stack includes React 18, TypeScript 5.9, Vite 6, EPUB.js, JSZip, idb, Hugging Face Hub client, Lucide icons, Vitest 5, Cloudflare Pages Functions and Wrangler in CI. CI uses Node.js 22 and Ubuntu runners. Check the lockfile before dependency changes.

## Code map

| Path | Responsibility |
| --- | --- |
| src/App.tsx | App orchestration, navigation, cloud/session state and actions |
| src/types.ts | Domain and reader preference types |
| src/components/ | Dashboard, Home, details, EPUB reader, Master Controls, dialogs |
| src/lib/ | Routing, catalogue/import, chapters, IndexedDB/offline, cloud, personal sync, collections, tags and status logic |
| functions/api/ | Same-origin server endpoints |
| functions/_lib/ | OAuth, session, catalogue and personal-state server logic |
| public/ | Static assets, PWA manifest/service-worker inputs, branding |
| scripts/ | Build helpers and browser/provider acceptance harnesses |
| tests/ and src/**/*.test.ts | Unit, gateway, migration and regression tests |
| .github/workflows/ | Verify, CodeQL, guarded deploy and disposable-provider workflows |

Inspect current imports/call sites before assuming a module still owns a behaviour.

## Data lifecycle

1. Catalogue metadata is read from private data/library.json; stable 24-character ID is identity.
2. Novel assets use readable folders where available. Legacy ID-only paths remain supported; never derive paths from title alone.
3. EPUBs/covers may be cached in browser IndexedDB. This differs from service-worker cache of the public app shell.
4. Pages Functions enforce authenticated access to private HF. OAuth token remains server-side in an encrypted Secure HttpOnly session.
5. Owner mode is separate privileged authorisation for sensitive whole-novel/collection operations.
6. Progress, reviews and collections use personal-state API. Device-local preferences and personal metadata have separate persistence rules; inspect current state layer before promising synchronisation.

## Personal state after PR #110

Merged to master on 21 November 2026 (d774b9121999c15d233b144e522fee5959305cd1):
- GET /api/library?action=personal-bulk returns a validated compact index of existing progress, reviews and collections in one request.
- First access enumerates legacy v1 sidecars at an immutable HF revision and non-destructively materialises data/personal/state.json using compare-and-set. Existing sidecars are not deleted at bootstrap. Later selective PATCH commits update the affected sidecar and the index together; they are not immutable historical backups. Keep an independently restorable backup for recovery.
- Selective PATCH updates a document and aggregate index with a revision-bound parent commit. Stale competing updates are rejected with conflict information for explicit resolution.
- Normal refresh avoids per-novel probes for absent records. Individual reads remain for deliberate reconciliation paths.
- Client wall-clock timestamps are not concurrency authority. A fresh checked remote revision takes priority over stale local timestamps while genuinely concurrent edits remain resolvable.

The isolated integration used a disposable private dataset and two authenticated browser contexts against shipping Pages Functions running locally over HTTPS. It covered offline edits, reconnect, competing revisions, explicit approval and recovery. It did not run interactive Hugging Face consent/PKCE redirect.

## Security and recovery

- Validate server inputs and dataset paths; reject malformed documents before writes.
- Pin provider reads to immutable revisions for migration/CAS.
- Enumerate every page before treating a tree listing as complete.
- Missing catalogue plus existing data files is a recovery condition, not an empty library.
- Never delete legacy sidecars during index materialisation.
- Never log tokens, session values, private text or personal data.
- Use dedicated disposable credentials and uniquely named test datasets. Never point destructive tests at production.
- For production data migration/deletion: secure an independent backup, obtain explicit owner approval and prove rollback before mutation.
