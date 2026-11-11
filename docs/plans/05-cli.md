# 05 · CLI

**Goal:** `upwell/packages/cli`, published as `@upwell/cli` with an `upwell` command. It is the
control surface for everything the library decides, and it removes the hosting chore: developers,
CI and AI agents use it to set Upwell up, check the setup, change the policy and release notes,
and **publish them to a free public URL** without running a server.

> Rewritten 2026-11-12 for plan B: Upwell stays a library with tools and has no hosted backend.
> The old session 3 (commands against the platform API) is gone; `upwell publish` replaces it.
> See [00 · Architecture](00-architecture.md) for why.

It's not installed with the library: people run `npx @upwell/cli <command>` or add it as a dev
dependency (`npm i -D @upwell/cli`, then `npx upwell …`) to pin a version in CI.

## Scope

- **Local documents (session 1):** `validate`, `explain` (what would a device on build 330 /
  runtime 3.3.0 see?), `set` fields, `releases add` (including straight from `eas update --json`),
  `schema`.
- **Setup (session 2):** `init` sets Upwell up in an Expo app; `doctor` finds setup problems before
  users do.
- **Publishing (session 3):** `publish` puts `policy.json` and `releases.json` at a stable public
  URL: a GitHub gist (default) or a file in a public GitHub repo. History, diff and rollback come
  from git.
- **Automation (session 4):** recipes for EAS and GitHub Actions, and a section for agents.

**Later:** more publish targets (S3/R2 bucket, a custom command), an MCP server, store sync (read
live versions from Google Play and App Store Connect, so `latest` updates itself), App Review notes
from `releases.json` and the signed release log (transparent OTA, from `PLAN.md`), a tiny
forwarding `bin` in `upwell` so `npx upwell init` works. Adapters for remote config services
(Firebase Remote Config, …) are SDK work, decided separately (not in v1).

## Principles

- **Local first.** The source of truth is `upwell/policy.json` and `upwell/releases.json` in the
  app's repo, reviewed in pull requests like any other change. Every command that reads or edits a
  document works on those files; only `publish` touches the network.
- **No server of ours.** Published files live on infrastructure the developer already has
  (GitHub). Upwell never sits between an app and its policy.
- **Agent-first output.** `--json` on every command with a stable shape:
  `{ "ok": true, "data": … }` or `{ "ok": false, "error": { "code": "…", "message": "…" } }`.
  Non-interactive automatically when stdin isn't a TTY or `CI` is set: never prompts, fails with a
  code instead. Documented exit codes.
- **Safe by default.** Writes show a diff and need `--yes` when non-interactive. Risky changes
  (raising `minimum`, lowering `latest`, changing `ota.latestRuntimeVersion`) need `--confirm`
  with an explanation of who is affected. `--dry-run` everywhere.
- **Same engine as the app.** `validate` and `explain` use `@upwell/core`, so the CLI and the
  device always agree.

## Commands

```
# setup
upwell init                         install upwell (+ expo-updates), add the config plugin, write
                                    upwell/policy.json from the app's current version, write
                                    upwell.json, print the provider snippet
upwell doctor [--json]              check the app's setup (see below)

# documents (default files from upwell.json, or --file)
upwell policy validate [--file …]
upwell policy set latest  --platform android --version 3.4.0 --build 340 [--released-at …]
upwell policy set minimum --platform ios --version 3.2.0 --build 1
upwell policy set ota-runtime 3.4.0 [--platform …]
upwell releases add --id <update group> --kind fix --notes "…" [--runtime 3.3.0]
upwell releases add --from-eas-update eas-update.json [--kind …] [--notes …]
upwell releases list | remove <id>
upwell explain --platform android --build 330 --version 3.3.0 --runtime 3.3.0 [--source play]
upwell schema policy|releases

# publishing
upwell publish [--to gist|github] [--dry-run] [--confirm]
upwell status                       published URLs, whether they match the local files, cache age
```

`--from-eas-update` reads the output of `eas update --json` (one entry per platform with `group`,
`runtimeVersion`, `platform`). In the OTA test on 2026-10-22 that group id had to be copied into
`releases.json` by hand.

### `upwell publish`

Validates both documents with `@upwell/core`, shows a diff against what's live (fetched from the
public URL), applies the guardrails above, then uploads.

| Target           | How                                                                                                               | Public URL (stable)                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `gist` (default) | GitHub API: creates a **public** gist on first publish (files `policy.json`, `releases.json`), then updates it    | `https://gist.githubusercontent.com/<owner>/<gist id>/raw/policy.json`         |
| `github`         | GitHub Contents API: commits both files to a public repo (e.g. `acme/app-updates`, branch `main`, path `upwell/`) | `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>/policy.json` |

- **Auth:** `GITHUB_TOKEN` / `GH_TOKEN` in CI, otherwise `gh auth token` when the GitHub CLI is
  logged in. Gists need the `gist` scope; the repo target needs `contents: write`. No credentials
  of our own.
- **Why not the app repo itself:** app repos are usually private, and raw URLs of private repos
  need a token, which can't ship inside an app. The docs must say published files are public
  (they always were: any app user can read them).
- **Caching (checked 2026-11-12):** both hosts answer with `Cache-Control: max-age=300`,
  `Access-Control-Allow-Origin: *` and `Content-Type: text/plain`. A change reaches devices within
  about 5 minutes. The SDK parses the body as JSON regardless of content type. Don't use pinned
  revision URLs (they never change) and don't recommend jsDelivr for this (its cache for branch
  URLs is much longer).
- **History and rollback:** gists and repos keep every revision. `publish` records the revision
  in its output; rolling back is publishing an older local file (`git checkout <sha> -- upwell/`).
  No separate history command in v1.
- `publish` writes the target and the resulting URLs into `upwell.json` on first run, so the
  provider snippet and `doctor` know them.

### `upwell doctor`

Reads the resolved app config (`npx expo config --json`), `package.json`, `eas.json`,
`upwell.json` and the policy, and reports each finding with a fix. Several come straight from what
broke during device testing:

- `upwell` installed; config plugin in the app config.
- With `expo-updates`: `updates.url` set; a channel configured (`eas.json` build profile or
  `updates.requestHeaders`); `runtimeVersion` set. A `runtimeVersion` policy (`appVersion`,
  `fingerprint`) needs `upwell` ≥ 0.1.3 for stranded detection in debug builds.
- `checkAutomatically` other than `NEVER`: expo-updates also checks on its own (info, not an
  error).
- The policy URL: reachable, HTTPS (Android release builds block plain HTTP), valid per
  `@upwell/core`, a sensible `Cache-Control` (warn above 5 minutes). Same for `releases.json`.
  Published copy out of date with the local file: warn, suggest `upwell publish`.
- No policy configured at all: info, listing what that setup can't do (no `minimum`, no stranded
  detection; see plan 06).
- Policy vs app: `latest` older than the build being configured, `ota.latestRuntimeVersion`
  different from the app's runtime, a missing `ios.appStoreId`.

### `upwell.json` (in the app repo, committed)

```json
{
  "policy": "upwell/policy.json",
  "releases": "upwell/releases.json",
  "publish": {
    "to": "gist",
    "gist": "aa5a315d61ae9438b18d",
    "urls": {
      "policy": "https://gist.githubusercontent.com/acme/aa5a315d61ae9438b18d/raw/policy.json",
      "releases": "https://gist.githubusercontent.com/acme/aa5a315d61ae9438b18d/raw/releases.json"
    }
  }
}
```

No secrets.

## Stack (proposed)

Node ≥ 20, TypeScript, `commander`, `@upwell/core` (workspace dependency, published as a normal
dependency), bundled with `tsdown` so `npx @upwell/cli` starts fast. Plain `fetch` for the GitHub
REST API (two endpoints; no Octokit). Versioned independently of `upwell` (not in the Changesets
`fixed` group). Tests with Vitest: unit tests for commands, and MSW for GitHub.

## Session 1 · Package and local document commands

- [ ] `packages/cli` workspace package: `bin: { "upwell": "./dist/index.js" }`, build, tests, CI.
- [ ] Output layer: human vs `--json`, error codes, exit codes, TTY and `CI` detection.
- [ ] `policy validate`, `policy set … --file`, `releases add … --file` (incl.
      `--from-eas-update`), `releases list/remove --file`, `explain`, `schema`.
- [ ] Publish the package: bootstrap `@upwell/cli` by hand once, then trusted publishing (as in
      plan 02).
- [ ] Docs page "CLI" in `apps/docs`, generated from the command definitions where practical.

## Session 2 · `init` and `doctor`

- [ ] `doctor` with the checks above; each finding has a code, a severity and a fix. Test against
      fixture app configs (including the smoke app's config before and after its fixes).
- [ ] `init`: detect an Expo app, run `npx expo install upwell` (and optionally `expo-updates`),
      add the plugin to the app config when it's static JSON (print instructions for
      `app.config.ts`), write `upwell/policy.json` with `latest` and `minimum` set to the
      current version and `upwell.json`, print the provider snippet. Offers to run `publish` at
      the end. Don't edit the user's source files in v1; the snippet is enough (and agents can
      apply it).
- [ ] Try both on a fresh `create-expo-app` project.

## Session 3 · `publish` and `status`

- [ ] GitHub token discovery (`GITHUB_TOKEN`, `GH_TOKEN`, `gh auth token`) with clear errors for
      a missing token or scope.
- [ ] `gist` target: create on first publish, update after; `github` target: commit via the
      Contents API with the file's current `sha`.
- [ ] Diff against the live copy and the guardrails (`--confirm`), `--dry-run`.
- [ ] `status`: URLs, local vs published, last published revision.
- [ ] Tests with MSW for both targets; one real run against a throwaway gist.
- [ ] End to end on the smoke app: `init` → `publish` → the release build reads the gist; change
      `minimum`, `publish`, see the required update within ~5 minutes.
- [ ] Docs: rewrite "Hosting the policy" around `publish` (gist and repo), keep "any URL" as the
      self-hosting section.

## Session 4 · Automation recipes and agents

- [ ] Docs page "Automate your policy", with tested recipes:
  - after `eas update`: `eas update --json … > out.json && npx upwell releases add --from-eas-update out.json && npx upwell publish --yes`
  - after a store release goes live: `npx upwell policy set latest …` then `publish` in the
    release job
  - GitHub Actions: publish on merge to `main` when `upwell/**` changed, with `GITHUB_TOKEN`
    (repo target) or a gist-scoped token
  - EAS Build hooks (`eas-build-on-success`) where they fit
- [ ] Docs section for agents: the command list, the `--json` contract, error codes, and an
      `AGENTS.md` snippet app developers can paste into their own repos.

## Definition of done

- A fresh Expo app goes from nothing to a working Upwell setup with a published policy using only
  `npx @upwell/cli init` and `npx @upwell/cli publish`, without hosting anything.
- Every command works from a terminal, CI or an agent with `--json`, without prompts and with
  stable error codes.

## Open questions

- Should `init` edit `App.tsx` (codemod) in a later version, or keep printing a snippet?
- `@upwell/cli` (proposed) vs an unscoped name.
- GitHub rate limits on raw URLs for apps with many installs: GitHub doesn't publish a limit for
  `raw.githubusercontent.com`; the SDK checks at most once a minute per device and the files are
  CDN-cached. Watch for reports; the bucket target is the answer if it becomes a problem.
