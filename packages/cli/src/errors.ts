/**
 * Exit codes. Coarse on purpose: scripts and agents branch on `error.code` from `--json`, the exit
 * code only says what kind of failure it was.
 */
export const EXIT = {
  ok: 0,
  /** The command ran and failed: invalid document, missing file, unknown id, … */
  failed: 1,
  /** Bad arguments or options. */
  usage: 2,
  /** A write needs `--yes` (or `--confirm` for risky changes) and nobody can be asked. */
  confirmationRequired: 3,
} as const;

export type ErrorCode =
  | 'USAGE'
  | 'FILE_NOT_FOUND'
  | 'INVALID_JSON'
  | 'INVALID_CONFIG'
  | 'INVALID_DOCUMENT'
  | 'INVALID_EAS_UPDATE'
  | 'RELEASE_EXISTS'
  | 'RELEASE_NOT_FOUND'
  | 'CONFIRMATION_REQUIRED'
  | 'ABORTED'
  | 'NOT_AN_EXPO_APP'
  | 'INSTALL_FAILED'
  | 'CHECKS_FAILED'
  | 'INTERNAL';

const EXIT_BY_CODE: Partial<Record<ErrorCode, number>> = {
  USAGE: EXIT.usage,
  CONFIRMATION_REQUIRED: EXIT.confirmationRequired,
};

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  /** Extra lines for people (validation errors, risks) and structured data for `--json`. */
  readonly details?: { lines?: string[]; [key: string]: unknown };

  constructor(code: ErrorCode, message: string, details?: CliError['details']) {
    super(message);
    this.code = code;
    this.exitCode = EXIT_BY_CODE[code] ?? EXIT.failed;
    this.details = details;
  }
}

export function usage(message: string): CliError {
  return new CliError('USAGE', message);
}
