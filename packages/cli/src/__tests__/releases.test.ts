import { examplePolicy, exampleReleases, sandbox, type Sandbox } from './helpers';

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

const RELEASES = 'upwell/releases.json';
const POLICY = 'upwell/policy.json';

/** What `eas update --json` printed for one `eas update` (shape from eas-cli). */
function easOutput(
  runtimes: { android: string; ios: string },
  message: string | null = 'Fix login'
) {
  return [
    {
      id: '0193a1b2-aaaa-7000-8000-000000000001',
      createdAt: '2026-11-12T09:00:00.000Z',
      group: '6a1e3c9b-0000-4000-8000-00000000abcd',
      branch: 'production',
      message,
      runtimeVersion: runtimes.android,
      platform: 'android',
      manifestPermalink: 'https://u.expo.dev/…',
      isRollBackToEmbedded: false,
      gitCommitHash: 'abc123',
    },
    {
      id: '0193a1b2-bbbb-7000-8000-000000000002',
      createdAt: '2026-11-12T09:00:00.000Z',
      group: '6a1e3c9b-0000-4000-8000-00000000abcd',
      branch: 'production',
      message,
      runtimeVersion: runtimes.ios,
      platform: 'ios',
      manifestPermalink: 'https://u.expo.dev/…',
      isRollBackToEmbedded: false,
      gitCommitHash: 'abc123',
    },
  ];
}

describe('releases validate / list', () => {
  it('validates', async () => {
    box.write(RELEASES, exampleReleases());
    const r = await box.run(['releases', 'validate']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('upwell/releases.json is valid (2 releases)\n');
  });

  it('reports duplicate ids', async () => {
    const doc = exampleReleases();
    doc.releases[1].id = doc.releases[0].id;
    box.write(RELEASES, doc);
    const r = await box.run(['releases', 'validate', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.error.errors).toEqual(['releases.releases[1].id: duplicate id "2026-10-21.1"']);
  });

  it('lists and filters', async () => {
    box.write(RELEASES, exampleReleases());
    const all = await box.run(['releases', 'list', '--json']);
    expect(all.json.data.releases.map((r: any) => r.id)).toEqual(['2026-10-21.1', '2026-10-19.1']);
    const none = await box.run(['releases', 'list', '--runtime', '9.9.9']);
    expect(none.stdout).toBe('No releases.\n');
  });
});

describe('releases add', () => {
  const add = ['releases', 'add', '--id', 'grp-1', '--kind', 'fix', '--notes', 'Fixed login'];

  it('creates the file and takes the runtime from the policy', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run([...add, '--yes']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Runtime 3.4.0 (from the policy's ota.latestRuntimeVersion)");
    expect(box.read(RELEASES)).toEqual({
      $schema: 'https://upwell.run/schemas/releases.schema.json',
      schemaVersion: 1,
      releases: [
        {
          id: 'grp-1',
          platforms: ['android', 'ios'],
          runtimeVersion: '3.4.0',
          kind: 'fix',
          notes: 'Fixed login',
          publishedAt: '2026-11-13T12:00:00.000Z',
        },
      ],
    });
  });

  it('puts the new release first and leaves the others untouched', async () => {
    box.write(
      RELEASES,
      '{\n  "schemaVersion": 1,\n  "releases": [\n    { "id": "old", "platforms": ["ios"], "runtimeVersion": "1", "kind": "fix", "notes": "x", "publishedAt": "2026-01-01" }\n  ]\n}\n'
    );
    const r = await box.run([...add, '--runtime', '1', '--platform', 'ios', '--yes', '--json']);
    expect(r.code).toBe(0);
    const text = box.readText(RELEASES);
    expect(text.indexOf('"grp-1"')).toBeLessThan(text.indexOf('"old"'));
    expect(text).toContain(
      '    { "id": "old", "platforms": ["ios"], "runtimeVersion": "1", "kind": "fix", "notes": "x", "publishedAt": "2026-01-01" }'
    );
    expect(r.json.data.added).toHaveLength(1);
  });

  it('needs --runtime when the policy has none, or the platforms disagree', async () => {
    const r = await box.run([...add, '--json']);
    expect(r.code).toBe(2);
    expect(r.json.error.message).toMatch(
      /^--runtime is required \(upwell\/policy.json not found\)/
    );

    const policy = examplePolicy();
    policy.ios.ota.latestRuntimeVersion = '3.5.0';
    box.write(POLICY, policy);
    const split = await box.run([...add, '--json']);
    expect(split.code).toBe(2);
    expect(split.json.error.message).toMatch(/no single OTA runtime for android and ios/);
    const iosOnly = await box.run([...add, '--platform', 'ios', '--yes', '--json']);
    expect(iosOnly.code).toBe(0);
    expect(box.read(RELEASES).releases[0].runtimeVersion).toBe('3.5.0');
  });

  it('requires --kind, --id and --notes', async () => {
    const noKind = await box.run(['releases', 'add', '--id', 'a', '--notes', 'n', '--json']);
    expect(noKind.code).toBe(2);
    expect(noKind.json.error.message).toMatch(/^--kind is required/);
    const badKind = await box.run(['releases', 'add', '--kind', 'chore', '--json']);
    expect(badKind.json.error.message).toBe('--kind must be fix, content or feature (got "chore")');
    const noId = await box.run(['releases', 'add', '--kind', 'fix', '--json']);
    expect(noId.json.error.message).toMatch(/^--id is required/);
    const noNotes = await box.run(['releases', 'add', '--kind', 'fix', '--id', 'a', '--json']);
    expect(noNotes.json.error.message).toMatch(/^--notes is required/);
  });

  it('refuses a duplicate id, ignoring case', async () => {
    box.write(RELEASES, exampleReleases());
    const r = await box.run([
      'releases',
      'add',
      '--id',
      '2026-10-21.1'.toUpperCase(),
      '--kind',
      'fix',
      '--notes',
      'again',
      '--runtime',
      '3.4.0',
      '--yes',
      '--json',
    ]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('RELEASE_EXISTS');
  });

  describe('--from-eas-update', () => {
    it('adds the update group as one release when the runtimes match', async () => {
      box.write('eas.json.out', easOutput({ android: '3.4.0', ios: '3.4.0' }));
      const r = await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'eas.json.out',
        '--kind',
        'fix',
        '--yes',
      ]);
      expect(r.code).toBe(0);
      expect(box.read(RELEASES).releases).toEqual([
        {
          id: '6a1e3c9b-0000-4000-8000-00000000abcd',
          platforms: ['android', 'ios'],
          runtimeVersion: '3.4.0',
          kind: 'fix',
          notes: 'Fix login',
          publishedAt: '2026-11-12T09:00:00.000Z',
        },
      ]);
    });

    it('adds one release per update when the runtimes differ (fingerprint)', async () => {
      box.write('out.json', easOutput({ android: 'fp-a', ios: 'fp-i' }));
      const r = await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'out.json',
        '--kind',
        'content',
        '--notes',
        'New banner',
        '--yes',
      ]);
      expect(r.code).toBe(0);
      const releases = box.read(RELEASES).releases;
      expect(releases.map((x: any) => [x.id, x.platforms, x.runtimeVersion, x.notes])).toEqual([
        ['0193a1b2-aaaa-7000-8000-000000000001', ['android'], 'fp-a', 'New banner'],
        ['0193a1b2-bbbb-7000-8000-000000000002', ['ios'], 'fp-i', 'New banner'],
      ]);
    });

    it('can take one platform', async () => {
      box.write('out.json', easOutput({ android: '3.4.0', ios: '3.4.0' }));
      await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'out.json',
        '--kind',
        'fix',
        '--platform',
        'ios',
        '--yes',
      ]);
      expect(box.read(RELEASES).releases[0].platforms).toEqual(['ios']);
    });

    it('needs --notes when the update has no message', async () => {
      box.write('out.json', easOutput({ android: '3.4.0', ios: '3.4.0' }, null));
      const r = await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'out.json',
        '--kind',
        'fix',
        '--json',
      ]);
      expect(r.code).toBe(2);
      expect(r.json.error.message).toMatch(/^--notes is required: update group/);
    });

    it('rejects files that are not eas update output', async () => {
      box.write('out.json', { hello: 'world' });
      const r = await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'out.json',
        '--kind',
        'fix',
        '--json',
      ]);
      expect(r.json.error.code).toBe('INVALID_EAS_UPDATE');
      const missing = await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'nope.json',
        '--kind',
        'fix',
        '--json',
      ]);
      expect(missing.json.error.code).toBe('FILE_NOT_FOUND');
    });

    it('does not mix with --id or --runtime', async () => {
      const r = await box.run([
        'releases',
        'add',
        '--from-eas-update',
        'out.json',
        '--id',
        'x',
        '--kind',
        'fix',
        '--json',
      ]);
      expect(r.code).toBe(2);
    });
  });
});

describe('releases remove', () => {
  it('removes by id and keeps the rest of the file as it was', async () => {
    box.write(RELEASES, exampleReleases());
    const r = await box.run(['releases', 'remove', '2026-10-19.1', '--yes', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.data.removed.id).toBe('2026-10-19.1');
    expect(box.read(RELEASES).releases.map((x: any) => x.id)).toEqual(['2026-10-21.1']);
  });

  it('fails for an unknown id', async () => {
    box.write(RELEASES, exampleReleases());
    const r = await box.run(['releases', 'remove', 'nope', '--yes', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('RELEASE_NOT_FOUND');
  });
});
