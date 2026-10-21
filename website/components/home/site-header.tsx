import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpenIcon, PackageIcon } from 'lucide-react';
import { FullSearchTrigger, SearchTrigger } from 'fumadocs-ui/layouts/shared/slots/search-trigger';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import { Logo } from '@/lib/layout.shared';
import { appName, docsHref, githubUrl, npmUrl } from '@/lib/shared';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.9.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

function IconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const external = href.startsWith('http');
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer noopener' : undefined}
      className="inline-flex size-8 items-center justify-center rounded-full text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-foreground [&_svg]:size-4"
    >
      {children}
    </Link>
  );
}

/** The landing page header: sits inside the page's grid frame instead of spanning the window. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-fd-background/80 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
          <Logo className="h-6" />
          {appName}
        </Link>
        <nav className="flex items-center gap-1">
          <FullSearchTrigger
            hideIfDisabled
            className="me-1 hidden h-8 w-44 rounded-full ps-3 text-xs sm:inline-flex [&_kbd]:rounded-full [&_kbd]:text-[10px]"
          />
          <SearchTrigger hideIfDisabled className="rounded-full sm:hidden" />
          <IconLink href={docsHref('/docs')} label="Documentation">
            <BookOpenIcon />
          </IconLink>
          <IconLink href={githubUrl} label="GitHub">
            <GitHubIcon />
          </IconLink>
          <IconLink href={npmUrl} label="npm">
            <PackageIcon />
          </IconLink>
          <ThemeSwitch className="ms-1 hidden sm:flex" />
        </nav>
      </div>
    </header>
  );
}
