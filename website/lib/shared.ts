import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Upwell';
export const appDescription =
  'Update orchestrator for React Native and Expo: OTA updates, Play in-app updates and App Store prompts, driven by one policy.';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'updateswell',
  repo: 'upwell',
  branch: 'main',
  /** Where the docs content lives inside the repository. */
  contentDir: 'website/content/docs',
};

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
