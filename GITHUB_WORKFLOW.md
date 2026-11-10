# Source control and releases for Taiyou's Personal Library

The active GitHub branch is **master**, and the live app is hosted on **Cloudflare Pages**, not Hugging Face Spaces. The former `dev` branch and Space-based staging deployment were retired on 10 November 2026.

- **Source:** `AdityaSreevatsaK/Taiyous-Personal-Library` (public app-shell source; no novel content or credentials).
- **Production:** `https://taiyous-personal-library.pages.dev`, Cloudflare Pages project `taiyous-personal-library`, production branch `master`.
- **Private storage:** `AdityaSreevatsaK/Taiyous-Novels`, Hugging Face Dataset. Never commit dataset contents, ZIPs, EPUBs, tokens or local user notes to GitHub.
- **Authentication:** Hugging Face OAuth via Cloudflare Pages Functions, requiring the one-time encrypted Cloudflare Secret `HF_OAUTH_SESSION_KEY`. Existing manually entered fine-grained HF tokens remain an optional fallback.
- **CI:** `.github/workflows/verify.yml` runs tests, builds, compiles Pages Functions, audits dependencies, checks package privacy and performs browser smoke tests.

## Releasing

1. Make and review changes on `master`; confirm the **Verify novel reader** workflow succeeded for the exact intended commit.
2. Configure `HF_OAUTH_SESSION_KEY` in **Cloudflare Pages → Settings → Variables and Secrets → Production** before the first OAuth release. Generate a new 64-character hexadecimal key locally and store it as a **Secret**, not a GitHub repository variable or a chat message.
3. Trigger `Build and optionally deploy standalone PWA` with **Publish** enabled from `master`. This workflow validates the app and deploys both the static build and Cloudflare Pages Functions. No automatic production deployment is triggered by a normal push.
4. Verify that the OAuth client metadata is published and that Hugging Face sign-in, catalogue sync, notes/progress, EPUB downloads and offline reading work. Follow `docs/ACCESS_GATEWAY.md`.
5. Preserve the last working production commit for rollback. Do not delete the private Hugging Face Dataset.

No Cloudflare Zero Trust subscription, Access AUD, Supabase provider or additional hosting account is needed.
