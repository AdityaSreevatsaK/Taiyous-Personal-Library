# Novel Catalogue, Personal Metadata and Migration Boundaries

## Existing canonical records
Current code uses 24-character lowercase hexadecimal novel IDs, separate metadata and EPUB/ZIP paths in a private Hugging Face dataset, and local IndexedDB cache. Most modern dataset paths use a readable folder form `data/novels/<id> - <sanitised-title>/...` while legacy ID-only paths remain supported. Read `src/lib/cloud.ts`, `src/lib/novel-paths.ts` and `docs/READABLE_NOVEL_FOLDERS.md` before changing path construction. Public URL slugs are not canonical record IDs.

## Source vs user-owned data
- **Source metadata:** novel title, author, chapter labels, imported synopsis and tags; preserve provenance and support missing descriptions.
- **Book assets:** EPUB, optional original ZIP and verified cover. Do not replace real cover with AI-generated imagery represented as genuine.
- **Personal metadata:** rating 1–10, comments/notes, custom synopsis/tags, collection memberships, trying-out/reading/finished statuses and history.
- **Reading cursor:** chapter URL/ID and scroll position plus durable completed state; never reinterpret as manga page or anime episode.
- **Sync:** current code contains a mixture of local preference stores, cached sidecars and private cloud documents; inspect actual implementation before promising cross-device consistency.

## Collections
`BookCollection` has stable ID, `name`, `bookIds: string[]`, optional `parentId`, `updatedAt`, optional `deleted` tombstone. `CollectionDocument.version` is 1 in current code and validation limits collection count, ID syntax and membership size. Parent-child containment is structural; a novel in a child does NOT automatically belong to its parent unless explicitly added. Never flatten nested collections in a migration.

## Shared cross-media identity
Shared Core proposes `{ kind, namespace, localId }` for external references. That is a **referencing adapter**, not a storage migration. If a Hub cross-media collection is ever approved, map a novel's immutable 24-character ID into a namespaced reference without changing cloud files or URLs. No mixing titles, aliases or external provider IDs as keys.

## Conflict and migration rules
Use schema versions, compare-and-swap/revision checks, tombstones, deterministic migrations, backup snapshots and a disposable dataset test. Reject unknown future document versions rather than dropping fields. Do not resolve two-device conflicts by last-writer-wins without explicit owner approval. The historical closed PR #57 is an unmerged proposal, not current production evidence.

## Deletion boundaries
Deleting a whole novel requires server-side Owner verification and exact confirmation. Deleting an offline EPUB cache copy is different and must not require Owner status. Deleting a collection must not delete member novels. Never perform hard deletes or dataset recreation as part of Shared Core extraction.

## Tests required before any contract change
Realistic old/modern path fixtures, duplicate title/ID, nested collection membership, tombstones, offline caches, malformed files, partial uploads, two authenticated browsers, revision-conflict detection, backup restore, and no loss of private assets. Verify both automatic and manual release gates.
