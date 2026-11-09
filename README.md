---
title: Taiyou's Personal Library
emoji: 📖
colorFrom: green
colorTo: yellow
sdk: static
app_file: dist/index.html
fullWidth: true
header: mini
short_description: Private novel library with EPUB and ZIP storage
---

# Taiyou's Personal Library v1.0.4


> **Production baseline:** This README documents the restored `master` v1.0.4 source, not the newer staged features. For the exact features, storage behaviour and limitations on this branch, read **[Master capabilities and offline behaviour](docs/CAPABILITIES.md)**. The `dev` branch has additional functionality that has not been promoted to production.

**Offline summary:** A previously cached EPUB can be read while the app remains open, but opening/reloading the app offline is not reliably supported (no service worker/PWA). This baseline has no dedicated Download EPUB or original ZIP button; the automatic private EPUB fetch caches a browser reading copy. See the linked capability document.


This version builds on the approved v0.7.0 reader and adds **hosted novel storage** without requiring a running backend or embedding a long-lived Hugging Face token in the web app.

## Release notes: private Space authentication compatibility

The previous Hugging Face OAuth flow could not complete because **private Static Spaces
cannot be opened through their direct `.hf.space` links**. This version keeps the Space
private and uses the existing fine-grained **Taiyou-Novels-Storage** dataset token
for authorised browser-to-dataset operations.

1. Keep the **Space private** and the **Dataset private**.
2. Open the app **only via the authenticated Hugging Face Space page**, not the direct `.hf.space` address.
3. In Shared novel library, enter `AdityaSreevatsaK/Taiyous-Novels` and click **Save**.
4. Paste your **Taiyou-Novels-Storage** fine-grained dataset token into the password field and click **Connect private dataset**.
5. Import one small ZIP and verify the private dataset contains `data/library.json`, `source.epub` and `original.zip`.

This token is **never bundled, stored in localStorage/sessionStorage, written to disk,
or placed in the Space settings**. It stays in React memory until refreshing or
closing the tab. You must reconnect after a page reload. Keep it restricted to
read/write access on `AdityaSreevatsaK/Taiyous-Novels` only. Do not enter your
Space deployment token. Do not upload book files with untrusted active scripts.

The code includes a check that the target dataset is private. Browser-side cloud
upload must still be tested live against your account before calling it verified.

The earlier Windows v1.0.2 verification passed **20/20 tests**, production build,
and `npm audit --omit=dev` with **zero production vulnerabilities**. Re-run these
commands with this version to confirm no regressions.

## What's new

- Hosted books are stored in a **separate private Hugging Face Dataset repository**. The React app remains a free, private **Static Space**.
- On the library dashboard, **Cloud settings** lets you enter the private dataset ID and connect with a repository-scoped Hugging Face access token. Sign-in is optional: without it, local imports still work just as they did in v0.7.0.
- After connecting, **Add a novel** accepts multiple ZIP/EPUB files. Each successful new upload publishes the EPUB, the original ZIP (when supplied), and an updated `data/library.json` index to the **same data folder** in the dataset repository.
- On other devices, entering the dataset-scoped token and connecting to the same dataset shows those novels without re-uploading. The EPUB downloads only when you first open a book and is cached in that browser's existing IndexedDB.
- Progress, current position, personal tags, summaries and typography remain local to each browser. There is no cross-device progress sync.
- Existing v0.7.0 books, settings, tags, positions and chapter selection are retained. **Previously imported ZIP bytes were not saved in v0.7.0**; to upload the original ZIP to the new cloud dataset, re-select the original ZIP with the new version after cloud sign-in.

## IMPORTANT: Permissions and privacy

- The novel dataset **MUST be PRIVATE**, and the Space **MUST be PRIVATE**. A public repository would expose the book files. Do not store copyrighted third-party books in the cloud without sufficient rights to do so, even if the repositories are private.
- Use a **fine-grained token restricted to the one private novel dataset**. Do not use a token with access to unrelated repositories.
- No permanent API key is committed to code or displayed to visitors. The token you paste stays only in browser application memory and is cleared on reload, tab close or disconnect. A new connection is required after reloading or using another device.
- The dataset and Space are separate repositories so adding a novel **does not rebuild the React app**.
- A private Static Space is not a writable server. The browser pushes files to the private dataset through the official `@huggingface/hub` API with your private dataset-scoped token.
- Keep your own original ZIP backup. The cloud collection is not a substitute for an independent backup.

## Static Spaces with no build credits

For free static hosting, **build on your own PC and upload `dist/`**. The Space README has
`sdk: static` and `app_file: dist/index.html` but deliberately has **no**
`app_build_command` (which would require paid build credits on Hugging Face).

```cmd
"C:\Program Files\nodejs\npm.cmd" install
"C:\Program Files\nodejs\npm.cmd" test
"C:\Program Files\nodejs\npm.cmd" run build
```

After building, upload the README and compiled `dist/` files using your existing
fine-grained deployment token. A safe, one-command deploy script is included:

```cmd
py scripts/deploy_prebuilt.py
```

This uses your already active Hugging Face CLI credentials. It uploads only `README.md`
and `dist/`; it does **not** upload novels, tokens or source files.
Only the app files belong in the Space; the original novel ZIPs and EPUBs belong
in the separate private dataset.

## Private-space connection troubleshooting

- Open the **Hugging Face Space page**, not its standalone `.hf.space` URL.
  Private Spaces are not available directly at the embed URL.
- Paste the **novel-dataset token**, not the deployment token, into Shared novel library.
- Token must have **read and write** permissions for `AdityaSreevatsaK/Taiyous-Novels`.
- On each refresh, reconnect because no token is stored on disk.
- Do not share credential strings or HTTP logs that include an Authorization header.

## Step-by-step Hugging Face setup

### 1. Create your private Dataset repo

1. While signed into Hugging Face, visit https://huggingface.co/new-dataset .
2. Create dataset **`taiyous-novels`** (or another simple name). Select your own account as the owner and **Private** visibility.
3. Note its repo ID: `YOUR-HF-USERNAME/taiyous-novels`.
4. No data upload is necessary at this step. The first successful novel import creates `data/library.json` and the `data/novels/` entries automatically.

### 2. Create a private Static Space

1. Visit https://huggingface.co/new-space .
2. Use `taiyous-personal-library`, SDK **Static**, visibility **Private**. No paid GPU/compute is needed.
3. Build locally using `npm install && npm run build` and upload the prebuilt files with `py scripts/deploy_prebuilt.py`. A Hugging Face build command currently requires credits.
4. Open the Space through its **App** tab on Hugging Face. Do not open the `.hf.space` URL directly while the Space is Private.

**Never upload your book ZIPs into the Space's source repository.** They belong in the private Dataset. The Space rebuilds source code; the Dataset independently stores the book data.

### 3. Connect the app to the dataset

1. Open the deployed app, expand **Cloud settings** on the dashboard.
2. Enter the private dataset ID `YOUR-HF-USERNAME/taiyous-novels` and click **Save**.
3. Paste your **Taiyou-Novels-Storage** dataset-scoped token into the password field and click **Connect private dataset**. No new tab or OAuth redirect is needed.
4. The app fetches the private dataset catalogue. Initially it will say `0 hosted novels`.
5. Choose **Add a novel**, then select one or multiple files (`.zip` or `.epub`). The app creates locally cached reading copies and publishes original ZIP + EPUB + catalogue to the private Dataset. Check for the **cloud upload succeeded** message; a local import alone is not proof of publication.
6. In the Dataset **Files and versions** tab, verify `data/library.json`, `data/novels/<id>/source.epub` and `data/novels/<id>/original.zip` (if you uploaded ZIP).

### 4. Read on phone or another PC

1. Sign in to your Hugging Face account and open your **private Space**.
2. In Cloud settings, enter the **same private dataset ID** on this device and connect using your dataset-scoped token.
3. Cloud novels appear in the bookshelf. Open one to cache its EPUB on that device and read.
4. Your reading position and personal tags will be separate on each device until progress sync is implemented.

### If you already had books in v0.7.0

Your original browser's IndexedDB has the extracted EPUB, local tags and reading positions. You do **not** need to clear those or start from scratch. Use the same browser host + port during local development to preserve your existing library. To put the **original ZIPs** in cloud storage, connect to the dataset and re-select the original ZIPs using **Add a novel**. Duplicate local books are recognised by EPUB hash; if they're not on the cloud yet, they still get published. Alternatively, choose **Publish cached EPUBs** from Cloud settings to publish all locally cached novels as EPUBs. This does not restore the original ZIPs, which v0.7.0 never saved. If you upload just an EPUB, the cloud retains an EPUB but not a reconstructed copy of its original ZIP.

### Managing storage

Data in the private dataset is organised as:

```text
data/
  library.json
  novels/
    <sha256-first-24-chars>/
      source.epub
      original.zip        # only when a ZIP was uploaded
```

The JSON catalogue stores published book metadata, but **not** your personal tags or reading position. Files use stable identifiers derived from EPUB bytes, so duplicate imports are detected across devices. Only the app account with repository write permission can publish.

**Limitation:** Hosted novel deletion is not implemented through the app. To remove one permanently, delete its files from the private Dataset and remove its entry from `data/library.json` (back it up before editing). File uploads are serialised in the same browser; simultaneous writes from two devices can still conflict. Avoid adding novels from two devices at exactly the same time.

## Local Windows development

```powershell
# Open PowerShell in this extracted folder, containing package.json
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" test
& "C:\Program Files\nodejs\npm.cmd" run build
& "C:\Program Files\nodejs\npm.cmd" run dev -- --port 5173 --strictPort
```

The app works without hosted configuration, importing only to the browser as before. Optional: you can set `VITE_HF_DATASET_REPO=YOUR-HF-USERNAME/taiyous-novels` as a Static Space variable to pre-fill the repository ID across devices; this value is **public configuration, not a secret**. You can also test a dataset-scoped token locally; enter it through the in-app password field only, never `.env`, Vite or persistent browser storage.

### v0.7.0 reader features retained

- Sepia default, light/dark themes and Literata/Georgia/Palatino/Inter/Atkinson fonts.
- Adjustable reading text size, line height and full-width/wide/comfortable settings.
- Whole-chapter vertical scroll, compact top bar with always-accessible Next/Previous Chapter.
- Novel details with synopsis, source information, metadata tags and editable personal tags.
- All-chapter browser with search, jumps and groups of 50.
- Removal of empty source EPUB advertisement placeholders.
- Mobile and PC-responsive design and local reading progress.

## Verification status

The source passes an offline TypeScript/JSX syntax parse and the supplied sample ZIP's integrity checks. The Windows user reported a successful v1.0.2 production build, 20 tests passing, and a zero-vulnerability production audit. v1.0.4 changes cloud authentication; live private dataset upload/download remain unverified. Run `npm test` and `npm run build` on your Windows machine before deployment, then test one ZIP end-to-end on Hugging Face before uploading your remaining library. Do not treat untested cloud operations as production-verified.
