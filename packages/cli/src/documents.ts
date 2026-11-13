import type { ValidationResult } from '@upwell/core';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { displayPath } from './config';
import type { Context } from './context';
import { lineDiff } from './diff';
import { CliError } from './errors';

export type JsonObject = Record<string, unknown>;

export interface LoadedDocument {
  path: string;
  /** File contents, or null when the file doesn't exist yet. */
  text: string | null;
  /** Parsed JSON, or null when the file doesn't exist yet. */
  value: unknown;
}

export function readDocument(path: string): LoadedDocument {
  if (!existsSync(path)) return { path, text: null, value: null };
  const text = readFileSync(path, 'utf8');
  try {
    return { path, text, value: JSON.parse(text) };
  } catch (e) {
    throw new CliError('INVALID_JSON', `${path} is not valid JSON: ${(e as Error).message}`);
  }
}

export function requireExisting(ctx: Context, doc: LoadedDocument, hint: string): void {
  if (doc.text === null) {
    throw new CliError(
      'FILE_NOT_FOUND',
      `${displayPath(ctx.io.cwd, doc.path)} does not exist. ${hint}`,
      { file: doc.path }
    );
  }
}

/** Returns the validated value, printing warnings; throws INVALID_DOCUMENT with every error. */
export function requireValid<T>(
  ctx: Context,
  path: string,
  result: ValidationResult<T>,
  what = 'is not valid'
): T {
  const shown = displayPath(ctx.io.cwd, path);
  if (!result.ok) {
    throw new CliError('INVALID_DOCUMENT', `${shown} ${what}`, {
      file: path,
      errors: result.errors,
      warnings: result.warnings,
      lines: [...result.errors, ...result.warnings.map((w) => `warning: ${w}`)],
    });
  }
  for (const w of result.warnings) ctx.warn(`${shown}: ${w}`);
  return result.value;
}

export function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export interface WriteOptions {
  /** Write without asking. */
  yes?: boolean;
  /** Accept risky changes (implies `yes`). */
  confirm?: boolean;
  dryRun?: boolean;
}

export interface WriteResult {
  file: string;
  changed: boolean;
  written: boolean;
  dryRun: boolean;
  diff: string[];
  /** Why this change needs `--confirm`: who is affected. */
  risks: string[];
}

/**
 * The one way commands change files: show the diff and any risks, then write only when allowed.
 * Interactive runs ask; everything else needs `--yes`, and risky changes need `--confirm`.
 */
export async function writeDocument(
  ctx: Context,
  change: { path: string; before: string | null; after: string; risks?: string[] },
  options: WriteOptions
): Promise<WriteResult> {
  const { path, before } = change;
  const risks = change.risks ?? [];
  const text = change.after;
  const shown = displayPath(ctx.io.cwd, path);
  const dryRun = !!options.dryRun;
  const base = { file: path, dryRun, risks };

  if (before === text) {
    ctx.print(`${shown}: no changes`);
    return { ...base, changed: false, written: false, diff: [] };
  }

  const diff = lineDiff(before ?? '', text);
  ctx.print(before === null ? `${shown} (new file)` : shown);
  for (const line of diff) ctx.print(`  ${line}`);
  if (risks.length > 0) {
    ctx.print();
    for (const risk of risks) ctx.print(`  ! ${risk}`);
  }

  if (dryRun) {
    ctx.print();
    ctx.print('Dry run: nothing written.');
    return { ...base, changed: true, written: false, diff };
  }

  if (risks.length > 0 && !options.confirm) {
    if (!ctx.interactive) {
      throw new CliError(
        'CONFIRMATION_REQUIRED',
        'This change affects existing installs; re-run with --confirm to apply it',
        { file: path, risks, diff, lines: risks }
      );
    }
    ctx.print();
    if (!(await ctx.io.confirm('Apply this change?'))) {
      throw new CliError('ABORTED', 'Nothing written');
    }
  } else if (!options.yes && !options.confirm) {
    if (!ctx.interactive) {
      throw new CliError('CONFIRMATION_REQUIRED', `Re-run with --yes to write ${shown}`, {
        file: path,
        diff,
      });
    }
    ctx.print();
    if (!(await ctx.io.confirm(`Write ${shown}?`))) {
      throw new CliError('ABORTED', 'Nothing written');
    }
  }

  writeAtomic(path, text);
  ctx.print(`Wrote ${shown}`);
  return { ...base, changed: true, written: true, diff };
}

/** Writes next to the target and renames, so an interrupted write never leaves half a file. */
export function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
