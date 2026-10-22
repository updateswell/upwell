# 03 · API foundation: hosting on Cloudflare

**Goal:** a new repo, `updateswell/upwell-api`, with a Cloudflare Workers API that stores
versioned policy and releases documents per project and environment, validates every write with
`@upwell/core`, and serves the published copies from the edge. Access is by API key; there are no
user accounts yet (plan 07).

**Result for a developer:** a public URL like
`https://cdn.upwell.run/v1/prj_7f3k2m9q/production/policy.json` that they update with the CLI and
never think about caching, CORS or uptime.

## Design

### Two Workers, one repo

| Worker       | Host             | Job                                                                                   | Auth                              |
| ------------ | ---------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| `upwell-api` | `api.upwell.run` | Management (projects, documents, keys), event ingest (plan 06), stats, `openapi.json` | Secret key; public key for ingest |
| `upwell-cdn` | `cdn.upwell.run` | `GET` published documents                                                             | None (public)                     |

Separate Workers keep the hot, public read path tiny and independently deployable, and let it
have its own rate limits and caching. They share code through the repo (`src/shared/`).

### Storage

- **D1** is the source of truth: projects, environments, keys, every document version, audit log.
- **KV** holds the published copy of each document (`doc:{projectId}:{env}:{kind}` → body, ETag,
  version), written on publish. The CDN Worker only reads KV. KV is eventually consistent (changes
  can take up to ~60 s to reach every location), which matches the SDK's own 60 s check interval.

```sql
projects      (id TEXT PK, name, created_at, plan, settings_json)
environments  (project_id, name, created_at, PRIMARY KEY (project_id, name))  -- production, staging, …
api_keys      (id PK, project_id, kind: secret|public, prefix, hash, scopes, name, created_at, last_used_at, revoked_at)
documents     (project_id, env, kind: policy|releases, version INTEGER, body TEXT, sha256,
               message, created_at, created_by_key, PRIMARY KEY (project_id, env, kind, version))
published     (project_id, env, kind, version, published_at, PRIMARY KEY (project_id, env, kind))
audit_log     (id PK, project_id, at, key_id, action, details_json)
```

Keys are stored hashed (SHA-256). Only the prefix (`uw_sk_7f3k…`) is kept in clear, for display.

### Public reads (`upwell-cdn`)

```
GET https://cdn.upwell.run/v1/{projectId}/{env}/policy.json
GET https://cdn.upwell.run/v1/{projectId}/{env}/releases.json
```

- 200 with the JSON, `ETag`, `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: *`.
  304 for a matching `If-None-Match`.
- 404 when the project, environment or document doesn't exist. The SDK then falls back to its
  last-known-good copy, as it does today.
- The SDK sends `Cache-Control: no-cache` on requests; the Worker answers from KV every time, so
  freshness is bounded by KV propagation, not by a CDN cache.
- Count requests per project (usage, plan 06) with a cheap write (Analytics Engine data point),
  never a D1 write on the read path.

Project IDs are random (`prj_` + 12 base32 chars), not secret: anyone who has the app can read
the policy anyway. The docs must say documents are public.

### Management API (`upwell-api`), v1

All under `https://api.upwell.run/v1`, JSON, `Authorization: Bearer uw_sk_…`.

| Method & path                                            | What                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /projects`                                         | Create a project (bootstrap token only, see Auth). Returns the project, a `production` environment and a secret key, shown once |
| `GET /projects/{id}`                                     | Project, environments, public URLs                                                                                              |
| `POST /projects/{id}/environments`                       | Add an environment (`staging`, …)                                                                                               |
| `GET /projects/{id}/environments/{env}/{kind}`           | Current published document and version (`kind` = `policy` or `releases`)                                                        |
| `PUT /projects/{id}/environments/{env}/{kind}`           | Publish a new version. Body: `{ document, message?, baseVersion?, confirm? }`                                                   |
| `POST /projects/{id}/environments/{env}/{kind}/validate` | Validate without publishing; returns errors, warnings and a diff against the current version                                    |
| `GET /projects/{id}/environments/{env}/{kind}/versions`  | History (version, message, key, time, sha)                                                                                      |
| `GET …/{kind}/versions/{n}`                              | One version's body                                                                                                              |
| `POST …/{kind}/rollback`                                 | `{ version }`: publishes a copy of an old version as a new version                                                              |
| `POST …/releases/entries`                                | Append or replace one release entry by `id` (what CI does after `eas update`)                                                   |
| `GET/POST/DELETE /projects/{id}/keys`                    | List, create, revoke keys                                                                                                       |
| `GET /openapi.json`, `GET /health`                       | Contract and health                                                                                                             |

Rules that matter:

- **Every write is validated with `@upwell/core`** (`validatePolicy` / `validateReleases`). Errors
  → `422` with the same messages the SDK would log. Warnings are returned on success.
- **Optimistic concurrency:** `baseVersion` must match the current version, or `409`. CI jobs and
  agents racing each other can't silently overwrite each other's changes. The CLI sends it by
  default.
- **Guardrails:** a change that raises `minimum` (or adds/changes `requireAfterDays`,
  `strandedRequireAfterDays` so that more installs get blocked) returns `428 confirmation_required`
  with a plain explanation unless `confirm: true`. Plan 06 adds "this affects N% of active
  installs" to that response.
- **Errors** use one shape: `{ error: { code, message, details? } }` with stable `code` strings
  (agents branch on codes, not messages).
- **Idempotency:** `Idempotency-Key` header on `PUT`/`POST` for safe retries from CI.

### Auth before accounts

- **Secret keys** (`uw_sk_…`): project-scoped, scopes `read`, `write`, `admin` (keys). Used by
  the CLI, CI and agents.
- **Public keys** (`uw_pk_…`): ingest only (plan 06). Safe to ship in apps.
- **Bootstrap token**: a Worker secret (`BOOTSTRAP_TOKEN`) that only the owner has. During the
  private beta, projects are created with it (`upwell admin projects create`), and the secret key
  is handed to the early user. Plan 07 replaces this with sign-up.
- Rate limits (Workers Rate Limiting binding): per key for writes, per IP + public key for ingest.

### Stack (proposed)

TypeScript, Hono, `@hono/zod-openapi` (request validation and the OpenAPI document from the same
code), `@upwell/core`, Wrangler, Vitest with `@cloudflare/vitest-pool-workers` (tests run against
real D1/KV bindings in Miniflare). D1 migrations in `migrations/`.

## Session 1 · Repo and skeleton

- [ ] Create `updateswell/upwell-api` (public or private: decide; see open questions).
- [ ] Scaffold: Hono app per Worker (`src/api/`, `src/cdn/`, `src/shared/`), `wrangler.jsonc` with
      two Workers (or two config files), D1 and KV bindings, `staging` and `production` environments.
- [ ] Vitest with the Workers pool; a `/health` test that runs in CI.
- [ ] CI: lint, typecheck, test on PRs. Deploy on `main` to staging; production deploy on a tag or
      manually (`wrangler deploy --env production`). Cloudflare API token as a repo secret.
- [ ] `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`): commands, bindings, how to run locally
      (`wrangler dev`), migrations, deploy, the contract with `@upwell/core`.

## Session 2 · Data model and documents

- [ ] D1 migration for the tables above; seed script for local dev.
- [ ] Bootstrap `POST /projects` (bootstrap token), key generation and hashing, auth middleware
      with scopes.
- [ ] `GET`/`PUT` documents with `@upwell/core` validation, versions, `baseVersion` → 409,
      KV publish, audit log entries.
- [ ] Tests: invalid policy → 422 with core's messages; concurrent writes → one 409; revoked key →
      401; wrong project → 404 (don't leak existence).

## Session 3 · CDN Worker

- [ ] `GET /v1/{project}/{env}/{policy|releases}.json` from KV with ETag/304, CORS, cache headers.
- [ ] Bind `cdn.upwell.run` and `api.upwell.run` as custom domains (manual in the Cloudflare
      dashboard unless the token gets DNS edit permission).
- [ ] End-to-end check with the real SDK: the smoke app (`~/projects/upwell-smoke`) with
      `policy="https://cdn.upwell.run/v1/…/policy.json"` on the emulator; edit via `curl`, relaunch,
      see the decision change.

## Session 4 · History, rollback, guardrails, releases entries, OpenAPI

- [ ] Versions list/get, rollback, `validate` endpoint with a JSON diff.
- [ ] Guardrail rules (`428 confirmation_required`) with tests for each rule.
- [ ] `POST …/releases/entries` (upsert by id, keep entries sorted by `publishedAt`).
- [ ] Idempotency keys, rate limits, the error shape everywhere.
- [ ] `openapi.json` generated from the route definitions; check it validates
      (`npx @redocly/cli lint`).

## Session 5 · Docs

In `upwell-docs`: "Upwell Cloud" section with quick start (with the CLI from plan 04 when it
exists, `curl` until then), the API reference rendered from `openapi.json`, limits, the
public-documents note, and how to leave (export your documents and self-host).

## Definition of done

- A project can be created, its policy published, validated, versioned and rolled back through the
  API, and read from `cdn.upwell.run` by the SDK on a real device.
- Writes can't bypass `@upwell/core` validation, can't overwrite each other silently, and can't
  raise `minimum` without confirmation.
- `openapi.json` describes all of it.

## Open questions

- Public or private repo for the API? Public builds trust and matches the SDK; private keeps
  abuse-prevention details out of sight. Either works with this plan.
- Workers plan: the free plan may be enough to start; check current limits for D1, KV writes and
  Analytics Engine before launch, and decide when to move to Workers Paid.
- Should the CDN also serve old versions (`/v1/{project}/{env}/policy@{n}.json`) for debugging?
  Cheap to add; not needed for v1.
- Real-time changes (like Firebase's real-time Remote Config listener) would need a push channel
  (WebSockets/Durable Objects or silent push). Out of scope; the SDK's foreground checks are
  enough for v1.
