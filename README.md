<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-white.svg">
    <img src="assets/brand/logo-black.svg" alt="Upwell" height="120">
  </picture>
</p>

<h1 align="center">Upwell</h1>

**Updates that rise up on their own.** One library that decides, on every launch and foreground,
what kind of update a React Native / Expo user needs, and drives it end to end:

| Situation | What Upwell does |
|---|---|
| Native build below your `minimum` | **Required** update: Play immediate flow on Android, blocking screen + App Store sheet on iOS |
| OTA update for this runtime | Downloads it silently, applies it on next launch, after a "Restart" prompt, or immediately |
| Native build too old for the latest OTA runtime (**stranded**) | Recommends a store update, then requires it after N days |
| Newer build in the store | **Flexible** update on Android (background download, "Restart to update"), App Store sheet on iOS, with snooze and frequency caps |
| Nothing to do | Stays out of the way |

Plus **transparent OTA**: every OTA release can be described to users with an in-app "What's new"
and an "Updated" sheet, from a `releases.json` you publish next to your policy.

> **Status: 0.1 (pre-release).** The API may change before 1.0.

📖 **Documentation: [upwell-docs.vercel.app](https://upwell-docs.vercel.app/docs)**

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [The policy](#the-policy)
- [How decisions are made](#how-decisions-are-made)
- [Headless API](#headless-api)
- [UI kit](#ui-kit)
- [Transparent OTA](#transparent-ota)
- [Testing and simulation](#testing-and-simulation)
- [Recipes](docs/recipes.md)
- [Full documentation](https://upwell-docs.vercel.app/docs)

## Why

Every team hand-wires an OTA tool, a Play in-app updates wrapper, an iTunes lookup, a remote
"minimum version" flag and a force-update screen. The worst failure falls between them: when an
install's **native build is older than the runtime your newest OTA updates target**, it silently
stops receiving OTA updates and is stuck on old JS with no prompt. Upwell detects that and moves
the user to the store.

## Install

```sh
npx expo install upwell
# OTA support (optional)
npx expo install expo-updates
```

Upwell is an Expo module, so it needs a [development build](https://docs.expo.dev/develop/development-builds/introduction/)
(it works in bare React Native with `expo` installed). In Expo Go there is no native module; use
[simulation](#testing-and-simulation) there.

The config plugin is optional:

```json
{
  "expo": {
    "plugins": [["upwell", { "playAppUpdateVersion": "2.1.0" }]]
  }
}
```

| Option | Default | |
|---|---|---|
| `playAppUpdateVersion` | `2.1.0` | Play Core `app-update` version |
| `storeUrlQueries` | `true` | Declares `market://` (Android) and `itms-apps` (iOS) so `Linking.canOpenURL()` works for them |

## Quick start

1. Publish a `policy.json` anywhere (a CDN, S3, GitHub Pages):

   ```json
   {
     "$schema": "https://unpkg.com/upwell/schemas/policy.schema.json",
     "schemaVersion": 1,
     "android": {
       "latest": { "version": "3.4.0", "build": 340, "releasedAt": "2026-10-18" },
       "minimum": { "version": "3.0.0", "build": 300 },
       "recommendAfterDays": 2,
       "ota": { "latestRuntimeVersion": "3.4.0", "applyMode": "nextLaunch", "strandedRequireAfterDays": 14 }
     },
     "ios": {
       "appStoreId": "1234567890",
       "latest": { "version": "3.4.0", "build": "1", "releasedAt": "2026-10-18" },
       "minimum": { "version": "3.0.0", "build": "1" },
       "ota": { "latestRuntimeVersion": "3.4.0", "applyMode": "prompt" }
     }
   }
   ```

2. Wrap your app:

   ```tsx
   import { UpwellProvider } from 'upwell/react';
   import { expoUpdatesAdapter } from 'upwell/expo-updates';
   import { UpwellUI } from 'upwell/ui';

   export default function App() {
     return (
       <UpwellProvider
         policy="https://example.com/upwell/policy.json"
         releases="https://example.com/upwell/releases.json"
         ota={expoUpdatesAdapter()}>
         <RootNavigator />
         <UpwellUI />
       </UpwellProvider>
     );
   }
   ```

That's it: Upwell checks on launch and when the app returns to the foreground, and `<UpwellUI />`
renders the prompt, progress banner, restart bar, blocking screen or "Updated" sheet the current
decision needs. Prefer your own UI? Skip `<UpwellUI />` and use [`useAppUpdate()`](#headless-api).

## The policy

All fields are optional except `schemaVersion`. The published JSON Schema
([`schemas/policy.schema.json`](schemas/policy.schema.json)) gives you autocomplete and validation
in editors; the runtime validator is stricter (for example, `minimum` above `latest` is rejected),
and its errors appear in `explain()`. Unknown keys are ignored with a warning, so newer policies
don't break older app versions.

| Field (per platform) | Meaning |
|---|---|
| `latest` | `{ version, build, releasedAt? }` of the newest store build |
| `minimum` | Installs below this must update |
| `recommendAfterDays` | Prompt once the update is this many days old (default `0`) |
| `requireAfterDays` | Escalate to required after this many days (default: never) |
| `rollout` | % of installs (0–100) that see recommendations (default `100`) |
| `ota.latestRuntimeVersion` | Runtime your newest OTA updates target; other runtimes are *stranded* |
| `ota.applyMode` | `nextLaunch` · `prompt` · `immediate` (default `nextLaunch`) |
| `ota.strandedRequireAfterDays` | Stranded installs must update after this many days |
| `message` | `{ title, body, releaseNotesUrl }` for recommended updates |
| `requiredMessage` | Same shape, for the blocking screen (default: built-in copy) |
| `storeUrl` | Overrides the store link |
| `ios.appStoreId` | Numeric App Store id, for the in-app App Store sheet |
| `ios.country` | Storefront for the App Store lookup (default: device region) |

**Comparisons use build numbers**, versions are only for display. Android compares `versionCode`.
iOS compares the version first, then `CFBundleVersion`, because many teams reset build numbers
for each version.

**Staleness** (how old an update is) comes from Play's `clientVersionStalenessDays` on Android,
and from `latest.releasedAt` (or the App Store release date) otherwise. Set `releasedAt` on iOS:
without it, `recommendAfterDays` above 0 can't be evaluated.

When the policy can't be fetched or is invalid, Upwell uses the last good copy it cached.

## How decisions are made

`decide()` is a pure function, table-tested rule by rule:

1. **Install source gate.** Play flows only run for installs from Play. Anything else (sideloaded,
   other stores, dev builds) gets a store-link prompt instead of a crash.
2. **Required** when the installed build is below `minimum`.
3. **OTA**: an update for the current runtime is downloaded and applied per `applyMode`.
4. **Stranded**: the installed runtime isn't `ota.latestRuntimeVersion` and a newer native build
   exists → recommended, then required after `strandedRequireAfterDays`.
5. **Recommended** when a newer build exists, it is at least `recommendAfterDays` old (or Play
   priority ≥ 4), the install is inside the `rollout`, and the user hasn't snoozed it.
6. **Escalation** to required after `requireAfterDays`.
7. **Frequency caps**: a dismissed recommendation sleeps for 24 h, and at most 3 prompts are shown
   per week (configurable with `engine`). Required updates ignore both.
8. **Rollout** buckets are a stable hash of the install id and the target build, so each release
   reaches a different slice of users.

Live Play download state (downloading, downloaded) always wins, so progress is never hidden.

Every decision carries a one-line `because`, and `explain()` returns the whole trace:

```
installed: android 3.3.0 (build 290), source play, runtime 3.3.0
newer: policy latest 340 > installed build 290
staleness: 5 days (Play)
→ store.required: required: build 290 < minimum 300
```

## Headless API

```tsx
import { useAppUpdate, useUpdateHistory } from 'upwell/react';

function UpdateBadge() {
  const { decision, progress, startUpdate, dismiss } = useAppUpdate();
  switch (decision.kind) {
    case 'store.recommended':
      return <Banner text={decision.message?.title} onUpdate={startUpdate} onLater={dismiss} />;
    case 'store.downloading':
      return <Progress value={progress} />;
    case 'store.required':
      return <Blocker onUpdate={startUpdate} />;
    default:
      return null;
  }
}
```

`decision.kind` is one of:

| Kind | Fields |
|---|---|
| `upToDate` | `snoozed?` when a recommendation is hidden by a snooze or cap |
| `ota.downloading` | |
| `ota.ready` | `applyMode` |
| `store.recommended` | `reason` (`newerVersion` · `highPriority` · `stranded`), `flow`, `target`, `storeUrl`, `message` |
| `store.downloading` | `progress` (0–1 or null), `bytesDownloaded`, `totalBytesToDownload`, `required` |
| `store.readyToInstall` | `target` |
| `store.required` | `reason` (`belowMinimum` · `stale` · `stranded`), `flow`, `target`, `storeUrl`, `message` (from `requiredMessage`) |
| `error` | `reason` (no policy at all and nothing else to do) |

`flow` is `playImmediate`, `playFlexible`, `appStoreSheet` or `storeLink`. `startUpdate()` runs it,
installs a downloaded flexible update, or restarts into a downloaded OTA update. A flexible update
the user postponed is installed silently the next time the app goes to the background.

Without React:

```ts
import { createUpwell, decide } from 'upwell';

const upwell = createUpwell({ policy: 'https://example.com/policy.json' });
upwell.subscribe((state) => console.log(state.decision));
await upwell.check();
```

`decide(input)` and `explain(input)` are exported too, for your own orchestration or server-side
checks. Policies can come from anywhere through a `PolicySource`
(`{ fetch(signal): Promise<Policy> }`), e.g. Firebase Remote Config; `jsonUrl()` and
`staticSource()` are built in.

## UI kit

`upwell/ui` ships themeable components with no Reanimated requirement:

| Component | Shown for |
|---|---|
| `<UpdatePrompt />` | `store.recommended` ("Update" / "Later") |
| `<DownloadProgressBanner />` | `store.downloading` |
| `<RestartSnackbar />` | `store.readyToInstall`, `ota.ready` with `applyMode: "prompt"` |
| `<ForceUpdateScreen />` | `store.required` (can't be dismissed) |
| `<UpdatedSheet />` | Once after an OTA update was applied |
| `<WhatsNew />` | OTA history for the running runtime |
| `<UpwellUI />` | All of the above, picked by the current decision |
| `<UpwellDevMenu />` | Dev tool: jump to any state, read the trace |

```tsx
<UpwellThemeProvider
  theme={{ radius: 8, fontFamily: 'Inter', strings: { update: 'Aktualisieren', later: 'Später' } }}
  light={{ colors: { primary: '#E23744' } }}
  dark={{ colors: { primary: '#FF5A65' } }}>
  …
</UpwellThemeProvider>
```

Floating components accept `bottomOffset` (add your safe-area inset or tab bar height).

## Transparent OTA

Publish a `releases.json` next to your policy
([schema](schemas/releases.schema.json)) and describe every OTA release:

```json
{
  "schemaVersion": 1,
  "releases": [
    {
      "id": "e1b2…",
      "platforms": ["ios", "android"],
      "runtimeVersion": "3.4.0",
      "kind": "fix",
      "notes": "Fixed a crash at checkout on iOS 27.",
      "publishedAt": "2026-10-21T10:00:00Z"
    }
  ]
}
```

`id` is the update id or the EAS update group id (the expo-updates adapter matches either).
`kind` is `fix`, `content` or `feature`. After an update is applied, `<UpdatedSheet />` shows its
notes once; `<WhatsNew />` and `useUpdateHistory()` list the history for the running runtime.

Apple's App Review Guidelines (2.5.19, October 2026) ban hidden or undocumented features, and
2.3.1(a) asks for specific Review Notes. Upwell's transparency features help you show what you ship
over the air. They are **transparency tooling, not a compliance guarantee**, and not legal advice.
Upwell never behaves differently for App Review, and never will.

Coming after 0.1: a CLI that generates App Store Review Notes from `releases.json`, warns on
`kind: "feature"` OTA releases, and a signed, append-only release log the device checks before
applying an OTA bundle.

## Testing and simulation

Testing in-app updates usually needs Play internal app sharing and TestFlight. With Upwell you can
step through every state in a dev build, or even in Expo Go:

```tsx
const { simulate } = useAppUpdate();
await simulate('store.downloading'); // or store.recommended, store.required, stranded, ota.ready, …
await simulate(null);                // back to the real device
```

On Android, `store.recommended` and `store.required` run against Play's `FakeAppUpdateManager`
inside the native module, so the real Kotlin code path executes (accept dialog, download progress,
`completeUpdate()`). Other scenarios, and iOS, use a JavaScript fake of the device, store and OTA
tool. Simulation keeps its own storage, so it never touches real snoozes or caches.
`<UpwellDevMenu />` puts all of this on screen.

For unit tests, pass a `platform` (e.g. `new SimulatedPlatform(…)`) and a `staticSource(policy)`
to `createUpwell()` or `<UpwellProvider>`.

## Example app

[`example/`](example) runs the whole flow against the real native module. Its policy presets are
built from the installed build and expo-updates runtime, so you can watch stranded detection,
required updates and recommendations end to end:

```sh
npm install && npm run build
cd example && npm install
npx expo run:android   # or run:ios
```

## Contributing

```sh
npm install
npm test            # engine table tests, controller, hooks, UI, plugin
npm run lint && npm run typecheck
npx changeset       # describe your change
```

## License

MIT
