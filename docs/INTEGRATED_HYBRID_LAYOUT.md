# Integrated Grand Library + Literary Journal

Status: owner-approved design promoted through the guarded `release/full-width-blue-library-20261114` branch. Keep this document as the design and regression acceptance specification.

## Purpose

Combine the agreed **Grand Library** opening with the **Literary Journal** indexing style, and retain every working feature and security boundary of the existing Taiyou's Personal Library. This is distinct from the five earlier fictional `/layouts` concept screens, which continue to be preserved for comparison.

## Structural layout

1. **Grand Library opening:** a large cinematic deep-navy feature, real cover artwork arranged as overlapping books, current/resumable novel text, two genuine actions (read and details), and counts taken from the real private or offline catalogue.
2. **Continue reading rail:** a horizontally accessible card collection with real progress, current chapter and read/detail actions. It is hidden when no books are in progress.
3. **Literary Journal:** editorial masthead, alphabetically ordered top-ten index, reading-status column, actual tag links, and a notes-margin panel with reading statistics. The index links to existing book detail actions; the full catalogue link scrolls to the complete original functionality.
4. **Full-width top navigation:** no permanent sidebar. A compact brand bar contains global search, Cloudflare connection/settings and theme controls. A second slim horizontal navigation row exposes All Books, Trying Out, Reading, To Be Read, Finished and Offline, with compact dropdowns for every tag and collection, including collection creation. Existing collection rename/delete actions remain on the selected collection screen.
5. **Original full library and management:** every collection action, tag filter, sorting, searching, bulk offline download, Owner mode, Cloudflare OAuth, EPUB, ZIP, reading progress, rating and comment control remains in its existing component. The new editorial sections are additional navigational structure, **not replacement data stores**.
6. **Other shelves:** Trying Out, Reading, Unread, Finished and Offline continue to use their established focused views. The editorial opening displays only on the unfiltered All Books home, never over search, tags, collections or advanced search.

## Safety and behaviour

- Uses `LibraryBook[]` with immutable book IDs. No new external network endpoint, secret, data migration, token, album, or cover source.
- Actual covers continue to use `useCoverArt` and the private proxy. Missing cover artwork still falls back to the existing generated cover.
- Opens novels through original `onOpen` and `onRead` callbacks; retains new title-based URLs and compatible ID bookmarks from PR #7.
- No removal of current `BookDetails` / `Reader` views, offline deletion rules, or Owner protection.
- Default Sepia remains in the production reader. All editorial surfaces inherit the six production theme tokens (Sepia, Paper, Charcoal, Midnight, Ocean and Plum), except the deliberately navy Grand Library hero.
- Responsive: full-width desktop without sidebar; compact horizontal section navigation; single-column mobile hero, three overlapping covers with space for touch, horizontally scrollable progress cards, and journal index columns condensed for narrow screens. Keyboard focus remains visible and motion honours reduced-motion preferences.
- The owner approved promotion of the previewed layout on 14 November 2026. Do not create a v1.0 release or trigger unrelated storage migration.

## Release verification checklist

- [ ] Production build, TypeScript, unit tests and security audit pass.
- [ ] Desktop and phone browser smoke covers the real dynamic (synthetic test) EPUB, hero, editorial index, title links, six themes, navigation, collections and Trying Out.
- [ ] Offline cold launch, EPUB access, search, private OAuth and Owner-mode regression checks remain green.
- [ ] Deploy through the existing gated Cloudflare Pages workflow only after full CI success.
- [ ] Verify deployment reports success, and ask the owner to check the signed-in private catalogue and favourite novels on both devices.
- [ ] Preserve the immutable catalogue IDs, OAuth configuration, existing reading history and all 88 unmigrated folder paths.
- [ ] Do not tag v1.0 or initiate storage migration without further approval.

## Follow-on choices

The hero/index provides the selected combination without rewriting the sensitive book-storage and reader pages. After release, refine novel-details typography separately. The approved permanent sidebar removal must remain intact. Cross-device conflict safety remains draft PR #2 and must not be silently merged into this UI change.
