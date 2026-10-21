# Upwell: Update Orchestrator for React Native / Expo — Plan

> Name: **Upwell**: updates that rise up on their own. npm: `@upwell` org ✅ claimed (2026-10-21) · unscoped `upwell` still to publish (M0)
> Status: M0–M5 implemented, `upwell@0.1.0` on npm, site live at https://upwell.run, docs at https://docs.upwell.run (Fumadocs, `website/`). M6 remaining: Play internal sharing + TestFlight verification, announce · Last updated: 2026-10-21

## 1. Problem

RN apps can update in two ways: **OTA** (JS bundle via expo-updates, hot-updater, …) and **store** (new native binary via Play / App Store). Today every team hand-wires the pieces:

- an OTA tool,
- a Play in-app updates wrapper (sp-react-native-in-app-updates, expo-in-app-updates),
- an iTunes lookup for iOS,
- a remote "minimum version" flag,
- a custom force-update screen.

The worst failure: when the installed **native build is older than the latest OTA runtime**, the user stops receiving OTA updates and **is stranded on old JS forever with no prompt**. expo-updates does not detect this; Expo's own advice is "build a version-check endpoint yourself".

## 2. Goal

One library that decides, on every launch/foreground, **what kind of update this user needs** and drives it end to end:

| Situation | Action |
|---|---|
| Native below `minimum` | **Required** store update → Android immediate flow / blocking screen; iOS blocking screen + App Store sheet |
| OTA available for this runtime | Download silently, apply per policy (next launch / prompt restart / immediately) |
| Native outdated **and** stranded from latest OTA runtime | Recommend (then require after N days) a store update |
| Newer native in store, not critical | **Flexible** update on Android (background download → "Restart to update"), App Store sheet on iOS; respects snooze & frequency caps |
| Nothing | Up to date |

Plus **transparent OTA**: every OTA release is described to users (in-app "What's new") and to App Review (generated Review Notes), with an optional public, signed release log the device enforces (§8).

### Non-goals (v1)
- Hosting OTA bundles (expo-updates / hot-updater already do that).
- A hosted backend or dashboard.
- Huawei AppGallery, sideload/self-update APK installs.

## 3. Decisions taken

| Topic | Decision |
|---|---|
| Policy source | Static JSON at any URL by default, behind a `PolicySource` adapter interface (custom fetchers, Firebase Remote Config, … later) |
| Packaging | Expo Modules API + config plugin (works in bare RN with `expo` installed) |
| OTA | `OtaAdapter` interface; v1 ships the **expo-updates** adapter only |
| UI | Headless core (`useAppUpdate()`) + optional themeable UI components |
| Native | Own Play Core implementation (don't depend on expo-in-app-updates): we need download progress, `completeUpdate()` control, stalled-immediate resume, install-source detection |
| Transparency | v1: `releases.json` + user-facing OTA notes. After 0.1: CLI (Review Notes generator, `kind` guardrail), then the signed public release log. Framed as transparency tooling, **never** as an Apple compliance guarantee |

## 4. Domain model

**Installed** (read natively):
`platform`, `nativeVersion` (versionName / CFBundleShortVersionString), `buildNumber` (versionCode / CFBundleVersion), `runtimeVersion` + `otaUpdateId` (from OTA adapter), `installSource` (`play` · `appStore` · `testFlight` · `sideload` · `unknown`), `installationId` (for rollout bucketing).

**Policy** (remote JSON, cached with last-known-good):

```jsonc
{
  "schemaVersion": 1,
  "android": {
    "latest":   { "version": "3.4.0", "build": 340 },
    "minimum":  { "version": "3.0.0", "build": 300 },   // below → required
    "recommendAfterDays": 2,     // flexible prompt once update is this old
    "requireAfterDays": null,    // optional escalation to required
    "rollout": 100,              // % of installs that see store prompts
    "ota": {
      "latestRuntimeVersion": "3.4.0",
      "applyMode": "nextLaunch",       // nextLaunch | prompt | immediate
      "strandedRequireAfterDays": 14   // stranded users: recommend → require
    },
    "message": { "title": "Update available", "body": "…", "releaseNotesUrl": "…" }
  },
  "ios": { "...same shape...": true, "appStoreId": "1234567890" }
}
```

**Store info** (native):
- Android: availability, `availableVersionCode`, `updatePriority`, `clientVersionStalenessDays`, allowed types, install status/progress.
- iOS: lookup `version`, `releaseDate`, `minimumOsVersion`.

**Decision** (output, a state machine):

```
upToDate
ota.downloading → ota.ready(applyMode)
store.recommended → store.downloading(progress) → store.readyToInstall   (Android flexible)
store.required                                                          (immediate / blocking)
error(reason, lastKnownGood)
```

## 5. Decision engine rules (pure TypeScript, table-tested)

1. **Install-source gate:** Play flows only if `installSource === play`. Otherwise fall back to a store-link prompt (never crash; this was a common issue in existing libraries).
2. **Required:** `installed < policy.minimum` (compare **build numbers**, display version names; avoids the versionCode-vs-versionName confusion that keeps coming up in existing libraries).
3. **OTA:** if the adapter reports an update for the current runtime → download, then apply per `applyMode`.
4. **Stranded:** `installed.runtimeVersion !== policy.ota.latestRuntimeVersion` and a newer native exists → recommend; escalate to required after `strandedRequireAfterDays`.
5. **Recommended:** newer native exists and (`updatePriority >= 4` or staleness ≥ `recommendAfterDays`) and inside rollout bucket and not snoozed.
6. **Escalation:** staleness ≥ `requireAfterDays` → required.
7. **Frequency caps:** snooze N hours after dismiss; max prompts per period (persisted natively in SharedPreferences / UserDefaults, no extra dependency).
8. **Rollout:** deterministic hash(`installationId` + `latest.build`) → 0–99 bucket.

## 6. Architecture

Single package **`upwell`** with subpath exports for v1. Later tools go under the `@upwell` scope (e.g. `@upwell/cli`), so the runtime package stays lean.

```
upwell
├─ core            pure TS: types, policy validation (no heavy deps), version compare,
│                  rollout hash, decision engine
├─ native          Expo module
│   ├─ android     Play Core app-update 2.1.0: check, start flexible/immediate,
│   │              InstallStateUpdatedListener → progress events, completeUpdate(),
│   │              resume DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS on resume,
│   │              getFailedUpdatePreconditions, install source, KV storage
│   └─ ios         iTunes lookup (country-aware, cache-busting), SKStoreProductViewController
│                  on the top-most VC (works over RN modals), install source
│                  (App Store vs TestFlight), KV storage
├─ /react          <UpwellProvider>, useAppUpdate(), lifecycle (launch/foreground checks)
├─ /expo-updates   OtaAdapter for expo-updates (optional peer dep)
├─ /ui             RestartSnackbar, ForceUpdateScreen, DownloadProgressBanner
│                  (themeable, no reanimated requirement)
└─ plugin          config plugin (Play Core gradle dep, iOS settings)
```

Key interfaces:

```ts
interface PolicySource { fetch(signal: AbortSignal): Promise<Policy> }
interface OtaAdapter {
  getRuntime(): { runtimeVersion: string; updateId?: string }
  check(): Promise<{ available: boolean }>
  download(): Promise<void>
  apply(): Promise<void>            // reload
}
function decide(input: DecisionInput): Decision   // pure, the heart of the library
```

## 7. Developer experience (the differentiators)

(See also §8. Transparent OTA is the main positioning story.)

- **Simulation mode:** in dev builds, Android uses `FakeAppUpdateManager` and iOS uses a mocked lookup. A dev menu or `simulate('store.downloading')` steps through every state without Play internal app sharing. Testing is one of the most common complaints in sp-react-native-in-app-updates issues.
- **`explain()`**: returns why the engine decided what it did (`"required: build 290 < minimum 300"`), so debugging is quick.
- **Policy validator CLI** (`npx @upwell/cli validate policy.json`, bin name `upwell`), after 0.1 (M7). Until then, ship JSON Schema files for `policy.json` / `releases.json` (editor autocomplete and validation), and the runtime validator reports errors through `explain()`.
- **Recipes:** expo-updates + Play flexible; forced update on breaking API change; staged rollout.

## 8. Transparent OTA

### Context: Apple App Review Guidelines, 16 Oct 2026

- **2.5.2 (downloaded code) is unchanged.** OTA of interpreted JS is still allowed under DPLA §3.3.1(B) as long as the app's primary purpose doesn't change.
- **New 2.5.19:** "Don't include any hidden, dormant, or undocumented features in your app; your app's functionality should be clear to end users and App Review." Hiding features (e.g. by obfuscation) is grounds for app removal **and developer account termination**. This targets "bait-and-switch": features revealed only after approval.
- **Existing 2.3.1(a):** new features must be "described with specificity in the Notes for Review… generic descriptions will be rejected."
- **Effect on OTA:** using OTA or feature flags to switch on unreviewed features after approval is now an explicitly account-level risk. Teams want a way to show they aren't doing that.

### What we build

1. **OTA release metadata.** Every OTA release has an entry:

   ```jsonc
   // releases.json (published next to policy.json)
   {
     "schemaVersion": 1,
     "releases": [{
       "id": "2026-10-21.1",            // OTA update id / group id
       "platforms": ["ios", "android"],
       "runtimeVersion": "3.4.0",
       "kind": "fix",                    // fix | content | feature
       "notes": "Fixed checkout crash on iOS 27",
       "publishedAt": "2026-10-21T10:00:00Z",
       "bundleHash": "sha256-…"         // used by the release log (step 4)
     }]
   }
   ```

   The OTA adapter maps the running update id to its entry.

2. **User-facing notes (UI kit).** After an OTA update is applied, show an optional "Updated: …" sheet and a `<WhatsNew />` screen with the history for the current runtime. Headless: `useUpdateHistory()`.

3. **CLI (after 0.1).** Until then, `releases.json` is edited by hand and checked by its JSON Schema and the runtime validator.
   - `review-notes`: for a binary submission, generates a ready-to-paste App Store Connect Review Notes section: the app uses OTA (tool, runtime version), what kinds of changes ship that way, the OTA history since the last reviewed build, and a link to the public changelog.
   - `publish-release`: appends an entry to `releases.json` (wraps or follows `eas update`).
   - **`kind: feature` guardrail:** the CLI warns when publishing a `feature` OTA. An optional policy flag `ota.featuresRequireReview` only applies `feature` releases to native builds whose generated Review Notes declared them; otherwise the engine recommends a store update instead.

4. **Signed public release log** (after 0.1). `releases.json` becomes an append-only, signed log (each entry chains the previous entry's hash, signed with a key whose public half is embedded in the binary). Before applying an OTA bundle, the device checks that its `bundleHash` appears in a validly signed log, and **refuses unlogged bundles**.
   - For users and reviewers: anyone can audit what was shipped and when.
   - For security: a compromised OTA server can't push an undisclosed bundle. This complements expo-updates code signing, which proves who signed a bundle but not that it was publicly disclosed.

### Hard rules

- **Never** add review detection or any behavior that differs for App Review (region, account, device heuristics). That is exactly what 2.5.19 bans.
- Docs and marketing say "transparency tooling", not "Apple compliant". This is not legal advice.

## 9. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold | `create-expo-module` project, example app, CI (lint, typecheck, tests), changesets |
| M1 | Core engine | Policy + `releases.json` schemas (TS types + published JSON Schema) and runtime validation, version compare, rollout, `decide()` + `explain()` with table tests covering every rule |
| M2 | Android native | Full Play Core flows incl. progress, `completeUpdate`, stalled resume, install source; simulation mode |
| M3 | iOS native | Lookup + App Store sheet + install source; simulation mode |
| M4 | React + OTA | `UpwellProvider`, `useAppUpdate`, `useUpdateHistory`, expo-updates adapter mapping update ids to releases, **stranded detection** working end to end in the example app |
| M5 | UI kit | Snackbar, force screen, progress banner, "Updated" sheet, `<WhatsNew />`; theming |
| M6 | 0.1 release | Docs site, recipes (incl. "Transparent OTA with Expo"), real-device verification (Play internal app sharing + TestFlight), announce |
| M7 | CLI (`@upwell/cli`) | `validate`, `publish-release`, `review-notes`, `kind: feature` warnings, `featuresRequireReview` engine rule (it depends on the declarations `review-notes` records) |
| M8 | Release log | Signed, hash-chained log, key embedding via config plugin, on-device verification before applying an OTA bundle, audit page generator |

**Later:** hot-updater / revopush adapters; Firebase Remote Config adapter; CLI that sets Play `inAppUpdatePriority` on release (Play Developer API, write-once); analytics hooks (`onDecision`, `onPromptShown`, `onAccepted`); Huawei AppGallery.

## 10. Risks & open questions

- **Play reports only `availableVersionCode`**, not the version name, so the policy must carry the name for UI.
- **iTunes lookup lag** (CDN cache, minutes to hours) and region-restricted apps need `country`; treat the policy as the source of truth and use the lookup only to confirm.
- **iOS has no priority or staleness**: escalation on iOS relies on policy dates (`releasedAt` per version, to add to the schema).
- **Store guidelines:** forced-update screens are common and accepted; OTA must stay within each store's rules (expo-updates already does).
- **Overlap watch:** check EAS Update and hot-updater roadmaps before M4 in case either adds store-update awareness or release transparency.
- **Release log on device (M8):** expo-updates applies bundles natively, so blocking an unlogged bundle *before* it runs may need a hook into expo-updates' native side (or its code-signing path). Spike this early. If it isn't possible, the fallback is detect-and-roll-back on first launch.
- **`kind` is self-declared:** the guardrail only helps honest teams. It's a seatbelt, not enforcement.
- **Apple's interpretation of 2.5.19 is new and untested.** Watch for real rejections and appeals and keep the docs current.

## 11. First steps

1. Finish claiming the name: ~~create the `@upwell` npm org~~ ✅ done 2026-10-21. Still to do: create the GitHub repo, and publish a real `upwell@0.0.1` from the M0 scaffold (README, license, minimal entry point; npm discourages empty placeholders).
2. `npx create-expo-module@latest` → M0 scaffold.
3. Write `core/decide.ts` test-first from the rules in §5 (M1), including the `releases.json` schema from §8. It has no native dependencies, so it can be built and fully tested before touching Kotlin or Swift.
4. Time-boxed spike: can we veto an expo-updates bundle before it launches? (This decides the M8 design.)
