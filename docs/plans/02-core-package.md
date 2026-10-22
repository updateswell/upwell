# 02 · `@upwell/core`

**Goal:** the library's pure logic (policy and releases types, validation, the decision engine,
version comparison, rollout bucketing) is published as `@upwell/core`: no dependencies, runs in
React Native, Node and Cloudflare Workers. `upwell` depends on it and re-exports it, so nothing
changes for SDK users.

**Why:** the API (`platform`, plan 04) must reject exactly the policies the SDK rejects, and the
CLI (plan 05) runs `validate` and `explain` on a developer's machine. Neither can depend on
`upwell`: its required peer dependencies (`expo`, `react`, `react-native`) are installed
automatically by npm, which would pull React Native into a Worker or a CLI.

**What users notice:** nothing. `npx expo install upwell` installs `upwell` plus `@upwell/core`.
The code moves; it isn't added. `src/core` is about 29 KB of runtime JavaScript today, and the
`upwell` tarball is 100 KB. `src/core` already imports nothing outside itself (checked
2026-10-22).

## Decisions

- **Lockstep versions:** Changesets `fixed: [["upwell", "@upwell/core"]]`. `upwell@0.4.0` always
  pairs with `@upwell/core@0.4.0`. `@upwell/cli` (plan 05) versions independently.
- **Schemas live in core** (`packages/core/schemas/`, exported as `@upwell/core/schemas/*`).
  `upwell` keeps exporting `upwell/schemas/*` (copied at build) so nothing breaks for existing
  users.
- **Module format:** ESM + CJS + type declarations. Workers and bundlers use ESM; Metro and Jest
  keep working.
- **Event types** for analytics (plan 06/07) will also live here.
- **Build with tsdown** (decided in session 1): one bundled file per format (`dist/index.mjs`,
  `dist/index.cjs`, `.d.mts`, `.d.cts`), so the sources keep extensionless imports and Node ESM
  still works. Two `tsc` runs would need `.js` extensions on every import.
- **Tests: Jest in plain Node** (`testEnvironment: 'node'`, Babel only strips types), so the
  tests and `npm test -- --ci --coverage` stay as they were.
- **In-repo, `upwell` uses core's sources**: tsconfig `paths`, Jest `moduleNameMapper` and the
  example's Metro map point at `packages/core/src`. Only `upwell`'s build (`tsconfig.build.json`
  resets `paths`) reads `packages/core/dist`, like users do. So the build order matters: the root
  `build` runs core, then `upwell`, and the root `prepare` runs it on `npm install`/`npm ci`.
  The packages only have `prepack`: npm runs workspace `prepare` scripts in parallel, and
  `upwell`'s raced core's on CI. A new package that depends on core (the CLI, plan 05) goes into
  the root `build` after core.
- **`packages/upwell/schemas` is gitignored** and copied from core by `upwell`'s build.

## Session 1 · Create `packages/core`

- [x] `git mv packages/upwell/src/core packages/core/src` (tests move with it) and
      `packages/upwell/schemas` → `packages/core/schemas`.
- [x] `packages/core/package.json`: name `@upwell/core`, `sideEffects: false`, `exports` for `.`
      and `./schemas/*`, no `dependencies` or `peerDependencies`, `files: ["dist", "schemas"]`,
      `publishConfig.access: public`, `engines.node >= 18`, same repository/homepage/license
      fields as `upwell`.
- [x] Build to `dist/` as ESM + CJS + `.d.ts` (`tsdown`, or two `tsc` runs).
- [x] Tests run under plain Node (Jest without the React Native preset, or Vitest), which
      proves there's no React Native dependency. Add a test that fails if a file in `src/` imports
      anything outside the package.
- [x] `upwell`: add `"@upwell/core"` to `dependencies` (exact range matching the fixed version);
      replace internal `../core` imports with `@upwell/core`; `src/index.ts` keeps exporting the
      same names (`export * from '@upwell/core'`); copy core's `schemas/` into `upwell` during its
      build.
- [x] Example app: add `@upwell/core` to the Metro `sources` map (→ `packages/core/src`) so edits
      show up without building.
- [x] Docs: `apps/docs/scripts/copy-schemas.mjs` reads `../../packages/core/schemas`; Vercel's
      ignored build step watches that path instead.
- [x] Verify: everything from plan 01 session 1 (lint, typecheck, tests, build, identical
      `upwell` public API, example on the emulator, CI), plus `require('@upwell/core')` and an ESM
      import from a scratch Node project, and a tiny Worker (Vitest Workers pool or `wrangler dev`)
      running `validatePolicy` and `explain`.

## Session 2 · Publish

- [x] Changesets: the `fixed` group and a minor changeset for both packages.
- [ ] npm trusted publishing is configured per package, and the package must exist first. The
      user publishes `@upwell/core` once by hand from `packages/core`
      (`npm publish --access public`), then adds the trusted publisher on npmjs.com: repo
      `updateswell/upwell`, workflow `release.yml`, environment `upwell-gh-ci`.
- [ ] Merge the release PR; check both packages publish with provenance.
- [ ] Scratch directory: `npm i @upwell/core` installs exactly one package (`npm ls --all`);
      `npm i upwell` installs `upwell` + `@upwell/core` and nothing else new.
- [x] Docs: a short `@upwell/core` reference page (what it is, that `upwell` re-exports it, when to
      use it directly: servers, scripts, tests).

## Definition of done

- `@upwell/core` is on npm, has no dependencies, and works in Node and Workers.
- `upwell` depends on it, re-exports it, and its public API is unchanged.
- One validator and one engine for the SDK, the CLI and the API.
