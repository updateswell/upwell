# Upwell (SDK repo)

Upwell is an update orchestrator for React Native and Expo: on every launch and foreground it
decides what update a user needs (OTA, flexible or required store update, stranded runtime) and
drives it end to end, from a remote `policy.json`. This repo is the npm package `upwell`: the
JavaScript SDK, the Android (Kotlin) and iOS (Swift) Expo module, the config plugin, the JSON
Schemas, and an example app.

Upwell is becoming a platform (hosted API on Cloudflare, CLI, analytics, dashboard) spread over
several repos. **Plans live in [`docs/plans/`](docs/plans/README.md)**; read its README for the
order and status before starting platform work. `PLAN.md` is the original SDK plan (v1).

## Repos

| Repo                        | What                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `updateswell/upwell` (this) | SDK, native modules, config plugin, schemas, example app                                                         |
| `updateswell/upwell-docs`   | Landing (`upwell.run`) and docs (`docs.upwell.run`). Until plan 01 is done, the site is still in `website/` here |
| `updateswell/upwell-api`    | Cloudflare Workers API (plan 03, not created yet)                                                                |
| `updateswell/upwell-cli`    | `@upwell/cli` (plan 04, not created yet)                                                                         |

## Layout

```
src/core/         pure TS: types, validate, decide/explain, versions, rollout (no RN imports; becomes @upwell/core in plan 02)
src/controller.ts UpwellController: checks, caching, OTA/store actions, simulation
src/react/        UpwellProvider, useAppUpdate
src/ui/           UI kit (prompt, restart bar, blocking screen, What's new, dev menu)
src/expo-updates/ OTA adapter for expo-updates
src/platform/     native platform bridge, storage, App Store lookup
src/simulation/   fake platform/store/OTA for simulate() and tests
src/sources/      jsonUrl, staticSource
android/          Kotlin module (Play in-app updates, install source, FakeAppUpdateManager simulation)
ios/              Swift module (App Store sheet, install info)
plugin/           config plugin (source in plugin/src, built to plugin/build)
schemas/          policy and releases JSON Schemas (also served at upwell.run/schemas/*)
example/          Expo app using the SDK from src/ (Metro maps `upwell/*` to src)
docs/             recipes, example policy files, and plans/
website/          docs site (moving to upwell-docs in plan 01)
```

## Commands

```sh
npm test             # Jest (core, controller, UI, adapters)
npm run lint         # ESLint, zero warnings allowed
npm run typecheck    # tsc for src and plugin
npm run build        # build/ and plugin/build
```

Run all four before committing. CI also compiles the Android module (with Kotlin unit tests) and
the iOS module (macOS runner); there is no Mac locally, so Swift is only checked in CI.

### Android locally

- Gradle needs JDK 21: `export JAVA_HOME=~/.local/share/mise/installs/java/temurin-21` (the
  system JDK is too new).
- Emulator: AVD `Pixel_10_Pro` (Android 17). React Native 0.88 debug builds need the local network
  permission to reach Metro: `adb shell pm grant <package> android.permission.ACCESS_LOCAL_NETWORK`.
- Example app: `cd example && npx expo run:android`. Metro's file watcher misses edits here (no
  watchman): restart with `npx expo start --clear` after changing files.
- Module-only check: `cd example/android && ./gradlew :upwell:compileDebugKotlin :upwell:testDebugUnitTest`.

### Testing on devices

- **Simulation:** the example app's dev menu (`<UpwellDevMenu />`) runs every state, including
  the real Kotlin path through Play's `FakeAppUpdateManager`.
- **Published package:** `~/projects/upwell-smoke` (not in git) is a fresh Expo app that installs
  `upwell` from npm (or a local `npm pack` tarball). It's linked to EAS project
  `@campsuni/upwell-smoke`: build with `eas build -p android --profile preview` (cloud builds are
  preferred over slow local release builds), publish OTA with
  `eas update --branch preview --environment preview` (prefix EAS commands with `EAS_NO_VCS=1`).
  Its policy is served locally (`python3 -m http.server 8090 --directory policy` +
  `adb reverse tcp:8090 tcp:8090`).
- Real Play in-app updates and iOS need store accounts and haven't been tested yet.

## Releasing

- Changesets: every change to published files needs a changeset (`npx changeset`, usually
  `patch` while on 0.x). Pushing to `main` makes the Release workflow open a
  "chore: version packages" PR; squash-merging it publishes to npm.
- Publishing uses npm trusted publishing (OIDC) from `.github/workflows/release.yml` in the
  GitHub environment `upwell-gh-ci`. No npm token. The repository variable `RELEASE_ENABLED=true`
  is the kill switch.
- New versions take a few minutes to appear on npm after the publish job succeeds.

## Conventions

- Match the surrounding code: naming, comment density (comments explain why, not what), and
  idioms. Prettier and ESLint config are in the repo.
- Core logic (`src/core`, controller decisions) is test-first: add a failing test, then the change.
- Commit messages: Conventional Commits with a scope where useful (`fix(ui): …`, `feat(core): …`,
  `ci(release): …`). Small changes go straight to `main` and are pushed; CI must stay green.
- Docs live on the site (`website/content/docs/`, later `upwell-docs`); update them with
  behavior changes. The README is the npm landing page.

## Product rules

- Never build App Review detection or behave differently for reviewers. Never market Upwell as
  "Apple compliant".
- Self-hosting must keep working: any URL or custom source for the policy, no required account.
- Design: monochrome (black, white, greys) and Geist Mono. Brand source of truth:
  `assets/brand/README.md` (moving to `BRAND.md` in `upwell-docs`).
- The policy and releases documents are public (apps download them); never put secrets in them.

## Known follow-ups

- After an OTA restart, two update checks run (one from the old JS instance during teardown).
- The debug trace sometimes logs the same decision twice in a row.
- `android/build.gradle` hardcodes `version = '0.0.1'` (the podspec reads `package.json`).
- Simulation `ota.*` scenarios report the app as 3.4.0 (340) with runtime 3.3.0.
