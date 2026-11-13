import type { HttpResponse } from '../context';
import { sandbox, type FakeProcess, type Sandbox } from './helpers';

/** An in-memory GitHub: gists, public/private repos with the Contents API, raw URLs. */
class FakeGitHub {
  gists = new Map<string, { owner: string; files: Record<string, string>; history: string[] }>();
  repos = new Map<
    string,
    {
      private: boolean;
      defaultBranch: string;
      files: Map<string, { content: string; sha: string }>;
    }
  >();
  /** Raw URLs serving an older body, like GitHub's 5-minute cache. */
  stale = new Map<string, string>();
  /** Status to answer gist creation with (e.g. 403 for a token without the gist scope). */
  createStatus = 201;
  authorization: string[] = [];
  private counter = 0;

  process(env: Record<string, string> = { GITHUB_TOKEN: 'ghp_test' }): FakeProcess & {
    env: Record<string, string>;
  } {
    return {
      env,
      calls: [],
      requests: [],
      exec: () => ({ code: 1, stdout: '', stderr: 'gh: not logged in' }),
      handler: (req) => this.handle(req),
    };
  }

  private next(prefix: string): string {
    this.counter += 1;
    return `${prefix}${String(this.counter).padStart(4, '0')}`;
  }

  private handle(req: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  }): HttpResponse | undefined {
    const url = new URL(req.url);
    const json = (status: number, data: unknown): HttpResponse => ({
      status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = req.body ? JSON.parse(req.body) : {};
    if (req.headers.Authorization) this.authorization.push(req.headers.Authorization);

    if (url.hostname === 'gist.githubusercontent.com') {
      const [, owner, id, , file] = url.pathname.split('/');
      const gist = this.gists.get(id!);
      if (!gist || gist.owner !== owner || !gist.files[file!])
        return { status: 404, headers: {}, body: '404' };
      return {
        status: 200,
        headers: { 'cache-control': 'max-age=300', age: '42' },
        body: this.stale.get(req.url) ?? gist.files[file!]!,
      };
    }
    if (url.hostname === 'raw.githubusercontent.com') {
      const [, owner, name, branch, ...rest] = url.pathname.split('/');
      const repo = this.repos.get(`${owner}/${name}`);
      const file = repo?.files.get(`${branch}:${rest.join('/')}`);
      if (!file) return { status: 404, headers: {}, body: '404' };
      return { status: 200, headers: { 'cache-control': 'max-age=300' }, body: file.content };
    }
    if (url.hostname !== 'api.github.com') return undefined;

    const gistMatch = /^\/gists(?:\/(\w+))?$/.exec(url.pathname);
    if (gistMatch) {
      const id = gistMatch[1];
      const view = (gistId: string) => {
        const g = this.gists.get(gistId)!;
        return {
          id: gistId,
          owner: { login: g.owner },
          files: Object.fromEntries(
            Object.entries(g.files).map(([name, content]) => [
              name,
              {
                content,
                truncated: false,
                raw_url: `https://gist.githubusercontent.com/${g.owner}/${gistId}/raw/rev/${name}`,
              },
            ])
          ),
          history: g.history.map((version) => ({ version, committed_at: '2026-11-13T12:00:00Z' })),
        };
      };
      if (req.method === 'POST' && !id) {
        if (this.createStatus !== 201)
          return json(this.createStatus, { message: 'Resource not accessible by integration' });
        const newId = this.next('g');
        const files = Object.fromEntries(
          Object.entries(body.files as Record<string, { content: string }>).map(([n, f]) => [
            n,
            f.content,
          ])
        );
        this.gists.set(newId, { owner: 'acme', files, history: [this.next('rev')] });
        expect(body.public).toBe(true);
        return json(201, view(newId));
      }
      const gist = id ? this.gists.get(id) : undefined;
      if (!gist) return json(404, { message: 'Not Found' });
      if (req.method === 'GET') return json(200, view(id!));
      if (req.method === 'PATCH') {
        for (const [n, f] of Object.entries(body.files as Record<string, { content: string }>)) {
          gist.files[n] = f.content;
        }
        gist.history.unshift(this.next('rev'));
        return json(200, view(id!));
      }
    }

    const repoMatch = /^\/repos\/([\w.-]+\/[\w.-]+)(?:\/(contents|commits)(?:\/(.*))?)?$/.exec(
      url.pathname
    );
    if (repoMatch) {
      const [, name, kind, path] = repoMatch;
      const repo = this.repos.get(name!);
      if (!repo) return json(404, { message: 'Not Found' });
      if (!kind) return json(200, { private: repo.private, default_branch: repo.defaultBranch });
      if (kind === 'commits') {
        return json(200, [
          { sha: 'c0ffee1234', commit: { committer: { date: '2026-11-13T11:00:00Z' } } },
        ]);
      }
      const decoded = decodeURIComponent(path!);
      if (req.method === 'GET') {
        const file = repo.files.get(`${url.searchParams.get('ref')}:${decoded}`);
        if (!file) return json(404, { message: 'Not Found' });
        return json(200, { sha: file.sha, content: Buffer.from(file.content).toString('base64') });
      }
      if (req.method === 'PUT') {
        const key = `${body.branch}:${decoded}`;
        const existing = repo.files.get(key);
        if (existing && body.sha !== existing.sha) return json(409, { message: 'sha mismatch' });
        if (!existing && body.sha) return json(422, { message: 'sha for a new file' });
        const sha = this.next('blob');
        repo.files.set(key, { content: Buffer.from(body.content, 'base64').toString('utf8'), sha });
        return json(existing ? 200 : 201, {
          content: { sha },
          commit: { sha: this.next('commit') },
        });
      }
    }
    return json(404, { message: `unhandled ${req.method} ${req.url}` });
  }
}

const POLICY = {
  $schema: 'https://upwell.run/schemas/policy.schema.json',
  schemaVersion: 1,
  android: {
    latest: { version: '3.4.0', build: 340 },
    minimum: { version: '3.0.0', build: 300 },
  },
};
const RELEASES = { schemaVersion: 1, releases: [] };

let box: Sandbox;
let gh: FakeGitHub;
beforeEach(() => {
  box = sandbox();
  gh = new FakeGitHub();
  box.write('package.json', { name: 'shop-app' });
  box.write('upwell/policy.json', POLICY);
  box.write('upwell/releases.json', RELEASES);
});
afterEach(() => box.cleanup());

const run = (
  argv: string[],
  proc = gh.process(),
  extra: { tty?: boolean; answers?: boolean[] } = {}
) => box.run(argv, { process: proc, env: proc.env, ...extra });

describe('publish to a gist', () => {
  it('creates a public gist, then records it in upwell.json', async () => {
    const proc = gh.process();
    const r = await run(['publish', '--yes'], proc);
    expect(r.code).toBe(0);
    expect(proc.requests).toEqual(['POST https://api.github.com/gists']);
    expect(gh.authorization).toEqual(['Bearer ghp_test']);

    const gist = gh.gists.get('g0001')!;
    expect(Object.keys(gist.files)).toEqual(['policy.json', 'releases.json']);
    expect(gist.files['policy.json']).toBe(box.readText('upwell/policy.json'));

    expect(box.read('upwell.json')).toEqual({
      policy: 'upwell/policy.json',
      releases: 'upwell/releases.json',
      publish: {
        to: 'gist',
        gist: 'g0001',
        urls: {
          policy: 'https://gist.githubusercontent.com/acme/g0001/raw/policy.json',
          releases: 'https://gist.githubusercontent.com/acme/g0001/raw/releases.json',
        },
      },
    });
    expect(r.stdout).toContain('Publishing to a new public gist:');
    expect(r.stdout).toContain('The gist is public');
    expect(r.stdout).toContain(
      '<UpwellProvider policy="https://gist.githubusercontent.com/acme/g0001/raw/policy.json" releases="https://gist.githubusercontent.com/acme/g0001/raw/releases.json" …>'
    );
  });

  it('needs --yes without a terminal, and asks in one', async () => {
    const r = await run(['publish', '--json']);
    expect(r.code).toBe(3);
    expect(r.json.error.code).toBe('CONFIRMATION_REQUIRED');
    expect(gh.gists.size).toBe(0);

    const asked = await run(['publish'], gh.process(), { tty: true, answers: [true] });
    expect(asked.asked).toEqual(['Publish to a new public gist?']);
    expect(gh.gists.size).toBe(1);
  });

  it('does nothing when the gist is up to date', async () => {
    await run(['publish', '--yes']);
    const proc = gh.process();
    const r = await run(['publish', '--yes', '--json'], proc);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ changed: [], published: false });
    expect(proc.requests).toEqual(['GET https://api.github.com/gists/g0001']);
  });

  it('updates only the changed file, with a diff', async () => {
    await run(['publish', '--yes']);
    box.write('upwell/policy.json', {
      ...POLICY,
      android: { ...POLICY.android, latest: { version: '3.5.0', build: 350 } },
    });
    const proc = gh.process();
    const r = await run(['publish', '--yes', '--json'], proc);
    expect(r.code).toBe(0);
    expect(proc.requests).toEqual([
      'GET https://api.github.com/gists/g0001',
      'PATCH https://api.github.com/gists/g0001',
    ]);
    expect(r.json.data.changed).toEqual(['policy.json']);
    expect(r.json.data.diff['policy.json']).toContain('+       "version": "3.5.0",');
    expect(r.json.data.revision).toBe('rev0003');
    expect(gh.gists.get('g0001')!.history).toHaveLength(2);
  });

  it('needs --confirm for changes that affect installs', async () => {
    await run(['publish', '--yes']);
    box.write('upwell/policy.json', {
      ...POLICY,
      android: { ...POLICY.android, minimum: { version: '3.2.0', build: 320 } },
    });
    const r = await run(['publish', '--yes', '--json']);
    expect(r.code).toBe(3);
    expect(r.json.error.risks).toEqual([
      'raises the android minimum from build 300 (3.0.0) to build 320 (3.2.0): installs below it must update before they can use the app',
    ]);
    expect((await run(['publish', '--confirm'])).code).toBe(0);
    expect(gh.gists.get('g0001')!.files['policy.json']).toContain('"build": 320');
  });

  it('publishes nothing with --dry-run, and needs no token for it', async () => {
    const proc = gh.process({});
    const r = await run(['publish', '--dry-run', '--json'], proc);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({
      dryRun: true,
      published: false,
      changed: ['policy.json', 'releases.json'],
    });
    expect(proc.requests).toEqual([]);
    expect(() => box.read('upwell.json')).toThrow();
  });

  it('publishes the policy alone when there is no releases file', async () => {
    box.cleanup();
    box = sandbox();
    box.write('upwell/policy.json', POLICY);
    const r = await run(['publish', '--yes', '--json']);
    expect(Object.keys(gh.gists.get('g0001')!.files)).toEqual(['policy.json']);
    expect(r.json.data.urls).toEqual({
      policy: 'https://gist.githubusercontent.com/acme/g0001/raw/policy.json',
    });
  });

  it('refuses an invalid policy before talking to GitHub', async () => {
    box.write('upwell/policy.json', { schemaVersion: 1, android: { rollout: 101 } });
    const proc = gh.process();
    const r = await run(['publish', '--yes', '--json'], proc);
    expect(r.json.error.code).toBe('INVALID_DOCUMENT');
    expect(proc.requests).toEqual([]);
  });

  it('keeps the rest of an existing upwell.json', async () => {
    box.write(
      'upwell.json',
      '{\n  "policy": "upwell/policy.json",\n  "releases": "upwell/releases.json"\n}\n'
    );
    await run(['publish', '--yes']);
    const text = box.readText('upwell.json');
    expect(
      text.startsWith(
        '{\n  "policy": "upwell/policy.json",\n  "releases": "upwell/releases.json",\n  "publish": {'
      )
    ).toBe(true);
  });
});

describe('GitHub auth and errors', () => {
  it('uses the GitHub CLI login when no token is set', async () => {
    const proc = gh.process({});
    proc.exec = (command, args) =>
      command === 'gh' && args.join(' ') === 'auth token'
        ? { code: 0, stdout: 'gho_from_cli\n', stderr: '' }
        : { code: 1, stdout: '', stderr: '' };
    const r = await run(['publish', '--yes'], proc);
    expect(r.code).toBe(0);
    expect(gh.authorization).toEqual(['Bearer gho_from_cli']);
  });

  it('explains how to log in when there is no token', async () => {
    const r = await run(['publish', '--yes'], gh.process({}));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('error: No GitHub token to publish with');
    expect(r.stderr).toContain('gh auth login --scopes gist');
  });

  it('hints at the gist scope when GitHub refuses', async () => {
    gh.createStatus = 403;
    const r = await run(['publish', '--yes', '--json']);
    expect(r.json.error.code).toBe('GITHUB_FORBIDDEN');
    expect(r.json.error.message).toBe(
      "Couldn't create a gist: Resource not accessible by integration"
    );
  });

  it('fails clearly when the recorded gist is gone', async () => {
    box.write('upwell.json', { publish: { to: 'gist', gist: 'deleted1' } });
    const r = await run(['publish', '--yes', '--json']);
    expect(r.json.error.code).toBe('GIST_NOT_FOUND');
  });
});

describe('publish to a GitHub repo', () => {
  beforeEach(() => {
    gh.repos.set('acme/app-updates', { private: false, defaultBranch: 'main', files: new Map() });
  });

  it('commits both files to the default branch and records the target', async () => {
    const proc = gh.process();
    const r = await run(['publish', '--repo', 'acme/app-updates', '--yes', '--json'], proc);
    expect(r.code).toBe(0);
    expect(proc.requests).toEqual([
      'GET https://api.github.com/repos/acme/app-updates',
      'GET https://api.github.com/repos/acme/app-updates/contents/upwell/policy.json?ref=main',
      'GET https://api.github.com/repos/acme/app-updates/contents/upwell/releases.json?ref=main',
      'PUT https://api.github.com/repos/acme/app-updates/contents/upwell/policy.json',
      'PUT https://api.github.com/repos/acme/app-updates/contents/upwell/releases.json',
    ]);
    expect(box.read('upwell.json').publish).toEqual({
      to: 'github',
      repo: 'acme/app-updates',
      branch: 'main',
      path: 'upwell',
      urls: {
        policy: 'https://raw.githubusercontent.com/acme/app-updates/main/upwell/policy.json',
        releases: 'https://raw.githubusercontent.com/acme/app-updates/main/upwell/releases.json',
      },
    });
  });

  it('updates with the current sha on the next publish', async () => {
    await run(['publish', '--repo', 'acme/app-updates', '--yes']);
    box.write('upwell/releases.json', {
      schemaVersion: 1,
      releases: [
        {
          id: 'g1',
          platforms: ['android'],
          runtimeVersion: '3.4.0',
          kind: 'fix',
          notes: 'x',
          publishedAt: '2026-11-13',
        },
      ],
    });
    const r = await run(['publish', '--yes', '--json']); // the target comes from upwell.json
    expect(r.code).toBe(0);
    expect(r.json.data.changed).toEqual(['releases.json']);
    expect(
      gh.repos.get('acme/app-updates')!.files.get('main:upwell/releases.json')!.content
    ).toContain('"g1"');
  });

  it('refuses private and missing repos', async () => {
    gh.repos.set('acme/secret', { private: true, defaultBranch: 'main', files: new Map() });
    const priv = await run(['publish', '--repo', 'acme/secret', '--yes', '--json']);
    expect(priv.json.error.code).toBe('REPO_PRIVATE');
    const missing = await run(['publish', '--repo', 'acme/nope', '--yes', '--json']);
    expect(missing.json.error.code).toBe('REPO_NOT_FOUND');
    expect(missing.json.error.message).toMatch(/doesn't exist/);
  });

  it('needs --repo for --to github', async () => {
    const r = await run(['publish', '--to', 'github', '--json']);
    expect(r.code).toBe(2);
  });
});

describe('status', () => {
  it('says when nothing is published', async () => {
    const r = await run(['status', '--json']);
    expect(r.json.data).toEqual({ published: false });
  });

  it('compares the gist with the local files and the raw URL', async () => {
    await run(['publish', '--yes']);
    const synced = await run(['status', '--json']);
    expect(synced.json.data.files).toEqual([
      expect.objectContaining({
        name: 'policy.json',
        state: 'in-sync',
        cdn: expect.objectContaining({ state: 'current' }),
      }),
      expect.objectContaining({ name: 'releases.json', state: 'in-sync' }),
    ]);
    expect(synced.json.data.revision).toEqual({ id: 'rev0002', at: '2026-11-13T12:00:00Z' });

    box.write('upwell/policy.json', {
      ...POLICY,
      ios: { latest: { version: '1.0.0', build: '1' } },
    });
    gh.stale.set('https://gist.githubusercontent.com/acme/g0001/raw/releases.json', 'old');
    const r = await run(['status']);
    expect(r.stdout).toContain('policy.json: local file has changes: run `upwell publish`');
    expect(r.stdout).toContain('The URL still serves an older copy (cached 42 s ago)');
  });

  it('works without a token for public targets', async () => {
    await run(
      ['publish', '--repo', 'acme/app-updates', '--yes'],
      (() => {
        gh.repos.set('acme/app-updates', {
          private: false,
          defaultBranch: 'main',
          files: new Map(),
        });
        return gh.process();
      })()
    );
    gh.authorization = [];
    const r = await run(['status', '--json'], gh.process({}));
    expect(r.code).toBe(0);
    expect(gh.authorization).toEqual([]);
    expect(r.json.data.revision).toEqual({ id: 'c0ffee1234', at: '2026-11-13T11:00:00Z' });
    expect(r.json.data.files.map((f: any) => f.state)).toEqual(['in-sync', 'in-sync']);
  });
});

/** The command sequences from the "Automate your policy" guide, run as written. */
describe('documented recipes', () => {
  const easUpdate = (runtime: string) => [
    {
      id: 'u-android',
      group: 'grp-1',
      platform: 'android',
      runtimeVersion: runtime,
      message: 'Fix checkout on iOS 27',
      createdAt: '2026-11-13T10:00:00.000Z',
    },
    {
      id: 'u-ios',
      group: 'grp-1',
      platform: 'ios',
      runtimeVersion: runtime,
      message: 'Fix checkout on iOS 27',
      createdAt: '2026-11-13T10:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    box.write('upwell/policy.json', {
      ...POLICY,
      android: { ...POLICY.android, ota: { latestRuntimeVersion: '3.4.0' } },
    });
    expect((await run(['publish', '--yes'])).code).toBe(0); // "publish once by hand first"
  });

  it('after an OTA update', async () => {
    box.write('eas-update.json', easUpdate('3.4.0'));
    const add = await run([
      'releases',
      'add',
      '--from-eas-update',
      'eas-update.json',
      '--kind',
      'fix',
      '--yes',
    ]);
    expect(add.code).toBe(0);
    expect((await run(['publish', '--yes'])).code).toBe(0);
    expect(gh.gists.get('g0001')!.files['releases.json']).toContain(
      '"notes": "Fix checkout on iOS 27"'
    );
  });

  it('a new OTA runtime needs --confirm, at both steps', async () => {
    expect((await run(['policy', 'set', 'ota-runtime', '3.5.0', '--yes'])).code).toBe(3);
    expect((await run(['policy', 'set', 'ota-runtime', '3.5.0', '--confirm'])).code).toBe(0);
    expect((await run(['publish', '--yes'])).code).toBe(3);
    expect((await run(['publish', '--confirm'])).code).toBe(0);
  });

  it('after a store release', async () => {
    const steps = [
      [
        'policy',
        'set',
        'latest',
        '--platform',
        'android',
        '--version',
        '3.5.0',
        '--build',
        '350',
        '--released-at',
        'today',
        '--yes',
      ],
      [
        'policy',
        'set',
        'latest',
        '--platform',
        'ios',
        '--version',
        '3.5.0',
        '--build',
        '1',
        '--released-at',
        'today',
        '--yes',
      ],
      ['publish', '--yes'],
    ];
    for (const step of steps) expect((await run(step)).code).toBe(0);
    expect(JSON.parse(gh.gists.get('g0001')!.files['policy.json']!).ios.latest).toEqual({
      version: '3.5.0',
      build: '1',
      releasedAt: '2026-11-13',
    });
  });

  it('the pull request check runs without a token', async () => {
    const proc = gh.process({});
    for (const step of [
      ['policy', 'validate'],
      ['releases', 'validate'],
      ['publish', '--dry-run'],
    ]) {
      expect((await run(step, proc)).code).toBe(0);
    }
  });
});
