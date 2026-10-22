import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();
const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Keeps the dev badge out of the social image captures (scripts/social.sh).
  devIndicators: false,
  // The docs include files from elsewhere in the repository (packages/upwell/CHANGELOG.md).
  turbopack: { root: join(here, '../..') },
};

export default withMDX(config);
