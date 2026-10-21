import { Platform } from 'react-native';

import type {
  AppStoreInfo,
  Platform as PlatformName,
  PlayStoreInfo,
  Policy,
  ReleasesDocument,
  StoreFlow,
  StoreInfo,
} from '../core/types';
import { getUpwellNative, type PlaySimulationConfig } from '../native/UpwellNative';
import type { OtaAdapter, OtaCheckResult, OtaRuntime } from '../ota/types';
import { createMemoryStorage } from '../platform/memoryStorage';
import { createNativePlatform } from '../platform/nativePlatform';
import type {
  BaseInstalledInfo,
  StoreFlowContext,
  StoreFlowResult,
  StoreProgress,
  UpwellPlatform,
} from '../platform/types';

/** Every state `simulate()` can jump to. */
export type SimulationScenario =
  | 'upToDate'
  | 'store.recommended'
  | 'store.downloading'
  | 'store.readyToInstall'
  | 'store.required'
  | 'stranded'
  | 'ota.downloading'
  | 'ota.ready'
  | 'error';

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  'upToDate',
  'store.recommended',
  'store.downloading',
  'store.readyToInstall',
  'store.required',
  'stranded',
  'ota.downloading',
  'ota.ready',
  'error',
];

export interface SimulationOptions {
  /** Platform to pretend to be. Default: the device's. Download states are Android-only. */
  platform?: PlatformName;
  /** Delay between simulated steps. Default 400 ms. */
  stepMs?: number;
  /** Whether the simulated user accepts store dialogs. Default true. */
  userAccepts?: boolean;
  /**
   * Android: drive Play's FakeAppUpdateManager inside the native module, so the real Kotlin code
   * path runs. Default true when the native module is linked and the scenario starts from an
   * available update.
   */
  nativePlay?: boolean;
}

export interface SimulationSetup {
  scenario: SimulationScenario;
  platform: UpwellPlatform & { dispose(): void };
  ota: SimulatedOta;
  policy: Policy | null;
  policyError: string | null;
  releases: ReleasesDocument;
}

const LATEST = { version: '3.4.0', androidBuild: 340, iosBuild: 1 };

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function simulatedPolicy(latestRuntime: string, latestBuild: number, minimumBuild: number): Policy {
  return {
    schemaVersion: 1,
    android: {
      latest: {
        version: LATEST.version,
        build: latestBuild,
        releasedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
      },
      minimum: { version: '3.0.0', build: minimumBuild },
      recommendAfterDays: 0,
      ota: {
        latestRuntimeVersion: latestRuntime,
        applyMode: 'prompt',
        strandedRequireAfterDays: 30,
      },
      message: {
        title: 'Update available',
        body: 'Version 3.4.0 makes checkout faster. (Simulated)',
      },
    },
    ios: {
      appStoreId: '1234567890',
      latest: {
        version: LATEST.version,
        build: LATEST.iosBuild,
        releasedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
      },
      minimum: { version: '3.0.0', build: 1 },
      recommendAfterDays: 0,
      ota: {
        latestRuntimeVersion: latestRuntime,
        applyMode: 'prompt',
        strandedRequireAfterDays: 30,
      },
      message: {
        title: 'Update available',
        body: 'Version 3.4.0 makes checkout faster. (Simulated)',
      },
    },
  };
}

function simulatedReleases(runtime: string): ReleasesDocument {
  const now = Date.now();
  return {
    schemaVersion: 1,
    releases: [
      {
        id: 'sim-update-2',
        platforms: ['ios', 'android'],
        runtimeVersion: runtime,
        kind: 'fix',
        notes: 'Fixed a crash when opening the cart. (Simulated)',
        publishedAt: new Date(now - 3_600_000).toISOString(),
      },
      {
        id: 'sim-update-1',
        platforms: ['ios', 'android'],
        runtimeVersion: runtime,
        kind: 'content',
        notes: 'Refreshed the home screen banners. (Simulated)',
        publishedAt: new Date(now - 3 * 864e5).toISOString(),
      },
    ],
  };
}

/** A fake OTA tool: check → download → apply, with ids that match the simulated releases. */
export class SimulatedOta implements OtaAdapter {
  readonly name = 'simulated';
  private updateId: string | null;
  constructor(
    private runtimeVersion: string,
    private available: boolean,
    private readonly downloadMs: number,
    currentUpdateId: string | null = 'sim-update-1'
  ) {
    this.updateId = currentUpdateId;
  }

  getRuntime(): OtaRuntime {
    return {
      runtimeVersion: this.runtimeVersion,
      updateId: this.updateId,
      updateIds: this.updateId ? [this.updateId] : [],
      isEmbedded: this.updateId === null,
    };
  }

  async check(): Promise<OtaCheckResult> {
    return { available: this.available };
  }

  async download(): Promise<void> {
    await delay(this.downloadMs);
  }

  /** Pretends the app restarted into the new update. */
  async apply(): Promise<void> {
    await delay(50);
    this.updateId = 'sim-update-2';
    this.available = false;
  }
}

interface SimState {
  installed: BaseInstalledInfo;
  store: StoreInfo | null;
}

/** Fakes the device: installed info, Play state machine, App Store lookup. Never touches native. */
export class SimulatedPlatform implements UpwellPlatform {
  readonly name = 'simulated';
  readonly storage = createMemoryStorage();
  private listeners = new Set<(p: StoreProgress) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    readonly os: PlatformName,
    private state: SimState,
    private readonly stepMs: number,
    private readonly userAccepts: boolean
  ) {}

  async getInstalled() {
    return { ...this.state.installed };
  }

  async getStoreInfo() {
    return this.state.store ? { ...this.state.store } : null;
  }

  private get play(): PlayStoreInfo | null {
    return this.state.store?.kind === 'play' ? this.state.store : null;
  }

  private emit() {
    const play = this.play;
    if (!play) return;
    for (const l of this.listeners) {
      l({
        installStatus: play.installStatus,
        bytesDownloaded: play.bytesDownloaded,
        totalBytesToDownload: play.totalBytesToDownload,
      });
    }
  }

  private after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** Steps a download from pending to downloaded, then (immediate) installs it. */
  runDownload(immediate: boolean) {
    const play = this.play;
    if (!play) return;
    const total = 25_000_000;
    play.installStatus = 'pending';
    play.totalBytesToDownload = 0;
    play.bytesDownloaded = 0;
    this.emit();
    const step = (i: number) => {
      this.after(this.stepMs, () => {
        play.installStatus = 'downloading';
        play.totalBytesToDownload = total;
        play.bytesDownloaded = Math.round((total * i) / 10);
        if (i >= 10) {
          play.installStatus = 'downloaded';
          this.emit();
          if (immediate) this.after(this.stepMs, () => this.install());
          return;
        }
        this.emit();
        step(i + 1);
      });
    };
    step(1);
  }

  private install() {
    const play = this.play;
    if (!play) return;
    play.installStatus = 'installing';
    this.emit();
    this.after(this.stepMs, () => {
      if (play.availableVersionCode != null) {
        this.state.installed.buildNumber = String(play.availableVersionCode);
        this.state.installed.nativeVersion = LATEST.version;
      }
      play.installStatus = 'installed';
      play.updateAvailability = 'notAvailable';
      play.availableVersionCode = null;
      play.bytesDownloaded = 0;
      play.totalBytesToDownload = 0;
      this.emit();
    });
  }

  async startStoreUpdate(flow: StoreFlow, _ctx: StoreFlowContext): Promise<StoreFlowResult> {
    await delay(this.stepMs);
    if (flow === 'appStoreSheet') return 'dismissed';
    if (flow === 'storeLink') return 'opened';
    if (!this.userAccepts) return 'canceled';
    this.runDownload(flow === 'playImmediate');
    return 'accepted';
  }

  async completeStoreUpdate(): Promise<void> {
    if (this.play?.installStatus === 'downloaded') this.install();
  }

  onStoreProgress(listener: (p: StoreProgress) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.listeners.clear();
  }
}

function playInfo(over: Partial<PlayStoreInfo> = {}): PlayStoreInfo {
  return {
    kind: 'play',
    updateAvailability: 'available',
    availableVersionCode: LATEST.androidBuild,
    updatePriority: 0,
    stalenessDays: 5,
    immediateAllowed: true,
    flexibleAllowed: true,
    installStatus: 'unknown',
    bytesDownloaded: 0,
    totalBytesToDownload: 0,
    ...over,
  };
}

function appStoreInfo(version: string): AppStoreInfo {
  return {
    kind: 'appStore',
    version,
    releaseDate: new Date(Date.now() - 5 * 864e5).toISOString(),
    minimumOsVersion: '15.0',
    trackId: 1234567890,
    trackViewUrl: 'https://apps.apple.com/app/id1234567890',
  };
}

/** Wraps the native platform with Play's FakeAppUpdateManager switched on. */
async function createNativePlaySimulation(
  scenario: SimulationScenario,
  options: SimulationOptions
): Promise<SimulationSetup | null> {
  const native = getUpwellNative();
  const real = createNativePlatform();
  if (!native?.setPlaySimulation || !real || real.os !== 'android') return null;

  const installed = await real.getInstalled();
  const build = Number(installed.buildNumber) || 1;
  const config: PlaySimulationConfig = {
    availableVersionCode: build + 10,
    stalenessDays: 5,
    userAccepts: options.userAccepts ?? true,
    stepMs: options.stepMs ?? 400,
  };
  native.setPlaySimulation(config);
  const runtime = '3.3.0';
  return {
    scenario,
    platform: Object.assign(real, {
      name: 'simulated (FakeAppUpdateManager)',
      // Keep simulated prompts and caches out of the real app's storage.
      storage: createMemoryStorage(),
      dispose: () => native.setPlaySimulation?.(null),
    }),
    ota: new SimulatedOta(runtime, false, options.stepMs ?? 400),
    // Required → minimum just above the installed build; otherwise everyone meets it.
    policy: simulatedPolicy(runtime, build + 10, scenario === 'store.required' ? build + 5 : 1),
    policyError: null,
    releases: simulatedReleases(runtime),
  };
}

/** Builds fake device, store, OTA and policy state that make the engine land on `scenario`. */
export async function createSimulation(
  scenario: SimulationScenario,
  options: SimulationOptions = {}
): Promise<SimulationSetup> {
  const androidOnly = scenario === 'store.downloading' || scenario === 'store.readyToInstall';
  const os: PlatformName = androidOnly
    ? 'android'
    : (options.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android'));
  const stepMs = options.stepMs ?? 400;

  const nativeEligible = scenario === 'store.recommended' || scenario === 'store.required';
  if (os === 'android' && nativeEligible && options.nativePlay !== false) {
    const native = await createNativePlaySimulation(scenario, options);
    if (native) return native;
  }

  const latestRuntime = scenario === 'stranded' ? '3.4.0' : '3.3.0';
  const upToDate = scenario === 'upToDate' || scenario.startsWith('ota.') || scenario === 'error';
  const required = scenario === 'store.required';

  const installed: BaseInstalledInfo = {
    platform: os,
    appId: 'com.example.upwell',
    nativeVersion: upToDate ? LATEST.version : required ? '2.9.0' : '3.3.0',
    buildNumber:
      os === 'android'
        ? String(upToDate ? LATEST.androidBuild : required ? 290 : 330)
        : upToDate
          ? String(LATEST.iosBuild)
          : '7',
    installSource: os === 'android' ? 'play' : 'appStore',
    installationId: 'simulated-install',
    osVersion: os === 'android' ? '15' : '18.0',
    regionCode: 'US',
  };

  let store: StoreInfo | null;
  if (os === 'android') {
    store = upToDate
      ? playInfo({
          updateAvailability: 'notAvailable',
          availableVersionCode: null,
          stalenessDays: null,
        })
      : playInfo();
  } else {
    store = appStoreInfo(LATEST.version);
  }

  const platform = new SimulatedPlatform(
    os,
    { installed, store },
    stepMs,
    options.userAccepts ?? true
  );
  if (scenario === 'store.downloading') platform.runDownload(false);
  if (scenario === 'store.readyToInstall' && store?.kind === 'play') {
    store.installStatus = 'downloaded';
    store.bytesDownloaded = 25_000_000;
    store.totalBytesToDownload = 25_000_000;
  }

  const runtime = scenario === 'stranded' ? '3.3.0' : latestRuntime;
  const ota = new SimulatedOta(
    runtime,
    scenario === 'ota.downloading' || scenario === 'ota.ready',
    scenario === 'ota.downloading' ? stepMs * 10 : 0
  );

  return {
    scenario,
    platform,
    ota,
    policy: scenario === 'error' ? null : simulatedPolicy(latestRuntime, LATEST.androidBuild, 300),
    policyError: scenario === 'error' ? 'Simulated network error' : null,
    releases: simulatedReleases(runtime),
  };
}
