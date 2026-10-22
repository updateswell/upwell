import type { Policy, ReleasesDocument } from '@upwell/core';

export interface Source<T> {
  fetch(signal: AbortSignal): Promise<T>;
}

/** Where the policy comes from. Results are always validated before use. */
export type PolicySource = Source<Policy>;
export type ReleasesSource = Source<ReleasesDocument>;

export interface JsonUrlOptions {
  headers?: Record<string, string>;
  /** Appends `?_=<timestamp>` to skip CDN caches. Off by default (breaks signed URLs). */
  cacheBust?: boolean;
  fetch?: typeof fetch;
}

/** Fetches JSON from a URL, bypassing the HTTP cache. */
export function jsonUrl<T>(url: string, options: JsonUrlOptions = {}): Source<T> {
  return {
    async fetch(signal) {
      const doFetch = options.fetch ?? fetch;
      const target = options.cacheBust
        ? `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`
        : url;
      const res = await doFetch(target, {
        signal,
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...options.headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    },
  };
}

/** A fixed value, e.g. a policy bundled with the app or a test fixture. */
export function staticSource<T>(value: T): Source<T> {
  return { fetch: async () => value };
}

export function toSource<T>(source: Source<T> | string): Source<T> {
  return typeof source === 'string' ? jsonUrl<T>(source) : source;
}
