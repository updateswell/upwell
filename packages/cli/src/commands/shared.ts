import { compareVersions, isComparableVersion, type Platform, type VersionRef } from '@upwell/core';

import { usage } from '../errors';

export const PLATFORMS: Platform[] = ['android', 'ios'];

export const POLICY_SCHEMA_URL = 'https://upwell.run/schemas/policy.schema.json';
export const RELEASES_SCHEMA_URL = 'https://upwell.run/schemas/releases.schema.json';

/** Build numbers stay numbers when they are plain integers, like hand-written policies. */
export function parseBuild(value: string): number | string {
  if (/^\d+$/.test(value)) return Number(value);
  if (/^\d+(\.\d+)+$/.test(value)) return value;
  throw usage(`--build must be an integer or a dotted number like 1.2 (got "${value}")`);
}

export function parseVersion(value: string, flag = '--version'): string {
  if (!isComparableVersion(value)) {
    throw usage(`${flag} must be a version like 3.4.0 (got "${value}")`);
  }
  return value;
}

/** An ISO date, or `today` / `now`. */
export function parseDate(value: string, now: number, flag: string): string {
  if (value === 'today') return new Date(now).toISOString().slice(0, 10);
  if (value === 'now') return new Date(now).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(Date.parse(value))) {
    throw usage(`${flag} must be an ISO date like 2026-10-21, "today" or "now" (got "${value}")`);
  }
  return value;
}

export function parseNonNegativeInt(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) throw usage(`${flag} must be a non-negative integer (got "${value}")`);
  return Number(value);
}

export function parsePlatforms(value: string | undefined): Platform[] | undefined {
  if (value === undefined) return undefined;
  const list = value.split(',').map((p) => p.trim());
  for (const p of list) {
    if (!PLATFORMS.includes(p as Platform)) {
      throw usage(`--platform must be android, ios or both comma-separated (got "${value}")`);
    }
  }
  return [...new Set(list)] as Platform[];
}

/** The engine's ordering: Android by build, iOS by version then build. */
export function compareRefs(platform: Platform, a: VersionRef, b: VersionRef): -1 | 0 | 1 {
  if (platform === 'android') return compareVersions(a.build, b.build);
  const byVersion = compareVersions(a.version, b.version);
  return byVersion !== 0 ? byVersion : compareVersions(a.build, b.build);
}

export function describeRef(platform: Platform, ref: VersionRef): string {
  return platform === 'android'
    ? `build ${ref.build} (${ref.version})`
    : `${ref.version} (build ${ref.build})`;
}

export function isVersionRef(v: unknown): v is VersionRef {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isComparableVersion(r.version) &&
    (typeof r.build === 'number' || typeof r.build === 'string') &&
    isComparableVersion(r.build)
  );
}
