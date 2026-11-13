import type { Context } from './context';
import { CliError } from './errors';

const API = 'https://api.github.com';

/**
 * The token for publishing: GITHUB_TOKEN / GH_TOKEN (CI), else the GitHub CLI's login. Upwell has
 * no credentials of its own.
 */
export async function githubToken(ctx: Context, required = true): Promise<string | null> {
  const fromEnv = ctx.io.env.GITHUB_TOKEN || ctx.io.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  const gh = await ctx.io.exec('gh', ['auth', 'token'], { cwd: ctx.io.cwd });
  const token = gh.code === 0 ? gh.stdout.trim() : '';
  if (token) return token;
  if (!required) return null;
  throw new CliError('AUTH_MISSING', 'No GitHub token to publish with', {
    lines: [
      'In CI, set GITHUB_TOKEN (or GH_TOKEN).',
      'Locally, log in with the GitHub CLI: gh auth login --scopes gist',
      'Gists need the "gist" scope; a repo target needs contents: write on that repo.',
    ],
  });
}

export class GitHub {
  constructor(
    private readonly ctx: Context,
    private readonly token: string | null
  ) {}

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'upwell-cli',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await this.ctx.io.fetch(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new CliError('GITHUB_UNREACHABLE', `Couldn't reach GitHub: ${(e as Error).message}`);
    }
    let data: unknown = null;
    try {
      data = response.body ? JSON.parse(response.body) : null;
    } catch {
      data = null;
    }
    return { status: response.status, data: data as T };
  }

  /** A raw file (gist or repo), without the API. */
  async raw(url: string): Promise<string> {
    return (await this.ctx.io.fetch(url)).body;
  }

  /** Throws a CliError with GitHub's message and a hint for the usual causes. */
  fail(status: number, data: unknown, what: string): never {
    const message =
      data &&
      typeof data === 'object' &&
      typeof (data as { message?: unknown }).message === 'string'
        ? (data as { message: string }).message
        : `HTTP ${status}`;
    if (status === 401) {
      throw new CliError('AUTH_INVALID', `GitHub rejected the token while trying to ${what}`, {
        lines: ['Check GITHUB_TOKEN / GH_TOKEN, or run gh auth login again.'],
      });
    }
    if (status === 403 || status === 404) {
      throw new CliError('GITHUB_FORBIDDEN', `Couldn't ${what}: ${message}`, {
        status,
        lines: [
          'The token may lack a scope: gists need "gist" (gh auth refresh --scopes gist),',
          'a repo target needs contents: write on that repo.',
        ],
      });
    }
    throw new CliError('GITHUB_ERROR', `Couldn't ${what}: ${message}`, { status });
  }
}

// ── Gists ──────────────────────────────────────────────────────────────────

export interface Gist {
  id: string;
  owner?: { login: string };
  html_url?: string;
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string } | null>;
  history?: { version: string; committed_at: string }[];
}

export function gistRawUrl(owner: string, id: string, file: string): string {
  return `https://gist.githubusercontent.com/${owner}/${id}/raw/${file}`;
}

// ── Repository contents ────────────────────────────────────────────────────

export interface RepoFile {
  sha: string;
  content: string;
}

export function repoRawUrl(repo: string, branch: string, path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${encoded}`;
}

export function decodeBase64(content: string): string {
  return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
}

export function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}
