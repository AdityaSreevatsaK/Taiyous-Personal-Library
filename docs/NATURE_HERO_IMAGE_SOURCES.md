# Shared nature imagery for novel details

## Visual direction

Twelve genuine landscape and night-sky photographs reused across the complete library.
This revision replaces four visually busy forest/waterfall images with atmospheric
mountain mist and star-field scenes. All are genuine Unsplash photographs with
source and photographer attribution, not generated artwork.
No faces, fictional characters, portraits, or novel-specific stock searches.
Each novel's immutable ID deterministically chooses one photograph from the
shared pool; changing the novel title, theme or device does not change it.

The photograph is the full-strength hero background on all screen sizes:
100% opacity, no whole-hero colour overlay, no faded mask, no blur or
darkening filter. To keep text readable even over bright snow or sky, the
title and author have one compact translucent neutral strip, while the chapter
count, status and language share a second small strip. Tags, rating buttons
and reading actions remain outside any large enclosing panel. On mobile the
title and chapter details are explicitly stacked above the photograph so
neither can be hidden by the image. The landscape stays at 100% opacity,
unfiltered and visible around the small text strips.
If the CDN is offline, blocked or unavailable, a neutral dark hero background
remains without an image error icon.

## Image sources and credits

Unsplash permits the use of these photographs in personal and commercial
projects without mandatory attribution, although photographer credits are
provided here. Source: https://unsplash.com/license

| Mood | Photographer | Source |
| --- | --- | --- |
| Twilight mountain mist | 志远 杨 | https://unsplash.com/photos/misty-mountains-shrouded-in-blue-twilight-fog-kzH-sVU5pqs |
| Dramatic mountain silhouettes in fog | Filip Kvasnak | https://unsplash.com/photos/misty-mountains-shrouded-in-dark-clouds-at-dawn-tvJX2DTeCiQ |
| Dark highland mist | Viktoriia Ananeva | https://unsplash.com/photos/dark-moody-mountains-shrouded-in-mist-N47Pk5QhRfw |
| Milky Way above remote mountains | Ashwini Chaudhary | https://unsplash.com/photos/starry-night-sky-over-mountains-z-u4kAj3JeY |
| Dawn over a quiet lake | Jonny Gios | https://unsplash.com/photos/misty-lake-reflects-sunlit-mountains-at-dawn-cpAxb1E57zE |
| Celestial night over the Dolomites | Marek Piwnicki | https://unsplash.com/photos/snowy-mountains-under-a-starry-night-sky-SumjjLhysZM |
| Snowy mountains at dusk | Chris Weiher | https://unsplash.com/photos/snow-capped-mountains-reflected-in-a-lake-at-sunset-3epCdVoYCds |
| Stars above a mountain lake | Dhaivat Shah | https://unsplash.com/photos/starry-night-sky-over-mountains-and-a-lake-8W9nKu1PLu4 |
| Cherry blossoms by a tranquil lake | Ryuta | https://unsplash.com/photos/cherry-blossoms-line-a-tranquil-lake-under-a-clear-sky-jUyd5DMnalg |
| Northern lights above snowy mountains | Rafael Peier | https://unsplash.com/photos/northern-lights-illuminate-a-starry-sky-over-snowy-mountains-XXX2uavaR38 |
| Sunset over desert dunes | Francesco Ungaro | https://unsplash.com/photos/the-sun-is-setting-over-a-desert-with-sand-dunes-tSR133k8Diw |
| Atlantic cliffs and sunset waves | Ivan Rohovchenko | https://unsplash.com/photos/ocean-waves-crash-against-rugged-coastal-cliffs-at-sunset-IQJEiVUBeZs |

## Performance, privacy and offline behaviour

- Each hero fetches **one** responsive image from the fixed public
  `images.unsplash.com` photo pool; no image API keys or per-book searches.
- Browser chooses 840px or 1500px optimised files, JPEG/WebP/AVIF
  automatically where supported, with asynchronous decoding and lazy loading.
- `referrerPolicy="no-referrer"` prevents the CDN receiving private novel
  paths; external URLs contain no book IDs, OAuth credentials or metadata.
- The CSP allows images from exactly `https://images.unsplash.com`.
  Script, frame, worker and API/connect permissions are unchanged.
- These are decorative images, **not EPUBs or private downloads**, and are not
  persisted in IndexedDB or the service-worker app-shell.
- Offline or failed CDN responses retain the neutral dark background with
  no broken-image icon and do not prevent reading or navigating novels.
- Sources and pool size are changed only in
  `src/lib/novel-hero.ts`. No cloud catalogue changes are required.
- To avoid reshuffling assignments, the original eight slot indices remain
  stable; roughly one in three books selects from slots 9–12. Four earlier
  slots now contain the more atmospheric photographs listed above.
