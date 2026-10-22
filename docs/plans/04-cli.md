# 04 · CLI for developers and agents

**Goal:** a new repo, `updateswell/upwell-cli`, publishing `@upwell/cli` with an `upwell`
command. It is the main interface to the platform until the dashboard exists, and it's designed
to be driven by AI agents and CI as much as by people.

**What it replaces:** the four manual steps in today's release checklist (docs: Policy → Hosting):
editing `latest` after a store release, `ota.latestRuntimeVersion` after the first OTA for a new
runtime, adding `releases.json` entries after `eas update`, and raising `minimum`. In the smoke
test on 2026-10-22, adding a release entry meant copying a group id out of `eas update --json` by
hand; that should be one command.

## Principles

- **Works without an account.** Every command that edits or checks a document also works on a
  local file (`--file policy.json`): validate, explain, set, diff. Self-hosters get the tooling
  for free; `push`/`pull` need a project.
- **Agent-first output.** `--json` on every command, with a stable shape: `{ ok, data }` or
  `{ ok: false, error: { code, message } }`. Non-interactive automatically when stdin isn't a TTY
  or `CI` is set; never prompts in that mode, fails with a code instead. Documented exit codes.
- **Safe by default.** Writes show a diff and need `--yes` when non-interactive. Guardrail
  responses from the API (`confirmation_required`) are passed through with their explanation; the
  caller must re-run with `--confirm`. `--dry-run` everywhere.
- **Explain everything.** `upwell explain` runs `@upwell/core`'s `explain()` for a hypothetical
  install, so you can see what a device on build 330 / runtime 3.3.0 would get before publishing.

## Commands (v1)

```
upwell init                         link this app: writes upwell.json, prints the SDK snippet
upwell login [--key uw_sk_…]        store a key (or use UPWELL_API_KEY)
upwell whoami                       project and key in use

upwell policy pull [--env staging]  download the published policy to ./policy.json
upwell policy push [--message …]    validate, show diff, publish (sends baseVersion)
upwell policy diff                  local file vs published
upwell policy validate [--file …]   offline validation with @upwell/core
upwell policy set latest  --platform android --version 3.4.0 --build 340 [--released-at …]
upwell policy set minimum --platform ios --version 3.2.0 --build 1
upwell policy set ota-runtime 3.4.0 [--platform …]
upwell policy history | rollback <version>

upwell releases add --id <group id> --kind fix --notes "…" [--runtime 3.3.0]
upwell releases add --from-eas-update eas-update.json [--kind …] [--notes …]
upwell releases list | remove <id>

upwell explain --platform android --build 330 --version 3.3.0 --runtime 3.3.0 [--source play]
upwell envs list | create <name>
upwell keys list | create --name ci --scopes write | revoke <id>
upwell schema policy|releases       print the JSON Schema
upwell admin projects create        bootstrap token only (private beta)
```

`set` commands work on the published document (pull → edit → push in one step, with
`baseVersion`) or on `--file`. `--from-eas-update` reads the output of
`eas update --json` (array of per-platform updates with `group`, `runtimeVersion`, `platform`),
which is exactly what the smoke test needed.

### `upwell.json` (in the app repo)

```json
{
  "$schema": "https://upwell.run/schemas/cli.schema.json",
  "project": "prj_7f3k2m9q",
  "env": "production"
}
```

Committed to the app repo; contains no secrets. Keys come from `upwell login`
(`~/.config/upwell/credentials.json`, per project) or `UPWELL_API_KEY` in CI.

## Stack (proposed)

Node ≥ 20, TypeScript, `commander`, `@upwell/core`, an API client generated from
`https://api.upwell.run/openapi.json` (`openapi-typescript` + `openapi-fetch`), bundled with
`tsdown` into one file so `npx @upwell/cli` starts fast. Tests with Vitest against a mocked API
(MSW) plus a few end-to-end tests against the staging API.

## Session 1 · Repo, offline commands

- [ ] Create `updateswell/upwell-cli`; scaffold, build, `bin: { upwell }`, CI, Changesets with npm
      trusted publishing (bootstrap the package by hand first, as in plan 02).
- [ ] The output layer: human vs `--json`, error codes, exit codes, TTY detection.
- [ ] Offline commands: `policy validate`, `policy set … --file`, `releases add … --file`,
      `explain`, `schema`. These need no API and are useful to self-hosters on day one.
- [ ] `AGENTS.md` + `CLAUDE.md`: commands, output contract, how to add a command, release.

## Session 2 · Cloud commands

- [ ] Generated API client; `login`, `whoami`, `init` (creates nothing server-side in v1: links
      to an existing project; prints the SDK snippet from plan 05).
- [ ] `policy pull | push | diff | history | rollback`, `set` against the API with `baseVersion`
      and the guardrail flow.
- [ ] `releases add | list | remove` against the API, including `--from-eas-update`.
- [ ] `envs`, `keys`, `admin projects create`.

## Session 3 · Automation recipes

- [ ] Docs page "Automate your policy" (in `upwell-docs`) with tested recipes: - after `eas update`: `eas update --json … > out.json && upwell releases add --from-eas-update out.json` - after a store release goes live: `upwell policy set latest …` in the release job - a GitHub Actions example with `UPWELL_API_KEY` - EAS Build hooks (`eas-build-on-success`) where they fit
- [ ] An "agents" docs section: the command list, `--json` contract, error codes, and a ready-made
      `AGENTS.md` snippet app developers can paste into their own repos.

## Later (not v1)

- `upwell mcp`: an MCP server over the same commands (tools like `get_policy`, `set_latest`,
  `explain`, `add_release`) for agents that prefer MCP to a shell.
- Store sync: read the live version from Google Play Developer API and App Store Connect API and
  propose `set latest` automatically (needs the developer's store credentials; careful scope).
- `upwell review-notes`: the App Review notes generator from the original `PLAN.md` (transparent
  OTA), built on `releases.json`.

## Definition of done

- `npx @upwell/cli` works for a self-hoster with only local files.
- A linked project can be fully managed from the CLI, from a human terminal and from CI or an
  agent with `--json`, with no prompts and stable error codes.
- The release checklist's manual steps each have a one-line command and a tested recipe.

## Open questions

- Package name: `@upwell/cli` with bin `upwell` (proposed) vs an unscoped `upwell-cli`.
- Should `upwell init` also create the project once sign-up exists (plan 07)? Probably yes, with a
  browser login (device code flow).
