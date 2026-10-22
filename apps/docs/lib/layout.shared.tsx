import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { HouseIcon, PackageIcon } from 'lucide-react';
import { appName, githubUrl, npmUrl, siteUrl } from './shared';

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
      {
        type: 'icon',
        icon: <HouseIcon />,
        text: 'upwell.run',
        label: 'Upwell home',
        url: siteUrl,
        external: true,
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
