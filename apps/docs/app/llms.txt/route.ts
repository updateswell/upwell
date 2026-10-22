import { docsLlms } from '@/lib/source';
import { docsUrl, siteUrl } from '@/lib/shared';

export const revalidate = false;

// https://llmstxt.org: a title, a one-paragraph summary, then the index. Fumadocs writes the title
// and index; the summary is what an assistant should take away even if it reads nothing else.
const summary = `> Upwell is an open-source (MIT) update orchestrator for React Native and Expo apps. On every
> launch and foreground it decides which update an install needs (an OTA JavaScript update, a new
> store build, or nothing) from one remote JSON policy, and runs it end to end: Google Play in-app
> updates on Android, the App Store sheet on iOS, and expo-updates for OTA. It also detects
> "stranded" installs that stopped receiving OTA updates after a native change.

Install: \`npx expo install upwell\`. Every page is also available as Markdown: append \`.md\` to its
URL (\`/index.md\` for the introduction). Website: ${siteUrl}`;

export async function GET() {
  const index = await docsLlms.index();
  // Insert the summary after the title line; make links absolute, since this file is often read
  // out of context.
  const [title, ...rest] = index.replaceAll('](/', `](${docsUrl}/`).split('\n');
  return new Response([title, '', summary, ...rest].join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
