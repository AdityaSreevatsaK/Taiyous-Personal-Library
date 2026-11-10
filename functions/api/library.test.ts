import { describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { isAllowedDatasetPath, onRequest } from './library';

const url = 'https://taiyous-personal-library.pages.dev/api/library?action=session';
const baseEnv = {
  HF_DATASET_TOKEN: 'hf_abcdefghijklmnop',
  HF_DATASET_REPO: 'Example/Taiyous-Novels',
  CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD: 'a'.repeat(64),
  CF_ACCESS_ALLOWED_EMAIL: 'owner@example.com',
};

describe('private Cloudflare Access gateway safeguards', () => {
  it('only permits known book files, progress, collections and catalogue', () => {
    for (const path of [
      'data/library.json', 'data/personal/collections.json',
      'data/personal/reviews/' + 'a'.repeat(24) + '.json',
      'data/personal/progress/' + 'a'.repeat(24) + '.json',
      'data/novels/' + 'b'.repeat(24) + '/source.epub',
      'data/novels/' + 'b'.repeat(24) + '/original.zip',
    ]) expect(isAllowedDatasetPath(path)).toBe(true);
    for (const path of [
      '../.env', 'data/../secrets.json', 'data/personal/other.json',
      'data/novels/not-an-id/source.epub', 'data/library.json?token=x',
      'data/novels/' + 'b'.repeat(24) + '/arbitrary.txt',
    ]) expect(isAllowedDatasetPath(path)).toBe(false);
  });

  it('blocks preview hostnames before looking at credentials', async () => {
    const response = await onRequest({
      request: new Request(url.replace('https://taiyous-', 'https://dev.taiyous-')),
      env: baseEnv,
    });
    expect(response.status).toBe(403);
  });

  it('fails closed when critical bindings are missing', async () => {
    const response = await onRequest({ request: new Request(url), env: {} });
    expect(response.status).toBe(503);
  });

  it('denies unauthenticated requests even with a configured server secret', async () => {
    const response = await onRequest({ request: new Request(url), env: baseEnv });
    expect(response.status).toBe(403);
    expect((await response.text())).not.toContain(baseEnv.HF_DATASET_TOKEN);
  });

  it('does not trust unsigned client-controlled Access headers', async () => {
    const response = await onRequest({
      request: new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': 'invalid.jwt.value' } }),
      env: baseEnv,
    });
    expect(response.status).toBe(403);
  });

  it('accepts only an RS256 JWT for the correct Access audience and owner', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const key = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
    const requests: string[] = [];
    const handler = vi.fn(async (input: RequestInfo | URL) => {
      const href = input instanceof Request ? input.url : String(input);
      requests.push(href);
      if (href.endsWith('/cdn-cgi/access/certs')) {
        return new Response(JSON.stringify({ keys: [key] }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (href === 'https://huggingface.co/api/datasets/Example/Taiyous-Novels') {
        return new Response(JSON.stringify({ private: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('Unexpected external request: ' + href);
    });
    vi.stubGlobal('fetch', handler);
    try {
      const makeJwt = (email: string, aud = baseEnv.CF_ACCESS_AUD) =>
        new SignJWT({ email, type: 'app' })
          .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
          .setIssuer(baseEnv.CF_ACCESS_TEAM_DOMAIN)
          .setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      const valid = await makeJwt(baseEnv.CF_ACCESS_ALLOWED_EMAIL);
      const success = await onRequest({
        request: new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': valid } }),
        env: baseEnv,
      });
      expect(success.status).toBe(200);
      expect(await success.json()).toEqual({ connected: true, repo: baseEnv.HF_DATASET_REPO });
      const wrongEmail = await onRequest({
        request: new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': await makeJwt('stranger@example.com') } }),
        env: baseEnv,
      });
      expect(wrongEmail.status).toBe(403);
      const wrongAudience = await onRequest({
        request: new Request(url, { headers: { 'Cf-Access-Jwt-Assertion': await makeJwt(baseEnv.CF_ACCESS_ALLOWED_EMAIL, 'b'.repeat(64)) } }),
        env: baseEnv,
      });
      expect(wrongAudience.status).toBe(403);
      expect(requests.some(value => value.includes('hf_abcdefghijklmnop'))).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
