# Shared nature imagery for novel details

## Visual direction

Eight genuine landscape photographs reused across the complete library.
No faces, fictional characters, portraits, or novel-specific stock searches.
Each novel's immutable ID deterministically chooses one photograph from the
shared pool; changing the novel title, theme or device does not change it.

The images are secondary to the title, cover and reading controls. A strong
left-to-right gradient maintains foreground text contrast on desktop. Mobile
uses a softer top-to-bottom treatment. The original six-colour hero gradients
remain intact when images are offline, blocked or unavailable.

## Image sources and credits

Unsplash permits the use of these photographs in personal and commercial
projects without mandatory attribution, although photographer credits are
provided here. Source: https://unsplash.com/license

| Mood | Photographer | Source |
| --- | --- | --- |
| Twilight mountain mist | 志远 杨 | https://unsplash.com/photos/misty-mountains-shrouded-in-blue-twilight-fog-kzH-sVU5pqs |
| Misty evergreen valley | Roberto Shumski | https://unsplash.com/photos/misty-forest-valley-with-mountains-in-background-oYEGPZebzGw |
| Bamboo forest | olivia kim | https://unsplash.com/photos/a-dense-bamboo-forest-with-tall-green-stalks-MAavXSIBLkc |
| Mossy woodland waterfall | Evgeni Tcherkasski | https://unsplash.com/photos/waterfall-cascading-down-mossy-rocks-in-a-lush-forest-4I12DYcs0tc |
| Dawn over a quiet lake | Jonny Gios | https://unsplash.com/photos/misty-lake-reflects-sunlit-mountains-at-dawn-cpAxb1E57zE |
| Sunbeams in an autumn forest | Pascal Debrunner | https://unsplash.com/photos/sunlight-streams-through-a-foggy-forest-with-autumn-leaves-U-eRC8Q5iEY |
| Snowy mountains at dusk | Chris Weiher | https://unsplash.com/photos/snow-capped-mountains-reflected-in-a-lake-at-sunset-3epCdVoYCds |
| Stars above a mountain lake | Dhaivat Shah | https://unsplash.com/photos/starry-night-sky-over-mountains-and-a-lake-8W9nKu1PLu4 |

## Performance, privacy and offline behaviour

- Each hero fetches **one** responsive image from the fixed public
  `images.unsplash.com` photo pool; no image API keys or per-book searches.
- Browser chooses 840px or 1500px optimized files, JPEG/WebP/AVIF
  automatically where supported, with asynchronous decoding and lazy loading.
- `referrerPolicy="no-referrer"` prevents the CDN receiving private novel
  paths; external URLs contain no book IDs, OAuth credentials or metadata.
- The CSP allows images from exactly `https://images.unsplash.com`.
  Script, frame, worker and API/connect permissions are unchanged.
- These are decorative images, **not EPUBs or private downloads**, and are not
  persisted in IndexedDB or the service-worker app-shell.
- Offline or failed CDN responses retain the original coloured gradient with
  no broken-image icon and do not prevent reading or navigating novels.
- Sources and pool size are changed only in
  `src/lib/novel-hero.ts`. No cloud catalogue changes are required.
