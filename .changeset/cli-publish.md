---
'@upwell/cli': minor
---

`upwell publish` puts `policy.json` and `releases.json` at a stable public URL without hosting anything: a public GitHub gist (default) or a file in a public repo (`--repo`). It shows the diff against what's live, needs `--confirm` for changes that affect existing installs, and records the target and URLs in `upwell.json`. `upwell status` shows whether the published copy matches the local files and whether the raw URL already serves it. Auth comes from `GITHUB_TOKEN` / `GH_TOKEN` or the GitHub CLI.
