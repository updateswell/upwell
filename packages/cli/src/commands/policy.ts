import { validatePolicy, type Platform, type VersionRef } from '@upwell/core';

import { displayPath, documentPath } from '../config';
import type { Context } from '../context';
import {
  formatJson,
  isJsonObject,
  readDocument,
  requireExisting,
  requireValid,
  writeDocument,
  type JsonObject,
  type LoadedDocument,
  type WriteOptions,
} from '../documents';
import { CliError } from '../errors';
import { JsonText } from '../json-text';
import {
  PLATFORMS,
  POLICY_SCHEMA_URL,
  compareRefs,
  describeRef,
  isVersionRef,
  parseBuild,
  parseDate,
  parseVersion,
} from './shared';

const TOP_ORDER = ['$schema', 'schemaVersion', 'android', 'ios'];
const PLATFORM_ORDER = [
  'latest',
  'minimum',
  'recommendAfterDays',
  'requireAfterDays',
  'rollout',
  'ota',
  'message',
  'requiredMessage',
  'storeUrl',
  'appStoreId',
  'country',
];
const OTA_ORDER = ['latestRuntimeVersion', 'applyMode', 'strandedRequireAfterDays'];

const CREATE_HINT = 'Create it with `upwell policy set latest …`, or pass --file.';

export async function policyValidate(ctx: Context, options: { file?: string }): Promise<void> {
  const path = documentPath(ctx.io.cwd, 'policy', options.file);
  const doc = readDocument(path);
  requireExisting(ctx, doc, CREATE_HINT);
  const result = validatePolicy(doc.value);
  const policy = requireValid(ctx, path, result);
  const platforms = PLATFORMS.filter((p) => policy[p]);
  ctx.print(
    `${displayPath(ctx.io.cwd, path)} is valid` +
      (platforms.length > 0 ? ` (${platforms.join(', ')})` : ' (no platform sections)')
  );
  ctx.done({ file: path, valid: true, warnings: result.warnings, platforms });
}

interface SetRefOptions extends WriteOptions {
  file?: string;
  platform: Platform;
  version: string;
  build: string;
  releasedAt?: string;
}

/** `policy set latest` and `policy set minimum`. */
export async function policySetRef(
  ctx: Context,
  field: 'latest' | 'minimum',
  options: SetRefOptions
): Promise<void> {
  const { platform } = options;
  const ref: VersionRef = {
    version: parseVersion(options.version),
    build: parseBuild(options.build),
  };
  if (options.releasedAt) {
    ref.releasedAt = parseDate(options.releasedAt, ctx.io.now(), '--released-at');
  }

  const path = documentPath(ctx.io.cwd, 'policy', options.file);
  const doc = readDocument(path);
  const policy = currentPolicy(doc);
  const old = sectionOf(policy, platform)?.[field];

  // Same version again: keep its release date unless a new one was given.
  if (
    !ref.releasedAt &&
    isVersionRef(old) &&
    old.releasedAt &&
    compareRefs(platform, old, ref) === 0 &&
    old.version === ref.version
  ) {
    ref.releasedAt = old.releasedAt;
  }
  const text = editableText(doc);
  ensureSection(text, platform);
  text.set([platform, field], ref, PLATFORM_ORDER);

  const risks: string[] = [];
  if (field === 'minimum') {
    if (!isVersionRef(old)) {
      risks.push(
        `sets a ${platform} minimum of ${describeRef(platform, ref)}: ` +
          'installs below it must update before they can use the app'
      );
    } else if (compareRefs(platform, ref, old) > 0) {
      risks.push(
        `raises the ${platform} minimum from ${describeRef(platform, old)} to ${describeRef(platform, ref)}: ` +
          'installs below it must update before they can use the app'
      );
    }
  } else if (isVersionRef(old) && compareRefs(platform, ref, old) < 0) {
    risks.push(
      `lowers ${platform} latest from ${describeRef(platform, old)} to ${describeRef(platform, ref)}: ` +
        'installs in between stop being offered an update'
    );
  }

  requireValid(ctx, path, validatePolicy(text.value), 'would not be valid after this change');
  ctx.done(await writeDocument(ctx, { path, before: doc.text, after: text.text, risks }, options));
}

interface SetRuntimeOptions extends WriteOptions {
  file?: string;
  platform?: Platform;
}

/** `policy set ota-runtime`: the runtime the newest OTA updates target. */
export async function policySetOtaRuntime(
  ctx: Context,
  runtime: string,
  options: SetRuntimeOptions
): Promise<void> {
  if (!runtime.trim()) throw new CliError('USAGE', 'The runtime version must not be empty');

  const path = documentPath(ctx.io.cwd, 'policy', options.file);
  const doc = readDocument(path);
  const policy = currentPolicy(doc);
  const text = editableText(doc);
  // Without --platform: every platform the policy already covers, or both in a new policy.
  const existing = PLATFORMS.filter((p) => isJsonObject(policy[p]));
  const platforms = options.platform
    ? [options.platform]
    : existing.length > 0
      ? existing
      : PLATFORMS;

  const risks: string[] = [];
  for (const platform of platforms) {
    const ota = sectionOf(policy, platform)?.ota;
    if (ota !== undefined && !isJsonObject(ota)) {
      throw new CliError('INVALID_DOCUMENT', `${platform}.ota in the policy is not an object`);
    }
    const old = ota?.latestRuntimeVersion;
    if (old === runtime) continue;
    ensureSection(text, platform);
    if (!ota) text.set([platform, 'ota'], {}, PLATFORM_ORDER);
    text.set([platform, 'ota', 'latestRuntimeVersion'], runtime, OTA_ORDER);

    const days = ota?.strandedRequireAfterDays;
    const escalation = typeof days === 'number' ? `, and required after ${days} days` : '';
    risks.push(
      typeof old === 'string'
        ? `changes the ${platform} OTA runtime from ${old} to ${runtime}: installs on ${old} ` +
            `become stranded and are offered a store update when a newer build exists${escalation}`
        : `sets the ${platform} OTA runtime to ${runtime}: installs on any other runtime ` +
            `become stranded and are offered a store update when a newer build exists${escalation}`
    );
  }

  requireValid(ctx, path, validatePolicy(text.value), 'would not be valid after this change');
  ctx.done(await writeDocument(ctx, { path, before: doc.text, after: text.text, risks }, options));
}

/** The policy as it is now; an empty one when the file doesn't exist yet. */
function currentPolicy(doc: LoadedDocument): JsonObject {
  if (doc.text === null) return {};
  if (!isJsonObject(doc.value)) {
    throw new CliError('INVALID_DOCUMENT', `${doc.path} must contain a JSON object`);
  }
  return doc.value;
}

function sectionOf(policy: JsonObject, platform: Platform): JsonObject | undefined {
  const section = policy[platform];
  if (section !== undefined && !isJsonObject(section)) {
    throw new CliError('INVALID_DOCUMENT', `"${platform}" in the policy is not an object`);
  }
  return section;
}

function editableText(doc: LoadedDocument): JsonText {
  return new JsonText(doc.text ?? formatJson({ $schema: POLICY_SCHEMA_URL, schemaVersion: 1 }));
}

function ensureSection(text: JsonText, platform: Platform): void {
  if (!isJsonObject((text.value as JsonObject)[platform])) text.set([platform], {}, TOP_ORDER);
}
