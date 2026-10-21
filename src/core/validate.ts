import type { Policy, ReleasesDocument } from './types';
import { compareVersions, isComparableVersion } from './version';

export type ValidationResult<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

const APPLY_MODES = ['nextLaunch', 'prompt', 'immediate'];
const RELEASE_KINDS = ['fix', 'content', 'feature'];
const PLATFORMS = ['ios', 'android'];

const PLATFORM_KEYS = [
  'latest',
  'minimum',
  'recommendAfterDays',
  'requireAfterDays',
  'rollout',
  'ota',
  'message',
  'storeUrl',
];
const IOS_KEYS = [...PLATFORM_KEYS, 'appStoreId', 'country'];

class Collector {
  errors: string[] = [];
  warnings: string[] = [];
  error(path: string, msg: string) {
    this.errors.push(`${path}: ${msg}`);
  }
  warn(path: string, msg: string) {
    this.warnings.push(`${path}: ${msg}`);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
}

function unknownKeys(c: Collector, path: string, obj: Record<string, unknown>, known: string[]) {
  for (const key of Object.keys(obj)) {
    // `$schema` is allowed so editors can pick up the published JSON Schema.
    if (!known.includes(key) && key !== '$schema') c.warn(`${path}.${key}`, 'unknown key, ignored');
  }
}

function checkString(c: Collector, path: string, v: unknown, required = false) {
  if (v === undefined && !required) return;
  if (typeof v !== 'string' || v.length === 0) c.error(path, 'must be a non-empty string');
}

function checkDays(c: Collector, path: string, v: unknown) {
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    c.error(path, 'must be a non-negative number or null');
  }
}

function checkVersionRef(c: Collector, path: string, v: unknown): boolean {
  if (v === undefined) return false;
  if (!isObject(v)) {
    c.error(path, 'must be an object like { "version": "3.4.0", "build": 340 }');
    return false;
  }
  unknownKeys(c, path, v, ['version', 'build', 'releasedAt']);
  const before = c.errors.length;
  if (typeof v.version !== 'string' || !isComparableVersion(v.version)) {
    c.error(`${path}.version`, 'must be a version string like "3.4.0"');
  }
  if (!isComparableVersion(v.build)) {
    c.error(`${path}.build`, 'must be a non-negative integer or a dotted numeric string');
  }
  if (v.releasedAt !== undefined && !isIsoDate(v.releasedAt)) {
    c.error(`${path}.releasedAt`, 'must be an ISO date like "2026-10-21"');
  }
  return c.errors.length === before;
}

function checkPlatform(c: Collector, path: string, p: unknown, ios: boolean) {
  if (p === undefined) return;
  if (!isObject(p)) {
    c.error(path, 'must be an object');
    return;
  }
  unknownKeys(c, path, p, ios ? IOS_KEYS : PLATFORM_KEYS);

  const latestOk = checkVersionRef(c, `${path}.latest`, p.latest);
  const minimumOk = checkVersionRef(c, `${path}.minimum`, p.minimum);
  if (latestOk && minimumOk) {
    const latest = p.latest as { version: string; build: string | number };
    const minimum = p.minimum as { version: string; build: string | number };
    if (compareVersions(minimum.build, latest.build) > 0) {
      c.error(
        `${path}.minimum.build`,
        `${minimum.build} is above latest.build ${latest.build}; every install would be blocked with nothing to update to`
      );
    }
  }

  checkDays(c, `${path}.recommendAfterDays`, p.recommendAfterDays);
  checkDays(c, `${path}.requireAfterDays`, p.requireAfterDays);
  if (
    typeof p.recommendAfterDays === 'number' &&
    typeof p.requireAfterDays === 'number' &&
    p.requireAfterDays < p.recommendAfterDays
  ) {
    c.warn(
      `${path}.requireAfterDays`,
      'is below recommendAfterDays; users skip the recommendation'
    );
  }

  if (p.rollout !== undefined) {
    if (typeof p.rollout !== 'number' || p.rollout < 0 || p.rollout > 100) {
      c.error(`${path}.rollout`, 'must be a number from 0 to 100');
    }
  }

  if (p.ota !== undefined) {
    if (!isObject(p.ota)) {
      c.error(`${path}.ota`, 'must be an object');
    } else {
      unknownKeys(c, `${path}.ota`, p.ota, [
        'latestRuntimeVersion',
        'applyMode',
        'strandedRequireAfterDays',
      ]);
      checkString(c, `${path}.ota.latestRuntimeVersion`, p.ota.latestRuntimeVersion);
      if (p.ota.applyMode !== undefined && !APPLY_MODES.includes(p.ota.applyMode as string)) {
        c.error(`${path}.ota.applyMode`, `must be one of ${APPLY_MODES.join(', ')}`);
      }
      checkDays(c, `${path}.ota.strandedRequireAfterDays`, p.ota.strandedRequireAfterDays);
    }
  }

  if (p.message !== undefined) {
    if (!isObject(p.message)) {
      c.error(`${path}.message`, 'must be an object');
    } else {
      unknownKeys(c, `${path}.message`, p.message, ['title', 'body', 'releaseNotesUrl']);
      checkString(c, `${path}.message.title`, p.message.title);
      checkString(c, `${path}.message.body`, p.message.body);
      checkString(c, `${path}.message.releaseNotesUrl`, p.message.releaseNotesUrl);
    }
  }

  checkString(c, `${path}.storeUrl`, p.storeUrl);

  if (ios) {
    if (
      p.appStoreId !== undefined &&
      !(typeof p.appStoreId === 'string' && /^\d+$/.test(p.appStoreId))
    ) {
      c.error(
        `${path}.appStoreId`,
        'must be the numeric App Store id as a string, e.g. "1234567890"'
      );
    }
    if (
      p.country !== undefined &&
      !(typeof p.country === 'string' && /^[a-zA-Z]{2}$/.test(p.country))
    ) {
      c.error(`${path}.country`, 'must be a two-letter country code');
    }
  }
}

/** Validates a parsed `policy.json`. Never throws. */
export function validatePolicy(input: unknown): ValidationResult<Policy> {
  const c = new Collector();
  if (!isObject(input)) {
    c.error('policy', 'must be a JSON object');
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }
  if (input.schemaVersion !== 1) {
    c.error('policy.schemaVersion', `must be 1 (got ${JSON.stringify(input.schemaVersion)})`);
  }
  unknownKeys(c, 'policy', input, ['schemaVersion', 'android', 'ios']);
  checkPlatform(c, 'policy.android', input.android, false);
  checkPlatform(c, 'policy.ios', input.ios, true);

  if (c.errors.length > 0) return { ok: false, errors: c.errors, warnings: c.warnings };
  return { ok: true, value: input as unknown as Policy, warnings: c.warnings };
}

/** Validates a parsed `releases.json`. Never throws. */
export function validateReleases(input: unknown): ValidationResult<ReleasesDocument> {
  const c = new Collector();
  if (!isObject(input)) {
    c.error('releases', 'must be a JSON object');
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }
  if (input.schemaVersion !== 1) {
    c.error('releases.schemaVersion', `must be 1 (got ${JSON.stringify(input.schemaVersion)})`);
  }
  unknownKeys(c, 'releases', input, ['schemaVersion', 'releases']);
  if (!Array.isArray(input.releases)) {
    c.error('releases.releases', 'must be an array');
    return { ok: false, errors: c.errors, warnings: c.warnings };
  }

  const seen = new Set<string>();
  input.releases.forEach((r: unknown, i: number) => {
    const path = `releases.releases[${i}]`;
    if (!isObject(r)) {
      c.error(path, 'must be an object');
      return;
    }
    unknownKeys(c, path, r, [
      'id',
      'platforms',
      'runtimeVersion',
      'kind',
      'notes',
      'publishedAt',
      'bundleHash',
    ]);
    checkString(c, `${path}.id`, r.id, true);
    if (
      !Array.isArray(r.platforms) ||
      r.platforms.length === 0 ||
      !r.platforms.every((p) => PLATFORMS.includes(p as string))
    ) {
      c.error(`${path}.platforms`, 'must be a non-empty array of "ios" | "android"');
    }
    checkString(c, `${path}.runtimeVersion`, r.runtimeVersion, true);
    if (!RELEASE_KINDS.includes(r.kind as string)) {
      c.error(`${path}.kind`, `must be one of ${RELEASE_KINDS.join(', ')}`);
    }
    checkString(c, `${path}.notes`, r.notes, true);
    if (!isIsoDate(r.publishedAt)) c.error(`${path}.publishedAt`, 'must be an ISO timestamp');
    if (
      r.bundleHash !== undefined &&
      !(typeof r.bundleHash === 'string' && /^sha256-.+/.test(r.bundleHash))
    ) {
      c.error(`${path}.bundleHash`, 'must look like "sha256-…"');
    }
    if (typeof r.id === 'string') {
      if (seen.has(r.id)) c.error(`${path}.id`, `duplicate id "${r.id}"`);
      seen.add(r.id);
    }
  });

  if (c.errors.length > 0) return { ok: false, errors: c.errors, warnings: c.warnings };
  return { ok: true, value: input as unknown as ReleasesDocument, warnings: c.warnings };
}
