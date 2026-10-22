/** 32-bit FNV-1a over UTF-16 code units. Deterministic on every JS engine. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Stable 0–99 bucket for an install and a target build. Including the build means each release
 * rolls out to a different slice of users instead of always hitting the same early cohort.
 */
export function rolloutBucket(installationId: string, build: string | number): number {
  return fnv1a(`${installationId}:${build}`) % 100;
}

/** `rollout` is a percentage; 100 (or undefined) means everyone. */
export function isInRollout(
  installationId: string,
  build: string | number,
  rollout: number | undefined
): boolean {
  const pct = rollout ?? 100;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return rolloutBucket(installationId, build) < pct;
}
