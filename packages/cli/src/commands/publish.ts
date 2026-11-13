import { validatePolicy, validateReleases } from '@upwell/core';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

import { findAppRoot } from '../app';
import {
  CONFIG_FILE,
  DEFAULT_POLICY,
  DEFAULT_RELEASES,
  displayPath,
  documentPath,
  loadConfig,
} from '../config';
import type { Context } from '../context';
import { lineDiff } from '../diff';
import {
  confirmChange,
  formatJson,
  isJsonObject,
  readDocument,
  requireExisting,
  requireValid,
  writeAtomic,
  type JsonObject,
  type WriteOptions,
} from '../documents';
import { CliError, usage } from '../errors';
import {
  GitHub,
  decodeBase64,
  encodeBase64,
  gistRawUrl,
  githubToken,
  repoRawUrl,
  type Gist,
  type RepoFile,
} from '../github';
import { JsonText } from '../json-text';
import { policyRisks } from '../risks';

const FILES = ['policy.json', 'releases.json'] as const;
type FileName = (typeof FILES)[number];

type Target =
  | { to: 'gist'; gist: string | null }
  | { to: 'github'; repo: string; branch: string | null; path: string };

/** What's published now. */
interface Live {
  files: Partial<Record<FileName, string>>;
  /** Blob shas of repo files, needed to update them. */
  shas: Partial<Record<FileName, string>>;
  /** Gist owner, for raw URLs. */
  owner?: string;
  /** The repo branch actually used (the default branch when none was given). */
  branch?: string;
  revision?: { id: string; at?: string };
}

export interface PublishOptions extends WriteOptions {
  to?: 'gist' | 'github';
  repo?: string;
  branch?: string;
  path?: string;
  file?: string;
  releasesFile?: string;
}

/**
 * Puts policy.json (and releases.json when there is one) at a stable public URL: a GitHub gist or
 * a file in a public repo. Shows the diff against what's live and applies the same guardrails as
 * `policy set`, then records the target and URLs in upwell.json.
 */
export async function publish(ctx: Context, options: PublishOptions): Promise<void> {
  const loaded = loadConfig(ctx.io.cwd);
  const root = loaded.file ? loaded.root : (findAppRoot(ctx.io.cwd) ?? ctx.io.cwd);

  // Local documents, validated like the app validates them.
  const policyPath = documentPath(ctx.io.cwd, 'policy', options.file);
  const policyDoc = readDocument(policyPath);
  requireExisting(ctx, policyDoc, 'Create it with `upwell init` or `upwell policy set …`.');
  const policy = requireValid(ctx, policyPath, validatePolicy(policyDoc.value));
  const releasesPath = documentPath(ctx.io.cwd, 'releases', options.releasesFile);
  const releasesDoc = readDocument(releasesPath);
  if (releasesDoc.text !== null) {
    requireValid(ctx, releasesPath, validateReleases(releasesDoc.value));
  }
  const local: Partial<Record<FileName, string>> = { 'policy.json': policyDoc.text! };
  if (releasesDoc.text !== null) local['releases.json'] = releasesDoc.text;

  const target = resolveTarget(loaded.config.publish, options);
  // A dry run only reads public data, so it works before logging in.
  const gh = new GitHub(ctx, await githubToken(ctx, !options.dryRun));
  const live = await fetchLive(gh, target, false);
  const isNew = target.to === 'gist' ? !target.gist : Object.keys(live.files).length === 0;

  // ── Diff ──
  const changed = FILES.filter((f) => local[f] !== undefined && local[f] !== live.files[f]);
  const where =
    target.to === 'gist'
      ? target.gist
        ? `gist ${target.gist}`
        : 'a new public gist'
      : `${target.repo} (${live.branch}, ${target.path}/)`;
  const diffs: Partial<Record<FileName, string[]>> = {};

  if (changed.length === 0) {
    ctx.print(`Up to date: ${where} already has the local files.`);
  } else {
    ctx.print(`Publishing to ${where}:`);
    for (const name of changed) {
      const before = live.files[name];
      if (before === undefined) {
        const lines = local[name]!.trimEnd().split('\n').length;
        ctx.print(`  ${name}: new (${lines} lines)`);
        diffs[name] = [];
      } else {
        diffs[name] = lineDiff(before, local[name]!);
        ctx.print(`  ${name}`);
        for (const line of diffs[name]!) ctx.print(`    ${line}`);
      }
    }
  }

  // Changes to a policy apps already read need --confirm; a first publish has no readers yet.
  const livePolicy = parseJson(live.files['policy.json']);
  const risks =
    changed.includes('policy.json') && livePolicy ? policyRisks(livePolicy, policy) : [];
  if (risks.length > 0) {
    ctx.print();
    for (const risk of risks) ctx.print(`  ! ${risk}`);
  }
  if (isNew) {
    ctx.print();
    ctx.print(
      target.to === 'gist'
        ? '  The gist is public: anyone with the link can read it. Apps download these files anyway; never put secrets in them.'
        : '  The files are public, like the repo. Apps download them anyway; never put secrets in them.'
    );
  }

  const result = {
    target: describeTarget(target, live),
    changed,
    diff: diffs,
    risks,
    dryRun: !!options.dryRun,
    published: false,
    revision: live.revision?.id ?? null,
    urls: urlsFor(target, live, Object.keys({ ...live.files, ...local }) as FileName[]),
  };

  if (changed.length === 0 || options.dryRun) {
    if (options.dryRun && changed.length > 0) {
      ctx.print();
      ctx.print('Dry run: nothing published.');
    }
    // Already published (e.g. from another machine): make sure upwell.json knows where.
    if (changed.length === 0 && !options.dryRun) {
      saveConfig(ctx, loaded.file, root, target, live, result.urls, { policyPath, releasesPath });
    }
    ctx.done(result);
    return;
  }

  await confirmChange(ctx, {
    risks,
    options,
    question: isNew ? `Publish to ${where}?` : 'Publish these changes?',
    retry: 'Re-run with --yes to publish',
    details: { changed, diff: diffs },
  });

  // ── Upload ──
  const uploaded = await upload(gh, target, live, local, changed, root);
  const urls = urlsFor(
    target,
    uploaded,
    Object.keys({ ...uploaded.files, ...local }) as FileName[]
  );

  ctx.print();
  ctx.print(
    `Published${uploaded.revision ? ` (revision ${uploaded.revision.id.slice(0, 7)})` : ''}.`
  );
  for (const [name, url] of Object.entries(urls)) ctx.print(`  ${name.padEnd(9)} ${url}`);
  ctx.print(
    'Devices see the change within about 5 minutes (GitHub caches raw files for 5 minutes).'
  );
  if (isNew) {
    ctx.print();
    ctx.print('In your app:');
    ctx.print(
      `  <UpwellProvider policy="${urls.policy}"${urls.releases ? ` releases="${urls.releases}"` : ''} …>`
    );
  }
  saveConfig(ctx, loaded.file, root, target, uploaded, urls, { policyPath, releasesPath });

  ctx.done({ ...result, published: true, revision: uploaded.revision?.id ?? null, urls });
}

export async function status(
  ctx: Context,
  options: { file?: string; releasesFile?: string }
): Promise<void> {
  const loaded = loadConfig(ctx.io.cwd);
  const saved = isJsonObject(loaded.config.publish) ? loaded.config.publish : null;
  if (!saved || (saved.to !== 'gist' && saved.to !== 'github')) {
    ctx.print('Not published yet. Run `upwell publish` to put the policy at a public URL.');
    ctx.done({ published: false });
    return;
  }

  const target = resolveTarget(saved, {});
  // Public gists and repos can be read without a token (with a lower rate limit).
  const gh = new GitHub(ctx, await githubToken(ctx, false));
  const live = await fetchLive(gh, target, true);

  const localTexts: Record<FileName, string | null> = {
    'policy.json': readDocument(documentPath(ctx.io.cwd, 'policy', options.file)).text,
    'releases.json': readDocument(documentPath(ctx.io.cwd, 'releases', options.releasesFile)).text,
  };
  const urls = urlsFor(target, live, Object.keys(live.files) as FileName[]);

  ctx.print(`Published to ${describeTarget(target, live).description}`);
  if (live.revision) {
    ctx.print(
      `Last revision ${live.revision.id.slice(0, 7)}${live.revision.at ? `, ${live.revision.at}` : ''}`
    );
  }
  ctx.print();

  const files = [];
  for (const name of FILES) {
    const published = live.files[name];
    const localText = localTexts[name];
    const state =
      published === undefined
        ? localText === null
          ? 'none'
          : 'not-published'
        : localText === null
          ? 'no-local-file'
          : localText === published
            ? 'in-sync'
            : 'differs';
    if (state === 'none') continue;

    const url = urls[name === 'policy.json' ? 'policy' : 'releases'];
    let cdn: {
      state: 'current' | 'stale' | 'unreachable';
      cacheControl?: string;
      age?: string;
    } | null = null;
    if (published !== undefined && url) {
      try {
        const res = await ctx.io.fetch(url);
        cdn = {
          state: res.status === 200 && res.body === published ? 'current' : 'stale',
          cacheControl: res.headers['cache-control'],
          age: res.headers.age,
        };
      } catch {
        cdn = { state: 'unreachable' };
      }
    }
    files.push({ name, state, url: url ?? null, cdn });

    const label: Record<string, string> = {
      'in-sync': 'published copy matches the local file',
      differs: 'local file has changes: run `upwell publish`',
      'not-published': 'not published yet: run `upwell publish`',
      'no-local-file': 'published, but there is no local file',
    };
    ctx.print(`${name}: ${label[state]}`);
    if (url) ctx.print(`  ${url}`);
    if (cdn?.state === 'stale') {
      ctx.print(
        `  The URL still serves an older copy${cdn.age ? ` (cached ${cdn.age} s ago)` : ''}; devices get the new one within about 5 minutes`
      );
    } else if (cdn?.state === 'unreachable') {
      ctx.print('  The URL could not be fetched');
    }
  }

  ctx.done({
    published: true,
    target: describeTarget(target, live),
    revision: live.revision ?? null,
    urls,
    files,
  });
}

// ── Targets ────────────────────────────────────────────────────────────────

function resolveTarget(
  saved: unknown,
  options: Pick<PublishOptions, 'to' | 'repo' | 'branch' | 'path'>
): Target {
  const s = isJsonObject(saved) ? saved : {};
  const to = options.to ?? (options.repo ? 'github' : s.to === 'github' ? 'github' : 'gist');
  if (to === 'gist') {
    return { to, gist: s.to === 'gist' && typeof s.gist === 'string' ? s.gist : null };
  }
  const sameRepo = s.to === 'github' && (!options.repo || options.repo === s.repo);
  const repo = options.repo ?? (sameRepo && typeof s.repo === 'string' ? s.repo : undefined);
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw usage('--repo owner/name is required to publish to a GitHub repo');
  }
  const branch =
    options.branch ?? (sameRepo && typeof s.branch === 'string' ? s.branch : null) ?? null;
  const path = (
    options.path ?? (sameRepo && typeof s.path === 'string' ? s.path : 'upwell')
  ).replace(/^\/+|\/+$/g, '');
  return { to, repo, branch, path };
}

function describeTarget(target: Target, live: Live) {
  if (target.to === 'gist') {
    return {
      to: 'gist' as const,
      gist: target.gist,
      description: target.gist ? `gist ${target.gist}` : 'a new gist',
    };
  }
  const branch = live.branch ?? target.branch;
  return {
    to: 'github' as const,
    repo: target.repo,
    branch,
    path: target.path,
    description: `${target.repo}, branch ${branch}, ${target.path}/`,
  };
}

function urlsFor(
  target: Target,
  live: Live,
  names: FileName[]
): { policy?: string; releases?: string } {
  const urls: { policy?: string; releases?: string } = {};
  for (const name of names) {
    const key = name === 'policy.json' ? 'policy' : 'releases';
    if (target.to === 'gist') {
      if (target.gist && live.owner) urls[key] = gistRawUrl(live.owner, target.gist, name);
    } else if (live.branch) {
      urls[key] = repoRawUrl(
        target.repo,
        live.branch,
        target.path ? `${target.path}/${name}` : name
      );
    }
  }
  return urls;
}

// ── Reading and writing GitHub ─────────────────────────────────────────────

async function fetchLive(gh: GitHub, target: Target, withRevision: boolean): Promise<Live> {
  if (target.to === 'gist') {
    if (!target.gist) return { files: {}, shas: {} };
    const res = await gh.request<Gist>('GET', `/gists/${target.gist}`);
    if (res.status === 404) {
      throw new CliError(
        'GIST_NOT_FOUND',
        `The gist ${target.gist} from upwell.json doesn't exist`,
        {
          lines: ['Remove "gist" from "publish" in upwell.json to publish to a new one.'],
        }
      );
    }
    if (res.status !== 200) gh.fail(res.status, res.data, `read gist ${target.gist}`);
    return gistLive(gh, res.data);
  }

  const repo = await gh.request<{ private: boolean; default_branch: string }>(
    'GET',
    `/repos/${target.repo}`
  );
  if (repo.status === 404) {
    throw new CliError(
      'REPO_NOT_FOUND',
      `The repo ${target.repo} doesn't exist (or the token can't see it)`,
      {
        lines: [`Create it first: gh repo create ${target.repo} --public`],
      }
    );
  }
  if (repo.status !== 200) gh.fail(repo.status, repo.data, `read ${target.repo}`);
  if (repo.data.private) {
    throw new CliError('REPO_PRIVATE', `${target.repo} is private`, {
      lines: [
        "Raw URLs of private repos need a token, which can't ship inside an app.",
        'Use a public repo for the published files (e.g. acme/app-updates), or a gist.',
      ],
    });
  }
  const branch = target.branch ?? repo.data.default_branch;
  const live: Live = { files: {}, shas: {}, branch };
  for (const name of FILES) {
    const path = filePath(target.path, name);
    const res = await gh.request<RepoFile>(
      'GET',
      `/repos/${target.repo}/contents/${path}?ref=${encodeURIComponent(branch)}`
    );
    if (res.status === 404) continue;
    if (res.status !== 200) gh.fail(res.status, res.data, `read ${path} in ${target.repo}`);
    live.files[name] = decodeBase64(res.data.content);
    live.shas[name] = res.data.sha;
  }
  if (withRevision) {
    const commits = await gh.request<{ sha: string; commit: { committer: { date: string } } }[]>(
      'GET',
      `/repos/${target.repo}/commits?path=${encodeURIComponent(target.path || '.')}&sha=${encodeURIComponent(branch)}&per_page=1`
    );
    const last = commits.status === 200 ? commits.data[0] : undefined;
    if (last) live.revision = { id: last.sha, at: last.commit.committer.date };
  }
  return live;
}

async function gistLive(gh: GitHub, gist: Gist): Promise<Live> {
  const live: Live = { files: {}, shas: {}, owner: gist.owner?.login };
  for (const name of FILES) {
    const file = gist.files[name];
    if (!file) continue;
    if (file.truncated && file.raw_url) {
      // The API truncates files above 1 MB; the raw URL has all of it.
      live.files[name] = await gh.raw(file.raw_url);
    } else {
      live.files[name] = file.content ?? '';
    }
  }
  const last = gist.history?.[0];
  if (last) live.revision = { id: last.version, at: last.committed_at };
  return live;
}

async function upload(
  gh: GitHub,
  target: Target,
  live: Live,
  local: Partial<Record<FileName, string>>,
  changed: FileName[],
  root: string
): Promise<Live> {
  const files = Object.fromEntries(changed.map((name) => [name, { content: local[name]! }]));

  if (target.to === 'gist') {
    if (target.gist) {
      const res = await gh.request<Gist>('PATCH', `/gists/${target.gist}`, { files });
      if (res.status !== 200) gh.fail(res.status, res.data, `update gist ${target.gist}`);
      return gistLive(gh, res.data);
    }
    const res = await gh.request<Gist>('POST', '/gists', {
      description: `Upwell policy for ${appName(root)} (published with @upwell/cli)`,
      public: true,
      files,
    });
    if (res.status !== 201) gh.fail(res.status, res.data, 'create a gist');
    target.gist = res.data.id;
    return gistLive(gh, res.data);
  }

  // One commit per file: the Contents API has no multi-file commit.
  const next: Live = { ...live, files: { ...live.files }, shas: { ...live.shas } };
  for (const name of changed) {
    const path = filePath(target.path, name);
    const res = await gh.request<{ content: { sha: string }; commit: { sha: string } }>(
      'PUT',
      `/repos/${target.repo}/contents/${path}`,
      {
        message: `chore(upwell): publish ${name}`,
        content: encodeBase64(local[name]!),
        branch: live.branch,
        ...(live.shas[name] ? { sha: live.shas[name] } : {}),
      }
    );
    if (res.status !== 200 && res.status !== 201) {
      gh.fail(res.status, res.data, `write ${path} in ${target.repo}`);
    }
    next.files[name] = local[name]!;
    next.shas[name] = res.data.content.sha;
    next.revision = { id: res.data.commit.sha };
  }
  return next;
}

/** Records the target and URLs in upwell.json, creating it when needed. */
function saveConfig(
  ctx: Context,
  configFile: string | null,
  root: string,
  target: Target,
  live: Live,
  urls: { policy?: string; releases?: string },
  paths: { policyPath: string; releasesPath: string }
): void {
  if (target.to === 'gist' && !target.gist) return;
  const publish: JsonObject =
    target.to === 'gist'
      ? { to: 'gist', gist: target.gist, urls }
      : { to: 'github', repo: target.repo, branch: live.branch, path: target.path, urls };

  const path = configFile ?? join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    const rel = (p: string) => relative(root, p).split('\\').join('/');
    writeAtomic(
      path,
      formatJson({
        policy: rel(paths.policyPath) || DEFAULT_POLICY,
        releases: rel(paths.releasesPath) || DEFAULT_RELEASES,
        publish,
      })
    );
    ctx.print(`Wrote ${displayPath(ctx.io.cwd, path)}`);
    return;
  }
  const text = new JsonText(readFileSync(path, 'utf8'));
  const current = (text.value as JsonObject).publish;
  if (JSON.stringify(current) === JSON.stringify(publish)) return;
  text.set(['publish'], publish, ['$schema', 'policy', 'releases', 'publish']);
  writeAtomic(path, text.text);
  ctx.print(`Updated ${displayPath(ctx.io.cwd, path)}`);
}

function filePath(dir: string, name: string): string {
  return (dir ? `${dir}/${name}` : name).split('/').map(encodeURIComponent).join('/');
}

function appName(root: string): string {
  for (const file of ['app.json', 'package.json']) {
    try {
      const value = JSON.parse(readFileSync(join(root, file), 'utf8'));
      const name = isJsonObject(value.expo) ? value.expo.name : value.name;
      if (typeof name === 'string' && name) return name;
    } catch {
      // Try the next one.
    }
  }
  return basename(root);
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
