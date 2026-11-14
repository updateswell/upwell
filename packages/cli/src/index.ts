#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

import { run } from './cli';
import type { ExecResult } from './context';

const FETCH_TIMEOUT_MS = 15_000;

run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  isTTY: !!process.stdin.isTTY && !!process.stdout.isTTY,
  confirm: async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
    } finally {
      rl.close();
    }
  },
  now: () => Date.now(),
  exec: (command, args, { cwd }) =>
    new Promise<ExecResult>((resolve) => {
      // `npx` is `npx.cmd` on Windows, which needs a shell.
      const child = spawn(command, args, { cwd, shell: process.platform === 'win32' });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (e) => resolve({ code: null, stdout, stderr: stderr + e.message }));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
    }),
  fetch: async (url, init = {}) => {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers),
      body: await res.text(),
    };
  },
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`error: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
);
