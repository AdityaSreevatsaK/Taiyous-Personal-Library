# Five structural design concepts: Taiyou's Personal Library

These are **real React prototypes with different page structures**, not palette swaps. They render in the **isolated, static design-preview build** only at:

**https://design-preview.taiyous-personal-library.pages.dev/layouts**

Individual concepts are directly navigable using hash links:

| Concept | Direct preview | Main change | Source feature branch |
| --- | --- | --- | --- |
| Grand Library | [/layouts#grand](https://design-preview.taiyous-personal-library.pages.dev/layouts#grand) | Full-bleed cinematic feature, book stacks, horizontal continue-reading rails | `design/layout-grand-library` |
| Reading Desk | [/layouts#desk](https://design-preview.taiyous-personal-library.pages.dev/layouts#desk) | Three-pane catalogue, quick shelves, permanent book inspector | `design/layout-reading-desk` |
| Bookshelf House | [/layouts#shelves](https://design-preview.taiyous-personal-library.pages.dev/layouts#shelves) | Tactile, horizontally scrollable book shelves grouped by reading status; open-book details | `design/layout-bookshelf-house` |
| Collection Atlas | [/layouts#atlas](https://design-preview.taiyous-personal-library.pages.dev/layouts#atlas) | Interactive geographic-style topic map, reading trail and irregular cover mosaic | `design/layout-collection-atlas` |
| Literary Journal | [/layouts#journal](https://design-preview.taiyous-personal-library.pages.dev/layouts#journal) | Editorial masthead, asymmetric two-column article, reading notes and a typographic book index | `design/layout-literary-journal` |

The source was written in five separate branches based on the shared foundation. Copies are aggregated into `design/library-explorations-20261112` solely to support switching among all five on a single preview URL. None of the prototypes replaces the working production dashboard.

## Research and design rationale

We compared existing library and reader products as **sources of interaction patterns, not visual assets or code**:

- [BookFusion virtual bookshelves and smart shelves](https://www.bookfusion.com/reading/cloud-library): useful for grouping and retrieving a large, personal collection.
- [Readwise Reader filtered views](https://docs.readwise.io/reader/docs/faqs/filtered-views): saved, customisable views and workflow-oriented navigation.
- [Koodo Reader](https://koodoreader.com/en): reading controls, layouts and preserving an immersive reading surface.
- [Book Nook's themed shelves](https://trybooknook.com/compare/best-bookshelf-apps): inspiration for a tactile physical-bookshelf concept, not copying its visual design.
- [Redesigned Calibre-Web concepts](https://danielcandelaria.com/imagining-a-world-with-a-redesigned-calibre-web/): cover-first discovery and selection.
- [BookOrbit](https://madewithvuejs.com/bookorbit): progress and immediate reading priorities above the broader book catalogue.

The five concepts deliberately explore very different navigation models rather than styling the same dashboard.

## What is interactive

- Switch among five layouts; use direct links for side-by-side comparisons.
- Try the Sepia (default), Paper & Ink, and Jade Archive colour palettes.
- Search and filter fictional books by title, author, tags and reading status.
- Inspect a book using a different details presentation in each concept.
- Follow **Read** to the real existing EPUB reader loaded with original fictional sample text (four chapters per sample book).
- Use a 390 px mobile layout; each concept adapts its navigation and book browsing.

### What is deliberately *not* implemented in the concepts

These pages are prototypes for comparing **information architecture and visual composition**. They are **not yet replacements** for all production controls. The real app still owns OAuth, private data, editing, owner-confirmed deletion, collections persistence, offline caching, EPUB reading and synchronisation.

No external novel content, private data, passwords or client OAuth tokens are used by the gallery. All eight books are fictional. They are stored locally in the **isolated preview hostname's IndexedDB** so users can test the actual existing EPUB reader. Preview builds disable private cloud controls.

## What remains before selecting and merging a concept

1. Test all five layouts at desktop, tablet and phone sizes and inspect any accessibility issues.
2. Ask the user to choose one main layout, and optionally borrow specific elements from others.
3. **Only then** port the chosen layout into the working `LibraryDashboard` and, where applicable, the novel details components. Map every existing action and protection without dropping functionality.
4. Run the full existing browser and unit regression suite, plus the sync PR's cloud conflict suite when merged.
5. Publish a new staged app preview for acceptance. No production merge or release tag without confirmation.

**Release v1.0.0 remains separately blocked on real Hugging Face OAuth integration.** None of this design work changes that gate.
