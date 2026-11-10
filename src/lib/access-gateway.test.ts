import { describe, expect, it } from 'vitest';
import { isAllowedDatasetPath, onRequest } from '../../functions/api/library';

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
});
