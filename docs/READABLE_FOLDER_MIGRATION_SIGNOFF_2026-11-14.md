# Readable-folder migration: reader compatibility sign-off

**Date:** 14 November 2026  
**Related storage controller:** [Taiyou-Novels-Storage-Controller](https://github.com/AdityaSreevatsaK/Taiyou-Novels-Storage-Controller).

The separate Storage Controller completed the production conversion from `data/novels/<id>/` to `data/novels/<id> - <sanitised-title>/`, preserving immutable IDs.

## Verified facts

- [One-book live production pilot](https://github.com/AdityaSreevatsaK/Taiyou-Novels-Storage-Controller/actions/runs/43486112141) succeeded; the owner confirmed that the migrated book worked in the deployed reader.
- [Final migration](https://github.com/AdityaSreevatsaK/Taiyou-Novels-Storage-Controller/actions/runs/43558185178) moved 88 further novels across 11 batches, with SHA-256 integrity checks, and preserved all 89 IDs and personal paths.
- [Independent private read-only verification](https://github.com/AdityaSreevatsaK/Taiyou-Novels-Storage-Controller/actions/runs/43559055257): 89 readable, 0 pending, 0 conflicts, 89 catalogue entries.
- Existing reader [Verify novel reader](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/43478067337) and [Deploy Application](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/43478082874) completed successfully before final migration.

## Contract for future reader changes

- Resolve EPUB, ZIP and cover URLs from validated, catalogue-provided file paths. Never assume `data/novels/<id>/` or rebuild the path from a display title.
- Both legacy and labelled folder formats remain valid; a title change need not rename the folder.
- Personal progress, ratings, comments, tags and collections remain associated with the stable book ID, not the folder name.
- Name-based browser routes are distinct from physical storage paths. No change to bookmarks, route slugs or personal-data IDs was part of this folder migration.
- Private files must remain behind existing Hugging Face OAuth/server gateway handling; never expose tokens or full private catalogue contents in public tests/logs.

## Outstanding live acceptance

The owner accepted the single-book pilot, but no fresh authenticated **multi-book** browser run was performed as part of this review. Recommended read-only spot checks: open and navigate several migrated books; verify covers, original ZIPs, offline EPUB cache and progress recovery. Avoid resetting IndexedDB or deleting downloaded books simply for testing.

No production reader redeployment, dataset write, v1.0 tag or release is required by this documentation change.
