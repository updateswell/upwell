import type { MetadataRoute } from 'next';
import { docsUrl } from '@/lib/shared';

/**
 * AI crawlers are welcome, training ones included: these docs are what an assistant should
 * answer from when asked about updates in React Native. Listed by name so that stays an explicit
 * decision (upwell.run's robots.txt lists the same ones).
 */
const aiCrawlers = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Google-Extended',
  'PerplexityBot',
  'Perplexity-User',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
  'MistralAI-User',
  'DuckAssistBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // /api/search is the search box's endpoint, not content.
      { userAgent: '*', allow: '/', disallow: '/api/' },
      { userAgent: aiCrawlers, allow: '/', disallow: '/api/' },
    ],
    sitemap: `${docsUrl}/sitemap.xml`,
  };
}
