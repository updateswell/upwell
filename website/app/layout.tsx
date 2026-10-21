import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import './global.css';
import { Geist_Mono } from 'next/font/google';
import { appDescription, appName } from '@/lib/shared';

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: {
    template: `%s | ${appName}`,
    default: `${appName}: update orchestrator for React Native and Expo`,
  },
  description: appDescription,
  openGraph: { images: '/og/docs/image.png' },
  twitter: { card: 'summary_large_image', images: '/og/docs/image.png' },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistMono.variable} font-sans antialiased`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
