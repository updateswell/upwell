import { sandbox, type FakeProcess, type Sandbox } from './helpers';

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

/** A fresh `create-expo-app` project: app.json, no upwell, no expo-updates. */
function freshExpoApp(app: object = {}) {
  box.write('package.json', { name: 'my-app', dependencies: { expo: '~58.0.0' } });
  box.write(
    'app.json',
    '{\n  "expo": {\n    "name": "my-app",\n    "slug": "my-app",\n    "version": "1.2.0",\n    "plugins": ["expo-router"],\n' +
      Object.entries(app)
        .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`)
        .join('') +
      '    "android": { "package": "com.acme.app", "versionCode": 12 }\n  }\n}\n'
  );
}

const installs = (): FakeProcess => ({
  calls: [],
  exec: (command, args) =>
    args[1] === 'install'
      ? { code: 0, stdout: 'installed', stderr: '' }
      : { code: 1, stdout: '', stderr: 'no expo config in tests' },
});

describe('init', () => {
  it('sets up a fresh Expo app', async () => {
    freshExpoApp();
    const proc = installs();
    const r = await box.run(['init', '--yes', '--json'], { process: proc });
    expect(r.code).toBe(0);
    expect(proc.calls).toEqual(['npx expo config --json --type public', 'npx expo install upwell']);
    expect(r.json.data.steps.map((s: any) => s.kind)).toEqual([
      'install',
      'plugin',
      'policy',
      'config',
    ]);

    // The plugin is appended, and the rest of app.json keeps its formatting.
    const appJson = box.readText('app.json');
    expect(appJson).toContain('"plugins": ["expo-router", "upwell"]');
    expect(appJson).toContain('"android": { "package": "com.acme.app", "versionCode": 12 }');

    expect(box.read('upwell/policy.json')).toEqual({
      $schema: 'https://upwell.run/schemas/policy.schema.json',
      schemaVersion: 1,
      android: {
        latest: { version: '1.2.0', build: 12 },
        minimum: { version: '1.2.0', build: 12 },
      },
      ios: {
        latest: { version: '1.2.0', build: '1' },
        minimum: { version: '1.2.0', build: '1' },
      },
    });
    expect(box.read('upwell.json')).toEqual({
      policy: 'upwell/policy.json',
      releases: 'upwell/releases.json',
    });
    expect(r.json.data.snippet).not.toContain('expoUpdatesAdapter');
  });

  it('adds expo-updates and the OTA runtime with --with-expo-updates', async () => {
    freshExpoApp({ runtimeVersion: { policy: 'appVersion' } });
    const proc = installs();
    const r = await box.run(['init', '--with-expo-updates', '--static', '--yes', '--json'], {
      process: proc,
    });
    expect(r.code).toBe(0);
    expect(proc.calls).toEqual(['npx expo install upwell expo-updates']);
    const policy = box.read('upwell/policy.json');
    expect(policy.android.ota).toEqual({ latestRuntimeVersion: '1.2.0' });
    expect(policy.ios.ota).toEqual({ latestRuntimeVersion: '1.2.0' });
    expect(r.json.data.snippet).toContain('ota={expoUpdatesAdapter()}');
    expect(r.json.data.notes).toContain(
      'expo-updates needs an update URL, a runtime version and channels: run `eas update:configure`, then `upwell doctor`'
    );
  });

  it('notes that a fingerprint runtime is only known after a build', async () => {
    freshExpoApp({ runtimeVersion: { policy: 'fingerprint' } });
    const r = await box.run(['init', '--with-expo-updates', '--static', '--yes', '--json'], {
      process: installs(),
    });
    expect(box.read('upwell/policy.json').android.ota).toBeUndefined();
    expect(r.json.data.notes.some((n: string) => n.startsWith('A fingerprint runtime'))).toBe(true);
  });

  it('shows the plan and changes nothing with --dry-run', async () => {
    freshExpoApp();
    const before = box.readText('app.json');
    const proc = installs();
    const r = await box.run(['init', '--dry-run', '--static'], { process: proc });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(
      /^upwell init would:\n {2}• install upwell \(npx expo install upwell\)\n/
    );
    expect(proc.calls).toEqual([]);
    expect(box.readText('app.json')).toBe(before);
  });

  it('needs --yes without a terminal, and asks in one', async () => {
    freshExpoApp();
    const r = await box.run(['init', '--static', '--json'], { process: installs() });
    expect(r.code).toBe(3);
    expect(r.json.error.steps).toHaveLength(4);

    const asked = await box.run(['init', '--static', '--skip-install'], {
      tty: true,
      answers: [true, false],
    });
    expect(asked.code).toBe(0);
    expect(asked.asked).toEqual([
      'Continue?',
      'Publish upwell/policy.json to a public GitHub gist now?',
    ]);
    expect(asked.stdout).toContain('Install it yourself: npx expo install upwell');
  });

  it('keeps what is already set up', async () => {
    freshExpoApp();
    box.write('package.json', {
      name: 'my-app',
      dependencies: { expo: '~58.0.0', upwell: '^0.2.0' },
    });
    box.write('upwell/policy.json', { schemaVersion: 1 });
    box.write('upwell.json', {});
    box.write('app.json', {
      expo: { name: 'a', version: '1.0.0', plugins: [['upwell', { storeUrlQueries: false }]] },
    });
    const r = await box.run(['init', '--static', '--json'], { process: installs() });
    expect(r.code).toBe(0);
    expect(r.json.data.steps).toEqual([]);
    expect(r.json.data.notes).toEqual(['Kept the existing upwell/policy.json']);
  });

  it('only explains the plugin for a dynamic app config', async () => {
    box.write('package.json', { name: 'a', dependencies: { expo: '~58.0.0', upwell: '0.2.1' } });
    box.write('app.config.ts', 'export default { name: "a", version: "2.0.0" };\n');
    const proc: FakeProcess = {
      calls: [],
      exec: () => ({
        code: 0,
        stdout: JSON.stringify({ name: 'a', version: '2.0.0' }),
        stderr: '',
      }),
    };
    const r = await box.run(['init', '--yes', '--json'], { process: proc });
    expect(r.code).toBe(0);
    expect(r.json.data.steps.map((s: any) => s.kind)).toEqual(['policy', 'config']);
    expect(r.json.data.notes[0]).toMatch(/^Add "upwell" to plugins in app.config.ts/);
    expect(box.read('upwell/policy.json').android.latest).toEqual({ version: '2.0.0', build: 1 });
  });

  it('refuses a project without expo', async () => {
    box.write('package.json', { name: 'web', dependencies: { react: '19' } });
    const r = await box.run(['init', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('NOT_AN_EXPO_APP');
  });

  it('stops when the install fails, before writing files', async () => {
    freshExpoApp();
    const proc: FakeProcess = {
      calls: [],
      exec: () => ({ code: 1, stdout: '', stderr: 'npm ERR! network\nnpm ERR! offline' }),
    };
    const r = await box.run(['init', '--static', '--yes', '--json'], { process: proc });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('INSTALL_FAILED');
    expect(() => box.read('upwell/policy.json')).toThrow();
  });

  it('offers to publish in a terminal, and finishes setup even when that fails', async () => {
    freshExpoApp();
    // No token and no gh login: publishing fails, init still succeeds.
    const r = await box.run(['init', '--static', '--skip-install'], {
      tty: true,
      answers: [true, true],
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('warning: publishing failed: No GitHub token to publish with');
    expect(box.read('upwell/policy.json').schemaVersion).toBe(1);
  });
});
