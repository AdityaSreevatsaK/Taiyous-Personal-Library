# Usage analytics: local-first design

**Purpose:** Track how long the owner actively uses the app, reads individual novels, and uses the app while the browser reports offline. **No external analytics service is integrated.**

## Data collected
- `appMs`: visible, focused, recently interacted-with app time, in local calendar days
- `readingMs`: subset of active app time when a downloaded EPUB is open in the reader
- `offlineMs`: subset of active app time when `navigator.onLine` is false. It may overlap reading time and is **not an additional independent duration**
- `bookReadingMs`: cumulative active reading time by immutable 24-character book ID

The UI shows total active time, reading time, offline time, today's reading time, a 14-day bar chart and the 10 most-read novels. Metrics are **estimates**, not verified attentiveness. The source for all data is device-local `localStorage['taiyou.usage-analytics.v1']`; no title, book content, credentials or IP address is sent to an analytics endpoint. Identifiers are only stored on the user's device. This is not automatically synchronised between desktop and mobile.

## Measurement rules
- Counts time only if `document.visibilityState === 'visible'`, `document.hasFocus()` is true and last interaction was at most 3 minutes ago
- Interaction includes click/tap, keyboard, wheel, scroll and EPUB document scrolling/touch inside its same-origin iframe
- Samples every 10 seconds and on interaction, activity, visibility, focus, offline and pagehide events
- A single slice is limited to 30 seconds to avoid inflated totals after a device sleeps or an inactive tab is throttled
- Counters are bounded to the most recent 400 calendar days and 2,500 novel IDs
- A saved theme, EPUB, reading progress, ratings and all HF data are **unaffected** by clearing analytics
- Analytics tracking is enabled by default following the owner's request. The Analytics section offers a toggle to stop tracking, a JSON export and a confirmation-gated erase button

## Limitations
- Previously read time cannot be reconstructed, so charts start empty and fill from the date this version is first used
- Browser data deletion, private browsing and changing devices will not preserve this local-only history unless manually exported
- Browsing while not interacting for more than 3 minutes is treated as idle, including stationary reading
- Offline status is the browser connectivity signal, which may differ from actual server reachability
- Separate tabs count only while focused. Analytics is not used for advertising, behaviour profiling, or cloud sync

## Verification
- Unit tests for online/offline/reading subsets, interval caps, persistence, disabled tracking, malformed data and storage failure
- Chromium browser smoke covering opening Analytics, opting out/in, retaining regular library navigation, EPUB and offline operations
- Never require a Hugging Face connection to open Analytics

## Approved Sun branding (14 November 2026)

The owner supplied a logo handover containing exactly two transparent 128px Sun artwork variants and two 32px favicons. The approved image assets are now checked into `public/branding/`:

- `sun-dark.webp`: golden Sun, selected for Charcoal, Midnight and Plum.
- `sun-light.webp`: blue-and-gold Sun, selected for Paper, Ocean and Sepia.
- `favicon-dark.png` and `favicon-light.png`: sharp 32px favicons.
- `taiyou-app-192.png` and `taiyou-app-512.png`: transparent PWA icons derived directly from the supplied gold artwork, carefully resized and optimised.
- `taiyou-mark.svg`: self-contained SVG compatibility wrapper around the original golden Sun artwork; **not** the old feather.

`BrandMark.tsx` swaps assets based on the six existing saved themes, without an opaque icon tile. `App.tsx` updates the tab favicon on theme change. The PWA build copies approved install icons from their immutable source files, and fails rather than silently generating an old book-shaped icon. No analytics or third-party image requests are involved.

The logo assets were obtained from the user's Library handover `logo-transfer-20261114.json`; no other design was substituted.
