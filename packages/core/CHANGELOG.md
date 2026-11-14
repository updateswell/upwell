# @upwell/core

## 0.3.0

### Minor Changes

- 17432a7: New `onEvent` option (on `createUpwell()` and `UpwellProvider`): typed update events for your own analytics, emitted by the controller so they work with or without the UI kit. Events: `check`, `prompt_shown`, `prompt_action`, `store_flow`, `ota_downloaded`, `ota_applied`, `updated_seen` and `error`, each with the app version, build, runtime, running update, install source, SDK version, timestamp and the random per-install `installationId`; nothing personal. A throwing handler never breaks updating (the error goes to `onError` with context `onEvent`). `@upwell/core` exports the `UpwellEvent` types, and `StoreFlowResult` now lives there (still exported from `upwell`). An `OtaAdapter`'s `download()` may return `{ updateId }`; `expoUpdatesAdapter()` does.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- adf55eb: New package: `@upwell/core`, the policy and releases types, validators, decision engine
  (`decide`, `explain`), version comparison and rollout bucketing, with no dependencies. It runs in
  React Native, Node, browsers and Cloudflare Workers, so servers, scripts and CI can validate a
  policy or explain a decision without installing React Native.
  
  `upwell` now depends on `@upwell/core` and re-exports everything from it, so nothing changes for
  apps: the same imports keep working, including `upwell/schemas/*`. The JSON Schemas also ship as
  `@upwell/core/schemas/*`. Both packages are released together with the same version.
