import { UpwellController, type UpwellOptions } from '../controller';
import { policy as policyFixture } from '../core/__tests__/fixtures';
import type { DecisionKind, Policy, ReleasesDocument, StoreInfo } from '../core/types';
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
    public runtimeVersion = '3.3.0'
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
