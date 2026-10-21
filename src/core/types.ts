export type Platform = 'ios' | 'android';

/** Where the installed binary came from. Play flows only work for `play`. */
export type InstallSource = 'play' | 'appStore' | 'testFlight' | 'sideload' | 'unknown';

/** When a downloaded OTA update is applied. */
export type ApplyMode = 'nextLaunch' | 'prompt' | 'immediate';

/** What is installed on this device, read natively plus the OTA adapter. */
export interface InstalledInfo {
  platform: Platform;
  /** Android package name / iOS bundle identifier. */
  appId: string;
  /** versionName / CFBundleShortVersionString, for display. */
  nativeVersion: string;
  /** versionCode / CFBundleVersion, used for comparisons. */
  buildNumber: string;
  runtimeVersion: string | null;
  otaUpdateId: string | null;
  installSource: InstallSource;
  /** Random per-install id, used for rollout bucketing. */
  installationId: string;
  /** OS version, e.g. "17.4" or "14" (Android API level is not used here). */
  osVersion?: string | null;
}

// ─── Policy (remote JSON) ────────────────────────────────────────────────────

export interface VersionRef {
  /** Display version, e.g. "3.4.0". */
  version: string;
  /** Build number (versionCode / CFBundleVersion). Compared numerically per dot segment. */
  build: number | string;
  /** ISO date the version shipped to the store. Drives staleness on iOS. */
  releasedAt?: string;
}

export interface OtaPolicy {
  /** Runtime version the newest OTA updates target. Installs on another runtime are "stranded". */
  latestRuntimeVersion?: string;
  applyMode?: ApplyMode;
  /** Days after which a stranded install is required (not just recommended) to update. */
  strandedRequireAfterDays?: number | null;
}

export interface PolicyMessage {
  title?: string;
  body?: string;
  releaseNotesUrl?: string;
}

export interface PlatformPolicy {
  /** Newest version in the store. */
  latest?: VersionRef;
  /** Installs below this are required to update. */
  minimum?: VersionRef;
  /** Recommend an update once it is this many days old. Default 0. */
  recommendAfterDays?: number | null;
  /** Require an update once it is this many days old. Default: never. */
  requireAfterDays?: number | null;
  /** Percentage (0–100) of installs that see store prompts. Default 100. */
  rollout?: number;
  ota?: OtaPolicy;
  /** Copy for recommended updates. */
  message?: PolicyMessage;
  /** Copy for required (blocking) updates. Default: the UI kit's built-in copy. */
  requiredMessage?: PolicyMessage;
  /** Overrides the store URL used for store-link prompts. */
  storeUrl?: string;
}

export interface IosPolicy extends PlatformPolicy {
  /** Numeric App Store id, used for the in-app App Store sheet. */
  appStoreId?: string;
  /** Two-letter storefront country for the App Store lookup. Default: device region. */
  country?: string;
}

export interface Policy {
  schemaVersion: 1;
  android?: PlatformPolicy;
  ios?: IosPolicy;
}

// ─── Store info (native) ─────────────────────────────────────────────────────

export type PlayUpdateAvailability = 'unknown' | 'notAvailable' | 'available' | 'inProgress';

export type PlayInstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export interface PlayStoreInfo {
  kind: 'play';
  updateAvailability: PlayUpdateAvailability;
  availableVersionCode: number | null;
  /** 0–5, set per release through the Play Developer API. */
  updatePriority: number;
  /** Days since Play learned about the update on this device, or null. */
  stalenessDays: number | null;
  immediateAllowed: boolean;
  flexibleAllowed: boolean;
  installStatus: PlayInstallStatus;
  bytesDownloaded: number;
  totalBytesToDownload: number;
}

export interface AppStoreInfo {
  kind: 'appStore';
  version: string | null;
  releaseDate: string | null;
  minimumOsVersion: string | null;
  trackId: number | null;
  trackViewUrl: string | null;
}

export type StoreInfo = PlayStoreInfo | AppStoreInfo;

// ─── OTA ─────────────────────────────────────────────────────────────────────

export type OtaStatus =
  'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'upToDate' | 'disabled' | 'error';

export interface OtaInfo {
  status: OtaStatus;
  error?: string;
}

// ─── Prompts / config ────────────────────────────────────────────────────────

export interface PromptHistory {
  /** Epoch ms of the last dismissal. */
  dismissedAt?: number;
  /** Target key (see `targetKey`) that was dismissed. Snooze only applies to that target. */
  dismissedTarget?: string;
  /** Epoch ms of each time a store prompt was shown. */
  shownAt?: number[];
}

export interface EngineConfig {
  /** Hours a dismissed recommendation stays hidden. */
  snoozeHours: number;
  /** Max recommended prompts within `promptPeriodHours`. */
  maxPrompts: number;
  promptPeriodHours: number;
}

export interface DecisionInput {
  installed: InstalledInfo;
  /** Fresh policy, or the last known good one when `policyError` is set. */
  policy: Policy | null;
  /** Set when the latest fetch failed or was invalid. */
  policyError?: string | null;
  store?: StoreInfo | null;
  ota?: OtaInfo | null;
  prompts?: PromptHistory;
  /** Epoch ms. */
  now: number;
  config?: Partial<EngineConfig>;
}

// ─── Decision ────────────────────────────────────────────────────────────────

export type StoreFlow = 'playImmediate' | 'playFlexible' | 'appStoreSheet' | 'storeLink';

export interface TargetVersion {
  version: string | null;
  build: string | null;
}

export type RequiredReason = 'belowMinimum' | 'stale' | 'stranded';
export type RecommendedReason = 'newerVersion' | 'highPriority' | 'stranded';

interface Explained {
  /** One-line reason, e.g. "required: build 290 < minimum 300". */
  because: string;
}

interface StorePrompt extends Explained {
  flow: StoreFlow;
  target: TargetVersion;
  storeUrl: string | null;
  message: PolicyMessage | null;
}

export type Decision =
  | ({ kind: 'upToDate'; snoozed?: { target: TargetVersion; until: number | null } } & Explained)
  | ({ kind: 'ota.downloading' } & Explained)
  | ({ kind: 'ota.ready'; applyMode: ApplyMode } & Explained)
  | ({ kind: 'store.recommended'; reason: RecommendedReason } & StorePrompt)
  | ({
      kind: 'store.downloading';
      /** 0–1, or null while the size is unknown. */
      progress: number | null;
      bytesDownloaded: number;
      totalBytesToDownload: number;
      required: boolean;
      target: TargetVersion;
    } & Explained)
  | ({ kind: 'store.readyToInstall'; target: TargetVersion } & Explained)
  | ({ kind: 'store.required'; reason: RequiredReason } & StorePrompt)
  | ({ kind: 'error'; reason: string; lastKnownGood: boolean } & Explained);

export type DecisionKind = Decision['kind'];

export interface Explanation {
  decision: Decision;
  /** Every rule the engine evaluated, in order. */
  trace: string[];
}

// ─── releases.json ───────────────────────────────────────────────────────────

export type ReleaseKind = 'fix' | 'content' | 'feature';

export interface Release {
  /** OTA update id or update group id. */
  id: string;
  platforms: Platform[];
  runtimeVersion: string;
  kind: ReleaseKind;
  /** User-facing description of what changed. */
  notes: string;
  /** ISO timestamp. */
  publishedAt: string;
  /** "sha256-…" of the bundle. Reserved for the signed release log. */
  bundleHash?: string;
}

export interface ReleasesDocument {
  schemaVersion: 1;
  releases: Release[];
}
