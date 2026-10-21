# Upwell site and docs

The landing page and documentation for [Upwell](https://github.com/updateswell/upwell), built with
[Fumadocs](https://fumadocs.dev) on Next.js. One codebase, deployed as two Vercel projects:

| Project | Domain | `NEXT_PUBLIC_UPWELL_SITE` | Serves |
| --- | --- | --- | --- |
| `upwell-site` | [upwell.run](https://upwell.run) (`www` redirects) | `site` | The landing page. `/docs/*` redirects to docs.upwell.run |
| `upwell-docs` | [docs.upwell.run](https://docs.upwell.run) | `docs` | The docs, at the root (`docs.upwell.run/quick-start`) |

Docs pages live under `app/docs` and are written with `/docs/…` links; `proxy.ts` and `docsHref()`
in `lib/shared.ts` map them to each deployment's URLs. Both projects deploy from `main` through
the Vercel GitHub integration, and skip builds when nothing in `website/`, `schemas/` or
`CHANGELOG.md` changed.

```bash
npm install
npm run dev     # both halves: http://localhost:3000 and http://localhost:3000/docs
npm run build
NEXT_PUBLIC_UPWELL_SITE=docs npm run build   # build one half as it's deployed
npm run social  # re-render the banners and social images into ../assets/brand (dev server running)
```

| Path | |
| --- | --- |
| `content/docs` | The pages (MDX). `meta.json` files set the sidebar order |
| `app/(home)` | The landing page |
| `app/docs` | The docs layout and page |
| `app/card/[format]` | Templates for the README banners, OG image and GitHub social preview |
| `lib/shared.ts` | Site name, URLs, deployment mode |
| `components/mdx.tsx` | Components available in MDX (Tabs, Steps, TypeTable, Mermaid, …) |

The changelog page includes the repository's `CHANGELOG.md` and `public/schemas` is copied from
`../schemas` before every build, so the build needs the whole repository, not just this folder.
