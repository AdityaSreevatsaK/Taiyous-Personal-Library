# Taiyou brand identity assets

The current `taiyou-mark.svg` deliberately reproduces the old feather as a temporary placeholder. A separate logo-design session will supply the final Sun symbol.

**Replace without changing application code:**
1. Replace **`public/branding/taiyou-mark.svg`** with the approved, background-free Sun mark. Use a safe standalone SVG containing no scripts, external references, links, `foreignObject`, tracking or embedded fonts. Optimise for tiny header/favicons.
2. Supply transparent square **`public/branding/taiyou-app-192.png`** and **`public/branding/taiyou-app-512.png`**. If supplied together, `scripts/build_icons.mjs` copies them into installable PWA sizes. If either is missing, existing generated fallbacks remain in use.
3. Build outputs `/library-icon.svg` from the approved SVG and PNG icons from the two supplied PNG assets. This updates browser favicon and PWA install images. Full production rollout needs regression checks and authorisation.

Do not substitute a design mock-up for production artwork, include an opaque background, modify book data, or rename the public paths. Until the Sun logo is provided, the existing symbol remains a feather.
