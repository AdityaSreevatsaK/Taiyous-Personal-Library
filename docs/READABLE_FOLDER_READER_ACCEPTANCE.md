# Reader acceptance for Storage Controller readable-folder batches

## What has actually been verified

The Reader application on `master` already supports **both**
`data/novels/<24-hex-id>/` and
`data/novels/<24-hex-id> - <sanitised-novel-name>/`.
The catalogue's validated `epubPath` determines the storage directory;
an existing readable folder does not change merely because metadata.title
changes. Original ZIPs and JPG/JPEG/PNG/WebP covers must use that same folder.

- Reader compatibility merged in [PR #4](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/4).
- Production Reader `master` SHA `45233f4854b657d146965cf71a38142289411b18`
  completed [Deploy Application run #43404544333](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/43404544333).
  This verifies CI and a successful Cloudflare deployment, not a signed-in user journey.
- Reader's verified production-baseline pipeline:
  [run #43404530159](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/actions/runs/43404530159):
  113 tests, desktop/mobile offline smoke, Pages Function build and
  zero production dependency audit vulnerabilities.
- Genuine isolated Hugging Face `apply_one()` migration passed:
  [Storage Controller run #43431262417](https://github.com/AdityaSreevatsaK/Taiyou-Novels-Storage-Controller/actions/runs/43431262417).
  This was **not** a live Cloudflare OAuth gateway test.
- Reader [PR #6](https://github.com/AdityaSreevatsaK/Taiyous-Personal-Library/pull/6)
  adds migration-race resilience and tests against sequential batch states.
  A stale, now-404 EPUB, original ZIP or cover URL can trigger exactly one
  read-only catalogue refresh and same-immutable-ID retry. The fresh path
  must pass the existing shared validation. A missing or changed ID, malformed
  catalogue or authorisation error never permits an arbitrary alternate path.
  The initial PR CI run #43474331746 verified 121 tests, desktop/mobile/offline
  and Cloudflare Worker compilation.

## Actual Reader compatibility concerns during production batches

- A browser that already loaded catalogue revision N may hold an EPUB, ZIP
  or cover path that is deleted atomically by migration batch N+1. The
  new read-only retry in PR #6 covers this ordinary 404 race.
- Cached downloaded EPUBs and personal progress are keyed by immutable
  novel ID, not by a Hugging Face folder. A folder rename must not clear,
  re-import or rewrite these IDs.
- Cloud catalogue entries and covers are refreshed after cloud refresh.
  For stale metadata, the online fallback never invents a readable folder.
- Two separate batches can leave an expected mixed legacy/readable
  catalogue during the migration. Both formats remain valid and discoverable.
- A missing hosted EPUB can prevent deletion of the last local offline copy;
  this is the safe default when online verification is uncertain.

## Live authenticated Cloudflare verification: outstanding gate

The deployed production Cloudflare gateway is configured to use the real
private dataset and requires an actual Hugging Face OAuth browser session.
Its successful deployment, synthetic gateway tests and the *separate* private
test dataset migration **do not** by themselves prove that a real browser
can retrieve migrated private files.

Before granting full production-migration clearance, use a legitimate
signed-in browser to check read-only behaviour. Do not upload test books to
the production dataset merely to create a readable sample.

1. On the production Pages site, sign in via Hugging Face OAuth. Confirm
   the private library loads with the expected catalogue count.
2. For a selected existing book, open its detail page and chapters, load
   its EPUB through the existing gateway, and check its cover and original
   ZIP if these assets exist.
3. Verify offline cache, reading position, ratings and collections remain
   visible after refresh. Do not delete any hosted books as a diagnostic.
4. Once a readable entry exists through a separately approved migration,
   repeat the same checks on that **actual readable-path book**. Do so
   before any further production batch. Verify path encoding, including
   spaces and non-Latin characters where available.
5. Compare affected IDs and private book metadata before/after the batch.
   If a browser holds stale paths, confirm it can fetch the current file
   after a single catalogue refresh; offline copies must remain intact.
6. If the live gateway fails, halt further production batches and investigate
   without regenerating novel IDs or resetting data.

A fully isolated end-to-end alternative would require a separate Cloudflare
deployment with a separately configured test dataset and an authorised test
OAuth flow. That environment is not created by Reader PR #6.

## Separation of concerns

- Production migration itself belongs to the Storage Controller. The
  Reader does not move, rename or delete Hugging Face folder contents.
- Its private backup, verified `apply_migration_batch()` test, revision
  gates and approval are Storage Controller responsibilities.
- The Reader's unrelated Literary Journal design and cross-device personal
  sync work remain on their own PRs.
- No production data moves or production app deployment are performed by
  this Reader acceptance document or PR #6.
