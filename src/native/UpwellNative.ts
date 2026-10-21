import { type EventSubscription, type NativeModule, requireOptionalNativeModule } from 'expo';

import type { InstallSource, PlayInstallStatus, PlayStoreInfo } from '../core/types';

export interface NativeInstalledInfo {
  appId: string;
  nativeVersion: string;
  buildNumber: string;
  installSource: InstallSource;
  /** Android installer package name, when known. */
  installer?: string | null;
  installationId: string;
  osVersion: string | null;
  /** Device region, used as the default App Store lookup country. */
  regionCode?: string | null;
}

export type PlayStartResult = 'accepted' | 'canceled' | 'failed' | 'notStarted';

export interface PlayInstallStateEvent {
  status: PlayInstallStatus;
  bytesDownloaded: number;
  totalBytesToDownload: number;
  errorCode: number;
}

/** Configures Play's FakeAppUpdateManager (Android only). */
export interface PlaySimulationConfig {
  /** null → no update available. */
  availableVersionCode: number | null;
  updatePriority?: number;
  stalenessDays?: number | null;
  allowedUpdateType?: 'both' | 'flexible' | 'immediate';
  /** Whether the simulated user accepts the Play dialog. Default true. */
  userAccepts?: boolean;
  failDownload?: boolean;
  totalBytes?: number;
  /** Delay between simulated progress steps. Default 400 ms. */
  stepMs?: number;
}

type Events = {
  onPlayInstallState: (event: PlayInstallStateEvent) => void;
};

export declare class UpwellNativeModule extends NativeModule<Events> {
  getInstalledInfo(): NativeInstalledInfo;
  storageGet(key: string): string | null;
  storageSet(key: string, value: string): void;
  storageRemove(key: string): void;
  // Android
  checkPlayUpdate?(): Promise<PlayStoreInfo>;
  startPlayUpdate?(type: 'flexible' | 'immediate'): Promise<PlayStartResult>;
  completePlayUpdate?(): Promise<void>;
  setPlaySimulation?(config: PlaySimulationConfig | null): boolean;
  // iOS
  presentAppStore?(appStoreId: string): Promise<'dismissed'>;
}

let cached: UpwellNativeModule | null | undefined;

/** The native module, or null in Expo Go, on web and in tests. */
export function getUpwellNative(): UpwellNativeModule | null {
  if (cached === undefined) {
    try {
      cached = requireOptionalNativeModule<UpwellNativeModule>('Upwell');
    } catch {
      cached = null;
    }
  }
  return cached;
}

export type { EventSubscription };
