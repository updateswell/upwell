import type { AppStoreInfo } from '@upwell/core';

export interface AppStoreLookupOptions {
  bundleId: string;
  /** Looks up by id instead of bundle id when set (more reliable for renamed apps). */
  appStoreId?: string | null;
  /** Two-letter storefront. Region-restricted apps are only found in their storefront. */
  country?: string | null;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: number;
}

interface LookupResult {
  version?: string;
  currentVersionReleaseDate?: string;
  minimumOsVersion?: string;
  trackId?: number;
  trackViewUrl?: string;
}

export function appStoreLookupUrl(opts: AppStoreLookupOptions): string {
  const params = [
    opts.appStoreId
      ? `id=${encodeURIComponent(opts.appStoreId)}`
      : `bundleId=${encodeURIComponent(opts.bundleId)}`,
  ];
  if (opts.country) params.push(`country=${encodeURIComponent(opts.country.toLowerCase())}`);
  // The lookup API sits behind a CDN; a unique query string skips stale cached answers.
  params.push(`_=${opts.now ?? Date.now()}`);
  return `https://itunes.apple.com/lookup?${params.join('&')}`;
}

/**
 * iTunes lookup for the newest App Store version. The result can lag a release by hours, so it
 * only confirms what the policy says; the policy stays the source of truth.
 */
export async function lookupAppStore(opts: AppStoreLookupOptions): Promise<AppStoreInfo | null> {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await doFetch(appStoreLookupUrl(opts), {
      headers: { 'Cache-Control': 'no-cache' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`App Store lookup failed: HTTP ${res.status}`);
    const json = (await res.json()) as { resultCount?: number; results?: LookupResult[] };
    const r = json.results?.[0];
    if (!r) return null;
    return {
      kind: 'appStore',
      version: r.version ?? null,
      releaseDate: r.currentVersionReleaseDate ?? null,
      minimumOsVersion: r.minimumOsVersion ?? null,
      trackId: r.trackId ?? null,
      trackViewUrl: r.trackViewUrl ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}
