---
'@upwell/core': minor
'upwell': minor
---

New package: `@upwell/core`, the policy and releases types, validators, decision engine
(`decide`, `explain`), version comparison and rollout bucketing, with no dependencies. It runs in
React Native, Node, browsers and Cloudflare Workers, so servers, scripts and CI can validate a
policy or explain a decision without installing React Native.

`upwell` now depends on `@upwell/core` and re-exports everything from it, so nothing changes for
apps: the same imports keep working, including `upwell/schemas/*`. The JSON Schemas also ship as
`@upwell/core/schemas/*`. Both packages are released together with the same version.
