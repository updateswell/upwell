import Link from 'next/link';
import {
  ArrowRightIcon,
  BrainCircuitIcon,
  EyeIcon,
  FlaskConicalIcon,
  LayersIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { appDescription, gitConfig } from '@/lib/shared';

const situations = [
  {
    when: 'Native build below your minimum',
    then: 'Required update: Play immediate flow on Android, blocking screen and App Store sheet on iOS',
  },
  {
    when: 'An OTA update exists for this runtime',
    then: 'Downloads it in the background, applies it on next launch, after a prompt, or right away',
  },
  {
    when: 'Binary too old for your newest OTA updates',
    then: 'Detects the stranded install, recommends a store update, then requires it after N days',
  },
  {
    when: 'A newer build is in the store',
    then: 'Play flexible update with progress and restart-to-install, App Store sheet on iOS, with snoozes and caps',
  },
];

const features = [
  {
    icon: BrainCircuitIcon,
    title: 'One pure decision engine',
    body: 'decide() is table-tested rule by rule, and explain() tells you exactly why it decided what it did.',
    href: '/docs/concepts/decision-engine',
  },
  {
    icon: ShieldAlertIcon,
    title: 'Stranded install detection',
    body: 'Find installs that silently stopped receiving OTA updates after a native change, and move them to the store.',
    href: '/docs/concepts/stranded-installs',
  },
  {
    icon: SmartphoneIcon,
    title: 'Real store flows',
    body: 'Its own Play Core integration with progress, completeUpdate and resumed immediate updates. The App Store sheet on iOS.',
    href: '/docs/guides/android-play-updates',
  },
  {
    icon: LayersIcon,
    title: 'Headless or batteries-included',
    body: 'useAppUpdate() for your own design system, or a themeable UI kit you drop in with one line.',
    href: '/docs/guides/custom-ui',
  },
  {
    icon: EyeIcon,
    title: 'Transparent OTA',
    body: 'Describe every OTA release in releases.json. Users get an "Updated" sheet and a "What\'s new" history.',
    href: '/docs/guides/transparent-ota',
  },
  {
    icon: FlaskConicalIcon,
    title: 'Simulation built in',
    body: 'Step through every state in a dev build or Expo Go, with Play\'s FakeAppUpdateManager running the real Kotlin path.',
    href: '/docs/guides/testing-and-simulation',
  },
];

const code = `<UpwellProvider
  policy="https://cdn.example.com/upwell/policy.json"
  ota={expoUpdatesAdapter()}
>
  <RootNavigator />
  <UpwellUI />
</UpwellProvider>`;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-16 pb-12 text-center min-w-0 sm:pt-24">
        <span className="mb-6 rounded-full border bg-fd-secondary px-3 py-1 text-xs font-medium text-fd-muted-foreground">
          React Native · Expo · iOS · Android
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Updates that rise up <span className="text-fd-primary">on their own</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-fd-muted-foreground text-balance">{appDescription}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/docs/quick-start"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started <ArrowRightIcon className="size-4" />
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            Read the docs
          </Link>
          <a
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
            className="inline-flex items-center gap-2 rounded-lg border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>
        <code className="mt-6 rounded-lg border bg-fd-secondary px-4 py-2 font-mono text-sm">
          npx expo install upwell
        </code>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-16 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="text-xl font-semibold">One policy, every kind of update</h2>
          <p className="text-fd-muted-foreground">
            On every launch and foreground, Upwell works out which update this install needs, and drives it
            end to end.
          </p>
          <ul className="mt-2 flex flex-col divide-y rounded-xl border bg-fd-card">
            {situations.map((s) => (
              <li key={s.when} className="flex flex-col gap-1 p-4 text-left">
                <span className="text-sm font-medium">{s.when}</span>
                <span className="text-sm text-fd-muted-foreground">{s.then}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="text-xl font-semibold">A few lines of code</h2>
          <p className="text-fd-muted-foreground">
            Host a JSON policy anywhere, wrap your app, and you're done. Change the policy to change how every
            installed app behaves.
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl border bg-fd-card p-4 text-left font-mono text-sm leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      </section>

      <section className="border-t bg-fd-card/50">
        <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-16 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group flex flex-col gap-2 rounded-xl border bg-fd-background p-5 transition-colors hover:bg-fd-accent"
            >
              <f.icon className="size-5 text-fd-primary" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-fd-muted-foreground">{f.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-center text-sm text-fd-muted-foreground">
        MIT licensed. Upwell is transparency tooling, not a compliance guarantee.
      </footer>
    </main>
  );
}
