import type { AppStoreInfo, DecisionInput, InstalledInfo, PlayStoreInfo, Policy } from '../types';

export const NOW = Date.parse('2026-10-21T12:00:00Z');
export const DAY = 86_400_000;

export function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

export function androidInstalled(over: Partial<InstalledInfo> = {}): InstalledInfo {
  return {
    platform: 'android',
    appId: 'com.example.app',
    nativeVersion: '3.3.0',
    buildNumber: '330',
    runtimeVersion: '3.3.0',
    otaUpdateId: null,
    installSource: 'play',
    installationId: 'install-a',
    osVersion: '15',
    ...over,
  };
}

export function iosInstalled(over: Partial<InstalledInfo> = {}): InstalledInfo {
  return {
    platform: 'ios',
    appId: 'com.example.app',
    nativeVersion: '3.3.0',
    buildNumber: '12',
    runtimeVersion: '3.3.0',
    otaUpdateId: null,
    installSource: 'appStore',
    installationId: 'install-a',
    osVersion: '18.0',
    ...over,
  };
}

export function play(over: Partial<PlayStoreInfo> = {}): PlayStoreInfo {
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
  };
}

export function appStore(over: Partial<AppStoreInfo> = {}): AppStoreInfo {
  return {
    kind: 'appStore',
    version: '3.4.0',
    releaseDate: daysAgo(5),
    minimumOsVersion: '16.0',
    trackId: 1234567890,
    trackViewUrl: 'https://apps.apple.com/us/app/example/id1234567890',
    ...over,
  };
}

export function policy(over: { android?: object; ios?: object } = {}): Policy {
  return {
    schemaVersion: 1,
    android: {
      latest: { version: '3.4.0', build: 340, releasedAt: daysAgo(5) },
      minimum: { version: '3.0.0', build: 300 },
      recommendAfterDays: 2,
      requireAfterDays: null,
      rollout: 100,
      ota: { latestRuntimeVersion: '3.3.0', applyMode: 'nextLaunch', strandedRequireAfterDays: 14 },
      message: { title: 'Update available', body: 'Grab the latest version.' },
      ...over.android,
    },
    ios: {
      latest: { version: '3.4.0', build: 1, releasedAt: daysAgo(5) },
      minimum: { version: '3.0.0', build: 1 },
      recommendAfterDays: 2,
      requireAfterDays: null,
      rollout: 100,
      appStoreId: '1234567890',
      ota: { latestRuntimeVersion: '3.3.0', applyMode: 'prompt', strandedRequireAfterDays: 14 },
      ...over.ios,
    },
  };
}

export function input(over: Partial<DecisionInput> = {}): DecisionInput {
  return {
    installed: androidInstalled(),
    policy: policy(),
    store: play(),
    ota: { status: 'upToDate' },
    prompts: {},
    now: NOW,
    ...over,
  };
}
