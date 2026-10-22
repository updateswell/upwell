import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookOpenIcon, HouseIcon, PackageIcon } from 'lucide-react';
import { appName, docsHref, githubUrl, npmUrl, siteMode, siteUrl } from './shared';

/** The Upwell mark, in the current text color. */
export function Logo({ className = 'h-6' }: { className?: string }) {
  return <span role="img" aria-label={appName} className={`upwell-logo ${className}`} />;
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Logo className="h-6" />
          <span className="font-medium tracking-tight">{appName}</span>
        </>
      ),
    },
    githubUrl,
    links: [
      siteMode === 'docs'
        ? {
            type: 'icon',
            icon: <HouseIcon />,
            text: 'upwell.run',
            label: 'Upwell home',
            url: siteUrl,
            external: true,
          }
        : {
            icon: <BookOpenIcon />,
            text: 'Documentation',
            url: docsHref('/docs'),
            active: 'nested-url',
            on: 'nav',
          },
      {
        type: 'icon',
        icon: <PackageIcon />,
        text: 'npm',
        label: 'Upwell on npm',
        url: npmUrl,
        external: true,
      },
    ],
  };
}
