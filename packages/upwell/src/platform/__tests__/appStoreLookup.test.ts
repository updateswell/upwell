import { jsonUrl } from '../../sources';
import { appStoreLookupUrl, lookupAppStore } from '../appStoreLookup';

function fakeFetch(body: unknown, status = 200) {
  return jest.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as jest.Mock & typeof fetch;
}

describe('App Store lookup', () => {
  it('builds a country-aware, cache-busting URL', () => {
    expect(appStoreLookupUrl({ bundleId: 'com.x.y', country: 'IN', now: 42 })).toBe(
      'https://itunes.apple.com/lookup?bundleId=com.x.y&country=in&_=42'
    );
    expect(appStoreLookupUrl({ bundleId: 'com.x.y', appStoreId: '123', now: 1 })).toBe(
      'https://itunes.apple.com/lookup?id=123&_=1'
    );
  });

  it('maps the first result', async () => {
    const f = fakeFetch({
      resultCount: 1,
      results: [
        {
          version: '3.4.0',
          currentVersionReleaseDate: '2026-10-18T07:00:00Z',
          minimumOsVersion: '16.0',
          trackId: 99,
          trackViewUrl: 'https://apps.apple.com/app/id99',
        },
      ],
    });
    await expect(lookupAppStore({ bundleId: 'com.x.y', fetch: f })).resolves.toEqual({
      kind: 'appStore',
      version: '3.4.0',
      releaseDate: '2026-10-18T07:00:00Z',
      minimumOsVersion: '16.0',
      trackId: 99,
      trackViewUrl: 'https://apps.apple.com/app/id99',
    });
  });

  it('returns null when the app is not in that storefront', async () => {
    await expect(
      lookupAppStore({ bundleId: 'x', fetch: fakeFetch({ resultCount: 0, results: [] }) })
    ).resolves.toBeNull();
  });

  it('throws on HTTP errors', async () => {
    await expect(lookupAppStore({ bundleId: 'x', fetch: fakeFetch({}, 503) })).rejects.toThrow(
      'HTTP 503'
    );
  });
});

describe('jsonUrl()', () => {
  it('fetches without the HTTP cache and passes headers', async () => {
    const f = fakeFetch({ schemaVersion: 1 });
    const source = jsonUrl('https://x.dev/policy.json', { fetch: f, headers: { 'X-Key': 'k' } });
    await expect(source.fetch(new AbortController().signal)).resolves.toEqual({ schemaVersion: 1 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://x.dev/policy.json');
    expect(init.headers).toMatchObject({ 'Cache-Control': 'no-cache', 'X-Key': 'k' });
  });

  it('can bust CDN caches', async () => {
    const f = fakeFetch({});
    await jsonUrl('https://x.dev/p.json?v=1', { fetch: f, cacheBust: true }).fetch(
      new AbortController().signal
    );
    expect(f.mock.calls[0][0]).toMatch(/^https:\/\/x\.dev\/p\.json\?v=1&_=\d+$/);
  });

  it('throws on HTTP errors', async () => {
    await expect(
      jsonUrl('https://x.dev/p.json', { fetch: fakeFetch({}, 404) }).fetch(
        new AbortController().signal
      )
    ).rejects.toThrow('HTTP 404 for https://x.dev/p.json');
  });
});
