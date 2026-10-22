# 02 · `@upwell/core`: a dependency-free shared package

**Goal:** the policy/releases types, validators and decision engine are published as
`@upwell/core`, a package with zero dependencies that runs in React Native, Node and Cloudflare
Workers. `upwell` depends on it and re-exports it, so nothing changes for SDK users.

**Why:** the API (plan 03) must validate policies exactly like the SDK, and the CLI (plan 04)
must validate and `explain()` locally. They can't depend on `upwell`: it has required peer
dependencies (`expo`, `react`, `react-native`), and npm 7+ installs required peers automatically,
so a Worker or a CLI would pull in React Native.

`src/core/` is already pure: its files only import each other (checked 2026-10-22). This plan is
mostly moving files and release plumbing.

## Decisions

- **Workspace layout** (proposed): `packages/upwell/` (the SDK, moved from the root) and
  `packages/core/`, with a private root `package.json` using npm workspaces. Changesets versions
  workspace packages but, as far as I know, not a publishable root package, so the SDK moves into
  `packages/` instead of staying at the root. Verify this before session 1; if Changesets does
  handle a published root, keeping the SDK at the root is a smaller change.
- **Lockstep versions:** Changesets `fixed: [["upwell", "@upwell/core"]]`. `upwell@0.4.0` always
  pairs with `@upwell/core@0.4.0`, which keeps the compatibility story trivial for the API and CLI.
- **Schemas live in core** (`packages/core/schemas/`), exported as `@upwell/core/schemas/*`.
  `upwell` keeps exporting `upwell/schemas/*` (copied at build) so existing `$schema` users and
  `upwell.run/schemas/*` keep working.
- **Module format:** ESM and CJS builds with type declarations. Workers and bundlers use ESM; the
  SDK's Metro build and Jest keep working with CJS.

## Session 1 · Move the SDK into `packages/upwell`

Behavior must not change in this session; only paths.

- [ ] Record the current published file list: `npm pack --dry-run --json > /tmp/pack-before.json`.
- [ ] `git mv` the SDK into `packages/upwell/`: `src`, `android`, `ios`, `plugin`, `schemas`,
      `app.plugin.js`, `expo-module.config.json`, `babel.config.js`, `jest.config.js`,
      `tsconfig*.json`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `.npmignore`. Keep
      `example/`, `docs/`, `.github/`, `.changeset/` and `PLAN.md` at the root.
- [ ] Root `package.json`: `private: true`, `workspaces: ["packages/*"]`, scripts that run the
      workspace scripts (`npm run test --workspaces`, …), and the shared dev tooling (eslint,
      prettier, changesets).
- [ ] Example app: update `example/package.json` (`expo.autolinking.nativeModulesDir`),
      `example/metro.config.js` (watch folder and the `sources` map now under
      `packages/upwell/src`) and the `../app.plugin.js` plugin path in `example/app.json`.
- [ ] CI (`.github/workflows/ci.yml`): working directories and `npm pack` path. Release workflow:
      Changesets finds workspace packages on its own; check the publish step and the
      `npm pack` plan step still point at the right package.
- [ ] Verify: lint, typecheck, tests, build; `npm pack --dry-run --json` from `packages/upwell`
      lists the same files as before (diff the two JSON files); the example builds on Android
      (`./gradlew :upwell:compileDebugKotlin :upwell:testDebugUnitTest`) and runs in the emulator;
      CI's iOS job passes.
- [ ] Update `AGENTS.md` (paths and commands).

## Session 2 · Create `packages/core`

- [ ] `git mv packages/upwell/src/core packages/core/src` and the schemas into
      `packages/core/schemas`. Move the core tests with them (`src/core/__tests__`).
- [ ] `packages/core/package.json`: name `@upwell/core`, `sideEffects: false`, `exports` for `.`
      and `./schemas/*`, no `dependencies`, no `peerDependencies`, `publishConfig.access: public`,
      `files: ["dist", "schemas"]`, `engines` (Node ≥ 18).
- [ ] Build with `tsdown` (or two `tsc` runs) to `dist/` as ESM + CJS + `.d.ts`.
- [ ] Tests run under plain Node (Jest or Vitest, no React Native preset): this proves core
      has no React Native dependency. Add a test that fails if any file in `src/` imports
      something outside the package.
- [ ] `upwell`: add `"@upwell/core": "<same version>"` to `dependencies`; replace internal
      `../core` imports with `@upwell/core`; `src/index.ts` re-exports `export * from '@upwell/core'`
      so the public API is unchanged. Copy `schemas/` from core during `upwell`'s build.
- [ ] Check the SDK's type declarations and the example app still resolve (Metro resolves the
      workspace package; add it to the example's `sources` map if needed).
- [ ] Verify everything from session 1 again, plus: `node -e "require('@upwell/core')"` and an
      ESM import from a scratch Node project work, and a tiny Worker (`wrangler dev` or the Vitest
      Workers pool) can import and run `validatePolicy` and `explain`.

## Session 3 · Publish

- [ ] Changesets config: `fixed: [["upwell", "@upwell/core"]]`. Add a changeset (minor) for both.
- [ ] npm trusted publishing is configured per package, and the package must exist first. The
      user publishes `@upwell/core` once by hand (`npm publish --access public` from
      `packages/core`, version `0.0.0-bootstrap` or the first real version), then adds the
      trusted publisher on npmjs.com: repo `updateswell/upwell`, workflow `release.yml`,
      environment `upwell-gh-ci` (same as `upwell`).
- [ ] Merge the release PR and check both packages publish with provenance.
- [ ] In a scratch directory: `npm i @upwell/core` installs exactly one package (`npm ls --all`).
- [ ] Docs (in `upwell-docs` if plan 01 is done): a short "@upwell/core" reference page and a note
      that `upwell` re-exports it.

## Definition of done

- `@upwell/core` is on npm with no dependencies and works in Node and Workers.
- `upwell` depends on it, re-exports it, and its public API and published files are unchanged.
- One validator and one engine across SDK, API and CLI.

## Open questions

- Keep Jest for the SDK and use Vitest for core, or move everything to Vitest? Not required here;
  don't mix the migration into this plan.
