---
'upwell': minor
'@upwell/core': minor
---

New `onEvent` option (on `createUpwell()` and `UpwellProvider`): typed update events for your own analytics, emitted by the controller so they work with or without the UI kit. Events: `check`, `prompt_shown`, `prompt_action`, `store_flow`, `ota_downloaded`, `ota_applied`, `updated_seen` and `error`, each with the app version, build, runtime, running update, install source, SDK version, timestamp and the random per-install `installationId`; nothing personal. A throwing handler never breaks updating (the error goes to `onError` with context `onEvent`). `@upwell/core` exports the `UpwellEvent` types, and `StoreFlowResult` now lives there (still exported from `upwell`). An `OtaAdapter`'s `download()` may return `{ updateId }`; `expoUpdatesAdapter()` does.
