import { notFound } from 'next/navigation';
import { DitherLogo } from '@/components/home/dither-logo';
import { Logo } from '@/lib/layout.shared';

// Social images, rendered at exact size and captured by scripts/social.sh into assets/brand/.
const SIZES = {
  banner: [1280, 400], // README, GitHub light theme
  'banner-dark': [1280, 400], // README, GitHub dark theme
  og: [1200, 630], // upwell.run link previews
  social: [1280, 640], // GitHub repository social preview
} as const;

type Format = keyof typeof SIZES;

export function generateStaticParams() {
  return Object.keys(SIZES).map((format) => ({ format }));
}

export const metadata = { robots: { index: false } };

function Wordmark({ size }: { size: number }) {
  return (
    <div className="flex items-center" style={{ gap: size * 0.3 }}>
      <Logo className="shrink-0" />
      <span className="font-medium leading-none" style={{ fontSize: size, letterSpacing: '-0.04em' }}>
        Upwell
      </span>
    </div>
  );
}

export default async function Card({ params }: PageProps<'/card/[format]'>) {
  const { format } = (await params) as { format: Format };
  if (!(format in SIZES)) notFound();
  const [w, h] = SIZES[format];
  // Light cards are black on white; everything else is white on black.
  const dark = format !== 'banner';
  const tall = format !== 'banner' && format !== 'banner-dark';

  return (
    <div className={dark ? 'dark' : ''}>
      <div
        id="card"
        style={{ width: w, height: h }}
        className="relative grid overflow-hidden border-2 border-fd-foreground bg-fd-background text-fd-foreground"
      >
        <div className="grid h-full" style={{ gridTemplateColumns: `1fr ${tall ? 460 : 400}px` }}>
          <div className={`flex flex-col justify-between ${tall ? 'p-16' : 'p-12'}`}>
            <div className={tall ? '[&_.upwell-logo]:h-[96px]' : '[&_.upwell-logo]:h-[84px]'}>
              <Wordmark size={tall ? 92 : 84} />
            </div>
            <div
              className="font-medium"
              style={{
                fontSize: format === 'og' ? 54 : tall ? 60 : 44,
                lineHeight: 1.05,
                letterSpacing: '-0.04em',
                wordSpacing: '-0.28em',
              }}
            >
              Updates That Rise Up
              <br />
              On Their Own.
            </div>
            <div className="flex items-center gap-5" style={{ fontSize: tall ? 22 : 19 }}>
              <span className="text-fd-muted-foreground">Update orchestrator for React Native &amp; Expo</span>
              {tall ? null : (
                <span className="border-2 border-fd-foreground bg-fd-foreground px-2 py-0.5 text-fd-background">upwell.run</span>
              )}
            </div>
            {tall ? (
              <div className="flex items-center gap-4" style={{ fontSize: 22 }}>
                <span className="border-2 border-fd-foreground px-3 py-1">npx expo install upwell</span>
                <span className="bg-fd-foreground px-3 py-1 text-fd-background">upwell.run</span>
              </div>
            ) : null}
          </div>
          <div className="relative h-full border-l-2 border-fd-foreground">
            <div
              className="upwell-hatch absolute inset-0 opacity-60"
              style={{ backgroundImage: 'radial-gradient(var(--color-fd-border) 1px, transparent 1px)', backgroundSize: '6px 6px' }}
            />
            <DitherLogo still cell={tall ? 4 : 3} className="relative size-full text-fd-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
