import { readFileSync } from 'node:fs';

import { EXAMPLE_POLICY, examplePolicy, sandbox, type Sandbox } from './helpers';

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

const POLICY = 'upwell/policy.json';

describe('policy validate', () => {
  it('accepts a valid policy at the default path', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run(['policy', 'validate']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('upwell/policy.json is valid (android, ios)\n');
  });

  it('prints { ok, data } with --json', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run(['policy', 'validate', '--json']);
    expect(r.json).toEqual({
      ok: true,
      data: {
        file: `${box.dir}/upwell/policy.json`,
        valid: true,
        warnings: [],
        platforms: ['android', 'ios'],
      },
    });
  });

  it('reports every error with INVALID_DOCUMENT and exit code 1', async () => {
    box.write(POLICY, { schemaVersion: 2, android: { rollout: 140 } });
    const r = await box.run(['policy', 'validate', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe('INVALID_DOCUMENT');
    expect(r.json.error.errors).toEqual([
      'policy.schemaVersion: must be 1 (got 2)',
      'policy.android.rollout: must be a number from 0 to 100',
    ]);
  });

  it('lists errors on stderr for people', async () => {
    box.write(POLICY, { schemaVersion: 1, android: { rollout: 140 } });
    const r = await box.run(['policy', 'validate']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(
      'error: upwell/policy.json is not valid\n' +
        '  policy.android.rollout: must be a number from 0 to 100\n'
    );
  });

  it('fails with FILE_NOT_FOUND when there is no policy', async () => {
    const r = await box.run(['policy', 'validate', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('FILE_NOT_FOUND');
  });

  it('fails with INVALID_JSON on broken JSON', async () => {
    box.write(POLICY, '{ "schemaVersion": 1,');
    const r = await box.run(['policy', 'validate', '--json']);
    expect(r.json.error.code).toBe('INVALID_JSON');
  });

  it('finds the paths in upwell.json from a subdirectory', async () => {
    box.write('upwell.json', { policy: 'config/update-policy.json' });
    box.write('config/update-policy.json', examplePolicy());
    box.write('src/screens/.keep', '');
    const r = await box.run(['policy', 'validate', '--json'], { cwd: 'src/screens' });
    expect(r.code).toBe(0);
    expect(r.json.data.file).toBe(`${box.dir}/config/update-policy.json`);
  });

  it('prefers --file, relative to the working directory', async () => {
    box.write('other.json', examplePolicy());
    const r = await box.run(['policy', 'validate', '--file', 'other.json']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('other.json is valid');
  });
});

describe('policy set latest / minimum', () => {
  const setLatest = ['policy', 'set', 'latest', '--platform', 'android', '--version', '3.5.0'];

  it('creates the policy, with $schema, when there is none', async () => {
    const r = await box.run([...setLatest, '--build', '350', '--yes']);
    expect(r.code).toBe(0);
    expect(box.read(POLICY)).toEqual({
      $schema: 'https://upwell.run/schemas/policy.schema.json',
      schemaVersion: 1,
      android: { latest: { version: '3.5.0', build: 350 } },
    });
    expect(r.stdout).toContain('upwell/policy.json (new file)');
    expect(r.stdout).toContain('Wrote upwell/policy.json');
  });

  it('needs --yes without a terminal, and writes nothing', async () => {
    box.write(POLICY, readFileSync(EXAMPLE_POLICY, 'utf8'));
    const before = box.readText(POLICY);
    const r = await box.run([...setLatest, '--build', '350', '--json']);
    expect(r.code).toBe(3);
    expect(r.json.error.code).toBe('CONFIRMATION_REQUIRED');
    // Only the changed line, and it stays inline like the rest of the file.
    expect(r.json.error.diff.filter((l: string) => !l.startsWith(' '))).toEqual([
      '-     "latest": { "version": "3.4.0", "build": 340, "releasedAt": "2026-10-18" },',
      '+     "latest": { "version": "3.5.0", "build": 350 },',
    ]);
    expect(box.readText(POLICY)).toBe(before);
  });

  it('treats CI as non-interactive even in a terminal', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run([...setLatest, '--build', '350'], { tty: true, env: { CI: 'true' } });
    expect(r.code).toBe(3);
    expect(r.asked).toEqual([]);
  });

  it('asks in a terminal and writes on yes', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run([...setLatest, '--build', '350'], { tty: true, answers: [true] });
    expect(r.code).toBe(0);
    expect(r.asked).toEqual(['Write upwell/policy.json?']);
    expect(box.read(POLICY).android.latest).toEqual({ version: '3.5.0', build: 350 });
  });

  it('aborts on no', async () => {
    box.write(POLICY, examplePolicy());
    const before = box.readText(POLICY);
    const r = await box.run([...setLatest, '--build', '350'], { tty: true, answers: [false] });
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('error: Nothing written\n');
    expect(box.readText(POLICY)).toBe(before);
  });

  it('shows the diff and writes nothing with --dry-run', async () => {
    box.write(POLICY, examplePolicy());
    const before = box.readText(POLICY);
    const r = await box.run([...setLatest, '--build', '350', '--dry-run', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ changed: true, written: false, dryRun: true });
    expect(r.json.data.diff.some((l: string) => l.startsWith('+') && l.includes('3.5.0'))).toBe(
      true
    );
    expect(box.readText(POLICY)).toBe(before);
  });

  it('reports no changes when the value is already set', async () => {
    box.write(POLICY, {
      schemaVersion: 1,
      android: { latest: { version: '3.5.0', build: 350 } },
    });
    const r = await box.run([...setLatest, '--build', '350', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.data).toMatchObject({ changed: false, written: false });
  });

  it('sets releasedAt, with "today"', async () => {
    await box.run([...setLatest, '--build', '350', '--released-at', 'today', '--yes']);
    expect(box.read(POLICY).android.latest.releasedAt).toBe('2026-11-13');
  });

  it('keeps releasedAt when the same version is set again', async () => {
    box.write(POLICY, {
      schemaVersion: 1,
      android: { latest: { version: '3.5.0', build: '350', releasedAt: '2026-11-01' } },
    });
    await box.run([...setLatest, '--build', '350', '--yes']);
    expect(box.read(POLICY).android.latest).toEqual({
      version: '3.5.0',
      build: 350,
      releasedAt: '2026-11-01',
    });
  });

  it('inserts latest before minimum and keeps other keys', async () => {
    box.write(POLICY, {
      schemaVersion: 1,
      android: { minimum: { version: '3.0.0', build: 300 }, rollout: 50, custom: true },
    });
    await box.run([...setLatest, '--build', '350', '--yes']);
    expect(Object.keys(box.read(POLICY).android)).toEqual([
      'latest',
      'minimum',
      'rollout',
      'custom',
    ]);
  });

  it('needs --confirm to lower latest', async () => {
    box.write(POLICY, examplePolicy());
    const lower = ['policy', 'set', 'latest', '--platform', 'android', '--version', '3.3.0'];
    const r = await box.run([...lower, '--build', '330', '--yes', '--json']);
    expect(r.code).toBe(3);
    expect(r.json.error.risks).toEqual([
      'lowers android latest from build 340 (3.4.0) to build 330 (3.3.0): installs in between stop being offered an update',
    ]);
    const ok = await box.run([...lower, '--build', '330', '--confirm']);
    expect(ok.code).toBe(0);
    expect(box.read(POLICY).android.latest).toEqual({ version: '3.3.0', build: 330 });
  });

  it('needs --confirm to raise minimum, and says who is affected', async () => {
    box.write(POLICY, examplePolicy());
    const raise = ['policy', 'set', 'minimum', '--platform', 'ios', '--version', '3.2.0'];
    const r = await box.run([...raise, '--build', '1', '--yes']);
    expect(r.code).toBe(3);
    expect(r.stderr).toContain(
      'raises the ios minimum from 3.0.0 (build 1) to 3.2.0 (build 1): installs below it must update before they can use the app'
    );
    expect((await box.run([...raise, '--build', '1', '--confirm'])).code).toBe(0);
    expect(box.read(POLICY).ios.minimum).toEqual({ version: '3.2.0', build: 1 });
  });

  it('treats a first minimum as risky, and asks in a terminal', async () => {
    box.write(POLICY, { schemaVersion: 1, android: { latest: { version: '3.4.0', build: 340 } } });
    const args = ['policy', 'set', 'minimum', '--platform', 'android', '--version', '3.0.0'];
    const r = await box.run([...args, '--build', '300'], { tty: true, answers: [true] });
    expect(r.code).toBe(0);
    expect(r.asked).toEqual(['Apply this change?']);
    expect(r.stdout).toContain('! sets a android minimum of build 300 (3.0.0)');
  });

  it('does not need --confirm to lower minimum', async () => {
    box.write(POLICY, examplePolicy());
    const args = ['policy', 'set', 'minimum', '--platform', 'android', '--version', '2.9.0'];
    expect((await box.run([...args, '--build', '290', '--yes'])).code).toBe(0);
  });

  it('refuses a change that makes the policy invalid', async () => {
    box.write(POLICY, examplePolicy());
    const args = ['policy', 'set', 'minimum', '--platform', 'android', '--version', '4.0.0'];
    const r = await box.run([...args, '--build', '400', '--confirm', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('INVALID_DOCUMENT');
    expect(r.json.error.message).toBe('upwell/policy.json would not be valid after this change');
  });

  it('checks its arguments', async () => {
    const bad = await box.run([...setLatest, '--build', 'abc', '--json']);
    expect(bad.code).toBe(2);
    expect(bad.json.error).toEqual({
      code: 'USAGE',
      message: '--build must be an integer or a dotted number like 1.2 (got "abc")',
    });
    const missing = await box.run(['policy', 'set', 'latest', '--version', '1.0.0', '--json']);
    expect(missing.code).toBe(2);
    expect(missing.json.error.code).toBe('USAGE');
    const platform = await box.run(['policy', 'set', 'latest', '--platform', 'web', '--json']);
    expect(platform.code).toBe(2);
  });
});

describe('policy set ota-runtime', () => {
  it('sets every platform the policy has, with the risk spelled out', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run(['policy', 'set', 'ota-runtime', '3.5.0', '--json']);
    expect(r.code).toBe(3);
    expect(r.json.error.risks).toEqual([
      'changes the android OTA runtime from 3.4.0 to 3.5.0: installs on 3.4.0 become stranded and are offered a store update when a newer build exists, and required after 14 days',
      'changes the ios OTA runtime from 3.4.0 to 3.5.0: installs on 3.4.0 become stranded and are offered a store update when a newer build exists, and required after 14 days',
    ]);
    expect((await box.run(['policy', 'set', 'ota-runtime', '3.5.0', '--confirm'])).code).toBe(0);
    const policy = box.read(POLICY);
    expect(policy.android.ota.latestRuntimeVersion).toBe('3.5.0');
    expect(policy.ios.ota.latestRuntimeVersion).toBe('3.5.0');
  });

  it('sets one platform with --platform, creating ota', async () => {
    box.write(POLICY, { schemaVersion: 1, android: { rollout: 100 }, ios: {} });
    await box.run(['policy', 'set', 'ota-runtime', '2.0.0', '--platform', 'ios', '--confirm']);
    expect(box.read(POLICY)).toEqual({
      schemaVersion: 1,
      android: { rollout: 100 },
      ios: { ota: { latestRuntimeVersion: '2.0.0' } },
    });
  });

  it('is a no-op when already set', async () => {
    box.write(POLICY, examplePolicy());
    const r = await box.run(['policy', 'set', 'ota-runtime', '3.4.0', '--json']);
    expect(r.code).toBe(0);
    expect(r.json.data.changed).toBe(false);
  });
});
