import {
  PUBLIC_ORIGIN, REDIRECT_URI, CLIENT_ID, OAUTH_SCOPE, FLOW_COOKIE, SESSION_COOKIE,
  configured, randomUrlSafe, challenge, flowCookie, readFlow, expireCookie, requestToken,
  hfWhoAmI, isPrivateDataset, ownerMatches, parseToken, sessionCookie, privateHeaders,
  productionOnly,
  type Bindings,
} from '../../_lib/oauth';

interface PagesContext { request: Request; env: Bindings }
const noCache = { ...privateHeaders, 'Content-Type': 'text/plain; charset=utf-8' };
function textError(message: string, status: number): Response {
  return new Response(message, { status, headers: noCache });
}
function redirect(url: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...privateHeaders, Location: url });
  for (const item of cookies) headers.append('Set-Cookie', item);
  return new Response(null, { status: 303, headers });
}
export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  if (!productionOnly(request)) return textError('Private login is production-only', 403);
  if (!configured(env)) return textError('OAuth cookie encryption key not configured', 503);
  const pathname = new URL(request.url).pathname;
  const action = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (action === 'login' && request.method === 'GET') {
    const state = randomUrlSafe();
    const verifier = randomUrlSafe(48);
    const auth = new URL('https://huggingface.co/oauth/authorize');
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('client_id', CLIENT_ID);
    auth.searchParams.set('redirect_uri', REDIRECT_URI);
    auth.searchParams.set('scope', OAUTH_SCOPE);
    auth.searchParams.set('state', state);
    auth.searchParams.set('code_challenge', await challenge(verifier));
    auth.searchParams.set('code_challenge_method', 'S256');
    const flow = await flowCookie({ state, verifier, expires: Date.now() + 10 * 60000 }, env);
    return redirect(auth.toString(), [flow]);
  }
  if (action === 'callback' && request.method === 'GET') {
    const url = new URL(request.url);
    const flow = await readFlow(request, env);
    const reset = [expireCookie(FLOW_COOKIE)];
    if (!flow || !url.searchParams.get('state') ||
        url.searchParams.get('state') !== flow.state ||
        !url.searchParams.get('code') || url.searchParams.has('error')) {
      return redirect(PUBLIC_ORIGIN + '/?oauth_error=invalid_callback', reset);
    }
    try {
      const result = await requestToken({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        code: url.searchParams.get('code')!,
        redirect_uri: REDIRECT_URI,
        code_verifier: flow.verifier,
      });
      if (!result) return redirect(PUBLIC_ORIGIN + '/?oauth_error=exchange_failed', reset);
      if (result.scope) {
        const granted = new Set(result.scope.split(/\s+/));
        if (!granted.has('read-repos') || !granted.has('write-repos')) {
          return redirect(PUBLIC_ORIGIN + '/?oauth_error=insufficient_scope', reset);
        }
      }
      const username = await hfWhoAmI(result.access_token);
      // Signing in with an unrelated HF account must never open another user's
      // library, even if that account has some other Hugging Face permissions.
      if (!ownerMatches(username)) {
        return redirect(PUBLIC_ORIGIN + '/?oauth_error=wrong_account', reset);
      }
      if (!(await isPrivateDataset(result.access_token))) {
        return redirect(PUBLIC_ORIGIN + '/?oauth_error=dataset_access', reset);
      }
      const session = parseToken(result, username!);
      return redirect(PUBLIC_ORIGIN + '/', [...reset, await sessionCookie(session, env)]);
    } catch {
      return redirect(PUBLIC_ORIGIN + '/?oauth_error=login_failed', reset);
    }
  }
  if (action === 'logout' && request.method === 'POST') {
    // SameSite=Lax prevents cross-site POST cookies; origin and custom header
    // additionally protect against forged sign-outs.
    if (request.headers.get('Origin') !== PUBLIC_ORIGIN ||
        request.headers.get('X-Taiyou-Request') !== 'logout') {
      return textError('Same-origin logout required', 403);
    }
    return redirect(PUBLIC_ORIGIN + '/', [expireCookie(SESSION_COOKIE), expireCookie(FLOW_COOKIE)]);
  }
  return textError('Unknown OAuth endpoint', 404);
}
