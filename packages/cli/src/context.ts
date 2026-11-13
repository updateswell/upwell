import { CliError } from './errors';

/** Everything a command touches outside its arguments, so tests can run commands in-process. */
export interface Io {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** stdin and stdout are both terminals. */
  isTTY: boolean;
  /** Asks a yes/no question. Only called when the context is interactive. */
  confirm: (question: string) => Promise<boolean>;
  /** Epoch ms. */
  now: () => number;
}

export interface GlobalOptions {
  json?: boolean;
}

export class Context {
  readonly io: Io;
  readonly json: boolean;
  /** A person can answer prompts: a terminal, not CI, not `--json`. */
  readonly interactive: boolean;

  constructor(io: Io, options: GlobalOptions) {
    this.io = io;
    this.json = !!options.json;
    this.interactive = io.isTTY && !isCi(io.env) && !this.json;
  }

  /** A line for people. Nothing with `--json`, where only the final result is printed. */
  print(line = ''): void {
    if (!this.json) this.io.stdout(line + '\n');
  }

  warn(line: string): void {
    if (!this.json) this.io.stderr(`warning: ${line}\n`);
  }

  /** The command's result. With `--json` this is the only thing on stdout. */
  done(data: unknown): void {
    if (this.json) this.io.stdout(JSON.stringify({ ok: true, data }, null, 2) + '\n');
  }

  fail(error: CliError): void {
    if (this.json) {
      const { lines: _lines, ...rest } = error.details ?? {};
      const body = {
        ok: false,
        error: { code: error.code, message: error.message, ...rest },
      };
      this.io.stdout(JSON.stringify(body, null, 2) + '\n');
      return;
    }
    this.io.stderr(`error: ${error.message}\n`);
    for (const line of error.details?.lines ?? []) this.io.stderr(`  ${line}\n`);
  }
}

function isCi(env: Io['env']): boolean {
  const ci = env.CI;
  return ci !== undefined && ci !== '' && ci !== '0' && ci.toLowerCase() !== 'false';
}
