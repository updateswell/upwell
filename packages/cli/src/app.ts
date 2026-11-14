import type { Platform } from '@upwell/core';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type { Context } from './context';
import { isJsonObject, type JsonObject } from './documents';

/** What `init` and `doctor` know about the Expo app they run in. */
export interface AppInfo {
  /** Directory with the app's package.json. */
  root: string;
  packageJson: JsonObject;
  /** dependencies and devDependencies, name → range. */
  dependencies: Record<string, string>;
  config: AppConfig;
  /** eas.json, or null. */
  eas: JsonObject | null;
}

export interface AppConfig {
  /** The `expo` object of the app config, resolved when possible. Null when none was found. */
  exp: JsonObject | null;
  /** `expo-config`: from `npx expo config` (plugins applied, dynamic config evaluated). */
  source: 'expo-config' | 'app.json' | 'none';
  /** app.json, when there is one. */
  staticFile: string | null;
  /** app.config.{js,ts,…}, when there is one: commands can't edit it, only explain. */
  dynamicFile: string | null;
  /** Why `npx expo config` wasn't used, when it wasn't. */
  fallbackReason?: string;
}

const DYNAMIC_CONFIGS = ['app.config.ts', 'app.config.js', 'app.config.mjs', 'app.config.cjs'];

/** The nearest directory from `cwd` up that has a package.json, or null. */
export function findAppRoot(cwd: string): string | null {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function readApp(
  ctx: Context,
  root: string,
  options: { resolveConfig: boolean }
): Promise<AppInfo> {
  const packageJson = readJsonObject(join(root, 'package.json')) ?? {};
  const dependencies = {
    ...asStringRecord(packageJson.devDependencies),
    ...asStringRecord(packageJson.dependencies),
  };
  return {
    root,
    packageJson,
    dependencies,
    config: await readAppConfig(ctx, root, options.resolveConfig),
    eas: readJsonObject(join(root, 'eas.json')),
  };
}

async function readAppConfig(
  ctx: Context,
  root: string,
  resolveConfig: boolean
): Promise<AppConfig> {
  const staticPath = join(root, 'app.json');
  const staticFile = existsSync(staticPath) ? staticPath : null;
  const dynamic = DYNAMIC_CONFIGS.map((f) => join(root, f)).find((f) => existsSync(f)) ?? null;
  const base = { staticFile, dynamicFile: dynamic };

  let fallbackReason: string | undefined;
  if (resolveConfig) {
    const result = await ctx.io.exec('npx', ['expo', 'config', '--json', '--type', 'public'], {
      cwd: root,
    });
    const exp = result.code === 0 ? parseLooseJson(result.stdout) : null;
    if (exp) return { ...base, exp, source: 'expo-config' };
    fallbackReason =
      result.code === 0
        ? '`npx expo config --json` printed no JSON'
        : `\`npx expo config --json\` failed: ${lastLine(result.stderr) || `exit code ${result.code}`}`;
  } else {
    fallbackReason = 'skipped (--static)';
  }

  if (staticFile) {
    const value = readJsonObject(staticFile);
    const exp = value && isJsonObject(value.expo) ? value.expo : value;
    return { ...base, exp, source: 'app.json', fallbackReason };
  }
  return { ...base, exp: null, source: 'none', fallbackReason };
}

/** Installed version of a package, from node_modules (walking up for workspaces), or null. */
export function installedVersion(root: string, name: string): string | null {
  let dir = root;
  for (;;) {
    const pkg = readJsonObject(join(dir, 'node_modules', name, 'package.json'));
    if (pkg) return typeof pkg.version === 'string' ? pkg.version : null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function appVersion(exp: JsonObject | null): string | null {
  return typeof exp?.version === 'string' ? exp.version : null;
}

/** versionCode / buildNumber from the app config. Expo's defaults apply when they're unset. */
export function appBuild(exp: JsonObject | null, platform: Platform): string | null {
  if (!exp) return null;
  const section = isJsonObject(exp[platform]) ? (exp[platform] as JsonObject) : {};
  const value = platform === 'android' ? section.versionCode : section.buildNumber;
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return '1';
}

export type RuntimeSetting =
  | { kind: 'none' }
  | { kind: 'fixed'; value: string }
  | { kind: 'policy'; policy: string; value: string | null };

/**
 * The runtime version this build will have. Fixed strings and the `appVersion` / `nativeVersion`
 * policies can be computed here; `fingerprint` can't (it hashes the native project).
 */
export function appRuntime(exp: JsonObject | null, platform: Platform): RuntimeSetting {
  if (!exp) return { kind: 'none' };
  const section = isJsonObject(exp[platform]) ? (exp[platform] as JsonObject) : {};
  const setting = section.runtimeVersion ?? exp.runtimeVersion;
  if (typeof setting === 'string') return { kind: 'fixed', value: setting };
  if (isJsonObject(setting) && typeof setting.policy === 'string') {
    const version = appVersion(exp);
    const build = appBuild(exp, platform);
    const value =
      setting.policy === 'appVersion'
        ? version
        : setting.policy === 'nativeVersion' && version
          ? `${version}(${build})`
          : null;
    return { kind: 'policy', policy: setting.policy, value };
  }
  return { kind: 'none' };
}

/** Whether `name` is in the app config's plugins, alone or as `[name, options]`. */
export function hasPlugin(exp: JsonObject | null, name: string): boolean {
  const plugins = exp?.plugins;
  if (!Array.isArray(plugins)) return false;
  return plugins.some((p) => p === name || (Array.isArray(p) && p[0] === name));
}

function readJsonObject(path: string): JsonObject | null {
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isJsonObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string')
  );
}

/** `expo config` can print warnings before the JSON. */
function parseLooseJson(text: string): JsonObject | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start));
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.trim() ?? '';
}
