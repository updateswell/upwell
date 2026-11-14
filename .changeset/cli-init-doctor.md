---
'@upwell/cli': minor
---

`upwell init` sets Upwell up in an Expo app (installs it, adds the config plugin to `app.json`, writes a starter policy and `upwell.json`, prints the provider snippet), and `upwell doctor` checks the setup: packages, the expo-updates configuration (update URL, runtime version, channel), the local documents, the published policy as devices fetch it (HTTPS, caching, validity, out of date), and the policy against the app being built. Errors make `doctor` exit with code 1.
