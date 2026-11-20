# UI/UX Behaviour Contract: Taiyou Novel Library

**Owner-approved behaviour, consolidated 20 November 2026.** This contract is for the existing Novel Library and future AI maintainers. When a new request supersedes a design decision, update this contract in the same PR as the UI change. See [AGENTS.md](../AGENTS.md) and the [agent playbook](AI_AGENT_PLAYBOOK.md).

## 1. Visual direction

The product is a **personal literary library and reader**, not a generic dashboard, manga viewer, storefront or admin panel. Keep a calm editorial feel, refined serif book headings, tight yet readable controls, consistent spacing, thoughtful use of cover artwork and legible themed text. Avoid heavy, oversized panels, browser-style alerts, excessive decoration, random new UI languages or controls that look disabled when they are active.

Use shared theme tokens and existing component patterns rather than one-off colours. Never solve a usability problem with a colour change alone if the actual layout, label, semantics or navigation is wrong.

### Brand

- App identity: **Taiyou's Personal Library**; browser tabs use short `TNL - Page Name` labels.
- Approved Sun mark variants are in `public/branding/`. `BrandMark.tsx` selects light/dark artwork according to theme. Do not substitute a new feather, book icon, emoji or invented logo.
- Approved brand assets include `sun-dark.webp`, `sun-light.webp`, transparent favicons, transparent PWA icons and the SVG compatibility mark.
- Wordmark/logo should navigate to Home. Relevant navigational links and brand mark must allow normal browser open-in-new-tab behaviour.
- Do not repeat the full visible novel title as an unnecessary hover tooltip; show title assistance only where clipping hides information.
- Use British English for new UI text where applicable. Avoid gratuitous wording, repeated explanatory copy and huge labels.
- UI must work on desktop and mobile, including portrait narrow screens, at standard and enlarged text sizes.

## 2. Navigation and eight primary destinations

**Logical order (do not reorder casually):**

| Order | Destination | Canonical route | Meaning |
| --- | --- | --- | --- |
| 1 | Home | `/` | Curated editorial landing page |
| 2 | Currently reading | `/currently-reading` | Every active in-progress novel |
| 3 | Trying out | `/trying-out` | Explicit trial/consideration shelf |
| 4 | Available offline | `/offline` | EPUBs downloaded on this device |
| 5 | Finished | `/finished` | Personally finished or eligible reading-completed novels |
| 6 | To be read | `/to-be-read` | Unstarted books |
| 7 | All books | `/library` | Complete novel catalogue |
| 8 | Analytics | `/analytics` | Device-local usage statistics |

Collections, Tags, Authors, Advanced Search and Master Controls are additional routes/actions, not replacements for those eight logical destinations. The seventh tab is **All books** in the novel implementation; do not blindly rename it to Manga, Series or All Media.

The top-level navigation must be comprehensible without opening multiple menus. Use the available space efficiently for links to Home, Currently Reading, collections and search. Preserve accessible names, visible focus, hover contrast and native links for open-in-new-tab. The reader's compact Library navigation offers useful routes without forcing a return to an unrelated page.

**Browser tab naming:**
- `TNL - Home Page`
- `TNL - Taiyou Novel Library` for `/library`
- `TNL - Tales of Demons and Gods` for a novel or its chapter reader
- `TNL - Currently Reading`, `TNL - Collections` or the actual named collection, `TNL - Analytics`, etc.
- Update document title on in-app navigation, Back/Forward and renamed metadata. Code: `src/lib/page-titles.ts` and `src/App.tsx`.

## 3. Homepage, featured books and reading desk

Source: `src/components/EditorialHome.tsx`, `src/lib/home-curation.ts`.

- Keep the editorial "Where worlds unfold" hero, genuine novel art, a featured novel summary and obvious read/explore actions.
- The featured novel is **randomised from the real current catalogue on each Home visit**, not permanently pinned to the last read book. Its selection stays stable through normal rerenders and refreshes on a new visit.
- The three tilted/floating cover images are also varied using real available cover art. Prefer distinct novels and avoid repeating the featured book where possible; never create misleading stock/fake covers. Gracefully hide absent or undecodable images.
- Buttons reflect status: `Begin reading` for unread, `Continue reading` when appropriate, `Read again` for personally finished. Publication-complete must not be mistaken for personally finished.
- "Continue your journey" on Home is a **preview of at most the three most recently active in-progress novels**, sorted by the later of last-opened/progress-updated timestamps. It is not an unlimited list. This was specifically requested after the five-row screen became too long.
- Provide a clear **View all N in progress** link or button, taking the user to the complete Currently Reading shelf, where all matching novels remain available. Do not truncate the underlying shelf or alter personal progress to limit Home.
- Keep curated shelves and journal sections meaningful, using existing real collection/tag information and distinct previews. Limit the editorial featured shelf cards to the current intended count, not an ever-growing catalogue.
- A new visit may vary covers and shelf previews, but randomisation must not shift items while the user interacts with controls or change persisted reading order/data.
- Avoid excessive introductory text, misleading "0%" progress semantics, and oversized hover overlays on finished/ongoing books.

## 4. Library tiles, covers, sorting and ribbons

- Real covers from the private catalogue take priority. Maintain offline cover caching, missing-image fallbacks, and coherent tile proportions.
- Search, scoped filters and shelf navigation should work with published and personal metadata. Preserve title and authors and useful visible progress.
- Tags and collections are distinct concepts; a novel may have multiple tags and multiple collection memberships.
- Keep sorting understandable; alphabetical lists must use case-insensitive natural order where requested. Source metadata itself must not be reordered just to render sorted chips.
- The **slim diagonal cover ribbon** represents **publication status only**, NOT personal reading progress.
- Approved visible ribbon labels:
  
  | Stored publication value | Ribbon | Intended colour |
  | --- | --- | --- |
  | Completed | **Story Complete** | Soft sage |
  | Ongoing | **Updating** | Muted sky blue |
  | Hiatus | **On Hiatus** | Warm amber |
  | Dropped | **Dropped** | Dusty rose |

- Keep ribbons quiet, slim, legible, slightly muted and complementary to the artwork. Do not make "Story Complete" suggest the owner has personally finished the book. A separate Finished shelf and progress indicators carry that meaning.
- Source sites can mislabel a publication. Master Controls allows an Owner-authorised correction without modifying personal reading progress or EPUB content.
- Personal 1–10 ratings have meaningful intensity/brightness, especially 10/10, without making the interface gaudy. Preserve consistent colours and numeric semantics.
- Search and tiles must retain correct click targets, focus and responsive alignment. Hover states should not obscure controls or convey an incorrect disabled state.

## 5. Novel details layout and behaviour

Source: `src/components/BookDetails.tsx` and `src/components/details-palettes.css`.

Maintain the established detail hierarchy:
1. Back/brand navigation and compact theme switch.
2. Cover/title/author and publication information.
3. Synopsis and key metadata (source, total chapters when known, genres/tags, publication status).
4. Personal reading progress, resume/start chapter, link to chapter browser.
5. Personal rating/comments, collections and related personal actions.
6. Local storage/offline controls and privileged action links with explicit safeguards.

The precise responsive positions may evolve, but **the order and visibility of the information** must not change arbitrarily. Avoid heavy standalone collection selectors, unclear hover contrast or repetitive labels. Author and tag links should navigate to filtered lists rather than dead text.

### Tags and genres

- Imported genres (`sourceTags`) and added personal tags (`personalTags`) appear as **identically styled browse-only chips** on the novel details page. No cross/remove button on the chips, and no visual distinction encouraging accidental deletion.
- The visible merged list is **always A–Z**, case-insensitive, with numeric-aware natural order, and must reorder **immediately** after a tag is added and again after successful save.
- Users may **add** personal tags on the detail page using an input, existing-tag suggestions and a confirmation prompt; tag removal belongs to **Master Controls**.
- Details' save handler is deliberately **append-only** and must not delete previously saved tags even if a stale browser draft is submitted.
- Imported source genres remain protected. Owner-controlled changes must not silently rewrite raw EPUB metadata.
- Tag labels on the chip are clickable to browse all novels with that tag.
- The list must preserve existing tags and capitalisation rather than fabricate duplicates differing only in case.

### Collections and subcollections

- A novel may belong directly to multiple collections. A collection may be nested under another. Parent/child hierarchy does not imply automatic member inheritance.
- The **Add to collection** picker is a lightweight in-app dialog, searchable, showing full nested paths.
- For books already in a collection, show passive `✓ Added` state **and a distinct clickable Remove button**; for absent memberships show **Add**. Neither operation deletes the book or the collection.
- The change must be reversible and persist when the picker closes, reopens and the browser reloads. Pending cloud state must not be hidden or misrepresented as completed cloud sync.
- Creating a new collection or child collection from the picker must respect name conflicts, hierarchy cycles and owner safeguards for deletion.
- Collection-save notifications appear as small in-app toasts. **Newest notifications stack above older ones**; do not overlap or replace one another unpredictably. Cap stack as implemented and avoid multiple browser alert boxes.
- Do not use a vague button labelled "Added" as the sole clickable removal mechanism.

## 6. EPUB reading experience

Source: `src/components/Reader.tsx`, `src/styles.css`, `src/lib/chapters.ts`.

**Mode:** Vertical chapter scrolling only. Never introduce horizontal page turning, pagination toggles, or scrollbar UI that reduces usable reading space unless expressly requested.

### Reader header (previously regressed)

- On desktop, **Back** and the book/Library return shortcut remain on the left.
- Keep the novel title and chapter/progress information centred and readable.
- Keep **Library, chapter contents, theme switch and reading preferences at the top-right**; do not let controls wrap to a second row at the far left.
- Intermediate-width layouts may give the title a separate centred row while keeping the controls top-right.
- Mobile gets a compact first-row navigation/actions layout and a second title row if needed, with no clipping or collisions. Do not show a duplicate Table of Contents action when the bottom chapter chooser already provides navigation.
- Verify geometry, not only that buttons exist: `scripts/browser_smoke.mjs` checks actual placement at 1366px, 1650px and mobile.

### Reader content, chapter title and divider contrast

- The header, actual **chapter title band** and EPUB **body paper** should be distinguishable at a glance in all six themes. Avoid giving all three the same uninterrupted background.
- Keep the chapter title centred and legible; normal prose remains naturally aligned for reading.
- A **full-width, opaque 2px maximum-contrast rule** sits just under the chapter title, not merely under the text width. Black for light reading themes, white for dark.
- At the end of each chapter, provide a **full-width opaque 2px high-contrast rule**, with roughly **66px above** and **112px of real scrollable space below** the rule. The final story line must sit clearly above the bottom chapter navigation at the maximum scroll position, not just have nominal CSS padding.
- EPUB.js scrolled-doc sizes its iframe with a DOM Range (`Contents.textHeight`), which excludes CSS `body::after` pseudo-elements and bottom padding. The fix appends one **empty, non-interactive, aria-hidden end marker** as the last child of each loaded EPUB chapter. Its rendered block is included in Range measurement. Never remove/reorder existing EPUB nodes, as that would affect persisted CFIs. The line and space must actually scroll into view on desktop/mobile.
- EPUB.js content lives in a **same-origin iframe**. Chapter styling and computed styles must be registered/applied in that iframe; changing an outer CSS class alone cannot fix EPUB text.
- Existing chapter names are inconsistent across EPUBs; carefully detect h1/h2 or valid chapter-heading paragraphs without styling ordinary narrative as a title. Preserve book text.
- Use all themes and multiple representative EPUB layouts in testing, especially Plum where low visual separation was reported.

### Reader bottom navigation

- Fixed footer: **Previous chapter** at bottom-left, jump-to-chapter dropdown/picker in the centre, **Next chapter** at bottom-right.
- Correct disabled/active states at first and last chapter; buttons should have obvious contrast and focus.
- Chapter picker must support selecting a different starting chapter and searching by chapter number. Use an app-owned dialog, not a huge native OS dropdown or browser popup.
- Ensure the chapter footer does not cover the end of readable content. Do not reintroduce a persistent horizontal page scrollbar.
- Preserve deep links to `/novels/<slug>/read/chapter-N`, legacy ID paths, Back/Forward, explicit chapter override and remembered CFI progress.
- Keep reader full-screen/focused, with purposeful return links to novel details and main library, rather than duplicating a large site header.

### Themes and typography

All six **stored IDs** and display names are part of the contract:

| Stored ID | Display name | Typical character |
| --- | --- | --- |
| `sepia` | Sepia | Warm parchment; default |
| `light` | Paper | Neutral light paper |
| `dark` | Charcoal | Soft dark neutral |
| `midnight` | Midnight | Deep blue dark |
| `ocean` | Ocean | Light cool blue |
| `plum` | Plum | Deep purple |

The app must preserve users' saved theme IDs, settings and existing preferences. Avoid replacing `dark` with `jade` or similar migrations simply to rename a theme.

Source of typography defaults: `src/types.ts`. Current standard defaults: Sepia, literary font, font-size 115%, line-height 1.65 and full available width (width setting 0). Current **mobile first-run/reset** defaults: sans font, size 105%; saved user settings override both defaults. The font controls must actually change EPUB content, including when offline (system fallbacks are needed).

Buttons, panels, dropdowns, tags, ribbons and progress bars need readable contrast in **every** theme, including hover and focus states. Use existing theme palette variables in `src/theme-palettes.css`.

## 7. Offline and personal data controls

- Offline tab displays real downloaded/cached EPUBs, PWA state and bulk Save all offline action. It can become the default tab when offline where applicable.
- Removing a local downloaded EPUB is a **cache-only** action with confirmation and a hosted replacement existence check; it does **not** require Owner mode.
- Preserve the EPUB and warn if the cloud replacement cannot be verified. Local-only files must not be bulk-deleted.
- Whole-novel deletion is Owner-only, requires exact-title confirmation and has additional server-side validation.
- For bulk verified download removal, show `REMOVE DOWNLOADS` inside a **small dark monospace copyable chip** next to a real Copy button. Preserve the two-stage confirmation and the list of copies retained as unverified/local-only.
- Distinguish local save, queued cloud write, successful cloud write and offline state truthfully.
- Do not put large browser-native confirmation dialogs, "pages.dev says" browser popups or multiple intrusive notifications over the reader.

## 8. Feedback, accessibility and responsiveness

- Use in-app confirmation dialogs, clear action labels and reversible states where possible.
- Toasts should appear unobtrusively, with latest first and previous toasts still visible without overlap.
- Hover contrast and button borders must be visible on desktop; tap targets and inline controls must be usable on mobile. Controls must never look simultaneously clickable and disabled.
- All interactive items have informative `aria-label` names and keyboard access; functional links use anchors, not fake div buttons.
- Avoid duplication in labels, obvious filler ("You can still read after finishing"), and visually dominant "Completed" ribbons.
- Avoid title hover tooltips when title is already fully visible.
- Space must be used efficiently on smaller screens without truncating chapter controls or creating horizontal scrolling.
- Use the consistent Sun logo, theme class and shared CSS tokens across screens and in installed PWA icons.
- UI needs valid empty, loading, failed image, offline and authentication-denied states. Do not replace missing real book data with fabricated metadata.

## 9. Acceptance checklist for a UI change

Before merging a PR affecting a screen:
1. Compare before/after at a desktop width around 1366px and wide desktop around 1650px; check mobile around 390px and a mid-width layout.
2. Test **Sepia, Paper, Charcoal, Midnight, Ocean and Plum**, including hover/focus and selected text contrast when relevant.
3. Exercise keyboard actions, Back/Forward links, deep link reload, a novel with a long title, empty/missing fields, a source cover and a fallback cover.
4. If tags changed: create tag, check immediate A–Z, save, reload, browse; ensure no direct cross or accidental deletion.
5. If collections changed: add, remove, reopen, reload, nested membership, notifications and pending state.
6. If reader changed: synthetic EPUB with h1/h2 and paragraph titles, long chapter, scroll to end, full-width rules, navigation, CFI and offline cold start.
7. Verify no new secret/private data in screenshots, tests, web assets or log output.
8. Require passing unit/type/build, browser/CSP/offline and CodeQL on the PR, and again for actual production master deployment.
9. Check real Cloudflare release status. A merged PR is not yet the live site.
10. Update this contract when the owner approves a new design decision.

## 10. Intentional non-goals

No manga image pages, comics reader gestures, video playback, server-side third-party analytics, forced Shared Core migration, global cross-app SSO, new database provider, or paid API dependency. These belong to separate proposals and repositories. Never remove novel-specific behaviour to make other media apps easier.

**Related:** [AI agent playbook](AI_AGENT_PLAYBOOK.md), [architecture/data](ARCHITECTURE_AND_DATA_LIFECYCLE.md), [test/release](TESTING_RELEASE_RUNBOOK.md).
