# 00 · Architecture and decisions

## Product

Upwell decides, on every launch and foreground, what kind of update a React Native / Expo user
needs (OTA, flexible or required store update, stranded runtime) and drives it end to end. It's
driven by two JSON documents:

- **`policy.json`**: latest and minimum store builds per platform, the latest OTA runtime, apply
  modes, rollout, messages.
- **`releases.json`**: one entry per OTA release, for "What's new" and the "Updated" sheet.

Two layers, the second optional:

1. **The library** (`upwell`): makes the decisions inside the app. Works with no policy (store and
   OTA information only), or a policy at any URL.
2. **The CLI** (`@upwell/cli`): how developers, CI and AI agents set up, check and change what the
   library decides: validate, explain, edit, release automation, `doctor`, and `publish`, which
   puts the documents at a free public URL (a GitHub gist or public repo). No account of ours.

There is no hosted backend (plan B, decided 2026-11-12). A SaaS that only hosts a small JSON file
isn't worth running or paying for, and a full OTA hosting service would compete with EAS Update and
hot-updater on the commodity part. Upwell's value is deciding which update each user needs, so it
stays a library that works with whatever OTA tool and hosting a team already has. The `platform`
repo keeps the landing page; plans 04, 07, 08 and 09 are parked. If analytics ever come back, they
build on the SDK's event stream (plan 06).

Self-hosting is the only mode: any URL or custom source for the policy, no account needed.

## Repositories

Two public repos in the `updateswell` org. The split follows one rule: **someone adopting the
library should only see the library and the tools tightly bound to it.** Everything that is the
hosted product lives elsewhere.

### `upwell`: the library and its tools

```
packages/upwell/   the SDK: JS, Android (Kotlin) and iOS (Swift) module, config plugin   → npm `upwell`
packages/core/     types, validation, decision engine; no dependencies                   → npm `@upwell/core`
packages/cli/      the `upwell` command                                                  → npm `@upwell/cli`
apps/docs/         documentation site (Fumadocs / Next.js)                              → docs.upwell.run
example/           Expo example app (standalone install, not a workspace member)
docs/plans/        these plans
```

npm workspaces cover `packages/*` only. `apps/docs` and `example/` keep their own installs and
lockfiles: the example needs the exact React version React Native pins, the docs site needs
Next.js's, and keeping them apart avoids hoisting clashes. They read workspace files by relative
path (schemas, changelogs), which is the point of keeping them in this repo.

### `platform`: the hosted product

```
apps/landing/      marketing site                                → upwell.run
apps/api/          Cloudflare Workers: management API + CDN reads → api.upwell.run, cdn.upwell.run
apps/dashboard/    Next.js dashboard (later)                       → app.upwell.run
packages/          shared code for the apps (design tokens, UI, API client), added when needed
```

It depends on the library only through published npm packages (`@upwell/core`) and the public
contracts below, never by path.

### What users install

`npx expo install upwell` installs `upwell` and its one dependency, `@upwell/core` (the same code
that's inside `upwell` today, moved; the published tarball stays around 100 KB). The CLI is never
installed with the library; people run `npx @upwell/cli …` or add it as a dev dependency.

## System overview

```
   developer / CI / AI agent
             │  @upwell/cli: edit, validate, explain upwell/policy.json + releases.json
             │  (committed in the app repo, reviewed in PRs)
             ▼
   upwell publish ──► public gist or repo on GitHub ──► raw URL (CDN, max-age 300)
                                                            │
             any other URL or custom PolicySource ──────────┤ (optional: no policy at all)
                                                            ▼
                                             app with the upwell SDK
                                     ├─ Play / App Store: newer version?
                                     ├─ OTA adapter (expo-updates, …)
                                     └─ onEvent ──► the team's own analytics
```

## Contracts between the repos

- **JSON Schemas** (`packages/core/schemas/`): served at `https://upwell.run/schemas/*` (the
  landing forwards to the docs site's copy) for `$schema` in users' files.
- **`@upwell/core`**: `validatePolicy`, `validateReleases`, `decide`, `explain`, event types. The
  CLI validates and explains with it, the SDK depends on it. A policy the CLI accepts is a policy
  the SDK accepts.

Changing the document format: change `@upwell/core` and the schemas in `upwell`, release, then
bump `@upwell/core` in `platform`. Keep changes additive (new optional fields) so older SDKs keep
working; `schemaVersion` only changes for breaking changes.

## Domains

All on `upwell.run` (DNS on Cloudflare; the local wrangler token only has `zone:read`, so DNS and
custom-domain changes are manual in the Cloudflare dashboard unless it gets more permissions).

| Host              | Serves                            | Repo, app                  | Plan |
| ----------------- | --------------------------------- | -------------------------- | ---- |
| `upwell.run`      | Landing, `/brand/*`, `/schemas/*` | `platform`, `apps/landing` | 03   |
| `docs.upwell.run` | Docs, `llms.txt`, schemas         | `upwell`, `apps/docs`      | 01   |

## Local layout

Clone side by side, e.g. `~/projects/upwell/{upwell,platform}`. This repo currently lives at
`~/projects/native`. Moving it is fine, but Claude Code keys per-project memory on the directory
path: copy `~/.claude/projects/-home-omm-projects-native/memory/` to the new project's memory
directory when moving.

## Decisions

| Decision                                                                                        | Status                | Why                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two repos: `upwell` (library, core, CLI, docs) and `platform` (landing, API, dashboard)         | Decided 2026-10-22    | Adopters see only the library; SaaS stays separate; the core contract and the tools that depend on it change together in one repo                           |
| Both repos public                                                                               | Decided               | Visibility doesn't matter; clutter does                                                                                                                     |
| Hosted platform first, self-hosting stays supported                                             | Superseded 2026-11-12 | Removes hosting friction; no users yet, so the platform can be shaped now                                                                                   |
| No hosted backend (plan B): library + CLI, `upwell publish` to GitHub; plans 04/07/08/09 parked | Decided 2026-11-12    | Hosting a small JSON file isn't worth a SaaS; OTA hosting is a crowded commodity; the decision engine is the product                                        |
| Zero-policy mode first                                                                          | Decided 2026-11-12    | First value without writing or hosting anything; the engine already supports it                                                                             |
| No remote-config adapters (Firebase Remote Config, …) in v1                                     | Decided 2026-11-12    | Keep v1 small; revisit after `publish` ships                                                                                                                |
| API and CLI before the dashboard                                                                | Parked with plan 04   | CLI and agents need the API anyway; the dashboard is a thin layer later                                                                                     |
| `@upwell/core` as its own package                                                               | Decided               | The API and CLI need validation and `explain()` without React Native; `upwell`'s required peers (`expo`, `react`, `react-native`) are auto-installed by npm |
| CLI is a separate package, not bundled in `upwell`                                              | Decided               | Optional tool; keeps the library's install minimal                                                                                                          |
| Cloudflare (Workers, D1, KV, Analytics Engine) for the API                                      | Parked with plan 04   | Edge reads, cheap at low volume; domain already on Cloudflare                                                                                               |
| npm workspaces in `upwell`                                                                      | Decided 2026-10-22    | Already on npm; pnpm's isolated installs need extra setup with React Native                                                                                 |
| pnpm workspaces in `platform`                                                                   | Decided 2026-10-22    | No React Native there; fast and strict                                                                                                                      |
| MIT license for `platform`, like the SDK                                                        | Decided 2026-10-22    | Simplest; both repos public, nothing to protect yet                                                                                                         |
| API keys before accounts                                                                        | Parked with plan 04   | Unblocks the CLI, CI and early users                                                                                                                        |
| Hono + Vitest (Workers pool) for the API                                                        | Parked with plan 04   | Standard on Workers                                                                                                                                         |

## Open questions

- The smoke-test app (`~/projects/upwell-smoke`, not in git): keep it local, or make it a second
  example in `upwell` later.
