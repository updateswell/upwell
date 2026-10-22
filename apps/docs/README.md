# Upwell docs

The documentation for [Upwell](https://github.com/updateswell/upwell), built with
[Fumadocs](https://fumadocs.dev) on Next.js and served at [docs.upwell.run](https://docs.upwell.run)
by the Vercel project `upwell-docs`. The landing page (upwell.run) lives in
[`updateswell/platform`](https://github.com/updateswell/platform).

Docs pages live under `app/docs` and are written with `/docs/…` links; `proxy.ts` and `docsHref()`
in `lib/shared.ts` serve them at the root (`docs.upwell.run/quick-start`) and redirect old
`/docs/x` URLs to `/x`. The project deploys from `main` through the Vercel GitHub integration
(Root Directory `apps/docs`), and skips builds when nothing in `apps/docs/`,
`packages/core/schemas/` or `packages/upwell/CHANGELOG.md` changed.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

| Path | |
| --- | --- |
| `content/docs` | The pages (MDX). `meta.json` files set the sidebar order |
| `app/docs` | The docs layout and page |
| `lib/shared.ts` | Site name, URLs, `docsHref()` |
| `components/mdx.tsx` | Components available in MDX (Tabs, Steps, TypeTable, Mermaid, …) |

The changelog page includes `packages/upwell/CHANGELOG.md` and `public/schemas` is copied from
`packages/core/schemas` before every build (served at `docs.upwell.run/schemas/*`; upwell.run
forwards `/schemas/*` here), so the build needs the whole repository, not just
this folder. The site has its own install and lockfile; it isn't part of the npm workspace.
