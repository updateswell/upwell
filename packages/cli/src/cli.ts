import { Argument, Command, CommanderError, Option } from 'commander';

import { version } from '../package.json';
import { doctor } from './commands/doctor';
import { explain, type ExplainOptions } from './commands/explain';
import { init } from './commands/init';
import { policySetOtaRuntime, policySetRef, policyValidate } from './commands/policy';
import { publish, status } from './commands/publish';
import { releasesAdd, releasesList, releasesRemove, releasesValidate } from './commands/releases';
import { schema } from './commands/schema';
import { Context, type GlobalOptions, type Io } from './context';
import { CliError, EXIT } from './errors';

const HELP_FOOTER = `
Every command takes --json and then prints only { "ok": true, "data": … } or
{ "ok": false, "error": { "code": "…", "message": "…" } } on stdout.

Without a terminal, with CI set or with --json, nothing prompts: writes need --yes, and changes
that affect existing installs need --confirm.

Exit codes: 0 ok · 1 failed (doctor: errors found) · 2 usage · 3 confirmation required
Docs: https://docs.upwell.run/docs/reference/cli`;

/** Runs one command line. Returns the exit code instead of exiting, so tests can call it. */
export async function run(argv: string[], io: Io): Promise<number> {
  let exitCode: number = EXIT.ok;
  const wantsJson = argv.includes('--json');

  const program = new Command('upwell')
    .description('Validate, edit and explain Upwell policy.json and releases.json')
    .version(version, '-v, --version', 'print the CLI version')
    .helpOption('-h, --help', 'show help')
    .helpCommand(false)
    // Program options only before the subcommand, so `--version 3.4.0` reaches `policy set`.
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.stdout(s),
      writeErr: (s) => io.stderr(s),
      outputError: (s, write) => {
        if (!wantsJson) write(s);
      },
    })
    .addHelpText('after', HELP_FOOTER);

  const runCommand = async (options: GlobalOptions, fn: (ctx: Context) => Promise<void>) => {
    const ctx = new Context(io, options);
    try {
      await fn(ctx);
    } catch (e) {
      const error =
        e instanceof CliError
          ? e
          : new CliError('INTERNAL', e instanceof Error ? e.message : String(e));
      ctx.fail(error);
      exitCode = error.exitCode;
    }
  };

  // ── setup ─────────────────────────────────────────────────────────────────
  withJson(program.command('init'))
    .description('set Upwell up in this Expo app: install it, add the plugin, write a policy')
    .option('-y, --yes', 'make the changes without asking')
    .option('--dry-run', 'show what would change, change nothing')
    .option('--with-expo-updates', 'also install expo-updates, for OTA updates')
    .option('--skip-install', "don't run npx expo install")
    .option('--static', 'read app.json directly instead of running npx expo config')
    .action((opts) => runCommand(opts, (ctx) => init(ctx, opts)));

  withJson(program.command('doctor'))
    .description('find setup problems before your users do')
    .option('--policy-url <url>', 'the policy URL the app uses (default: from upwell.json)')
    .option('--releases-url <url>', 'the releases URL the app uses (default: from upwell.json)')
    .option('--offline', "don't fetch the published documents")
    .option('--static', 'read app.json directly instead of running npx expo config')
    .option('--file <path>', 'local policy file')
    .option('--releases-file <path>', 'local releases file')
    .action((opts) => runCommand(opts, (ctx) => doctor(ctx, opts)));

  // ── publishing ────────────────────────────────────────────────────────────
  withWrite(withJson(program.command('publish')))
    .description('put policy.json and releases.json at a public URL (a GitHub gist or repo)')
    .addOption(
      new Option('--to <target>', 'gist (default) or github (a public repo)').choices([
        'gist',
        'github',
      ])
    )
    .option('--repo <owner/name>', 'public repo for --to github')
    .option('--branch <branch>', "repo branch (default: the repo's default branch)")
    .option('--path <dir>', 'directory in the repo (default: upwell)')
    .option('--file <path>', 'policy file')
    .option('--releases-file <path>', 'releases file')
    .action((opts) => runCommand(opts, (ctx) => publish(ctx, opts)));

  withJson(program.command('status'))
    .description('where the documents are published, and whether that matches the local files')
    .option('--file <path>', 'policy file')
    .option('--releases-file <path>', 'releases file')
    .action((opts) => runCommand(opts, (ctx) => status(ctx, opts)));

  // ── policy ────────────────────────────────────────────────────────────────
  const policy = program
    .command('policy')
    .description('validate and edit policy.json')
    .helpCommand(false);

  withJson(policy.command('validate'))
    .description('check policy.json with the same validator the app uses')
    .option('--file <path>', 'policy file (default: from upwell.json, else upwell/policy.json)')
    .action((opts) => runCommand(opts, (ctx) => policyValidate(ctx, opts)));

  const set = policy
    .command('set')
    .description('change one field of policy.json')
    .helpCommand(false);
  for (const field of ['latest', 'minimum'] as const) {
    withWrite(withJson(set.command(field)))
      .description(
        field === 'latest'
          ? 'the newest version in the store'
          : 'installs below this must update (forced update)'
      )
      .addOption(platformOption().makeOptionMandatory())
      .requiredOption('--version <version>', 'display version, e.g. 3.4.0')
      .requiredOption('--build <build>', 'build number (versionCode / CFBundleVersion)')
      .option('--released-at <date>', 'ISO date it shipped to the store, or "today"')
      .option('--file <path>', 'policy file')
      .action((opts) => runCommand(opts, (ctx) => policySetRef(ctx, field, opts)));
  }
  withWrite(withJson(set.command('ota-runtime')))
    .description('the runtime version the newest OTA updates target')
    .argument('<runtime>', 'runtime version, e.g. 3.4.0')
    .addOption(platformOption().default(undefined, 'every platform in the policy'))
    .option('--file <path>', 'policy file')
    .action((runtime: string, opts) =>
      runCommand(opts, (ctx) => policySetOtaRuntime(ctx, runtime, opts))
    );

  // ── releases ──────────────────────────────────────────────────────────────
  const releases = program
    .command('releases')
    .description('add, list and remove OTA release notes in releases.json')
    .helpCommand(false);

  withJson(releases.command('validate'))
    .description('check releases.json with the same validator the app uses')
    .option('--file <path>', 'releases file')
    .action((opts) => runCommand(opts, (ctx) => releasesValidate(ctx, opts)));

  withJson(releases.command('list'))
    .description('list releases, newest first as stored')
    .option('--platform <platforms>', 'android, ios or both comma-separated')
    .option('--runtime <runtime>', 'only this runtime version')
    .option('--file <path>', 'releases file')
    .action((opts) => runCommand(opts, (ctx) => releasesList(ctx, opts)));

  withWrite(withJson(releases.command('add')))
    .description('add a release (an OTA update and what it changed)')
    .option('--id <id>', 'update group id or update id')
    .option('--kind <kind>', 'fix, content or feature')
    .option('--notes <text>', 'what changed, for users (default with EAS: the update message)')
    .option('--runtime <runtime>', "runtime version (default: the policy's OTA runtime)")
    .option('--platform <platforms>', 'android, ios or both comma-separated (default: both)')
    .option('--published-at <date>', 'ISO timestamp, "now" or "today" (default: now)')
    .option('--from-eas-update <file>', 'read id, platforms and runtime from `eas update --json`')
    .option('--file <path>', 'releases file')
    .option('--policy <path>', 'policy file to read the default runtime from')
    .action((opts) => runCommand(opts, (ctx) => releasesAdd(ctx, opts)));

  withWrite(withJson(releases.command('remove')))
    .description('remove a release by id')
    .argument('<id>', 'release id')
    .option('--file <path>', 'releases file')
    .action((id: string, opts) => runCommand(opts, (ctx) => releasesRemove(ctx, id, opts)));

  // ── explain ───────────────────────────────────────────────────────────────
  withJson(program.command('explain'))
    .description('what would a device on this build be told? Runs the app’s decision engine')
    .addOption(platformOption().makeOptionMandatory())
    .requiredOption('--build <build>', 'installed build number')
    .option('--version <version>', 'installed version (required for ios)')
    .option('--runtime <runtime>', 'installed OTA runtime version')
    .addOption(
      new Option(
        '--source <source>',
        'where the app was installed from (default: the store)'
      ).choices(['play', 'appStore', 'testFlight', 'sideload', 'unknown'])
    )
    .option('--app-id <id>', 'package name / bundle id, for store links')
    .option('--os-version <version>', 'device OS version')
    .option('--installation-id <id>', 'install id for the rollout bucket (default: upwell-cli)')
    .option('--now <date>', 'evaluate at this ISO date instead of now')
    .option('--play-version-code <code>', 'Play reports this update as available')
    .option('--play-priority <0-5>', 'Play updatePriority of that update')
    .option('--play-staleness-days <days>', 'days since Play learned about the update')
    .option('--app-store-version <version>', 'the App Store lookup returns this version')
    .option('--app-store-released-at <date>', 'release date the lookup returns')
    .addOption(
      new Option('--ota <status>', 'OTA adapter status').choices([
        'available',
        'downloading',
        'ready',
        'upToDate',
        'disabled',
        'error',
      ])
    )
    .option('--file <path>', 'policy file')
    .option('--no-policy', 'explain an app without a policy (zero-policy mode)')
    .action((opts: ExplainOptions & GlobalOptions) =>
      runCommand(opts, (ctx) => explain(ctx, opts))
    );

  // ── schema ────────────────────────────────────────────────────────────────
  withJson(program.command('schema'))
    .description('print the JSON Schema for policy.json or releases.json')
    .addArgument(new Argument('<document>').choices(['policy', 'releases']))
    .action((name: 'policy' | 'releases', opts) => runCommand(opts, (ctx) => schema(ctx, name)));

  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (e) {
    if (!(e instanceof CommanderError)) throw e;
    // --help and --version end here too, with exit code 0.
    if (e.exitCode === 0) return EXIT.ok;
    if (wantsJson) {
      const message = e.message.replace(/^error: /, '');
      io.stdout(JSON.stringify({ ok: false, error: { code: 'USAGE', message } }, null, 2) + '\n');
    }
    return EXIT.usage;
  }
  return exitCode;
}

function withJson(cmd: Command): Command {
  return cmd.option('--json', 'print only a JSON result');
}

function withWrite(cmd: Command): Command {
  return cmd
    .option('-y, --yes', 'write without asking')
    .option('--confirm', 'accept changes that affect existing installs (implies --yes)')
    .option('--dry-run', 'show the change, write nothing');
}

function platformOption(): Option {
  return new Option('--platform <platform>', 'android or ios').choices(['android', 'ios']);
}
