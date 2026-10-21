import { decide, explain, targetKey } from '../decide';
import { rolloutBucket } from '../rollout';
import type { Decision, DecisionInput } from '../types';
import {
  DAY,
  NOW,
  androidInstalled,
  appStore,
  daysAgo,
  input,
  iosInstalled,
  play,
  policy,
} from './fixtures';

type Expected = Partial<Decision> & { kind: Decision['kind'] };

interface Case {
  name: string;
  input: DecisionInput;
  expected: Expected;
}

const HOUR = 3_600_000;

function iosInput(over: Partial<DecisionInput> = {}): DecisionInput {
  return input({ installed: iosInstalled(), store: appStore(), ...over });
}

// Find installation ids on either side of a 50% rollout for target build 340.
const insideRollout = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].find(
  (id) => rolloutBucket(id, '340') < 50
)!;
const outsideRollout = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].find(
  (id) => rolloutBucket(id, '340') >= 50
)!;

const cases: Case[] = [
  // ── Up to date ────────────────────────────────────────────────────────────
  {
    name: 'android at latest build is up to date',
    input: input({
      installed: androidInstalled({
        buildNumber: '340',
        nativeVersion: '3.4.0',
        runtimeVersion: '3.3.0',
      }),
      store: play({ updateAvailability: 'notAvailable', availableVersionCode: null }),
    }),
    expected: { kind: 'upToDate' },
  },

  // ── Rule 2: required (below minimum) ─────────────────────────────────────
  {
    name: 'below minimum on Play → required, immediate flow',
    input: input({ installed: androidInstalled({ buildNumber: '290' }) }),
    expected: {
      kind: 'store.required',
      reason: 'belowMinimum',
      flow: 'playImmediate',
      because: 'required: build 290 < minimum 300',
      target: { version: '3.4.0', build: '340' },
    },
  },
  {
    name: 'below minimum, sideloaded → store link (rule 1: install-source gate)',
    input: input({
      installed: androidInstalled({ buildNumber: '290', installSource: 'sideload' }),
    }),
    expected: {
      kind: 'store.required',
      flow: 'storeLink',
      storeUrl: 'https://play.google.com/store/apps/details?id=com.example.app',
    },
  },
  {
    name: 'below minimum, Play disallows immediate → store link',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      store: play({ immediateAllowed: false }),
    }),
    expected: { kind: 'store.required', flow: 'storeLink' },
  },
  {
    name: 'below minimum, Play only offers a build still below minimum → store link',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      store: play({ availableVersionCode: 295 }),
    }),
    expected: { kind: 'store.required', flow: 'storeLink' },
  },
  {
    name: 'below minimum, Play reports nothing → store link',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      store: play({ updateAvailability: 'notAvailable', availableVersionCode: null }),
    }),
    expected: { kind: 'store.required', flow: 'storeLink' },
  },
  {
    name: 'below minimum without a latest → target is the minimum',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      policy: policy({ android: { latest: undefined } }),
      store: null,
    }),
    expected: {
      kind: 'store.required',
      target: { version: '3.0.0', build: '300' },
      flow: 'storeLink',
    },
  },
  {
    name: 'required updates carry requiredMessage, not the recommendation copy',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      policy: policy({
        android: { requiredMessage: { title: 'Update required', body: 'Old API is gone.' } },
      }),
    }),
    expected: {
      kind: 'store.required',
      message: { title: 'Update required', body: 'Old API is gone.' },
    },
  },
  {
    name: 'required without requiredMessage has no message (UI uses its default copy)',
    input: input({ installed: androidInstalled({ buildNumber: '290' }) }),
    expected: { kind: 'store.required', message: null },
  },
  {
    name: 'required beats a ready OTA',
    input: input({ installed: androidInstalled({ buildNumber: '290' }), ota: { status: 'ready' } }),
    expected: { kind: 'store.required' },
  },

  // ── Rule 6: escalation ───────────────────────────────────────────────────
  {
    name: 'update older than requireAfterDays → required (stale)',
    input: input({ policy: policy({ android: { requireAfterDays: 3 } }) }),
    expected: {
      kind: 'store.required',
      reason: 'stale',
      flow: 'playImmediate',
      because: 'required: update is 5 days old (requireAfterDays 3)',
    },
  },
  {
    name: 'update younger than requireAfterDays → only recommended',
    input: input({ policy: policy({ android: { requireAfterDays: 10 } }) }),
    expected: { kind: 'store.recommended', reason: 'newerVersion' },
  },

  // ── Rule 4: stranded ─────────────────────────────────────────────────────
  {
    name: 'stranded runtime with a newer native → recommended (stranded)',
    input: input({
      policy: policy({
        android: { ota: { latestRuntimeVersion: '3.4.0', strandedRequireAfterDays: 14 } },
      }),
    }),
    expected: { kind: 'store.recommended', reason: 'stranded', flow: 'playFlexible' },
  },
  {
    name: 'stranded ignores the rollout gate',
    input: input({
      policy: policy({ android: { rollout: 0, ota: { latestRuntimeVersion: '3.4.0' } } }),
    }),
    expected: { kind: 'store.recommended', reason: 'stranded' },
  },
  {
    name: 'stranded longer than strandedRequireAfterDays → required (stranded)',
    input: input({
      policy: policy({
        android: { ota: { latestRuntimeVersion: '3.4.0', strandedRequireAfterDays: 14 } },
      }),
      store: play({ stalenessDays: 20 }),
    }),
    expected: { kind: 'store.required', reason: 'stranded' },
  },
  {
    name: 'different runtime but no newer native is not stranded',
    input: input({
      installed: androidInstalled({ buildNumber: '340', runtimeVersion: '3.3.0' }),
      policy: policy({ android: { ota: { latestRuntimeVersion: '3.4.0' } } }),
      store: play({ updateAvailability: 'notAvailable', availableVersionCode: null }),
    }),
    expected: { kind: 'upToDate' },
  },
  {
    name: 'no runtime reported → never stranded',
    input: input({
      installed: androidInstalled({ runtimeVersion: null }),
      policy: policy({
        android: { recommendAfterDays: 30, ota: { latestRuntimeVersion: '3.4.0' } },
      }),
    }),
    expected: { kind: 'upToDate' },
  },

  // ── Rule 3: OTA ──────────────────────────────────────────────────────────
  {
    name: 'OTA ready → ota.ready with the policy apply mode',
    input: input({ ota: { status: 'ready' } }),
    expected: { kind: 'ota.ready', applyMode: 'nextLaunch' },
  },
  {
    name: 'OTA ready on iOS with applyMode prompt',
    input: iosInput({ ota: { status: 'ready' } }),
    expected: { kind: 'ota.ready', applyMode: 'prompt' },
  },
  {
    name: 'OTA apply mode defaults to nextLaunch',
    input: input({ ota: { status: 'ready' }, policy: policy({ android: { ota: {} } }) }),
    expected: { kind: 'ota.ready', applyMode: 'nextLaunch' },
  },
  {
    name: 'OTA available → ota.downloading',
    input: input({ ota: { status: 'available' } }),
    expected: { kind: 'ota.downloading' },
  },
  {
    name: 'OTA downloading → ota.downloading (beats a store recommendation)',
    input: input({ ota: { status: 'downloading' } }),
    expected: { kind: 'ota.downloading' },
  },

  // ── Rule 5: recommended ──────────────────────────────────────────────────
  {
    name: 'newer native past recommendAfterDays → recommended flexible',
    input: input(),
    expected: {
      kind: 'store.recommended',
      reason: 'newerVersion',
      flow: 'playFlexible',
      target: { version: '3.4.0', build: '340' },
      message: { title: 'Update available', body: 'Grab the latest version.' },
    },
  },
  {
    name: 'newer native before recommendAfterDays → up to date',
    input: input({ store: play({ stalenessDays: 1 }) }),
    expected: {
      kind: 'upToDate',
      because: 'recommend: update is 1 days old, waiting for recommendAfterDays 2',
    },
  },
  {
    name: 'Play priority >= 4 recommends immediately',
    input: input({ store: play({ stalenessDays: 0, updatePriority: 4 }) }),
    expected: { kind: 'store.recommended', reason: 'highPriority' },
  },
  {
    name: 'flexible not allowed → recommended via store link',
    input: input({ store: play({ flexibleAllowed: false }) }),
    expected: { kind: 'store.recommended', flow: 'storeLink' },
  },
  {
    name: 'installed from Play but Play has no update yet → no prompt',
    input: input({
      store: play({
        updateAvailability: 'notAvailable',
        availableVersionCode: null,
        stalenessDays: null,
      }),
    }),
    expected: { kind: 'upToDate', because: 'store: Play has no update for this device yet' },
  },
  {
    name: 'sideloaded install with a newer version → store link prompt',
    input: input({ installed: androidInstalled({ installSource: 'sideload' }), store: null }),
    expected: { kind: 'store.recommended', flow: 'storeLink' },
  },
  {
    name: 'no android section → Play data alone drives the decision',
    input: input({
      policy: { schemaVersion: 1 },
      store: play({ updatePriority: 5, stalenessDays: 0 }),
    }),
    expected: {
      kind: 'store.recommended',
      reason: 'highPriority',
      target: { version: null, build: '340' },
    },
  },
  {
    name: 'storeUrl override is passed through',
    input: input({
      installed: androidInstalled({ installSource: 'unknown' }),
      policy: policy({ android: { storeUrl: 'https://example.com/download' } }),
    }),
    expected: {
      kind: 'store.recommended',
      flow: 'storeLink',
      storeUrl: 'https://example.com/download',
    },
  },

  // ── Rule 8: rollout ──────────────────────────────────────────────────────
  {
    name: 'install inside the rollout bucket is prompted',
    input: input({
      installed: androidInstalled({ installationId: insideRollout }),
      policy: policy({ android: { rollout: 50 } }),
    }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'install outside the rollout bucket is not prompted',
    input: input({
      installed: androidInstalled({ installationId: outsideRollout }),
      policy: policy({ android: { rollout: 50 } }),
    }),
    expected: { kind: 'upToDate' },
  },
  {
    name: 'rollout does not gate required updates',
    input: input({
      installed: androidInstalled({ installationId: outsideRollout, buildNumber: '290' }),
      policy: policy({ android: { rollout: 0 } }),
    }),
    expected: { kind: 'store.required' },
  },

  // ── Rule 7: frequency caps ───────────────────────────────────────────────
  {
    name: 'dismissed an hour ago → snoozed',
    input: input({ prompts: { dismissedAt: NOW - HOUR, dismissedTarget: 'build:340' } }),
    expected: {
      kind: 'upToDate',
      snoozed: { target: { version: '3.4.0', build: '340' }, until: NOW + 23 * HOUR },
    },
  },
  {
    name: 'dismissed 25 hours ago → prompted again',
    input: input({ prompts: { dismissedAt: NOW - 25 * HOUR, dismissedTarget: 'build:340' } }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'snooze only covers the dismissed target',
    input: input({ prompts: { dismissedAt: NOW - HOUR, dismissedTarget: 'build:335' } }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'custom snoozeHours',
    input: input({
      prompts: { dismissedAt: NOW - 2 * HOUR, dismissedTarget: 'build:340' },
      config: { snoozeHours: 1 },
    }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'prompt cap reached → hidden',
    input: input({ prompts: { shownAt: [NOW - DAY, NOW - 2 * DAY, NOW - 3 * DAY] } }),
    expected: { kind: 'upToDate', because: 'capped: 3 prompts in the last 168h (max 3)' },
  },
  {
    name: 'prompts outside the period do not count',
    input: input({ prompts: { shownAt: [NOW - DAY, NOW - 2 * DAY, NOW - 8 * DAY] } }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'snooze does not hide required updates',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      prompts: { dismissedAt: NOW - HOUR, dismissedTarget: 'build:340', shownAt: [NOW, NOW, NOW] },
    }),
    expected: { kind: 'store.required' },
  },
  {
    name: 'snooze also hides stranded recommendations',
    input: input({
      policy: policy({ android: { ota: { latestRuntimeVersion: '3.4.0' } } }),
      prompts: { dismissedAt: NOW - HOUR, dismissedTarget: 'build:340' },
    }),
    expected: { kind: 'upToDate' },
  },

  // ── Play live install state ──────────────────────────────────────────────
  {
    name: 'flexible download in progress → store.downloading with progress',
    input: input({
      store: play({ installStatus: 'downloading', bytesDownloaded: 50, totalBytesToDownload: 200 }),
    }),
    expected: {
      kind: 'store.downloading',
      progress: 0.25,
      required: false,
      target: { version: '3.4.0', build: '340' },
    },
  },
  {
    name: 'pending download with unknown size → progress null',
    input: input({ store: play({ installStatus: 'pending' }) }),
    expected: { kind: 'store.downloading', progress: null },
  },
  {
    name: 'download in progress while below minimum is flagged required',
    input: input({
      installed: androidInstalled({ buildNumber: '290' }),
      store: play({ installStatus: 'downloading', bytesDownloaded: 1, totalBytesToDownload: 2 }),
    }),
    expected: { kind: 'store.downloading', required: true },
  },
  {
    name: 'download finished → store.readyToInstall',
    input: input({ store: play({ installStatus: 'downloaded' }) }),
    expected: { kind: 'store.readyToInstall', target: { version: '3.4.0', build: '340' } },
  },
  {
    name: 'download finished beats a ready OTA',
    input: input({ store: play({ installStatus: 'downloaded' }), ota: { status: 'ready' } }),
    expected: { kind: 'store.readyToInstall' },
  },

  // ── Policy errors ────────────────────────────────────────────────────────
  {
    name: 'no policy and fetch failed → error',
    input: input({
      policy: null,
      policyError: 'HTTP 500',
      store: play({ updateAvailability: 'notAvailable', availableVersionCode: null }),
    }),
    expected: { kind: 'error', reason: 'HTTP 500', lastKnownGood: false },
  },
  {
    name: 'no policy but an OTA is ready → OTA still applies',
    input: input({ policy: null, policyError: 'timeout', ota: { status: 'ready' } }),
    expected: { kind: 'ota.ready', applyMode: 'nextLaunch' },
  },
  {
    name: 'fetch failed with a last known good policy → normal decision',
    input: input({ policyError: 'timeout' }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'no policy and no error → up to date',
    input: input({ policy: null, store: null }),
    expected: { kind: 'upToDate' },
  },

  // ── iOS ──────────────────────────────────────────────────────────────────
  {
    name: 'iOS below minimum version → required, App Store sheet',
    input: iosInput({ installed: iosInstalled({ nativeVersion: '2.9.0', buildNumber: '40' }) }),
    expected: {
      kind: 'store.required',
      reason: 'belowMinimum',
      flow: 'appStoreSheet',
      because: 'required: 2.9.0 (build 40) < minimum 3.0.0 (build 1)',
      storeUrl: 'https://apps.apple.com/app/id1234567890',
    },
  },
  {
    name: 'iOS compares versions before builds (build numbers reset per version)',
    input: iosInput({
      installed: iosInstalled({ nativeVersion: '3.4.0', buildNumber: '1' }),
      store: appStore({ version: '3.4.0' }),
    }),
    expected: { kind: 'upToDate' },
  },
  {
    name: 'iOS newer version → recommended App Store sheet',
    input: iosInput(),
    expected: {
      kind: 'store.recommended',
      flow: 'appStoreSheet',
      target: { version: '3.4.0', build: '1' },
    },
  },
  {
    name: 'iOS TestFlight install → store link',
    input: iosInput({ installed: iosInstalled({ installSource: 'testFlight' }) }),
    expected: { kind: 'store.recommended', flow: 'storeLink' },
  },
  {
    name: 'iOS device below the minimum OS of the new version → no prompt',
    input: iosInput({ installed: iosInstalled({ osVersion: '15.8' }) }),
    expected: { kind: 'upToDate' },
  },
  {
    name: 'iOS without policy latest uses the App Store lookup',
    input: iosInput({ policy: policy({ ios: { latest: undefined } }) }),
    expected: { kind: 'store.recommended', target: { version: '3.4.0', build: null } },
  },
  {
    name: 'iOS lookup still on the installed version → up to date',
    input: iosInput({
      policy: policy({ ios: { latest: undefined } }),
      store: appStore({ version: '3.3.0' }),
    }),
    expected: { kind: 'upToDate' },
  },
  {
    name: 'iOS with unknown staleness waits when recommendAfterDays > 0',
    input: iosInput({
      policy: policy({ ios: { latest: { version: '3.4.0', build: 1 } } }),
      store: null,
    }),
    expected: { kind: 'upToDate' },
  },
  {
    name: 'iOS with unknown staleness and recommendAfterDays 0 → recommended',
    input: iosInput({
      policy: policy({ ios: { latest: { version: '3.4.0', build: 1 }, recommendAfterDays: 0 } }),
      store: null,
    }),
    expected: { kind: 'store.recommended' },
  },
  {
    name: 'iOS without appStoreId falls back to the lookup trackId',
    input: iosInput({ policy: policy({ ios: { appStoreId: undefined } }) }),
    expected: {
      kind: 'store.recommended',
      flow: 'appStoreSheet',
      storeUrl: 'https://apps.apple.com/app/id1234567890',
    },
  },
  {
    name: 'iOS with no store id anywhere → store link without a URL',
    input: iosInput({ policy: policy({ ios: { appStoreId: undefined } }), store: null }),
    expected: { kind: 'store.recommended', flow: 'storeLink', storeUrl: null },
  },
  {
    name: 'iOS escalation uses latest.releasedAt',
    input: iosInput({ policy: policy({ ios: { requireAfterDays: 4 } }), store: null }),
    expected: { kind: 'store.required', reason: 'stale' },
  },
];

describe('decide()', () => {
  it.each(cases)('$name', ({ input: i, expected }) => {
    expect(decide(i)).toMatchObject(expected);
  });

  it('is pure: same input, same output', () => {
    const i = input();
    expect(decide(i)).toEqual(decide(i));
  });

  it('every decision has a because line', () => {
    for (const c of cases) expect(decide(c.input).because.length).toBeGreaterThan(0);
  });
});

describe('explain()', () => {
  it('records each rule it evaluated', () => {
    const { trace } = explain(input({ installed: androidInstalled({ buildNumber: '290' }) }));
    expect(trace[0]).toContain('installed: android 3.3.0 (build 290)');
    expect(trace).toContain('newer: policy latest 340 > installed build 290');
    expect(trace).toContain('staleness: 5 days (Play)');
    expect(trace[trace.length - 1]).toBe('→ store.required: required: build 290 < minimum 300');
  });

  it('explains why there is no prompt', () => {
    const { trace } = explain(
      input({
        installed: androidInstalled({ installationId: outsideRollout }),
        policy: policy({ android: { rollout: 50 } }),
      })
    );
    expect(trace.some((l) => l.startsWith('rollout: bucket'))).toBe(true);
  });

  it('mentions a stale policy', () => {
    const { trace } = explain(input({ policyError: 'timeout' }));
    expect(trace).toContain('policy: latest fetch failed (timeout); using last known good');
  });

  it('explains unknown staleness', () => {
    const { trace } = explain(
      iosInput({ policy: policy({ ios: { latest: { version: '3.4.0', build: 1 } } }), store: null })
    );
    expect(trace).toContain('staleness: unknown (set latest.releasedAt in the policy)');
  });

  it('notes a platform section missing from the policy', () => {
    const { trace } = explain(input({ policy: { schemaVersion: 1 } }));
    expect(trace).toContain('policy: no "android" section');
  });
});

describe('targetKey()', () => {
  it('prefers the build', () => {
    expect(targetKey({ version: '3.4.0', build: '340' })).toBe('build:340');
    expect(targetKey({ version: '3.4.0', build: null })).toBe('version:3.4.0');
  });
});

it('staleness from policy dates is floored to whole days', () => {
  const i = input({
    store: null,
    installed: androidInstalled({ installSource: 'sideload' }),
    policy: policy({
      android: {
        latest: { version: '3.4.0', build: 340, releasedAt: daysAgo(1.9) },
        recommendAfterDays: 2,
      },
    }),
  });
  expect(decide(i).kind).toBe('upToDate');
});
