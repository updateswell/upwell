import type {
  InstalledInfo,
  PlatformPolicy,
  PlayInstallStatus,
  Platform as PlatformName,
  StoreFlow,
  StoreInfo,
} from '../core/types';

/** Synchronous key-value storage (SharedPreferences / UserDefaults). */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export type BaseInstalledInfo = Omit<InstalledInfo, 'runtimeVersion' | 'otaUpdateId'> & {
  regionCode?: string | null;
};

export type StoreFlowResult =
  'accepted' | 'canceled' | 'failed' | 'notStarted' | 'dismissed' | 'opened';

export interface StoreFlowContext {
  storeUrl: string | null;
  appStoreId: string | null;
  installed: BaseInstalledInfo;
}

/** Live Play install progress pushed by the platform. */
export interface StoreProgress {
  installStatus: PlayInstallStatus;
  bytesDownloaded: number;
  totalBytesToDownload: number;
}

/**
 * Everything the controller needs from the device. `createNativePlatform()` talks to the Upwell
 * native module; `SimulatedPlatform` fakes it for dev tools and tests.
 */
export interface UpwellPlatform {
  readonly name: string;
  readonly os: PlatformName;
  readonly storage: KeyValueStorage;
  getInstalled(): Promise<BaseInstalledInfo>;
  getStoreInfo(
    installed: BaseInstalledInfo,
    policy: PlatformPolicy | undefined
  ): Promise<StoreInfo | null>;
  startStoreUpdate(flow: StoreFlow, ctx: StoreFlowContext): Promise<StoreFlowResult>;
  /** Installs a downloaded flexible update (the app restarts). */
  completeStoreUpdate(): Promise<void>;
  onStoreProgress(listener: (progress: StoreProgress) => void): () => void;
}
