# Shared Core UI candidates from the production Novel Library

**Status:** Proposal for Session 1 (Shared Core owner), 18 November 2026. **No extraction or new dependency is approved or implemented.** The Novel Library stays standalone and uses its existing UI, cloud schema, OAuth cookies, owner rules and offline cache.

## Evidence and selection principles

Inspected `src/components/BackToTop.tsx`, `src/components/QuickNavigation.tsx`, `src/components/Reader.tsx`, `src/lib/ratings.ts` and `src/components/LibraryDashboard.tsx`. These currently embed different presentation and behaviour concerns. Only stateless, domain-neutral **presentation** is a candidate. Do **not** export an EPUB reader, nested-collection state, current-route navigation, HF cloud client, OAuth, owner mode, data persistence or generic progress model.

The following consumers are **proposed**, not yet validated by agents in their other repositories. Session 1 should first confirm a real non-production consumer's UX and build constraints.

## Candidate A: Accessible icon action button

- **Novel motivation:** repeated icon controls in reader/toolbars and catalogue navigation. `BackToTop.tsx` is an example of combined presentation plus page-scroll policy; extract only button rendering, not its scrolling hook.
- **Other prospective consumer:** Manga, for page/reader controls; alternatively Anime for episode actions.
- **Proposed minimal API** (illustrative TypeScript; Session 1 owns final design):

```ts
type IconActionProps = {
  icon: React.ReactNode;
  label: string;                  // required accessible name
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  pressed?: boolean;             // aria-pressed only when supplied
  title?: string;
  variant?: 'plain' | 'subtle';
  size?: 'regular' | 'compact';
};
```

- **Behaviour:** render a native `<button type="button">`; decorative icon `aria-hidden`; visible keyboard focus; Enter/Space activation; tab order unaffected; no global hotkeys, navigation, cloud requests, timers or reading state. If `pressed` is absent, omit `aria-pressed` rather than announce a toggle.
- **CSS isolation:** prefix classes (`taiyou-ui-*`), avoid `button`/global `a` selectors and avoid EPUB iframe styles. Default 44 × 44 CSS px touch target unless the embedding control provides equivalent accessible target area. Support `prefers-reduced-motion`, high contrast and zoom.
- **Dependencies:** React peer dependency only; icon supplied by caller. Do not require `lucide-react` or an app theme package.
- **Tests:** axe/semantic name, keyboard and focus, disabled and toggle semantics, 200% zoom/mobile tap target, Novel reader controls and a Manga preview. Validate no CSP changes.
- **Compatibility/rollback:** opt-in component replacing a *single* existing button in a later Novel PR. Removing its import restores the local button without data migration. Existing `BackToTop` scrolling remains Novel-owned.
- **Performance budget (target, not measured):** no fetch; at most 1 KiB extra gzipped JS plus 1 KiB scoped CSS per adopting app, excluding React; no extra long tasks or measurable reader-start delay.

## Candidate B: Compact personal rating indicator

- **Novel motivation:** `src/lib/ratings.ts` exposes stable 1–10 personal-rating meanings and `LibraryDashboard.tsx` styles scores. The data source and CSS tone names are novel-specific today.
- **Other prospective consumer:** Movies & TV and/or Anime, for explicit **personal** scores. Do not silently equate provider ratings with a private user's score.
- **Proposed minimal API:**

```ts
type RatingIndicatorProps = {
  score: number | null;          // 1..10 integer, null means unrated
  outOf?: 10;                    // default 10; other scales require opt-in
  showScore?: boolean;          // default true; never colour-only meaning
  accessibleLabel?: string;     // e.g. "Personal rating"
  size?: 'regular' | 'compact';
};
```

- **Behaviour:** pure rendering, no edits/persistence or request side effects. Visible text such as `9/10` with screen-reader announcement `Personal rating: 9 out of 10`; unrated status must be distinguishable without colour. Validate/clamp nothing silently: invalid values render a safe unrated state and can be logged by the **consumer**, not the shared view.
- **Visual contract:** consumer-overridable semantic CSS tokens for ink/highlight/contrast, not global `rating-tone-*` classes and no hardcoded Novel theme. Do not lift `RATING_LABELS` as cross-domain canon; other media can define their own descriptors.
- **Tests:** values 1, 5, 10, null, NaN/out-of-range, long labels, keyboard screen-reader semantics, 4.5:1 text contrast, dark/sepia/light contexts, no aria duplication.
- **Compatibility/rollback:** retain `ratingToneClass` and `ratingLabel` unchanged in the Novel application until two non-production consumers are verified. A future Novel PR may swap one display element only; revert restores current view without editing scores.
- **Performance budget (target, not measured):** no remote work or additional dependencies; under 1 KiB gzipped JS plus 1 KiB CSS, with no new image/font fetches.

## Prerequisites before any Shared Core implementation

1. Session 1 confirms at least **two independent consumers** with concrete use cases; one must run integration tests outside the Novel production repo.
2. Publish a versioned package with pinned release and React peer compatibility. Do not import the unpublished `0.0.0` workspace, unpinned Git branch or monorepo source path into Novels.
3. Measure before/after Vite chunk sizes, browser start-up, focus/keyboard/zoom and mobile EPUB usability. The budgets above are targets, **not measured results**.
4. Check CSS isolation, CSP and offline cold-start in both consumers.
5. Bring any proposed Novel adoption back as a separate, owner-reviewed, opt-in PR. Never bundle it with a data migration or production deployment.
6. Roll back by reverting the display-only change and restoring the existing local component. No local DB/HF schema, OAuth, reader progress or collection migration may be needed.

**Coordination:** Session 2 maintains this proposal in the Novel repository. Session 1 may reference it and independently validate cross-app adoption. No other repository has been modified by this proposal.
