import {
  compareVersions,
  isComparableVersion,
  validatePolicy,
  validateReleases,
  type Policy,
} from '@upwell/core';

import {
  appBuild,
  appRuntime,
  appVersion,
  findAppRoot,
  hasPlugin,
  installedVersion,
  readApp,
  type AppInfo,
} from '../app';
import { displayPath, documentPath, loadConfig } from '../config';
import type { Context } from '../context';
import { isJsonObject, readDocument, type JsonObject } from '../documents';
import { CliError } from '../errors';
import { PLATFORMS, compareRefs, describeRef } from './shared';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  /** What to do about it. */
  fix?: string;
}

export interface DoctorOptions {
  /** Read app.json only; don't run `npx expo config`. */
  static?: boolean;
  /** Don't fetch the published documents. */
  offline?: boolean;
  policyUrl?: string;
  releasesUrl?: string;
  file?: string;
  releasesFile?: string;
}

/** Cache lifetime above which a policy change takes too long to reach devices. */
const MAX_CACHE_SECONDS = 300;
/** Reads the embedded runtime version when the OTA adapter has none (runtime policies). */
const RUNTIME_POLICY_MIN_UPWELL = '0.1.3';

export async function doctor(ctx: Context, options: DoctorOptions): Promise<void> {
  const findings = await runChecks(ctx, options);
  const counts = {
    error: findings.filter((f) => f.severity === 'error').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  for (const f of findings) {
    ctx.print(`${SYMBOL[f.severity]} ${f.message}`);
    if (f.fix) ctx.print(`  → ${f.fix}`);
    ctx.print(`  [${f.code}]`);
  }
  if (findings.length > 0) ctx.print();
  ctx.print(
    counts.error + counts.warning === 0
      ? 'No problems found.'
      : `${plural(counts.error, 'error')}, ${plural(counts.warning, 'warning')}.`
  );

  if (counts.error > 0) {
    throw new CliError('CHECKS_FAILED', `upwell doctor found ${plural(counts.error, 'error')}`, {
      findings,
      counts,
    });
  }
  ctx.done({ findings, counts });
}

const SYMBOL: Record<Severity, string> = { error: '✗', warning: '!', info: '·' };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export async function runChecks(ctx: Context, options: DoctorOptions): Promise<Finding[]> {
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  const root = findAppRoot(ctx.io.cwd);
  if (!root) {
    add({
      code: 'NOT_AN_APP',
      severity: 'error',
      message: 'No package.json here or in any parent directory',
      fix: 'Run upwell doctor inside your Expo app',
    });
    return findings;
  }
  const app = await readApp(ctx, root, { resolveConfig: !options.static });

  checkPackages(app, add);
  checkAppConfig(app, add);
  const policy = await checkDocuments(ctx, app, options, add);
  if (policy) checkPolicyAgainstApp(app, policy, add);
  return findings;
}

type Add = (f: Finding) => void;

// ── Packages ───────────────────────────────────────────────────────────────

function checkPackages(app: AppInfo, add: Add): void {
  if (!app.dependencies.expo) {
    add({
      code: 'EXPO_MISSING',
      severity: 'error',
      message:
        '`expo` is not a dependency. Upwell is an Expo module and needs it, also in bare apps',
      fix: 'npx install-expo-modules@latest',
    });
  }
  if (!app.dependencies.upwell) {
    add({
      code: 'UPWELL_MISSING',
      severity: 'error',
      message: '`upwell` is not a dependency',
      fix: 'npx expo install upwell (or npx @upwell/cli init)',
    });
  } else if (!installedVersion(app.root, 'upwell')) {
    add({
      code: 'UPWELL_NOT_INSTALLED',
      severity: 'warning',
      message: '`upwell` is in package.json but not in node_modules',
      fix: 'Install dependencies (npm install, yarn, pnpm install, bun install)',
    });
  }
  if (!app.dependencies['expo-updates']) {
    add({
      code: 'NO_OTA',
      severity: 'info',
      message: 'expo-updates is not installed: Upwell handles store updates only, no OTA',
      fix: 'For OTA updates: npx expo install expo-updates, then pass ota={expoUpdatesAdapter()}',
    });
  }
}

// ── App config ─────────────────────────────────────────────────────────────

function checkAppConfig(app: AppInfo, add: Add): void {
  const { config } = app;
  if (config.source !== 'expo-config' && config.fallbackReason !== 'skipped (--static)') {
    add({
      code: 'APP_CONFIG_STATIC',
      severity: config.source === 'none' ? 'warning' : 'info',
      message:
        config.source === 'none'
          ? `Couldn't read the app config (${config.fallbackReason ?? 'no app.json'}); config checks skipped`
          : `Read app.json directly; ${config.fallbackReason ?? '`npx expo config` was not used'}. A dynamic app.config can change what's checked`,
    });
  }
  const exp = config.exp;
  if (!exp) return;

  if (app.dependencies.upwell && !hasPlugin(exp, 'upwell')) {
    add({
      code: 'PLUGIN_NOT_CONFIGURED',
      severity: 'info',
      message:
        'The upwell config plugin is not in the app config. Upwell works without it; add it to pin the Play Core version or declare the store URL schemes',
      fix: 'Add "upwell" to expo.plugins',
    });
  }

  if (!app.dependencies['expo-updates']) return;
  const updates = isJsonObject(exp.updates) ? exp.updates : {};

  if (typeof updates.url !== 'string' || !updates.url) {
    add({
      code: 'UPDATES_URL_MISSING',
      severity: 'error',
      message:
        'expo-updates is installed but updates.url is not set, so no OTA update is ever found',
      fix: 'eas update:configure',
    });
  }

  for (const platform of PLATFORMS) {
    const runtime = appRuntime(exp, platform);
    if (runtime.kind === 'none') {
      add({
        code: 'RUNTIME_VERSION_MISSING',
        severity: 'error',
        message: `No runtimeVersion for ${platform}: expo-updates can't match OTA updates to this build`,
        fix: 'Set "runtimeVersion": { "policy": "appVersion" } (or a fixed string) in the app config',
      });
      break;
    }
    if (runtime.kind === 'policy') {
      const upwell = installedVersion(app.root, 'upwell');
      if (
        upwell &&
        isComparableVersion(upwell.split('-')[0]) &&
        compareVersions(upwell.split('-')[0]!, RUNTIME_POLICY_MIN_UPWELL) < 0
      ) {
        add({
          code: 'RUNTIME_POLICY_NEEDS_NEWER_UPWELL',
          severity: 'warning',
          message: `runtimeVersion uses the "${runtime.policy}" policy, which upwell ${upwell} can't read in development builds: stranded detection is skipped there`,
          fix: `npx expo install upwell (${RUNTIME_POLICY_MIN_UPWELL} or newer)`,
        });
      }
      break;
    }
  }

  const headers = isJsonObject(updates.requestHeaders) ? updates.requestHeaders : {};
  if (!headers['expo-channel-name'] && !easChannels(app.eas).length) {
    add({
      code: 'CHANNEL_MISSING',
      severity: 'warning',
      message:
        'No update channel: no build profile in eas.json sets "channel", and updates.requestHeaders has no expo-channel-name. Builds will not receive OTA updates published to a branch',
      fix: 'Add "channel": "production" (and one per profile) to the build profiles in eas.json',
    });
  }

  if (updates.checkAutomatically !== 'NEVER') {
    add({
      code: 'UPDATES_CHECK_AUTOMATICALLY',
      severity: 'info',
      message: `expo-updates also checks for updates on its own (checkAutomatically: ${String(updates.checkAutomatically ?? 'ON_LOAD')}). That works with Upwell, but two checkers can download the same update at different times`,
      fix: 'Set updates.checkAutomatically to "NEVER" to let Upwell decide when to check',
    });
  }
}

function easChannels(eas: JsonObject | null): string[] {
  const build = eas && isJsonObject(eas.build) ? eas.build : {};
  return Object.values(build)
    .map((profile) => (isJsonObject(profile) ? profile.channel : undefined))
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

// ── Documents: local files and published copies ────────────────────────────

async function checkDocuments(
  ctx: Context,
  app: AppInfo,
  options: DoctorOptions,
  add: Add
): Promise<Policy | null> {
  const config = loadConfig(app.root).config;
  const urls = isJsonObject(config.publish?.urls) ? (config.publish!.urls as JsonObject) : {};
  const policyUrl =
    options.policyUrl ?? (typeof urls.policy === 'string' ? urls.policy : undefined);
  const releasesUrl =
    options.releasesUrl ?? (typeof urls.releases === 'string' ? urls.releases : undefined);

  const policyPath = documentPath(app.root, 'policy', options.file);
  const local = readLocal(ctx, policyPath, 'policy', add);
  const releasesPath = documentPath(app.root, 'releases', options.releasesFile);
  const localReleases = readLocal(ctx, releasesPath, 'releases', add);

  let remote: Policy | null = null;
  if (policyUrl) {
    remote = (await checkPublished(ctx, 'policy', policyUrl, local.value, options, add)) as Policy;
  } else if (local.exists) {
    add({
      code: 'POLICY_NOT_PUBLISHED',
      severity: 'info',
      message: `${displayPath(ctx.io.cwd, policyPath)} exists but no published URL is known, so it wasn't checked as devices see it`,
      fix: 'upwell publish puts it at a public URL; if you host it yourself, pass --policy-url <url>',
    });
  } else {
    add({
      code: 'NO_POLICY',
      severity: 'info',
      message:
        'No policy: Upwell still applies OTA updates and recommends store updates Play or the App Store report, but there are no forced updates (minimum), no stranded-install detection, no rollout and no custom messages',
      fix: 'npx @upwell/cli init writes one',
    });
  }
  if (releasesUrl) {
    await checkPublished(ctx, 'releases', releasesUrl, localReleases.value, options, add);
  }
  return remote ?? (local.value as Policy | null);
}

function readLocal(
  ctx: Context,
  path: string,
  kind: 'policy' | 'releases',
  add: Add
): { exists: boolean; value: unknown } {
  const shown = displayPath(ctx.io.cwd, path);
  let doc;
  try {
    doc = readDocument(path);
  } catch (e) {
    add({ code: `${upper(kind)}_INVALID`, severity: 'error', message: (e as Error).message });
    return { exists: true, value: null };
  }
  if (doc.text === null) return { exists: false, value: null };
  const result = kind === 'policy' ? validatePolicy(doc.value) : validateReleases(doc.value);
  for (const error of result.ok ? [] : result.errors) {
    add({ code: `${upper(kind)}_INVALID`, severity: 'error', message: `${shown}: ${error}` });
  }
  for (const warning of result.warnings) {
    add({ code: `${upper(kind)}_WARNING`, severity: 'warning', message: `${shown}: ${warning}` });
  }
  return { exists: true, value: result.ok ? result.value : null };
}

/** Checks a published copy as a device would fetch it. Returns it when valid. */
async function checkPublished(
  ctx: Context,
  kind: 'policy' | 'releases',
  url: string,
  local: unknown,
  options: DoctorOptions,
  add: Add
): Promise<unknown> {
  const KIND = upper(kind);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    add({ code: `${KIND}_URL_INVALID`, severity: 'error', message: `${url} is not a URL` });
    return null;
  }
  if (parsed.protocol !== 'https:') {
    const local = ['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname);
    add({
      code: `${KIND}_URL_NOT_HTTPS`,
      severity: local ? 'warning' : 'error',
      message: `${url} is not HTTPS: Android release builds block plain HTTP${local ? ' (fine for local testing)' : ''}`,
      fix: 'Serve it over HTTPS',
    });
  }
  if (options.offline) return null;

  let response;
  try {
    response = await ctx.io.fetch(url);
  } catch (e) {
    add({
      code: `${KIND}_URL_UNREACHABLE`,
      severity: 'error',
      message: `Couldn't fetch ${url}: ${(e as Error).message}`,
    });
    return null;
  }
  if (response.status !== 200) {
    add({
      code: `${KIND}_URL_UNREACHABLE`,
      severity: 'error',
      message: `${url} answered HTTP ${response.status}`,
    });
    return null;
  }

  const maxAge = /max-age=(\d+)/.exec(response.headers['cache-control'] ?? '')?.[1];
  if (maxAge && Number(maxAge) > MAX_CACHE_SECONDS) {
    add({
      code: `${KIND}_CACHE_LONG`,
      severity: 'warning',
      message: `${url} is cached for ${maxAge} s (Cache-Control), so a change takes that long to reach devices`,
      fix: `Serve it with max-age=${MAX_CACHE_SECONDS} or less`,
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(response.body);
  } catch {
    add({ code: `${KIND}_URL_INVALID`, severity: 'error', message: `${url} is not JSON` });
    return null;
  }
  const result = kind === 'policy' ? validatePolicy(value) : validateReleases(value);
  if (!result.ok) {
    for (const error of result.errors) {
      add({
        code: `${KIND}_URL_INVALID`,
        severity: 'error',
        message: `${url}: ${error}. Devices reject it and keep their last valid copy`,
      });
    }
    return null;
  }
  if (local && JSON.stringify(sortKeys(local)) !== JSON.stringify(sortKeys(value))) {
    add({
      code: `${KIND}_OUT_OF_DATE`,
      severity: 'warning',
      message: `The published ${kind} at ${url} differs from the local file`,
      fix: 'upwell publish (or, if the published copy is right, update the local file from it)',
    });
  }
  return result.value;
}

// ── Policy vs the app being built ──────────────────────────────────────────

function checkPolicyAgainstApp(app: AppInfo, policy: Policy, add: Add): void {
  const exp = app.config.exp;
  const version = appVersion(exp);
  const remoteVersions = isJsonObject(app.eas?.cli) && app.eas.cli.appVersionSource === 'remote';

  for (const platform of PLATFORMS) {
    const p = policy[platform];
    if (!p) continue;

    if (p.latest && version && isComparableVersion(version) && !remoteVersions) {
      const build = appBuild(exp, platform)!;
      const current = { version, build };
      if (compareRefs(platform, p.latest, current) < 0) {
        add({
          code: 'LATEST_BEHIND_APP',
          severity: 'warning',
          message: `${platform}: this app is ${describeRef(platform, current)}, newer than policy latest ${describeRef(platform, p.latest)}. Fine before the release; once it's live in the store, update the policy`,
          fix: `upwell policy set latest --platform ${platform} --version ${version} --build ${build} --released-at today`,
        });
      }
    }

    const runtime = appRuntime(exp, platform);
    const latestRuntime = p.ota?.latestRuntimeVersion;
    if (
      app.dependencies['expo-updates'] &&
      runtime.kind !== 'none' &&
      runtime.value &&
      latestRuntime &&
      runtime.value !== latestRuntime
    ) {
      const older =
        isComparableVersion(runtime.value) &&
        isComparableVersion(latestRuntime) &&
        compareVersions(runtime.value, latestRuntime) < 0;
      add({
        code: 'OTA_RUNTIME_DIFFERS',
        severity: 'warning',
        message: older
          ? `${platform}: this build's runtime ${runtime.value} is older than policy ota.latestRuntimeVersion ${latestRuntime}, so its installs are stranded from the start`
          : `${platform}: this build's runtime is ${runtime.value}, policy ota.latestRuntimeVersion is ${latestRuntime}. Installs of this build count as stranded until the policy moves on`,
        fix: older
          ? 'Bump the app version (or runtimeVersion) past the policy, unless this build is meant to be outdated'
          : `Once OTA updates target ${runtime.value}: upwell policy set ota-runtime ${runtime.value} --platform ${platform}`,
      });
    }
  }

  if (policy.ios && !policy.ios.appStoreId) {
    add({
      code: 'APP_STORE_ID_MISSING',
      severity: 'warning',
      message:
        'The policy has an ios section without appStoreId: the in-app App Store sheet then depends on the App Store lookup, and falls back to a link when it fails',
      fix: 'Add "appStoreId" (the numeric id in your App Store URL) to the ios section',
    });
  }
}

function upper(kind: string): string {
  return kind.toUpperCase();
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((k) => k !== '$schema')
      .sort()
      .map((k) => [k, sortKeys(value[k])])
  );
}
