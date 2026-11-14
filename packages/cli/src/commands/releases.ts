import {
  validatePolicy,
  validateReleases,
  type Platform,
  type Release,
  type ReleaseKind,
} from '@upwell/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { displayPath, documentPath } from '../config';
import type { Context } from '../context';
import {
  formatJson,
  isJsonObject,
  readDocument,
  requireExisting,
  requireValid,
  writeDocument,
  type LoadedDocument,
  type WriteOptions,
} from '../documents';
import { CliError, usage } from '../errors';
import { JsonText } from '../json-text';
import { PLATFORMS, RELEASES_SCHEMA_URL, parseDate, parsePlatforms } from './shared';

const CREATE_HINT = 'Add a release with `upwell releases add …`, or pass --file.';

export async function releasesValidate(ctx: Context, options: { file?: string }): Promise<void> {
  const path = documentPath(ctx.io.cwd, 'releases', options.file);
  const doc = readDocument(path);
  requireExisting(ctx, doc, CREATE_HINT);
  const result = validateReleases(doc.value);
  const releases = requireValid(ctx, path, result);
  const count = releases.releases.length;
  ctx.print(
    `${displayPath(ctx.io.cwd, path)} is valid (${count} release${count === 1 ? '' : 's'})`
  );
  ctx.done({ file: path, valid: true, warnings: result.warnings, releases: count });
}

interface ListOptions {
  file?: string;
  platform?: string;
  runtime?: string;
}

export async function releasesList(ctx: Context, options: ListOptions): Promise<void> {
  const path = documentPath(ctx.io.cwd, 'releases', options.file);
  const doc = readDocument(path);
  requireExisting(ctx, doc, CREATE_HINT);
  const all = requireValid(ctx, path, validateReleases(doc.value)).releases;
  const platforms = parsePlatforms(options.platform);
  const releases = all.filter(
    (r) =>
      (!platforms || r.platforms.some((p) => platforms.includes(p))) &&
      (!options.runtime || r.runtimeVersion === options.runtime)
  );

  if (releases.length === 0) ctx.print('No releases.');
  for (const r of releases) {
    ctx.print(
      `${r.id}  ${r.kind}  ${r.platforms.join(',')}  runtime ${r.runtimeVersion}  ${r.publishedAt}`
    );
    ctx.print(`  ${r.notes}`);
  }
  ctx.done({ file: path, releases });
}

interface AddOptions extends WriteOptions {
  file?: string;
  policy?: string;
  id?: string;
  kind?: string;
  notes?: string;
  runtime?: string;
  platform?: string;
  publishedAt?: string;
  fromEasUpdate?: string;
}

const KINDS: ReleaseKind[] = ['fix', 'content', 'feature'];

export async function releasesAdd(ctx: Context, options: AddOptions): Promise<void> {
  if (!options.kind) {
    throw usage(
      '--kind is required: fix, content or feature (what users and App Review are told it is)'
    );
  }
  if (!KINDS.includes(options.kind as ReleaseKind)) {
    throw usage(`--kind must be fix, content or feature (got "${options.kind}")`);
  }
  const kind = options.kind as ReleaseKind;
  const platforms = parsePlatforms(options.platform);
  const publishedAt =
    options.publishedAt !== undefined
      ? parseDate(options.publishedAt, ctx.io.now(), '--published-at')
      : undefined;

  let added: Release[];
  if (options.fromEasUpdate) {
    if (options.id) throw usage('--id and --from-eas-update are exclusive: the id comes from EAS');
    if (options.runtime) {
      throw usage('--runtime and --from-eas-update are exclusive: the runtime comes from EAS');
    }
    added = releasesFromEasUpdate(ctx, options.fromEasUpdate, {
      kind,
      notes: options.notes,
      platforms,
      publishedAt,
    });
  } else {
    if (!options.id) throw usage('--id is required (the update group id, or an update id)');
    if (!options.notes) throw usage('--notes is required (what changed, in words users read)');
    const forPlatforms = platforms ?? PLATFORMS;
    added = [
      {
        id: options.id,
        platforms: forPlatforms,
        runtimeVersion: options.runtime ?? runtimeFromPolicy(ctx, options.policy, forPlatforms),
        kind,
        notes: options.notes,
        publishedAt: publishedAt ?? new Date(ctx.io.now()).toISOString(),
      },
    ];
  }

  const path = documentPath(ctx.io.cwd, 'releases', options.file);
  const doc = readDocument(path);
  const list = currentReleases(doc);
  for (const release of added) {
    const id = release.id.toLowerCase();
    if (
      list.some((r) => isJsonObject(r) && typeof r.id === 'string' && r.id.toLowerCase() === id)
    ) {
      throw new CliError('RELEASE_EXISTS', `A release with id "${release.id}" already exists`, {
        id: release.id,
        lines: [`Remove it first with \`upwell releases remove ${release.id}\`.`],
      });
    }
  }
  const text = new JsonText(
    doc.text ?? formatJson({ $schema: RELEASES_SCHEMA_URL, schemaVersion: 1, releases: [] })
  );
  // Newest first, like the examples and the docs.
  for (const release of [...added].reverse()) text.insert(['releases', 0], release);

  requireValid(ctx, path, validateReleases(text.value), 'would not be valid after this change');
  const result = await writeDocument(ctx, { path, before: doc.text, after: text.text }, options);
  ctx.done({ ...result, added });
}

export async function releasesRemove(
  ctx: Context,
  id: string,
  options: WriteOptions & { file?: string }
): Promise<void> {
  const path = documentPath(ctx.io.cwd, 'releases', options.file);
  const doc = readDocument(path);
  requireExisting(ctx, doc, CREATE_HINT);
  const list = currentReleases(doc);
  const index = list.findIndex(
    (r) => isJsonObject(r) && typeof r.id === 'string' && r.id.toLowerCase() === id.toLowerCase()
  );
  if (index === -1) {
    throw new CliError('RELEASE_NOT_FOUND', `No release with id "${id}"`, { id });
  }
  const text = new JsonText(doc.text!);
  text.remove(['releases', index]);
  const result = await writeDocument(ctx, { path, before: doc.text, after: text.text }, options);
  ctx.done({ ...result, removed: list[index] });
}

function currentReleases(doc: LoadedDocument): unknown[] {
  if (doc.text === null) return [];
  if (!isJsonObject(doc.value) || !Array.isArray(doc.value.releases)) {
    throw new CliError('INVALID_DOCUMENT', `${doc.path} must be an object with a "releases" array`);
  }
  return doc.value.releases;
}

/** Without --runtime: the policy's `ota.latestRuntimeVersion`, when the platforms agree on one. */
function runtimeFromPolicy(ctx: Context, file: string | undefined, platforms: Platform[]): string {
  const path = documentPath(ctx.io.cwd, 'policy', file);
  const doc = readDocument(path);
  const hint = 'Pass --runtime, or set it in the policy with `upwell policy set ota-runtime`.';
  if (doc.text === null) {
    throw usage(`--runtime is required (${displayPath(ctx.io.cwd, path)} not found). ${hint}`);
  }
  const policy = requireValid(ctx, path, validatePolicy(doc.value));
  const runtimes = new Set(platforms.map((p) => policy[p]?.ota?.latestRuntimeVersion));
  const [runtime] = [...runtimes];
  if (runtimes.size !== 1 || !runtime) {
    throw usage(
      `--runtime is required: the policy has no single OTA runtime for ${platforms.join(' and ')}. ${hint}`
    );
  }
  ctx.print(`Runtime ${runtime} (from the policy's ota.latestRuntimeVersion)`);
  return runtime;
}

/** One entry of `eas update --json` (eas-cli's getUpdateJsonInfosForUpdates). */
interface EasUpdate {
  id: string;
  group: string;
  platform: string;
  runtimeVersion: string;
  message?: string | null;
  createdAt?: string;
}

/**
 * `eas update --json` prints one entry per platform. When the platforms share a runtime the release
 * is the update group (one id the SDK matches on both); with per-platform runtimes (e.g. the
 * fingerprint policy) each platform gets its own release, keyed by its update id.
 */
function releasesFromEasUpdate(
  ctx: Context,
  file: string,
  options: { kind: ReleaseKind; notes?: string; platforms?: Platform[]; publishedAt?: string }
): Release[] {
  const path = resolve(ctx.io.cwd, file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') throw new CliError('FILE_NOT_FOUND', `${file} does not exist`);
    throw new CliError('INVALID_EAS_UPDATE', `${file} is not valid JSON: ${err.message}`);
  }
  const updates = (Array.isArray(raw) ? raw : []).filter(
    (u): u is EasUpdate =>
      isJsonObject(u) &&
      typeof u.id === 'string' &&
      typeof u.group === 'string' &&
      typeof u.platform === 'string' &&
      typeof u.runtimeVersion === 'string'
  );
  if (updates.length === 0) {
    throw new CliError(
      'INVALID_EAS_UPDATE',
      `${file} has no updates; expected the output of \`eas update --json\``
    );
  }
  const wanted = options.platforms ?? PLATFORMS;
  const selected = updates.filter((u) => wanted.includes(u.platform as Platform));
  if (selected.length === 0) {
    throw new CliError('INVALID_EAS_UPDATE', `${file} has no updates for ${wanted.join(' or ')}`);
  }

  const groups = new Map<string, EasUpdate[]>();
  for (const u of selected) groups.set(u.group, [...(groups.get(u.group) ?? []), u]);

  const releases: Release[] = [];
  for (const [group, members] of groups) {
    const notes = options.notes ?? members.find((u) => u.message)?.message ?? '';
    if (!notes) {
      throw usage(`--notes is required: update group ${group} has no message`);
    }
    const publishedAt =
      options.publishedAt ??
      members.find((u) => u.createdAt)?.createdAt ??
      new Date(ctx.io.now()).toISOString();
    const base = { kind: options.kind, notes, publishedAt };
    const runtimes = new Set(members.map((u) => u.runtimeVersion));
    if (runtimes.size === 1) {
      releases.push({
        id: group,
        platforms: PLATFORMS.filter((p) => members.some((u) => u.platform === p)),
        runtimeVersion: members[0]!.runtimeVersion,
        ...base,
      });
    } else {
      for (const u of members) {
        releases.push({
          id: u.id,
          platforms: [u.platform as Platform],
          runtimeVersion: u.runtimeVersion,
          ...base,
        });
      }
    }
  }
  return releases;
}
