# @upwell/cli

## 0.1.0

### Minor Changes

- 4339149: `upwell init` sets Upwell up in an Expo app (installs it, adds the config plugin to `app.json`, writes a starter policy and `upwell.json`, prints the provider snippet), and `upwell doctor` checks the setup: packages, the expo-updates configuration (update URL, runtime version, channel), the local documents, the published policy as devices fetch it (HTTPS, caching, validity, out of date), and the policy against the app being built. Errors make `doctor` exit with code 1.
- 3b44227: First release of `@upwell/cli`, the `upwell` command: `policy validate`, `policy set latest|minimum|ota-runtime`, `releases add` (also straight from `eas update --json`), `releases list|remove|validate`, `explain` (what a device on a given build would be told, with the app's engine) and `schema`. Every command takes `--json` with a stable `{ ok, data | error }` shape and never prompts outside a terminal; writes show a diff, keep the file's formatting, need `--yes` without a terminal, and changes that affect existing installs need `--confirm`.
- 8bbae3a: `upwell publish` puts `policy.json` and `releases.json` at a stable public URL without hosting anything: a public GitHub gist (default) or a file in a public repo (`--repo`). It shows the diff against what's live, needs `--confirm` for changes that affect existing installs, and records the target and URLs in `upwell.json`. `upwell status` shows whether the published copy matches the local files and whether the raw URL already serves it. Auth comes from `GITHUB_TOKEN` / `GH_TOKEN` or the GitHub CLI.

### Patch Changes

- 5d83e7f: `policy set latest|minimum --platform ios` writes the build as a string (`"1"`), like `init` and the examples; Android builds stay numbers.
- Updated dependencies [17432a7]
  - @upwell/core@0.3.0
