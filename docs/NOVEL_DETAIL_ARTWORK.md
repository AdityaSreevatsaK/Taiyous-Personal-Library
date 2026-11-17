# Novel cover and hero imagery

## Cover precedence

1. Display the **genuine cover** stored with the EPUB or in the user's private Hugging Face dataset.
2. If the image is missing, downloading, offline or corrupt, render a **CSS-generated library edition** with the actual novel title and author. Six tasteful colourways are selected deterministically by novel ID.
3. When the genuine image finishes decoding, it immediately replaces the temporary generated jacket. Nothing is uploaded or persisted for that generated artwork.

Generated jackets are typographic placeholders, **not claims that an official novel cover exists**. All pages (catalogue, continue reading, floating gallery, genre tiles and novel details) use the same shared `Cover` component.

## Novel-details photography

The wide background behind the novel details is independent atmospheric decoration, not a book jacket. The library uses an approved fixed collection of genuine photographs, mixing **historic libraries**, **celestial skies**, and **desert/mountain landscapes**. The assigned photograph is stable for each novel ID, with different photography across novels.

The images use `images.unsplash.com` only; titles, descriptions, private dataset paths, passwords and tokens are never part of an external URL. The site Content Security Policy explicitly restricts the photo host. If photographs cannot load (including offline), the existing accessible six-colour gradient provides the fallback.

The cover at the left remains sharp; the photograph covers the background behind it. Title, metadata and actions sit above the photograph in their own legible layers. Mobile layouts retain all tags and controls.

## Photography sources

| Scene | Credit | Source |
| --- | --- | --- |
| Vaulted library reading room | Unsplash contributor | [Unsplash historic library collection](https://unsplash.com/fr/s/photos/biblioth%C3%A8que-sombre) |
| Gilded archive shelves | J. Balla | [Unsplash profile](https://unsplash.com/@jballa) |
| Milky Way above mountains | Ashwini Chaudhary | [Unsplash photograph](https://unsplash.com/photos/starry-night-sky-over-mountains-z-u4kAj3JeY) |
| Star-filled mountain lake | Dhaivat Shah | [Unsplash photograph](https://unsplash.com/photos/starry-night-sky-over-mountains-and-a-lake-8W9nKu1PLu4) |
| Northern lights and snowy mountains | Rafael Peier | [Unsplash photograph](https://unsplash.com/photos/northern-lights-illuminate-a-starry-sky-over-snowy-mountains-XXX2uavaR38) |
| Desert dunes at sunset | Francesco Ungaro | [Unsplash photograph](https://unsplash.com/photos/the-sun-is-setting-over-a-desert-with-sand-dunes-tSR133k8Diw) |
| Twilight mountains | 志远 杨 | [Unsplash photograph](https://unsplash.com/photos/misty-mountains-shrouded-in-blue-twilight-fog-kzH-sVU5pqs) |

Image licence: https://unsplash.com/license

## Regression coverage

- `tests/novel-hero.test.ts`: stable generated-cover variants, known photographic sources and safe URL construction.
- `scripts/browser_smoke.mjs`: generated cover jackets, editorial layout, visible atmospheric photos, desktop/mobile, offline reading and fast metadata-only detail navigation.
- `scripts/csp_browser_smoke.mjs`: proves the local genuine cover remains distinct from scenic photography under production Cloudflare Content Security Policy.
