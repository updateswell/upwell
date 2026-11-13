import {
  explain as explainDecision,
  validatePolicy,
  type InstallSource,
  type InstalledInfo,
  type OtaInfo,
  type OtaStatus,
  type Platform,
  type Policy,
  type StoreInfo,
} from '@upwell/core';

import { displayPath, documentPath } from '../config';
import type { Context } from '../context';
import { readDocument, requireValid } from '../documents';
import { CliError, usage } from '../errors';
import { parseBuild, parseDate, parseNonNegativeInt, parseVersion } from './shared';

export interface ExplainOptions {
  file?: string;
  /** false with --no-policy. */
  policy?: boolean;
  platform: Platform;
  build: string;
  version?: string;
  runtime?: string;
  source?: InstallSource;
  appId?: string;
  osVersion?: string;
  installationId?: string;
  now?: string;
  playVersionCode?: string;
  playPriority?: string;
  playStalenessDays?: string;
  appStoreVersion?: string;
  appStoreReleasedAt?: string;
  ota?: OtaStatus;
}

/** What would a device on this build see? The app's engine, fed from flags instead of a device. */
export async function explain(ctx: Context, options: ExplainOptions): Promise<void> {
  const { platform } = options;
  const build = String(parseBuild(options.build));
  if (platform === 'ios' && !options.version) {
    throw usage('--version is required for ios: iOS compares the version before the build');
  }
  const now =
    options.now !== undefined
      ? Date.parse(parseDate(options.now, Date.now(), '--now'))
      : ctx.io.now();

  const policy = loadPolicy(ctx, options);

  const installed: InstalledInfo = {
    platform,
    appId: options.appId ?? 'com.example.app',
    nativeVersion: options.version ? parseVersion(options.version) : build,
    buildNumber: build,
    runtimeVersion: options.runtime ?? null,
    otaUpdateId: null,
    installSource: options.source ?? (platform === 'android' ? 'play' : 'appStore'),
    installationId: options.installationId ?? 'upwell-cli',
    osVersion: options.osVersion ?? null,
  };

  const store = storeInfo(platform, options);
  const ota: OtaInfo | null = options.ota ? { status: options.ota } : null;
  const { decision, trace } = explainDecision({ installed, policy, store, ota, now });

  const flow = 'flow' in decision ? ` (${decision.flow})` : '';
  ctx.print(`${decision.kind}${flow}`);
  ctx.print(`  ${decision.because}`);
  ctx.print();
  for (const line of trace) ctx.print(`  ${line}`);
  if (!store) {
    ctx.print();
    ctx.print(
      platform === 'android'
        ? 'No Play info simulated: pass --play-version-code (and --play-priority, --play-staleness-days) to see the Play flows.'
        : 'No App Store lookup simulated: pass --app-store-version (and --app-store-released-at).'
    );
  }
  ctx.done({ decision, trace, input: { installed, store, ota, now: new Date(now).toISOString() } });
}

function loadPolicy(ctx: Context, options: ExplainOptions): Policy | null {
  if (options.policy === false) {
    if (options.file) throw usage('--file and --no-policy are exclusive');
    return null;
  }
  const path = documentPath(ctx.io.cwd, 'policy', options.file);
  const doc = readDocument(path);
  if (doc.text === null) {
    throw new CliError(
      'FILE_NOT_FOUND',
      `${displayPath(ctx.io.cwd, path)} does not exist. Pass --file, or --no-policy to explain an app without one.`,
      { file: path }
    );
  }
  return requireValid(ctx, path, validatePolicy(doc.value));
}

function storeInfo(platform: Platform, options: ExplainOptions): StoreInfo | null {
  const play = options.playVersionCode ?? options.playPriority ?? options.playStalenessDays;
  const appStore = options.appStoreVersion ?? options.appStoreReleasedAt;
  if (platform === 'android' && appStore !== undefined) {
    throw usage('--app-store-* options are for ios');
  }
  if (platform === 'ios' && play !== undefined) throw usage('--play-* options are for android');

  if (platform === 'android' && play !== undefined) {
    if (options.playVersionCode === undefined) {
      throw usage('--play-version-code is required with the other --play-* options');
    }
    const priority =
      options.playPriority !== undefined
        ? parseNonNegativeInt(options.playPriority, '--play-priority')
        : 0;
    if (priority > 5) throw usage('--play-priority must be 0–5');
    return {
      kind: 'play',
      updateAvailability: 'available',
      availableVersionCode: parseNonNegativeInt(options.playVersionCode, '--play-version-code'),
      updatePriority: priority,
      stalenessDays:
        options.playStalenessDays !== undefined
          ? parseNonNegativeInt(options.playStalenessDays, '--play-staleness-days')
          : null,
      immediateAllowed: true,
      flexibleAllowed: true,
      installStatus: 'unknown',
      bytesDownloaded: 0,
      totalBytesToDownload: 0,
    };
  }
  if (platform === 'ios' && appStore !== undefined) {
    if (options.appStoreVersion === undefined) {
      throw usage('--app-store-version is required with --app-store-released-at');
    }
    return {
      kind: 'appStore',
      version: parseVersion(options.appStoreVersion, '--app-store-version'),
      releaseDate:
        options.appStoreReleasedAt !== undefined
          ? parseDate(options.appStoreReleasedAt, Date.now(), '--app-store-released-at')
          : null,
      minimumOsVersion: null,
      trackId: null,
      trackViewUrl: null,
    };
  }
  return null;
}
