import { explain as runEngine, targetKey } from './core/decide';
import { findRelease, releaseHistory } from './core/releases';
import type {
  Decision,
  EngineConfig,
  Explanation,
  InstalledInfo,
  IosPolicy,
  OtaInfo,
  Policy,
  PromptHistory,
  Release,
  ReleasesDocument,
  StoreFlow,
  StoreInfo,
} from './core/types';
import { type ValidationResult, validatePolicy, validateReleases } from './core/validate';
import type { OtaAdapter } from './ota/types';
import { createNativePlatform } from './platform/nativePlatform';
import type {
  BaseInstalledInfo,
  KeyValueStorage,
  StoreFlowResult,
  StoreProgress,
  UpwellPlatform,
} from './platform/types';
import {
  createSimulation,
  type SimulationOptions,
  type SimulationScenario,
  type SimulationSetup,
} from './simulation';
import { type PolicySource, type ReleasesSource, type Source, toSource } from './sources';

export interface UpwellOptions {
  /** Policy URL or source. */
  policy: PolicySource | string;
  /** Optional `releases.json` URL or source, for "What's new". */
  releases?: ReleasesSource | string;
  /** OTA tool adapter, e.g. `expoUpdatesAdapter()` from `upwell/expo-updates`. */
  ota?: OtaAdapter;
  /** Device access. Default: the Upwell native module. */
  platform?: UpwellPlatform | null;
  /** Snooze and prompt-cap settings. */
  engine?: Partial<EngineConfig>;
  /** Minimum time between automatic (foreground) checks. Default 60 s. */
  minCheckIntervalMs?: number;
  /** Network timeout for policy and releases. Default 10 s. */
  timeoutMs?: number;
  /** Download OTA updates as soon as they are found. Default true. */
  autoDownloadOta?: boolean;
  /** Logs every decision's trace to the console. */
  debug?: boolean;
  now?: () => number;
  onDecision?: (explanation: Explanation) => void;
  onError?: (error: unknown, context: string) => void;
}

export interface UpwellState {
  status: 'idle' | 'checking' | 'ready';
  decision: Decision;
  /** Why the engine decided what it did. */
  trace: string[];
  /** The user dismissed the prompt for the current decision this session. */
  dismissed: boolean;
  /** A store flow or OTA restart is in progress. */
  busy: boolean;
  installed: InstalledInfo | null;
  policy: Policy | null;
  policyError: string | null;
  policyWarnings: string[];
  store: StoreInfo | null;
  ota: OtaInfo;
  releases: ReleasesDocument | null;
  /** releases.json entry of the running OTA update. */
  currentRelease: Release | null;
  /** releases.json entries for the running runtime, newest first. */
  history: Release[];
  /** Set after an OTA update was applied, until `markUpdateSeen()`. */
  justUpdated: Release | null;
  lastCheckedAt: number | null;
  simulation: SimulationScenario | null;
}

type Listener = (state: UpwellState) => void;

const KEYS = {
  policy: 'policy',
  releases: 'releases',
  prompts: 'prompts',
  lastSeenUpdateId: 'lastSeenUpdateId',
};

const INITIAL_DECISION: Decision = { kind: 'upToDate', because: 'not checked yet' };

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function readJson<T>(storage: KeyValueStorage, key: string): T | null {
  try {
    const raw = storage.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function unavailablePlatform(): UpwellPlatform {
  const fail = async (): Promise<never> => {
    throw new Error(
      'The Upwell native module is not linked (Expo Go or web?). Use a development build, or simulate() to try the flows.'
    );
  };
  const memory = new Map<string, string>();
  return {
    name: 'unavailable',
    os: 'android',
    storage: {
      get: (k) => memory.get(k) ?? null,
      set: (k, v) => {
        memory.set(k, v);
      },
      remove: (k) => {
        memory.delete(k);
      },
    },
    getInstalled: fail,
    getStoreInfo: async () => null,
    startStoreUpdate: async () => 'failed',
    completeStoreUpdate: async () => {},
    onStoreProgress: () => () => {},
  };
}

/**
 * Runs Upwell end to end: reads the device, fetches the policy, asks the stores and the OTA tool,
 * runs `decide()`, and performs the resulting update. Framework-agnostic; `upwell/react` wraps it.
 */
export class UpwellController {
  private readonly options: UpwellOptions;
  private readonly now: () => number;
  private readonly realPlatform: UpwellPlatform;
  private platform: UpwellPlatform;
  private ota: OtaAdapter | undefined;
  private policySource: PolicySource;
  private releasesSource: ReleasesSource | undefined;
  private simulationSetup: SimulationSetup | null = null;

  private state: UpwellState;
  private listeners = new Set<Listener>();
  private inflight: Promise<Decision> | null = null;
  private unsubscribeProgress: () => void = () => {};

  private baseInstalled: BaseInstalledInfo | null = null;
  private prompts: PromptHistory = {};
  /** Prompt history as of session start; shows this session don't hide the current prompt. */
  private promptsSnapshot: PromptHistory = {};
  private promptsLoaded = false;
  private shownThisSession: string | null = null;
  private dismissedKinds = new Set<Decision['kind']>();
  private otaDownload: Promise<void> | null = null;
  private disposed = false;

  constructor(options: UpwellOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.realPlatform =
      options.platform === undefined
        ? (createNativePlatform() ?? unavailablePlatform())
        : (options.platform ?? unavailablePlatform());
    this.platform = this.realPlatform;
    this.ota = options.ota;
    this.policySource = toSource(options.policy);
    this.releasesSource = options.releases ? toSource(options.releases) : undefined;
    this.state = {
      status: 'idle',
      decision: INITIAL_DECISION,
      trace: [],
      dismissed: false,
      busy: false,
      installed: null,
      policy: null,
      policyError: null,
      policyWarnings: [],
      store: null,
      ota: { status: options.ota ? 'idle' : 'disabled' },
      releases: null,
      currentRelease: null,
      history: [],
      justUpdated: null,
      lastCheckedAt: null,
      simulation: null,
    };
    this.listenToStore();
  }

  // ── Subscription ─────────────────────────────────────────────────────────

  getState = (): UpwellState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setState(patch: Partial<UpwellState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private get storage(): KeyValueStorage {
    return this.platform.storage;
  }

  private reportError(e: unknown, context: string) {
    this.options.onError?.(e, context);
    if (this.options.debug) console.warn(`[upwell] ${context}: ${message(e)}`);
  }

  // ── Checking ─────────────────────────────────────────────────────────────

  /**
   * Re-evaluates everything. Concurrent calls share one run. Without `force`, a check within
   * `minCheckIntervalMs` of the last one returns the current decision.
   */
  check(opts: { force?: boolean } = {}): Promise<Decision> {
    if (this.inflight) return this.inflight;
    const last = this.state.lastCheckedAt;
    const interval = this.options.minCheckIntervalMs ?? 60_000;
    if (!opts.force && last != null && this.now() - last < interval) {
      return Promise.resolve(this.state.decision);
    }
    this.inflight = this.runCheck().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async runCheck(): Promise<Decision> {
    this.setState({ status: 'checking' });
    this.loadPrompts();

    let base: BaseInstalledInfo;
    try {
      base = this.baseInstalled ?? (await this.platform.getInstalled());
      this.baseInstalled = base;
    } catch (e) {
      this.reportError(e, 'reading installed info');
      const decision: Decision = {
        kind: 'error',
        reason: message(e),
        lastKnownGood: false,
        because: `error: ${message(e)}`,
      };
      this.setState({
        status: 'ready',
        decision,
        trace: [decision.because],
        lastCheckedAt: this.now(),
      });
      return decision;
    }

    const runtime = this.ota?.getRuntime();
    const installed: InstalledInfo = {
      ...base,
      runtimeVersion: runtime?.runtimeVersion || base.embeddedRuntimeVersion || null,
      otaUpdateId: runtime?.updateId ?? null,
    };

    const sim = this.simulationSetup;
    const [policyResult, releasesResult] = await Promise.all([
      sim
        ? Promise.resolve({ value: sim.policy, error: sim.policyError, warnings: [] as string[] })
        : this.fetchValidated(this.policySource, validatePolicy, KEYS.policy),
      sim
        ? Promise.resolve({ value: sim.releases, error: null, warnings: [] as string[] })
        : this.releasesSource
          ? this.fetchValidated(this.releasesSource, validateReleases, KEYS.releases)
          : Promise.resolve({ value: null, error: null, warnings: [] as string[] }),
      this.checkOta(),
    ]);
    if (releasesResult.error) this.reportError(new Error(releasesResult.error), 'loading releases');

    const policy = policyResult.value;
    let store: StoreInfo | null = null;
    try {
      store = await this.platform.getStoreInfo(base, policy?.[base.platform]);
    } catch (e) {
      this.reportError(e, 'reading store info');
    }

    const releases = releasesResult.value;
    const updateIds = runtime?.updateIds?.length ? runtime.updateIds : [runtime?.updateId];
    const currentRelease = findRelease(releases, { platform: base.platform, updateIds });
    const history = releaseHistory(releases, {
      platform: base.platform,
      runtimeVersion: installed.runtimeVersion,
    });

    this.setState({
      installed,
      policy,
      policyError: policyResult.error,
      policyWarnings: policyResult.warnings,
      store,
      releases,
      currentRelease,
      history,
      justUpdated: this.detectJustUpdated(runtime?.updateId ?? null, currentRelease, releases),
      lastCheckedAt: this.now(),
    });
    const decision = this.recompute();
    this.setState({ status: 'ready' });
    this.maybeDownloadOta();
    return decision;
  }

  private async fetchValidated<T>(
    source: Source<T>,
    validate: (v: unknown) => ValidationResult<T>,
    key: string
  ): Promise<{ value: T | null; error: string | null; warnings: string[] }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    let error: string;
    let warnings: string[] = [];
    try {
      const result = validate(await source.fetch(controller.signal));
      warnings = result.warnings;
      if (result.ok) {
        try {
          this.storage.set(key, JSON.stringify(result.value));
        } catch (e) {
          this.reportError(e, 'caching');
        }
        return { value: result.value, error: null, warnings };
      }
      error = `invalid ${key}: ${result.errors.join('; ')}`;
    } catch (e) {
      error = controller.signal.aborted ? `${key} fetch timed out` : message(e);
    } finally {
      clearTimeout(timer);
    }
    // Fall back to the last known good copy.
    const cached = readJson<unknown>(this.storage, key);
    const valid = cached ? validate(cached) : null;
    return { value: valid?.ok ? valid.value : null, error, warnings };
  }

  private async checkOta(): Promise<void> {
    const ota = this.ota;
    if (!ota) return;
    const status = this.state.ota.status;
    if (status === 'ready' || status === 'downloading') return;
    this.setState({ ota: { status: 'checking' } });
    try {
      const r = await ota.check();
      this.setState({
        ota: { status: r.disabled ? 'disabled' : r.available ? 'available' : 'upToDate' },
      });
    } catch (e) {
      this.reportError(e, 'checking for OTA updates');
      this.setState({ ota: { status: 'error', error: message(e) } });
    }
  }

  private maybeDownloadOta() {
    const ota = this.ota;
    if (!ota || this.state.ota.status !== 'available' || this.otaDownload) return;
    if (this.options.autoDownloadOta === false) return;
    this.setState({ ota: { status: 'downloading' } });
    this.recompute();
    this.otaDownload = ota
      .download()
      .then(() => {
        this.setState({ ota: { status: 'ready' } });
        const decision = this.recompute();
        if (decision.kind === 'ota.ready' && decision.applyMode === 'immediate') {
          void this.applyOta();
        }
      })
      .catch((e) => {
        this.reportError(e, 'downloading the OTA update');
        this.setState({ ota: { status: 'error', error: message(e) } });
        this.recompute();
      })
      .finally(() => {
        this.otaDownload = null;
      });
  }

  private detectJustUpdated(
    updateId: string | null,
    current: Release | null,
    releases: ReleasesDocument | null
  ): Release | null {
    if (!updateId) return null;
    let lastSeen: string | null = null;
    try {
      lastSeen = this.storage.get(KEYS.lastSeenUpdateId);
      if (!lastSeen || (releases && !current)) {
        // First launch, or an update without notes: nothing to announce.
        this.storage.set(KEYS.lastSeenUpdateId, updateId);
        return null;
      }
    } catch (e) {
      this.reportError(e, 'reading update history');
      return null;
    }
    return lastSeen !== updateId ? current : null;
  }

  /** Runs the engine on the latest inputs without touching the network. */
  private recompute(): Decision {
    const installed = this.state.installed;
    if (!installed) return this.state.decision;
    const explanation = runEngine({
      installed,
      policy: this.state.policy,
      policyError: this.state.policyError,
      store: this.state.store,
      ota: this.ota ? this.state.ota : null,
      prompts: this.promptsSnapshot,
      now: this.now(),
      config: this.options.engine,
    });
    let decision = explanation.decision;
    const trace = [...explanation.trace];
    // A declined "restart to update" OTA prompt falls back to applying on next launch.
    if (
      decision.kind === 'ota.ready' &&
      decision.applyMode === 'prompt' &&
      this.dismissedKinds.has('ota.ready')
    ) {
      decision = {
        ...decision,
        applyMode: 'nextLaunch',
        because: `${decision.because} (prompt dismissed, applying on next launch)`,
      };
      trace.push('ota: restart prompt dismissed this session');
    }
    this.recordPromptShown(decision);
    this.setState({ decision, trace, dismissed: this.dismissedKinds.has(decision.kind) });
    if (this.options.debug) console.log(`[upwell]\n  ${trace.join('\n  ')}`);
    this.options.onDecision?.({ decision, trace });
    return decision;
  }

  // ── Prompt history ───────────────────────────────────────────────────────

  private loadPrompts() {
    if (this.promptsLoaded) return;
    this.promptsLoaded = true;
    this.prompts = readJson<PromptHistory>(this.storage, KEYS.prompts) ?? {};
    this.promptsSnapshot = { ...this.prompts, shownAt: [...(this.prompts.shownAt ?? [])] };
  }

  private savePrompts() {
    try {
      this.storage.set(KEYS.prompts, JSON.stringify(this.prompts));
    } catch (e) {
      this.reportError(e, 'saving prompt history');
    }
  }

  private recordPromptShown(decision: Decision) {
    if (decision.kind !== 'store.recommended') return;
    const key = targetKey(decision.target);
    if (this.shownThisSession === key) return;
    this.shownThisSession = key;
    const cutoff = this.now() - 30 * 864e5;
    this.prompts.shownAt = [...(this.prompts.shownAt ?? []).filter((t) => t > cutoff), this.now()];
    this.savePrompts();
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Does whatever the current decision calls for: store flow, install, or OTA restart. */
  async startUpdate(): Promise<StoreFlowResult | void> {
    const d = this.state.decision;
    switch (d.kind) {
      case 'store.recommended':
      case 'store.required':
        return this.startStoreUpdate(d.flow);
      case 'store.readyToInstall':
        return this.completeStoreUpdate();
      case 'ota.ready':
        return this.applyOta();
      default:
        return undefined;
    }
  }

  /** Starts a store flow. Defaults to the flow of the current decision. */
  async startStoreUpdate(flow?: StoreFlow): Promise<StoreFlowResult> {
    const d = this.state.decision;
    const chosen =
      flow ??
      (d.kind === 'store.recommended' || d.kind === 'store.required' ? d.flow : 'storeLink');
    const installed = this.baseInstalled;
    if (!installed) return 'failed';
    const storeUrl =
      d.kind === 'store.recommended' || d.kind === 'store.required' ? d.storeUrl : null;
    const ios = this.state.policy?.ios as IosPolicy | undefined;
    const store = this.state.store;
    const appStoreId =
      ios?.appStoreId ??
      (store?.kind === 'appStore' && store.trackId != null ? String(store.trackId) : null);

    this.setState({ busy: true });
    try {
      const result = await this.platform.startStoreUpdate(chosen, {
        storeUrl,
        appStoreId,
        installed,
      });
      // Saying no to Play's own dialog counts as a dismissal (snooze), but never for required updates.
      if (result === 'canceled' && d.kind === 'store.recommended') this.dismiss();
      if (
        result === 'failed' &&
        (chosen === 'playFlexible' || chosen === 'playImmediate') &&
        storeUrl
      ) {
        return await this.platform.startStoreUpdate('storeLink', {
          storeUrl,
          appStoreId,
          installed,
        });
      }
      return result;
    } catch (e) {
      this.reportError(e, 'starting the store update');
      if (storeUrl && chosen !== 'storeLink') {
        return this.platform.startStoreUpdate('storeLink', { storeUrl, appStoreId, installed });
      }
      return 'failed';
    } finally {
      this.setState({ busy: false });
    }
  }

  /** Installs a downloaded flexible update. The app restarts. */
  async completeStoreUpdate(): Promise<void> {
    this.setState({ busy: true });
    try {
      await this.platform.completeStoreUpdate();
    } catch (e) {
      this.reportError(e, 'installing the store update');
    } finally {
      this.setState({ busy: false });
    }
  }

  /** Restarts into the downloaded OTA update. */
  async applyOta(): Promise<void> {
    if (!this.ota) return;
    this.setState({ busy: true });
    try {
      await this.ota.apply();
      // Only reached when the tool didn't reload the JS (simulation, tests).
      this.setState({ ota: { status: 'idle' } });
      await this.check({ force: true });
    } catch (e) {
      this.reportError(e, 'applying the OTA update');
    } finally {
      this.setState({ busy: false });
    }
  }

  /**
   * "Later". Snoozes a recommended store update; hides an OTA restart prompt or a
   * "restart to update" bar for this session. Required updates can't be dismissed.
   */
  dismiss(): void {
    const d = this.state.decision;
    if (d.kind === 'store.recommended') {
      const now = this.now();
      const key = targetKey(d.target);
      this.prompts = { ...this.prompts, dismissedAt: now, dismissedTarget: key };
      this.promptsSnapshot = { ...this.promptsSnapshot, dismissedAt: now, dismissedTarget: key };
      this.savePrompts();
    } else if (
      d.kind === 'ota.ready' ||
      d.kind === 'store.readyToInstall' ||
      d.kind === 'ota.downloading'
    ) {
      this.dismissedKinds.add(d.kind);
    } else {
      return;
    }
    this.recompute();
  }

  /** Clears `justUpdated` so the "Updated" sheet isn't shown again. */
  markUpdateSeen(): void {
    const id = this.state.installed?.otaUpdateId;
    if (id) {
      try {
        this.storage.set(KEYS.lastSeenUpdateId, id);
      } catch (e) {
        this.reportError(e, 'saving update history');
      }
    }
    this.setState({ justUpdated: null });
  }

  /** The current decision and every rule the engine evaluated. */
  explain(): Explanation {
    return { decision: this.state.decision, trace: this.state.trace };
  }

  /**
   * Call on app state changes. A downloaded flexible update the user put off is installed
   * silently when the app goes to the background.
   */
  handleAppStateChange(next: 'active' | 'background' | 'inactive' | string): void {
    if (
      next === 'background' &&
      this.state.decision.kind === 'store.readyToInstall' &&
      this.state.dismissed
    ) {
      void this.completeStoreUpdate();
    }
    if (next === 'active') void this.check();
  }

  // ── Simulation ───────────────────────────────────────────────────────────

  /**
   * Dev tool: jumps to a scenario with fake device, store, OTA and policy state, then lets you
   * step through the flows. Pass null to go back to the real device.
   */
  async simulate(
    scenario: SimulationScenario | null,
    options?: SimulationOptions
  ): Promise<Decision> {
    this.simulationSetup?.platform.dispose();
    this.simulationSetup = null;
    if (scenario) {
      const setup = await createSimulation(scenario, options);
      this.simulationSetup = setup;
      this.platform = setup.platform;
      this.ota = setup.ota;
    } else {
      this.platform = this.realPlatform;
      this.ota = this.options.ota;
    }
    this.resetSession();
    this.listenToStore();
    this.setState({
      simulation: scenario,
      ota: { status: this.ota ? 'idle' : 'disabled' },
      justUpdated: null,
    });
    return this.check({ force: true });
  }

  private resetSession() {
    this.baseInstalled = null;
    this.promptsLoaded = false;
    this.shownThisSession = null;
    this.dismissedKinds.clear();
    this.otaDownload = null;
  }

  // ── Store progress ───────────────────────────────────────────────────────

  private listenToStore() {
    this.unsubscribeProgress();
    this.unsubscribeProgress = this.platform.onStoreProgress((p) => this.onStoreProgress(p));
  }

  private onStoreProgress(p: StoreProgress) {
    const store = this.state.store;
    if (p.installStatus === 'installed') {
      // A new binary is in place; read everything again.
      this.baseInstalled = null;
      void this.check({ force: true });
      return;
    }
    if (store?.kind !== 'play') return;
    this.setState({ store: { ...store, ...p } });
    if (p.installStatus === 'downloaded') this.dismissedKinds.delete('store.readyToInstall');
    this.recompute();
  }

  dispose(): void {
    this.unsubscribeProgress();
    this.simulationSetup?.platform.dispose();
    this.listeners.clear();
    this.disposed = true;
  }
}

export function createUpwell(options: UpwellOptions): UpwellController {
  return new UpwellController(options);
}
