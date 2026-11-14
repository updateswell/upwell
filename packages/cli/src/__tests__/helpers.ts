import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { run } from '../cli';
import type { Io } from '../context';

export const EXAMPLE_POLICY = join(__dirname, '../../../../docs/examples/policy.json');
export const EXAMPLE_RELEASES = join(__dirname, '../../../../docs/examples/releases.json');

/** 2026-11-13T12:00:00Z */
export const NOW = Date.UTC(2026, 10, 13, 12);

export interface Result {
  code: number;
  stdout: string;
  stderr: string;
  /** Parsed stdout, for --json runs. */
  json: any;
  /** Questions the CLI asked. */
  asked: string[];
}

export interface Sandbox {
  dir: string;
  write(path: string, content: unknown): void;
  read(path: string): any;
  readText(path: string): string;
  /** Runs the CLI in the sandbox: no terminal unless `tty`, answers prompts from `answers`. */
  run(
    argv: string[],
    options?: { tty?: boolean; answers?: boolean[]; env?: Io['env']; cwd?: string }
  ): Promise<Result>;
  cleanup(): void;
}

export function sandbox(): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), 'upwell-cli-'));
  return {
    dir,
    write(path, content) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(
        full,
        typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'
      );
    },
    read(path) {
      return JSON.parse(readFileSync(join(dir, path), 'utf8'));
    },
    readText(path) {
      return readFileSync(join(dir, path), 'utf8');
    },
    async run(argv, options = {}) {
      let stdout = '';
      let stderr = '';
      const asked: string[] = [];
      const answers = [...(options.answers ?? [])];
      const code = await run(argv, {
        cwd: options.cwd ? join(dir, options.cwd) : dir,
        env: options.env ?? {},
        stdout: (t) => {
          stdout += t;
        },
        stderr: (t) => {
          stderr += t;
        },
        isTTY: !!options.tty,
        confirm: async (question) => {
          asked.push(question);
          const answer = answers.shift();
          if (answer === undefined) throw new Error(`unexpected prompt: ${question}`);
          return answer;
        },
        now: () => NOW,
      });
      let json: unknown;
      try {
        json = JSON.parse(stdout);
      } catch {
        json = undefined;
      }
      return { code, stdout, stderr, json, asked };
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function examplePolicy(): any {
  return JSON.parse(readFileSync(EXAMPLE_POLICY, 'utf8'));
}

export function exampleReleases(): any {
  return JSON.parse(readFileSync(EXAMPLE_RELEASES, 'utf8'));
}
