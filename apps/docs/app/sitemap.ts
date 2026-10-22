import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { docsUrl } from '@/lib/shared';

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({
    url: `${docsUrl}${page.url === '/' ? '' : page.url}`,
    changeFrequency: 'weekly',
    priority: page.url === '/' ? 1 : page.slugs.length === 1 ? 0.8 : 0.6,
  }));
}
