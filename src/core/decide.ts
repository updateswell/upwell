import { isInRollout, rolloutBucket } from './rollout';
import type {
  AppStoreInfo,
  Decision,
  DecisionInput,
  EngineConfig,
  Explanation,
  InstalledInfo,
  IosPolicy,
  PlatformPolicy,
  PlayStoreInfo,
  RecommendedReason,
  RequiredReason,
  StoreFlow,
  TargetVersion,
  VersionRef,
} from './types';
import { compareVersions } from './version';

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  snoozeHours: 24,
  maxPrompts: 3,
  promptPeriodHours: 24 * 7,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Stable key for a target version, used to scope snoozes to one release. */
export function targetKey(target: TargetVersion): string {
  return target.build ? `build:${target.build}` : `version:${target.version ?? ''}`;
}

/**
 * Android compares build numbers (versionCode is monotonic). iOS compares the version first and
 * then the build, because many teams reset CFBundleVersion for each marketing version.
 */
export function compareInstalled(installed: InstalledInfo, ref: VersionRef): -1 | 0 | 1 {
  if (installed.platform === 'android') return compareVersions(installed.buildNumber, ref.build);
  const byVersion = compareVersions(installed.nativeVersion, ref.version);
  return byVersion !== 0 ? byVersion : compareVersions(installed.buildNumber, ref.build);
}

function describeInstalled(installed: InstalledInfo): string {
  return installed.platform === 'android'
    ? `build ${installed.buildNumber}`
    : `${installed.nativeVersion} (build ${installed.buildNumber})`;
}

function describeRef(installed: InstalledInfo, ref: VersionRef): string {
  return installed.platform === 'android' ? `${ref.build}` : `${ref.version} (build ${ref.build})`;
}

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/** Runs every rule and returns the decision plus a trace of why. Pure and synchronous. */
export function explain(input: DecisionInput): Explanation {
  const trace: string[] = [];
  const log = (line: string) => {
    trace.push(line);
  };
  const finish = (decision: Decision): Explanation => {
    log(`→ ${decision.kind}: ${decision.because}`);
    return { decision, trace };
  };

  const { installed, now } = input;
  const cfg: EngineConfig = { ...DEFAULT_ENGINE_CONFIG, ...input.config };
  const platform = installed.platform;
  const policy = input.policy ?? null;
  const p: (PlatformPolicy & Partial<IosPolicy>) | undefined = policy?.[platform];
  const store = input.store ?? null;
  const play: PlayStoreInfo | null =
    platform === 'android' && store?.kind === 'play' ? store : null;
  const appStore: AppStoreInfo | null =
    platform === 'ios' && store?.kind === 'appStore' ? store : null;
  const prompts = input.prompts ?? {};

  log(
    `installed: ${platform} ${installed.nativeVersion} (build ${installed.buildNumber}), ` +
      `source ${installed.installSource}, runtime ${installed.runtimeVersion ?? 'none'}`
  );
  if (input.policyError) {
    log(
      policy
        ? `policy: latest fetch failed (${input.policyError}); using last known good`
        : `policy: unavailable (${input.policyError})`
    );
  } else if (!policy) {
    log('policy: none');
  } else if (!p) {
    log(`policy: no "${platform}" section`);
  }

  // ── Is a newer native build available? ──────────────────────────────────
  let target: TargetVersion | null = null;
  let targetFromPolicyLatest = false;
  if (p?.latest) {
    if (compareInstalled(installed, p.latest) < 0) {
      target = { version: p.latest.version, build: String(p.latest.build) };
      targetFromPolicyLatest = true;
      log(
        `newer: policy latest ${describeRef(installed, p.latest)} > installed ${describeInstalled(installed)}`
      );
    } else {
      log(
        `newer: installed ${describeInstalled(installed)} is at or above policy latest ${describeRef(installed, p.latest)}`
      );
    }
  }
  const playHasUpdate =
    !!play && (play.updateAvailability === 'available' || play.updateAvailability === 'inProgress');
  if (
    !target &&
    playHasUpdate &&
    play!.availableVersionCode != null &&
    compareVersions(play!.availableVersionCode, installed.buildNumber) > 0
  ) {
    target = { version: null, build: String(play!.availableVersionCode) };
    log(`newer: Play reports versionCode ${play!.availableVersionCode}`);
  }
  if (
    !target &&
    appStore?.version &&
    compareVersions(appStore.version, installed.nativeVersion) > 0
  ) {
    target = { version: appStore.version, build: null };
    log(`newer: App Store lookup reports ${appStore.version}`);
  }
  if (
    target &&
    appStore?.minimumOsVersion &&
    appStore.version &&
    installed.osVersion &&
    target.version &&
    compareVersions(appStore.version, target.version) === 0 &&
    compareVersions(installed.osVersion, appStore.minimumOsVersion) < 0
  ) {
    log(
      `newer: ${target.version} needs iOS ${appStore.minimumOsVersion}, device has ${installed.osVersion}; ` +
        'it cannot be installed here'
    );
    target = null;
  }
  if (!target && !p?.latest) log('newer: no newer native build known');

  // ── Staleness: how long the newer build has been out ────────────────────
  let staleness: number | null = null;
  if (target) {
    if (play?.stalenessDays != null) {
      staleness = play.stalenessDays;
      log(`staleness: ${staleness} days (Play)`);
    } else if (targetFromPolicyLatest && p?.latest?.releasedAt) {
      staleness = daysSince(p.latest.releasedAt, now);
      log(`staleness: ${staleness} days (policy latest.releasedAt)`);
    } else if (appStore?.releaseDate && target.version && appStore.version === target.version) {
      staleness = daysSince(appStore.releaseDate, now);
      log(`staleness: ${staleness} days (App Store release date)`);
    } else {
      log('staleness: unknown (set latest.releasedAt in the policy)');
    }
  }

  // ── Stranded: the newest OTA targets a runtime this binary doesn't have ──
  const latestRuntime = p?.ota?.latestRuntimeVersion;
  let stranded = false;
  if (latestRuntime) {
    if (!installed.runtimeVersion) {
      log('stranded: no OTA runtime reported, skipping');
    } else if (installed.runtimeVersion === latestRuntime) {
      log(`stranded: no, runtime ${installed.runtimeVersion} is the latest OTA runtime`);
    } else if (!target) {
      log(
        `stranded: runtime ${installed.runtimeVersion} != latest ${latestRuntime}, ` +
          'but no newer native build to move to'
      );
    } else {
      stranded = true;
      log(
        `stranded: yes, runtime ${installed.runtimeVersion} != latest OTA runtime ${latestRuntime}`
      );
    }
  }

  // ── Store link fallback ─────────────────────────────────────────────────
  const appStoreId = p?.appStoreId ?? (appStore?.trackId != null ? String(appStore.trackId) : null);
  const storeUrl =
    p?.storeUrl ??
    (platform === 'android'
      ? `https://play.google.com/store/apps/details?id=${installed.appId}`
      : appStoreId
        ? `https://apps.apple.com/app/id${appStoreId}`
        : (appStore?.trackViewUrl ?? null));

  const selectFlow = (required: boolean, minimumBuild?: string): StoreFlow => {
    if (platform === 'android') {
      if (installed.installSource !== 'play') {
        log(`flow: installed from ${installed.installSource}, not Play; using store link`);
        return 'storeLink';
      }
      if (!playHasUpdate) {
        log('flow: Play has no update for this device; using store link');
        return 'storeLink';
      }
      if (
        required &&
        minimumBuild &&
        play!.availableVersionCode != null &&
        compareVersions(play!.availableVersionCode, minimumBuild) < 0
      ) {
        log(
          `flow: Play offers ${play!.availableVersionCode}, below minimum ${minimumBuild}; using store link`
        );
        return 'storeLink';
      }
      if (required) {
        if (play!.immediateAllowed) return 'playImmediate';
        log('flow: Play does not allow an immediate update; using store link');
        return 'storeLink';
      }
      if (play!.flexibleAllowed) return 'playFlexible';
      log('flow: Play does not allow a flexible update; using store link');
      return 'storeLink';
    }
    if (installed.installSource === 'appStore' && appStoreId) return 'appStoreSheet';
    log(
      appStoreId
        ? `flow: installed from ${installed.installSource}, not the App Store; using store link`
        : 'flow: no appStoreId known; using store link'
    );
    return 'storeLink';
  };

  // ── Required ─────────────────────────────────────────────────────────────
  let required: { reason: RequiredReason; because: string; target: TargetVersion } | null = null;
  if (p?.minimum && compareInstalled(installed, p.minimum) < 0) {
    required = {
      reason: 'belowMinimum',
      because: `required: ${describeInstalled(installed)} < minimum ${describeRef(installed, p.minimum)}`,
      target: target ?? { version: p.minimum.version, build: String(p.minimum.build) },
    };
  } else if (p?.minimum) {
    log(
      `minimum: ${describeInstalled(installed)} meets minimum ${describeRef(installed, p.minimum)}`
    );
  }
  if (!required && target && p?.requireAfterDays != null) {
    if (staleness != null && staleness >= p.requireAfterDays) {
      required = {
        reason: 'stale',
        because: `required: update is ${staleness} days old (requireAfterDays ${p.requireAfterDays})`,
        target,
      };
    } else {
      log(`escalation: ${staleness ?? 'unknown'} days < requireAfterDays ${p.requireAfterDays}`);
    }
  }
  const strandedAfter = p?.ota?.strandedRequireAfterDays;
  if (!required && stranded && target && strandedAfter != null) {
    if (staleness != null && staleness >= strandedAfter) {
      required = {
        reason: 'stranded',
        because:
          `required: stranded on runtime ${installed.runtimeVersion} for ${staleness} days ` +
          `(strandedRequireAfterDays ${strandedAfter})`,
        target,
      };
    } else {
      log(
        `stranded escalation: ${staleness ?? 'unknown'} days < strandedRequireAfterDays ${strandedAfter}`
      );
    }
  }

  // ── Play update already in progress (live state wins) ────────────────────
  if (play) {
    const playTarget: TargetVersion = target ?? {
      version: null,
      build: play.availableVersionCode != null ? String(play.availableVersionCode) : null,
    };
    if (play.installStatus === 'downloaded') {
      return finish({
        kind: 'store.readyToInstall',
        target: playTarget,
        because: 'store: update downloaded, restart to install',
      });
    }
    if (
      play.installStatus === 'pending' ||
      play.installStatus === 'downloading' ||
      play.installStatus === 'installing'
    ) {
      const total = play.totalBytesToDownload;
      return finish({
        kind: 'store.downloading',
        progress:
          play.installStatus === 'installing'
            ? 1
            : total > 0
              ? Math.min(1, play.bytesDownloaded / total)
              : null,
        bytesDownloaded: play.bytesDownloaded,
        totalBytesToDownload: total,
        required: !!required,
        target: playTarget,
        because: `store: Play update ${play.installStatus}`,
      });
    }
  }

  if (required) {
    return finish({
      kind: 'store.required',
      reason: required.reason,
      flow: selectFlow(
        true,
        required.reason === 'belowMinimum' ? String(p!.minimum!.build) : undefined
      ),
      target: required.target,
      storeUrl,
      message: p?.message ?? null,
      because: required.because,
    });
  }

  // ── OTA for the current runtime ─────────────────────────────────────────
  const ota = input.ota;
  if (ota?.status === 'ready') {
    const applyMode = p?.ota?.applyMode ?? 'nextLaunch';
    return finish({
      kind: 'ota.ready',
      applyMode,
      because: `ota: update downloaded, apply ${applyMode}`,
    });
  }
  if (ota?.status === 'available' || ota?.status === 'downloading') {
    return finish({
      kind: 'ota.downloading',
      because: 'ota: update available for this runtime, downloading',
    });
  }
  if (ota) log(`ota: ${ota.status}${ota.error ? ` (${ota.error})` : ''}`);

  // ── Recommended ─────────────────────────────────────────────────────────
  let notRecommendedBecause: string | null = null;
  if (target) {
    let reason: RecommendedReason | null = null;
    if (installed.installSource === 'play' && play?.updateAvailability === 'notAvailable') {
      notRecommendedBecause = 'store: Play has no update for this device yet';
      log(notRecommendedBecause);
    } else if (stranded) {
      reason = 'stranded';
    } else {
      const bucketKey = target.build ?? target.version ?? '';
      if (!isInRollout(installed.installationId, bucketKey, p?.rollout)) {
        notRecommendedBecause =
          `rollout: bucket ${rolloutBucket(installed.installationId, bucketKey)} ` +
          `is outside ${p?.rollout ?? 100}%`;
        log(notRecommendedBecause);
      } else if (play && play.updatePriority >= 4) {
        reason = 'highPriority';
        log(`priority: Play updatePriority ${play.updatePriority} >= 4`);
      } else {
        const after = p?.recommendAfterDays ?? 0;
        if (staleness == null ? after === 0 : staleness >= after) {
          reason = 'newerVersion';
        } else {
          notRecommendedBecause = `recommend: update is ${staleness ?? 'unknown'} days old, waiting for recommendAfterDays ${after}`;
          log(notRecommendedBecause);
        }
      }
    }

    if (reason) {
      const key = targetKey(target);
      if (prompts.dismissedAt != null && prompts.dismissedTarget === key) {
        const until = prompts.dismissedAt + cfg.snoozeHours * HOUR;
        if (now < until) {
          return finish({
            kind: 'upToDate',
            snoozed: { target, until },
            because: `snoozed: dismissed, hidden until ${new Date(until).toISOString()}`,
          });
        }
      }
      const recent = (prompts.shownAt ?? []).filter((t) => now - t < cfg.promptPeriodHours * HOUR);
      if (recent.length >= cfg.maxPrompts) {
        const until = Math.min(...recent) + cfg.promptPeriodHours * HOUR;
        return finish({
          kind: 'upToDate',
          snoozed: { target, until },
          because: `capped: ${recent.length} prompts in the last ${cfg.promptPeriodHours}h (max ${cfg.maxPrompts})`,
        });
      }
      return finish({
        kind: 'store.recommended',
        reason,
        flow: selectFlow(false),
        target,
        storeUrl,
        message: p?.message ?? null,
        because:
          reason === 'stranded'
            ? `recommended: stranded on runtime ${installed.runtimeVersion}, latest OTA needs ${latestRuntime}`
            : reason === 'highPriority'
              ? `recommended: Play priority ${play!.updatePriority}`
              : `recommended: ${target.version ?? `build ${target.build}`} is available`,
      });
    }
  }

  if (input.policyError && !policy) {
    return finish({
      kind: 'error',
      reason: input.policyError,
      lastKnownGood: false,
      because: `error: no policy available (${input.policyError})`,
    });
  }

  return finish({
    kind: 'upToDate',
    because: notRecommendedBecause ?? (target ? 'up to date' : 'no newer version'),
  });
}

/** The heart of the library: what kind of update does this install need right now? */
export function decide(input: DecisionInput): Decision {
  return explain(input).decision;
}
