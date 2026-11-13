# Compatibility with readable novel directories

## Storage Controller contract

The Library App now accepts the following two private Hugging Face dataset layouts **without changing the novel ID**:

```text
data/library.json
data/novels/aaaaaaaaaaaaaaaaaaaaaaaa/source.epub
data/novels/aaaaaaaaaaaaaaaaaaaaaaaa/original.zip
data/novels/bbbbbbbbbbbbbbbbbbbbbbbb - Martial World/source.epub
data/novels/bbbbbbbbbbbbbbbbbbbbbbbb - Martial World/original.zip
data/novels/bbbbbbbbbbbbbbbbbbbbbbbb - Martial World/cover.webp
```

The Storage Controller's authoritative implementation is `taiyou_storage/paths.py` on its `feature/readable-hf-folder-compatibility` branch. Its `readable_label` sanitiser permits Unicode letters/numbers, spaces and a small punctuation allowlist (maximum 96 code points). The Library App's `src/lib/novel-paths.ts` mirrors this validation, with an ID of **exactly 24 lowercase hexadecimal characters**. New folder names are labels only. The label is not recalculated if the book's title later changes.

### Compatibility matrix

| Operation | Legacy ID-only directory | Readable ID - Novel Name directory |
| --- | --- | --- |
| Catalogue validation | Supported | Supported, including mixed catalogues |
| EPUB download / online availability | Supported | Supported using the declared path |
| Original ZIP download | Supported | Supported using the declared path |
| Attach first original ZIP via OAuth | Supported | Supported in the existing book's **actual** folder |
| Cover fetching/caching | JPEG, PNG, WebP | JPEG, PNG, WebP (including `.jpeg`) |
| Metadata-only coverPath | Supported | Supported |
| Owner-protected whole-novel deletion | Deletes exact validated folder | Deletes exact validated folder |
| Personal notes, progress, collections | ID-keyed, unchanged | ID-keyed, unchanged |
| New in-browser imports | Continue to use legacy directory | Existing readable books are recognised; new readable imports remain an explicitly gated rollout |

**No ID change or database migration is required in the browser.** Local EPUB caches, reviews, progress and collections remain keyed by immutable ID.

## Security and data safety

- Never use the novel title to determine an *existing* path. Read the exact `epubPath` from `data/library.json` and derive its validated directory.
- EPUB, ZIP, cover and metadata cover paths must share the same validated directory; reject attempts to cross into another ID or directory.
- Reject traversal, path separators, encoded slashes, hidden segments, unexpected filenames and SVGs.
- The authenticated Cloudflare gateway percent-encodes **each** folder component when requesting HF files.
- Covers are restricted to JPEG/PNG/WebP with matching magic bytes; SVG/HTML payloads and files larger than 8 MiB are not rendered.
- Normal catalogue upload stays **add-only**; adding the first original ZIP cannot rewrite an EPUB or another book. New book imports check the claimed folder and the legacy directory for orphans.
- Deletion requires the existing Owner grant and an immutable-revision read of the complete validated catalogue. It deletes only the target's exact validated folder and ID-specific notes/progress, atomically.
- The Library App **does not** rename, move or migrate production files.

## Verification

`npm test`, `npm run typecheck`, `npm run build`, Cloudflare Pages Function compilation, desktop/mobile/offline browser smoke and dependency audit run in the existing GitHub Actions workflow.

New regression suites:
- `tests/readable-folder-paths.test.ts`: legacy/new/Unicode names, controller-compatible labels, title changes, mixed catalogues, cross-folder rejection, safe ZIP planning.
- `tests/readable-folder-cloud.test.ts`: cloud catalogue, user progress, EPUB/ZIP fetches, cover signature verification, OAuth ZIP attachment to readable folder, legacy default for new imports.
- `tests/readable-folder-gateway.test.ts`: URL encoding in authenticated file/HEAD requests and Owner-mode exact-folder deletion.

These tests use **synthetic entries and mocked private HF responses**. They do not prove a real authenticated end-to-end test. The existing `HF_DISPOSABLE_TEST_TOKEN` gate remains required for real-Hub verification.

## Deployment and migration sequence

1. Merge/deploy the reader compatibility fix **after CI and review**. Confirm the normal production app still opens legacy books.
2. Test the paired Storage Controller branch against a **disposable private test dataset**. Verify an atomic copy/delete/catalogue rewrite, real EPUB fetches, covers (all formats), archives, offline downloads, cross-device progress and owner deletion.
3. Obtain and verify a complete production catalogue and file backup. Run the Controller's read-only migration plan and inspect conflicts.
4. Enable and perform the **separately authorised production migration**, one revision-bound atomic novel move at a time. Never do this from the Library App.
5. After migration, check both old and new folders, progress, collections and cover URLs. Do not remove legacy compatibility after migration.

**Status:** Library compatibility code lives in a separate draft PR. No production data writes or migration were performed by this change. Keep the hybrid UI design PR separate and reconcile both changes before any design merge.
