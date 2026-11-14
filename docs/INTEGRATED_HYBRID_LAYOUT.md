# Integrated Grand Library + Literary Journal

Status: functional integration on `design/integrated-grand-journal-20261114`. **Not in production until separately approved.**

## Purpose

Combine the agreed **Grand Library** opening with the **Literary Journal** indexing style, and retain every working feature and security boundary of the existing Taiyou's Personal Library. This is distinct from the five earlier fictional `/layouts` concept screens, which continue to be preserved for comparison.

## Structural layout

1. **Grand Library opening:** a large cinematic dark-green feature, real cover artwork arranged as overlapping books, current/resumable novel text, two genuine actions (read and details), and counts taken from the real private or offline catalogue.
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
- Default Sepia remains in the production reader. All editorial surfaces inherit existing light/sepia/dark CSS tokens except the intentionally dark grand feature.
- Responsive: full-width desktop without sidebar; compact horizontal section navigation; single-column mobile hero, three overlapping covers with space for touch, horizontally scrollable progress cards, and journal index columns condensed for narrow screens. Keyboard focus remains visible and motion honours reduced-motion preferences.
- No v1.0.0 tag, master merge or production deployment without explicit owner acceptance of design.

## Acceptance checklist

- [ ] CI TypeScript, all unit tests, production bundle and security audit pass.
- [ ] Chromium smoke on desktop and phone checks actual local synthetic EPUB, the editorial opening, cover-to-details navigation and direct title URL.
- [ ] Existing offline cold launch, search, tags, collections, novel management and Owner mode browser smoke remains green.
- [ ] Visual review at desktop and phone sizes, including long titles and real artwork.
- [ ] Owner tests live OAuth, book opens, EPUB/ZIP downloads, navigation and all controls in a gated preview before production merge.
- [ ] Independently verify source dataset remains unchanged.

## Follow-on choices

The hero/index provides the selected combination without rewriting the sensitive book-storage and reader pages. Once accepted, refine the novel details' editorial typography and any requested sidebar treatment in a separate reviewable change. Cross-device conflict safety remains draft PR #2 and must not be silently merged into this UI change.
