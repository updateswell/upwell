# 04 · API: hosting on Cloudflare

**Goal:** `platform/apps/api`: Cloudflare Workers that store versioned policy and releases
documents per project and environment, validate every write with `@upwell/core`, and serve the
published copies from the edge. Access is by API key; there are no user accounts yet (plan 08).

**Result for a developer:** a public URL like
`https://cdn.upwell.run/v1/prj_7f3k2m9q/production/policy.json` that they update with the CLI,
without thinking about caching, CORS or uptime.

## Design

### Two Workers, one app

| Worker       | Host             | Job                                                                                   | Auth                            |
| ------------ | ---------------- | ------------------------------------------------------------------------------------- | ------------------------------- |
| `upwell-api` | `api.upwell.run` | Management (projects, documents, keys), event ingest (plan 07), stats, `openapi.json` | Secret key; public key (ingest) |
| `upwell-cdn` | `cdn.upwell.run` | `GET` published documents                                                             | None (public)                   |

Separate Workers keep the hot public read path tiny, independently deployable and separately
rate-limited. Shared code lives in `apps/api/src/shared/` (or a `packages/` entry if the
dashboard needs it too).

### Storage

- **D1** is the source of truth: projects, environments, keys, every document version, audit log.
- **KV** holds the published copy of each document (`doc:{projectId}:{env}:{kind}` → body, ETag,
  version), written on publish. The CDN Worker only reads KV. KV is eventually consistent (changes
  can take up to ~60 s to reach every location), which matches the SDK's own 60 s minimum between
  foreground checks.

```sql
projects      (id TEXT PK, name, created_at, plan, settings_json)
environments  (project_id, name, created_at, PRIMARY KEY (project_id, name))  -- production, staging, …
api_keys      (id PK, project_id, kind: secret|public, prefix, hash, scopes, name, created_at, last_used_at, revoked_at)
documents     (project_id, env, kind: policy|releases, version INTEGER, body TEXT, sha256,
               message, created_at, created_by_key, PRIMARY KEY (project_id, env, kind, version))
published     (project_id, env, kind, version, published_at, PRIMARY KEY (project_id, env, kind))
audit_log     (id PK, project_id, at, key_id, action, details_json)
```

Keys are stored hashed (SHA-256); only the prefix (`uw_sk_7f3k…`) is kept in clear, for display.

### Public reads (`upwell-cdn`)

```
GET https://cdn.upwell.run/v1/{projectId}/{env}/policy.json
GET https://cdn.upwell.run/v1/{projectId}/{env}/releases.json
```

- 200 with the JSON, `ETag`, `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: *`;
  304 for a matching `If-None-Match`.
- 404 when the project, environment or document doesn't exist. The SDK then falls back to its
  last-known-good copy, as it does today.
- The SDK sends `Cache-Control: no-cache`; the Worker answers from KV every time, so freshness is
  bounded by KV propagation, not a CDN cache.
- Count requests per project for usage (an Analytics Engine data point), never a D1 write on the
  read path.

Project IDs are random (`prj_` + 12 base32 characters), not secret: anyone with the app can read
the policy anyway. The docs must say documents are public.

### Management API (`upwell-api`), v1

All under `https://api.upwell.run/v1`, JSON, `Authorization: Bearer uw_sk_…`.

| Method & path                                  | What                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /projects`                               | Create a project (bootstrap token only, see Auth). Returns the project, a `production` environment and a secret key, shown once |
| `GET /projects/{id}`                           | Project, environments, public URLs                                                                                              |
| `POST /projects/{id}/environments`             | Add an environment (`staging`, …)                                                                                               |
| `GET /projects/{id}/environments/{env}/{kind}` | Current published document and version (`kind` = `policy` or `releases`)                                                        |
| `PUT /projects/{id}/environments/{env}/{kind}` | Publish a new version. Body: `{ document, message?, baseVersion?, confirm? }`                                                   |
| `POST …/{kind}/validate`                       | Validate without publishing; errors, warnings and a diff against the current version                                            |
| `GET …/{kind}/versions`, `GET …/versions/{n}`  | History and one version's body                                                                                                  |
| `POST …/{kind}/rollback`                       | `{ version }`: publishes a copy of an old version as a new version                                                              |
| `POST …/releases/entries`                      | Add or replace one release entry by `id` (what CI does after `eas update`)                                                      |
| `GET/POST/DELETE /projects/{id}/keys`          | List, create, revoke keys                                                                                                       |
| `GET /openapi.json`, `GET /health`             | Contract and health                                                                                                             |

Rules that matter:

- **Every write is validated with `@upwell/core`.** Errors → `422` with the same messages the SDK
  would log; warnings are returned on success.
- **Optimistic concurrency:** `baseVersion` must match the current version or the write gets
  `409`, so CI jobs and agents can't silently overwrite each other. The CLI always sends it.
- **Guardrails:** a change that blocks more installs (raising `minimum`, setting or shortening
  `requireAfterDays` / `strandedRequireAfterDays`) returns `428 confirmation_required` with a
  plain explanation unless `confirm: true`. Plan 07 adds "affects N% of active installs".
- **One error shape:** `{ error: { code, message, details? } }` with stable `code` strings; agents
  branch on codes, not messages.
- **Idempotency:** `Idempotency-Key` header on writes, for safe retries from CI.

### Auth before accounts

- **Secret keys** (`uw_sk_…`): project-scoped, scopes `read`, `write`, `admin`. Used by the CLI,
  CI and agents.
- **Public keys** (`uw_pk_…`): ingest only (plan 07). Safe to ship in apps.
- **Bootstrap token:** a Worker secret only the owner has. During the private beta, projects are
  created with it (`upwell admin projects create`) and the secret key is handed to the early user.
  Plan 08 replaces this with sign-up.
- Rate limits (Workers Rate Limiting binding): per key for writes, per IP + public key for ingest.

### Stack (proposed)

TypeScript, Hono, `@hono/zod-openapi` (request validation and the OpenAPI document from the same
definitions), `@upwell/core` from npm (pinned; bumped when `upwell` releases), Wrangler, Vitest
with `@cloudflare/vitest-pool-workers` (tests against real D1/KV bindings in Miniflare), D1
migrations in `apps/api/migrations/`.

## Session 1 · Skeleton

- [ ] `apps/api` in `platform`: Hono app per Worker (`src/api/`, `src/cdn/`, `src/shared/`),
      Wrangler config for both Workers with D1 and KV bindings and `staging` / `production`
      environments.
- [ ] Vitest with the Workers pool; a `/health` test in CI.
- [ ] CI: lint, typecheck, test on PRs touching `apps/api`. Deploy to staging on `main`; production
      on a tag or manually (`wrangler deploy --env production`). Cloudflare API token as a secret.
- [ ] `apps/api/AGENTS.md`: commands, bindings, local dev (`wrangler dev`), migrations, deploys,
      the `@upwell/core` contract and how to bump it.

## Session 2 · Data model and documents

- [ ] D1 migration for the tables above; a local seed script.
- [ ] Bootstrap `POST /projects`, key generation and hashing, auth middleware with scopes.
- [ ] `GET`/`PUT` documents with `@upwell/core` validation, versions, `baseVersion` → 409, KV
      publish, audit log.
- [ ] Tests: invalid policy → 422 with core's messages; concurrent writes → one 409; revoked key →
      401; another project's id → 404 (don't leak existence).

## Session 3 · CDN Worker and domains

- [ ] `GET /v1/{project}/{env}/{policy|releases}.json` from KV with ETag/304, CORS, cache
      headers.
- [ ] Custom domains `api.upwell.run` and `cdn.upwell.run` (manual in the Cloudflare dashboard
      unless the token gets DNS edit permission).
- [ ] End-to-end with the real SDK: the smoke app (`~/projects/upwell-smoke`) with
      `policy="https://cdn.upwell.run/v1/…/policy.json"` on the emulator; edit with `curl`,
      relaunch, see the decision change.

## Session 4 · History, rollback, guardrails, release entries, OpenAPI

- [ ] Versions list/get, rollback, the `validate` endpoint with a JSON diff.
- [ ] Guardrail rules (`428 confirmation_required`), one test per rule.
- [ ] `POST …/releases/entries` (upsert by id, entries kept sorted by `publishedAt`).
- [ ] Idempotency keys, rate limits, the error shape everywhere.
- [ ] `openapi.json` generated from the routes; lint it (`npx @redocly/cli lint`).

## Session 5 · Docs

In `upwell/apps/docs`: an "Upwell Cloud" section: quick start (with the CLI's cloud commands from
plan 05, `curl` until they exist), the API reference rendered from `openapi.json`, limits, the
"documents are public" note, and how to leave (export documents, self-host).

## Definition of done

- A project's policy can be created, published, validated, versioned and rolled back through the
  API, and read from `cdn.upwell.run` by the SDK on a real device.
- Writes can't bypass `@upwell/core` validation, can't overwrite each other silently, and can't
  block more installs without confirmation.
- `openapi.json` describes all of it.

## Open questions

- Workers plan: check current free-tier limits for D1, KV writes and Analytics Engine before
  launch, and decide when to move to Workers Paid.
- Serve old versions on the CDN (`/v1/{project}/{env}/policy@{n}.json`) for debugging? Cheap;
  not needed for v1.
- Real-time changes (like Firebase's real-time Remote Config listener) would need a push channel
  (Durable Objects/WebSockets or silent push). Out of scope; foreground checks are enough for v1.
