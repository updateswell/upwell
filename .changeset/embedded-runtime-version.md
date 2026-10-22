---
'upwell': patch
---

Read the runtime version embedded in the binary (AndroidManifest / Expo.plist) when the OTA adapter reports none. Development builds using a `runtimeVersion` policy (`appVersion`, `fingerprint`, …) previously had no runtime, so stranded detection was skipped.
