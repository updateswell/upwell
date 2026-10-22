import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Upwell';
export const appDescription =
  'Update orchestrator for React Native and Expo: OTA updates, Play in-app updates and App Store prompts, driven by one policy.';

export const siteUrl = 'https://upwell.run';
export const docsUrl = 'https://docs.upwell.run';

/**
 * Which half of the site this deployment serves (one codebase, two Vercel projects):
 * - `site`: the landing page on upwell.run; /docs/* redirects to docs.upwell.run
 * - `docs`: the docs on docs.upwell.run, at the root (docs.upwell.run/quick-start)
 * - unset: both, with the docs under /docs (local development)
 */
export const siteMode = (process.env.NEXT_PUBLIC_UPWELL_SITE ?? 'all') as 'site' | 'docs' | 'all';

/** Where docs pages live in this deployment's URLs. Internally they are always under /docs. */
export const docsRoute = siteMode === 'docs' ? '/' : '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

/**
 * Turns a docs path written as `/docs/…` (how content links are authored) into the right URL for
 * this deployment: `/…` on docs.upwell.run, `https://docs.upwell.run/…` on upwell.run.
 */
export function docsHref(href: string): string {
  if (href !== '/docs' && !href.startsWith('/docs/') && !href.startsWith('/docs#')) return href;
  const rest = href.slice('/docs'.length);
  if (siteMode === 'docs') return rest.startsWith('#') ? `/${rest}` : rest || '/';
  if (siteMode === 'site') return `${docsUrl}${rest}`;
  return href;
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
