'use client';

import Dither from '@/components/reactbits/Dither';

/** Monochrome dithered waves (React Bits Dither), for dark bands. */
export function DitherBand({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Dither
        palette={['#0a0a0a', '#262626', '#525252', '#a3a3a3']}
        pixelSize={3}
        waveSpeed={0.03}
        waveFrequency={2.5}
        waveAmplitude={0.35}
        enableMouseInteraction
        mouseRadius={0.4}
        clickRipple={false}
      />
    </div>
  );
}
