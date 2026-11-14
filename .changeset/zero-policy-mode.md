---
'upwell': minor
---

The `policy` option is now optional. Without a policy, Upwell still downloads and applies OTA updates and recommends store updates that Google Play or the App Store report; forced updates (`minimum`) and stranded-install detection still need a policy. A policy cached by an earlier setup is ignored when none is configured.
