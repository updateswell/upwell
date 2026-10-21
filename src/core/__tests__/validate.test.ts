import { findRelease, releaseHistory } from '../releases';
import type { ReleasesDocument } from '../types';
import { validatePolicy, validateReleases } from '../validate';
import { policy } from './fixtures';

describe('validatePolicy()', () => {
  it('accepts the fixture policy', () => {
    const r = validatePolicy(policy());
    expect(r).toMatchObject({ ok: true, warnings: [] });
  });

  it('accepts a minimal policy and $schema', () => {
    expect(validatePolicy({ $schema: './policy.schema.json', schemaVersion: 1 }).ok).toBe(true);
  });

  it.each([
    [null, 'policy: must be a JSON object'],
    [[], 'policy: must be a JSON object'],
    [{ schemaVersion: 2 }, 'policy.schemaVersion: must be 1 (got 2)'],
    [{ schemaVersion: 1, android: 'x' }, 'policy.android: must be an object'],
    [
      { schemaVersion: 1, android: { latest: { version: 'abc', build: 1 } } },
      'policy.android.latest.version: must be a version string like "3.4.0"',
    ],
    [
      { schemaVersion: 1, android: { latest: { version: '1.0.0', build: -3 } } },
      'policy.android.latest.build: must be a non-negative integer or a dotted numeric string',
    ],
    [
      {
        schemaVersion: 1,
        android: { latest: { version: '1.0.0', build: 1, releasedAt: 'yesterday' } },
      },
      'policy.android.latest.releasedAt: must be an ISO date like "2026-10-21"',
    ],
    [
      { schemaVersion: 1, android: { rollout: 150 } },
      'policy.android.rollout: must be a number from 0 to 100',
    ],
    [
      { schemaVersion: 1, android: { recommendAfterDays: -1 } },
      'policy.android.recommendAfterDays: must be a non-negative number or null',
    ],
    [
      { schemaVersion: 1, android: { ota: { applyMode: 'later' } } },
      'policy.android.ota.applyMode: must be one of nextLaunch, prompt, immediate',
    ],
    [
      { schemaVersion: 1, android: { message: { title: '' } } },
      'policy.android.message.title: must be a non-empty string',
    ],
    [
      { schemaVersion: 1, ios: { appStoreId: 1234 } },
      'policy.ios.appStoreId: must be the numeric App Store id as a string, e.g. "1234567890"',
    ],
    [
      { schemaVersion: 1, ios: { country: 'usa' } },
      'policy.ios.country: must be a two-letter country code',
    ],
    [
      {
        schemaVersion: 1,
        android: {
          latest: { version: '1.0.0', build: 100 },
          minimum: { version: '2.0.0', build: 200 },
        },
      },
      'policy.android.minimum.build: 200 is above latest.build 100; every install would be blocked with nothing to update to',
    ],
  ])('rejects %j', (value, error) => {
    const r = validatePolicy(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain(error);
  });

  it('warns about unknown keys instead of failing (forward compatible)', () => {
    const r = validatePolicy({ schemaVersion: 1, android: { latset: {} }, web: {} });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([
      'policy.web: unknown key, ignored',
      'policy.android.latset: unknown key, ignored',
    ]);
  });

  it('warns when requireAfterDays < recommendAfterDays', () => {
    const r = validatePolicy({
      schemaVersion: 1,
      ios: { recommendAfterDays: 5, requireAfterDays: 2 },
    });
    expect(r.warnings).toContain(
      'policy.ios.requireAfterDays: is below recommendAfterDays; users skip the recommendation'
    );
  });

  it('allows null days', () => {
    expect(
      validatePolicy({
        schemaVersion: 1,
        android: { requireAfterDays: null, ota: { strandedRequireAfterDays: null } },
      }).ok
    ).toBe(true);
  });
});

const releases: ReleasesDocument = {
  schemaVersion: 1,
  releases: [
    {
      id: 'g-1',
      platforms: ['ios', 'android'],
      runtimeVersion: '3.4.0',
      kind: 'fix',
      notes: 'Fixed checkout crash',
      publishedAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'g-2',
      platforms: ['android'],
      runtimeVersion: '3.4.0',
      kind: 'content',
      notes: 'New banners',
      publishedAt: '2026-10-21T10:00:00Z',
    },
    {
      id: 'g-0',
      platforms: ['ios', 'android'],
      runtimeVersion: '3.3.0',
      kind: 'fix',
      notes: 'Old fix',
      publishedAt: '2026-10-01T10:00:00Z',
      bundleHash: 'sha256-abc',
    },
  ],
};

describe('validateReleases()', () => {
  it('accepts a valid document', () => {
    expect(validateReleases(releases)).toMatchObject({ ok: true });
  });

  it.each([
    [{ schemaVersion: 1 }, 'releases.releases: must be an array'],
    [
      { schemaVersion: 1, releases: [{ ...releases.releases[0], kind: 'secret' }] },
      'releases.releases[0].kind: must be one of fix, content, feature',
    ],
    [
      { schemaVersion: 1, releases: [{ ...releases.releases[0], platforms: [] }] },
      'releases.releases[0].platforms: must be a non-empty array of "ios" | "android"',
    ],
    [
      { schemaVersion: 1, releases: [{ ...releases.releases[0], notes: '' }] },
      'releases.releases[0].notes: must be a non-empty string',
    ],
    [
      { schemaVersion: 1, releases: [{ ...releases.releases[0], publishedAt: 'now' }] },
      'releases.releases[0].publishedAt: must be an ISO timestamp',
    ],
    [
      { schemaVersion: 1, releases: [{ ...releases.releases[0], bundleHash: 'md5-x' }] },
      'releases.releases[0].bundleHash: must look like "sha256-…"',
    ],
    [
      { schemaVersion: 1, releases: [releases.releases[0], releases.releases[0]] },
      'releases.releases[1].id: duplicate id "g-1"',
    ],
  ])('rejects %j', (value, error) => {
    const r = validateReleases(value);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain(error);
  });
});

describe('findRelease() / releaseHistory()', () => {
  it('matches any known id, case-insensitively, on the right platform', () => {
    expect(findRelease(releases, { platform: 'ios', updateIds: ['nope', 'G-1'] })?.notes).toBe(
      'Fixed checkout crash'
    );
    expect(findRelease(releases, { platform: 'ios', updateIds: ['g-2'] })).toBeNull();
    expect(findRelease(releases, { platform: 'android', updateIds: [null, undefined] })).toBeNull();
    expect(findRelease(null, { platform: 'android', updateIds: ['g-1'] })).toBeNull();
  });

  it('lists the runtime history newest first', () => {
    expect(
      releaseHistory(releases, { platform: 'android', runtimeVersion: '3.4.0' }).map((r) => r.id)
    ).toEqual(['g-2', 'g-1']);
    expect(
      releaseHistory(releases, { platform: 'ios', runtimeVersion: '3.4.0' }).map((r) => r.id)
    ).toEqual(['g-1']);
    expect(releaseHistory(releases, { platform: 'ios', runtimeVersion: null })).toEqual([]);
  });
});
