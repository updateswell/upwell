import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ReleaseKind } from '../core/types';

export interface UpwellColors {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  primary: string;
  onPrimary: string;
  border: string;
  overlay: string;
  progressTrack: string;
  /** Badge colors per release kind. */
  kind: Record<ReleaseKind, string>;
}

export interface UpwellStrings {
  updateAvailableTitle: string;
  updateAvailableBody: string;
  update: string;
  later: string;
  restart: string;
  requiredTitle: string;
  requiredBody: string;
  downloading: (percent: number | null) => string;
  storeDownloaded: string;
  otaReady: string;
  updatedTitle: string;
  gotIt: string;
  whatsNewTitle: string;
  whatsNewEmpty: string;
  releaseNotes: string;
  kind: Record<ReleaseKind, string>;
}

export interface UpwellTheme {
  colors: UpwellColors;
  radius: number;
  spacing: number;
  fontFamily?: string;
  strings: UpwellStrings;
}

export const defaultStrings: UpwellStrings = {
  updateAvailableTitle: 'Update available',
  updateAvailableBody: 'A new version of the app is ready to install.',
  update: 'Update',
  later: 'Later',
  restart: 'Restart',
  requiredTitle: 'Update required',
  requiredBody: 'This version is no longer supported. Please update to keep using the app.',
  downloading: (percent) =>
    percent == null ? 'Downloading update…' : `Downloading update… ${percent}%`,
  storeDownloaded: 'Update downloaded. Restart to install it.',
  otaReady: 'A new version is ready. Restart to use it.',
  updatedTitle: 'Updated',
  gotIt: 'Got it',
  whatsNewTitle: "What's new",
  whatsNewEmpty: 'No updates yet for this version.',
  releaseNotes: 'Release notes',
  kind: { fix: 'Fix', content: 'Content', feature: 'Feature' },
};

/** Monochrome, per the Upwell design system (assets/brand/README.md). */
export const lightTheme: UpwellTheme = {
  colors: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    text: '#0A0A0A',
    mutedText: '#737373',
    primary: '#0A0A0A',
    onPrimary: '#FAFAFA',
    border: '#E5E5E5',
    overlay: 'rgba(0, 0, 0, 0.4)',
    progressTrack: '#E5E5E5',
    kind: { fix: '#525252', content: '#737373', feature: '#0A0A0A' },
  },
  radius: 12,
  spacing: 16,
  strings: defaultStrings,
};

export const darkTheme: UpwellTheme = {
  ...lightTheme,
  colors: {
    background: '#0A0A0A',
    surface: '#171717',
    text: '#FAFAFA',
    mutedText: '#A3A3A3',
    primary: '#FAFAFA',
    onPrimary: '#0A0A0A',
    border: '#262626',
    overlay: 'rgba(0, 0, 0, 0.6)',
    progressTrack: '#262626',
    kind: { fix: '#404040', content: '#525252', feature: '#737373' },
  },
};

export type UpwellThemeOverride = {
  colors?: Partial<UpwellColors>;
  radius?: number;
  spacing?: number;
  fontFamily?: string;
  strings?: Partial<UpwellStrings>;
};

const ThemeContext = createContext<{
  light: UpwellTheme;
  dark: UpwellTheme;
  scheme?: 'light' | 'dark';
} | null>(null);

function merge(base: UpwellTheme, o: UpwellThemeOverride | undefined): UpwellTheme {
  if (!o) return base;
  return {
    ...base,
    ...o,
    colors: { ...base.colors, ...o.colors },
    strings: { ...base.strings, ...o.strings },
  } as UpwellTheme;
}

/**
 * Themes every Upwell component below it. `light`/`dark` override the defaults per scheme;
 * `scheme` forces one (default: follows the system).
 */
export function UpwellThemeProvider(props: {
  light?: UpwellThemeOverride;
  dark?: UpwellThemeOverride;
  /** Applied to both schemes, before `light`/`dark`. */
  theme?: UpwellThemeOverride;
  scheme?: 'light' | 'dark';
  children?: ReactNode;
}) {
  const { light, dark, theme, scheme, children } = props;
  const value = useMemo(
    () => ({
      light: merge(merge(lightTheme, theme), light),
      dark: merge(merge(darkTheme, theme), dark),
      scheme,
    }),
    [light, dark, theme, scheme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useUpwellTheme(): UpwellTheme {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme();
  const scheme = ctx?.scheme ?? (system === 'dark' ? 'dark' : 'light');
  if (!ctx) return scheme === 'dark' ? darkTheme : lightTheme;
  return scheme === 'dark' ? ctx.dark : ctx.light;
}
