import { type ReactNode, useEffect, useState } from 'react';
import {
  Animated,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ProgressBar, UpwellButton, UpwellText } from './primitives';
import { useUpwellTheme } from './theme';
import type { Release } from '../core/types';
import { useAppUpdate, useUpdateHistory } from '../react';
import { SIMULATION_SCENARIOS, type SimulationScenario } from '../simulation';

interface FloatingProps {
  /** Distance from the bottom of the screen (e.g. your safe-area inset + tab bar). Default 24. */
  bottomOffset?: number;
  style?: StyleProp<ViewStyle>;
}

function useAppear(visible: boolean) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(value, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, value]);
  return {
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };
}

function Floating(
  props: FloatingProps & { visible: boolean; children: ReactNode; testID?: string }
) {
  const t = useUpwellTheme();
  const appear = useAppear(props.visible);
  if (!props.visible) return null;
  return (
    <Animated.View
      testID={props.testID}
      accessibilityLiveRegion="polite"
      pointerEvents="box-none"
      style={[
        local.floating,
        {
          bottom: props.bottomOffset ?? 24,
          backgroundColor: t.colors.surface,
          borderColor: t.colors.border,
          borderRadius: t.radius,
          padding: t.spacing,
        },
        appear,
        props.style,
      ]}>
      {props.children}
    </Animated.View>
  );
}

/**
 * "Restart to update": shown when a Play flexible update finished downloading, or an OTA update
 * with `applyMode: "prompt"` is ready.
 */
export function RestartSnackbar(props: FloatingProps) {
  const { decision, isDismissed, isBusy, startUpdate, dismiss } = useAppUpdate();
  const t = useUpwellTheme();
  const visible =
    !isDismissed &&
    (decision.kind === 'store.readyToInstall' ||
      (decision.kind === 'ota.ready' && decision.applyMode === 'prompt'));
  return (
    <Floating {...props} visible={visible} testID="upwell-restart-snackbar">
      <View style={local.row}>
        <UpwellText style={local.flex}>
          {decision.kind === 'store.readyToInstall'
            ? t.strings.storeDownloaded
            : t.strings.otaReady}
        </UpwellText>
        <UpwellButton
          title={t.strings.later}
          variant="secondary"
          onPress={dismiss}
          testID="upwell-restart-later"
        />
        <UpwellButton
          title={t.strings.restart}
          onPress={() => {
            startUpdate();
          }}
          busy={isBusy}
          testID="upwell-restart"
        />
      </View>
    </Floating>
  );
}

/** Progress of a Play flexible download. */
export function DownloadProgressBanner(props: FloatingProps) {
  const { decision } = useAppUpdate();
  const t = useUpwellTheme();
  const visible = decision.kind === 'store.downloading' && !decision.required;
  const progress = decision.kind === 'store.downloading' ? decision.progress : null;
  return (
    <Floating {...props} visible={visible} testID="upwell-download-banner">
      <UpwellText>
        {t.strings.downloading(progress == null ? null : Math.round(progress * 100))}
      </UpwellText>
      <View style={{ height: t.spacing / 2 }} />
      <ProgressBar progress={progress} testID="upwell-download-progress" />
    </Floating>
  );
}

/** Soft prompt for a recommended store update ("Update" / "Later"). */
export function UpdatePrompt(props: FloatingProps) {
  const { decision, isBusy, startUpdate, dismiss } = useAppUpdate();
  const t = useUpwellTheme();
  const visible = decision.kind === 'store.recommended';
  const message = decision.kind === 'store.recommended' ? decision.message : null;
  const notesUrl = message?.releaseNotesUrl;
  return (
    <Floating {...props} visible={visible} testID="upwell-update-prompt">
      <UpwellText variant="title">{message?.title ?? t.strings.updateAvailableTitle}</UpwellText>
      <View style={{ height: 6 }} />
      <UpwellText variant="muted">{message?.body ?? t.strings.updateAvailableBody}</UpwellText>
      <View style={[local.row, { marginTop: t.spacing }]}>
        {notesUrl ? (
          <UpwellButton
            title={t.strings.releaseNotes}
            variant="secondary"
            onPress={() => {
              Linking.openURL(notesUrl);
            }}
          />
        ) : null}
        <View style={local.flex} />
        <UpwellButton
          title={t.strings.later}
          variant="secondary"
          onPress={dismiss}
          testID="upwell-prompt-later"
        />
        <UpwellButton
          title={t.strings.update}
          onPress={() => {
            startUpdate();
          }}
          busy={isBusy}
          testID="upwell-prompt-update"
        />
      </View>
    </Floating>
  );
}

/** Blocking full-screen modal for required updates. It can't be dismissed. */
export function ForceUpdateScreen(props: { style?: StyleProp<ViewStyle> }) {
  const { decision, isBusy, progress, startUpdate } = useAppUpdate();
  const t = useUpwellTheme();
  const downloadingRequired = decision.kind === 'store.downloading' && decision.required;
  const visible = decision.kind === 'store.required' || downloadingRequired;
  const message = decision.kind === 'store.required' ? decision.message : null;
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => {}}
      statusBarTranslucent
      navigationBarTranslucent>
      <View
        testID="upwell-force-update"
        accessibilityViewIsModal
        style={[
          local.full,
          { backgroundColor: t.colors.background, padding: t.spacing * 2 },
          props.style,
        ]}>
        <UpwellText variant="title" style={local.center}>
          {message?.title ?? t.strings.requiredTitle}
        </UpwellText>
        <View style={{ height: t.spacing }} />
        <UpwellText variant="muted" style={local.center}>
          {message?.body ?? t.strings.requiredBody}
        </UpwellText>
        <View style={{ height: t.spacing * 2 }} />
        {downloadingRequired ? (
          <View style={local.stretch}>
            <UpwellText style={local.center}>
              {t.strings.downloading(progress == null ? null : Math.round(progress * 100))}
            </UpwellText>
            <View style={{ height: t.spacing / 2 }} />
            <ProgressBar progress={progress} />
          </View>
        ) : (
          <UpwellButton
            title={t.strings.update}
            onPress={() => {
              startUpdate();
            }}
            busy={isBusy}
            testID="upwell-force-update-button"
            style={local.stretch}
          />
        )}
      </View>
    </Modal>
  );
}

function KindBadge({ kind }: { kind: Release['kind'] }) {
  const t = useUpwellTheme();
  return (
    <View style={[local.badge, { backgroundColor: t.colors.kind[kind] }]}>
      <UpwellText style={local.badgeText}>{t.strings.kind[kind]}</UpwellText>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function ReleaseRow({ release }: { release: Release }) {
  const t = useUpwellTheme();
  return (
    <View
      style={[local.release, { borderColor: t.colors.border, paddingVertical: t.spacing * 0.75 }]}>
      <View style={local.row}>
        <KindBadge kind={release.kind} />
        <UpwellText variant="muted">{formatDate(release.publishedAt)}</UpwellText>
      </View>
      <View style={{ height: 6 }} />
      <UpwellText>{release.notes}</UpwellText>
    </View>
  );
}

/** Bottom sheet shown once after an OTA update was applied, with its release notes. */
export function UpdatedSheet(props: { style?: StyleProp<ViewStyle> }) {
  const { justUpdated, markSeen } = useUpdateHistory();
  const t = useUpwellTheme();
  return (
    <Modal
      visible={!!justUpdated}
      transparent
      animationType="slide"
      onRequestClose={markSeen}
      statusBarTranslucent>
      <View style={[local.sheetBackdrop, { backgroundColor: t.colors.overlay }]}>
        <View
          testID="upwell-updated-sheet"
          style={[
            local.sheet,
            {
              backgroundColor: t.colors.background,
              borderTopLeftRadius: t.radius * 1.5,
              borderTopRightRadius: t.radius * 1.5,
              padding: t.spacing * 1.5,
            },
            props.style,
          ]}>
          <UpwellText variant="title">{t.strings.updatedTitle}</UpwellText>
          <View style={{ height: t.spacing / 2 }} />
          {justUpdated ? <ReleaseRow release={justUpdated} /> : null}
          <View style={{ height: t.spacing }} />
          <UpwellButton
            title={t.strings.gotIt}
            onPress={markSeen}
            testID="upwell-updated-dismiss"
          />
        </View>
      </View>
    </Modal>
  );
}

/** OTA release history for the running native version. Render it as a screen or inside one. */
export function WhatsNew(props: { style?: StyleProp<ViewStyle>; showTitle?: boolean }) {
  const { history } = useUpdateHistory();
  const t = useUpwellTheme();
  return (
    <FlatList
      testID="upwell-whats-new"
      style={[{ backgroundColor: t.colors.background }, props.style]}
      contentContainerStyle={{ padding: t.spacing }}
      data={history}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        props.showTitle === false ? undefined : (
          <UpwellText variant="title" style={{ marginBottom: t.spacing / 2 }}>
            {t.strings.whatsNewTitle}
          </UpwellText>
        )
      }
      ListEmptyComponent={<UpwellText variant="muted">{t.strings.whatsNewEmpty}</UpwellText>}
      renderItem={({ item }) => <ReleaseRow release={item} />}
    />
  );
}

export interface UpwellUIProps extends FloatingProps {
  /** Turn individual pieces off. All on by default. */
  prompt?: boolean;
  progress?: boolean;
  restart?: boolean;
  force?: boolean;
  updated?: boolean;
}

/** Drop-in: renders whichever Upwell UI the current decision needs. Place it once, last in your root. */
export function UpwellUI({
  prompt = true,
  progress = true,
  restart = true,
  force = true,
  updated = true,
  ...floating
}: UpwellUIProps) {
  return (
    <>
      {prompt ? <UpdatePrompt {...floating} /> : null}
      {progress ? <DownloadProgressBanner {...floating} /> : null}
      {restart ? <RestartSnackbar {...floating} /> : null}
      {force ? <ForceUpdateScreen /> : null}
      {updated ? <UpdatedSheet /> : null}
    </>
  );
}

/** Dev tool: jump to any state and read why the engine decided what it did. */
export function UpwellDevMenu(props: {
  style?: StyleProp<ViewStyle>;
  scenarios?: SimulationScenario[];
}) {
  const { decision, state, simulate, explain } = useAppUpdate();
  const t = useUpwellTheme();
  const scenarios = props.scenarios ?? SIMULATION_SCENARIOS;
  return (
    <ScrollView
      style={[{ backgroundColor: t.colors.surface }, props.style]}
      contentContainerStyle={{ padding: t.spacing }}>
      <UpwellText variant="title">Upwell</UpwellText>
      <UpwellText variant="muted">
        {decision.kind}
        {state.simulation ? ` · simulating ${state.simulation}` : ''}
      </UpwellText>
      <View style={[local.wrap, { marginVertical: t.spacing }]}>
        {scenarios.map((s) => (
          <UpwellButton
            key={s}
            title={s}
            variant={state.simulation === s ? 'primary' : 'secondary'}
            onPress={() => {
              simulate(s);
            }}
            testID={`upwell-sim-${s}`}
          />
        ))}
        <UpwellButton
          title="real device"
          variant={state.simulation ? 'secondary' : 'primary'}
          onPress={() => {
            simulate(null);
          }}
        />
      </View>
      {explain().map((line, i) => (
        <UpwellText key={i} variant="muted" style={local.mono}>
          {line}
        </UpwellText>
      ))}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  floating: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    // Android hit-tests by zIndex and render order, not elevation: without this, views rendered
    // after <UpwellUI /> (toasts, tab bars, LogBox) take the prompt's taps while drawn below it.
    zIndex: 1000,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1 },
  full: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  release: { borderBottomWidth: StyleSheet.hairlineWidth },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingBottom: 40 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
});
