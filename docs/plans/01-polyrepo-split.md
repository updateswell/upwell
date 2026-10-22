# 01 · Polyrepo split: move the docs site out

**Goal:** `website/` and the brand assets move to a new repo, `updateswell/upwell-docs`, with
their git history. `upwell.run` and `docs.upwell.run` keep working with no visible change, and this
repo becomes only the SDK.

**Why first:** every later plan adds docs pages; doing the split before that avoids moving more
content later. It's also the smallest split and exercises the cross-repo workflow (releases in
`upwell` updating the docs) that the other repos will use too.

## What couples the site to this repo today

Everything below must be replaced before `website/` can leave.

| Coupling                                                      | Where                                                                                                                     | Replacement                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Schemas copied from `../schemas` before dev/build             | `website/scripts/copy-schemas.mjs`                                                                                        | Download from GitHub at a pinned release tag (`v0.1.3`, …)                    |
| CHANGELOG included from the repo root                         | `website/content/docs/resources/changelog.mdx` (`<include>../../../../CHANGELOG.md</include>`), `website/next.config.mjs` | Download `CHANGELOG.md` at the same tag into a gitignored file, include that  |
| Social images written to `../assets/brand`                    | `website/scripts/social.sh` (`OUT=../assets/brand`)                                                                       | Write to `public/brand/` in the docs repo                                     |
| README banners use relative paths                             | `README.md` (`assets/brand/banner-*.png`)                                                                                 | Absolute URLs: `https://upwell.run/brand/banner-*.png`                        |
| Vercel deploys from this repo, Root Directory `website`       | Vercel projects `upwell-site` and `upwell-docs`; root `.vercel/project.json`, `.vercelignore`                             | Re-link both projects to `upwell-docs`, Root Directory `.`                    |
| Ignored build step watches `../CHANGELOG.md` and `../schemas` | Vercel project settings                                                                                                   | A Vercel deploy hook, called by this repo's release workflow after publishing |
| Brand source of truth                                         | `assets/brand/README.md`                                                                                                  | `BRAND.md` at the docs repo root (images in `public/brand/`)                  |

Vercel projects: `upwell-site` (`prj_UPdFWKWgnJBd4AgmPzmT1YHoqycR`, `upwell.run`, env
`NEXT_PUBLIC_UPWELL_SITE=site`) and `upwell-docs` (`prj_uZKm3v65zyFUkNJhXzJLostqih0G`,
`docs.upwell.run`, env `NEXT_PUBLIC_UPWELL_SITE=docs`), team `team_zO1CLcZzoGnq3TtDB05U2bMn`.

## Decisions

- **Repo name `upwell-docs`** (proposed). It also hosts the landing page; `upwell-web` is the
  alternative if the landing grows into its own thing.
- **History is kept** with `git filter-repo`, so `git log`/`blame` on docs pages still work.
- **The docs follow released versions, not `main`.** The site shows the schemas and changelog of
  the latest published tag. Unreleased SDK changes don't leak into the docs.
- **Docs for unreleased features** are written in `upwell-docs` on a branch and merged when the SDK
  release ships.

## Session 1 · Extract the repo

- [ ] Make sure `main` is green and nothing open touches `website/`. Tag the current commit
      `pre-docs-split` and push the tag.
- [ ] Install `git-filter-repo` (`pacman -S git-filter-repo` or `pipx install git-filter-repo`;
      it isn't installed yet).
- [ ] Run the extraction below in a fresh clone (never in the working repo).
- [ ] Check the result: the root is the Next.js app, `public/brand/` has the images, `git log`
      shows only site commits, and `npm ci && npm run build` works after the fixes in session 2
      (the build fails until then because of the schemas script).
- [ ] Create `updateswell/upwell-docs` (public) and push `main`. Don't touch Vercel yet: production
      keeps deploying from `upwell` until session 3.

The extraction:

```sh
git clone git@github.com:updateswell/upwell.git upwell-docs && cd upwell-docs
git filter-repo --path website/ --path assets/brand/ \
  --path-rename website/: --path-rename assets/brand/:public/brand/
git mv public/brand/README.md BRAND.md
```

## Session 2 · Remove the couplings in `upwell-docs`

- [ ] Add `upstream.json` at the root: `{ "upwell": "v0.1.3" }`. This is the tag the site
      follows.
- [ ] Replace `scripts/copy-schemas.mjs` with `scripts/fetch-upstream.mjs`. It downloads
      `schemas/policy.schema.json`, `schemas/releases.schema.json` and `CHANGELOG.md` from
      `https://raw.githubusercontent.com/updateswell/upwell/<tag>/` into `public/schemas/` and
      `content/generated/CHANGELOG.md`. Fail the build on a non-200, so a bad tag can't deploy a
      site without schemas. Wire it to `predev` and `prebuild`. Gitignore both outputs.
- [ ] Point the changelog include at `content/generated/CHANGELOG.md` and update the comment in
      `next.config.mjs`.
- [ ] `scripts/social.sh`: write to `public/brand`.
- [ ] Update paths in comments that mention `assets/brand/README.md` (OG route, mermaid component,
      card page) to `BRAND.md`.
- [ ] Add CI (`.github/workflows/ci.yml`): `npm ci`, `npm run types:check`, `npm run build` on PRs
      and `main`.
- [ ] Add `scripts/bump-upstream.mjs` or a short README section: how to move `upstream.json` to a
      new tag.
- [ ] Write `AGENTS.md` for the docs repo: what it is, `npm run dev`, the two-site setup
      (`NEXT_PUBLIC_UPWELL_SITE`, `docsHref()`, `proxy.ts`), `upstream.json`, the design system
      (`BRAND.md`), deploys. Keep the Next.js block that `next dev` writes. Add `CLAUDE.md`
      containing `@AGENTS.md`.
- [ ] `npm run build` passes locally for both `NEXT_PUBLIC_UPWELL_SITE=site` and `=docs`.

## Session 3 · Switch Vercel and wire releases

- [ ] In both Vercel projects: connect the Git repository `updateswell/upwell-docs`, Root
      Directory `.`, ignored build step `git diff --quiet HEAD^ HEAD -- .` (or remove it). Keep
      the env vars and domains as they are.
- [ ] Deploy both. Check `https://upwell.run`, `https://upwell.run/schemas/policy.schema.json`,
      `https://upwell.run/brand/banner-dark.png`, `https://docs.upwell.run`, a docs page, the
      changelog page, an OG image (`/og/docs/...`), `llms.txt`, and the `/docs/x` → `docs.upwell.run/x`
      redirects.
- [ ] Create a deploy hook in each Vercel project (Settings → Git → Deploy Hooks). Store them as
      secrets in `updateswell/upwell`: `VERCEL_DEPLOY_HOOK_SITE`, `VERCEL_DEPLOY_HOOK_DOCS`.
- [ ] Release flow: after a publish, the docs need the new tag. Simplest version: the release
      workflow in `upwell` opens a PR in `upwell-docs` bumping `upstream.json` (needs a token with
      access to `upwell-docs`, e.g. a fine-grained PAT or a GitHub App). Merging it deploys. Use the
      deploy hooks only if the site should follow `main` instead. Pick one and document it in both
      `AGENTS.md` files.

## Session 4 · Clean up `upwell`

- [ ] Delete `website/`, `.vercel/`, `.vercelignore` and `assets/brand/`.
- [ ] `README.md`: banner image URLs → `https://upwell.run/brand/banner-{dark,light}.png`. Check
      the README renders on GitHub and on npmjs.com (npm only updates on the next publish).
- [ ] `.npmignore`: drop `/website/`.
- [ ] Search for leftovers: `grep -rn "website/\|assets/brand" --exclude-dir=node_modules .`
      (PLAN.md and these plans may mention them as history; that's fine).
- [ ] Update `AGENTS.md` (repo map, no site here anymore).
- [ ] Add a changeset only if published files changed (the README does: patch).
- [ ] Update the Claude memory note `upwell-docs-site` (and its `MEMORY.md` line): the site now
      lives in `updateswell/upwell-docs`, deploys from that repo's root, and follows
      `upstream.json`. The manual CLI deploy commands change to run from the docs repo root.

## Definition of done

- `upwell.run` and `docs.upwell.run` deploy from `updateswell/upwell-docs` and look the same as
  before.
- This repo has no site code; CI and release are unchanged and green.
- Releasing `upwell` gets the new schemas and changelog onto the site without manual copying.
- Both repos have an `AGENTS.md` describing how they relate.

## Rollback

Until session 4 is merged, nothing in `upwell` is deleted: point the Vercel projects back at
`updateswell/upwell` with Root Directory `website` and the old ignored build step. After session
4, revert that commit.

## Open questions

- Which release flow: a "bump upstream" PR (reviewed, explicit) or deploy hooks following `main`?
  The plan recommends the PR.
- Does `docs/recipes.md` and `docs/examples/` stay in `upwell` (linked from the README) or move to
  the docs site? They're SDK-adjacent; recommend leaving them, and linking the site version later.
