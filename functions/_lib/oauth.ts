/** Server-only Hugging Face OAuth session helpers. No bearer token reaches React. */
export const PUBLIC_ORIGIN = 'https://taiyous-personal-library.pages.dev';
export const DATASET_REPO = 'AdityaSreevatsaK/Taiyous-Novels';
export const CLIENT_ID = PUBLIC_ORIGIN + '/oauth-client.json';
export const REDIRECT_URI = PUBLIC_ORIGIN + '/api/oauth/callback';
export const OAUTH_SCOPE = 'profile read-repos write-repos';
export const SESSION_COOKIE = '__Host-taiyou_session';
export const FLOW_COOKIE = '__Host-taiyou_oauth_flow';
const AUTH_BASE = 'https://huggingface.co';
const SESSION_AAD = 'taiyou-library:session:v1';
const FLOW_AAD = 'taiyou-library:flow:v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Bindings { HF_OAUTH_SESSION_KEY?: string }
export interface OAuthSession {
  access: string;
  refresh?: string;
  username: string;
  expires: number; // Unix milliseconds
}
export interface OAuthFlow { state: string; verifier: string; expires: number }
export interface AuthorisedSession { session: OAuthSession; renewal?: string }
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}
export const privateHeaders = {
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function b64url(input: Uint8Array): string {
  let binary = '';
  for (const value of input) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(input: string): Uint8Array {
  if (!/^[\w-]{1,6000}$/.test(input)) throw new Error('Invalid cookie');
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function keyBytes(env: Bindings): Uint8Array | null {
  const hex = env.HF_OAUTH_SESSION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return null;
  return Uint8Array.from({ length: 32 }, (_, i) => Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16));
}
export function configured(env: Bindings): boolean { return !!keyBytes(env); }
async function getKey(env: Bindings): Promise<CryptoKey> {
  const bytes = keyBytes(env);
  if (!bytes) throw new Error('Missing HF_OAUTH_SESSION_KEY');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export function randomUrlSafe(length = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(length)));
}
export async function challenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}
export async function seal(value: unknown, env: Bindings, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: encoder.encode(aad),
  }, await getKey(env), encoder.encode(JSON.stringify(value))));
  const payload = new Uint8Array(iv.length + encrypted.length);
  payload.set(iv);
  payload.set(encrypted, iv.length);
  return b64url(payload);
}
export async function unseal<T>(text: string, env: Bindings, aad: string): Promise<T | null> {
  try {
    const payload = fromB64url(text);
    if (payload.length <= 28) return null;
    const plain = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: payload.slice(0, 12), additionalData: encoder.encode(aad),
    }, await getKey(env), payload.slice(12));
    return JSON.parse(decoder.decode(plain)) as T;
  } catch { return null; }
}
function readCookie(request: Request, name: string): string {
  const raw = request.headers.get('Cookie') || '';
  return raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function cookie(name: string, value: string, maxAge: number): string {
  return name + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + Math.max(0, Math.trunc(maxAge));
}
export function expireCookie(name: string): string { return cookie(name, '', 0); }
export async function flowCookie(flow: OAuthFlow, env: Bindings): Promise<string> {
  return cookie(FLOW_COOKIE, await seal(flow, env, FLOW_AAD), 600);
}
export async function readFlow(request: Request, env: Bindings): Promise<OAuthFlow | null> {
  const flow = await unseal<OAuthFlow>(readCookie(request, FLOW_COOKIE), env, FLOW_AAD);
  if (!flow || typeof flow.state !== 'string' || typeof flow.verifier !== 'string' ||
      flow.state.length < 32 || flow.verifier.length < 40 || flow.expires <= Date.now()) return null;
  return flow;
}
export async function sessionCookie(session: OAuthSession, env: Bindings): Promise<string> {
  // A stored refresh token, when issued, allows a longer-lived opaque session.
  const seconds = session.refresh ? 30 * 86400 : Math.max(1, Math.ceil((session.expires - Date.now()) / 1000));
  return cookie(SESSION_COOKIE, await seal(session, env, SESSION_AAD), seconds);
}
export async function readSession(request: Request, env: Bindings): Promise<OAuthSession | null> {
  const session = await unseal<OAuthSession>(readCookie(request, SESSION_COOKIE), env, SESSION_AAD);
  if (!session || typeof session.access !== 'string' || !session.access.startsWith('hf_') ||
      typeof session.username !== 'string' || session.username.toLowerCase() !== DATASET_REPO.split('/')[0].toLowerCase() ||
      !Number.isFinite(session.expires) || typeof session.expires !== 'number') return null;
  return session;
}
export async function hfWhoAmI(access: string): Promise<string | null> {
  try {
    const response = await fetch(AUTH_BASE + '/api/whoami-v2', {
      headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as { name?: string };
    return typeof data.name === 'string' ? data.name : null;
  } catch { return null; }
}
export function ownerMatches(username: string | null): boolean {
  return !!username && username.toLowerCase() === DATASET_REPO.split('/')[0].toLowerCase();
}
export async function isPrivateDataset(access: string): Promise<boolean> {
  try {
    const response = await fetch(AUTH_BASE + '/api/datasets/' + DATASET_REPO, {
      headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
    });
    if (!response.ok) return false;
    return (await response.json() as { private?: boolean }).private === true;
  } catch { return false; }
}
export async function requestToken(params: Record<string, string>): Promise<TokenResponse | null> {
  const response = await fetch(AUTH_BASE + '/oauth/token', {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!response.ok) return null;
  const result = await response.json() as Partial<TokenResponse>;
  if (typeof result.access_token !== 'string' || !result.access_token.startsWith('hf_') ||
      (result.expires_in !== undefined && (!Number.isFinite(result.expires_in) || result.expires_in < 1))) return null;
  return result as TokenResponse;
}
export function parseToken(token: TokenResponse, username: string, previousRefresh?: string): OAuthSession {
  return {
    access: token.access_token, username,
    expires: Date.now() + Math.min(30 * 86400, Number(token.expires_in ?? 28800)) * 1000,
    ...((token.refresh_token || previousRefresh) ? { refresh: token.refresh_token || previousRefresh } : {}),
  };
}
export async function authorise(request: Request, env: Bindings): Promise<AuthorisedSession | null> {
  if (!configured(env)) return null;
  const session = await readSession(request, env);
  if (!session) return null;
  if (session.expires > Date.now() + 60000) return { session };
  if (!session.refresh) return null;
  try {
    const token = await requestToken({
      grant_type: 'refresh_token', refresh_token: session.refresh,
      client_id: CLIENT_ID,
    });
    if (!token) return null;
    const username = await hfWhoAmI(token.access_token);
    if (!ownerMatches(username)) return null;
    const renewed = parseToken(token, username!, session.refresh);
    return { session: renewed, renewal: await sessionCookie(renewed, env) };
  } catch { return null; }
}
export function attachRenewal(response: Response, auth: AuthorisedSession): Response {
  if (auth.renewal) response.headers.append('Set-Cookie', auth.renewal);
  return response;
}
export function secureResponse(message: unknown, status = 200): Response {
  return new Response(JSON.stringify(message), {
    status, headers: { ...privateHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
export function productionOnly(request: Request): boolean {
  return new URL(request.url).origin === PUBLIC_ORIGIN;
}
