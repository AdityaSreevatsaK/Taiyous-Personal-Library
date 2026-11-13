# Taiyou's Personal Library: shared design foundation

## Decision: one application, three themes

| Saved theme ID | User-facing name | Intended use | Palette |
| --- | --- | --- | --- |
| `sepia` | **Sepia** | Default for new readers, especially long reading sessions | Parchment, walnut ink, softly aged brass |
| `light` | **Paper & Ink** | Light/daytime variant | Warm ivory, dark ink, restrained burgundy |
| `dark` | **Jade Archive** | Dark/evening variant | Forest jade, cream type, muted gold |

The IDs are **not renamed** because existing browsers persist `light`, `dark` and `sepia` in `ReaderSettings`. Fresh installs use `DEFAULT_SETTINGS.theme = 'sepia'`. Existing explicitly chosen themes are respected; switching remains possible from the library sidebar and reader preferences panel.

## Implementation, isolated feature branch

- `src/design/themes.ts`: one typed list of theme names/intent and accessible names.
- `src/design/foundation.css`: common colour, contrast, surface, background, typography and interaction tokens, applied *after* existing CSS without replacing working layout rules.
- `src/components/LibraryDashboard.tsx`: explicit keyboard-friendly appearance switcher (Sepia, Paper, Jade), active state and descriptive labels.
- `src/components/Reader.tsx`: consistent parchment/ivory/jade EPUB iframe colours and named reader theme controls.
- `src/design/themes.test.ts` and existing `scripts/browser_smoke.mjs`: palette contract, default, mobile/desktop appearance, persistence.
- `design/previews/index.html`: isolated interactive synthetic gallery for comparing the three visual directions, never used as the production app.

The visual system is shared by the **library, novel details and reader**, but the layout, navigation, chapter-scrolling behaviour and data models remain untouched.

## Protected behaviours

No changes to OAuth, Owner mode, imports, offline EPUB caches, IndexedDB schema, novel IDs, reading progress, review/collection sync, chapter navigation or the private dataset. The design branch deliberately starts from the latest stable `master`; the separate draft sync PR is not merged into this experimental design work.

The book detail page keeps batched tag confirmation, synopsis confirmation, protected whole-novel deletion and unprotected safe offline-copy removal. The Trying out shelf and reading positions retain their original behaviour.

## Review and rollout

1. Review the three themes on both laptop and phone. Verify low contrast and long chapter readability, particularly in Sepia.
2. Check updated desktop/mobile/offline browser regressions and colour accessibility.
3. Refine layout progressively in later commits, not as part of this token foundation.
4. **Do not merge or deploy without explicit approval.** The stable v1.0 release remains separate from any later visual redesign.

If `master` advances after the design branch was created, reconcile/retest before proposing a merge.
