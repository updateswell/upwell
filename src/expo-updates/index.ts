import * as Updates from 'expo-updates';

import type { OtaAdapter, OtaCheckResult, OtaRuntime } from '../ota/types';

export interface ExpoUpdatesAdapterOptions {
  /** Check for updates in development too (they are always off in dev builds). Default false. */
  checkInDev?: boolean;
}

/** EAS Update puts the update group id in the manifest metadata. */
function groupId(manifest: unknown): string | null {
  const metadata = (manifest as { metadata?: { updateGroup?: unknown } } | undefined)?.metadata;
  return typeof metadata?.updateGroup === 'string' ? metadata.updateGroup : null;
}

/** OTA adapter for expo-updates. Match `releases.json` ids against the update or group id. */
export function expoUpdatesAdapter(options: ExpoUpdatesAdapterOptions = {}): OtaAdapter {
  return {
    name: 'expo-updates',

    getRuntime(): OtaRuntime {
      const ids = [Updates.updateId, groupId(Updates.manifest)].filter((id): id is string => !!id);
      return {
        runtimeVersion: Updates.runtimeVersion ?? null,
        updateId: Updates.updateId ?? null,
        updateIds: ids,
        isEmbedded: Updates.isEmbeddedLaunch,
      };
    },

    async check(): Promise<OtaCheckResult> {
      if (!Updates.isEnabled)
        return { available: false, disabled: true, reason: 'expo-updates is disabled' };
      if (__DEV__ && !options.checkInDev) {
        return { available: false, disabled: true, reason: 'development build' };
      }
      const result = await Updates.checkForUpdateAsync();
      return { available: result.isAvailable };
    },

    async download(): Promise<void> {
      await Updates.fetchUpdateAsync();
    },

    async apply(): Promise<void> {
      await Updates.reloadAsync();
    },
  };
}
