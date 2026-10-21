import type { Platform, Release, ReleasesDocument } from './types';

function byNewest(a: Release, b: Release): number {
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
}

/**
 * Finds the release entry for the running OTA update. `updateIds` holds every id the adapter
 * knows for the running update (update id, update group id), so either can be used in
 * `releases.json`.
 */
export function findRelease(
  doc: ReleasesDocument | null | undefined,
  query: { platform: Platform; updateIds: (string | null | undefined)[] }
): Release | null {
  if (!doc) return null;
  const ids = new Set(
    query.updateIds.filter((id): id is string => !!id).map((id) => id.toLowerCase())
  );
  if (ids.size === 0) return null;
  return (
    doc.releases.find((r) => r.platforms.includes(query.platform) && ids.has(r.id.toLowerCase())) ??
    null
  );
}

/** Releases for one runtime and platform, newest first. */
export function releaseHistory(
  doc: ReleasesDocument | null | undefined,
  query: { platform: Platform; runtimeVersion: string | null | undefined }
): Release[] {
  if (!doc || !query.runtimeVersion) return [];
  return doc.releases
    .filter(
      (r) => r.platforms.includes(query.platform) && r.runtimeVersion === query.runtimeVersion
    )
    .sort(byNewest);
}
