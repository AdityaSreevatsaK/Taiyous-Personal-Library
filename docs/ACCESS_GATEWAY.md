# Cloudflare Access automatic login — private Hugging Face gateway

Taiyou's Personal Library uses the existing **Cloudflare Access email OTP** application to authenticate the owner. The React client connects to a same-origin Cloudflare Pages Function at `/api/library`, which validates the signed Access JWT and checks the owner's allowed email on **every request**. The Function uses a **Cloudflare secret** for the private Hugging Face Dataset; the credential never goes to browser JavaScript.

## Deployment status

The implementation is committed to GitHub `master`. **It does not become operational until the five production bindings below are configured in Cloudflare Pages and the manual Cloudflare deployment completes.** The existing manual HF dataset connection is deliberately retained as a fallback until the gateway is proven.

## Set up the current Cloudflare Pages project

Do not paste credentials into GitHub source, ChatGPT, screenshots, build variables or a public site. Configure them **in your Cloudflare account**:

1. Open Cloudflare dashboard → **Workers & Pages** → `taiyous-personal-library` → **Settings → Variables and Secrets**.
2. Select the **Production** environment.
3. Add four **plain-text variables**:

   | Variable | Value |
   | --- | --- |
   | `HF_DATASET_REPO` | `AdityaSreevatsaK/Taiyous-Novels` |
   | `CF_ACCESS_TEAM_DOMAIN` | Your Cloudflare Zero Trust team URL, **including** `https://`, e.g. `https://your-team.cloudflareaccess.com` |
   | `CF_ACCESS_AUD` | The **64-character Application Audience (AUD) tag** of the Access application protecting `taiyous-personal-library.pages.dev` |
   | `CF_ACCESS_ALLOWED_EMAIL` | The single email address authorised to use this private library (the same one you use for email OTP) |

4. Add one **encrypted secret**, not a plain-text variable:
   `HF_DATASET_TOKEN` = a fine-grained Hugging Face token with **read and write access only** to the private `Taiyous-Novels` Dataset. It does not belong in GitHub Secrets or the browser. Consider generating a distinct token solely for this server-side gateway so you can revoke it independently.
5. Under **Settings → Functions**, set production **Compatibility Date** to `2026-11-10` and enable **`nodejs_compat`** if not already enabled. This is required by the HF file-upload SDK in the Pages Function. Do not alter the preview environment unnecessarily.
6. Confirm the existing **Cloudflare Access** application protects **`https://taiyous-personal-library.pages.dev`** (not only the obsolete `dev.` alias), with an **Allow** policy for just the intended identity. To find the AUD, go to Cloudflare Zero Trust → **Access controls → Applications** → Edit the existing application → **Additional settings → Application Audience (AUD) Tag**. To find the team domain, use your Zero Trust account's team name / login URL.
7. After saving the settings and secret, use [Build and optionally deploy standalone PWA](../.github/workflows/deploy-standalone.yml) on branch **`master`**, with **Publish** checked. The deployment job checks out `functions/` and bundles it together with the built React assets using Wrangler.

Cloudflare Pages production and preview variable bindings are separate. Configure **Production** only for the real app. If a production secret is changed, create a **new deployment** so the Function sees it.

## Expected operation

1. Open `https://taiyous-personal-library.pages.dev` online. Cloudflare Access asks for the email OTP if your Access session has expired.
2. The app requests `GET /api/library?action=session`, passing the existing Access cookie automatically. The Function validates the RSA-signed JWT against the trusted Cloudflare team JWKS, issuer, audience, expiry and the expected owner email.
3. The Function checks that the HF token reaches an explicitly **private** Dataset, then returns only the dataset repository ID and a connected flag. It never returns the HF token, email, JWT or private raw authorisation data.
4. The app automatically loads the catalogue, EPUBs, reading progress, ratings and collections through the same-origin gateway. Private file uploads use a validated multipart API; no HF token is visible to the client.
5. When offline, the app still opens its cached shell and downloaded EPUBs. Cloud sync resumes when online and authorised.

The gateway responds **403** if the identity is not verified, **503** when configuration is missing or the token cannot access a private dataset, and **400** for unsupported file paths. It refuses to operate on preview hostnames or unrelated datasets. Uploads have a per-request cap of **75 MiB** to protect Worker memory; large legacy archives can still be managed through your separate storage controller.

## Security and deployment checks

- Never expose `HF_DATASET_TOKEN` as a `VITE_` variable or as client-side JavaScript.
- A Cloudflare email OTP screen alone is not proof of API authorisation. Every API call validates the signed Access token and restricts the email.
- The API is restricted to the permanent production Pages hostname. Non-production aliases fail closed.
- File paths are allowlisted: catalogue, per-book EPUB/ZIP, private reviews/progress and collections only.
- Writes require a same-origin `Origin` and a custom request header; no cross-origin CORS policy is enabled.
- No-store responses prevent proxy caching of user data.
- The manual dataset token prompt is **not removed** until the new gateway has been tested online, after a browser restart, and on mobile. If the gateway is not configured, the old connection mechanism still functions.
- If the Access session expires while you are offline, offline EPUB reading continues to work; cloud operations require signing in again.

## Tests

CI runs React unit tests and offline browser smoke tests, plus server-function security tests for file-path restrictions and signed-JWT enforcement. Wrangler compiles the Cloudflare Function with Node compatibility. The live private dataset is **never accessed from CI**, and no real owner token is used in tests.
