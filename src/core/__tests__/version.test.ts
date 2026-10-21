import { fnv1a, isInRollout, rolloutBucket } from '../rollout';
import { compareVersions, isComparableVersion } from '../version';

describe('compareVersions()', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.2', '1.2.0', 0],
    ['1.10.0', '1.9.9', 1],
    ['2.0.0', '10.0.0', -1],
    ['340', '300', 1],
    [340, '340', 0],
    ['299', 300, -1],
    ['1.0.0-beta', '1.0.0', -1],
    ['1.0.0', '1.0.0-rc.1', 1],
    ['1.0.0-alpha', '1.0.0-beta', -1],
    ['1.0.0-beta.2', '1.0.0-beta.11', -1],
    ['1.0.0-beta', '1.0.0-beta.1', -1],
    ['1.0.0-1', '1.0.0-alpha', -1],
    ['1.0.0+build.5', '1.0.0+build.9', 0],
    ['v3.4.0', '3.4.0', 0],
    [' 3.4.0 ', '3.4.0', 0],
    ['1.0.3', '1.0.10', -1],
  ] as const)('%s vs %s → %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
    expect(compareVersions(b, a)).toBe(expected === 0 ? 0 : -expected);
  });
});

describe('isComparableVersion()', () => {
  it.each([
    ['3.4.0', true],
    ['340', true],
    [340, true],
    ['1.0.0-beta.1', true],
    ['', false],
    ['abc', false],
    [-1, false],
    [1.5, false],
    [null, false],
  ])('%p → %p', (v, ok) => {
    expect(isComparableVersion(v)).toBe(ok);
  });
});

describe('rollout', () => {
  it('fnv1a matches reference vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('buckets are stable', () => {
    expect(rolloutBucket('install-a', 340)).toBe(rolloutBucket('install-a', '340'));
    expect(rolloutBucket('install-a', 340)).toBeGreaterThanOrEqual(0);
    expect(rolloutBucket('install-a', 340)).toBeLessThan(100);
  });

  it('spreads installs roughly evenly', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i++) counts[Math.floor(rolloutBucket(`id-${i}`, 340) / 10)]++;
    for (const c of counts) {
      expect(c).toBeGreaterThan(850);
      expect(c).toBeLessThan(1150);
    }
  });

  it('a new build reshuffles the cohort', () => {
    let moved = 0;
    for (let i = 0; i < 1000; i++) {
      if (isInRollout(`id-${i}`, 340, 10) !== isInRollout(`id-${i}`, 341, 10)) moved++;
    }
    expect(moved).toBeGreaterThan(100);
  });

  it('0 and 100 are absolute', () => {
    expect(isInRollout('x', 1, 0)).toBe(false);
    expect(isInRollout('x', 1, 100)).toBe(true);
    expect(isInRollout('x', 1, undefined)).toBe(true);
  });

  it('about rollout% of installs are included', () => {
    let included = 0;
    for (let i = 0; i < 10_000; i++) if (isInRollout(`id-${i}`, 340, 25)) included++;
    expect(included).toBeGreaterThan(2300);
    expect(included).toBeLessThan(2700);
  });
});
