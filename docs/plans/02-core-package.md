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

## Session 1 · Create `packages/core`

- [ ] `git mv packages/upwell/src/core packages/core/src` (tests move with it) and
      `packages/upwell/schemas` → `packages/core/schemas`.
- [ ] `packages/core/package.json`: name `@upwell/core`, `sideEffects: false`, `exports` for `.`
      and `./schemas/*`, no `dependencies` or `peerDependencies`, `files: ["dist", "schemas"]`,
      `publishConfig.access: public`, `engines.node >= 18`, same repository/homepage/license
      fields as `upwell`.
- [ ] Build to `dist/` as ESM + CJS + `.d.ts` (`tsdown`, or two `tsc` runs).
- [ ] Tests run under plain Node (Jest without the React Native preset, or Vitest), which
      proves there's no React Native dependency. Add a test that fails if a file in `src/` imports
      anything outside the package.
- [ ] `upwell`: add `"@upwell/core"` to `dependencies` (exact range matching the fixed version);
      replace internal `../core` imports with `@upwell/core`; `src/index.ts` keeps exporting the
      same names (`export * from '@upwell/core'`); copy core's `schemas/` into `upwell` during its
      build.
- [ ] Example app: add `@upwell/core` to the Metro `sources` map (→ `packages/core/src`) so edits
      show up without building.
- [ ] Docs: `apps/docs/scripts/copy-schemas.mjs` reads `../../packages/core/schemas`; Vercel's
      ignored build step watches that path instead.
- [ ] Verify: everything from plan 01 session 1 (lint, typecheck, tests, build, identical
      `upwell` public API, example on the emulator, CI), plus `require('@upwell/core')` and an ESM
      import from a scratch Node project, and a tiny Worker (Vitest Workers pool or `wrangler dev`)
      running `validatePolicy` and `explain`.

## Session 2 · Publish

- [ ] Changesets: the `fixed` group and a minor changeset for both packages.
- [ ] npm trusted publishing is configured per package, and the package must exist first. The
      user publishes `@upwell/core` once by hand from `packages/core`
      (`npm publish --access public`), then adds the trusted publisher on npmjs.com: repo
      `updateswell/upwell`, workflow `release.yml`, environment `upwell-gh-ci`.
- [ ] Merge the release PR; check both packages publish with provenance.
- [ ] Scratch directory: `npm i @upwell/core` installs exactly one package (`npm ls --all`);
      `npm i upwell` installs `upwell` + `@upwell/core` and nothing else new.
- [ ] Docs: a short `@upwell/core` reference page (what it is, that `upwell` re-exports it, when to
      use it directly: servers, scripts, tests).

## Definition of done

- `@upwell/core` is on npm, has no dependencies, and works in Node and Workers.
- `upwell` depends on it, re-exports it, and its public API is unchanged.
- One validator and one engine for the SDK, the CLI and the API.
