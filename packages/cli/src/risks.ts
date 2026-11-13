import type { Policy } from '@upwell/core';

import { PLATFORMS, compareRefs, describeRef, isVersionRef } from './commands/shared';
import { isJsonObject } from './documents';

/**
 * Changes from `before` to `after` that affect installs already out there, each saying who is
 * affected. `policy set` and `publish` both need `--confirm` for them.
 *
 * - raising `minimum` (or setting the first one): installs below it are blocked until they update
 * - lowering `latest`: installs in between stop being offered an update
 * - changing `ota.latestRuntimeVersion`: installs on the old runtime become stranded
 */
export function policyRisks(before: unknown, after: Policy): string[] {
  const risks: string[] = [];
  const old = isJsonObject(before) ? before : {};
  for (const platform of PLATFORMS) {
    const p = after[platform];
    if (!p) continue;
    const o = isJsonObject(old[platform]) ? (old[platform] as Record<string, unknown>) : {};

    if (p.latest && isVersionRef(o.latest) && compareRefs(platform, p.latest, o.latest) < 0) {
      risks.push(
        `lowers ${platform} latest from ${describeRef(platform, o.latest)} to ${describeRef(platform, p.latest)}: ` +
          'installs in between stop being offered an update'
      );
    }

    if (p.minimum) {
      if (!isVersionRef(o.minimum)) {
        risks.push(
          `sets a ${platform} minimum of ${describeRef(platform, p.minimum)}: ` +
            'installs below it must update before they can use the app'
        );
      } else if (compareRefs(platform, p.minimum, o.minimum) > 0) {
        risks.push(
          `raises the ${platform} minimum from ${describeRef(platform, o.minimum)} to ${describeRef(platform, p.minimum)}: ` +
            'installs below it must update before they can use the app'
        );
      }
    }

    const runtime = p.ota?.latestRuntimeVersion;
    const oldOta = isJsonObject(o.ota) ? o.ota : {};
    const oldRuntime = oldOta.latestRuntimeVersion;
    if (runtime && runtime !== oldRuntime) {
      const days = p.ota?.strandedRequireAfterDays;
      const escalation = typeof days === 'number' ? `, and required after ${days} days` : '';
      risks.push(
        typeof oldRuntime === 'string'
          ? `changes the ${platform} OTA runtime from ${oldRuntime} to ${runtime}: installs on ${oldRuntime} ` +
              `become stranded and are offered a store update when a newer build exists${escalation}`
          : `sets the ${platform} OTA runtime to ${runtime}: installs on any other runtime ` +
              `become stranded and are offered a store update when a newer build exists${escalation}`
      );
    }
  }
  return risks;
}
