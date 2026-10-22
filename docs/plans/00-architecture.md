# 00 · Architecture and decisions

## Product

Upwell decides, on every launch and foreground, what kind of update a React Native / Expo user
needs (OTA, flexible or required store update, stranded runtime) and drives it end to end. It's
driven by two JSON documents:

- **`policy.json`**: latest and minimum store builds per platform, the latest OTA runtime, apply
  modes, rollout, messages.
- **`releases.json`**: one entry per OTA release, for "What's new" and the "Updated" sheet.

Today developers host those files themselves. The platform's job is to make that unnecessary:

1. **Hosting (first).** `upwell push` and the files are live on Cloudflare's CDN. The SDK points
   at them with one line. No backend, no bucket, no cache headers to get right.
2. **Automation.** The CLI updates the policy from release pipelines (EAS builds, `eas update`,
   store releases), so humans don't edit JSON by hand and forget step 3 of 4.
3. **Analytics.** The SDK reports update events; the platform shows adoption, stranded installs,
   prompt conversion, and the impact of a change before you make it ("raising minimum to 340
   blocks 12% of active installs").
4. **Dashboard (last).** A UI over the same API.

Self-hosting stays first-class: the SDK keeps accepting any URL or custom source, and the CLI's
validate / explain / edit commands work on a local file without an account. The cloud is the
default, never a requirement.

## Repositories (polyrepo)

One repository per product, each with its own release cycle, CI and `AGENTS.md`. GitHub org
`updateswell`.

| Repo                | What                                                                                       | Published as                     | Deploys to                                     |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------- |
| `upwell` (this one) | React Native SDK, native modules, config plugin, example app, JSON Schemas, `@upwell/core` | npm `upwell`, `@upwell/core`     | —                                              |
| `upwell-docs`       | Landing page and docs (Fumadocs / Next.js), brand assets                                   | —                                | Vercel: `upwell.run`, `docs.upwell.run`        |
| `upwell-api`        | Cloudflare Workers API: policy hosting, keys, analytics ingest and queries                 | —                                | Cloudflare: `api.upwell.run`, `cdn.upwell.run` |
| `upwell-cli`        | `upwell` command for developers, CI and AI agents                                          | npm `@upwell/cli` (bin `upwell`) | —                                              |
| `upwell-cloud`      | Dashboard (later)                                                                          | —                                | TBD                                            |

A repository can publish more than one package when they share a release cycle and a contract
(`upwell` publishes both `upwell` and `@upwell/core`). That's the one exception to "one repo per
package", and it exists so the SDK and the server never disagree about what a valid policy is.

### Local layout

Clone the repos side by side, e.g. `~/projects/upwell/{upwell,upwell-docs,upwell-api,upwell-cli}`.
This repo currently lives at `~/projects/native`. Moving it is fine, but Claude Code keys its
per-project memory on the directory path: copy
`~/.claude/projects/-home-omm-projects-native/memory/` to the new project's memory directory
when you move it.

## System overview

```
                 developer / CI / AI agent
                           │  upwell CLI (secret key)
                           ▼
 ┌──────────────── api.upwell.run (Worker) ────────────────┐
 │  projects · keys · policy/releases versions · rollback  │
 │  validation with @upwell/core · guardrails · stats      │
 └───────┬───────────────────────────┬─────────────────────┘
         │ D1 (source of truth)      │ KV (published copies)
         │                           ▼
         │            cdn.upwell.run (Worker, edge cached)
         │                 GET /v1/{project}/{env}/policy.json
         │                           │
         │                           ▼
         │                   app with the upwell SDK
         │                           │ POST events (public key)
         ▼                           ▼
   audit log            Workers Analytics Engine ──► stats queries
```

## The contract

Everything shares one definition of the documents:

- **JSON Schemas** (`schemas/*.schema.json` in this repo): editor support and docs. Served at
  `https://upwell.run/schemas/*`.
- **`@upwell/core`** (plan 02): `validatePolicy`, `validateReleases`, `decide`, `explain` and the
  types. The API validates every write with it; the CLI validates and explains locally with it; the
  SDK re-exports it. One validator, so a policy the server accepts is a policy the SDK accepts.
- **OpenAPI spec** (plan 03): the API contract, served at `https://api.upwell.run/openapi.json`.
  The CLI's client types are generated from it, and agents can read it.

Changing the policy format means: change `@upwell/core` and the schemas in `upwell`, release, then
bump the dependency in `upwell-api` and `upwell-cli`. Keep changes additive (new optional fields)
so old SDKs keep working with new documents. `schemaVersion` only changes for breaking changes.

## Domains

All on `upwell.run` (DNS on Cloudflare).

| Host              | Serves                                       | Plan |
| ----------------- | -------------------------------------------- | ---- |
| `upwell.run`      | Landing, `/schemas/*`, `/brand/*`            | 01   |
| `docs.upwell.run` | Docs, `llms.txt`                             | 01   |
| `api.upwell.run`  | Management API, event ingest, `openapi.json` | 03   |
| `cdn.upwell.run`  | Public, cached policy and releases reads     | 03   |
| `app.upwell.run`  | Dashboard                                    | 08   |

The local Cloudflare API token (wrangler) only has `zone:read`, so adding custom domains or DNS
records is a manual step in the Cloudflare dashboard unless the token gets more permissions.

## Decisions

| Decision                                                                            | Status               | Why                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| SaaS hosting first, self-hosting stays supported                                    | Decided (2026-10-22) | Fastest way to remove hosting friction; no users yet, so the platform can be shaped now                                   |
| API before dashboard; dashboard is a layer on the API                               | Decided              | CLI and agents need the API anyway; a UI can come later without changing the core                                         |
| Polyrepo: `upwell`, `upwell-docs`, `upwell-api`, `upwell-cli`, later `upwell-cloud` | Decided              | Independent release cycles and deploys; clean context per repo for agents                                                 |
| Cloudflare for the API (Workers, D1, KV, Analytics Engine)                          | Decided              | CDN reads at the edge, cheap at low volume, one vendor; domain already on Cloudflare                                      |
| CLI in its own repo, npm `@upwell/cli`                                              | (proposed)           | Matches polyrepo; alternative is living inside `upwell-api` (shared types, one fewer repo)                                |
| `@upwell/core` published from the `upwell` repo                                     | (proposed)           | `upwell` has required peer deps (expo, react, react-native) that npm auto-installs, so the API and CLI can't depend on it |
| API keys before accounts                                                            | (proposed)           | Accounts take time; project-scoped keys unblock the CLI, CI and early users                                               |
| Hono for the Worker, Vitest with the Workers pool for tests                         | (proposed)           | De facto standard on Workers; agents know them well                                                                       |

## Open questions

- Pricing and limits: free tier size (projects, requests, events), when to charge. Not needed
  before plan 06, but the API should count usage per project from day one.
- Company/legal: terms of service and privacy policy are needed before strangers can sign up
  (plan 07), and analytics needs a data processing description for app store privacy forms.
- Repo for the example and smoke-test apps: keep `example/` in `upwell`; the smoke app
  (`~/projects/upwell-smoke`, not in git) could become `upwell-examples` later.
