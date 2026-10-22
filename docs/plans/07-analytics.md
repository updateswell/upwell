# 07 · Analytics

**Goal:** the platform answers the questions an app team actually has about updates, from events
the SDK sends (plan 06). Ingest and stats live in `platform/apps/api`; the event types in
`@upwell/core`; the reporter in `upwell`; `upwell stats` in `@upwell/cli`:

- How many active installs are on each build and runtime? How many are stranded?
- How fast is the new store version / OTA update being adopted?
- How do prompts convert (shown → update, later, dismissed)? Do required updates complete?
- What happens if I raise `minimum` to X? (the guardrail estimate)
- Are there errors (policy fetch failures, store flow failures) and on which builds?

## Design

### Ingest

`POST https://api.upwell.run/v1/events` with a public key (`uw_pk_…`, project-scoped) and a
batch `{ events: [...] }` (max ~100 events / 64 KB). Validated against the event types in
`@upwell/core`; unknown fields dropped; responds `202` fast. Rate limited per key and IP.

### Storage: Workers Analytics Engine

Each event is one data point written with `writeDataPoint` (no D1 writes on the ingest path):

- **index**: project id (sampling key)
- **blobs**: env, event type, platform, app version, build, runtime, update id, decision kind,
  reason, action/result, install source, SDK version
- **doubles**: 1 (count), duration, and a numeric install bucket (hash of `installationId`) for
  approximate unique-install counts

Queries go through the Analytics Engine SQL API from the API Worker (account token as a secret).
Analytics Engine samples at high volume and keeps data for a limited time (check current limits);
both are fine for aggregate update metrics. If exact long-term numbers are needed later, add a
daily rollup job (Cron Trigger) that writes aggregates to D1.

### Stats API

| Endpoint                                                   | Returns                                                |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| `GET /v1/projects/{id}/stats/installs?env&platform&days=7` | Active installs by build, by runtime, stranded share   |
| `GET …/stats/adoption?build=340` or `?updateId=…`          | Adoption over time for a store build or OTA update     |
| `GET …/stats/prompts?days=30`                              | Shown / accepted / later / dismissed, by decision kind |
| `GET …/stats/errors?days=7`                                | Error counts by context and build                      |
| `GET …/stats/impact?minimumBuild=340&platform=android`     | Share of active installs a minimum would block         |

The impact query plugs into the guardrail from plan 04: the `428 confirmation_required` response
includes "affects ~12% of active Android installs (last 7 days)".

### CLI

`upwell stats installs|adoption|prompts|errors [--json]` and the impact number shown before
`policy set minimum` / `push`.

## Session 1 · Ingest

- [ ] Event schema in `@upwell/core` (from plan 06), public keys, `POST /v1/events`, Analytics
      Engine binding, rate limits, tests.
- [ ] Usage counting: per-project event and CDN request counts (also data points) for future
      limits and billing.
- [ ] End to end: SDK reporter (plan 06 session 3) on the emulator → events visible with a raw SQL
      query.

## Session 2 · Stats endpoints and guardrail impact

- [ ] The five stats endpoints with SQL behind them, documented in OpenAPI.
- [ ] Impact estimate added to `confirmation_required` responses.
- [ ] Tests with seeded data points (or a query-layer abstraction that's testable without
      Analytics Engine).

## Session 3 · CLI and docs

- [ ] `upwell stats …` commands, impact shown in `policy set minimum` and `push`.
- [ ] Docs: metrics glossary (what "active install" means, sampling, retention), privacy page.

## Definition of done

- Events from real apps arrive and are queryable within a minute.
- A developer can see install distribution, adoption and prompt conversion from the CLI.
- Raising `minimum` shows its impact before it's confirmed.

## Open questions

- Retention and sampling limits of Analytics Engine at the time of building; whether a D1 rollup
  is needed from the start.
- Unique-install counting method (approximate via hashed buckets vs exact via a daily rollup).
- Privacy policy and terms must exist before collecting events from apps that aren't ours.
