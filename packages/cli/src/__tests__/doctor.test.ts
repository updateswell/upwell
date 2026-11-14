import { sandbox, type FakeProcess, type Sandbox } from './helpers';

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

const POLICY_URL = 'https://gist.githubusercontent.com/acme/abc/raw/policy.json';

/** The smoke app (`~/projects/upwell-smoke`) as it is now: working OTA and store updates. */
function smokeApp(overrides: { app?: object; eas?: object; upwell?: string } = {}) {
  box.write('package.json', {
    name: 'upwell-smoke',
    dependencies: { expo: '~58.0.17', 'expo-updates': '~58.0.18', upwell: '^0.1.3' },
  });
  box.write('node_modules/upwell/package.json', { version: overrides.upwell ?? '0.2.1' });
  box.write('app.json', {
    expo: {
      name: 'upwell-smoke',
      version: '3.3.0',
      ios: { bundleIdentifier: 'com.upwell.smoke' },
      android: { package: 'com.upwell.smoke', versionCode: 330 },
      plugins: ['upwell'],
      runtimeVersion: { policy: 'appVersion' },
      updates: { url: 'https://u.expo.dev/50d35cbd', checkAutomatically: 'NEVER' },
      ...overrides.app,
    },
  });
  box.write(
    'eas.json',
    overrides.eas ?? {
      cli: { appVersionSource: 'local' },
      build: { preview: { distribution: 'internal', channel: 'preview' } },
    }
  );
}

function policyFor(version: string, android: number, runtime = version) {
  return {
    schemaVersion: 1,
    android: {
      latest: { version, build: android },
      minimum: { version: '3.0.0', build: 300 },
      ota: { latestRuntimeVersion: runtime },
    },
    ios: {
      appStoreId: '1234567890',
      latest: { version, build: '1' },
      ota: { latestRuntimeVersion: runtime },
    },
  };
}

function codes(json: any): string[] {
  const findings = json.ok ? json.data.findings : json.error.findings;
  return findings.map((f: any) => `${f.severity} ${f.code}`);
}

const fresh = (): FakeProcess => ({ calls: [] });

describe('doctor', () => {
  it('passes the smoke app as it is now', async () => {
    smokeApp();
    box.write('upwell/policy.json', policyFor('3.3.0', 330));
    const proc = fresh();
    proc.responses = {
      [POLICY_URL]: {
        status: 200,
        headers: { 'cache-control': 'max-age=300' },
        body: JSON.stringify(policyFor('3.3.0', 330)),
      },
    };
    const r = await box.run(['doctor', '--policy-url', POLICY_URL, '--json'], { process: proc });
    expect(r.code).toBe(0);
    // expo config isn't available in tests, so app.json is read directly.
    expect(codes(r.json)).toEqual(['info APP_CONFIG_STATIC']);
    expect(proc.calls).toEqual(['npx expo config --json --type public']);
    expect(r.json.data.counts).toEqual({ error: 0, warning: 0, info: 1 });
  });

  it('finds what broke the smoke app during device testing', async () => {
    // Before the fixes: upwell 0.1.2 with a runtime policy, no channel, policy over plain HTTP.
    smokeApp({ upwell: '0.1.2', eas: { build: { preview: { distribution: 'internal' } } } });
    const url = 'http://192.168.1.20:8090/policy.json';
    const proc = fresh();
    proc.responses = {
      [url]: { status: 200, headers: {}, body: JSON.stringify(policyFor('3.3.0', 330)) },
    };
    const r = await box.run(['doctor', '--static', '--policy-url', url, '--json'], {
      process: proc,
    });
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe('CHECKS_FAILED');
    expect(codes(r.json)).toEqual([
      'warning RUNTIME_POLICY_NEEDS_NEWER_UPWELL',
      'warning CHANNEL_MISSING',
      'error POLICY_URL_NOT_HTTPS',
    ]);
    expect(proc.calls).toEqual([]); // --static
  });

  it('allows plain HTTP to local hosts with a warning', async () => {
    smokeApp();
    const url = 'http://localhost:8090/policy.json';
    const proc = fresh();
    proc.responses = {
      [url]: { status: 200, headers: {}, body: JSON.stringify(policyFor('3.3.0', 330)) },
    };
    const r = await box.run(['doctor', '--static', '--policy-url', url, '--json'], {
      process: proc,
    });
    expect(r.code).toBe(0);
    expect(codes(r.json)).toEqual(['warning POLICY_URL_NOT_HTTPS']);
  });

  it('reports a missing upwell, expo and app setup', async () => {
    box.write('package.json', { name: 'x', dependencies: { react: '19' } });
    const r = await box.run(['doctor', '--json']);
    expect(r.code).toBe(1);
    expect(codes(r.json)).toEqual([
      'error EXPO_MISSING',
      'error UPWELL_MISSING',
      'info NO_OTA',
      'warning APP_CONFIG_STATIC',
      'info NO_POLICY',
    ]);
  });

  it('checks the expo-updates setup', async () => {
    smokeApp({
      app: { updates: { checkAutomatically: 'ON_LOAD' }, runtimeVersion: undefined, plugins: [] },
    });
    const r = await box.run(['doctor', '--static', '--json']);
    expect(codes(r.json)).toEqual([
      'info PLUGIN_NOT_CONFIGURED',
      'error UPDATES_URL_MISSING',
      'error RUNTIME_VERSION_MISSING',
      'info UPDATES_CHECK_AUTOMATICALLY',
      'info NO_POLICY',
    ]);
  });

  it('accepts a channel from updates.requestHeaders', async () => {
    smokeApp({
      eas: { build: {} },
      app: {
        updates: {
          url: 'https://u.expo.dev/x',
          checkAutomatically: 'NEVER',
          requestHeaders: { 'expo-channel-name': 'production' },
        },
      },
    });
    const r = await box.run(['doctor', '--static', '--json']);
    expect(codes(r.json)).not.toContain('warning CHANNEL_MISSING');
  });

  it('compares the policy with the app being built', async () => {
    smokeApp({ app: { version: '3.4.0', android: { versionCode: 340 } } });
    const policy = policyFor('3.3.0', 330);
    delete (policy.ios as any).appStoreId;
    box.write('upwell/policy.json', policy);
    const r = await box.run(['doctor', '--static', '--json']);
    expect(r.code).toBe(0);
    expect(codes(r.json)).toEqual([
      'info POLICY_NOT_PUBLISHED',
      'warning LATEST_BEHIND_APP',
      'warning OTA_RUNTIME_DIFFERS',
      'warning LATEST_BEHIND_APP',
      'warning OTA_RUNTIME_DIFFERS',
      'warning APP_STORE_ID_MISSING',
    ]);
    const latest = r.json.data.findings.find((f: any) => f.code === 'LATEST_BEHIND_APP');
    expect(latest.fix).toBe(
      'upwell policy set latest --platform android --version 3.4.0 --build 340 --released-at today'
    );
  });

  it('tells an outdated build apart from a new one', async () => {
    // The smoke app on purpose: runtime 3.3.0 while OTA updates target 3.4.0.
    smokeApp();
    box.write('upwell/policy.json', policyFor('3.4.0', 340));
    const r = await box.run(['doctor', '--static', '--json']);
    const finding = r.json.data.findings.find((f: any) => f.code === 'OTA_RUNTIME_DIFFERS');
    expect(finding.message).toBe(
      "android: this build's runtime 3.3.0 is older than policy ota.latestRuntimeVersion 3.4.0, so its installs are stranded from the start"
    );
    expect(finding.fix).toMatch(/^Bump the app version/);
  });

  it('skips build comparisons when EAS manages versions remotely', async () => {
    smokeApp({
      app: { version: '3.4.0' },
      eas: { cli: { appVersionSource: 'remote' }, build: { p: { channel: 'p' } } },
    });
    box.write('upwell/policy.json', policyFor('3.3.0', 330, '3.4.0'));
    const r = await box.run(['doctor', '--static', '--json']);
    expect(codes(r.json)).toEqual(['info POLICY_NOT_PUBLISHED']);
  });

  it('reports an invalid local policy', async () => {
    smokeApp();
    box.write('upwell/policy.json', { schemaVersion: 1, android: { rollout: 200 } });
    const r = await box.run(['doctor', '--static', '--json']);
    expect(r.code).toBe(1);
    expect(r.json.error.findings).toContainEqual({
      code: 'POLICY_INVALID',
      severity: 'error',
      message: 'upwell/policy.json: policy.android.rollout: must be a number from 0 to 100',
    });
  });

  describe('published copies', () => {
    beforeEach(() => {
      smokeApp();
      box.write('upwell/policy.json', policyFor('3.3.0', 330));
    });

    it('reads the URLs from upwell.json', async () => {
      box.write('upwell.json', { publish: { urls: { policy: POLICY_URL } } });
      const proc = fresh();
      proc.responses = {
        [POLICY_URL]: {
          status: 200,
          headers: { 'cache-control': 'max-age=3600' },
          body: JSON.stringify({ ...policyFor('3.3.0', 330), $schema: 'x' }),
        },
      };
      const r = await box.run(['doctor', '--static', '--json'], { process: proc });
      expect(codes(r.json)).toEqual(['warning POLICY_CACHE_LONG']);
    });

    it('warns when the published copy differs from the local file', async () => {
      const proc = fresh();
      proc.responses = {
        [POLICY_URL]: { status: 200, headers: {}, body: JSON.stringify(policyFor('3.2.0', 320)) },
      };
      const r = await box.run(['doctor', '--static', '--policy-url', POLICY_URL, '--json'], {
        process: proc,
      });
      // The app is compared with the published copy: that's what devices see.
      expect(codes(r.json)).toEqual([
        'warning POLICY_OUT_OF_DATE',
        'warning LATEST_BEHIND_APP',
        'warning OTA_RUNTIME_DIFFERS',
        'warning LATEST_BEHIND_APP',
        'warning OTA_RUNTIME_DIFFERS',
      ]);
    });

    it('fails when devices could not use it', async () => {
      const proc = fresh();
      proc.responses = {
        [POLICY_URL]: { status: 404, headers: {}, body: 'Not Found' },
        'https://example.com/releases.json': { status: 200, headers: {}, body: '<html>' },
      };
      const r = await box.run(
        [
          'doctor',
          '--static',
          '--policy-url',
          POLICY_URL,
          '--releases-url',
          'https://example.com/releases.json',
          '--json',
        ],
        { process: proc }
      );
      expect(codes(r.json)).toEqual(['error POLICY_URL_UNREACHABLE', 'error RELEASES_URL_INVALID']);

      const offline = await box.run([
        'doctor',
        '--static',
        '--policy-url',
        'https://nope.example/p.json',
        '--json',
      ]);
      expect(codes(offline.json)).toEqual(['error POLICY_URL_UNREACHABLE']);
      expect(offline.json.error.findings[0].message).toMatch(/ENOTFOUND nope.example/);
    });

    it('skips the network with --offline', async () => {
      const r = await box.run([
        'doctor',
        '--static',
        '--offline',
        '--policy-url',
        POLICY_URL,
        '--json',
      ]);
      expect(r.code).toBe(0);
      expect(codes(r.json)).toEqual([]);
    });
  });

  it('uses the resolved config from npx expo config when it works', async () => {
    smokeApp({ app: { plugins: [] } });
    const proc = fresh();
    proc.exec = () => ({
      code: 0,
      // Dynamic config added the plugin; warnings can come before the JSON.
      stdout:
        'warning: something\n' +
        JSON.stringify({
          version: '3.3.0',
          plugins: ['upwell'],
          runtimeVersion: '3.3.0',
          updates: { url: 'https://u.expo.dev/x', checkAutomatically: 'NEVER' },
        }),
      stderr: '',
    });
    const r = await box.run(['doctor', '--json'], { process: proc });
    expect(codes(r.json)).toEqual(['info NO_POLICY']);
  });

  it('prints findings with fixes for people', async () => {
    box.write('package.json', { name: 'x', dependencies: { expo: '1' } });
    const r = await box.run(['doctor', '--static']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('✗ `upwell` is not a dependency\n  → npx expo install upwell');
    expect(r.stdout).toContain('1 error, 0 warnings.');
    expect(r.stderr).toBe('error: upwell doctor found 1 error\n');
  });
});
