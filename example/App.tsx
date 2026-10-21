import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getUpwellNative,
  type Policy,
  type PolicySource,
  type ReleasesDocument,
  staticSource,
} from 'upwell';
import { expoUpdatesAdapter } from 'upwell/expo-updates';
import { UpwellProvider, useAppUpdate } from 'upwell/react';
import {
  UpwellButton,
  UpwellDevMenu,
  UpwellText,
  UpwellThemeProvider,
  UpwellUI,
  WhatsNew,
  useUpwellTheme,
} from 'upwell/ui';

type Preset = 'current' | 'newer' | 'stranded' | 'strandedLong' | 'required';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'current', label: 'Up to date' },
  { id: 'newer', label: 'Newer in store' },
  { id: 'stranded', label: 'Stranded' },
  { id: 'strandedLong', label: 'Stranded 20 days' },
  { id: 'required', label: 'Below minimum' },
];

const DAY = 864e5;

const ota = expoUpdatesAdapter();
/** The runtime this binary was built for (expo-updates, or app.json in debug builds). */
const RUNTIME = ota.getRuntime().runtimeVersion ?? '1.0.0';

function bumpMinor(version: string): string {
  const [major = '0', minor = '0'] = version.split('.');
  return `${major}.${Number(minor) + 1}.0`;
}

/**
 * Builds a policy relative to what is really installed (native build + expo-updates runtime), so
 * every rule, including stranded detection, runs end to end against real device data.
 */
function presetPolicy(preset: Preset): PolicySource {
  return {
    async fetch() {
      const native = getUpwellNative();
      const info = native?.getInstalledInfo();
      const build = Number(info?.buildNumber ?? 1) || 1;
      const version = info?.nativeVersion || '1.0.0';
      const runtime = RUNTIME;
      const newer = preset !== 'current';
      const releasedAt = new Date(
        Date.now() - (preset === 'strandedLong' ? 20 : 5) * DAY
      ).toISOString();
      const latestRuntime =
        preset === 'stranded' || preset === 'strandedLong' ? bumpMinor(runtime) : runtime;
      const common = {
        recommendAfterDays: 0,
        ota: {
          latestRuntimeVersion: latestRuntime,
          applyMode: 'prompt' as const,
          strandedRequireAfterDays: 14,
        },
        message: {
          title: 'Update available',
          body:
            preset === 'stranded' || preset === 'strandedLong'
              ? `Your app (runtime ${runtime}) can no longer receive updates. Install ${bumpMinor(version)} from the store.`
              : `Version ${bumpMinor(version)} is in the store.`,
        },
        requiredMessage: {
          title: 'Update required',
          body: `This version is no longer supported. Install ${bumpMinor(version)} to keep using the app.`,
        },
      };
      const policy: Policy = {
        schemaVersion: 1,
        android: {
          ...common,
          latest: newer
            ? { version: bumpMinor(version), build: build + 10, releasedAt }
            : { version, build },
          minimum: { version: '1.0.0', build: preset === 'required' ? build + 5 : 1 },
        },
        ios: {
          ...common,
          appStoreId: '1234567890',
          latest: newer
            ? { version: bumpMinor(version), build: 1, releasedAt }
            : { version, build: info?.buildNumber ?? '1' },
          minimum:
            preset === 'required'
              ? { version: bumpMinor(version), build: 1 }
              : { version: '1.0.0', build: 1 },
        },
      };
      return policy;
    },
  };
}

const releases: ReleasesDocument = {
  schemaVersion: 1,
  releases: [
    {
      id: 'example-2',
      platforms: ['ios', 'android'],
      runtimeVersion: RUNTIME,
      kind: 'fix',
      notes: 'Fixed a crash when opening the cart.',
      publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      id: 'example-1',
      platforms: ['ios', 'android'],
      runtimeVersion: RUNTIME,
      kind: 'content',
      notes: 'Refreshed the home screen banners.',
      publishedAt: new Date(Date.now() - 3 * DAY).toISOString(),
    },
  ],
};

export default function App() {
  const [preset, setPreset] = useState<Preset>('stranded');
  const policy = useMemo(() => presetPolicy(preset), [preset]);
  return (
    <UpwellThemeProvider>
      {/* Re-mount the provider when the preset changes so it starts a fresh session. */}
      <UpwellProvider
        key={preset}
        policy={policy}
        releases={staticSource(releases)}
        ota={ota}
        // A demo app is relaunched a lot; don't let the weekly prompt cap hide the prompt.
        engine={{ maxPrompts: 1000 }}
        debug>
        <Home preset={preset} onPreset={setPreset} />
        <UpwellUI bottomOffset={32} />
      </UpwellProvider>
      <StatusBar style="auto" />
    </UpwellThemeProvider>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.row}>
      <UpwellText variant="muted">{label}</UpwellText>
      <UpwellText style={styles.value}>{value ?? '—'}</UpwellText>
    </View>
  );
}

function Home({ preset, onPreset }: { preset: Preset; onPreset: (p: Preset) => void }) {
  const t = useUpwellTheme();
  const { decision, state, check, startUpdate, dismiss } = useAppUpdate();
  const [whatsNew, setWhatsNew] = useState(false);
  const installed = state.installed;
  const reason = 'reason' in decision ? ` (${decision.reason})` : '';

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={styles.content}>
      <Text style={[styles.h1, { color: t.colors.text }]}>Upwell example</Text>

      <View
        style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
        <UpwellText variant="muted">Decision</UpwellText>
        <UpwellText variant="title" style={styles.mt4}>
          {decision.kind}
          {reason}
        </UpwellText>
        <UpwellText variant="muted" style={styles.mt4}>
          {decision.because}
        </UpwellText>
        <View style={[styles.wrap, styles.mt12]}>
          <UpwellButton title="Check now" onPress={() => void check()} />
          <UpwellButton
            title="Start update"
            variant="secondary"
            onPress={() => void startUpdate()}
          />
          <UpwellButton title="Later" variant="secondary" onPress={dismiss} />
          <UpwellButton title="What's new" variant="secondary" onPress={() => setWhatsNew(true)} />
        </View>
      </View>

      <View
        style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
        <UpwellText variant="muted">Installed (read natively)</UpwellText>
        <Row label="Platform" value={installed?.platform} />
        <Row
          label="Version"
          value={installed ? `${installed.nativeVersion} (${installed.buildNumber})` : null}
        />
        <Row label="Runtime" value={installed?.runtimeVersion} />
        <Row label="OTA update" value={installed?.otaUpdateId} />
        <Row label="Install source" value={installed?.installSource} />
        <Row label="OTA status" value={state.ota.status} />
        <Row label="Simulation" value={state.simulation ?? 'off'} />
      </View>

      <View
        style={[styles.card, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
        <UpwellText variant="muted">
          Policy preset (built from the installed build and runtime)
        </UpwellText>
        <View style={[styles.wrap, styles.mt12]}>
          {PRESETS.map((p) => (
            <UpwellButton
              key={p.id}
              title={p.label}
              variant={p.id === preset ? 'primary' : 'secondary'}
              onPress={() => onPreset(p.id)}
            />
          ))}
        </View>
      </View>

      <UpwellDevMenu style={[styles.card, { borderColor: t.colors.border }]} />

      <Modal visible={whatsNew} animationType="slide" onRequestClose={() => setWhatsNew(false)}>
        <View style={[styles.flex, { backgroundColor: t.colors.background, paddingTop: 48 }]}>
          <WhatsNew style={styles.flex} />
          <UpwellButton title="Close" onPress={() => setWhatsNew(false)} style={styles.close} />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingTop: 64, paddingBottom: 200, gap: 16 },
  h1: { fontSize: 28, fontWeight: '800' },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  value: { fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mt4: { marginTop: 4 },
  mt12: { marginTop: 12 },
  close: { margin: 16 },
});
