import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb';
import {
  appName,
  docsHref,
  docsUrl,
  getPageImageUrl,
  getPageMarkdownUrl,
  getPagePublicMarkdownUrl,
  gitConfig,
  siteUrl,
} from '@/lib/shared';
import type { ComponentProps } from 'react';

type Page = NonNullable<ReturnType<typeof source.getPage>>;

/** schema.org data: the page as an article about Upwell (described on upwell.run), and its breadcrumbs. */
function jsonLd(page: Page) {
  const url = `${docsUrl}${page.url === '/' ? '' : page.url}`;
  // Folders without an index page (Concepts, Guides…) have no URL, and a crumb needs one.
  const crumbs = getBreadcrumbItems(page.url, source.getPageTree(), { includePage: true }).filter(
    (item): item is { name: string; url: string } => typeof item.name === 'string' && !!item.url && item.url !== '/',
  );

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: page.data.title,
        description: page.data.description,
        url,
        image: `${docsUrl}${getPageImageUrl(page).url}`,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: `${appName} docs`, url: docsUrl },
        about: { '@id': `${siteUrl}/#software`, name: appName, url: siteUrl },
        publisher: { '@id': `${siteUrl}/#organization`, '@type': 'Organization', name: appName, url: siteUrl },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: 'Docs', url: '' }, ...crumbs].map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: `${docsUrl}${item.url}`,
        })),
      },
    ],
  };
}

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const RelativeLink = createRelativeLink(source, page);
  // Content links are written as /docs/…; map them to this deployment's docs URLs.
  const Link = ({ href, ...props }: ComponentProps<'a'>) => (
    <RelativeLink href={href ? docsHref(href) : href} {...props} />
  );
  const markdownUrl = getPageMarkdownUrl(page).url;

  // The page title is the only h1; drop h1s from included files (e.g. CHANGELOG.md) from the TOC.
  const toc = page.data.toc.filter((item) => item.depth > 1);

  return (
    <DocsPage toc={toc} full={page.data.full}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(page)).replace(/</g, '\\u003c') }}
      />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
      <div className="flex flex-row gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover
          markdownUrl={markdownUrl}
          githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/${gitConfig.contentDir}/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: Link,
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
      // The same page as Markdown, for agents (docs.upwell.run/quick-start.md).
      types: { 'text/markdown': getPagePublicMarkdownUrl(page) },
    },
    openGraph: {
      type: 'article',
      url: page.url,
      images: getPageImageUrl(page).url,
    },
  };
}
