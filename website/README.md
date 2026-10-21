# Upwell docs

The documentation site for [Upwell](https://github.com/updateswell/upwell), built with
[Fumadocs](https://fumadocs.dev) on Next.js. It's deployed separately from the library, as the `upwell-docs` Vercel project:
<https://upwell-docs.vercel.app>.

```bash
npm install
npm run dev     # http://localhost:3000/docs
npm run build
```

| Path | |
| --- | --- |
| `content/docs` | The pages (MDX). `meta.json` files set the sidebar order |
| `app/(home)` | The landing page |
| `app/docs` | The docs layout and page |
| `lib/shared.ts` | Site name, GitHub info |
| `lib/layout.shared.tsx` | Navbar, logo and links |
| `components/mdx.tsx` | Components available in MDX (Tabs, Steps, TypeTable, Mermaid, …) |

The changelog page includes the repository's `CHANGELOG.md`, so the build needs the whole
repository, not just this folder. On Vercel, set the project's Root Directory to `website`.
