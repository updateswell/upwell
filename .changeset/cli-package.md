---
'@upwell/cli': minor
---

First release of `@upwell/cli`, the `upwell` command: `policy validate`, `policy set latest|minimum|ota-runtime`, `releases add` (also straight from `eas update --json`), `releases list|remove|validate`, `explain` (what a device on a given build would be told, with the app's engine) and `schema`. Every command takes `--json` with a stable `{ ok, data | error }` shape and never prompts outside a terminal; writes show a diff, keep the file's formatting, need `--yes` without a terminal, and changes that affect existing installs need `--confirm`.
