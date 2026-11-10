# Hugging Face OAuth — free sign-in on Cloudflare Pages

Taiyou's Personal Library uses **Cloudflare Pages** for its React PWA and private API, and the **existing private Hugging Face Dataset** for novels and synced reading metadata. It does **not** use Cloudflare Zero Trust, Supabase, another hosting provider, or an HF dataset token entered on every launch.

## How it works

1. Click **Sign in with Hugging Face** in the library.
2. Cloudflare Pages redirects to Hugging Face's official OAuth authorisation page with an OAuth 2.0 **PKCE** challenge.
3. Hugging Face redirects back to `https://taiyous-personal-library.pages.dev/api/oauth/callback`. The backend verifies the encrypted state cookie, exchanges the code, checks the signed-in HF user is **AdityaSreevatsaK**, and confirms access to the **private** `AdityaSreevatsaK/Taiyous-Novels` dataset.
4. Cloudflare Pages encrypts the HF access token (and optional refresh token) into a **Secure, HttpOnly, SameSite=Lax** browser cookie. The cookie is not readable by frontend JavaScript.
5. On subsequent launches, `GET /api/library?action=session` reads the cookie and reconnects automatically. No token is placed in localStorage or the public JavaScript bundle.
6. A cookie is renewed on token refresh if the provider issues a refresh token. Otherwise the browser asks you to sign in with Hugging Face again when the access token expires. This avoids repeatedly pasting tokens, but is not a promise of permanent sessions.

All novel fetches, writes, EPUBs, personal reviews, progress and collections stay scoped to the one private HF dataset in the **backend**. Offline reading still uses the existing locally cached EPUBs without login or internet.

## What you must configure once

### 1. Cloudflare encryption secret (required)

Go to **Cloudflare → Workers & Pages → taiyous-personal-library → Settings → Variables and Secrets → Production**.

Create one **encrypted Secret**:

| Name | Value | Type |
| --- | --- | --- |
| `HF_OAUTH_SESSION_KEY` | Fresh, random 64-character hexadecimal value (32 bytes) | **Secret**, not Text |

Generate this value **privately on your Windows PC**, for example:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy the result directly into Cloudflare. **Never share the value in ChatGPT, commit it to GitHub, or store it in the public app.** This key encrypts your session cookie. Rotating it intentionally signs out all previously connected browser sessions.

### 2. Hugging Face OAuth application metadata (already in GitHub)

HF now supports **Client ID Metadata Documents (CIMD)** for OAuth registration without a client secret. This avoids creating another hosting service or buying a Cloudflare Zero Trust plan.

The project includes a public metadata document:

- **Client ID:** `https://taiyous-personal-library.pages.dev/oauth-client.json`
- **Redirect URI:** `https://taiyous-personal-library.pages.dev/api/oauth/callback`
- **Permissions:** `profile read-repos write-repos`
- **Client authentication:** `none` (public OAuth client using PKCE)

The page is a public, non-sensitive OAuth descriptor. It must be available over HTTPS before you try signing in. Cloudflare's static `_headers` sets `Content-Type: application/json`. This normal `.json` path avoids Cloudflare treating a hidden `/.well-known/` asset as an unknown SPA route.

**Important permission trade-off:** Hugging Face's `write-repos` OAuth scope covers your personal repositories broadly; OAuth cannot currently be limited to just the `Taiyous-Novels` dataset through these standard scopes. The **Cloudflare backend** restricts actual file actions to that one specific dataset and a strict file-path allowlist. If that OAuth permission breadth is unacceptable, continue using the fine-grained manual token fallback.

### 3. Deploy after the secret is saved

GitHub → [Build and optionally deploy standalone PWA](../.github/workflows/deploy-standalone.yml) → choose **`master`**, enable **Publish**, and run.

The workflow tests the app, builds the frontend and private Pages Functions, and deploys to the existing **Cloudflare Pages** project. No novel files or secrets enter GitHub CI.

No `CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_ALLOWED_EMAIL`, or `HF_DATASET_TOKEN` variables are needed for this OAuth implementation. Those belonged to the previous, un-deployed Cloudflare Access design. You can remove them after verifying OAuth, if you had already configured them.

## Test checklist

1. Open the permanent Pages URL while online. Confirm `/oauth-client.json` serves JSON and `/api/library?action=session` is denied before sign-in.
2. Click **Sign in with Hugging Face** and log in with the **Hugging Face account that owns the dataset**.
3. Approve `read-repos` and `write-repos` permissions if comfortable with them. Do not grant access from an unexpected user account.
4. After returning to the library, confirm Cloud library shows **Connected** and the private catalogue appears.
5. Reload the page and reopen the installed PWA. Confirm the cloud reconnects without entering a token.
6. Test reading a cloud-hosted novel, saving progress, rating/comment editing, collection edits and **Save offline**.
7. Disconnect/sign out. Confirm cloud operations need fresh login but cached EPUBs still read offline.
8. Test both desktop and phone. If the login redirect fails, keep the manual token fallback and report the OAuth error displayed in the library.

The live OAuth redirect cannot be fully simulated in GitHub CI because it requires consent from your real HF account; the tests simulate HF callbacks without using your real credentials.

## Security controls

- AES-GCM encryption uses a fresh random 96-bit IV and a dedicated 256-bit secret from Cloudflare.
- Cookies are Secure, HttpOnly, SameSite=Lax, site-wide and never readable by React.
- Login uses an encrypted short-lived state/PKCE verifier cookie and validates state on callback.
- The server authorises **only the dataset-owning HF username** and only the explicitly named dataset. It checks that the dataset is private.
- The API rejects unrecognised paths and remote preview hostnames, prevents cross-origin writes, and disables caching of private responses.
- The PWA's service worker bypasses `/api/` OAuth and dataset requests.
- The manual HF-token connection remains available as fallback until OAuth is verified.
- No browser XSS defence is perfect; limit extensions and imported EPUBs to trusted content.

## If OAuth metadata registration fails

HF support for public OAuth metadata documents is relatively recent. Its official docs support CIMD but this app's live registration must be tested after deployment. If the provider rejects the metadata URL as a client ID, a **manually registered public HF OAuth app (without a client secret)** is a fallback. That would involve registering the exact callback URL under Hugging Face account settings, **not** moving hosting or adding billing details. Do not guess a client ID or relax callback checks as a workaround.

Official references:
- https://huggingface.co/docs/hub/oauth
- https://huggingface.co/settings/connected-applications
