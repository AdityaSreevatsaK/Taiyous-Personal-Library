/**
 * Short-lived Owner mode for destructive operations.
 *
 * Security boundaries: production-only, valid Hugging Face owner OAuth session,
 * independently configured Cloudflare Secret, strict same-origin POST and an
 * encrypted HttpOnly SameSite=Strict owner cookie tied to the current HF token.
 * This does not pretend to protect against someone who can edit their own
 * browser IndexedDB or Cloudflare account; it prevents accidental app deletion.
 */
import {
  authorise, attachRenewal, configured, expireCookie, privateHeaders,
  productionOnly, secureResponse, seal, unseal, type Bindings,
  type OAuthSession,
} from '../_lib/oauth';

interface OwnerEnv extends Bindings { TAIYOU_OWNER_PASSPHRASE?: string }
interface PagesContext { request: Request; env: OwnerEnv }
interface OwnerGrant { version: 1; username: string; fingerprint: string; expires: number }
const OWNER_COOKIE = '__Host-taiyou_owner';
const OWNER_AAD = 'taiyou-library:owner-grant:v1';
const OWNER_LIFETIME_SECONDS = 10 * 60;
const encoder = new TextEncoder();

function ownerConfigured(env: OwnerEnv): boolean {
  return typeof env.TAIYOU_OWNER_PASSPHRASE === 'string'
    && env.TAIYOU_OWNER_PASSPHRASE.length >= 16
    && env.TAIYOU_OWNER_PASSPHRASE.length <= 128;
}

function reject(status: number, error: string): Response {
  return secureResponse({ error }, status);
}

function readCookie(request: Request, name: string): string {
  return (request.headers.get('Cookie') || '').split(';')
    .map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1) || '';
}

async function fingerprint(session: OAuthSession): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(session.access)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authenticatedOwner(request: Request, env: OwnerEnv, session: OAuthSession): Promise<OwnerGrant | null> {
  const grant = await unseal<OwnerGrant>(readCookie(request, OWNER_COOKIE), env, OWNER_AAD);
  if (!grant || grant.version !== 1 || grant.username !== session.username ||
      typeof grant.expires !== 'number' || grant.expires <= Date.now() ||
      grant.expires > Date.now() + OWNER_LIFETIME_SECONDS * 1000) return null;
  return grant.fingerprint === await fingerprint(session) ? grant : null;
}

/** Digest both strings before comparing so input length is not a timing oracle. */
async function matchesPassphrase(supplied: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all(
    [supplied, expected].map(text => crypto.subtle.digest('SHA-256', encoder.encode(text)))
  );
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function ownerCookie(value: string, age: number): string {
  return OWNER_COOKIE + '=' + value +
    '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + Math.max(0, age);
}

function sameOriginPost(request: Request): boolean {
  const url = new URL(request.url);
  return request.headers.get('Origin') === url.origin
    && request.headers.get('X-Taiyou-Request') === 'owner-mode';
}

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  if (!productionOnly(request)) return reject(403, 'Owner access is restricted to the production site');
  if (!configured(env)) return reject(503, 'Hugging Face session encryption is not configured');
  const auth = await authorise(request, env);
  if (!auth) return reject(401, 'Sign in with your Hugging Face owner account first');
  const respond = (response: Response) => attachRenewal(response, auth);
  const action = new URL(request.url).searchParams.get('action');

  if (request.method === 'GET' && action === 'status') {
    const ready = ownerConfigured(env);
    const grant = ready ? await authenticatedOwner(request, env, auth.session) : null;
    return respond(secureResponse({
      configured: ready, unlocked: Boolean(grant), expiresAt: grant?.expires || null,
    }));
  }
  if (request.method !== 'POST' || !sameOriginPost(request)) {
    return respond(reject(403, 'Same-origin owner action required'));
  }
  if (action === 'lock') {
    const result = secureResponse({ unlocked: false });
    result.headers.append('Set-Cookie', expireCookie(OWNER_COOKIE));
    return respond(result);
  }
  if (!ownerConfigured(env)) {
    return respond(reject(503, 'Owner mode is locked until TAIYOU_OWNER_PASSPHRASE is added as a Cloudflare Production Secret'));
  }
  if (action === 'verify') {
    const grant = await authenticatedOwner(request, env, auth.session);
    return respond(grant ? secureResponse({ unlocked: true, expiresAt: grant.expires })
      : reject(403, 'Owner mode is locked or has expired'));
  }
  if (action === 'unlock') {
    const length = Number(request.headers.get('Content-Length') || 0);
    if (!request.headers.get('Content-Type')?.startsWith('application/json') || length > 1024) {
      return respond(reject(400, 'Expected a small JSON owner unlock request'));
    }
    let supplied = '';
    try {
      const body = await request.json() as { passphrase?: unknown };
      if (typeof body.passphrase !== 'string' || body.passphrase.length > 256) {
        return respond(reject(400, 'Invalid owner passphrase'));
      }
      supplied = body.passphrase;
    } catch { return respond(reject(400, 'Invalid JSON')); }
    if (!(await matchesPassphrase(supplied, env.TAIYOU_OWNER_PASSPHRASE!))) {
      return respond(reject(403, 'Incorrect owner passphrase'));
    }
    const grant: OwnerGrant = {
      version: 1, username: auth.session.username,
      fingerprint: await fingerprint(auth.session),
      expires: Date.now() + OWNER_LIFETIME_SECONDS * 1000,
    };
    const result = secureResponse({ unlocked: true, expiresAt: grant.expires });
    result.headers.append('Set-Cookie',
      ownerCookie(await seal(grant, env, OWNER_AAD), OWNER_LIFETIME_SECONDS));
    return respond(result);
  }
  return respond(reject(404, 'Unknown owner access action'));
}
