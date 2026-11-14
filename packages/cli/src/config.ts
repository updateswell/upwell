import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { CliError } from './errors';

/** `upwell.json` in the app repo: where the documents live and (plan 05 session 3) where they're published. */
export interface UpwellConfig {
  policy?: string;
  releases?: string;
  publish?: Record<string, unknown>;
}

export const CONFIG_FILE = 'upwell.json';
export const DEFAULT_POLICY = 'upwell/policy.json';
export const DEFAULT_RELEASES = 'upwell/releases.json';

export interface ResolvedConfig {
  /** Absolute path of `upwell.json`, or null when there is none. */
  file: string | null;
  /** Directory paths in the config are relative to (the config's, else the working directory). */
  root: string;
  config: UpwellConfig;
}

/** Finds `upwell.json` in `cwd` or the nearest parent, so commands work from any subdirectory. */
export function loadConfig(cwd: string): ResolvedConfig {
  let dir = resolve(cwd);
  for (;;) {
    const file = join(dir, CONFIG_FILE);
    if (existsSync(file)) return { file, root: dir, config: parseConfig(file) };
    const parent = dirname(dir);
    if (parent === dir) return { file: null, root: resolve(cwd), config: {} };
    dir = parent;
  }
}

function parseConfig(file: string): UpwellConfig {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new CliError('INVALID_CONFIG', `${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CliError('INVALID_CONFIG', `${file} must be a JSON object`);
  }
  const config = value as Record<string, unknown>;
  for (const key of ['policy', 'releases'] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'string') {
      throw new CliError('INVALID_CONFIG', `${file}: "${key}" must be a path string`);
    }
  }
  return config as UpwellConfig;
}

export type DocumentKind = 'policy' | 'releases';

/** `--file` (relative to the working directory) wins, then `upwell.json`, then the default path. */
export function documentPath(cwd: string, kind: DocumentKind, file: string | undefined): string {
  if (file) return resolve(cwd, file);
  const { root, config } = loadConfig(cwd);
  const configured = config[kind];
  return resolve(root, configured ?? (kind === 'policy' ? DEFAULT_POLICY : DEFAULT_RELEASES));
}

/** Path for messages: relative to the working directory when that's shorter. */
export function displayPath(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith('..') && rel.length < path.length ? rel : path;
}
