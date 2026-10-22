import { NextRequest, NextResponse } from 'next/server';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { docsContentRoute } from '@/lib/shared';

// Docs pages live under /docs internally and are served at the root (docs.upwell.run/quick-start).
const { rewrite: rewriteDocs } = rewritePath('/docs{/*path}', `${docsContentRoute}{/*path}/content.md`);
const { rewrite: rewriteSuffix } = rewritePath('/docs{/*path}.md', `${docsContentRoute}{/*path}/content.md`);

/** Paths that are not docs pages: framework, API, generated files and public assets. */
const NOT_DOCS = /^\/(_next|api|og|llms\.mdx|llms\.txt|llms-full\.txt|schemas)(\/|$)|\.(svg|png|ico|txt|xml|json|webmanifest)$/;

function isDocsPath(path: string) {
  return path === '/docs' || path.startsWith('/docs/');
}

export default function proxy(request: NextRequest) {
  const url = request.nextUrl;
  let path = url.pathname;

  if (isDocsPath(path)) {
    // Old URLs (docs.upwell.run/docs/x, upwell-docs.vercel.app/docs/x) → /x
    return NextResponse.redirect(new URL(`${path.slice('/docs'.length) || '/'}${url.search}`, url), 308);
  }
  if (!NOT_DOCS.test(path)) path = `/docs${path === '/' ? '' : path}`;

  const suffix = rewriteSuffix(path);
  if (suffix) return NextResponse.rewrite(new URL(suffix, url));

  if (isMarkdownPreferred(request)) {
    const markdown = rewriteDocs(path);
    if (markdown) {
      return NextResponse.rewrite(new URL(markdown, url), {
        // this URL has two representations, selected by `Accept`
        headers: { Vary: 'Accept' },
      });
    }
  }

  if (path !== url.pathname) return NextResponse.rewrite(new URL(`${path}${url.search}`, url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
