# @upwell/core

The pure logic behind [Upwell](https://upwell.run): the `policy.json` and `releases.json` types,
their validators, the decision engine, version comparison and rollout bucketing. No dependencies;
runs in React Native, Node, browsers and Cloudflare Workers.

**Building an app? Install [`upwell`](https://www.npmjs.com/package/upwell) instead.** It depends
on this package and re-exports everything in it. Use `@upwell/core` directly where React Native
isn't available: servers, scripts, CI checks and tests.

```sh
npm install @upwell/core
```

```ts
import { explain, validatePolicy } from '@upwell/core';

const result = validatePolicy(JSON.parse(text));
if (!result.ok) throw new Error(result.errors.join('\n'));

const { decision, trace } = explain({
  installed: {
    platform: 'android',
    appId: 'com.example.app',
    nativeVersion: '3.3.0',
    buildNumber: '290',
    runtimeVersion: '3.3.0',
    otaUpdateId: null,
    installSource: 'play',
    installationId: 'install-a',
  },
  policy: result.value,
  now: Date.now(),
});
// decision.kind is e.g. 'store.required' when build 290 is below android.minimum;
// trace lists every rule the engine evaluated.
```

The JSON Schemas ship in the package as `@upwell/core/schemas/policy.schema.json` and
`@upwell/core/schemas/releases.schema.json` (also served at `https://upwell.run/schemas/*`).

`@upwell/core` and `upwell` are released together with the same version number.

- [Core API reference](https://docs.upwell.run/reference/core)
- [Policy format](https://docs.upwell.run/policy)
- [Source](https://github.com/updateswell/upwell/tree/main/packages/core)

MIT licensed.
