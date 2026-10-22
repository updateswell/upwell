'use client';

import { use, useId, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

export function Mermaid({ chart }: { chart: string }) {
  // `false` on the server and during hydration
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isClient) return;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  const dark = resolvedTheme === 'dark';
  // Monochrome, per the Upwell design system (https://github.com/updateswell/platform/blob/main/BRAND.md).
  const fg = dark ? '#fafafa' : '#0a0a0a';
  const surface = dark ? '#111111' : '#ffffff';
  const muted = dark ? '#a3a3a3' : '#737373';
  const border = dark ? '#404040' : '#d4d4d4';
  const subtle = dark ? '#1a1a1a' : '#f5f5f5';

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: 'base',
    themeVariables: {
      darkMode: dark,
      background: 'transparent',
      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
      fontSize: '13px',
      primaryColor: surface,
      primaryTextColor: fg,
      primaryBorderColor: fg,
      secondaryColor: subtle,
      tertiaryColor: subtle,
      lineColor: muted,
      textColor: fg,
      mainBkg: surface,
      nodeBorder: fg,
      clusterBkg: subtle,
      clusterBorder: border,
      edgeLabelBackground: dark ? '#0a0a0a' : '#fafafa',
      actorBkg: surface,
      actorBorder: fg,
      actorTextColor: fg,
      actorLineColor: muted,
      signalColor: fg,
      signalTextColor: fg,
      labelBoxBkgColor: subtle,
      labelBoxBorderColor: border,
      labelTextColor: fg,
      loopTextColor: fg,
      noteBkgColor: subtle,
      noteBorderColor: border,
      noteTextColor: fg,
      activationBkgColor: subtle,
      activationBorderColor: fg,
      sequenceNumberColor: surface,
      stateBkg: surface,
      stateBorder: fg,
      altBackground: subtle,
      compositeBackground: subtle,
      transitionColor: muted,
      transitionLabelColor: fg,
      specialStateColor: fg,
      stateLabelColor: fg,
      nodeTextColor: fg,
      titleColor: fg,
      innerEndBackground: fg,
    },
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () => {
      return mermaid.render(id, chart.replaceAll('\\n', '\n'));
    }),
  );

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
