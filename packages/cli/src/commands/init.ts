import { validatePolicy, type Platform } from '@upwell/core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appBuild, appRuntime, appVersion, findAppRoot, hasPlugin, readApp } from '../app';
import {
  CONFIG_FILE,
  DEFAULT_POLICY,
  DEFAULT_RELEASES,
  displayPath,
  documentPath,
} from '../config';
import type { Context } from '../context';
import {
  formatJson,
  isJsonObject as isObject,
  requireValid,
  writeAtomic,
  type JsonObject,
} from '../documents';
import { CliError } from '../errors';
import { JsonText } from '../json-text';
import { PLATFORMS, POLICY_SCHEMA_URL, parseBuild } from './shared';

export interface InitOptions {
  yes?: boolean;
  dryRun?: boolean;
  /** Don't run `npx expo install`. */
  skipInstall?: boolean;
  /** Also install expo-updates. */
  withExpoUpdates?: boolean;
  /** Read app.json only; don't run `npx expo config`. */
  static?: boolean;
}

interface Step {
  kind: 'install' | 'plugin' | 'policy' | 'config';
  description: string;
  /** Files this step writes, with their new contents. */
  file?: { path: string; text: string };
  packages?: string[];
}

/**
 * Sets Upwell up in an Expo app: installs it, adds the config plugin, writes a policy for the
 * current version and upwell.json, then prints the provider snippet. Never edits source files.
 */
export async function init(ctx: Context, options: InitOptions): Promise<void> {
  const root = findAppRoot(ctx.io.cwd);
  if (!root) {
    throw new CliError('NOT_AN_EXPO_APP', 'No package.json here or in any parent directory');
  }
  const app = await readApp(ctx, root, { resolveConfig: !options.static });
  if (!app.dependencies.expo) {
    throw new CliError(
      'NOT_AN_EXPO_APP',
      `${displayPath(ctx.io.cwd, join(root, 'package.json'))} has no \`expo\` dependency`,
      { lines: ['In a bare React Native app, run `npx install-expo-modules@latest` first.'] }
    );
  }

  const exp = app.config.exp;
  const notes: string[] = [];
  const steps: Step[] = [];
  const hasUpdates = !!app.dependencies['expo-updates'] || !!options.withExpoUpdates;

  // ── Packages ──
  const packages = [
    ...(app.dependencies.upwell ? [] : ['upwell']),
    ...(options.withExpoUpdates && !app.dependencies['expo-updates'] ? ['expo-updates'] : []),
  ];
  if (packages.length > 0) {
    if (options.skipInstall) {
      notes.push(`Install it yourself: npx expo install ${packages.join(' ')}`);
    } else {
      steps.push({
        kind: 'install',
        description: `install ${packages.join(' and ')} (npx expo install ${packages.join(' ')})`,
        packages,
      });
    }
  }

  const updates = exp && isObject(exp.updates) ? exp.updates : {};
  if (hasUpdates && typeof updates.url !== 'string') {
    notes.push(
      'expo-updates needs an update URL, a runtime version and channels: run `eas update:configure`, then `upwell doctor`'
    );
  }

  // ── Config plugin ──
  if (!hasPlugin(exp, 'upwell')) {
    const { staticFile, dynamicFile } = app.config;
    if (staticFile && !dynamicFile) {
      const text = new JsonText(readFileSync(staticFile, 'utf8'));
      const value = text.value as JsonObject;
      const base = isObject(value.expo) ? ['expo'] : [];
      const plugins = (isObject(value.expo) ? value.expo : value).plugins;
      if (Array.isArray(plugins)) text.insert([...base, 'plugins', plugins.length], 'upwell');
      else text.set([...base, 'plugins'], ['upwell']);
      steps.push({
        kind: 'plugin',
        description: `add "upwell" to plugins in ${displayPath(ctx.io.cwd, staticFile)}`,
        file: { path: staticFile, text: text.text },
      });
    } else {
      notes.push(
        `Add "upwell" to plugins in ${dynamicFile ? displayPath(ctx.io.cwd, dynamicFile) : 'your app config'} (optional: it pins the Play Core version and declares the store URL schemes)`
      );
    }
  }

  // ── Policy ──
  const policyPath = documentPath(root, 'policy', undefined);
  if (existsSync(policyPath)) {
    notes.push(`Kept the existing ${displayPath(ctx.io.cwd, policyPath)}`);
  } else {
    const version = appVersion(exp) ?? '1.0.0';
    const policy: JsonObject = { $schema: POLICY_SCHEMA_URL, schemaVersion: 1 };
    const summary: string[] = [];
    for (const platform of PLATFORMS) {
      const build = buildFor(platform, appBuild(exp, platform) ?? '1');
      const ref = { version, build };
      const section: JsonObject = { latest: ref, minimum: ref };
      const runtime = appRuntime(exp, platform);
      if (hasUpdates && runtime.kind !== 'none' && runtime.value) {
        section.ota = { latestRuntimeVersion: runtime.value };
      }
      policy[platform] = section;
      summary.push(`${platform} ${version} (build ${build})`);
    }
    requireValid(ctx, policyPath, validatePolicy(policy), 'would not be valid');
    steps.push({
      kind: 'policy',
      description: `create ${displayPath(ctx.io.cwd, policyPath)}: latest and minimum ${summary.join(', ')}`,
      file: { path: policyPath, text: formatJson(policy) },
    });
    notes.push(
      'The policy starts with latest = minimum = this version: installs without Upwell never read it, so nobody is blocked. Raise minimum only when you need to force an update',
      'Add your App Store id to the ios section ("appStoreId": "123…") for the in-app App Store sheet'
    );
    if (app.eas && isObject(app.eas.cli) && app.eas.cli.appVersionSource === 'remote') {
      notes.push(
        'eas.json manages build numbers remotely (appVersionSource: remote): check the builds in the policy against your store builds'
      );
    }
    if (
      hasUpdates &&
      PLATFORMS.some((p) => {
        const runtime = appRuntime(exp, p);
        return runtime.kind === 'policy' && !runtime.value;
      })
    ) {
      notes.push(
        'A fingerprint runtime is only known after a build: set it with `upwell policy set ota-runtime <runtime>` once you publish OTA updates'
      );
    }
  }

  // ── upwell.json ──
  const configPath = join(root, CONFIG_FILE);
  if (!existsSync(configPath)) {
    steps.push({
      kind: 'config',
      description: `create ${displayPath(ctx.io.cwd, configPath)} (where the policy and releases live)`,
      file: {
        path: configPath,
        text: formatJson({ policy: DEFAULT_POLICY, releases: DEFAULT_RELEASES }),
      },
    });
  }

  // ── Plan, confirm, apply ──
  if (steps.length === 0) {
    ctx.print('Upwell is already set up here.');
  } else {
    ctx.print(options.dryRun ? 'upwell init would:' : 'upwell init will:');
    for (const step of steps) ctx.print(`  • ${step.description}`);
    ctx.print();
  }

  if (steps.length > 0 && !options.dryRun) {
    if (!options.yes) {
      if (!ctx.interactive) {
        throw new CliError('CONFIRMATION_REQUIRED', 'Re-run with --yes to set Upwell up', {
          steps: steps.map((s) => s.description),
        });
      }
      if (!(await ctx.io.confirm('Continue?'))) throw new CliError('ABORTED', 'Nothing changed');
    }
    for (const step of steps) {
      if (step.kind === 'install') {
        ctx.print(`Running npx expo install ${step.packages!.join(' ')}…`);
        const result = await ctx.io.exec('npx', ['expo', 'install', ...step.packages!], {
          cwd: root,
        });
        if (result.code !== 0) {
          throw new CliError(
            'INSTALL_FAILED',
            `npx expo install ${step.packages!.join(' ')} failed`,
            {
              lines: (result.stderr || result.stdout).trim().split('\n').slice(-10),
            }
          );
        }
      } else if (step.file) {
        writeAtomic(step.file.path, step.file.text);
        ctx.print(`Wrote ${displayPath(ctx.io.cwd, step.file.path)}`);
      }
    }
    ctx.print();
  }

  const snippet = providerSnippet(hasUpdates);
  ctx.print('Wrap your app (once, near the root):');
  ctx.print();
  for (const line of snippet.split('\n')) ctx.print(`  ${line}`);
  ctx.print();
  const next = [
    'Host upwell/policy.json at a public HTTPS URL and use it as `policy` (`upwell publish` is coming)',
    'Rebuild the native app: Upwell adds native code, so an OTA update can’t add it',
    'Check the setup: npx @upwell/cli doctor --policy-url <url>',
  ];
  if (notes.length > 0) {
    ctx.print('Notes:');
    for (const note of notes) ctx.print(`  - ${note}`);
    ctx.print();
  }
  ctx.print('Next:');
  next.forEach((n, i) => ctx.print(`  ${i + 1}. ${n}`));

  ctx.done({
    root,
    dryRun: !!options.dryRun,
    steps: steps.map(({ kind, description, file, packages: pkgs }) => ({
      kind,
      description,
      ...(file ? { file: file.path } : {}),
      ...(pkgs ? { packages: pkgs } : {}),
    })),
    snippet,
    notes,
    next,
  });
}

function providerSnippet(withOta: boolean): string {
  return [
    "import { UpwellProvider } from 'upwell/react';",
    ...(withOta ? ["import { expoUpdatesAdapter } from 'upwell/expo-updates';"] : []),
    "import { UpwellUI } from 'upwell/ui';",
    '',
    '<UpwellProvider',
    '  policy="https://…/policy.json" // where you host upwell/policy.json',
    ...(withOta ? ['  ota={expoUpdatesAdapter()}'] : []),
    '>',
    '  <App />',
    '  <UpwellUI />',
    '</UpwellProvider>',
  ].join('\n');
}

/** Android build numbers are integers in the policy; iOS keeps the CFBundleVersion string. */
function buildFor(platform: Platform, build: string): number | string {
  return platform === 'ios' ? build : parseBuild(build);
}
