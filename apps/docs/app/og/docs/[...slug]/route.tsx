import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { notFound } from 'next/navigation';
import { source } from '@/lib/source';
import { appName, getPageImageUrl } from '@/lib/shared';

export const revalidate = false;

/** Geist Mono as TTF (Satori can't read woff2). Without a browser user agent, Google serves TTF. */
async function geistMono(weight: 400 | 500): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Geist+Mono:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: RouteContext<'/og/docs/[...slug]'>) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  const [regular, medium, logo] = await Promise.all([
    geistMono(400),
    geistMono(500),
    readFile(join(process.cwd(), 'public/logo-white.svg'), 'base64'),
  ]);
  const fonts = [
    regular && { name: 'Geist Mono', data: regular, weight: 400 as const },
    medium && { name: 'Geist Mono', data: medium, weight: 500 as const },
  ].filter((f): f is NonNullable<typeof f> => !!f);

  // Monochrome, per the Upwell design system (assets/brand/README.md).
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: '#0a0a0a',
          backgroundImage: 'radial-gradient(#262626 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          color: '#fafafa',
          fontFamily: 'Geist Mono',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;base64,${logo}`} width={42} height={64} alt="" />
          <span style={{ fontSize: 34, fontWeight: 500, letterSpacing: '-0.02em' }}>{appName}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
            {page.data.title}
          </div>
          {page.data.description ? (
            <div style={{ fontSize: 28, color: '#a3a3a3', lineHeight: 1.4, maxWidth: 980 }}>
              {page.data.description}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, color: '#737373' }}>
          <span>Update orchestrator for React Native & Expo</span>
          <span>docs</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }));
}
