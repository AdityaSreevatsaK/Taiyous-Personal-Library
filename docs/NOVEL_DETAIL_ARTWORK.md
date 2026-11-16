# Novel details artwork

The details hero takes its visual identity from **the novel's own uploaded cover**.
It does not show stock landscapes, AI-generated jackets, or photos from unrelated novels.

## Source of truth

- `book.coverPath` must refer to cover artwork extracted from the user's EPUB or saved in the private Hugging Face dataset.
- `useCoverArt` first checks the local IndexedDB cover cache and then fetches that same book's private cloud cover when authenticated and online.
- The cover shown in the book tile and the backdrop come from the same source. The backdrop is decorative, blurred and darkened for readable text, while the original cover remains sharp.
- Never fetch images by guessing a title, searching the web, or using another novel's art. A stored path alone is not proof of provenance; source verification belongs in the novel retrieval/import pipeline.

## Missing, offline and broken artwork

When a book has no `coverPath`, the private dataset is disconnected, or decoding fails, the hero uses a deterministic six-colour gradient selected by the immutable novel ID. It never fabricates a substitute cover. Book tiles show an explicit **Cover unavailable** placeholder rather than typography styled to imitate a jacket.

The decorative background does not reveal titles or private dataset URLs to an external image CDN. Its image comes from the same local/cloud cover already used in the library.

## Responsive behaviour

The reader's title, chapter information, tags, ratings and actions remain accessible above the decorative backdrop on desktop and mobile. The gradient overlay preserves contrast against bright cover artwork. Reduced-motion users do not receive backdrop transition animations.

## Regression checks

`tests/novel-hero.test.ts` checks stable colour palettes and contrast.
`scripts/browser_smoke.mjs` checks a novel without a cover for the palette fallback and verifies details layout and visibility on mobile and desktop.
