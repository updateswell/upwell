import type { IosPolicy, PlatformPolicy, StoreFlow, StoreInfo } from '@upwell/core';
import { Linking, Platform } from 'react-native';

import { lookupAppStore } from './appStoreLookup';
import type {
  BaseInstalledInfo,
  KeyValueStorage,
  StoreFlowContext,
  StoreFlowResult,
  StoreProgress,
  UpwellPlatform,
} from './types';
import { getUpwellNative, type UpwellNativeModule } from '../native/UpwellNative';

export interface NativePlatformOptions {
  /** Overrides fetch for the App Store lookup. */
  fetch?: typeof fetch;
  lookupTimeoutMs?: number;
}

/** Opens a store page. On Android, Play URLs go through `market://` to skip the browser. */
export async function openStoreUrl(url: string | null, appId?: string): Promise<StoreFlowResult> {
  if (!url) return 'failed';
  if (
    Platform.OS === 'android' &&
    appId &&
    url.startsWith('https://play.google.com/store/apps/details')
  ) {
    try {
      await Linking.openURL(`market://details?id=${encodeURIComponent(appId)}`);
      return 'opened';
    } catch {
      // No Play Store app; fall through to the web page.
    }
  }
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}

class NativePlatform implements UpwellPlatform {
  readonly name = 'native';
  readonly os = Platform.OS === 'ios' ? 'ios' : 'android';
  readonly storage: KeyValueStorage;

  constructor(
    private readonly native: UpwellNativeModule,
    private readonly options: NativePlatformOptions
  ) {
    this.storage = {
      get: (key) => native.storageGet(key),
      set: (key, value) => native.storageSet(key, value),
      remove: (key) => native.storageRemove(key),
    };
  }

  async getInstalled(): Promise<BaseInstalledInfo> {
    const info = this.native.getInstalledInfo();
    return { ...info, platform: this.os, osVersion: info.osVersion ?? null };
  }

  async getStoreInfo(
    installed: BaseInstalledInfo,
    policy: PlatformPolicy | undefined
  ): Promise<StoreInfo | null> {
    if (this.os === 'android') {
      // Play rejects the API for installs it didn't make; don't ask (a common crash elsewhere).
      if (installed.installSource !== 'play' || !this.native.checkPlayUpdate) return null;
      return this.native.checkPlayUpdate();
    }
    const ios = policy as IosPolicy | undefined;
    return lookupAppStore({
      bundleId: installed.appId,
      appStoreId: ios?.appStoreId,
      country: ios?.country ?? installed.regionCode,
      fetch: this.options.fetch,
      timeoutMs: this.options.lookupTimeoutMs,
    });
  }

  async startStoreUpdate(flow: StoreFlow, ctx: StoreFlowContext): Promise<StoreFlowResult> {
    switch (flow) {
      case 'playFlexible':
      case 'playImmediate':
        if (!this.native.startPlayUpdate) return 'failed';
        return this.native.startPlayUpdate(flow === 'playImmediate' ? 'immediate' : 'flexible');
      case 'appStoreSheet':
        if (ctx.appStoreId && this.native.presentAppStore) {
          try {
            return await this.native.presentAppStore(ctx.appStoreId);
          } catch {
            // Sheet failed to load (offline, region); fall back to the App Store app.
          }
        }
        return openStoreUrl(ctx.storeUrl, ctx.installed.appId);
      case 'storeLink':
        return openStoreUrl(ctx.storeUrl, ctx.installed.appId);
    }
  }

  async completeStoreUpdate(): Promise<void> {
    await this.native.completePlayUpdate?.();
  }

  onStoreProgress(listener: (progress: StoreProgress) => void): () => void {
    if (this.os !== 'android') return () => {};
    const sub = this.native.addListener('onPlayInstallState', (e) =>
      listener({
        installStatus: e.status,
        bytesDownloaded: e.bytesDownloaded,
        totalBytesToDownload: e.totalBytesToDownload,
      })
    );
    return () => sub.remove();
  }
}

/** The real device platform, or null when the native module isn't linked (Expo Go, web, tests). */
export function createNativePlatform(options: NativePlatformOptions = {}): UpwellPlatform | null {
  const native = getUpwellNative();
  return native ? new NativePlatform(native, options) : null;
}
