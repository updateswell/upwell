// Runs the built CLI (dist/index.js) once per command. Jest tests the sources; this catches what
// only breaks in the bundle (a dependency the bundler can't follow, a missing inlined schema).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const policy = fileURLToPath(new URL('../../../docs/examples/policy.json', import.meta.url));
const releases = fileURLToPath(new URL('../../../docs/examples/releases.json', import.meta.url));

const runs = [
  ['--version'],
  ['schema', 'policy', '--json'],
  ['policy', 'validate', '--file', policy, '--json'],
  ['releases', 'list', '--file', releases, '--json'],
  ['explain', '--platform', 'android', '--build', '330', '--file', policy, '--json'],
  // Edits with --dry-run: the example files must stay untouched.
  [
    'policy',
    'set',
    'latest',
    '--platform',
    'android',
    '--version',
    '9.0.0',
    '--build',
    '900',
    '--file',
    policy,
    '--dry-run',
    '--json',
  ],
  [
    'releases',
    'add',
    '--id',
    'bundle-test',
    '--kind',
    'fix',
    '--notes',
    'x',
    '--runtime',
    '1',
    '--file',
    releases,
    '--dry-run',
    '--json',
  ],
];

// A minimal app for doctor. --static and --offline: no `npx expo` download, no network.
const app = mkdtempSync(join(tmpdir(), 'upwell-bundle-'));
writeFileSync(
  join(app, 'package.json'),
  JSON.stringify({ dependencies: { expo: '*', upwell: '*' } })
);
writeFileSync(
  join(app, 'app.json'),
  JSON.stringify({ expo: { version: '1.0.0', plugins: ['upwell'] } })
);
runs.push(['doctor', '--static', '--offline', '--json', { cwd: app }]);

for (const entry of runs) {
  const options = typeof entry.at(-1) === 'object' ? entry.pop() : {};
  const args = entry;
  const out = execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options });
  if (args.includes('--json') && JSON.parse(out).ok !== true) {
    throw new Error(`upwell ${args.join(' ')} failed:\n${out}`);
  }
  console.log(`ok  upwell ${args.join(' ')}`);
}

rmSync(app, { recursive: true, force: true });
