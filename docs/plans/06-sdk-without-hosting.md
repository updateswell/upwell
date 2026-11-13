# 06 · SDK without hosting

**Goal:** an app gets value from Upwell with no policy at all, and adding one never means running
a server. The SDK also gains an event stream so teams can send update metrics to the analytics
they already use. All in `upwell/packages/upwell` (event types in `packages/core`).

> Rewritten 2026-11-12 for plan B (was "SDK cloud integration"). There is no Upwell Cloud:
> `upwellCloud()` and the hosted analytics reporter are dropped. Zero-policy mode moved from last
> to first. See [00 · Architecture](00-architecture.md).

## Three ways to run Upwell

| Setup                 | What the developer does                                   | What works                                                                                             |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **No policy**         | `<UpwellProvider ota={expoUpdatesAdapter()}>`             | OTA download/apply; store updates recommended when Play or the App Store has a newer version           |
| **Published policy**  | `npx @upwell/cli publish` (plan 05), pass the printed URL | Everything: `minimum` (forced updates), stranded detection, rollout, messages, `releasedAt` escalation |
| **Any URL or source** | Host the JSON anywhere, or pass a custom `PolicySource`   | Everything (self-hosting, unchanged)                                                                   |

Without a policy there's no `minimum` and no stranded detection: the store can tell the app that
a newer version exists, but not that the installed one must stop working, or which OTA runtime is
the newest. The docs must say this plainly, and `doctor` reports it.

## Design

### Zero-policy mode

`policy` becomes optional in `UpwellOptions` and on `UpwellProvider`. The engine already decides
without a policy (`decide.ts` logs `policy: none` and uses Play availability, `updatePriority`
and staleness on Android, the App Store lookup on iOS). The controller skips the fetch and the
last-known-good cache when no source is given; `policyError` stays `null` (no policy is a choice,
not an error).

Store-only recommendations without a policy:

- **Android (installed from Play):** Play reports an update → `store.recommended` with the
  flexible flow once `recommendAfterDays` (default 0) has passed; `updatePriority` ≥ 4 still
  recommends right away (as today).
- **iOS:** the App Store lookup by bundle id reports a newer version → recommended, with the App
  Store sheet (the lookup's `trackId` is the App Store id) and staleness from its release date.
- **Elsewhere** (sideloaded Android, TestFlight): no store information, so `upToDate` unless an OTA
  update exists.

### Event stream

Today the controller exposes `onDecision` and `onError`. Add `onEvent(event)` with typed events,
emitted by the controller (not the UI kit), so headless users get them too. Teams forward them to
PostHog, Amplitude, Firebase Analytics, Sentry breadcrumbs, … with a few lines; Upwell sends
nothing anywhere itself.

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

## Session 1 · Zero-policy mode

- [ ] Tests first (controller): no `policy` option → no fetch, no cache read, `policyError` null,
      trace says `policy: none`; Play update available → flexible recommended; Play priority 5 →
      recommended immediately (not required); App Store lookup newer → recommended with the
      sheet; nothing known → `upToDate`; OTA still downloads and applies.
- [ ] `policy?:` in `UpwellOptions` and the provider props; controller and provider changes.
- [ ] Example app: a "No policy" preset in the dev menu or a config switch.
- [ ] Docs: installation and quick start lead with the no-policy setup, then "Add a policy" for
      forced updates and stranded detection (a table of what each setup can do); the policy
      overview page says the policy is optional.
- [ ] Changeset (minor).

## Session 2 · Event stream

- [ ] Event types in `@upwell/core`.
- [ ] `onEvent` in the controller; emit each event at the right place, with tests for each
      (simulation makes most of these easy: `createSimulation()` + actions).
- [ ] `useAppUpdate()` unchanged; document `onEvent` in the controller and React references.
- [ ] Docs recipe "Send update events to your analytics" (PostHog and Firebase Analytics
      examples), plus the dashboards worth building: installs per build, stranded share, prompt
      conversion.
- [ ] Changeset (minor).

## Session 3 · Policy from the CLI's published URL

Depends on plan 05 session 3.

- [x] Docs and the CLI's printed snippet use the published gist/repo URL directly
      (`policy="https://gist.githubusercontent.com/…/raw/policy.json"`): no new SDK API needed.
      (Done with plan 05 session 3.)
- [ ] Verify on the smoke app's release build that `text/plain` responses from GitHub parse and
      that a published change arrives within ~5 minutes.
- [ ] If the URL turns out to need special handling (headers, cache busting), add it to `jsonUrl`
      rather than a GitHub-specific source.

## Definition of done

- `<UpwellProvider ota={expoUpdatesAdapter()}>` with no policy works on device and recommends
  store updates on Android (Play) and iOS (App Store).
- Every meaningful update event is available through `onEvent`.
- The docs show the three setups and exactly what each one can do.

## Open questions

- Without a policy, should `updatePriority` 5 on Android become `required` (Play's own convention
  for "immediate")? Proposed: no, keep it a recommendation unless the policy says otherwise;
  forcing updates stays an explicit decision.
- A remote-config adapter (Firebase Remote Config and others) as a `PolicySource`: decided
  2026-11-12 to leave it out of v1.
