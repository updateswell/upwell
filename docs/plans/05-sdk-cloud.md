# 05 · SDK cloud integration

**Goal:** pointing the SDK at Upwell Cloud is one line, the SDK gains an event stream that
analytics (plan 06) can use, and self-hosting stays exactly as it is.

## Design

### One-line setup

```tsx
import { UpwellProvider } from 'upwell/react';
import { upwellCloud } from 'upwell';

<UpwellProvider {...upwellCloud({ project: 'prj_7f3k2m9q' })} ota={expoUpdatesAdapter()}>
```

`upwellCloud({ project, env = 'production', analytics? })` returns
`{ policy, releases, analytics? }`: two `jsonUrl` sources on
`https://cdn.upwell.run/v1/{project}/{env}/…` plus, when a public key is given, an analytics
reporter. It's sugar over what already exists; anything it does, a self-hoster can do with URLs.

`env` can come from the app's own config (`__DEV__ ? 'staging' : 'production'`, an EAS build
profile env var, …). The docs show the patterns; the SDK doesn't guess.

### Event stream

Today the controller exposes `onDecision` and `onError`. Add `onEvent(event)` with typed events,
emitted by the controller (not the UI kit), so headless users get them too:

| Event            | When                                                                             | Fields (besides the common ones)                                          |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `check`          | Every completed check                                                            | decision kind and reason, policy source (fresh / cached / none), duration |
| `prompt_shown`   | A recommended/required prompt became visible (first time per target per session) | decision kind, target                                                     |
| `prompt_action`  | User chose update / later / dismiss                                              | action                                                                    |
| `store_flow`     | Store flow finished                                                              | flow, result                                                              |
| `ota_downloaded` | OTA download finished                                                            | update id                                                                 |
| `ota_applied`    | Restart into an OTA update requested                                             | update id, apply mode                                                     |
| `updated_seen`   | The "Updated" sheet was shown or `markSeen()` called                             | release id                                                                |
| `error`          | Anything passed to `onError`                                                     | context, message                                                          |

Common fields: platform, app version, build, runtime, update id, install source, SDK version,
timestamp, and the per-install random `installationId` the native module already generates.
No device identifiers, no user ids, nothing personal.

### Analytics reporter (used by plan 06)

`analytics?: AnalyticsReporter` option: `{ track(event): void; flush(): Promise<void> }`.
`upwellCloud()` provides one that batches events, keeps a small queue in the SDK's storage (so
events survive offline sessions and app kills, capped in size), and flushes on an interval and when
the app goes to the background. Sending never blocks or fails the update logic.

### Zero-hosting mode (later in this plan)

Make `policy` optional. The engine already decides without a policy (Play availability and
priority on Android, the App Store lookup on iOS: see `decide.ts`); only the `UpwellOptions` type
requires it. Without a policy there's no `minimum` and no stranded detection, which the docs must
say plainly.

## Session 1 · `upwellCloud()` and docs

- [ ] `upwellCloud()` in `src/sources/` (exported from `upwell`), tests for URL building and
      options.
- [ ] Example app: a "Cloud" preset that reads a real project on staging (behind an env var, so CI
      doesn't need the network).
- [ ] Docs: "Upwell Cloud" quick start, self-host vs cloud comparison, moving between them.
- [ ] Changeset (minor).

## Session 2 · Event stream

- [ ] Event types in `@upwell/core` (shared with the API's ingest validation in plan 06).
- [ ] `onEvent` in the controller; emit each event at the right place, with tests for each
      (simulation makes most of these easy: `createSimulation()` + actions).
- [ ] `useAppUpdate()` unchanged; document `onEvent` in the controller and React references.
- [ ] Changeset (minor).

## Session 3 · Analytics reporter

- [ ] Reporter with batching, persisted queue (cap, drop oldest), flush on background, backoff on
      failure, sampling option, `enabled` switch (and a global opt-out the app can wire to its own
      consent UI).
- [ ] Wire it into `upwellCloud({ analytics: { key: 'uw_pk_…' } })`.
- [ ] Verify on the emulator against staging: events arrive (needs plan 06 session 1).
- [ ] Docs: what is collected, how to disable it, what to declare in Google Play's Data safety form
      and Apple's App Privacy section (app interactions/diagnostics, not linked to identity, not
      used for tracking), and that analytics is off unless configured.

## Session 4 · Zero-hosting mode

- [ ] Make `policy` optional in `UpwellOptions` and the provider; trace says `policy: none`
      (already supported by `decide`).
- [ ] Tests: Play update available → flexible recommended; App Store lookup newer → recommended;
      no stranded / required decisions without a policy.
- [ ] Docs: "No policy at all" option on the installation page.

## Definition of done

- Cloud setup is one line; self-hosted setups are untouched.
- Every meaningful update event is available through `onEvent`, and the cloud reporter delivers
  them reliably without affecting update behavior.
- Apps can run with no policy for store-driven recommendations.

## Open questions

- Analytics opt-in by default (only when a public key is passed) is the proposal. Confirm.
- Does `upwellCloud` belong in `upwell` or in a separate entry point (`upwell/cloud`) to keep the
  core import surface small? It's a few lines; the root export is proposed.
