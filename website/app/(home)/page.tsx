import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { CopyCommand } from '@/components/home/copy-command';
import { DitherLogo } from '@/components/home/dither-logo';
import { DitherBand } from '@/components/home/dither-band';
import { Logo } from '@/lib/layout.shared';
import { SiteHeader } from '@/components/home/site-header';
import { docsHref, githubUrl, npmUrl } from '@/lib/shared';

/* ─── Building blocks ──────────────────────────────────────────────────── */

/** A full-width row of the grid frame, with "+" marks where its top edge meets the frame. */
function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`relative border-t ${className}`}>
      <span className="upwell-cross top-0 left-0 hidden md:block" />
      <span className="upwell-cross top-0 left-full hidden md:block" />
      {children}
    </section>
  );
}

function PillLink({ href, children, solid = false }: { href: string; children: ReactNode; solid?: boolean }) {
  return (
    <Link
      href={docsHref(href)}
      className={
        solid
          ? 'inline-flex items-center gap-1.5 rounded-full bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground shadow-sm transition-opacity hover:opacity-85'
          : 'inline-flex items-center gap-1.5 rounded-full border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent'
      }
    >
      {children}
    </Link>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs tracking-wider text-fd-muted-foreground uppercase">{children}</p>;
}

/** A small window chrome, for code and output panes. */
function Pane({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-neutral-400">
        <span className="size-2 rounded-full bg-neutral-600" />
        {title}
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-neutral-300">{children}</pre>
    </div>
  );
}

const dim = 'text-neutral-500';
const bright = 'text-neutral-50';

/* ─── Content ──────────────────────────────────────────────────────────── */

const situations = [
  ['Below your minimum', 'Required update. Play immediate flow on Android, a blocking screen and the App Store sheet on iOS.'],
  ['OTA update for this runtime', 'Downloaded in the background, applied on next launch, after a prompt, or right away.'],
  ['Stranded on an old runtime', 'Detected. Recommended to update from the store, then required after N days.'],
  ['Newer build in the store', 'Play flexible update with progress and restart-to-install. The App Store sheet on iOS.'],
];

const worksWith = ['Expo', 'React Native', 'expo-updates', 'EAS Update', 'Google Play', 'App Store', 'TestFlight', 'Bare RN'];

const scenarios = [
  'upToDate',
  'store.recommended',
  'store.downloading',
  'store.readyToInstall',
  'store.required',
  'stranded',
  'ota.downloading',
  'ota.ready',
];

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col overflow-x-clip">
      <div className="relative mx-auto w-full max-w-6xl border-x">
        <SiteHeader />

        {/* Hero */}
        <section className="relative grid min-w-0 items-center gap-8 px-6 pt-16 pb-10 md:grid-cols-[1.1fr_1fr] md:px-12 md:pt-24">
          <div className="relative z-10 flex min-w-0 flex-col items-start gap-6">
            <span className="rounded-full border bg-fd-card px-3 py-1 text-xs text-fd-muted-foreground">
              v0.1 · React Native · Expo
            </span>
            <h1 className="upwell-display text-[2.6rem] leading-[1.05] font-medium sm:text-6xl">
              Updates That <br className="hidden md:inline" />
              Rise Up On <br className="hidden md:inline" />
              Their Own.
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed text-fd-muted-foreground">
              One policy decides, on every launch, whether a user needs an OTA update, a new store build, or
              nothing. Upwell drives it end to end.
            </p>
            <div className="flex flex-wrap gap-3">
              <PillLink href="/docs/quick-start" solid>
                Get started <ChevronRightIcon className="size-4" />
              </PillLink>
              <PillLink href="/docs">Read the docs</PillLink>
            </div>
            <CopyCommand command="npx expo install upwell" />
          </div>
          <div className="relative -mx-6 h-[420px] min-w-0 md:mx-0 md:h-[560px]">
            <DitherLogo className="size-full text-fd-foreground" />
          </div>
        </section>

        {/* Product panel: policy → device → decision */}
        <div className="relative z-10 px-4 pb-0 md:px-12">
          <div className="grid overflow-hidden rounded-t-md border border-b-0 border-neutral-800 bg-neutral-950 shadow-2xl md:grid-cols-3">
            <Pane title="policy.json" className="md:border-r md:border-white/10">
              {'{\n  '}
              <span className={dim}>&quot;android&quot;</span>
              {': {\n    '}
              <span className={dim}>&quot;latest&quot;</span>
              {':  { '}
              <span className={bright}>&quot;build&quot;: 340</span>
              {' },\n    '}
              <span className={dim}>&quot;minimum&quot;</span>
              {': { '}
              <span className={bright}>&quot;build&quot;: 300</span>
              {' },\n    '}
              <span className={dim}>&quot;ota&quot;</span>
              {': {\n      '}
              <span className={dim}>&quot;latestRuntimeVersion&quot;</span>
              {':\n        '}
              <span className={bright}>&quot;3.4.0&quot;</span>
              {',\n      '}
              <span className={dim}>&quot;strandedRequireAfterDays&quot;</span>
              {': 14\n    }\n  }\n}'}
            </Pane>
            <Pane title="device" className="border-t border-white/10 md:border-t-0 md:border-r">
              <span className={dim}>platform</span>
              {'        android\n'}
              <span className={dim}>build</span>
              {'           330\n'}
              <span className={dim}>runtime</span>
              {'         '}
              <span className={bright}>3.3.0</span>
              {'\n'}
              <span className={dim}>installSource</span>
              {'   play\n'}
              <span className={dim}>ota</span>
              {'             no update\n                for 3.3.0\n'}
              <span className={dim}>{'\n// still on old JS,\n// silently. until now.'}</span>
            </Pane>
            <Pane title="explain()" className="border-t border-white/10 md:border-t-0">
              <span className={dim}>newer:</span>
              {' policy latest 340\n  > installed build 330\n'}
              <span className={dim}>staleness:</span>
              {' 16 days (Play)\n'}
              <span className={dim}>stranded:</span>
              {' yes, runtime 3.3.0\n  != latest OTA runtime 3.4.0\n'}
              <span className={dim}>flow:</span>
              {' playImmediate\n\n'}
              <span className={bright}>{'→ store.required'}</span>
              {'\n  stranded for 16 days\n  (strandedRequireAfterDays 14)'}
            </Pane>
          </div>
        </div>

        {/* Dark band: works with + situations */}
        <div className="dark relative bg-fd-background text-fd-foreground">
          <div className="upwell-hatch h-10 border-y" />
          <div className="grid grid-cols-2 border-b sm:grid-cols-4">
            {worksWith.map((name, i) => (
              <div
                key={name}
                className={`flex h-20 items-center justify-center border-fd-border text-sm text-fd-muted-foreground ${
                  i % 2 === 0 ? 'border-r' : 'sm:border-r'
                } ${i < worksWith.length - 2 ? 'border-b' : ''} ${i >= 4 ? 'sm:border-b-0' : 'sm:border-b'} ${
                  i % 4 === 3 ? 'sm:border-r-0' : ''
                }`}
              >
                {name}
              </div>
            ))}
          </div>
          <div className="upwell-hatch h-10 border-b" />

          <div className="flex flex-col items-center gap-5 px-6 pt-20 pb-12 text-center">
            <h2 className="upwell-display max-w-2xl text-3xl font-medium sm:text-5xl">One policy. Every kind of update.</h2>
            <p className="max-w-lg text-[15px] text-fd-muted-foreground">
              A JSON file you host anywhere. Change it, and every installed app changes how it updates, with no
              release.
            </p>
            <PillLink href="/docs/policy">Read the policy reference</PillLink>
          </div>
          <div className="grid border-t sm:grid-cols-2">
            {situations.map(([when, then], i) => (
              <div
                key={when}
                className={`flex flex-col gap-2 p-8 ${i % 2 === 0 ? 'sm:border-r' : ''} ${i < 2 ? 'border-b' : i === 2 ? 'border-b sm:border-b-0' : ''}`}
              >
                <span className="text-xs text-fd-muted-foreground">0{i + 1}</span>
                <h3 className="font-medium">{when}</h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">{then}</p>
              </div>
            ))}
          </div>
          <div className="upwell-hatch h-10 border-t" />
        </div>

        {/* Features */}
        <Row>
          <div className="flex flex-col items-center gap-4 px-6 pt-20 pb-14 text-center">
            <h2 className="upwell-display max-w-2xl text-3xl font-medium sm:text-5xl">
              Built for the update you didn&apos;t see coming.
            </h2>
            <p className="max-w-lg text-[15px] text-fd-muted-foreground">
              A pure decision engine, real store flows, and a UI you can drop in or replace.
            </p>
          </div>
        </Row>

        <Row>
          <div className="grid md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-8 border-b p-8 md:border-r md:p-12">
              <div className="upwell-dither-shadow isolate">
                <div className="relative border bg-fd-card p-5 text-[12.5px] leading-relaxed">
                  <p className="mb-3 text-fd-muted-foreground">runtime check</p>
                  <div className="grid grid-cols-[1fr_auto] gap-y-2">
                    <span className="text-fd-muted-foreground">installed runtime</span>
                    <span>3.3.0</span>
                    <span className="text-fd-muted-foreground">latest OTA runtime</span>
                    <span>3.4.0</span>
                    <span className="text-fd-muted-foreground">OTA updates received</span>
                    <span>none since 3.4.0</span>
                  </div>
                  <p className="mt-4 border-t pt-3 font-medium">→ stranded: recommend, then require</p>
                </div>
              </div>
              <div>
                <h3 className="font-medium">Stranded installs, found.</h3>
                <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                  After a native change, old binaries stop getting OTA updates and nothing tells them. Upwell
                  notices and moves them to the store.{' '}
                  <Link href={docsHref('/docs/concepts/stranded-installs')} className="text-fd-foreground underline underline-offset-4">
                    How it works
                  </Link>
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-8 border-b p-8 md:p-12">
              <div className="grid grid-cols-4 gap-2">
                {['playFlexible', 'playImmediate', 'appStoreSheet', 'storeLink'].map((flow, i) => (
                  <div
                    key={flow}
                    className={`flex aspect-square items-center justify-center p-1 text-center text-[10px] leading-tight ${
                      i % 3 === 0 ? 'border bg-fd-card shadow-sm' : 'border border-dashed text-fd-muted-foreground'
                    }`}
                  >
                    {flow}
                  </div>
                ))}
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="aspect-square border border-dashed opacity-60" />
                ))}
              </div>
              <div>
                <h3 className="font-medium">Real store flows.</h3>
                <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                  Its own Play Core integration (progress, restart-to-install, resumed immediate updates) and the
                  in-app App Store sheet. Falls back to a store link when a flow can&apos;t run.
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-8 border-b p-8 md:border-r md:border-b-0 md:p-12">
              <div className="upwell-dither-shadow isolate">
                <div className="relative border bg-fd-card text-[12.5px]">
                  <p className="border-b px-5 py-3 font-medium">What&apos;s new</p>
                  {[
                    ['fix', 'Fixed a crash at checkout on iOS 27.'],
                    ['content', 'Updated the Diwali offers banner.'],
                    ['fix', 'Faster cart loading on slow networks.'],
                  ].map(([kind, notes]) => (
                    <div key={notes} className="flex items-start gap-3 border-b px-5 py-3 last:border-b-0">
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase">{kind}</span>
                      <span className="text-fd-muted-foreground">{notes}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-medium">Transparent OTA.</h3>
                <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                  Describe every OTA release in <code>releases.json</code>. Users get an &quot;Updated&quot; sheet and a
                  &quot;What&apos;s new&quot; history. Transparency tooling, not a compliance guarantee.
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-8 p-8 md:p-12">
              <div className="flex flex-wrap gap-2">
                {scenarios.map((s, i) => (
                  <span
                    key={s}
                    className={`rounded-full px-3 py-1 text-xs ${
                      i === 5 ? 'bg-fd-primary text-fd-primary-foreground' : 'border text-fd-muted-foreground'
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
              <div>
                <h3 className="font-medium">Simulate every state.</h3>
                <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">
                  <code>simulate(&apos;stranded&apos;)</code> in a dev build or Expo Go. On Android, Play&apos;s
                  FakeAppUpdateManager runs the real Kotlin path. No internal app sharing, no TestFlight.
                </p>
              </div>
            </div>
          </div>
        </Row>

        {/* Code */}
        <Row>
          <div className="grid items-center gap-10 p-8 md:grid-cols-2 md:p-12">
            <div className="flex flex-col gap-4">
              <Label>Integration</Label>
              <h2 className="upwell-display text-3xl font-medium sm:text-4xl">A few lines. Then never think about it.</h2>
              <p className="text-[15px] leading-relaxed text-fd-muted-foreground">
                Wrap your app, render the UI kit once, and Upwell checks on launch and every foreground. Prefer your
                own design? <code>useAppUpdate()</code> gives you the decision and the actions.
              </p>
              <div className="flex flex-wrap gap-3">
                <PillLink href="/docs/guides/custom-ui">Build your own UI</PillLink>
              </div>
            </div>
            <div className="upwell-dither-shadow isolate min-w-0">
              <pre className="relative overflow-x-auto border bg-fd-card p-5 text-[12.5px] leading-relaxed">
                <span className="text-fd-muted-foreground">{'// App.tsx\n'}</span>
                {'<UpwellProvider\n  policy="https://cdn.example.com/policy.json"\n  ota={expoUpdatesAdapter()}\n>\n  <RootNavigator />\n  <UpwellUI />\n</UpwellProvider>'}
              </pre>
            </div>
          </div>
        </Row>

        {/* CTA */}
        <div className="dark relative overflow-hidden bg-fd-background text-fd-foreground">
          <div className="upwell-hatch relative z-10 h-10 border-y" />
          <div className="relative">
            <DitherBand className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-fd-background via-fd-background/80 to-transparent" />
            <div className="relative flex flex-col items-start gap-6 p-8 py-20 md:p-12 md:py-28">
              <h2 className="upwell-display max-w-xl text-3xl font-medium sm:text-5xl">Ship the binary. Upwell does the rest.</h2>
              <div className="flex flex-wrap gap-3">
                <PillLink href="/docs/quick-start" solid>
                  Get started <ChevronRightIcon className="size-4" />
                </PillLink>
                <PillLink href={githubUrl}>GitHub</PillLink>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="grid gap-8 border-t p-8 text-sm md:grid-cols-[1fr_auto_auto_auto] md:p-12">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 font-medium">
              <Logo className="h-6" /> Upwell
            </div>
            <p className="max-w-xs text-fd-muted-foreground">
              Update orchestrator for React Native and Expo. MIT licensed.
            </p>
          </div>
          {[
            ['Docs', [['Introduction', '/docs'], ['Quick start', '/docs/quick-start'], ['Policy', '/docs/policy']]],
            ['Guides', [['OTA updates', '/docs/guides/ota-updates'], ['Forced updates', '/docs/guides/forced-updates'], ['Transparent OTA', '/docs/guides/transparent-ota']]],
            ['Project', [['GitHub', githubUrl], ['npm', npmUrl], ['Changelog', '/docs/resources/changelog']]],
          ].map(([title, links]) => (
            <div key={title as string} className="flex flex-col gap-2">
              <Label>{title as string}</Label>
              {(links as string[][]).map(([text, href]) => (
                <Link key={text} href={docsHref(href!)} className="text-fd-muted-foreground transition-colors hover:text-fd-foreground">
                  {text}
                </Link>
              ))}
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
