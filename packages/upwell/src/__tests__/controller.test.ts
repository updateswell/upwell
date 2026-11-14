import type {
  DecisionKind,
  Policy,
  ReleasesDocument,
  StoreInfo,
  UpwellEvent,
  UpwellEventType,
} from '@upwell/core';

import { policy as policyFixture } from '../../../core/src/__tests__/fixtures';
import pkg from '../../package.json';
import { UpwellController, type UpwellOptions } from '../controller';
import type { OtaAdapter } from '../ota/types';
import type { BaseInstalledInfo, KeyValueStorage } from '../platform/types';
import { SIMULATION_SCENARIOS, SimulatedPlatform, type SimulationScenario } from '../simulation';
import { staticSource, type Source } from '../sources';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function waitFor(fn: () => boolean, timeout = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function installed(over: Partial<BaseInstalledInfo> = {}): BaseInstalledInfo {
  return {
    platform: 'android',
    appId: 'com.example.app',
    nativeVersion: '3.3.0',
    buildNumber: '330',
    installSource: 'play',
    installationId: 'install-a',
    osVersion: '15',
    ...over,
  };
}

function playStore(over: Partial<StoreInfo> = {}): StoreInfo {
  return {
    kind: 'play',
    updateAvailability: 'available',
    availableVersionCode: 340,
    updatePriority: 0,
    stalenessDays: 5,
    immediateAllowed: true,
    flexibleAllowed: true,
    installStatus: 'unknown',
    bytesDownloaded: 0,
    totalBytesToDownload: 0,
    ...over,
  } as StoreInfo;
}

function platform(
  over: {
    installed?: Partial<BaseInstalledInfo>;
    store?: StoreInfo | null;
    userAccepts?: boolean;
  } = {}
) {
  return new SimulatedPlatform(
    'android',
    {
      installed: installed(over.installed),
      store: over.store === undefined ? playStore() : over.store,
    },
    1,
    over.userAccepts ?? true
  );
}

class FakeOta implements OtaAdapter {
  name = 'fake';
  applied = 0;
  constructor(
    public available = false,
    public updateId: string | null = 'u-1',
    public runtimeVersion: string | null = '3.3.0'
  ) {}
  getRuntime() {
    return {
      runtimeVersion: this.runtimeVersion,
      updateId: this.updateId,
      updateIds: this.updateId ? [this.updateId] : [],
    };
  }
  async check() {
    return { available: this.available };
  }
  async download() {}
  async apply() {
    this.applied++;
    this.available = false;
  }
}

function failing(msg = 'network down'): Source<Policy> {
  return {
    fetch: async () => {
      throw new Error(msg);
    },
  };
}

function controller(over: Partial<UpwellOptions> = {}) {
  return new UpwellController({
    policy: staticSource(policyFixture()),
    platform: platform(),
    ...over,
  });
}

describe('UpwellController', () => {
  it('checks and lands on a recommended flexible update', async () => {
    const c = controller();
    const d = await c.check();
    expect(d).toMatchObject({ kind: 'store.recommended', flow: 'playFlexible' });
    expect(c.getState()).toMatchObject({ status: 'ready', policyError: null });
    expect(c.getState().trace.length).toBeGreaterThan(2);
  });

  it('caches the policy and falls back to it when the fetch fails', async () => {
    const p = platform();
    await controller({ platform: p }).check();
    const offline = controller({ platform: p, policy: failing() });
    const d = await offline.check();
    expect(d.kind).toBe('store.recommended');
    expect(offline.getState().policyError).toBe('network down');
    expect(offline.getState().trace).toContain(
      'policy: latest fetch failed (network down); using last known good'
    );
  });

  it('reports an invalid policy through the trace and uses no policy', async () => {
    const c = controller({
      policy: staticSource({ schemaVersion: 9 } as unknown as Policy),
      platform: platform({ store: null }),
    });
    const d = await c.check();
    expect(d.kind).toBe('error');
    expect(c.getState().policyError).toBe(
      'invalid policy: policy.schemaVersion: must be 1 (got 9)'
    );
  });

  it('times out slow policy fetches', async () => {
    const slow: Source<Policy> = {
      fetch: (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        ),
    };
    const c = controller({ policy: slow, timeoutMs: 10, platform: platform({ store: null }) });
    await c.check();
    expect(c.getState().policyError).toBe('policy fetch timed out');
  });

  it('shares concurrent checks and respects minCheckIntervalMs', async () => {
    let fetches = 0;
    const source: Source<Policy> = {
      fetch: async () => {
        fetches++;
        return policyFixture();
      },
    };
    const c = controller({ policy: source });
    await Promise.all([c.check(), c.check()]);
    await c.check();
    expect(fetches).toBe(1);
    await c.check({ force: true });
    expect(fetches).toBe(2);
  });

  describe('without a policy', () => {
    function noPolicy(over: Partial<UpwellOptions> = {}) {
      return new UpwellController({ platform: platform(), ...over });
    }

    it('recommends the Play update with no fetch and no policy error', async () => {
      const c = noPolicy();
      const d = await c.check();
      expect(d).toMatchObject({ kind: 'store.recommended', flow: 'playFlexible' });
      expect(c.getState()).toMatchObject({ policy: null, policyError: null, policyWarnings: [] });
      expect(c.getState().trace).toContain('policy: none');
    });

    it('keeps Play priority 5 a recommendation, never a required update', async () => {
      const c = noPolicy({ platform: platform({ store: playStore({ updatePriority: 5 }) }) });
      expect((await c.check()).kind).toBe('store.recommended');
    });

    it('recommends a newer App Store version with the sheet', async () => {
      const ios = new SimulatedPlatform(
        'ios',
        {
          installed: installed({ platform: 'ios', installSource: 'appStore', osVersion: '18.0' }),
          store: {
            kind: 'appStore',
            version: '3.4.0',
            releaseDate: new Date(Date.now() - 5 * 86_400_000).toISOString(),
            minimumOsVersion: '16.0',
            trackId: 1234567890,
            trackViewUrl: 'https://apps.apple.com/app/id1234567890',
          },
        },
        1,
        true
      );
      const d = await noPolicy({ platform: ios }).check();
      expect(d).toMatchObject({
        kind: 'store.recommended',
        flow: 'appStoreSheet',
        storeUrl: 'https://apps.apple.com/app/id1234567890',
      });
    });

    it('is up to date when no store knows a newer version', async () => {
      const c = noPolicy({
        platform: platform({ installed: { installSource: 'sideload' }, store: null }),
      });
      expect((await c.check()).kind).toBe('upToDate');
    });

    it('ignores a policy cached by an earlier setup', async () => {
      const p = platform({
        installed: { nativeVersion: '2.9.0', buildNumber: '290' },
        store: null,
      });
      const withPolicy = new UpwellController({
        policy: staticSource(policyFixture()),
        platform: p,
      });
      expect((await withPolicy.check()).kind).toBe('store.required');
      const c = noPolicy({ platform: p });
      await c.check();
      expect(c.getState().policy).toBeNull();
      expect(c.getState().decision.kind).not.toBe('store.required');
    });

    it('still downloads OTA updates', async () => {
      const c = noPolicy({
        platform: platform({ store: null }),
        ota: new FakeOta(true),
      });
      await c.check();
      await waitFor(() => c.getState().ota.status === 'ready');
      expect(c.getState().decision.kind).toBe('ota.ready');
    });
  });

  it('errors clearly without the native module', async () => {
    const c = new UpwellController({ policy: staticSource(policyFixture()), platform: null });
    const d = await c.check();
    expect(d.kind).toBe('error');
    expect(d.because).toContain('native module is not linked');
  });

  describe('OTA', () => {
    it('downloads an available update and reports ota.ready', async () => {
      const ota = new FakeOta(true);
      const c = controller({ ota });
      const kinds: DecisionKind[] = [];
      c.subscribe((s) => kinds.push(s.decision.kind));
      await c.check();
      await waitFor(() => c.getState().decision.kind === 'ota.ready');
      expect(kinds).toContain('ota.downloading');
      expect(c.getState().decision).toMatchObject({ kind: 'ota.ready', applyMode: 'nextLaunch' });
    });

    it('applies immediately when the policy says so', async () => {
      const ota = new FakeOta(true);
      const p = policyFixture({
        android: { ota: { latestRuntimeVersion: '3.3.0', applyMode: 'immediate' } },
      });
      const c = controller({ ota, policy: staticSource(p) });
      await c.check();
      await waitFor(() => ota.applied === 1);
    });

    it('a dismissed restart prompt falls back to the next launch', async () => {
      const ota = new FakeOta(true);
      const p = policyFixture({
        android: { ota: { latestRuntimeVersion: '3.3.0', applyMode: 'prompt' } },
      });
      const c = controller({ ota, policy: staticSource(p) });
      await c.check();
      await waitFor(() => c.getState().decision.kind === 'ota.ready');
      expect(c.getState().decision).toMatchObject({ applyMode: 'prompt' });
      c.dismiss();
      expect(c.getState().decision).toMatchObject({ kind: 'ota.ready', applyMode: 'nextLaunch' });
      expect(c.getState().dismissed).toBe(true);
    });

    describe('runtime version', () => {
      const stranded = policyFixture({
        android: { ota: { latestRuntimeVersion: '3.4.0', strandedRequireAfterDays: 14 } },
      });

      it("falls back to the binary's embedded runtime when the OTA adapter has none", async () => {
        // expo-updates reports no runtime in debug builds, whatever runtimeVersion policy is used.
        const c = controller({
          platform: platform({ installed: { embeddedRuntimeVersion: '3.3.0' } }),
          ota: new FakeOta(false, null, null),
          policy: staticSource(stranded),
        });
        const d = await c.check();
        expect(c.getState().installed?.runtimeVersion).toBe('3.3.0');
        expect(d).toMatchObject({ kind: 'store.recommended', reason: 'stranded' });
      });

      it('uses the embedded runtime without an OTA adapter', async () => {
        const c = controller({
          platform: platform({ installed: { embeddedRuntimeVersion: '3.3.0' } }),
        });
        await c.check();
        expect(c.getState().installed?.runtimeVersion).toBe('3.3.0');
      });

      it("prefers the OTA adapter's runtime", async () => {
        const c = controller({
          platform: platform({ installed: { embeddedRuntimeVersion: '3.2.0' } }),
          ota: new FakeOta(false, null, '3.3.0'),
        });
        await c.check();
        expect(c.getState().installed?.runtimeVersion).toBe('3.3.0');
      });
    });

    it('does not download when autoDownloadOta is false', async () => {
      const c = controller({ ota: new FakeOta(true), autoDownloadOta: false });
      await c.check();
      await flush();
      expect(c.getState().ota.status).toBe('available');
    });
  });

  describe('store flows', () => {
    it('runs a flexible update: accept → download → ready → install', async () => {
      const c = controller();
      await c.check();
      const seen: DecisionKind[] = [];
      c.subscribe((s) => seen.push(s.decision.kind));
      expect(await c.startUpdate()).toBe('accepted');
      await waitFor(() => c.getState().decision.kind === 'store.readyToInstall');
      expect(seen).toContain('store.downloading');
      await c.startUpdate();
      await waitFor(
        () =>
          c.getState().decision.kind === 'upToDate' && c.getState().installed?.buildNumber === '340'
      );
    });

    it('reports download progress', async () => {
      const c = controller();
      await c.check();
      const progress: number[] = [];
      c.subscribe((s) => {
        if (s.decision.kind === 'store.downloading' && s.decision.progress != null)
          progress.push(s.decision.progress);
      });
      await c.startUpdate();
      await waitFor(() => c.getState().decision.kind === 'store.readyToInstall');
      expect(progress[progress.length - 1]).toBeGreaterThan(0.8);
      expect([...progress].sort()).toEqual(progress);
    });

    it('declining the Play dialog snoozes the recommendation', async () => {
      const c = controller({ platform: platform({ userAccepts: false }) });
      await c.check();
      expect(await c.startUpdate()).toBe('canceled');
      expect(c.getState().decision).toMatchObject({
        kind: 'upToDate',
        snoozed: { target: { build: '340' } },
      });
    });

    it('installs a postponed download when the app goes to the background', async () => {
      const p = platform({ store: playStore({ installStatus: 'downloaded' }) });
      const complete = jest.spyOn(p, 'completeStoreUpdate');
      const c = controller({ platform: p });
      await c.check();
      expect(c.getState().decision.kind).toBe('store.readyToInstall');
      c.handleAppStateChange('background');
      expect(complete).not.toHaveBeenCalled();
      c.dismiss();
      c.handleAppStateChange('background');
      expect(complete).toHaveBeenCalled();
    });

    it('falls back to the store link when the Play flow fails', async () => {
      const p = platform();
      const start = jest
        .spyOn(p, 'startStoreUpdate')
        .mockResolvedValueOnce('failed')
        .mockResolvedValueOnce('opened');
      const c = controller({ platform: p });
      await c.check();
      expect(await c.startUpdate()).toBe('opened');
      expect(start.mock.calls[1]?.[0]).toBe('storeLink');
    });

    it('required updates cannot be dismissed', async () => {
      const c = controller({ platform: platform({ installed: { buildNumber: '290' } }) });
      await c.check();
      c.dismiss();
      expect(c.getState().decision.kind).toBe('store.required');
    });
  });

  describe('prompt history', () => {
    it('persists a snooze across launches', async () => {
      const p = platform();
      const first = controller({ platform: p });
      await first.check();
      first.dismiss();
      const second = controller({ platform: p });
      expect((await second.check()).kind).toBe('upToDate');
    });

    it('caps prompts per period, counting one per session', async () => {
      const p = platform();
      for (let i = 0; i < 3; i++) {
        const c = controller({ platform: p });
        expect((await c.check()).kind).toBe('store.recommended');
        // Re-checking in the same session does not count again or hide the prompt.
        expect((await c.check({ force: true })).kind).toBe('store.recommended');
      }
      const fourth = controller({ platform: p });
      expect((await fourth.check()).because).toMatch(/^capped/);
    });
  });

  describe("what's new", () => {
    const releases: ReleasesDocument = {
      schemaVersion: 1,
      releases: [
        {
          id: 'u-2',
          platforms: ['android'],
          runtimeVersion: '3.3.0',
          kind: 'fix',
          notes: 'Fixed login',
          publishedAt: '2026-10-21T00:00:00Z',
        },
        {
          id: 'u-1',
          platforms: ['android'],
          runtimeVersion: '3.3.0',
          kind: 'content',
          notes: 'New banner',
          publishedAt: '2026-10-20T00:00:00Z',
        },
      ],
    };

    function storageWith(values: Record<string, string>, p: SimulatedPlatform): KeyValueStorage {
      for (const [k, v] of Object.entries(values)) p.storage.set(k, v);
      return p.storage;
    }

    it('first launch announces nothing and remembers the update', async () => {
      const p = platform();
      const c = controller({
        platform: p,
        ota: new FakeOta(false, 'u-1'),
        releases: staticSource(releases),
      });
      await c.check();
      expect(c.getState().justUpdated).toBeNull();
      expect(p.storage.get('lastSeenUpdateId')).toBe('u-1');
      expect(c.getState().currentRelease?.notes).toBe('New banner');
      expect(c.getState().history.map((r) => r.id)).toEqual(['u-2', 'u-1']);
    });

    it('announces a newly applied update until marked seen', async () => {
      const p = platform();
      storageWith({ lastSeenUpdateId: 'u-1' }, p);
      const c = controller({
        platform: p,
        ota: new FakeOta(false, 'u-2'),
        releases: staticSource(releases),
      });
      await c.check();
      expect(c.getState().justUpdated?.notes).toBe('Fixed login');
      c.markUpdateSeen();
      expect(c.getState().justUpdated).toBeNull();
      expect(p.storage.get('lastSeenUpdateId')).toBe('u-2');
    });

    it('skips updates without release notes', async () => {
      const p = platform();
      storageWith({ lastSeenUpdateId: 'u-1' }, p);
      const c = controller({
        platform: p,
        ota: new FakeOta(false, 'u-9'),
        releases: staticSource(releases),
      });
      await c.check();
      expect(c.getState().justUpdated).toBeNull();
      expect(p.storage.get('lastSeenUpdateId')).toBe('u-9');
    });
  });

  describe('simulate()', () => {
    const expected: Record<SimulationScenario, DecisionKind[]> = {
      upToDate: ['upToDate'],
      'store.recommended': ['store.recommended'],
      'store.downloading': ['store.downloading'],
      'store.readyToInstall': ['store.readyToInstall'],
      'store.required': ['store.required'],
      stranded: ['store.recommended'],
      'ota.downloading': ['ota.downloading'],
      'ota.ready': ['ota.downloading', 'ota.ready'],
      error: ['error'],
    };

    it.each(SIMULATION_SCENARIOS)('%s', async (scenario) => {
      const c = controller();
      const d = await c.simulate(scenario, { stepMs: 5 });
      expect(expected[scenario]).toContain(d.kind);
      expect(c.getState().simulation).toBe(scenario);
      if (scenario === 'stranded') expect(d).toMatchObject({ reason: 'stranded' });
      c.dispose();
    });

    it('steps from an OTA prompt to the "Updated" sheet', async () => {
      const c = controller();
      await c.simulate('ota.ready', { stepMs: 1 });
      await waitFor(() => c.getState().decision.kind === 'ota.ready');
      await c.applyOta();
      expect(c.getState().justUpdated?.id).toBe('sim-update-2');
      expect(c.getState().decision.kind).toBe('upToDate');
    });

    it('returns to the real device', async () => {
      const c = controller();
      await c.simulate('error');
      const d = await c.simulate(null);
      expect(d.kind).toBe('store.recommended');
      expect(c.getState().simulation).toBeNull();
    });
  });
});

describe('events', () => {
  function recorder() {
    const events: UpwellEvent[] = [];
    return {
      events,
      onEvent: (e: UpwellEvent) => {
        events.push(e);
      },
      of<T extends UpwellEventType>(type: T) {
        return events.filter((e): e is Extract<UpwellEvent, { type: T }> => e.type === type);
      },
    };
  }

  it('reports every completed check with the common fields', async () => {
    const r = recorder();
    const c = controller({ onEvent: r.onEvent, ota: new FakeOta(false, 'u-1') });
    await c.check();
    expect(r.of('check')).toEqual([
      {
        type: 'check',
        decision: 'store.recommended',
        reason: 'newerVersion',
        policy: 'fresh',
        durationMs: expect.any(Number),
        timestamp: expect.any(Number),
        sdkVersion: pkg.version,
        platform: 'android',
        appVersion: '3.3.0',
        build: '330',
        runtimeVersion: '3.3.0',
        updateId: 'u-1',
        installSource: 'play',
        installationId: 'install-a',
        simulation: null,
      },
    ]);
  });

  it('carries nothing personal: only the documented common fields', async () => {
    const r = recorder();
    const c = controller({
      onEvent: r.onEvent,
      platform: platform({ installed: { regionCode: 'DE', osVersion: '15' } }),
    });
    await c.check();
    const { type, decision, reason, policy, durationMs, ...common } = r.of('check')[0]!;
    expect(Object.keys(common).sort()).toEqual([
      'appVersion',
      'build',
      'installSource',
      'installationId',
      'platform',
      'runtimeVersion',
      'sdkVersion',
      'simulation',
      'timestamp',
      'updateId',
    ]);
  });

  it('says where the policy came from', async () => {
    const p = platform();
    const r = recorder();
    await controller({ platform: p, onEvent: r.onEvent }).check();
    await controller({ platform: p, onEvent: r.onEvent, policy: failing() }).check();
    await new UpwellController({ platform: p, onEvent: r.onEvent }).check();
    expect(r.of('check').map((e) => e.policy)).toEqual(['fresh', 'cached', 'none']);
  });

  it('skips throttled checks', async () => {
    const r = recorder();
    const c = controller({ onEvent: r.onEvent });
    await Promise.all([c.check(), c.check()]);
    await c.check();
    expect(r.of('check')).toHaveLength(1);
    await c.check({ force: true });
    expect(r.of('check')).toHaveLength(2);
  });

  it('reports a check that could not read the device, with what is known', async () => {
    const r = recorder();
    const c = new UpwellController({
      policy: staticSource(policyFixture()),
      platform: null,
      onEvent: r.onEvent,
    });
    await c.check();
    expect(r.of('error')[0]).toMatchObject({
      context: 'reading installed info',
      message: expect.stringContaining('native module is not linked'),
      appVersion: null,
      installationId: null,
    });
    expect(r.of('check')[0]).toMatchObject({ decision: 'error', policy: 'none' });
  });

  describe('prompt_shown', () => {
    it('fires once per target per session, after the check', async () => {
      const p = platform();
      const r = recorder();
      const c = controller({ platform: p, onEvent: r.onEvent });
      await c.check();
      await c.check({ force: true });
      expect(r.of('prompt_shown')).toEqual([
        expect.objectContaining({
          type: 'prompt_shown',
          decision: 'store.recommended',
          reason: 'newerVersion',
          flow: 'playFlexible',
          target: { version: '3.4.0', build: '340' },
          installationId: 'install-a',
        }),
      ]);
      expect(r.events.map((e) => e.type)).toEqual(['check', 'prompt_shown', 'check']);
      // A new session shows it again.
      await controller({ platform: p, onEvent: r.onEvent }).check();
      expect(r.of('prompt_shown')).toHaveLength(2);
    });

    it('fires for required updates', async () => {
      const r = recorder();
      const c = controller({
        platform: platform({ installed: { buildNumber: '290' } }),
        onEvent: r.onEvent,
      });
      await c.check();
      expect(r.of('prompt_shown')).toEqual([
        expect.objectContaining({ decision: 'store.required', reason: 'belowMinimum' }),
      ]);
    });

    it('does not fire when nothing is shown', async () => {
      const r = recorder();
      const c = controller({ platform: platform({ store: null }), onEvent: r.onEvent });
      // A snoozed recommendation isn't shown again.
      await c.check();
      c.dismiss();
      await c.check({ force: true });
      expect(r.of('prompt_shown')).toHaveLength(1);
      expect(c.getState().decision.kind).toBe('upToDate');
    });
  });

  describe('prompt_action and store_flow', () => {
    it('"Later" is a later action', async () => {
      const r = recorder();
      const c = controller({ onEvent: r.onEvent });
      await c.check();
      c.dismiss();
      expect(r.of('prompt_action')).toEqual([
        expect.objectContaining({
          action: 'later',
          decision: 'store.recommended',
          target: { version: '3.4.0', build: '340' },
        }),
      ]);
    });

    it('starting the update is an update action, then the flow result', async () => {
      const r = recorder();
      const c = controller({ onEvent: r.onEvent });
      await c.check();
      await c.startUpdate();
      expect(r.of('prompt_action')).toEqual([
        expect.objectContaining({ action: 'update', decision: 'store.recommended' }),
      ]);
      expect(r.of('store_flow')).toEqual([
        expect.objectContaining({ flow: 'playFlexible', result: 'accepted' }),
      ]);
      const types = r.events.map((e) => e.type);
      expect(types.indexOf('prompt_action')).toBeLessThan(types.indexOf('store_flow'));
    });

    it("declining Play's dialog is a dismiss action, not later", async () => {
      const r = recorder();
      const c = controller({ platform: platform({ userAccepts: false }), onEvent: r.onEvent });
      await c.check();
      await c.startUpdate();
      expect(r.of('prompt_action').map((e) => e.action)).toEqual(['update', 'dismiss']);
      expect(r.of('store_flow')).toEqual([expect.objectContaining({ result: 'canceled' })]);
    });

    it('reports each flow when a Play flow falls back to the store link', async () => {
      const p = platform();
      jest
        .spyOn(p, 'startStoreUpdate')
        .mockResolvedValueOnce('failed')
        .mockResolvedValueOnce('opened');
      const r = recorder();
      const c = controller({ platform: p, onEvent: r.onEvent });
      await c.check();
      await c.startUpdate();
      expect(r.of('store_flow').map((e) => [e.flow, e.result])).toEqual([
        ['playFlexible', 'failed'],
        ['storeLink', 'opened'],
      ]);
    });

    it('reports a Play flow that throws as failed, then the fallback', async () => {
      const p = platform();
      jest
        .spyOn(p, 'startStoreUpdate')
        .mockRejectedValueOnce(new Error('Play unavailable'))
        .mockResolvedValueOnce('opened');
      const r = recorder();
      const c = controller({ platform: p, onEvent: r.onEvent });
      await c.check();
      expect(await c.startUpdate()).toBe('opened');
      expect(r.of('store_flow').map((e) => [e.flow, e.result])).toEqual([
        ['playFlexible', 'failed'],
        ['storeLink', 'opened'],
      ]);
      expect(r.of('error')).toEqual([
        expect.objectContaining({ context: 'starting the store update' }),
      ]);
    });

    it('opening the store without a prompt is a flow, not a prompt action', async () => {
      const r = recorder();
      const c = controller({ platform: platform({ store: null }), onEvent: r.onEvent });
      await c.check();
      c.dismiss();
      await c.startStoreUpdate('storeLink');
      expect(r.of('prompt_action').map((e) => e.action)).toEqual(['later']);
      expect(r.of('store_flow')).toEqual([
        expect.objectContaining({ flow: 'storeLink', result: 'opened' }),
      ]);
    });
  });

  describe('OTA', () => {
    it('reports the download and the restart, with the new update id', async () => {
      const r = recorder();
      const c = controller({ onEvent: r.onEvent });
      await c.simulate('ota.ready', { stepMs: 1 });
      await waitFor(() => c.getState().decision.kind === 'ota.ready');
      expect(r.of('ota_downloaded')).toEqual([
        expect.objectContaining({
          newUpdateId: 'sim-update-2',
          updateId: 'sim-update-1',
          simulation: 'ota.ready',
        }),
      ]);
      await c.applyOta();
      expect(r.of('ota_applied')).toEqual([
        expect.objectContaining({
          newUpdateId: 'sim-update-2',
          applyMode: 'prompt',
          updateId: 'sim-update-1',
        }),
      ]);
      // The check after the restart runs on the new update.
      expect(r.of('check').at(-1)).toMatchObject({ updateId: 'sim-update-2' });
      c.dispose();
    });

    it('reports immediate restarts', async () => {
      const r = recorder();
      const ota = new FakeOta(true);
      const p = policyFixture({
        android: { ota: { latestRuntimeVersion: '3.3.0', applyMode: 'immediate' } },
      });
      controller({ ota, policy: staticSource(p), onEvent: r.onEvent }).check();
      await waitFor(() => ota.applied === 1);
      expect(r.of('ota_downloaded')).toEqual([expect.objectContaining({ newUpdateId: null })]);
      expect(r.of('ota_applied')).toEqual([
        expect.objectContaining({ applyMode: 'immediate', newUpdateId: null }),
      ]);
    });

    it('reports a failed download as an error, not a download', async () => {
      const r = recorder();
      const ota = new FakeOta(true);
      ota.download = async () => {
        throw new Error('disk full');
      };
      const c = controller({ ota, onEvent: r.onEvent });
      await c.check();
      await waitFor(() => c.getState().ota.status === 'error');
      expect(r.of('ota_downloaded')).toEqual([]);
      expect(r.of('error')).toEqual([
        expect.objectContaining({ context: 'downloading the OTA update', message: 'disk full' }),
      ]);
    });
  });

  describe('updated_seen', () => {
    const releases: ReleasesDocument = {
      schemaVersion: 1,
      releases: [
        {
          id: 'u-2',
          platforms: ['android'],
          runtimeVersion: '3.3.0',
          kind: 'fix',
          notes: 'Fixed login',
          publishedAt: '2026-10-21T00:00:00Z',
        },
      ],
    };

    it('fires when the "Updated" sheet is marked seen', async () => {
      const p = platform();
      p.storage.set('lastSeenUpdateId', 'u-1');
      const r = recorder();
      const c = controller({
        platform: p,
        ota: new FakeOta(false, 'u-2'),
        releases: staticSource(releases),
        onEvent: r.onEvent,
      });
      await c.check();
      c.markUpdateSeen();
      c.markUpdateSeen();
      expect(r.of('updated_seen')).toEqual([
        expect.objectContaining({ releaseId: 'u-2', updateId: 'u-2' }),
      ]);
    });

    it('does not fire when there was nothing to announce', async () => {
      const r = recorder();
      const c = controller({ ota: new FakeOta(false, 'u-1'), onEvent: r.onEvent });
      await c.check();
      c.markUpdateSeen();
      expect(r.of('updated_seen')).toEqual([]);
    });
  });

  it('reports errors passed to onError', async () => {
    const r = recorder();
    const onError = jest.fn();
    const c = controller({
      onEvent: r.onEvent,
      onError,
      releases: failing('releases offline') as unknown as Source<ReleasesDocument>,
    });
    await c.check();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'loading releases');
    expect(r.of('error')).toEqual([
      expect.objectContaining({ context: 'loading releases', message: 'releases offline' }),
    ]);
  });

  describe('a broken onEvent', () => {
    it('never breaks the update flow', async () => {
      const onError = jest.fn();
      const c = controller({
        onEvent: () => {
          throw new Error('analytics down');
        },
        onError,
      });
      expect((await c.check()).kind).toBe('store.recommended');
      expect(await c.startUpdate()).toBe('accepted');
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'analytics down' }),
        'onEvent'
      );
    });

    it('catches rejected promises from async handlers', async () => {
      const onError = jest.fn();
      const c = controller({
        onEvent: async () => {
          throw new Error('analytics down');
        },
        onError,
      });
      await c.check();
      await flush();
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'onEvent');
    });

    it('survives a throwing onError too', async () => {
      const c = controller({
        onEvent: () => {
          throw new Error('analytics down');
        },
        onError: () => {
          throw new Error('logging down');
        },
      });
      expect((await c.check()).kind).toBe('store.recommended');
    });
  });
});
