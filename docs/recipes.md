# Recipes

## expo-updates + Play flexible updates

The default setup. OTA updates for the current runtime download in the background; new native
builds are offered through Play's flexible flow on Android and the App Store sheet on iOS.

```tsx
import { UpwellProvider } from 'upwell/react';
import { expoUpdatesAdapter } from 'upwell/expo-updates';
import { UpwellUI } from 'upwell/ui';

<UpwellProvider policy="https://cdn.example.com/upwell/policy.json" ota={expoUpdatesAdapter()}>
  <App />
  <UpwellUI />
</UpwellProvider>;
```

```jsonc
{
  "schemaVersion": 1,
  "android": {
    "latest": { "version": "3.4.0", "build": 340, "releasedAt": "2026-10-18" },
    "recommendAfterDays": 2,
    "ota": { "latestRuntimeVersion": "3.4.0", "applyMode": "nextLaunch" }
  }
}
```

With `applyMode: "nextLaunch"`, expo-updates launches the downloaded update the next time the app
cold-starts. Use `"prompt"` to show "Restart to use it" (`<RestartSnackbar />`), or `"immediate"`
to restart as soon as the download finishes (best for critical fixes; it interrupts the user).

If your app sets `updates.checkAutomatically` to `ON_LOAD`, expo-updates may already have
downloaded the update by the time Upwell checks; the download step then finishes almost at once.

## Forced update on a breaking API change

You shipped `3.0.0` with a new API and the old one goes away next week. Raise `minimum`:

```jsonc
{
  "schemaVersion": 1,
  "android": {
    "latest": { "version": "3.0.0", "build": 300 },
    "minimum": { "version": "3.0.0", "build": 300 },
    "requiredMessage": {
      "title": "Update required",
      "body": "This version can no longer place orders. Update to continue.",
      "releaseNotesUrl": "https://example.com/changelog/3.0"
    }
  },
  "ios": {
    "appStoreId": "1234567890",
    "latest": { "version": "3.0.0", "build": "1" },
    "minimum": { "version": "3.0.0", "build": "1" }
  }
}
```

Installs below `minimum` get `store.required`. On Android installed from Play this uses Play's
immediate flow (full-screen, resumed if the user leaves); everywhere else `<ForceUpdateScreen />`
blocks the app with a store button. Make sure the build is live in the store **before** raising
`minimum`: Upwell checks that Play actually offers a build at or above it, and falls back to the
store link otherwise.

To give users a grace period instead, keep `minimum` and set `requireAfterDays`:

```jsonc
"latest": { "version": "3.0.0", "build": 300, "releasedAt": "2026-10-14" },
"recommendAfterDays": 0,
"requireAfterDays": 7
```

## Staged rollout

Prompt only a share of users while you watch crash rates:

```jsonc
"latest": { "version": "3.5.0", "build": 350, "releasedAt": "2026-10-21" },
"rollout": 10
```

Buckets are a stable hash of the install id and the target build, so the same 10% keep seeing the
prompt as long as `rollout` stays at 10, and the next release reaches a different 10%. Raise the
number to widen it. `rollout` only gates recommendations: required and stranded updates reach
everyone.

On Android, also stage the release in Play Console. When Play hasn't rolled the build out to a
device yet, Upwell doesn't prompt it (the Play page would show "Open", not "Update").

## Stranded users

You changed native code, so OTA updates now target runtime `3.4.0`. Installs still on `3.3.0`
can't get them. Tell Upwell the newest runtime:

```jsonc
"latest": { "version": "3.4.0", "build": 340, "releasedAt": "2026-10-18" },
"ota": { "latestRuntimeVersion": "3.4.0", "strandedRequireAfterDays": 14 }
```

Stranded installs get `store.recommended` with `reason: "stranded"` (ignoring `rollout` and
`recommendAfterDays`, but respecting snoozes), and `store.required` once the new build is 14 days
old. Use the `reason` to explain why:

```tsx
const { decision } = useAppUpdate();
if (decision.kind === 'store.recommended' && decision.reason === 'stranded') {
  // "Your version no longer receives fixes. Please update."
}
```

## Transparent OTA with Expo

1. Publish your update and note the group id:

   ```sh
   eas update --branch production --message "Fix checkout crash on iOS 27"
   ```

2. Append an entry to `releases.json` (next to `policy.json`):

   ```json
   {
     "id": "<update group id>",
     "platforms": ["ios", "android"],
     "runtimeVersion": "3.4.0",
     "kind": "fix",
     "notes": "Fixed a crash at checkout on iOS 27.",
     "publishedAt": "2026-10-21T10:00:00Z"
   }
   ```

   Write notes for users, and be specific. Use `kind: "feature"` honestly: new functionality
   belongs in a store submission with Review Notes that describe it.

3. Pass `releases` to the provider and render `<UpwellUI />` (it includes `<UpdatedSheet />`) and
   a `<WhatsNew />` screen in your settings.

4. When you submit a new binary, describe your OTA practice in the Review Notes: that the app uses
   expo-updates, which kinds of changes ship that way, and a link to your public changelog. (A CLI
   that generates this from `releases.json` is planned after 0.1.)

This is transparency tooling, not a guarantee that App Review will accept any particular use of
OTA updates, and not legal advice.

## Policy from Firebase Remote Config (or anything else)

```ts
import remoteConfig from '@react-native-firebase/remote-config';
import type { PolicySource } from 'upwell';

const firebasePolicy: PolicySource = {
  async fetch() {
    await remoteConfig().fetchAndActivate();
    return JSON.parse(remoteConfig().getValue('upwell_policy').asString());
  },
};

<UpwellProvider policy={firebasePolicy}>…</UpwellProvider>;
```

Whatever the source returns is validated; invalid or failed fetches fall back to the last good
policy.

## Your own UI

```tsx
import { useAppUpdate } from 'upwell/react';

function UpdateGate({ children }: { children: React.ReactNode }) {
  const { decision, isRequired, startUpdate } = useAppUpdate();
  if (isRequired) return <MyBlockingScreen onUpdate={startUpdate} target={decision} />;
  return <>{children}</>;
}
```

Analytics: pass `onDecision` to the provider (`({ decision, trace }) => …`) to log what users see.
