import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useUpwellTheme } from './theme';

export function UpwellButton(props: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useUpwellTheme();
  const primary = (props.variant ?? 'primary') === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.title}
      accessibilityState={{ busy: !!props.busy, disabled: !!props.busy }}
      disabled={props.busy}
      onPress={props.onPress}
      testID={props.testID}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: t.radius,
          backgroundColor: primary ? t.colors.primary : 'transparent',
          borderColor: primary ? t.colors.primary : t.colors.border,
          opacity: pressed ? 0.8 : 1,
        },
        props.style,
      ]}>
      {props.busy ? (
        <ActivityIndicator color={primary ? t.colors.onPrimary : t.colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: primary ? t.colors.onPrimary : t.colors.text, fontFamily: t.fontFamily },
          ]}>
          {props.title}
        </Text>
      )}
    </Pressable>
  );
}

export function UpwellText(props: {
  children: ReactNode;
  variant?: 'title' | 'body' | 'muted';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useUpwellTheme();
  const variant = props.variant ?? 'body';
  return (
    <Text
      numberOfLines={props.numberOfLines}
      style={[
        variant === 'title' ? styles.title : styles.body,
        {
          color: variant === 'muted' ? t.colors.mutedText : t.colors.text,
          fontFamily: t.fontFamily,
        },
        props.style,
      ]}>
      {props.children}
    </Text>
  );
}

export function ProgressBar(props: { progress: number | null; testID?: string }) {
  const t = useUpwellTheme();
  const pct =
    props.progress == null ? null : Math.round(Math.max(0, Math.min(1, props.progress)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={pct == null ? undefined : { min: 0, max: 100, now: pct }}
      testID={props.testID}
      style={[styles.track, { backgroundColor: t.colors.progressTrack }]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: t.colors.primary, width: pct == null ? '15%' : `${pct}%` },
        ]}
      />
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
