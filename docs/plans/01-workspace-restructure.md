# 01 · Restructure `upwell` into a workspace

**Goal:** this repo takes its final shape: the SDK in `packages/upwell/`, the docs site in
`apps/docs/`, room for `packages/core` (plan 02) and `packages/cli` (plan 05). Nothing changes for
users: same npm package, same files, same sites.

**Why first:** plans 02 and 05 add packages next to the SDK, and plan 03 takes the landing page
out of the docs app. Both are simpler once the layout exists. Doing it before more code lands
keeps the move cheap.

## Target layout

```
package.json          private root: npm workspaces ["packages/*"], shared dev tooling, scripts
packages/upwell/      the SDK (everything published today)
apps/docs/            the Fumadocs site (docs.upwell.run, and upwell.run until plan 03)
example/              Expo example app (own install, not a workspace member)
docs/                 recipes, example policy files, plans
.changeset/ .github/  unchanged locations
```

## Decisions

- **Workspaces cover `packages/*` only.** `apps/docs` and `example/` keep their own
  `package-lock.json`. The example needs React exactly as React Native pins it; the docs need
  Next.js's React. Separate installs avoid hoisting clashes. Both read workspace files by relative
  path.
- **The SDK moves into `packages/`, not just core.** As far as I know, Changesets versions
  workspace packages but not a published root package, so keeping the SDK at the root next to
  workspaces is fragile. Verify before session 1: if Changesets does release a non-private root
  package alongside workspaces, the SDK could stay at the root, but `packages/upwell` is cleaner
  anyway.
- **History is kept** by using `git mv` for every move.

## Session 1 · Move the SDK into `packages/upwell`

Behavior must not change; only paths.

- [ ] Record the published file list: `npm pack --dry-run --json > /tmp/pack-before.json`.
- [ ] `git mv` into `packages/upwell/`: `src`, `android`, `ios`, `plugin`, `schemas`,
      `app.plugin.js`, `expo-module.config.json`, `babel.config.js`, `jest.config.js`,
      `tsconfig.json`, `tsconfig.build.json`, `package.json`, `README.md`, `CHANGELOG.md`,
      `LICENSE`, `.npmignore`. Keep at the root: `example/`, `website/`, `docs/`, `.github/`,
      `.changeset/`, `PLAN.md`, `AGENTS.md`, `CLAUDE.md`, ESLint and Prettier config.
- [ ] New root `package.json`: `private: true`, `workspaces: ["packages/*"]`, scripts that run
      across workspaces (`test`, `lint`, `typecheck`, `build`), and the shared dev tooling
      (ESLint, Prettier, Changesets). Keep a root `LICENSE` copy (GitHub shows it) and a short root
      `README.md` that points to `packages/upwell/README.md` and the docs.
- [ ] Example app: `example/package.json` (`expo.autolinking.nativeModulesDir`),
      `example/metro.config.js` (watch folder, the `sources` map now under `packages/upwell/src`),
      `example/app.json` (plugin path `../packages/upwell/app.plugin.js`).
- [ ] ESLint and Prettier ignores: `build` → `packages/*/build`, `plugin/build` →
      `packages/upwell/plugin/build`.
- [ ] CI (`.github/workflows/ci.yml`): `npm ci` at the root, `npm pack --dry-run` in
      `packages/upwell`, the example steps unchanged. Release workflow: check that Changesets finds
      `packages/upwell` and that the publish and pack-plan steps run in the right directory. The
      npm trusted publisher points at the workflow file name, which doesn't change.
- [ ] Verify:
  - lint, typecheck, tests, build from the root;
  - `npm pack --dry-run --json` in `packages/upwell` lists the same files as before (diff the
    JSON);
  - the example builds and runs on the emulator (`npx expo run:android`), and
    `./gradlew :upwell:compileDebugKotlin :upwell:testDebugUnitTest` passes;
  - CI's Android and iOS jobs pass;
  - a Changesets dry run (`npx changeset status`) sees `upwell`.
- [ ] Update `AGENTS.md` (layout, commands).

## Session 2 · Move the site to `apps/docs`

The site still serves both `upwell.run` and `docs.upwell.run` after this session; plan 03 takes
the landing out.

- [ ] `git mv website apps/docs`.
- [ ] Fix its relative paths:
  - `scripts/copy-schemas.mjs`: `../schemas` → `../../packages/upwell/schemas` (plan 02 changes it
    again to `packages/core/schemas`).
  - `content/docs/resources/changelog.mdx`: the `<include>` path to
    `packages/upwell/CHANGELOG.md`.
  - `next.config.mjs`: `turbopack.root` → the repo root (`join(here, '../..')`), and its comment.
  - `scripts/social.sh`: `OUT=../../assets/brand` (temporary; plan 03 moves brand assets out).
  - `lib/shared.ts`: `gitConfig.contentDir` → `apps/docs/content/docs` (the "Edit on GitHub"
    links).
- [ ] Root config: `.vercelignore` paths (`website/.next` → `apps/docs/.next`, …), ESLint and
      Prettier ignores (`website` → `apps/docs`).
- [ ] Vercel, both projects (`upwell-site` `prj_UPdFWKWgnJBd4AgmPzmT1YHoqycR` and `upwell-docs`
      `prj_uZKm3v65zyFUkNJhXzJLostqih0G`): Root Directory `website` → `apps/docs`; ignored build
      step → `git diff --quiet HEAD^ HEAD -- . ../../packages/upwell/CHANGELOG.md ../../packages/upwell/schemas`.
      Change the settings right before merging, then deploy and check: `upwell.run`,
      `upwell.run/schemas/policy.schema.json`, `docs.upwell.run`, the changelog page, an OG image,
      `llms.txt`, the `/docs/x` → `docs.upwell.run/x` redirect.
- [ ] CI: a `docs` job that builds `apps/docs` (`npm ci && npm run build` in that directory) when
      `apps/docs/**` or `packages/*/schemas/**` change. Add path filters so the macOS iOS job only
      runs for SDK changes (`packages/upwell/**`, `example/**`).
- [ ] Update the Claude memory note `upwell-docs-site` (Root Directory, deploy commands) and
      `AGENTS.md`.

## Definition of done

- Root is a private workspace; `packages/upwell` publishes exactly what `upwell@0.1.x` published.
- The example app, CI (JS, Android, iOS, docs) and the release workflow work from the new layout.
- Both sites deploy from `apps/docs` with no visible change.

## Rollback

Each session is one commit (or PR): revert it. For session 2, also set the Vercel Root Directory
back to `website`.
