# 05 · CLI

**Goal:** `upwell/packages/cli`, published as `@upwell/cli` with an `upwell` command: the
control surface for everything the library decides. Developers, CI and AI agents use it to set
Upwell up, check the setup, change policies (local files or the platform), automate releases, and
later read analytics.

It's not installed with the library: people run `npx @upwell/cli <command>` or add it as a dev
dependency (`npm i -D @upwell/cli`, then `npx upwell …`) to pin a version in CI.

## Scope

**v1, no account needed (sessions 1–2):**

- `validate`, `explain` (what would a device on build 330 / runtime 3.3.0 see?), `set` fields,
  `releases add` (including straight from `eas update --json`), `schema`: all on local files.
  Useful to self-hosters.
- `init`: set Upwell up in an Expo app. `doctor`: find setup problems before users do.

**v1, with the platform (session 3, needs plan 04):** link a project, `push`/`pull`/`diff`,
history, rollback, environments, keys.

**Soon after:** release automation recipes (session 4), `stats` and impact warnings (plan 07).

**Later:** an MCP server, store sync (read live versions from Google Play and App Store
Connect), App Review notes from `releases.json` and the signed release log (transparent OTA, from
`PLAN.md`), and maybe a tiny forwarding `bin` in `upwell` so `npx upwell init` works.

## Principles

- **Local first.** Every command that reads or edits a document works on a file
  (`--file policy.json`); `push`/`pull` are the only commands that need a project.
- **Agent-first output.** `--json` on every command with a stable shape:
  `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code": "…", "message": "…" } }`.
  Non-interactive automatically when stdin isn't a TTY or `CI` is set: never prompts, fails with a
  code instead. Documented exit codes.
- **Safe by default.** Writes show a diff and need `--yes` when non-interactive. The API's
  `confirmation_required` guardrail is passed through with its explanation; re-run with
  `--confirm`. `--dry-run` everywhere.
- **Same engine as the app.** `validate` and `explain` use `@upwell/core`, so the CLI and the
  device always agree.

## Commands

```
# setup
upwell init [--cloud]               install upwell (+ expo-updates), add the config plugin, write
                                    upwell/policy.json from the app's current version, print the
                                    provider snippet; --cloud links a platform project
upwell doctor [--json]              check the app's setup (see below)

# documents (local file, or the linked project when there's no --file)
upwell policy validate [--file …]
upwell policy set latest  --platform android --version 3.4.0 --build 340 [--released-at …]
upwell policy set minimum --platform ios --version 3.2.0 --build 1
upwell policy set ota-runtime 3.4.0 [--platform …]
upwell releases add --id <update group> --kind fix --notes "…" [--runtime 3.3.0]
upwell releases add --from-eas-update eas-update.json [--kind …] [--notes …]
upwell releases list | remove <id>
upwell explain --platform android --build 330 --version 3.3.0 --runtime 3.3.0 [--source play]
upwell schema policy|releases

# platform
upwell login [--key uw_sk_…] | whoami
upwell policy pull | push [--message …] | diff | history | rollback <version>
upwell envs list | create <name>
upwell keys list | create --name ci --scopes write | revoke <id>
upwell admin projects create        bootstrap token only (private beta)
```

`--from-eas-update` reads the output of `eas update --json` (one entry per platform with `group`,
`runtimeVersion`, `platform`). In the OTA test on 2026-10-22 that group id had to be copied into
`releases.json` by hand.

### `upwell doctor`

Reads the resolved app config (`npx expo config --json`), `package.json`, `eas.json` and the
policy, and reports each finding with a fix. Several come straight from what broke during device
testing:

- `upwell` installed; config plugin in the app config.
- With `expo-updates`: `updates.url` set; a channel configured (`eas.json` build profile or
  `updates.requestHeaders`); `runtimeVersion` set. A `runtimeVersion` policy (`appVersion`,
  `fingerprint`) needs `upwell` ≥ 0.1.3 for stranded detection in debug builds.
- `checkAutomatically` other than `NEVER`: expo-updates also checks on its own (info, not an
  error).
- The policy URL: reachable, HTTPS (Android release builds block plain HTTP), valid per
  `@upwell/core`, a sensible `Cache-Control` (warn above 5 minutes), JSON content type. Same for
  `releases.json`.
- Policy vs app: `latest` older than the build being configured, `ota.latestRuntimeVersion`
  different from the app's runtime, a missing `ios.appStoreId`.

### `upwell.json` (in the app repo, committed)

```json
{ "project": "prj_7f3k2m9q", "env": "production", "policy": "upwell/policy.json" }
```

No secrets. Keys come from `upwell login` (`~/.config/upwell/credentials.json`, per project) or
`UPWELL_API_KEY` in CI.

## Stack (proposed)

Node ≥ 20, TypeScript, `commander`, `@upwell/core` (workspace dependency, published as a normal
dependency), bundled with `tsdown` so `npx @upwell/cli` starts fast. Versioned independently of
`upwell` (not in the Changesets `fixed` group). Tests with Vitest: unit tests for commands, and
MSW for the API.

The API client is generated from the platform's OpenAPI document with `openapi-typescript` +
`openapi-fetch`. Keep a copy at `packages/cli/openapi.json`, refreshed by `npm run api:sync` (from
`api.upwell.run` or staging), so builds don't depend on the network and API changes show up as
reviewable diffs.

## Session 1 · Package and local document commands

- [ ] `packages/cli` workspace package: `bin: { "upwell": "./dist/index.js" }`, build, tests, CI.
- [ ] Output layer: human vs `--json`, error codes, exit codes, TTY and `CI` detection.
- [ ] `policy validate`, `policy set … --file`, `releases add … --file` (incl.
      `--from-eas-update`), `releases list/remove --file`, `explain`, `schema`.
- [ ] Publish: bootstrap `@upwell/cli` by hand once, then trusted publishing (as in plan 02).
- [ ] Docs page "CLI" in `apps/docs`, generated from the command definitions where practical.

## Session 2 · `init` and `doctor`

- [ ] `doctor` with the checks above; each finding has a code, a severity and a fix. Test against
      fixture app configs (including the smoke app's config before and after its fixes).
- [ ] `init`: detect an Expo app, run `npx expo install upwell` (and optionally `expo-updates`),
      add the plugin to the app config when it's static JSON (print instructions for
      `app.config.ts`), write `upwell/policy.json` with `latest` and `minimum` set to the
      current version, print the provider snippet. Don't edit the user's source files in v1; the
      snippet is enough (and agents can apply it).
- [ ] Try both on a fresh `create-expo-app` project.

## Session 3 · Platform commands (needs plan 04)

- [ ] Generated API client; `login`, `whoami`, `init --cloud`.
- [ ] `policy pull | push | diff | history | rollback`, `set` against the project (pull, edit, push
      with `baseVersion` in one step), the guardrail flow.
- [ ] `releases add | list | remove` against the project.
- [ ] `envs`, `keys`, `admin projects create`.

## Session 4 · Automation recipes and agents

- [ ] Docs page "Automate your policy", with tested recipes:
  - after `eas update`: `eas update --json … > out.json && npx upwell releases add --from-eas-update out.json`
  - after a store release goes live: `npx upwell policy set latest …` in the release job
  - GitHub Actions with `UPWELL_API_KEY`
  - EAS Build hooks (`eas-build-on-success`) where they fit
- [ ] Docs section for agents: the command list, the `--json` contract, error codes, and an
      `AGENTS.md` snippet app developers can paste into their own repos.

## Definition of done

- `npx @upwell/cli` is useful to a self-hoster with only local files: validate, explain, edit,
  release entries, `doctor`.
- `init` takes a fresh Expo app to a working Upwell setup.
- A platform project can be fully managed from a terminal, CI or an agent with `--json`, without
  prompts and with stable error codes.

## Open questions

- Should `init` edit `App.tsx` (codemod) in a later version, or keep printing a snippet?
- `@upwell/cli` (proposed) vs an unscoped name.
