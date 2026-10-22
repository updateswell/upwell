import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Upwell';
export const appDescription =
  'Update orchestrator for React Native and Expo: OTA updates, Play in-app updates and App Store prompts, driven by one policy.';

export const siteUrl = 'https://upwell.run';
export const docsUrl = 'https://docs.upwell.run';

/** Docs pages are served at the root (docs.upwell.run/quick-start). Internally they live under /docs. */
export const docsRoute = '/';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

/** Turns a docs path written as `/docs/…` (how content links are authored) into its URL: `/…`. */
export function docsHref(href: string): string {
  if (href !== '/docs' && !href.startsWith('/docs/') && !href.startsWith('/docs#')) return href;
  const rest = href.slice('/docs'.length);
  return rest.startsWith('#') ? `/${rest}` : rest || '/';
}

export const gitConfig = {
  user: 'updateswell',
  repo: 'upwell',
  branch: 'main',
  /** Where the docs content lives inside the repository. */
  contentDir: 'apps/docs/content/docs',
};

export const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;
export const npmUrl = 'https://www.npmjs.com/package/upwell';

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png'];

  return { segments, url: getImageUrl(segments, page.locale) };
}
