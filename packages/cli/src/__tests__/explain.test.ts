import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { examplePolicy, sandbox, type Sandbox } from './helpers';

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
  box.write('upwell/policy.json', examplePolicy());
});
afterEach(() => box.cleanup());

const android = ['explain', '--platform', 'android', '--now', '2026-10-20'];

describe('explain', () => {
  it('runs the engine on the policy and prints the trace', async () => {
    const r = await box.run([...android, '--build', '290', '--version', '2.9.0']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(
      /^store\.required \(storeLink\)\n {2}required: build 290 < minimum 300/
    );
    expect(r.stdout).toContain('No Play info simulated');
  });

  it('uses the Play flows when Play info is given', async () => {
    const r = await box.run([
      ...android,
      '--build',
      '330',
      '--runtime',
      '3.4.0',
      '--play-version-code',
      '340',
      '--json',
    ]);
    expect(r.code).toBe(0);
    expect(r.json.data.decision).toMatchObject({
      kind: 'store.recommended',
      flow: 'playFlexible',
      target: { version: '3.4.0', build: '340' },
    });
    expect(r.json.data.trace[0]).toBe(
      'installed: android 330 (build 330), source play, runtime 3.4.0'
    );
    expect(r.json.data.input.store).toMatchObject({ kind: 'play', availableVersionCode: 340 });
  });

  it('explains an app without a policy', async () => {
    const r = await box.run([
      ...android,
      '--no-policy',
      '--build',
      '330',
      '--play-version-code',
      '340',
      '--play-priority',
      '5',
      '--json',
    ]);
    expect(r.json.data.decision.kind).toBe('store.recommended');
    expect(r.json.data.trace).toContain('policy: none');
  });

  it('needs --version on ios and takes App Store info', async () => {
    const missing = await box.run(['explain', '--platform', 'ios', '--build', '1', '--json']);
    expect(missing.code).toBe(2);

    const r = await box.run([
      'explain',
      '--platform',
      'ios',
      '--version',
      '3.4.0',
      '--build',
      '1',
      '--runtime',
      '3.4.0',
      '--app-store-version',
      '3.4.0',
      '--json',
    ]);
    expect(r.json.data.decision.kind).toBe('upToDate');
  });

  it('rejects store options for the other platform', async () => {
    const r = await box.run([...android, '--build', '1', '--app-store-version', '1.0', '--json']);
    expect(r.code).toBe(2);
    expect(r.json.error.message).toBe('--app-store-* options are for ios');
  });

  it('fails clearly without a policy file', async () => {
    const empty = sandbox();
    try {
      const r = await empty.run([...android, '--build', '1', '--json']);
      expect(r.json.error.code).toBe('FILE_NOT_FOUND');
      expect(r.json.error.message).toMatch(/--no-policy/);
    } finally {
      empty.cleanup();
    }
  });
});

describe('schema', () => {
  it('prints the schema core ships', async () => {
    const r = await box.run(['schema', 'policy']);
    const shipped = JSON.parse(
      readFileSync(join(__dirname, '../../../core/schemas/policy.schema.json'), 'utf8')
    );
    expect(JSON.parse(r.stdout)).toEqual(shipped);
  });

  it('wraps it with --json', async () => {
    const r = await box.run(['schema', 'releases', '--json']);
    expect(r.json.data.$id).toBe('https://upwell.run/schemas/releases.schema.json');
  });

  it('rejects unknown documents', async () => {
    const r = await box.run(['schema', 'nope']);
    expect(r.code).toBe(2);
  });
});

describe('program', () => {
  it('prints its version', async () => {
    const r = await box.run(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports unknown commands as usage errors, as JSON with --json', async () => {
    const r = await box.run(['nope', '--json']);
    expect(r.code).toBe(2);
    expect(r.json).toEqual({
      ok: false,
      error: { code: 'USAGE', message: "unknown command 'nope'" },
    });
    expect(r.stderr).toBe('');
  });

  it('shows help', async () => {
    const r = await box.run(['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Exit codes: 0 ok · 1 failed · 2 usage · 3 confirmation required');
  });
});
